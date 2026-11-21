import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { MenuService } from '../../core/services/menu.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { TaxCalculatorService } from '../../core/services/tax-calculator.service';
import { PrintService } from '../../core/services/print.service';
import { TenantService } from '../../core/services/tenant.service';
import { SecurityService } from '../../core/services/security.service';
import { ToastService } from '../../core/services/toast.service';
import { MenuItem, MenuCategory } from '../../core/models/menu.model';
import { OrderItem, Order } from '../../core/models/order.model';
import { Table } from '../../core/models/table.model';
import { SelectOption } from '../../shared/components/custom-select/custom-select.component';

export interface SplitPayment {
  mode: 'CASH' | 'UPI' | 'CARD';
  amount: number;
}

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss']
})
export class OrdersComponent implements OnInit, OnDestroy {
  categories: MenuCategory[] = [];
  items: MenuItem[] = [];
  tables: Table[] = [];
  selectedCategoryId: string = 'ALL';
  searchQuery: string = '';

  private subs = new Subscription();

  // Active POS Cart
  cartItems: OrderItem[] = [];
  selectedTableId: string = '';
  orderType: Order['order_type'] = 'DINE_IN';
  discountPct: number = 0;
  discountAmount: number = 0;
  customerName: string = '';
  customerPhone: string = '';
  mobileActiveTab: 'menu' | 'cart' = 'menu';

  // Custom Dropdown Option Sets
  orderTypeOptions: SelectOption[] = [
    { label: 'Dine-in', value: 'DINE_IN', icon: 'ri-restaurant-line' },
    { label: 'Takeaway', value: 'TAKEAWAY', icon: 'ri-shopping-bag-3-line' },
    { label: 'Delivery', value: 'DELIVERY', icon: 'ri-e-bike-2-line' }
  ];

  get tableOptions(): SelectOption[] {
    return this.tables.map(tbl => {
      const runningOrder = this.orderService.getOrderByTableId(tbl.id);
      const billText = runningOrder ? ` • Running Bill: ₹${runningOrder.total_amount}` : '';

      let statusBadge = 'Available';
      let statusType = 'available';

      if (tbl.status === 'OCCUPIED') {
        statusBadge = 'Occupied';
        statusType = 'occupied';
      } else if (tbl.status === 'BILL_REQUESTED') {
        statusBadge = 'Bill Asked';
        statusType = 'bill-requested';
      } else if (tbl.status === 'RESERVED') {
        statusBadge = 'Reserved';
        statusType = 'reserved';
      }

      return {
        label: `Table ${tbl.table_number}`,
        value: tbl.id,
        icon: 'ri-layout-grid-line',
        subtext: `${tbl.capacity} seats${billText}`,
        badge: statusBadge,
        badgeType: statusType
      };
    });
  }

  partPaymentModeOptions: SelectOption[] = [
    { label: 'Cash', value: 'CASH', icon: 'ri-money-rupee-circle-line' },
    { label: 'UPI QR', value: 'UPI', icon: 'ri-qr-code-line' },
    { label: 'Card', value: 'CARD', icon: 'ri-bank-card-line' }
  ];

