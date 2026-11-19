import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { KdsService } from './kds.service';
import { TableService } from './table.service';
import { OrderService } from './order.service';
import { SoundService } from './sound.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class RealtimeSyncService {
  private isListening = false;

  constructor(
    private supabaseService: SupabaseService,
    private kdsService: KdsService,
    private tableService: TableService,
    private orderService: OrderService,
    private soundService: SoundService,
    private tenantService: TenantService
  ) {}

  /**
   * Initializes real-time channels when Supabase credentials are connected
   */
  initRealtimeListeners(): void {
    if (!this.supabaseService.isConnected || this.isListening) return;
    this.isListening = true;

    const branchId = this.tenantService.activeBranch.id;

    // 1. Listen for new KOT Tickets in Kitchen
    this.supabaseService.subscribeToTableChanges(
      'kot_tickets',
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          console.log('⚡ [Realtime] New KOT Ticket received:', payload.new);
          this.soundService.playNewKotChime();
        }
      },
      `branch_id=eq.${branchId}`
    );

    // 2. Listen for Table status changes (Occupied, Bill Requested, Available)
    this.supabaseService.subscribeToTableChanges(
      'tables',
      (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          console.log('⚡ [Realtime] Table status updated:', payload.new);
          if (payload.new.status === 'BILL_REQUESTED') {
            this.soundService.playCallWaiterAlert();
          }
        }
      },
      `branch_id=eq.${branchId}`
    );

    // 3. Listen for Guest Table Requests (Call Waiter / Water)
    this.supabaseService.subscribeToTableChanges(
      'table_guest_requests',
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          console.log('⚡ [Realtime] Table Guest Request:', payload.new);
          this.soundService.playCallWaiterAlert();
        }
      },
      `branch_id=eq.${branchId}`
    );

    console.log('⚡ [Realtime] Subscribed to live channels for branch:', branchId);
  }
}

