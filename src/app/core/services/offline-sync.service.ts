import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Order } from '../models/order.model';
import { Expense } from '../models/finance.model';
import { SupabaseService } from './supabase.service';

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

  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();

  private queuedCountSubject = new BehaviorSubject<number>(0);
  queuedCount$: Observable<number> = this.queuedCountSubject.asObservable();

  private isSyncingSubject = new BehaviorSubject<boolean>(false);
  isSyncing$: Observable<boolean> = this.isSyncingSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.updateQueuedCount();

    window.addEventListener('online', () => {
      console.log('🌐 [Network] Device is back ONLINE.');
      this.isOnlineSubject.next(true);
      this.autoSync();
    });

    window.addEventListener('offline', () => {
      console.warn('⚠️ [Network] Device is OFFLINE. Offline-First queue active.');
      this.isOnlineSubject.next(false);
    });
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  get queuedCount(): number {
    return this.queuedCountSubject.value;
  }

  // --- Orders Queue ---
  getQueuedOrders(): Order[] {
    try {
      const data = localStorage.getItem(this.QUEUE_KEY_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  queueOrder(order: Order): void {
    const queue = this.getQueuedOrders();
    const existingIdx = queue.findIndex(o => o.id === order.id);
    const offlineOrder: Order = {
      ...order,
      special_notes: (order.special_notes ? order.special_notes + ' ' : '') + '[SAVED OFFLINE]'
    };
    if (existingIdx >= 0) {
      queue[existingIdx] = offlineOrder;
    } else {
      queue.push(offlineOrder);
    }
    try {
      localStorage.setItem(this.QUEUE_KEY_ORDERS, JSON.stringify(queue));
      this.updateQueuedCount();
      console.warn(`📦 [OfflineSync] Order #${order.order_number} safely preserved in offline storage.`);
    } catch (e) {
      console.error('Failed to save offline order to localStorage', e);
    }
  }

  // --- Inventory Queue ---
  getQueuedInventory(): OfflineInventoryUpdate[] {
    try {
      const data = localStorage.getItem(this.QUEUE_KEY_INVENTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  queueInventoryUpdate(itemId: string, currentStock: number, isLowStock?: boolean, avgUnitCost?: number): void {
    const queue = this.getQueuedInventory();
    const existingIdx = queue.findIndex(i => i.id === itemId);
    const itemUpdate: OfflineInventoryUpdate = {
      id: itemId,
      current_stock: currentStock,
      is_low_stock: !!isLowStock,
      avg_unit_cost: avgUnitCost,
      updated_at: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      queue[existingIdx] = itemUpdate;
    } else {
      queue.push(itemUpdate);
    }
    try {
      localStorage.setItem(this.QUEUE_KEY_INVENTORY, JSON.stringify(queue));
      this.updateQueuedCount();
      console.warn(`📦 [OfflineSync] Inventory item ${itemId} stock update preserved in offline storage.`);
    } catch (e) {
      console.error('Failed to save offline inventory update to localStorage', e);
    }
  }

  // --- Expenses Queue ---
  getQueuedExpenses(): Expense[] {
    try {
      const data = localStorage.getItem(this.QUEUE_KEY_EXPENSES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  queueExpense(expense: Expense): void {
    const queue = this.getQueuedExpenses();
    const existingIdx = queue.findIndex(e => e.id === expense.id);
    if (existingIdx >= 0) {
      queue[existingIdx] = expense;
    } else {
      queue.push(expense);
    }
    try {
      localStorage.setItem(this.QUEUE_KEY_EXPENSES, JSON.stringify(queue));
      this.updateQueuedCount();
      console.warn(`📦 [OfflineSync] Expense ${expense.id} preserved in offline storage.`);
    } catch (e) {
      console.error('Failed to save offline expense to localStorage', e);
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
    const orderQueue = this.getQueuedOrders();
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

      try {
        if (remainingOrders.length > 0) {
          localStorage.setItem(this.QUEUE_KEY_ORDERS, JSON.stringify(remainingOrders));
        } else {
          localStorage.removeItem(this.QUEUE_KEY_ORDERS);
        }
      } catch {}
    }

    // 2. Sync Inventory Updates
    const invQueue = this.getQueuedInventory();
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

      try {
        if (remainingInv.length > 0) {
          localStorage.setItem(this.QUEUE_KEY_INVENTORY, JSON.stringify(remainingInv));
        } else {
          localStorage.removeItem(this.QUEUE_KEY_INVENTORY);
        }
      } catch {}
    }

    // 3. Sync Expenses
    const expQueue = this.getQueuedExpenses();
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

      try {
        if (remainingExp.length > 0) {
          localStorage.setItem(this.QUEUE_KEY_EXPENSES, JSON.stringify(remainingExp));
        } else {
          localStorage.removeItem(this.QUEUE_KEY_EXPENSES);
        }
      } catch {}
    }

    this.updateQueuedCount();
    this.isSyncingSubject.next(false);
    console.log(`✅ [OfflineSync] Auto-sync complete. Synced items: ${successfullySynced}`);
    return successfullySynced;
  }

  clearQueue(): void {
    localStorage.removeItem(this.QUEUE_KEY_ORDERS);
    localStorage.removeItem(this.QUEUE_KEY_INVENTORY);
    localStorage.removeItem(this.QUEUE_KEY_EXPENSES);
    this.updateQueuedCount();
  }

  private updateQueuedCount(): void {
    const total = this.getQueuedOrders().length + this.getQueuedInventory().length + this.getQueuedExpenses().length;
    this.queuedCountSubject.next(total);
  }
}
