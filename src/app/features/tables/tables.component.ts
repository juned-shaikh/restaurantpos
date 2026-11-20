import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TableService } from '../../core/services/table.service';
import { OrderService } from '../../core/services/order.service';
import { PrintService } from '../../core/services/print.service';
import { TenantService } from '../../core/services/tenant.service';
import { TaxCalculatorService } from '../../core/services/tax-calculator.service';
import { ToastService } from '../../core/services/toast.service';
import { Table, TableShape, Floor } from '../../core/models/table.model';
import { Order } from '../../core/models/order.model';

@Component({
  selector: 'app-tables',
  templateUrl: './tables.component.html',
  styleUrls: ['./tables.component.scss']
})
export class TablesComponent implements OnInit, OnDestroy {
  floors: Floor[] = [];
  tables: Table[] = [];
  private subs = new Subscription();

  selectedFloorId: string = '';
  selectedTable: Table | null = null;

  showTransferModal = false;
  showQrModal = false;
  transferTargetTableId = '';

  // Single Table Modal State
  showAddTableModal = false;
  newTableNumber = '';
  newTableFloorId = 'floor-01';
  newTableCapacity = 4;
  newTableShape: TableShape = 'RECTANGLE';

  // Bulk Tables Generator State
  showBulkModal = false;
  bulkPrefix = 'T-';
  bulkStartNum = 1;
  bulkCount = 12;
  bulkCapacity = 4;
  bulkShape: TableShape = 'RECTANGLE';
  bulkFloorId = 'floor-01';

  // Add Floor Modal State
  showAddFloorModal = false;
  newFloorName = '';

  // Direct Table Quick Settlement Modal
  showTableSettleModal = false;
  tableSettlingOrder: Order | null = null;
  tableSettleMode: 'CASH' | 'UPI' | 'CARD' = 'UPI';
  tableSettleUpiUri = '';
  tableSettleEncodedUpi = '';
  tableSettleCashReceived = 0;

  constructor(
    public tableService: TableService,
    public orderService: OrderService,
    public printService: PrintService,
    public tenantService: TenantService,
    public taxCalculator: TaxCalculatorService,
    private router: Router,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.tableService.floors$.subscribe(f => {
        this.floors = f;
        if (f.length > 0 && (!this.selectedFloorId || !f.some(fl => fl.id === this.selectedFloorId))) {
          this.selectedFloorId = f[0].id;
        }
      })
    );