  get totalCartCount(): number {
    return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  // Payment Modal & Split Tender
  showPaymentModal: boolean = false;
  activeOrderToSettle: Order | null = null;
  cashReceived: number = 0;
  paymentMode: 'CASH' | 'UPI' | 'CARD' | 'SPLIT' = 'UPI';
  upiIntentQrUri: string = '';
  splitPayments: SplitPayment[] = [];
  partPaymentAmount: number = 0;
  partPaymentMode: 'CASH' | 'UPI' | 'CARD' = 'CASH';

  // Rapid Item Modifiers & Kitchen Notes Modal
  showModifierModal: boolean = false;
  activeEditingItem: OrderItem | null = null;
  editingItemNotes: string = '';
  selectedModifiers: { name: string; price_adjustment: number }[] = [];

  presetModifiers: { name: string; price: number; icon: string }[] = [
    { name: 'Extra Cheese', price: 30, icon: 'ri-cake-3-line' },
    { name: 'Oat Milk', price: 45, icon: 'ri-cup-line' },
    { name: 'Almond Milk', price: 50, icon: 'ri-goblet-line' },
    { name: 'Extra Shot Espresso', price: 40, icon: 'ri-fire-line' },
    { name: 'Extra Dip / Sauce', price: 25, icon: 'ri-flask-line' },
    { name: 'Less Spicy', price: 0, icon: 'ri-leaf-line' },
    { name: 'Extra Spicy 🔥', price: 0, icon: 'ri-flashlight-line' },
    { name: 'No Onion / Garlic', price: 0, icon: 'ri-heart-pulse-line' },
    { name: 'Sugar Free', price: 0, icon: 'ri-heart-line' },
    { name: 'Crispy / Well Done', price: 0, icon: 'ri-restaurant-line' },
    { name: 'Less Ice / Less Sweet', price: 0, icon: 'ri-drop-line' }
  ];

  quickKitchenNotes: string[] = [
    'Pack Gravy Separate',
    'Serve Extra Hot',
    'No Plastic Cutlery',
    'Gluten Sensitive',
    'Urgent / Rush Order'
  ];

  constructor(
    public menuService: MenuService,
    public orderService: OrderService,
    public tableService: TableService,
    public taxCalculator: TaxCalculatorService,
    public printService: PrintService,
    public tenantService: TenantService,
    public securityService: SecurityService,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.menuService.categories$.subscribe(c => this.categories = c)
    );
    this.subs.add(
      this.menuService.items$.subscribe(i => this.items = i)
    );
    this.subs.add(
      this.tableService.tables$.subscribe(t => {
        this.tables = t;
        if (t.length > 0 && !this.selectedTableId) {
          const activeTable = t.find(tbl => tbl.status === 'OCCUPIED' || tbl.status === 'BILL_REQUESTED') || t[0];
          this.selectedTableId = activeTable.id;
          this.onTableSelect();
        }
      })
    );

    // Check query params if navigated directly to settle a table (e.g. from /tables)
    this.subs.add(
      this.route.queryParams.subscribe(params => {
        if (params['tableId']) {
          this.selectedTableId = params['tableId'];
          this.orderType = 'DINE_IN';
          this.onTableSelect();

          if (params['settle'] === 'true') {
            setTimeout(() => {
              this.openPayment();
            }, 200);
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onTableSelect(): void {
    if (!this.selectedTableId || this.orderType !== 'DINE_IN') return;
    const existingOrder = this.orderService.getOrderByTableId(this.selectedTableId);
    if (existingOrder && existingOrder.items?.length > 0) {
      // Mark all existing items on the running bill as already sent to kitchen
      this.cartItems = existingOrder.items.map(it => ({ ...it, is_sent_to_kitchen: true }));
      this.discountPct = existingOrder.discount_pct || 0;
      this.activeOrderToSettle = existingOrder;
      this.syncDiscountValues();
    } else {
      this.resetCartState();
    }
    this.publishLiveTillState();
  }

  private resetCartState(): void {
    this.cartItems = [];
    this.discountPct = 0;
    this.discountAmount = 0;
    this.activeOrderToSettle = null;
    this.publishLiveTillState();
  }

  get unsentCartCount(): number {
    return this.cartItems.filter(i => !i.is_sent_to_kitchen).length;
  }

  get filteredDishes(): MenuItem[] {
    return this.items.filter(item => {
      const matchCat = this.selectedCategoryId === 'ALL' || item.category_id === this.selectedCategoryId;
      const matchQuery = !this.searchQuery || item.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCat && matchQuery && item.is_available;
    });
  }

  addToCart(dish: MenuItem): void {
    // Look for existing unsent item of the same dish to increment
    const existing = this.cartItems.find(
      i => !i.is_sent_to_kitchen && i.menu_item_id === dish.id && (!i.modifiers || i.modifiers.length === 0) && !i.notes
    );
    if (existing) {
      existing.quantity++;
      this.recalculateItemTotal(existing);
    } else {
      this.cartItems.push({
        id: `oi-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        menu_item_id: dish.id,
        name: dish.name,
        quantity: 1,
        unit_price: dish.price,
        total_price: dish.price,
        is_veg: dish.is_veg,
        modifiers: [],
        notes: '',
        kitchen_station_id: dish.kitchen_station_id,
        is_sent_to_kitchen: false
      });
    }
    this.syncDiscountValues();
  }

  updateQty(item: OrderItem, delta: number): void {
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.cartItems = this.cartItems.filter(i => i !== item);
    } else {
      this.recalculateItemTotal(item);
    }
    this.syncDiscountValues();
  }

  // --- Rapid Item Modifiers & Kitchen Notes ---
  openItemModifierModal(item: OrderItem): void {
    this.activeEditingItem = item;
    this.selectedModifiers = item.modifiers ? item.modifiers.map(m => ({ ...m })) : [];
    this.editingItemNotes = item.notes || '';
    this.showModifierModal = true;
  }

  isModifierSelected(presetName: string): boolean {
    return this.selectedModifiers.some(m => m.name.startsWith(presetName));
  }

  togglePresetModifier(preset: { name: string; price: number }): void {
    const idx = this.selectedModifiers.findIndex(m => m.name.startsWith(preset.name));
    if (idx >= 0) {
      this.selectedModifiers.splice(idx, 1);
    } else {
      const displayName = preset.price > 0 ? `${preset.name} (+₹${preset.price})` : preset.name;
      this.selectedModifiers.push({
        name: displayName,
        price_adjustment: preset.price
      });
    }
  }

  appendQuickNote(note: string): void {
    if (!this.editingItemNotes) {
      this.editingItemNotes = note;
    } else if (!this.editingItemNotes.includes(note)) {
      this.editingItemNotes += `, ${note}`;
    }
  }

  saveItemModifiers(): void {
    if (!this.activeEditingItem) return;
    this.activeEditingItem.modifiers = [...this.selectedModifiers];
    this.activeEditingItem.notes = this.editingItemNotes.trim();
    this.recalculateItemTotal(this.activeEditingItem);
    this.syncDiscountValues();
    this.showModifierModal = false;
  }

  removeModifier(item: OrderItem, mod: { name: string; price_adjustment: number }): void {
    item.modifiers = item.modifiers.filter(m => m !== mod);
    this.recalculateItemTotal(item);
    this.syncDiscountValues();
  }

  recalculateItemTotal(item: OrderItem): void {
    const modSum = (item.modifiers || []).reduce((sum, m) => sum + (m.price_adjustment || 0), 0);
    item.total_price = (item.unit_price + modSum) * item.quantity;
  }

  get cartSubtotal(): number {
    return this.cartItems.reduce((sum, item) => sum + item.total_price, 0);
  }

  // --- Dual Discount Synchronization (% and ₹ amount) ---
  onDiscountPctChange(): void {
    if (this.cartSubtotal > 0) {
      this.discountAmount = Number(((this.cartSubtotal * this.discountPct) / 100).toFixed(2));
    } else {
      this.discountAmount = 0;
    }
    this.publishLiveTillState();
  }

  onDiscountAmountChange(): void {
    if (this.cartSubtotal > 0) {
      this.discountPct = Number(((this.discountAmount / this.cartSubtotal) * 100).toFixed(1));
    } else {
      this.discountPct = 0;
    }
  }

  syncDiscountValues(): void {
    if (this.discountPct > 0) {
      this.onDiscountPctChange();
    }
    this.publishLiveTillState();
  }

  publishLiveTillState(): void {
    if (this.cartItems.length === 0) {
      this.orderService.broadcastTillCart(null);
      return;
    }
    const table = this.tables.find(t => t.id === this.selectedTableId);
    const liveOrder: Partial<Order> = {
      id: this.activeOrderToSettle?.id || 'live-till-cart',
      order_number: this.activeOrderToSettle?.order_number || 'TILL-LIVE',
      table_number: this.orderType === 'DINE_IN' ? (table?.table_number || 'Counter') : 'Takeaway',
      order_type: this.orderType,
      customer_name: this.customerName,
      customer_phone: this.customerPhone,
      items: this.cartItems.map(it => ({ ...it })),
      subtotal: this.cartSubtotal,
      discount_pct: this.discountPct,
      discount_amount: this.discountAmount,
      taxable_amount: this.taxDetails.taxableAmount,
      cgst_amount: this.taxDetails.cgstAmount,
      sgst_amount: this.taxDetails.sgstAmount,
      round_off: this.taxDetails.roundOff,
      total_amount: this.grandTotal,
      is_settled: false,
      created_at: new Date().toISOString()
    };
    this.orderService.broadcastTillCart(liveOrder);
  }

  get taxDetails() {
    const branch = this.tenantService.activeBranch;
    const cgstPct = typeof branch?.default_cgst_pct === 'number' ? branch.default_cgst_pct : 2.5;
    const sgstPct = typeof branch?.default_sgst_pct === 'number' ? branch.default_sgst_pct : 2.5;
    const isInclusive = branch?.is_tax_inclusive === true;
    return this.taxCalculator.calculateTax(this.cartSubtotal, this.discountPct, cgstPct, sgstPct, isInclusive);
  }

  get grandTotal(): number {
    return this.taxDetails.grandTotal;
  }

  // --- Split Tender & Remaining Balance ---
  get totalPaidSoFar(): number {
    return this.splitPayments.reduce((sum, p) => sum + p.amount, 0);
  }

  get remainingBalance(): number {
    if (!this.activeOrderToSettle) return 0;
    const rem = this.activeOrderToSettle.total_amount - this.totalPaidSoFar;
    return Math.max(0, Number(rem.toFixed(2)));
  }

  get changeToReturn(): number {
    if (!this.activeOrderToSettle) return 0;
    if (this.paymentMode === 'CASH') {
      return Math.max(0, Number((this.cashReceived - this.activeOrderToSettle.total_amount).toFixed(2)));
    }
    return 0;
  }

  get cashChangeDue(): number {
    return this.changeToReturn;
  }

  addSplitTender(mode: 'CASH' | 'UPI' | 'CARD', amount: number): void {
    if (amount <= 0) return;
    this.splitPayments.push({ mode, amount });
    this.partPaymentAmount = this.remainingBalance;
  }

  removeSplitTender(index: number): void {
    this.splitPayments.splice(index, 1);
    this.partPaymentAmount = this.remainingBalance;
  }

  decreaseQty(item: OrderItem): void {
    this.updateQty(item, -1);
  }

  increaseQty(item: OrderItem): void {
    this.updateQty(item, 1);
  }

  clearCart(): void {
    this.resetCartState();
  }

  // --- Print Bill Before Payment (Pre-Check / Proforma) ---
  printPreBill(): void {
    if (this.cartItems.length === 0) {
      this.toast.warning('Cart is empty! Add items to generate pre-bill.');
      return;
    }

    const table = this.tables.find(t => t.id === this.selectedTableId);
    const existing = this.activeOrderToSettle || (this.selectedTableId ? this.orderService.getOrderByTableId(this.selectedTableId) : undefined);

    let proformaOrder: Order;
    if (existing) {
      proformaOrder = existing;
    } else {
      const branch = this.tenantService.activeBranch;
      const cgstPct = typeof branch?.default_cgst_pct === 'number' ? branch.default_cgst_pct : 2.5;
      const sgstPct = typeof branch?.default_sgst_pct === 'number' ? branch.default_sgst_pct : 2.5;
      const isInclusive = branch?.is_tax_inclusive === true;
      const taxRes = this.taxCalculator.calculateTax(this.cartSubtotal, this.discountPct, cgstPct, sgstPct, isInclusive);
      proformaOrder = {
        id: `proforma-${Date.now()}`,
        organization_id: this.tenantService.currentOrg?.id || 'org-default',
        branch_id: 'branch-01',
        order_number: 'ESTIMATE',
        order_type: this.orderType,
        table_id: this.selectedTableId,
        table_number: this.orderType === 'DINE_IN' ? table?.table_number : 'Takeaway',
        customer_name: this.customerName,
        customer_phone: this.customerPhone,
        status: 'OPEN',
        items: this.cartItems,
        subtotal: this.cartSubtotal,
        discount_pct: this.discountPct,
        discount_amount: taxRes.discountAmount,
        taxable_amount: taxRes.taxableAmount,
        cgst_amount: taxRes.cgstAmount,
        sgst_amount: taxRes.sgstAmount,
        round_off: taxRes.roundOff,
        total_amount: taxRes.grandTotal,
        is_settled: false,
        created_at: new Date().toISOString()
      };
    }

    // Print Pre-Bill (Proforma without dispatching new kitchen tickets)
    this.printService.printOrderReceipt(proformaOrder, this.tenantService.activeBranch, true);
    this.toast.info(`Pre-bill estimate printed for Table ${table?.table_number || 'Order'}!`, 'Running Bill Printed');

    // Mark table status as BILL_REQUESTED (never charges or frees table!)
    if (this.selectedTableId) {
      this.tableService.updateTableStatus(this.selectedTableId, 'BILL_REQUESTED', proformaOrder.total_amount);
    }
  }

  sendToKitchen(): void {
    if (this.cartItems.length === 0) {
      this.toast.warning('Cart is empty! Select dishes to send to kitchen.');
      return;
    }

    const table = this.tables.find(t => t.id === this.selectedTableId);
    const unsentItems = this.cartItems.filter(i => !i.is_sent_to_kitchen);

    // If table already has an active order running, ensure there are new unsent dishes
    if (this.activeOrderToSettle) {
      if (unsentItems.length === 0) {
        this.toast.info(`All items on Table ${table?.table_number || ''} have already been sent to kitchen. Add a new dish to dispatch another KOT.`, 'Kitchen Up to Date');
        return;
      }
    }

    // Pass ONLY unsent new items if table has an existing order running; otherwise all cart items
    const itemsToSend = this.activeOrderToSettle ? unsentItems : this.cartItems;

    const updatedOrNewOrder = this.orderService.createOrder(
      this.orderType === 'DINE_IN' ? this.selectedTableId : undefined,
      this.orderType === 'DINE_IN' ? table?.table_number : 'Takeaway',
      this.orderType,
      itemsToSend,
      this.customerName,
      this.customerPhone,
      this.discountPct
    );

    this.toast.success(`KOT dispatched to Kitchen for ${itemsToSend.length} new dish(es) on Table ${table?.table_number || ''}!`, 'KOT Sent');
    this.onTableSelect();
  }

  sendOrderToKitchen(): void {
    this.sendToKitchen();
  }

  openPayment(order?: Order): void {
    // 1. Prioritize explicitly passed order, or currently active running table order
    let existing = order || this.activeOrderToSettle || this.orderService.getOrderByTableId(this.selectedTableId);

    if (existing) {
      // Check if cashier added new dishes to cart without explicitly clicking "Send to Kitchen" first
      const unsentItems = this.cartItems.filter(i => !i.is_sent_to_kitchen);
      if (unsentItems.length > 0) {
        // Automatically commit pending dishes to the active running bill so they are NEVER omitted from the final invoice
        existing = this.orderService.appendItemsToRunningOrder(existing.id, unsentItems);
        this.cartItems = existing.items.map(it => ({ ...it, is_sent_to_kitchen: true }));
        this.toast.info(`Committed ${unsentItems.length} pending dish(es) to bill before payment.`, 'Bill Updated');
      }

      this.activeOrderToSettle = existing;
      // Load existing items into cart if not already
      if (existing.items && this.cartItems.length === 0) {
        this.cartItems = existing.items.map(it => ({ ...it }));
        this.discountPct = existing.discount_pct || 0;
        this.syncDiscountValues();
      }
    } else {
      // 2. Only create a brand new order if there's no existing order
      if (this.cartItems.length === 0) {
        this.toast.warning('Cart is empty! Add items to settle bill.');
        return;
      }
      const table = this.tables.find(t => t.id === this.selectedTableId);
      const newOrder = this.orderService.createOrder(
        this.orderType === 'DINE_IN' ? this.selectedTableId : undefined,
        this.orderType === 'DINE_IN' ? table?.table_number : 'Takeaway',
        this.orderType,
        this.cartItems,
        this.customerName,
        this.customerPhone,
        this.discountPct
      );
      this.activeOrderToSettle = newOrder;
    }

    this.cashReceived = this.activeOrderToSettle.total_amount;
    this.partPaymentAmount = this.activeOrderToSettle.total_amount;
    this.splitPayments = [];
    this.updateUpiString();
    this.showPaymentModal = true;
  }

  openPaymentModal(order?: Order): void {
    this.openPayment(order);
  }

  setPaymentMode(mode: 'CASH' | 'UPI' | 'CARD' | 'SPLIT'): void {
    this.paymentMode = mode;
  }

  updateUpiString(): void {
    if (!this.activeOrderToSettle) return;
    const branch = this.tenantService.activeBranch;
    const amount = this.paymentMode === 'SPLIT' ? this.remainingBalance : this.activeOrderToSettle.total_amount;
    this.upiIntentQrUri = this.taxCalculator.generateUpiIntentString(
      branch.upi_vpa || 'restaurant@upi',
      branch.upi_payee_name || branch.name,
      amount,
      this.activeOrderToSettle.order_number
    );
  }

  completeSettlement(): void {
    if (!this.activeOrderToSettle) return;

    if (this.paymentMode === 'SPLIT' && this.remainingBalance > 0) {
      this.toast.error(`Cannot close bill. Remaining balance of ₹${this.remainingBalance} is unpaid.`, 'Balance Unpaid');
      return;
    }

    const settledOrder = this.activeOrderToSettle;
    const amount = settledOrder.total_amount;
    const tableNo = settledOrder.table_number || '';

    if (this.paymentMode === 'SPLIT') {
      const splitRecords = this.splitPayments.map(sp => ({
        order_id: settledOrder.id,
        payment_mode: sp.mode,
        amount: sp.amount,
        created_at: new Date().toISOString()
      }));
      this.orderService.settleOrderWithSplitPayments(settledOrder.id, splitRecords);
    } else {
      this.orderService.settleOrder(
        settledOrder.id,
        this.paymentMode,
        settledOrder.total_amount
      );
    }

    // Auto print final tax invoice receipt
    this.printService.printOrderReceipt(settledOrder, this.tenantService.activeBranch, false);

    this.showPaymentModal = false;
    this.activeOrderToSettle = null;
    this.splitPayments = [];
    this.clearCart();
    this.toast.success(`Payment of ₹${amount} received for Table ${tableNo}! Tax invoice printed.`, 'Order Settled');
  }

  confirmSettlementAndPrint(): void {
    this.completeSettlement();
  }
}
