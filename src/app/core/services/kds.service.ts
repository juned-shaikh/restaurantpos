import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { KotTicket, KitchenStation, KdsPerformanceMetric, KotStatus } from '../models/kds.model';
import { SoundService } from './sound.service';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class KdsService {
  private get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'default';
  }

  private get currentBranchId(): string {
    return this.tenantService?.activeBranch?.id || 'branch-01';
  }

  private stationsSubject = new BehaviorSubject<KitchenStation[]>([
    {
      id: 'st-01',
      organization_id: 'org-default',
      branch_id: 'branch-01',
      name: 'Coffee & Beverage Bar',
      code: 'BAR',
      color_code: '#0284C7', // Sky Blue
      is_active: true
    },
    {
      id: 'st-02',
      organization_id: 'org-default',
      branch_id: 'branch-01',
      name: 'Hot Kitchen & Grill',
      code: 'GRILL',
      color_code: '#EA580C', // Orange
      is_active: true
    },
    {
      id: 'st-03',
      organization_id: 'org-default',
      branch_id: 'branch-01',
      name: 'Bakery & Dessert Section',
      code: 'BAKERY',
      color_code: '#9333EA', // Purple
      is_active: true
    }
  ]);

  private ticketsSubject = new BehaviorSubject<KotTicket[]>([]);

  stations$: Observable<KitchenStation[]> = this.stationsSubject.asObservable();
  tickets$: Observable<KotTicket[]> = this.ticketsSubject.asObservable();

  private get STORAGE_KEY_TICKETS(): string {
    return `orderrestro_kot_tickets_v1_${this.currentOrgId}`;
  }

  constructor(
    private soundService: SoundService,
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadTicketsForOrg(org.id);
      }
    });
  }

  private initInitialState(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY_TICKETS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.ticketsSubject.next(parsed);
          return;
        }
      }
    } catch (e) {}
    this.ticketsSubject.next([]);
  }

  private persistTicketsLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_TICKETS, JSON.stringify(this.ticketsSubject.value));
    } catch (e) {}
  }

  private mapOrderToKotTicket(order: any): KotTicket {
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const kitchenItems = rawItems.filter((i: any) => i.is_sent_to_kitchen !== false);
    const itemsToUse = kitchenItems.length > 0 ? kitchenItems : rawItems;

    let ticketStatus: KotStatus = 'PENDING';
    if (order.status === 'PREPARING') ticketStatus = 'PREPARING';
    else if (order.status === 'READY') ticketStatus = 'READY';
    else if (order.status === 'SERVED' || order.status === 'SETTLED' || order.status === 'CANCELLED') ticketStatus = 'BUMPED';

    return {
      id: order.id,
      organization_id: order.organization_id || this.currentOrgId,
      branch_id: order.branch_id || this.currentBranchId,
      order_id: order.id,
      order_number: order.order_number || String(order.id).slice(-4),
      kot_number: `KOT-${order.order_number || String(order.id).slice(-4)}`,
      table_number: order.table_number || (order.order_type === 'TAKEAWAY' ? 'Takeaway' : 'Counter'),
      order_type: order.order_type || 'DINE_IN',
      status: ticketStatus,
      items: itemsToUse.map((it: any, idx: number) => ({
        id: it.id || `kot-item-${idx}`,
        kot_ticket_id: order.id,
        order_item_id: it.id || `oi-${idx}`,
        menu_item_id: it.menu_item_id || '',
        name: it.name || 'Dish',
        quantity: Number(it.quantity) || 1,
        modifiers_summary: it.modifiers?.map((m: any) => m.name).join(', ') || it.modifiers_summary || '',
        is_struck_through: !!it.is_struck_through,
        notes: it.notes || '',
        created_at: order.created_at || new Date().toISOString()
      })),
      created_at: order.created_at || new Date().toISOString()
    };
  }

  async loadTicketsForOrg(orgId: string): Promise<void> {
    this.initInitialState();
    if (!this.supabaseService.client) return;

    try {
      // 1. Fetch active kitchen orders directly from Supabase 'orders' table
      const { data: ordersData, error: ordersErr } = await this.supabaseService
        .from('orders')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['IN_KITCHEN', 'PREPARING', 'READY'])
        .order('created_at', { ascending: false });

      if (!ordersErr && ordersData && ordersData.length > 0) {
        console.log(`☁️ [KdsService] Loaded ${ordersData.length} live kitchen orders from Supabase orders table.`);
        const orderTickets = ordersData.map((o: any) => this.mapOrderToKotTicket(o));
        const orderIds = new Set(orderTickets.map(t => t.order_id || t.id));
        const remainingLocal = this.ticketsSubject.value.filter(t => !orderIds.has(t.order_id) && !orderIds.has(t.id));
        this.ticketsSubject.next([...orderTickets, ...remainingLocal]);
        this.persistTicketsLocally();
      }

      // 2. Also try fetching from kot_tickets if it exists (legacy / future schema)
      const { data: kotData, error: kotErr } = await this.supabaseService
        .from('kot_tickets')
        .select('*')
        .eq('organization_id', orgId)
        .neq('status', 'BUMPED')
        .order('created_at', { ascending: false });

      if (!kotErr && kotData && kotData.length > 0) {
        const existingIds = new Set(this.ticketsSubject.value.map(t => t.id));
        const newKot = kotData.filter((t: any) => !existingIds.has(t.id));
        if (newKot.length > 0) {
          this.ticketsSubject.next([...this.ticketsSubject.value, ...newKot]);
          this.persistTicketsLocally();
        }
      }
    } catch (e) {
      console.warn('⚠️ [KdsService] Notice loading kitchen tickets:', e);
    }
  }

  private async initSupabaseSync(): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (!client) {
        console.log('ℹ️ [KdsService] Supabase not connected. Operating in local mode.');
        return;
      }

      const orgId = this.tenantService.currentOrg?.id || this.currentOrgId;
      await this.loadTicketsForOrg(orgId);

      // Realtime subscription on 'orders' table (Cross-terminal Live Sync from Waiter to Chef!)
      this.supabaseService.subscribeToTableChanges('orders', (payload: any) => {
        const order = payload.new;
        if (!order) return;

        const currentOrg = this.tenantService.currentOrg?.id || this.currentOrgId;
        if (order.organization_id && order.organization_id !== currentOrg) {
          return;
        }

        if (payload.eventType === 'INSERT') {
          if (['IN_KITCHEN', 'PREPARING', 'READY', 'OPEN'].includes(order.status)) {
            const ticket = this.mapOrderToKotTicket(order);
            const exists = this.ticketsSubject.value.some(t => t.id === ticket.id || t.order_id === ticket.order_id);
            if (!exists) {
              console.log('⚡ [KDS Realtime] New live order received for kitchen:', order.order_number);
              this.ticketsSubject.next([ticket, ...this.ticketsSubject.value]);
              this.persistTicketsLocally();
              this.soundService.playNewKotChime();
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          if (['SETTLED', 'CANCELLED', 'SERVED'].includes(order.status)) {
            // Remove bumped / served / settled order from kitchen Kanban
            this.ticketsSubject.next(this.ticketsSubject.value.filter(t => t.id !== order.id && t.order_id !== order.id));
            this.persistTicketsLocally();
          } else if (['IN_KITCHEN', 'PREPARING', 'READY'].includes(order.status)) {
            const updatedTicket = this.mapOrderToKotTicket(order);
            const exists = this.ticketsSubject.value.some(t => t.id === order.id || t.order_id === order.id);
            if (exists) {
              this.ticketsSubject.next(this.ticketsSubject.value.map(t => (t.id === order.id || t.order_id === order.id) ? updatedTicket : t));
            } else {
              this.ticketsSubject.next([updatedTicket, ...this.ticketsSubject.value]);
              this.soundService.playNewKotChime();
            }
            this.persistTicketsLocally();
          }
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          this.ticketsSubject.next(this.ticketsSubject.value.filter(t => t.id !== payload.old.id && t.order_id !== payload.old.id));
          this.persistTicketsLocally();
        }
      });

      // Also listen to 'kot_tickets' in case it's created or used
      this.supabaseService.subscribeToTableChanges('kot_tickets', (payload: any) => {
        const ticket = payload.new as KotTicket;
        if (!ticket) return;

        const currentOrg = this.tenantService.currentOrg?.id || this.currentOrgId;
        if (currentOrg && ticket.organization_id && ticket.organization_id !== currentOrg) {
          return;
        }

        if (payload.eventType === 'INSERT') {
          if (!this.ticketsSubject.value.some(t => t.id === ticket.id)) {
            this.ticketsSubject.next([ticket, ...this.ticketsSubject.value]);
            this.persistTicketsLocally();
            this.soundService.playNewKotChime();
          }
        } else if (payload.eventType === 'UPDATE') {
          if (ticket.status === 'BUMPED') {
            this.ticketsSubject.next(this.ticketsSubject.value.filter(t => t.id !== ticket.id));
          } else {
            this.ticketsSubject.next(this.ticketsSubject.value.map(t => t.id === ticket.id ? { ...t, ...ticket } : t));
          }
          this.persistTicketsLocally();
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          this.ticketsSubject.next(this.ticketsSubject.value.filter(t => t.id !== payload.old.id));
          this.persistTicketsLocally();
        }
      });
    } catch (err) {
      console.warn('⚠️ [KdsService] Supabase sync notice:', err);
    }
  }

  private async saveTicketToSupabase(ticket: KotTicket): Promise<void> {
    try {
      if (this.supabaseService.client) {
        await this.supabaseService.from('kot_tickets').upsert({
          id: ticket.id,
          organization_id: ticket.organization_id || this.currentOrgId,
          branch_id: ticket.branch_id || this.currentBranchId,
          order_id: ticket.order_id,
          order_number: ticket.order_number,
          kot_number: ticket.kot_number,
          kitchen_station_id: ticket.kitchen_station_id || 'st-01',
          kitchen_station_name: ticket.kitchen_station_name || '',
          table_number: ticket.table_number || 'Counter',
          order_type: ticket.order_type || 'DINE_IN',
          status: ticket.status,
          items: ticket.items,
          prep_started_at: ticket.prep_started_at || null,
          ready_at: ticket.ready_at || null,
          created_at: ticket.created_at || new Date().toISOString()
        });
      }
    } catch (e) {}
  }

  private async updateTicketInSupabase(ticketId: string, fields: Partial<KotTicket>): Promise<void> {
    try {
      if (this.supabaseService.client) {
        await this.supabaseService.from('kot_tickets').update(fields).eq('id', ticketId);
      }
    } catch (e) {}
  }

  private async updateOrderInSupabaseKitchen(orderId: string, status: string, items?: any[]): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) return;
    try {
      const payload: any = { status };
      if (items) {
        payload.items = items;
      }
      await this.supabaseService.from('orders').update(payload).eq('id', orderId);
      console.log(`☁️ [KdsService] Updated order ${orderId} status to ${status} in Supabase orders.`);
    } catch (e) {}
  }

  get tickets(): KotTicket[] {
    return this.ticketsSubject.value;
  }

  createTicket(ticket: Omit<KotTicket, 'id' | 'created_at'>): void {
    const newTicket: KotTicket = {
      ...ticket,
      id: ticket.order_id || `kot-${Date.now()}`,
      organization_id: ticket.organization_id || this.currentOrgId,
      branch_id: ticket.branch_id || this.currentBranchId,
      created_at: new Date().toISOString()
    };
    
    // Check if ticket already exists
    const existing = this.ticketsSubject.value;
    const idx = existing.findIndex(t => t.id === newTicket.id || (t.order_id && t.order_id === newTicket.order_id));
    if (idx >= 0) {
      const updated = [...existing];
      updated[idx] = { ...updated[idx], ...newTicket };
      this.ticketsSubject.next(updated);
    } else {
      this.ticketsSubject.next([newTicket, ...existing]);
    }
    
    this.persistTicketsLocally();
    this.saveTicketToSupabase(newTicket);
    this.soundService.playNewKotChime();
  }

  toggleItemStrikeThrough(ticketId: string, itemId: string): void {
    let updatedTicket: KotTicket | undefined;
    const updated = this.tickets.map(t => {
      if (t.id === ticketId || t.order_id === ticketId) {
        updatedTicket = {
          ...t,
          items: t.items.map(item => item.id === itemId ? { ...item, is_struck_through: !item.is_struck_through } : item)
        };
        return updatedTicket;
      }
      return t;
    });
    this.ticketsSubject.next(updated);
    this.persistTicketsLocally();
    if (updatedTicket) {
      this.updateTicketInSupabase(ticketId, { items: updatedTicket.items });
      const targetOrderId = updatedTicket.order_id || updatedTicket.id;
      this.updateOrderInSupabaseKitchen(
        targetOrderId,
        updatedTicket.status === 'READY' ? 'READY' : (updatedTicket.status === 'PREPARING' ? 'PREPARING' : 'IN_KITCHEN'),
        updatedTicket.items
      );
    }
  }

  advanceTicketStatus(ticketId: string): void {
    let updatedFields: Partial<KotTicket> = {};
    let targetOrderId: string = ticketId;
    let targetItems: any[] | undefined;

    const updated = this.tickets.map(t => {
      if (t.id === ticketId || t.order_id === ticketId) {
        targetOrderId = t.order_id || t.id;
        targetItems = t.items;
        if (t.status === 'PENDING') {
          updatedFields = { status: 'PREPARING' as const, prep_started_at: new Date().toISOString() };
          return { ...t, ...updatedFields };
        } else if (t.status === 'PREPARING') {
          updatedFields = { status: 'READY' as const, ready_at: new Date().toISOString() };
          return { ...t, ...updatedFields };
        } else if (t.status === 'READY') {
          updatedFields = { status: 'SERVED' as const, bumped_at: new Date().toISOString() };
          return { ...t, ...updatedFields };
        }
      }
      return t;
    });

    this.ticketsSubject.next(updated);
    this.persistTicketsLocally();

    if (Object.keys(updatedFields).length > 0) {
      this.updateTicketInSupabase(ticketId, updatedFields);
      const dbStatus = updatedFields.status === 'READY' ? 'READY' : (updatedFields.status === 'PREPARING' ? 'PREPARING' : 'SERVED');
      this.updateOrderInSupabaseKitchen(targetOrderId, dbStatus);
    }
  }

  bumpTicket(ticketId: string): void {
    let targetOrderId = ticketId;
    const ticket = this.tickets.find(t => t.id === ticketId || t.order_id === ticketId);
    if (ticket) targetOrderId = ticket.order_id || ticket.id;

    const updated = this.tickets.map(t => (t.id === ticketId || t.order_id === ticketId) ? { ...t, status: 'BUMPED' as const, bumped_at: new Date().toISOString() } : t);
    this.ticketsSubject.next(updated.filter(t => t.status !== 'BUMPED'));
    this.persistTicketsLocally();

    this.updateTicketInSupabase(ticketId, { status: 'BUMPED', bumped_at: new Date().toISOString() });
    this.updateOrderInSupabaseKitchen(targetOrderId, 'SERVED');
  }

  getStationPerformanceMetrics(): KdsPerformanceMetric[] {
    const currentTickets = this.ticketsSubject.value;
    const stations = this.stationsSubject.value;

    return stations.map(station => {
      const stationTickets = currentTickets.filter(t => t.kitchen_station_id === station.id || t.kitchen_station_name === station.name);
      return {
        station_name: station.name,
        total_kots: stationTickets.length,
        avg_prep_time_mins: stationTickets.length > 0 ? 8.5 : 0,
        fastest_ticket_mins: stationTickets.length > 0 ? 3.0 : 0,
        slowest_ticket_mins: stationTickets.length > 0 ? 15.0 : 0,
        late_tickets_count: stationTickets.filter(t => t.status === 'PENDING' || t.status === 'PREPARING').length
      };
    });
  }
}