    this.subs.add(
      this.tableService.tables$.subscribe(t => {
        this.tables = t;
        if (this.selectedTable) {
          this.selectedTable = t.find(item => item.id === this.selectedTable?.id) || null;
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  getTableCountForFloor(floorId: string): number {
    return this.tables.filter(t => t.floor_id === floorId).length;
  }

  get filteredTables(): Table[] {
    return this.tables.filter(t => t.floor_id === this.selectedFloorId);
  }

  get availableTables(): Table[] {
    return this.tables.filter(t => t.status === 'AVAILABLE');
  }

  selectTable(table: Table): void {
    this.selectedTable = table;
  }

  getTableOrder(table: Table | null): Order | undefined {
    if (!table) return undefined;
    return this.orderService.getOrderByTableId(table.id);
  }

  getTableBillAmount(table: Table | null): number {
    if (!table) return 0;
    const order = this.getTableOrder(table);
    if (order) return order.total_amount;
    return table.current_bill_amount || table.active_bill_amount || 0;
  }

  takeOrderForTable(table: Table): void {
    const tableId = table.id;
    this.selectedTable = null;
    this.router.navigate(['/orders'], { queryParams: { tableId } });
  }

  goToBilling(table: Table): void {
    const tableId = table.id;
    this.selectedTable = null;
    this.router.navigate(['/orders'], { queryParams: { tableId, settle: 'true' } });
  }

  openQuickSettle(table: Table): void {
    const order = this.getTableOrder(table);
    if (!order) {
      this.toast.warning(`No running order found for Table ${table.table_number}.`);
      return;
    }
    this.tableSettlingOrder = order;
    this.tableSettleMode = 'UPI';
    this.tableSettleCashReceived = order.total_amount;
    
    // Generate UPI URI
    const branch = this.tenantService.activeBranch;
    this.tableSettleUpiUri = this.taxCalculator.generateUpiIntentString(
      branch.upi_vpa || 'restaurant@upi',
      branch.upi_payee_name || branch.name,
      order.total_amount,
      order.order_number
    );
    this.tableSettleEncodedUpi = encodeURIComponent(this.tableSettleUpiUri);
    this.showTableSettleModal = true;
  }

  confirmTableSettlement(): void {
    if (!this.tableSettlingOrder || !this.selectedTable) return;
    const order = this.tableSettlingOrder;
    const mode = this.tableSettleMode;

    this.orderService.settleOrder(order.id, mode, order.total_amount);
    this.printService.printOrderReceipt(order, this.tenantService.activeBranch, false);

    this.toast.success(`Payment of ₹${order.total_amount} settled via ${mode} for Table ${this.selectedTable.table_number}! Table is now available.`, 'Table Settled');
    this.showTableSettleModal = false;
    this.selectedTable = null;
    this.tableSettlingOrder = null;
  }

  occupyTable(table: Table): void {
    this.tableService.updateTableStatus(table.id, 'OCCUPIED');
  }

  freeTable(table: Table): void {
    this.tableService.updateTableStatus(table.id, 'AVAILABLE');
  }

  openTransferModal(table: Table): void {
    this.selectedTable = table;
    this.showTransferModal = true;
  }

  async executeTransfer(): Promise<void> {
    if (!this.selectedTable || !this.transferTargetTableId) return;

    const success = await this.tableService.transferTable({
      fromTableId: this.selectedTable.id,
      toTableId: this.transferTargetTableId,
      orderId: this.selectedTable.current_order_id || 'transfer-ord'
    });

    if (success) {
      this.toast.success(`Successfully transferred from ${this.selectedTable.table_number} to target table!`, 'Table Transferred');
      this.showTransferModal = false;
      this.transferTargetTableId = '';
    } else {
      this.toast.error('Could not transfer table. Target table might not be available or already occupied.', 'Transfer Failed');
    }
  }

  openQrModal(table: Table): void {
    this.selectedTable = table;
    this.showQrModal = true;
  }

  showQrForTable(table: Table): void {
    this.openQrModal(table);
  }

  getTableClass(table: Table | null): string {
    if (!table) return '';
    switch (table.status) {
      case 'AVAILABLE': return 'table-available';
      case 'OCCUPIED': return 'table-occupied';
      case 'RESERVED': return 'table-reserved';
      case 'BILL_REQUESTED': return 'table-bill-requested';
      default: return 'table-available';
    }
  }

  getTableStatusClass(status: string): string {
    return 'badge-' + (status || '').toLowerCase().replace(/_/g, '-');
  }

  getTableQrLink(table: Table | null): string {
    if (!table) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';
    const orgId = this.tenantService.currentOrg?.id || '';
    return `${origin}/qr-order?orgId=${orgId}&tableId=${table.id}&table=${encodeURIComponent(table.table_number)}`;
  }

  getTableQrImageUrl(table: Table | null): string {
    const link = this.getTableQrLink(table);
    if (!link) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(link)}`;
  }

  printTentCard(): void {
    if (!this.selectedTable) return;
    const qrUrl = this.getTableQrImageUrl(this.selectedTable);
    const branch = this.tenantService.activeBranch;
    const restName = branch?.name || this.tenantService.currentOrg?.name || 'Restaurant';
    this.printService.printTableTentCard(this.selectedTable.table_number, qrUrl, restName);
  }

  // --- Add Single Table ---
  openAddTableModal(): void {
    const currentCount = this.filteredTables.length;
    this.newTableNumber = `T-${String(currentCount + 1).padStart(2, '0')}`;
    this.newTableFloorId = this.selectedFloorId || (this.floors[0]?.id || 'floor-01');
    this.newTableCapacity = 4;
    this.newTableShape = 'RECTANGLE';
    this.showAddTableModal = true;
  }

  saveSingleTable(): void {
    if (!this.newTableNumber.trim()) {
      this.toast.warning('Please enter a valid table number.');
      return;
    }
    this.tableService.addTable({
      table_number: this.newTableNumber.trim(),
      floor_id: this.newTableFloorId,
      capacity: Number(this.newTableCapacity) || 4,
      shape: this.newTableShape
    });
    this.showAddTableModal = false;
    this.toast.success(`Table ${this.newTableNumber.trim()} added successfully!`, 'Table Created');
  }

  // --- Bulk Setup (1 to 40+ Tables Generator) ---
  openBulkModal(): void {
    this.bulkFloorId = this.selectedFloorId || (this.floors[0]?.id || 'floor-01');
    this.bulkPrefix = 'T-';
    this.bulkStartNum = this.filteredTables.length + 1;
    this.bulkCount = 12;
    this.bulkCapacity = 4;
    this.bulkShape = 'RECTANGLE';
    this.showBulkModal = true;
  }

  executeBulkCreation(): void {
    if (this.bulkCount < 1 || this.bulkCount > 60) {
      this.toast.warning('Please enter a count between 1 and 60 tables.');
      return;
    }
    this.tableService.bulkCreateTables({
      prefix: this.bulkPrefix.trim(),
      startNumber: Number(this.bulkStartNum) || 1,
      count: Number(this.bulkCount),
      capacity: Number(this.bulkCapacity) || 4,
      shape: this.bulkShape,
      floorId: this.bulkFloorId
    });
    this.showBulkModal = false;
    this.toast.success(`Successfully generated ${this.bulkCount} tables for ${this.floors.find(f => f.id === this.bulkFloorId)?.name || 'floor'}!`, 'Tables Generated');
  }

  // --- Delete Table ---
  deleteTable(table: Table): void {
    if (table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED') {
      this.toast.error(`Cannot delete Table ${table.table_number} because it has an active running order! Please settle or free the table first.`, 'Table In Use');
      return;
    }
    if (confirm(`Are you sure you want to delete Table ${table.table_number}?`)) {
      this.tableService.deleteTable(table.id);
      this.selectedTable = null;
      this.toast.info(`Table ${table.table_number} deleted.`, 'Table Removed');
    }
  }

  // --- Add Floor / Section ---
  openAddFloorModal(): void {
    this.newFloorName = '';
    this.showAddFloorModal = true;
  }

  saveNewFloor(): void {
    if (!this.newFloorName.trim()) {
      this.toast.warning('Please enter a floor / section name (e.g. Terrace, Family AC Hall).');
      return;
    }
    const newFloor = this.tableService.addFloor(this.newFloorName.trim());
    this.selectedFloorId = newFloor.id;
    this.showAddFloorModal = false;
    this.toast.success(`Floor area "${newFloor.name}" created!`, 'Area Created');
  }
}

