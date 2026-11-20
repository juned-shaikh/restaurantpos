import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MenuService } from '../../core/services/menu.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { TenantService } from '../../core/services/tenant.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { MenuItem, MenuCategory } from '../../core/models/menu.model';
import { OrderItem } from '../../core/models/order.model';
import { Table } from '../../core/models/table.model';

export type LangCode = 'EN' | 'HI';

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
  isSubmitting: boolean = false;
  private lastOrderTimestamp: number = 0;

  // Language Switcher (EN, HI)
  selectedLang: LangCode = 'EN';
  translations = {
    EN: {
      callWaiter: 'Call Waiter',
      requestBill: 'Request Bill',
      yourOrder: 'Your Cart',
      placeOrder: 'Place Kitchen Order',
      emptyCart: 'Your cart is empty',
      tableMenu: 'Guest Table Menu'
    },
    HI: {
      callWaiter: 'वेटर को बुलाएं',
      requestBill: 'बिल मंगाएं',
      yourOrder: 'आपका ऑर्डर',
      placeOrder: 'किचन में ऑर्डर भेजें',
      emptyCart: 'आपकी कार्ट खाली है',
      tableMenu: 'टेबल मेन्यू'
    }
  };

  isDirectScan: boolean = false;
  orderPlacedSuccess: boolean = false;
  showCartReviewDrawer: boolean = false;

  constructor(
    public menuService: MenuService,
    public orderService: OrderService,
    public tableService: TableService,
    public tenantService: TenantService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.isDirectScan = window.innerWidth <= 768 || !this.authService.isAuthenticated;

    this.route.queryParams.subscribe(params => {
      const orgId = params['orgId'] || params['org'];
      // Only switch active tenant for unauthenticated guests, protecting logged-in staff
      if (orgId && !this.authService.isAuthenticated) {
        this.tenantService.switchTenant(orgId);
      }
      const tableParam = params['tableId'] || params['table'];
      if (tableParam) {
        this.isDirectScan = true;
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

  getCartItemQty(dishId: string): number {
    const item = this.guestCart.find(i => i.menu_item_id === dishId);
    return item ? item.quantity : 0;
  }

  incrementDish(dish: MenuItem): void {
    this.addToGuestCart(dish);
  }

  decrementDish(dishId: string): void {
    const item = this.guestCart.find(i => i.menu_item_id === dishId);
    if (item) {
      this.updateQty(item, -1);
    }
  }

  get totalGuestItemCount(): number {
    return this.guestCart.reduce((sum, item) => sum + item.quantity, 0);
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
    this.toast.success(`Captain alerted! A waiter is on their way to Table ${this.currentTable.table_number}.`, 'Waiter Called');
  }

  requestBill(): void {
    if (!this.currentTable) return;
    this.orderService.submitGuestRequest(
      this.currentTable.id,
      this.currentTable.table_number,
      'REQUEST_BILL',
      'Guest requested printed bill and payment'
    );
    this.toast.info(`Bill requested for Table ${this.currentTable.table_number}! Cashier notified.`, 'Bill Requested');
  }

  submitGuestOrder(): void {
    if (this.isSubmitting) return;

    if (this.guestCart.length === 0 || !this.currentTable) {
      this.toast.warning('Please add at least one item to your cart.');
      return;
    }

    const now = Date.now();
    if (now - this.lastOrderTimestamp < 10000) {
      this.toast.warning('Your order was just submitted. Please wait 10 seconds before placing another order.', 'Please Wait');
      return;
    }

    // Sanity check: valid quantities & non-negative prices
    const invalidItem = this.guestCart.find(i => !i.quantity || i.quantity <= 0 || i.quantity > 50 || i.unit_price < 0);
    if (invalidItem) {
      this.toast.error('Invalid quantity or price detected in cart.', 'Order Error');
      return;
    }

    this.isSubmitting = true;
    try {
      this.orderService.createOrder(
        this.currentTable.id,
        this.currentTable.table_number,
        'QR_ORDER',
        this.guestCart,
        this.guestName?.trim() || 'Self-Order Guest',
        this.guestPhone?.trim() || ''
      );

      this.lastOrderTimestamp = Date.now();
      this.guestCart = [];
      this.showCartReviewDrawer = false;
      this.orderPlacedSuccess = true;
      this.toast.success(`Thank you! Your order has been placed directly with the kitchen for Table ${this.currentTable.table_number}.`, 'Order Placed');
    } finally {
      this.isSubmitting = false;
    }
  }
}
