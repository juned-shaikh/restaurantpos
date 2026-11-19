// ==============================================================================
// ORDERS, BILLING & PAYMENT MODELS
// ==============================================================================

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'QR_ORDER' | 'SCHEDULED';
export type OrderStatus = 'OPEN' | 'IN_KITCHEN' | 'READY' | 'SERVED' | 'SETTLED' | 'CANCELLED';
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'SPLIT' | 'LOYALTY_POINTS';

export interface OrderItemModifier {
  id?: string;
  modifier_option_id?: string;
  name: string;
  price_adjustment: number;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_veg?: boolean;
  notes?: string;
  modifiers: OrderItemModifier[];
  kitchen_station_id?: string;
  is_sent_to_kitchen?: boolean;
}

export interface PaymentRecord {
  id?: string;
  order_id: string;
  payment_mode: PaymentMode;
  amount: number;
  transaction_ref?: string;
  received_by_user_id?: string;
  created_at?: string;
}

export interface Order {
  id: string;
  organization_id: string;
  branch_id: string;
  order_number: string;
  order_type: OrderType;
  table_id?: string;
  table_number?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  server_user_id?: string;
  server_name?: string;
  status: OrderStatus;
  
  items: OrderItem[];
  
  // Tax & Currency Breakdown
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  round_off: number;
  total_amount: number;
  grand_total?: number;
  payment_mode?: PaymentMode;
  discount_approved_by?: string;
  
  payments?: PaymentRecord[];
  is_settled: boolean;
  special_notes?: string;
  notes?: string;
  settled_at?: string;
  created_at: string;
}

export interface GuestRequest {
  id: string;
  organization_id: string;
  branch_id: string;
  table_id: string;
  table_number: string;
  request_type: 'CALL_WAITER' | 'REQUEST_BILL' | 'WATER' | 'CUSTOM';
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
  notes?: string;
  created_at: string;
}

