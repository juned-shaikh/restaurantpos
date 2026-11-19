// Core Data Models for Restaurant POS & ERP

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'QR_ONLINE';
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';
export type KotStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'LOYALTY_POINTS';

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  taxRate: number; // e.g. 5% GST
  isVeg: boolean;
  imageUrl?: string;
  isAvailable: boolean;
  modifierGroups?: ModifierGroup[];
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  sortOrder: number;
}

export interface Table {
  id: string;
  tableNumber: string;
  floorId: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  activeBillAmount?: number;
}

export interface Floor {
  id: string;
  name: string;
}

export interface CartItemModifier {
  optionId: string;
  name: string;
  priceDelta: number;
}

export interface CartItem {
  cartItemId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: CartItemModifier[];
  itemNote?: string;
  unitPriceWithModifiers: number;
  lineTotal: number;
  kotStatus?: KotStatus;
}

export interface Order {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  tableId?: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  taxAmount: number;
  discountAmount: number;
  discountReason?: string;
  roundOff: number;
  grandTotal: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  serverName: string;
}

export interface KotTicket {
  id: string;
  ticketNumber: number;
  orderId: string;
  tableNumber?: string;
  serverName: string;
  station: 'MAIN_KITCHEN' | 'GRILL' | 'BAR' | 'DESSERT';
  status: KotStatus;
  items: {
    name: string;
    quantity: number;
    notes?: string;
    modifiers?: string;
  }[];
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
}
