// ==============================================================================
// INVENTORY, RECIPE COSTING & WASTE MODELS
// ==============================================================================

export type UnitOfMeasure = 'KG' | 'G' | 'L' | 'ML' | 'PCS' | 'PORTION';

export interface InventoryItem {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string; // e.g. "Espresso Roast Beans", "Full Cream Milk", "Chocolate Syrup"
  sku: string;
  uom: UnitOfMeasure;
  current_stock: number;
  reorder_level: number;
  avg_unit_cost: number;
  is_low_stock?: boolean;
  is_active: boolean;
  created_at: string;
}

export interface RecipeIngredient {
  id?: string;
  inventory_item_id: string;
  inventory_item_name?: string;
  quantity_required: number;
  uom: UnitOfMeasure;
  unit_cost?: number;
  cost_contribution: number;
}

export interface Recipe {
  id: string;
  menu_item_id: string;
  menu_item_name?: string;
  yield_quantity: number;
  ingredients: RecipeIngredient[];
  total_recipe_cost: number;
  instructions?: string;
}

export interface StockBatch {
  id: string;
  inventory_item_id: string;
  inventory_item_name?: string;
  batch_number: string;
  initial_quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  expiry_date?: string;
  received_date: string;
}

export interface WasteLog {
  id: string;
  organization_id: string;
  branch_id: string;
  inventory_item_id: string;
  inventory_item_name?: string;
  quantity_wasted: number;
  uom: UnitOfMeasure;
  unit_cost: number;
  total_loss_cost: number;
  reason: 'EXPIRED' | 'SPILLAGE' | 'BURNT' | 'QUALITY_ISSUE' | 'OTHER';
  logged_by_user_id?: string;
  logged_by_name?: string;
  created_at: string;
}

