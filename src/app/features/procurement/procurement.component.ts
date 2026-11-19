import { Component, OnInit } from '@angular/core';
import { ProcurementService } from '../../core/services/procurement.service';
import { Supplier, PurchaseOrder, GoodsReceiptNote } from '../../core/models/procurement.model';

@Component({
  selector: 'app-procurement',
  templateUrl: './procurement.component.html',
  styleUrls: ['./procurement.component.scss']
})
export class ProcurementComponent implements OnInit {
  suppliers: Supplier[] = [];
  purchaseOrders: PurchaseOrder[] = [];
  grnList: GoodsReceiptNote[] = [];
  activeTab: 'orders' | 'suppliers' | 'grn' = 'orders';

  showPoModal = false;
  selectedSupplierId = '';
  poAmount = 0;
  poNotes = '';

  get supplierOptions() {
    return this.suppliers.map(s => ({
      label: `${s.name} (Credit: ${s.payment_terms_days} days)`,
      value: s.id,
      icon: 'ri-building-line'
    }));
  }

  constructor(public procurementService: ProcurementService) {}

  ngOnInit(): void {
    this.procurementService.suppliers$.subscribe(s => {
      this.suppliers = s;
      if (s.length > 0 && !this.selectedSupplierId) {
        this.selectedSupplierId = s[0].id;
      }
    });

    this.procurementService.purchaseOrders$.subscribe(po => this.purchaseOrders = po);
    this.procurementService.grnList$.subscribe(grn => this.grnList = grn);
  }

  createPo(): void {
    const sup = this.suppliers.find(s => s.id === this.selectedSupplierId);
    if (!sup || this.poAmount <= 0) {
      alert('Please select supplier and enter valid amount');
      return;
    }

    this.procurementService.createPurchaseOrder({
      supplier_id: sup.id,
      supplier_name: sup.name,
      po_number: `PO-2026-${100 + this.purchaseOrders.length + 1}`,
      status: 'SENT',
      expected_delivery: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
      total_amount: this.poAmount,
      items: [
        {
          inventory_item_id: 'inv-01',
          inventory_item_name: 'Raw Cafe Consumables',
          ordered_qty: 1,
          received_qty: 0,
          unit_price: this.poAmount,
          total_price: this.poAmount
        }
      ],
      notes: this.poNotes,
      created_by_name: 'Manager'
    });

    this.showPoModal = false;
    this.poAmount = 0;
    this.poNotes = '';
    alert('Purchase Order successfully created and marked as SENT to vendor!');
  }
}

