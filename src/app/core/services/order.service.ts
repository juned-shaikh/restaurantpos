import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Order, OrderItem, GuestRequest, PaymentRecord } from '../models/order.model';
import { TaxCalculatorService } from './tax-calculator.service';
import { SoundService } from './sound.service';
import { TableService } from './table.service';
import { KdsService } from './kds.service';
import { OfflineSyncService } from './offline-sync.service';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { InventoryService } from './inventory.service';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private readonly STORAGE_KEY_ORDERS = 'orderrestro_active_orders_v1';
  private activeOrdersSubject = new BehaviorSubject<Order[]>([]);
  private guestRequestsSubject = new BehaviorSubject<GuestRequest[]>([]);

  // Live cart broadcast for dual-screen customer display
  private readonly CHANNEL_NAME = 'orderrestro_live_till_broadcast';
  private get STORAGE_KEY(): string {
    const orgId = this.tenantService?.currentOrg?.id || 'org-default';
    return `orderrestro_live_till_cart_${orgId}`;
  }
  private broadcastChannel: BroadcastChannel | null = null;

  private liveTillOrderSubject = new BehaviorSubject<Partial<Order> | null>(null);
  liveTillOrder$: Observable<Partial<Order> | null> = this.liveTillOrderSubject.asObservable();

  private orderSettledSubject = new BehaviorSubject<{ orderId: string; amount: number; mode: string; orderNo?: string } | null>(null);
  orderSettled$: Observable<{ orderId: string; amount: number; mode: string; orderNo?: string } | null> = this.orderSettledSubject.asObservable();

  activeOrders$: Observable<Order[]> = this.activeOrdersSubject.asObservable();
  guestRequests$: Observable<GuestRequest[]> = this.guestRequestsSubject.asObservable();

  constructor(
    private taxCalculator: TaxCalculatorService,
    private soundService: SoundService,
    private tableService: TableService,
    private kdsService: KdsService,
    public offlineSync: OfflineSyncService,
    private supabaseService: SupabaseService,
    private tenantService: TenantService,
    private inventoryService: InventoryService
  ) {
    this.initInitialOrders();
    this.initCrossTabSync();
    this.initSupabaseSync();

    // Listen to organization switches across multi-tenant platform
    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadOrdersForOrg(org.id);
      }
    });

    // Listen to Table Transfers to synchronously re-link order's table_id and table_number
    this.tableService.tableTransferred$.subscribe(req => {
      if (req && req.orderId && req.toTableId) {
        const toTable = this.tableService.getTableById(req.toTableId);
        this.updateOrderTable(req.orderId, req.toTableId, toTable?.table_number || 'Table');
      }
    });
  }

  updateOrderTable(orderId: string, toTableId: string, toTableNumber: string): void {
    const updated = this.activeOrders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          table_id: toTableId,
          table_number: toTableNumber
        };
      }
      return o;
    });
    this.activeOrdersSubject.next(updated);
    this.persistOrdersLocally();

    if (this.supabaseService.client) {
      this.supabaseService.from('orders').update({
        table_id: toTableId,
        table_number: toTableNumber
      }).eq('id', orderId).then();
    }
  }

  private initInitialOrders(): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    try {
      const saved = localStorage.getItem(`${this.STORAGE_KEY_ORDERS}_${orgId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed)) {
          this.activeOrdersSubject.next(parsed);
          return;
        }
      }
    } catch (e) {}

    this.activeOrdersSubject.next([]);
  }

  private persistOrdersLocally(): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    try {
      // Retain all non-settled active orders + max 50 most RECENT settled orders in localStorage
      // Older orders reside safely in Supabase Cloud without exhausting browser quota
      const active = this.activeOrders.filter(o => !o.is_settled && o.status !== 'SETTLED' && o.status !== 'CANCELLED');
      const settled = this.activeOrders.filter(o => o.is_settled || o.status === 'SETTLED' || o.status === 'CANCELLED');
      // Sort newest settled orders first so the most recent 50 are preserved
      settled.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const recentSettled = settled.slice(0, 50);
      const toStore = [...active, ...recentSettled];
      localStorage.setItem(`${this.STORAGE_KEY_ORDERS}_${orgId}`, JSON.stringify(toStore));
    } catch (e) {
      console.warn('⚠️ [OrderService] LocalStorage quota limit approached, pruning local cache:', e);
      try {
        const activeOnly = this.activeOrders.filter(o => !o.is_settled && o.status !== 'SETTLED');
        localStorage.setItem(`${this.STORAGE_KEY_ORDERS}_${orgId}`, JSON.stringify(activeOnly));
      } catch {}
    }
  }

  public async loadOrdersForOrg(orgId: string): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) {
      this.initInitialOrders();
      return;
    }

    try {
      const { data, error } = await this.supabaseService
        .from('orders')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        console.log(`☁️ [OrderService] Loaded ${data.length} orders for ${orgId} from Supabase.`);
        const normalized: Order[] = (data as any[]).map((o: any) => ({
          ...o,
          payment_mode: o.payment_mode || (o.payments && o.payments.length > 0 ? o.payments[0].payment_mode : undefined)
        }));
        this.activeOrdersSubject.next(normalized);
        this.persistOrdersLocally();

        // Sync local sequence counter with highest order number found today in Supabase Cloud
        const today = new Date().toISOString().slice(0, 10);
        const seqKey = `orderrestro_seq_${orgId}_${today}`;
        const maxTodayNum = normalized.reduce((max, o) => {
          if (o.created_at && o.created_at.startsWith(today)) {
            const num = parseInt(o.order_number, 10);
            return !isNaN(num) && num > max ? num : max;
          }
          return max;
        }, 100);
        try {
          const currentSeq = parseInt(localStorage.getItem(seqKey) || '0', 10);
          if (maxTodayNum > currentSeq) {
            localStorage.setItem(seqKey, String(maxTodayNum));
          }
        } catch {}
      }
    } catch (err) {
      console.warn('⚠️ [OrderService] Supabase order load notice:', err);
    }
  }

  /**
   * Fetches settled orders for exact accounting & tax reporting across arbitrary date ranges
   * without being capped by in-memory limits.
   */
  public async loadSettledOrdersForDateRange(orgId: string, startDate?: string, endDate?: string): Promise<Order[]> {
    const client = this.supabaseService.client;
    if (!client) {
      return this.activeOrders.filter(o => {
        if (!o.is_settled && o.status !== 'SETTLED') return false;
        const d = (o.settled_at || o.created_at || '').slice(0, 10);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });
    }

    try {
      let query = this.supabaseService
        .from('orders')
        .select('*')
        .eq('organization_id', orgId)
        .or('is_settled.eq.true,status.eq.SETTLED')
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00Z`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59Z`);
      }

      const { data, error } = await query;
      if (!error && data) {
        return (data as any[]).map((o: any) => ({
          ...o,
          payment_mode: o.payment_mode || (o.payments && o.payments.length > 0 ? o.payments[0].payment_mode : undefined)
        }));
      }
    } catch (err) {
      console.warn('⚠️ [OrderService] Supabase date range query notice:', err);
    }

    return this.activeOrders.filter(o => o.is_settled || o.status === 'SETTLED');
  }

  private async initSupabaseSync(): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (!client) {
        console.log('ℹ️ [OrderService] Supabase not connected. Operating in local mode.');
        return;
      }

      const orgId = this.tenantService.currentOrg?.id || 'org-default';
      await this.loadOrdersForOrg(orgId);

      // Realtime listener for cross-terminal order sync
      this.supabaseService.subscribeToTableChanges('orders', (payload: any) => {
        const item = payload.new as Order;
        if (!item) return;

        const currentOrgId = this.tenantService.currentOrg?.id || 'org-default';
        if (item.organization_id && item.organization_id !== currentOrgId) {
          return; // Ignore orders belonging to other cafes
        }

        if (payload.eventType === 'INSERT') {
          const exists = this.activeOrders.some(o => o.id === item.id);
          if (!exists) {
            const updated = [item, ...this.activeOrders];
            this.activeOrdersSubject.next(updated);
            this.persistOrdersLocally();

            // Realtime sequence sync: if another counter placed an order, advance our counter
            const today = new Date().toISOString().slice(0, 10);
            const num = parseInt(item.order_number, 10);
            if (!isNaN(num)) {
              const seqKey = `orderrestro_seq_${currentOrgId}_${today}`;
              const cur = parseInt(localStorage.getItem(seqKey) || '0', 10);
              if (num > cur) {
                try { localStorage.setItem(seqKey, String(num)); } catch {}
              }
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = this.activeOrders.map(o => o.id === item.id ? { ...o, ...item } : o);
          this.activeOrdersSubject.next(updated);
          this.persistOrdersLocally();
        }
      });

      // Realtime listener for cross-terminal guest service requests (Call Waiter / Request Bill)
      this.supabaseService.subscribeToTableChanges('guest_requests', (payload: any) => {
        const req = payload.new as GuestRequest;
        if (!req) return;

        const currentOrgId = this.tenantService.currentOrg?.id || 'org-default';
        if (req.organization_id && req.organization_id !== currentOrgId) {
          return;
        }

        if (payload.eventType === 'INSERT') {
          const exists = this.guestRequestsSubject.value.some(r => r.id === req.id);
          if (!exists) {
            this.guestRequestsSubject.next([req, ...this.guestRequestsSubject.value]);
            this.soundService.playCallWaiterAlert();
          }
        } else if (payload.eventType === 'UPDATE') {
          if (req.status === 'RESOLVED') {
            this.guestRequestsSubject.next(this.guestRequestsSubject.value.filter(r => r.id !== req.id));
          } else {
            this.guestRequestsSubject.next(this.guestRequestsSubject.value.map(r => r.id === req.id ? { ...r, ...req } : r));
          }
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          this.guestRequestsSubject.next(this.guestRequestsSubject.value.filter(r => r.id !== payload.old.id));
        }
      });
    } catch (err) {
      console.warn('⚠️ [OrderService] Supabase order sync notice:', err);
    }
  }

  private async saveOrderToSupabase(order: Order): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        const { error } = await this.supabaseService.from('orders').insert({
          id: order.id,
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          order_number: order.order_number,
          order_type: order.order_type,
          table_id: order.table_id || null,
          table_number: order.table_number || null,
          customer_name: order.customer_name || null,
          customer_phone: order.customer_phone || null,
          status: order.status,
          items: order.items,
          subtotal: order.subtotal,
          discount_pct: order.discount_pct,
          discount_amount: order.discount_amount,
          taxable_amount: order.taxable_amount,
          cgst_amount: order.cgst_amount,
          sgst_amount: order.sgst_amount,
          round_off: order.round_off,
          total_amount: order.total_amount,
          payments: order.payments || [],
          is_settled: order.is_settled,
          special_notes: order.special_notes || '',
          created_at: order.created_at
        });
        if (!error) {
          console.log('☁️ [OrderService] Order saved to Supabase Cloud:', order.order_number);
        } else {
          console.warn('⚠️ [OrderService] Cloud insert error, queueing offline:', error.message || error);
          this.offlineSync.queueOrder(order);
        }
      } else {
        this.offlineSync.queueOrder(order);
      }
    } catch (e) {
      console.warn('⚠️ [OrderService] Network exception, queueing offline:', e);
      this.offlineSync.queueOrder(order);
    }
  }

  private async updateOrderInSupabase(order: Order): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        await this.supabaseService.from('orders').update({
          items: order.items,
          subtotal: order.subtotal,
          discount_amount: order.discount_amount,
          taxable_amount: order.taxable_amount,
          cgst_amount: order.cgst_amount,
          sgst_amount: order.sgst_amount,
          round_off: order.round_off,
          total_amount: order.total_amount,
          status: order.status
        }).eq('id', order.id);
      }
    } catch (e) {}
  }

  private async settleOrderInSupabase(orderId: string, paymentOrPayments: PaymentRecord | PaymentRecord[]): Promise<void> {
    const order = this.getOrderById(orderId);
    if (!order) return;

    const paymentsList = Array.isArray(paymentOrPayments) ? paymentOrPayments : [paymentOrPayments];

    try {
      const client = this.supabaseService.client;
      if (client) {
        const { error } = await this.supabaseService.from('orders').update({
          is_settled: true,
          status: 'SETTLED',
          settled_at: new Date().toISOString(),
          payment_mode: order.payment_mode,
          payments: order.payments || paymentsList
        }).eq('id', orderId);

        if (error) {
          console.warn('⚠️ [OrderService] Cloud settle failed, queueing offline:', error.message || error);
          this.offlineSync.queueOrder(order);
        } else {
          console.log('☁️ [OrderService] Order settlement synced to Supabase Cloud:', orderId);
        }
      } else {
        this.offlineSync.queueOrder(order);
      }
    } catch (e) {
      this.offlineSync.queueOrder(order);
    }
  }

  private initCrossTabSync(): void {
    // 1. Initial cart restoration from localStorage
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) || localStorage.getItem('orderrestro_live_till_cart_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.liveTillOrderSubject.next(parsed);
      }
    } catch (e) {}

    // 2. BroadcastChannel for instant cross-tab / cross-window dual monitor messaging
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(this.CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          const currentOrg = this.tenantService?.currentOrg?.id || 'org-default';
          // Filter out messages belonging to a different tenant/organization
          if (event.data?.orgId && event.data.orgId !== currentOrg) {
            return;
          }
          if (event.data?.type === 'LIVE_CART_UPDATE') {
            this.liveTillOrderSubject.next(event.data.payload);
          } else if (event.data?.type === 'ORDER_SETTLED') {
            this.orderSettledSubject.next(event.data.payload);
          } else if (event.data?.type === 'REQUEST_CART') {
            const current = this.liveTillOrderSubject.value;
            if (current && this.broadcastChannel) {
              this.broadcastChannel.postMessage({
                type: 'LIVE_CART_UPDATE',
                orgId: currentOrg,
                payload: current
              });
            }
          }
        };
      } catch (e) {}
    }

    // 3. Fallback cross-window listener via storage events
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === this.STORAGE_KEY || event.key === 'orderrestro_live_till_cart_v1') {
          try {
            const data = event.newValue ? JSON.parse(event.newValue) : null;
            this.liveTillOrderSubject.next(data);
          } catch (e) {}
        }
      });
    }
  }

  requestLiveCartSync(): void {
    const currentOrg = this.tenantService?.currentOrg?.id || 'org-default';
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'REQUEST_CART', orgId: currentOrg });
      } catch (e) {}
    }
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) || localStorage.getItem('orderrestro_live_till_cart_v1');
      if (saved) {
        this.liveTillOrderSubject.next(JSON.parse(saved));
      }
    } catch (e) {}
  }

  /**
   * Broadcasts the cashier's active till cart to the secondary customer-facing display in real time
   */
  broadcastTillCart(cartState: Partial<Order> | null): void {
    const currentOrg = this.tenantService?.currentOrg?.id || 'org-default';
    this.liveTillOrderSubject.next(cartState);
    try {
      if (cartState && cartState.items && cartState.items.length > 0) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cartState));
      } else {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (e) {}

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'LIVE_CART_UPDATE',
          orgId: currentOrg,
          payload: cartState
        });
      } catch (e) {}
    }
  }

  getLiveTillOrderValue(): Partial<Order> | null {
    return this.liveTillOrderSubject.value;
  }

  get activeOrders(): Order[] {
    return this.activeOrdersSubject.value;
  }

  getOrderById(id: string): Order | undefined {
    return this.activeOrders.find(o => o.id === id);
  }

  getOrderByTableId(tableId: string): Order | undefined {
    return this.activeOrders.find(o => o.table_id === tableId && !o.is_settled);
  }

  private generateNextOrderNumber(orgId: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const seqKey = `orderrestro_seq_${orgId}_${today}`;
    let lastSeq = 0;
    try {
      const stored = localStorage.getItem(seqKey);
      if (stored) {
        lastSeq = parseInt(stored, 10) || 0;
      }
    } catch (e) {}

    // Find highest numerical sequence across all loaded orders
    const activeMax = this.activeOrders.reduce((max, o) => {
      const num = parseInt(o.order_number, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 100);

    let nextNum = Math.max(lastSeq + 1, activeMax + 1, 101);

    // Guard against collision with any existing active order on this device
    while (this.activeOrders.some(o => o.order_number === String(nextNum))) {
      nextNum++;
    }

    try {
      localStorage.setItem(seqKey, String(nextNum));
    } catch (e) {}

    return String(nextNum);
  }

  /**
   * Places a new order or automatically merges additional items into an existing running table bill
   */
  createOrder(
    tableId: string | undefined,
    tableNumber: string | undefined,
    orderType: Order['order_type'],
    items: OrderItem[],
    customerName?: string,
    customerPhone?: string,
    discountPct: number = 0
  ): Order {
    // 1. If table is already occupied and has an active running bill, append the new items!
    if (tableId && (orderType === 'DINE_IN' || orderType === 'QR_ORDER')) {
      const existingOrder = this.getOrderByTableId(tableId);
      if (existingOrder) {
        return this.appendItemsToRunningOrder(existingOrder.id, items);
      }
    }

    const branch = this.tenantService.activeBranch;
    const cgstPct = typeof branch?.default_cgst_pct === 'number' ? branch.default_cgst_pct : 2.5;
    const sgstPct = typeof branch?.default_sgst_pct === 'number' ? branch.default_sgst_pct : 2.5;
    const isInclusive = branch?.is_tax_inclusive === true;

    const rawSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const taxRes = this.taxCalculator.calculateTax(rawSubtotal, discountPct, cgstPct, sgstPct, isInclusive);

    // Ensure all items in initial order have unique IDs and are stamped as sent to kitchen
    const stampedItems: OrderItem[] = items.map((it, idx) => ({
      ...it,
      id: it.id || `oi-${Date.now()}-${idx}`,
      is_sent_to_kitchen: true
    }));

    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const orderNumber = this.generateNextOrderNumber(orgId);
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      organization_id: orgId,
      branch_id: branch?.id || 'branch-01',
      order_number: orderNumber,
      order_type: orderType,
      table_id: tableId,
      table_number: tableNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      status: 'IN_KITCHEN',
      items: stampedItems,
      subtotal: rawSubtotal,
      discount_pct: discountPct,
      discount_amount: taxRes.discountAmount,
      taxable_amount: taxRes.taxableAmount,
      cgst_amount: taxRes.cgstAmount,
      sgst_amount: taxRes.sgstAmount,
      round_off: taxRes.roundOff,
      total_amount: taxRes.grandTotal,
      kot_count: 1,
      is_settled: false,
      created_at: new Date().toISOString()
    };

    this.activeOrdersSubject.next([newOrder, ...this.activeOrders]);
    this.persistOrdersLocally();
    this.saveOrderToSupabase(newOrder);

    if (!this.offlineSync.isOnline) {
      this.offlineSync.queueOrder(newOrder);
    }

    if (tableId) {
      this.tableService.updateTableStatus(tableId, 'OCCUPIED', newOrder.total_amount, newOrder.id);
    }

    // Automatically route to Kitchen Display System (KDS)
    this.kdsService.createTicket({
      organization_id: newOrder.organization_id,
      branch_id: newOrder.branch_id,
      order_id: newOrder.id,
      order_number: newOrder.order_number,
      kot_number: `KOT-${newOrder.order_number}`,
      table_number: tableNumber || 'Takeaway',
      order_type: orderType,
      status: 'PENDING',
      items: stampedItems.map((it, idx) => ({
        id: `kot-item-${idx}`,
        kot_ticket_id: '',
        order_item_id: it.id || `oi-${idx}`,
        menu_item_id: it.menu_item_id,
        name: it.name,
        quantity: it.quantity,
        modifiers_summary: it.modifiers?.map(m => m.name).join(', '),
        is_struck_through: false,
        notes: it.notes,
        created_at: new Date().toISOString()
      }))
    });

    return newOrder;
  }

  /**
   * Appends additional dishes to an existing running table bill (Round 2 / Additional Order)
   * Sends KOT to kitchen ONLY for the newly added items so chef doesn't re-cook old dishes.
   */
  appendItemsToRunningOrder(orderId: string, itemsToAdd: OrderItem[]): Order {
    const existing = this.getOrderById(orderId);
    if (!existing) throw new Error('Existing order not found');

    const existingIds = new Set(existing.items.map(i => i.id));
    const trulyNewItems: OrderItem[] = [];
    const mergedItems: OrderItem[] = existing.items.map(i => ({ ...i, is_sent_to_kitchen: true }));

    for (const item of itemsToAdd) {
      // Skip items that were already sent to kitchen in previous rounds
      if (item.is_sent_to_kitchen || (item.id && existingIds.has(item.id))) {
        continue;
      }
      const newItem: OrderItem = {
        ...item,
        id: item.id || `oi-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        is_sent_to_kitchen: true
      };
      trulyNewItems.push(newItem);
      mergedItems.push(newItem);
    }

    // If no unsent new items were found, return existing without sending duplicate KOT
    if (trulyNewItems.length === 0) {
      return existing;
    }

    // Recalculate consolidated bill with branch tax settings
    const branch = this.tenantService.activeBranch;
    const cgstPct = typeof branch?.default_cgst_pct === 'number' ? branch.default_cgst_pct : 2.5;
    const sgstPct = typeof branch?.default_sgst_pct === 'number' ? branch.default_sgst_pct : 2.5;
    const isInclusive = branch?.is_tax_inclusive === true;

    const rawSubtotal = mergedItems.reduce((sum, item) => sum + item.total_price, 0);
    const taxRes = this.taxCalculator.calculateTax(rawSubtotal, existing.discount_pct || 0, cgstPct, sgstPct, isInclusive);
    const currentRound = (existing.kot_count || 1) + 1;

    const updatedOrder: Order = {
      ...existing,
      items: mergedItems,
      subtotal: rawSubtotal,
      discount_amount: taxRes.discountAmount,
      taxable_amount: taxRes.taxableAmount,
      cgst_amount: taxRes.cgstAmount,
      sgst_amount: taxRes.sgstAmount,
      round_off: taxRes.roundOff,
      total_amount: taxRes.grandTotal,
      kot_count: currentRound,
      status: 'IN_KITCHEN'
    };

    const updated = this.activeOrders.map(o => o.id === orderId ? updatedOrder : o);
    this.activeOrdersSubject.next(updated);
    this.persistOrdersLocally();
    this.updateOrderInSupabase(updatedOrder);

    // Update Table running bill amount
    if (existing.table_id) {
      this.tableService.updateTableStatus(existing.table_id, 'OCCUPIED', updatedOrder.total_amount, updatedOrder.id);
    }

    // Route ONLY the new items to Kitchen KDS (Round N KOT!)
    this.kdsService.createTicket({
      organization_id: updatedOrder.organization_id,
      branch_id: updatedOrder.branch_id,
      order_id: updatedOrder.id,
      order_number: updatedOrder.order_number,
      kot_number: `KOT-${updatedOrder.order_number}-R${currentRound}`,
      table_number: updatedOrder.table_number || 'Table',
      order_type: updatedOrder.order_type,
      status: 'PENDING',
      items: trulyNewItems.map((it, idx) => ({
        id: `kot-item-${Date.now()}-${idx}`,
        kot_ticket_id: '',
        order_item_id: it.id || `oi-${idx}`,
        menu_item_id: it.menu_item_id,
        name: it.name,
        quantity: it.quantity,
        modifiers_summary: it.modifiers?.map(m => m.name).join(', '),
        is_struck_through: false,
        notes: it.notes || `Additional Re-order (Round ${currentRound})`,
        created_at: new Date().toISOString()
      }))
    });

    return updatedOrder;
  }

  /**
   * Settle payment (Cash, UPI QR, Card) and mark order complete
   */
  settleOrder(orderId: string, paymentMode: PaymentRecord['payment_mode'], amountPaid: number, txnRef?: string): void {
    const order = this.getOrderById(orderId);
    if (!order) return;

    const payment: PaymentRecord = {
      order_id: orderId,
      payment_mode: paymentMode,
      amount: amountPaid,
      transaction_ref: txnRef,
      created_at: new Date().toISOString()
    };

    const updated = this.activeOrders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          is_settled: true,
          status: 'SETTLED' as const,
          settled_at: new Date().toISOString(),
          payment_mode: paymentMode,
          payments: [...(o.payments || []), payment]
        };
      }
      return o;
    });

    this.activeOrdersSubject.next(updated);
    this.persistOrdersLocally();
    this.settleOrderInSupabase(orderId, payment);

    // Free up table if dine-in
    if (order.table_id) {
      this.tableService.updateTableStatus(order.table_id, 'AVAILABLE', 0);
    }

    // Automatically deduct sold items from inventory stock
    this.inventoryService.deductStockForOrderItems(order.items);

    const settleInfo = {
      orderId,
      amount: amountPaid,
      mode: paymentMode,
      orderNo: order.order_number
    };
    this.orderSettledSubject.next(settleInfo);
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'ORDER_SETTLED',
          payload: settleInfo
        });
        this.broadcastChannel.postMessage({
          type: 'LIVE_CART_UPDATE',
          payload: null
        });
      } catch (e) {}
    }

    this.soundService.playPaymentSuccess();
  }

  /**
   * Settle payment with split modes (e.g. part Cash + part UPI)
   */
  settleOrderWithSplitPayments(orderId: string, splitPayments: PaymentRecord[]): void {
    const order = this.getOrderById(orderId);
    if (!order) return;

    const totalPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0);

    const updated = this.activeOrders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          is_settled: true,
          status: 'SETTLED' as const,
          settled_at: new Date().toISOString(),
          payment_mode: 'SPLIT' as any,
          payments: splitPayments
        };
      }
      return o;
    });

    this.activeOrdersSubject.next(updated);
    this.persistOrdersLocally();
    this.settleOrderInSupabase(orderId, splitPayments);

    // Free up table if dine-in
    if (order.table_id) {
      this.tableService.updateTableStatus(order.table_id, 'AVAILABLE', 0);
    }

    // Automatically deduct sold items from inventory stock
    this.inventoryService.deductStockForOrderItems(order.items);

    const settleInfo = {
      orderId,
      amount: totalPaid,
      mode: 'SPLIT',
      orderNo: order.order_number
    };
    this.orderSettledSubject.next(settleInfo);
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'ORDER_SETTLED',
          payload: settleInfo
        });
        this.broadcastChannel.postMessage({
          type: 'LIVE_CART_UPDATE',
          payload: null
        });
      } catch (e) {}
    }

    this.soundService.playPaymentSuccess();
  }

  // QR Guest Service Requests
  submitGuestRequest(tableId: string, tableNumber: string, requestType: GuestRequest['request_type'], notes?: string): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const req: GuestRequest = {
      id: `gr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: orgId,
      branch_id: 'branch-01',
      table_id: tableId,
      table_number: tableNumber,
      request_type: requestType,
      status: 'PENDING',
      notes,
      created_at: new Date().toISOString()
    };

    this.guestRequestsSubject.next([req, ...this.guestRequestsSubject.value]);

    if (requestType === 'REQUEST_BILL') {
      this.tableService.updateTableStatus(tableId, 'BILL_REQUESTED');
    }

    this.soundService.playCallWaiterAlert();

    // Persist and broadcast to Supabase Cloud so all cashier/waiter terminals receive the alert
    if (this.supabaseService.client) {
      this.supabaseService.from('guest_requests').insert([req]).then((res: any) => {
        if (res?.error) {
          console.warn('⚠️ [OrderService] Supabase guest_requests insert notice:', res.error);
        }
      }).catch(() => {});
    }
  }

  resolveGuestRequest(id: string): void {
    this.guestRequestsSubject.next(this.guestRequestsSubject.value.filter(r => r.id !== id));
    if (this.supabaseService.client) {
      this.supabaseService.from('guest_requests').update({ status: 'RESOLVED' }).eq('id', id).then();
    }
  }
}

