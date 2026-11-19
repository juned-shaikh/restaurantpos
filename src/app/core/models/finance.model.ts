// ==============================================================================
// ACCOUNTING, EXPENSES & CASH CLOSING MODELS
// ==============================================================================

export interface CashClosing {
  id: string;
  organization_id: string;
  branch_id: string;
  closed_by_name: string;
  closing_date: string;
  
  opening_drawer_cash: number;
  cash_sales_collected: number;
  petty_cash_expenses: number;
  cash_refunds: number;
  
  expected_drawer_cash: number; // opening + sales - expenses - refunds
  actual_counted_cash: number;
  variance_amount: number;       // actual - expected (negative indicates shortage)
  
  notes?: string;
  verified_by_manager: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  organization_id: string;
  branch_id: string;
  category_name: string;
  amount: number;
  payment_mode: string;
  paid_to: string;
  bill_receipt_url?: string;
  description: string;
  expense_date: string;
  recorded_by_name?: string;
}

export interface MonthlyBudget {
  id: string;
  category_name: string;
  month_year: string; // e.g. "2026-11"
  budget_amount: number;
  actual_spent: number;
  variance_amount: number;
  utilization_pct: number;
}

export interface ProfitAndLossSummary {
  period: string;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  cost_of_goods_sold: number; // Raw ingredients used
  gross_profit: number;
  gross_margin_pct: number;
  
  operating_expenses: {
    category: string;
    amount: number;
  }[];
  total_expenses: number;
  staff_payroll: number;
  net_profit_before_tax: number;
  net_profit_margin_pct: number;
}

export interface TaxReportSummary {
  tax_slab: string; // e.g. "GST 5% (2.5% CGST + 2.5% SGST)"
  taxable_sales: number;
  cgst_collected: number;
  sgst_collected: number;
  total_tax_liability: number;
}

