import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Order } from '../models/order.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private readonly QUEUE_KEY = 'orderrestro_offline_orders_queue_v1';

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

  getQueuedOrders(): Order[] {
    try {
      const data = localStorage.getItem(this.QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  queueOrder(order: Order): void {
    const queue = this.getQueuedOrders();
    const offlineOrder: Order = {
      ...order,
      special_notes: (order.special_notes ? order.special_notes + ' ' : '') + '[SAVED OFFLINE]'
    };
    queue.push(offlineOrder);
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
      this.updateQueuedCount();
      console.warn(`📦 [OfflineSync] Order #${order.order_number} safely preserved in offline storage.`);
    } catch (e) {
      console.error('Failed to save offline order to localStorage', e);
    }
  }

  /**
   * Real Supabase cloud sync engine for offline-queued orders
   */
  async autoSync(): Promise<number> {
    const queue = this.getQueuedOrders();
    if (queue.length === 0) return 0;

    const client = this.supabaseService.client;
    if (!client) {
      console.log('ℹ️ [OfflineSync] Supabase client not ready yet. Retrying in background...');
      return 0;
    }

    this.isSyncingSubject.next(true);
    console.log(`⚡ [OfflineSync] Syncing ${queue.length} offline orders to Supabase Cloud...`);

    let successfullySynced = 0;
    const remainingQueue: Order[] = [];

    for (const order of queue) {
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
          remainingQueue.push(order);
        }
      } catch (err) {
        console.error(`Sync error for order #${order.order_number}:`, err);
        remainingQueue.push(order);
      }
    }

    try {
      if (remainingQueue.length > 0) {
        localStorage.setItem(this.QUEUE_KEY, JSON.stringify(remainingQueue));
      } else {
        localStorage.removeItem(this.QUEUE_KEY);
      }
      this.updateQueuedCount();
    } catch {}

    this.isSyncingSubject.next(false);
    console.log(`✅ [OfflineSync] Successfully synced ${successfullySynced} orders to Cloud.`);
    return successfullySynced;
  }

  clearQueue(): void {
    localStorage.removeItem(this.QUEUE_KEY);
    this.updateQueuedCount();
  }

  private updateQueuedCount(): void {
    this.queuedCountSubject.next(this.getQueuedOrders().length);
  }
}
