import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Order } from '../models/order.model';
import { Expense } from '../models/finance.model';
import { SupabaseService } from './supabase.service';
import { StorageService } from './storage.service';

export interface OfflineInventoryUpdate {
  id: string;
  current_stock: number;
  is_low_stock?: boolean;
  avg_unit_cost?: number;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private readonly QUEUE_KEY_ORDERS = 'orderrestro_offline_orders_queue_v1';
  private readonly QUEUE_KEY_INVENTORY = 'orderrestro_offline_inventory_queue_v1';
  private readonly QUEUE_KEY_EXPENSES = 'orderrestro_offline_expenses_queue_v1';

  private ordersQueue: Order[] = [];
  private inventoryQueue: OfflineInventoryUpdate[] = [];
  private expensesQueue: Expense[] = [];

  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();

  private queuedCountSubject = new BehaviorSubject<number>(0);
  queuedCount$: Observable<number> = this.queuedCountSubject.asObservable();

  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private storageService: StorageService
  ) {
    this.loadQueuesFromStorage();

    window.addEventListener('online', () => {
      console.log('🌐 [Network] Device is back ONLINE.');
      this.isOnlineSubject.next(true);
      this.autoSync();
    });

    window.addEventListener('offline', () => {
      console.warn('⚠️ [Network] Device is OFFLINE. Offline-First IndexedDB queue active.');
      this.isOnlineSubject.next(false);
    });
  }

  private async loadQueuesFromStorage(): Promise<void> {
    try {
      const orders = await this.storageService.getItem<Order[]>(this.QUEUE_KEY_ORDERS, []);
      const inv = await this.storageService.getItem<OfflineInventoryUpdate[]>(this.QUEUE_KEY_INVENTORY, []);
      const expenses = await this.storageService.getItem<Expense[]>(this.QUEUE_KEY_EXPENSES, []);
      this.ordersQueue = orders || [];
      this.inventoryQueue = inv || [];
      this.expensesQueue = expenses || [];
    } catch {
      this.ordersQueue = [];
      this.inventoryQueue = [];
      this.expensesQueue = [];
    }
    this.updateQueuedCount();
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  get queuedCount(): number {
    return this.queuedCountSubject.value;
  }

  // --- Orders Queue ---
  getQueuedOrders(): Order[] {
    return this.ordersQueue;
  }

  queueOrder(order: Order): void {
    const existingIdx = this.ordersQueue.findIndex(o => o.id === order.id);
    const offlineOrder: Order = {
      ...order,
      special_notes: (order.special_notes ? order.special_notes + ' ' : '') + '[SAVED OFFLINE]'
    };
    if (existingIdx >= 0) {
      this.ordersQueue[existingIdx] = offlineOrder;
    } else {
      this.ordersQueue.push(offlineOrder);
    }

    this.storageService.setItem(this.QUEUE_KEY_ORDERS, this.ordersQueue);
    this.updateQueuedCount();
    console.warn(`📦 [OfflineSync] Order #${order.order_number} safely preserved in IndexedDB offline storage.`);

    // Cloud-First: If internet is connected, immediately push queue to Supabase
    if (this.isOnline) {
      this.autoSync();
    }
  }

  // --- Inventory Queue ---
  getQueuedInventory(): OfflineInventoryUpdate[] {
    return this.inventoryQueue;
  }

  queueInventoryUpdate(itemId: string, currentStock: number, isLowStock?: boolean, avgUnitCost?: number): void {
    const existingIdx = this.inventoryQueue.findIndex(i => i.id === itemId);
    const itemUpdate: OfflineInventoryUpdate = {
      id: itemId,
      current_stock: currentStock,
      is_low_stock: !!isLowStock,
      avg_unit_cost: avgUnitCost,
      updated_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      this.inventoryQueue[existingIdx] = itemUpdate;
    } else {
      this.inventoryQueue.push(itemUpdate);
    }

    this.storageService.setItem(this.QUEUE_KEY_INVENTORY, this.inventoryQueue);
    this.updateQueuedCount();
    console.warn(`📦 [OfflineSync] Inventory item ${itemId} stock update preserved in IndexedDB offline storage.`);

    if (this.isOnline) {
      this.autoSync();
    }
  }

  // --- Expenses Queue ---
  getQueuedExpenses(): Expense[] {
    return this.expensesQueue;
  }

  queueExpense(expense: Expense): void {
    const existingIdx = this.expensesQueue.findIndex(e => e.id === expense.id);
    if (existingIdx >= 0) {
      this.expensesQueue[existingIdx] = expense;
    } else {
      this.expensesQueue.push(expense);
    }

    this.storageService.setItem(this.QUEUE_KEY_EXPENSES, this.expensesQueue);
    this.updateQueuedCount();
    console.warn(`📦 [OfflineSync] Expense ${expense.id} preserved in IndexedDB offline storage.`);

    if (this.isOnline) {
      this.autoSync();
    }
  }

  /**
   * Real Supabase cloud sync engine for offline-queued orders, inventory, and expenses
   */
  async autoSync(): Promise<number> {
    const client = this.supabaseService.client;
    if (!client) {
      console.log('ℹ️ [OfflineSync] Supabase client not ready yet. Retrying in background...');
      return 0;
    }

    this.isSyncingSubject.next(true);
    let successfullySynced = 0;

    // 1. Sync Orders
    const orderQueue = [...this.ordersQueue];
    if (orderQueue.length > 0) {
      console.log(`⚡ [OfflineSync] Syncing ${orderQueue.length} offline orders to Supabase Cloud...`);
      const remainingOrders: Order[] = [];

      for (const order of orderQueue) {
        try {
          const { error } = await this.supabaseService.from('orders').upsert({
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
            is_settled: order.is_settled,
            settled_at: order.settled_at || null,
            payments: order.payments || [],
            special_notes: order.special_notes?.replace('[SAVED OFFLINE]', '').trim() || '',
            created_at: order.created_at
          });

          if (!error) {
            successfullySynced++;
          } else {
            console.warn(`Failed to sync order #${order.order_number}:`, error);
            remainingOrders.push(order);
          }
        } catch (err) {
          console.error(`Sync error for order #${order.order_number}:`, err);
          remainingOrders.push(order);
        }
      }

      this.ordersQueue = remainingOrders;
      if (remainingOrders.length > 0) {
        this.storageService.setItem(this.QUEUE_KEY_ORDERS, remainingOrders);
      } else {
        this.storageService.removeItem(this.QUEUE_KEY_ORDERS);
      }
    }

    // 2. Sync Inventory Updates
    const invQueue = [...this.inventoryQueue];
    if (invQueue.length > 0) {
      console.log(`⚡ [OfflineSync] Syncing ${invQueue.length} inventory updates to Supabase Cloud...`);
      const remainingInv: OfflineInventoryUpdate[] = [];

      for (const item of invQueue) {
        try {
          const payload: any = {
            current_stock: item.current_stock,
            is_low_stock: item.is_low_stock
          };
          if (item.avg_unit_cost !== undefined) {
            payload.avg_unit_cost = item.avg_unit_cost;
          }
          const { error } = await this.supabaseService.from('inventory_items').update(payload).eq('id', item.id);
          if (!error) {
            successfullySynced++;
          } else {
            remainingInv.push(item);
          }
        } catch {
          remainingInv.push(item);
        }
      }

      this.inventoryQueue = remainingInv;
      if (remainingInv.length > 0) {
        this.storageService.setItem(this.QUEUE_KEY_INVENTORY, remainingInv);
      } else {
        this.storageService.removeItem(this.QUEUE_KEY_INVENTORY);
      }
    }

    // 3. Sync Expenses
    const expQueue = [...this.expensesQueue];
    if (expQueue.length > 0) {
      console.log(`⚡ [OfflineSync] Syncing ${expQueue.length} offline expenses to Supabase Cloud...`);
      const remainingExp: Expense[] = [];

      for (const exp of expQueue) {
        try {
          const { error } = await this.supabaseService.from('expenses').upsert(exp);
          if (!error) {
            successfullySynced++;
          } else {
            remainingExp.push(exp);
          }
        } catch {
          remainingExp.push(exp);
        }
      }

      this.expensesQueue = remainingExp;
      if (remainingExp.length > 0) {
        this.storageService.setItem(this.QUEUE_KEY_EXPENSES, remainingExp);
      } else {
        this.storageService.removeItem(this.QUEUE_KEY_EXPENSES);
      }
    }

    this.updateQueuedCount();
    this.isSyncingSubject.next(false);
    console.log(`✅ [OfflineSync] Auto-sync complete. Synced items: ${successfullySynced}`);
    return successfullySynced;
  }

  clearQueue(): void {
    this.ordersQueue = [];
    this.inventoryQueue = [];
    this.expensesQueue = [];
    this.storageService.removeItem(this.QUEUE_KEY_ORDERS);
    this.storageService.removeItem(this.QUEUE_KEY_INVENTORY);
    this.storageService.removeItem(this.QUEUE_KEY_EXPENSES);
    this.updateQueuedCount();
  }

  private updateQueuedCount(): void {
    const total = this.ordersQueue.length + this.inventoryQueue.length + this.expensesQueue.length;
    this.queuedCountSubject.next(total);
  }
}
