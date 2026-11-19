import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MenuService } from '../../core/services/menu.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { TenantService } from '../../core/services/tenant.service';
import { MenuItem, MenuCategory } from '../../core/models/menu.model';
import { OrderItem } from '../../core/models/order.model';
import { Table } from '../../core/models/table.model';

export type LangCode = 'EN' | 'HI';

export interface DeliveryZone {
  pincode: string;
  areaName: string;
  minOrder: number;
  deliveryFee: number;
  estimatedMins: number;
}

@Component({
  selector: 'app-qr-order',
  templateUrl: './qr-order.component.html',
  styleUrls: ['./qr-order.component.scss']
})
export class QrOrderComponent implements OnInit {
  categories: MenuCategory[] = [];
  items: MenuItem[] = [];
  tables: Table[] = [];
  currentTable: Table | null = null;
  selectedTableId: string = '';

  get tableOptions(): { label: string; value: string; icon: string }[] {
    return this.tables.map(tbl => ({
      label: `Table ${tbl.table_number}`,
      value: tbl.id,
      icon: 'ri-layout-grid-line'
    }));
  }

  guestCart: OrderItem[] = [];
  selectedCatId: string = 'ALL';
  guestName: string = '';
  guestPhone: string = '';

  // Language Switcher (EN, HI)
  selectedLang: LangCode = 'EN';
  translations = {
    EN: {
      callWaiter: 'Call Waiter',
      requestBill: 'Request Bill',
      yourOrder: 'Your Cart',
      placeOrder: 'Place Kitchen Order',
      emptyCart: 'Your cart is empty',
      tableMenu: 'Guest Table Menu',
      deliveryZones: 'Delivery Zones'
    },
    HI: {
      callWaiter: 'वेटर को बुलाएं',
      requestBill: 'बिल मंगाएं',
      yourOrder: 'आपका ऑर्डर',
      placeOrder: 'किचन में ऑर्डर भेजें',
      emptyCart: 'आपकी कार्ट खाली है',
      tableMenu: 'टेबल मेन्यू',
      deliveryZones: 'डिलीवरी ज़ोन'
    }
  };

  // Delivery Zones by Pincode
  activeViewMode: 'qr' | 'delivery' = 'qr';
  deliveryZones: DeliveryZone[] = [
    { pincode: '400050', areaName: 'Bandra West (Flagship Zone)', minOrder: 300, deliveryFee: 0, estimatedMins: 25 },
    { pincode: '400052', areaName: 'Khar West', minOrder: 400, deliveryFee: 35, estimatedMins: 35 },
    { pincode: '400054', areaName: 'Santacruz West', minOrder: 500, deliveryFee: 50, estimatedMins: 45 },
    { pincode: '400051', areaName: 'BKC Business Hub', minOrder: 600, deliveryFee: 40, estimatedMins: 40 }
  ];

  constructor(
    public menuService: MenuService,
    public orderService: OrderService,
    public tableService: TableService,
    public tenantService: TenantService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const orgId = params['orgId'] || params['org'];
      if (orgId) {
        this.tenantService.switchTenant(orgId);
      }
      const tableParam = params['tableId'] || params['table'];
      if (tableParam) {
        this.selectedTableId = tableParam;
        if (this.tables.length > 0) {
          this.currentTable = this.tables.find(t => t.id === tableParam || t.table_number === tableParam) || this.tables[0];
        }
      }
    });

    this.menuService.categories$.subscribe(c => this.categories = c);
    this.menuService.items$.subscribe(i => this.items = i.filter(item => item.is_available));
    this.tableService.tables$.subscribe(t => {
      this.tables = t;
      if (this.selectedTableId) {
        this.currentTable = t.find(item => item.id === this.selectedTableId || item.table_number === this.selectedTableId) || t[0] || null;
      } else {
        this.currentTable = t[0] || null;
        if (this.currentTable) {
          this.selectedTableId = this.currentTable.id;
        }
      }
    });
  }

  get t() {
    return this.translations[this.selectedLang];
  }

  setLang(lang: LangCode): void {
    this.selectedLang = lang;
  }

  onTableSwitch(): void {
    this.currentTable = this.tables.find(t => t.id === this.selectedTableId) || null;
  }

  get filteredDishes(): MenuItem[] {
    if (this.selectedCatId === 'ALL') return this.items;
    return this.items.filter(i => i.category_id === this.selectedCatId);
  }

  addToGuestCart(dish: MenuItem): void {
    const existing = this.guestCart.find(i => i.menu_item_id === dish.id);
    if (existing) {
      existing.quantity++;
      existing.total_price = existing.quantity * existing.unit_price;
    } else {
      this.guestCart.push({
        menu_item_id: dish.id,
        name: dish.name,
        quantity: 1,
        unit_price: dish.price,
        total_price: dish.price,
        is_veg: dish.is_veg,
        modifiers: []
      });
    }
  }

  updateQty(item: OrderItem, delta: number): void {
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.guestCart = this.guestCart.filter(i => i !== item);
    } else {
      item.total_price = item.quantity * item.unit_price;
    }
  }

  get guestCartTotal(): number {
    return this.guestCart.reduce((sum, item) => sum + item.total_price, 0);
  }

  callWaiter(): void {
    if (!this.currentTable) return;
    this.orderService.submitGuestRequest(
      this.currentTable.id,
      this.currentTable.table_number,
      'CALL_WAITER',
      'Guest requested captain assistance'
    );
    alert(`Captain alerted! A waiter is on their way to Table ${this.currentTable.table_number}.`);
  }

  requestBill(): void {
    if (!this.currentTable) return;
    this.orderService.submitGuestRequest(
      this.currentTable.id,
      this.currentTable.table_number,
      'REQUEST_BILL',
      'Guest requested printed bill and payment'
    );
    alert(`Bill requested for Table ${this.currentTable.table_number}! Cashier notified.`);
  }

  submitGuestOrder(): void {
    if (this.guestCart.length === 0 || !this.currentTable) return;

    this.orderService.createOrder(
      this.currentTable.id,
      this.currentTable.table_number,
      'QR_ORDER',
      this.guestCart,
      this.guestName || 'Self-Order Guest',
      this.guestPhone
    );

    this.guestCart = [];
    alert(`Thank you! Your order has been placed directly with the kitchen KDS for Table ${this.currentTable.table_number}.`);
  }
}
