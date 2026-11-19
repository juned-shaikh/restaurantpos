// ==============================================================================
// PROCUREMENT & VENDOR MANAGEMENT MODELS
// ==============================================================================

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address?: string;
  gstin?: string;
  payment_terms_days: number;
  rating: number; // 1 to 5 stars
  total_spend?: number;
  is_active: boolean;
  created_at: string;
}

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id?: string;
  inventory_item_id: string;
  inventory_item_name?: string;
  ordered_qty: number;
  received_qty: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseOrder {
  id: string;
  organization_id: string;
  branch_id: string;
  supplier_id: string;
  supplier_name?: string;
  po_number: string;
  status: PoStatus;
  expected_delivery?: string;
  total_amount: number;
  items: PurchaseOrderItem[];
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

export interface GoodsReceiptNote {
  id: string;
  organization_id: string;
  branch_id: string;
  purchase_order_id?: string;
  supplier_id: string;
  supplier_name?: string;
  grn_number: string;
  supplier_invoice_no: string;
  received_date: string;
  total_value: number;
  received_by_name?: string;
}

export interface SupplierPayment {
  id: string;
  organization_id: string;
  branch_id: string;
  supplier_id: string;
  supplier_name: string;
  grn_id?: string;
  amount_paid: number;
  payment_mode: 'NEFT' | 'UPI' | 'CHEQUE' | 'CASH';
  reference_no: string;
  payment_date: string;
}

