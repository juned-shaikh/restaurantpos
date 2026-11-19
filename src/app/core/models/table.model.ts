// ==============================================================================
// TABLE & FLOOR MANAGEMENT MODELS
// ==============================================================================

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';
export type TableShape = 'SQUARE' | 'ROUND' | 'RECTANGLE';

export interface Floor {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  tables?: Table[];
}

export interface Table {
  id: string;
  organization_id: string;
  branch_id: string;
  floor_id: string;
  table_number: string;
  capacity: number;
  shape: TableShape;
  pos_x: number; // Designer coordinate (X%)
  pos_y: number; // Designer coordinate (Y%)
  width: number;
  height: number;
  status: TableStatus;
  qr_token: string;
  current_order_id?: string;
  active_bill_amount?: number;
  current_bill_amount?: number;
  seated_at?: string;
  server_name?: string;
  is_active: boolean;
}

export interface WaitlistEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_name: string;
  phone: string;
  party_size: number;
  floor_preference_id?: string;
  status: 'WAITING' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
  notes?: string;
  estimated_wait_mins: number;
  created_at: string;
}

export interface Reservation {
  id: string;
  organization_id: string;
  branch_id: string;
  table_id?: string;
  table_number?: string;
  customer_name: string;
  phone: string;
  party_size: number;
  reservation_time: string;
  status: 'CONFIRMED' | 'ARRIVED' | 'CANCELLED' | 'NO_SHOW';
  special_requests?: string;
  created_at: string;
}

export interface TableTransferRequest {
  fromTableId: string;
  toTableId: string;
  orderId: string;
  reason?: string;
}

