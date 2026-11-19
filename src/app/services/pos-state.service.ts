import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { 
  MenuItem, 
  MenuCategory, 
  Table, 
  Floor, 
  CartItem, 
  CartItemModifier, 
  Order, 
  KotTicket, 
  Customer, 
  OrderType,
  PaymentMethod 
} from '../models';
import { SoundService } from './sound.service';
import { PrintService } from './print.service';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PosStateService {
  // Restaurant Info
  public restaurant = environment.restaurant;

  // Categories
  private categoriesSubject = new BehaviorSubject<MenuCategory[]>([
    { id: 'cat_all', name: 'All Dishes', icon: 'grid', sortOrder: 0 },
    { id: 'cat_starters', name: 'Starters', icon: 'utensils', sortOrder: 1 },
    { id: 'cat_mains', name: 'Main Course', icon: 'bowl', sortOrder: 2 },
    { id: 'cat_biryani', name: 'Biryani & Rice', icon: 'drumstick', sortOrder: 3 },
    { id: 'cat_breads', name: 'Tandoori Breads', icon: 'wheat', sortOrder: 4 },
    { id: 'cat_drinks', name: 'Beverages', icon: 'coffee', sortOrder: 5 },
    { id: 'cat_desserts', name: 'Desserts', icon: 'ice-cream', sortOrder: 6 }
  ]);
  public categories$ = this.categoriesSubject.asObservable();

  // Menu Items
  private menuItemsSubject = new BehaviorSubject<MenuItem[]>([
    {
      id: 'item_1',
      name: 'Paneer Tikka Angara',
      description: 'Charcoal grilled cottage cheese in spicy tandoori yogurt marinade',
      price: 280,
      categoryId: 'cat_starters',
      taxRate: 5,
      isVeg: true,
      isAvailable: true,
      modifierGroups: [
        {
          id: 'mod_portion',
          name: 'Portion Size',
          minSelection: 1,
          maxSelection: 1,
          isRequired: true,
          options: [
            { id: 'opt_half', name: 'Half (4 pcs)', priceDelta: 0 },
            { id: 'opt_full', name: 'Full (8 pcs)', priceDelta: 160 }
          ]
        },
        {
          id: 'mod_spice',
          name: 'Spice Level',
          minSelection: 0,
          maxSelection: 1,
          isRequired: false,
          options: [
            { id: 'opt_medium', name: 'Medium Spicy', priceDelta: 0 },
            { id: 'opt_extra', name: 'Angara Extra Hot 🔥', priceDelta: 20 }
          ]
        }
      ]
    },
    {
      id: 'item_2',
      name: 'Murgh Malai Tikka',
      description: 'Juicy chicken breast infused with cream cheese and mace',
      price: 340,
      categoryId: 'cat_starters',
      taxRate: 5,
      isVeg: false,
      isAvailable: true,
      modifierGroups: [
        {
          id: 'mod_portion_m',
          name: 'Portion',
          minSelection: 1,
          maxSelection: 1,
          isRequired: true,
          options: [
            { id: 'opt_m_half', name: 'Half (4 pcs)', priceDelta: 0 },
            { id: 'opt_m_full', name: 'Full (8 pcs)', priceDelta: 180 }
          ]
        }
      ]
    },
    {
      id: 'item_3',
      name: 'Butter Chicken Delhi-6',
      description: 'Clay oven pulled chicken simmered in rich creamy tomato makhani gravy',
      price: 390,
      categoryId: 'cat_mains',
      taxRate: 5,
      isVeg: false,
      isAvailable: true
    },
    {
      id: 'item_4',
      name: 'Paneer Butter Masala',
      description: 'Fresh cottage cheese cooked in silky cashew nut and tomato gravy',
      price: 320,
      categoryId: 'cat_mains',
      taxRate: 5,
      isVeg: true,
      isAvailable: true
    },
    {
      id: 'item_5',
      name: 'Dal Makhani 24-hr Simmer',
      description: 'Black lentils slow-cooked overnight with white churned butter',
      price: 260,
      categoryId: 'cat_mains',
      taxRate: 5,
      isVeg: true,
      isAvailable: true
    },
    {
      id: 'item_6',
      name: 'Hyderabadi Dum Chicken Biryani',
      description: 'Aromatic long-grain basmati layered with tender chicken & saffron',
      price: 360,
      categoryId: 'cat_biryani',
      taxRate: 5,
      isVeg: false,
      isAvailable: true
    },
    {
      id: 'item_7',
      name: 'Butter Garlic Naan',
      description: 'Hand-stretched tandoori bread with roasted garlic and melted butter',
      price: 75,
      categoryId: 'cat_breads',
      taxRate: 5,
      isVeg: true,
      isAvailable: true
    },
    {
      id: 'item_8',
      name: 'Royal Mango Lassi',
      description: 'Chilled thick sweet yogurt whipped with fresh Alphonso mango pulp',
      price: 120,
      categoryId: 'cat_drinks',
      taxRate: 5,
      isVeg: true,
      isAvailable: true
    },
    {
      id: 'item_9',
      name: 'Gulab Jamun with Rabri',
      description: 'Warm melt-in-mouth khoya balls over chilled saffron rabri',
      price: 140,
      categoryId: 'cat_desserts',
      taxRate: 5,
      isVeg: true,
      isAvailable: true
    }
  ]);
  public menuItems$ = this.menuItemsSubject.asObservable();

  // Floors & Tables
  private floorsSubject = new BehaviorSubject<Floor[]>([
    { id: 'flr_main', name: 'Main Dining' },
    { id: 'flr_terrace', name: 'Rooftop Terrace' }
  ]);
  public floors$ = this.floorsSubject.asObservable();

  private tablesSubject = new BehaviorSubject<Table[]>([
    { id: 'tbl_1', tableNumber: 'T-01', floorId: 'flr_main', capacity: 2, status: 'AVAILABLE' },
    { id: 'tbl_2', tableNumber: 'T-02', floorId: 'flr_main', capacity: 4, status: 'AVAILABLE' },
    { id: 'tbl_3', tableNumber: 'T-03', floorId: 'flr_main', capacity: 4, status: 'AVAILABLE' },
    { id: 'tbl_4', tableNumber: 'T-04', floorId: 'flr_main', capacity: 6, status: 'AVAILABLE' },
    { id: 'tbl_5', tableNumber: 'T-05', floorId: 'flr_main', capacity: 4, status: 'AVAILABLE' },
    { id: 'tbl_6', tableNumber: 'R-01', floorId: 'flr_terrace', capacity: 4, status: 'AVAILABLE' },
    { id: 'tbl_7', tableNumber: 'R-02', floorId: 'flr_terrace', capacity: 2, status: 'AVAILABLE' },
    { id: 'tbl_8', tableNumber: 'R-03', floorId: 'flr_terrace', capacity: 6, status: 'AVAILABLE' }
  ]);
  public tables$ = this.tablesSubject.asObservable();

  // Active Cart State
  public currentOrderType: OrderType = 'DINE_IN';
  public selectedTable: Table | null = null;
  public selectedCustomer: Customer | null = null;
  public discountPercent = 0;
  public discountReason = '';

  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  public cartItems$ = this.cartItemsSubject.asObservable();

  // KOT Tickets (KDS)
  private kotTicketsSubject = new BehaviorSubject<KotTicket[]>([
    {
      id: 'kot_101',
      ticketNumber: 101,
      orderId: 'ord_demo_1',
      tableNumber: 'T-02',
      serverName: 'Vikram',
      station: 'GRILL',
      status: 'PREPARING',
      items: [
        { name: 'Paneer Tikka Angara', quantity: 1, notes: 'Less oil', modifiers: 'Medium Spicy' },
        { name: 'Murgh Malai Tikka', quantity: 2, modifiers: 'Full (8 pcs)' }
      ],
      createdAt: new Date(Date.now() - 14 * 60000).toISOString() // 14 mins ago
    },
    {
      id: 'kot_102',
      ticketNumber: 102,
      orderId: 'ord_demo_2',
      tableNumber: 'T-04',
      serverName: 'Anjali',
      station: 'MAIN_KITCHEN',
      status: 'PENDING',
      items: [
        { name: 'Butter Chicken Delhi-6', quantity: 2 },
        { name: 'Butter Garlic Naan', quantity: 4 }
      ],
      createdAt: new Date(Date.now() - 5 * 60000).toISOString() // 5 mins ago
    }
  ]);
  public kotTickets$ = this.kotTicketsSubject.asObservable();

  // Completed / Past Orders
  private ordersSubject = new BehaviorSubject<Order[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  // Customers
  private customersSubject = new BehaviorSubject<Customer[]>([
    { id: 'cust_1', name: 'Aarav Sharma', phone: '9820011223', loyaltyPoints: 150, totalSpent: 4200, visitCount: 5 },
    { id: 'cust_2', name: 'Priya Patel', phone: '9819922334', loyaltyPoints: 80, totalSpent: 2150, visitCount: 3 }
  ]);
  public customers$ = this.customersSubject.asObservable();

  constructor(
    private soundService: SoundService,
    private printService: PrintService,
    private supabaseService: SupabaseService
  ) {
    this.initSupabaseSync();
  }

  // --- Realtime Supabase Sync ---
  private initSupabaseSync() {
    if (this.supabaseService.isConnected) {
      this.supabaseService.subscribeToTable('tables', (payload) => {
        if (payload.eventType === 'UPDATE') {
          const current = this.tablesSubject.value.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t);
          this.tablesSubject.next(current);
        }
      });
      this.supabaseService.subscribeToTable('kot_tickets', (payload) => {
        if (payload.eventType === 'INSERT') {
          this.kotTicketsSubject.next([payload.new, ...this.kotTicketsSubject.value]);
          this.soundService.playKotSend();
        }
      });
    }
  }

  // --- Cart Actions ---
  public addToCart(item: MenuItem, selectedModifiers: CartItemModifier[] = [], note: string = '') {
    const modDelta = selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    const unitPrice = item.price + modDelta;
    const current = this.cartItemsSubject.value;

    // Check if identical item + modifier set exists
    const modKey = selectedModifiers.map(m => m.optionId).sort().join('_');
    const existingIndex = current.findIndex(ci => 
      ci.menuItem.id === item.id && 
      ci.selectedModifiers.map(m => m.optionId).sort().join('_') === modKey &&
      (ci.itemNote || '') === note
    );

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].quantity * updated[existingIndex].unitPriceWithModifiers;
      this.cartItemsSubject.next(updated);
    } else {
      const newItem: CartItem = {
        cartItemId: 'ci_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        menuItem: item,
        quantity: 1,
        selectedModifiers: selectedModifiers,
        itemNote: note,
        unitPriceWithModifiers: unitPrice,
        lineTotal: unitPrice,
        kotStatus: 'PENDING'
      };
      this.cartItemsSubject.next([...current, newItem]);
    }
  }

  public updateCartQuantity(cartItemId: string, change: number) {
    const current = this.cartItemsSubject.value;
    const updated = current.map(item => {
      if (item.cartItemId === cartItemId) {
        const newQty = item.quantity + change;
        if (newQty <= 0) return null;
        return {
          ...item,
          quantity: newQty,
          lineTotal: newQty * item.unitPriceWithModifiers
        };
      }
      return item;
    }).filter(Boolean) as CartItem[];

    this.cartItemsSubject.next(updated);
  }

  public removeCartItem(cartItemId: string) {
    this.cartItemsSubject.next(this.cartItemsSubject.value.filter(i => i.cartItemId !== cartItemId));
  }

  public clearCart() {
    this.cartItemsSubject.next([]);
    this.discountPercent = 0;
    this.discountReason = '';
    this.selectedTable = null;
    this.selectedCustomer = null;
  }

  // --- GST and Financial Calculations ---
  public getCartCalculations() {
    const items = this.cartItemsSubject.value;
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    // Bill Discount
    const discountAmount = Math.round((subtotal * (this.discountPercent / 100)) * 100) / 100;
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);

    // 5% GST (2.5% CGST + 2.5% SGST)
    const cgst = Math.round((discountedSubtotal * 0.025) * 100) / 100;
    const sgst = Math.round((discountedSubtotal * 0.025) * 100) / 100;
    const taxAmount = cgst + sgst;

    const rawTotal = discountedSubtotal + taxAmount;
    const grandTotal = Math.round(rawTotal); // Indian POS standard nearest ₹1 round off
    const roundOff = Math.round((grandTotal - rawTotal) * 100) / 100;

    return {
      subtotal,
      discountAmount,
      cgst,
      sgst,
      taxAmount,
      roundOff,
      grandTotal
    };
  }

  // --- Send KOT to Kitchen ---
  public sendKotToKitchen(): KotTicket | null {
    const items = this.cartItemsSubject.value;
    if (items.length === 0) return null;

    const ticketNumber = 100 + this.kotTicketsSubject.value.length + 1;
    const newKot: KotTicket = {
      id: 'kot_' + Date.now(),
      ticketNumber: ticketNumber,
      orderId: 'ord_' + Date.now(),
      tableNumber: this.selectedTable ? this.selectedTable.tableNumber : this.currentOrderType,
      serverName: 'Staff',
      station: 'MAIN_KITCHEN',
      status: 'PENDING',
      items: items.map(i => ({
        name: i.menuItem.name,
        quantity: i.quantity,
        notes: i.itemNote,
        modifiers: i.selectedModifiers.map(m => m.name).join(', ')
      })),
      createdAt: new Date().toISOString()
    };

    // Update Table status to OCCUPIED
    if (this.selectedTable) {
      this.updateTableStatus(this.selectedTable.id, 'OCCUPIED', newKot.orderId, this.getCartCalculations().grandTotal);
    }

    this.kotTicketsSubject.next([newKot, ...this.kotTicketsSubject.value]);
    this.soundService.playKotSend();
    return newKot;
  }

  // --- Settle Bill & Checkout ---
  public settleOrder(paymentMethod: PaymentMethod = 'UPI'): Order {
    const calc = this.getCartCalculations();
    const orderNumber = 1000 + this.ordersSubject.value.length + 1;

    const newOrder: Order = {
      id: 'ord_' + Date.now(),
      orderNumber: orderNumber,
      orderType: this.currentOrderType,
      tableId: this.selectedTable ? this.selectedTable.id : undefined,
      tableNumber: this.selectedTable ? this.selectedTable.tableNumber : undefined,
      customerName: this.selectedCustomer ? this.selectedCustomer.name : undefined,
      customerPhone: this.selectedCustomer ? this.selectedCustomer.phone : undefined,
      items: [...this.cartItemsSubject.value],
      subtotal: calc.subtotal,
      cgst: calc.cgst,
      sgst: calc.sgst,
      taxAmount: calc.taxAmount,
      discountAmount: calc.discountAmount,
      discountReason: this.discountReason,
      roundOff: calc.roundOff,
      grandTotal: calc.grandTotal,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      serverName: 'Staff'
    };

    // Free table if dine-in
    if (this.selectedTable) {
      this.updateTableStatus(this.selectedTable.id, 'AVAILABLE', undefined, 0);
    }

    // Add to completed orders
    this.ordersSubject.next([newOrder, ...this.ordersSubject.value]);

    // Play Payment Received UPI Chime!
    this.soundService.playPaymentReceived();

    // Trigger Print Receipt
    this.printService.printReceipt(newOrder, {
      name: this.restaurant.name,
      address: this.restaurant.address,
      phone: this.restaurant.phone,
      gstNumber: this.restaurant.gstNumber
    });

    // Clear active cart
    this.clearCart();
    return newOrder;
  }

  // --- Table Operations ---
  public updateTableStatus(tableId: string, status: Table['status'], orderId?: string, billAmount?: number) {
    const updated = this.tablesSubject.value.map(tbl => {
      if (tbl.id === tableId) {
        return {
          ...tbl,
          status,
          currentOrderId: orderId !== undefined ? orderId : tbl.currentOrderId,
          activeBillAmount: billAmount !== undefined ? billAmount : tbl.activeBillAmount
        };
      }
      return tbl;
    });
    this.tablesSubject.next(updated);
  }

  // --- KDS Bump Ticket Status ---
  public bumpKotStatus(kotId: string) {
    const updated = this.kotTicketsSubject.value.map(kot => {
      if (kot.id === kotId) {
        let nextStatus: KotTicket['status'] = 'PENDING';
        if (kot.status === 'PENDING') nextStatus = 'PREPARING';
        else if (kot.status === 'PREPARING') nextStatus = 'READY';
        else if (kot.status === 'READY') nextStatus = 'SERVED';
        else nextStatus = 'SERVED';
        return { ...kot, status: nextStatus };
      }
      return kot;
    });
    this.kotTicketsSubject.next(updated);
  }

  // --- Daily Analytics & Nightly Close ---
  public getDailyStats() {
    const orders = this.ordersSubject.value;
    const totalSales = orders.reduce((sum, o) => sum + o.grandTotal, 0);
    const totalTax = orders.reduce((sum, o) => sum + o.taxAmount, 0);
    const orderCount = orders.length;
    const avgBill = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

    return {
      totalSales,
      totalTax,
      orderCount,
      avgBill
    };
  }
}
