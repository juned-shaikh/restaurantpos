// ==============================================================================
// MENU MANAGEMENT MODELS
// ==============================================================================

export interface ModifierOption {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  is_available: boolean;
  display_order: number;
}

export interface ModifierGroup {
  id: string;
  organization_id: string;
  name: string;
  min_selection: number;
  max_selection: number;
  is_required: boolean;
  options: ModifierOption[];
}

export interface MenuCategory {
  id: string;
  organization_id: string;
  branch_id?: string;
  name: string;
  slug: string;
  icon_name?: string;
  image_url?: string;
  display_order: number;
  kitchen_station_id?: string;
  is_active: boolean;
  item_count?: number;
}

export interface MenuItem {
  id: string;
  organization_id: string;
  branch_id?: string;
  category_id: string;
  category_name?: string;
  kitchen_station_id?: string;
  kitchen_station_name?: string;
  name: string;
  short_code?: string;
  description?: string;
  price: number;
  cost_price: number;
  tax_rate: number;
  is_veg: boolean;
  is_available: boolean;
  image_url?: string;
  prep_time_mins: number;
  display_order: number;
  is_combo: boolean;
  modifier_groups?: ModifierGroup[];
  created_at?: string;
}

export interface ComboItemSelection {
  id: string;
  group_name: string; // e.g. "Pick 1 Drink", "Pick 1 Side"
  min_select: number;
  max_select: number;
  allowed_items: {
    menu_item_id: string;
    name: string;
    extra_charge: number;
  }[];
}

export interface ComboMenu {
  id: string;
  menu_item_id: string;
  name: string;
  base_price: number;
  selections: ComboItemSelection[];
}

