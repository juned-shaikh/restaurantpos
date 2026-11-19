// ==============================================================================
// KITCHEN MANAGEMENT (KDS) & KOT MODELS
// ==============================================================================

import { OrderType } from './order.model';

export type KotStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'BUMPED';

export interface KitchenStation {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string; // e.g. "Main Kitchen", "Coffee Bar", "Grill", "Bakery / Desserts"
  code: string;
  color_code: string;
  is_active: boolean;
}

export interface KotItem {
  id: string;
  kot_ticket_id: string;
  order_item_id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  modifiers_summary?: string;
  is_struck_through: boolean;
  notes?: string;
  created_at: string;
}

export interface KotTicket {
  id: string;
  organization_id: string;
  branch_id: string;
  order_id: string;
  order_number: string;
  kitchen_station_id?: string;
  kitchen_station_name?: string;
  kot_number: string;
  table_number: string;
  order_type: OrderType;
  status: KotStatus;
  items: KotItem[];
  is_reprint?: boolean;
  elapsed_mins?: number; // Computed in frontend for color badges
  prep_started_at?: string;
  ready_at?: string;
  bumped_at?: string;
  created_at: string;
}

export interface KdsPerformanceMetric {
  station_name: string;
  total_kots: number;
  avg_prep_time_mins: number;
  fastest_ticket_mins: number;
  slowest_ticket_mins: number;
  late_tickets_count: number; // Tickets taking > 20 mins
}

