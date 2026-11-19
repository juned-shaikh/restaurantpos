// ==============================================================================
// ANALYTICS & 18 REPORTING MODELS
// ==============================================================================

export interface LiveDashboardKPIs {
  today_sales: number;
  today_orders_count: number;
  active_tables_count: number;
  total_tables_count: number;
  occupancy_rate_pct: number;
  pending_kot_count: number;
  avg_prep_time_mins: number;
  cash_in_drawer: number;
  upi_sales_collected: number;
}

export interface PeakHourSlot {
  hour_label: string; // e.g. "08:00 - 09:00", "13:00 - 14:00"
  order_count: number;
  sales_amount: number;
  occupancy_intensity: number; // 0 to 100 for Heatmap
}

export interface ItemSalesVelocity {
  menu_item_id: string;
  item_name: string;
  category_name: string;
  quantity_sold: number;
  gross_revenue: number;
  ingredient_cost: number;
  gross_margin_pct: number;
  velocity_rank: number;
}

export interface CustomerRetentionMetric {
  total_registered_customers: number;
  new_customers_this_month: number;
  repeat_customers_pct: number;
  avg_spend_per_customer: number;
  points_redeemed_value: number;
}

