-- ==============================================================================
-- RESTAURANT POS & ERP: ACCOUNTING, EXPENSES & CASH CLOSING SCHEMA
-- Run this in your Supabase Dashboard -> SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Operational Expenses Ledger Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    category_name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    payment_mode TEXT NOT NULL DEFAULT 'CASH', -- 'CASH', 'UPI', 'NEFT'
    paid_to TEXT NOT NULL,
    bill_receipt_url TEXT,
    description TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by_name TEXT DEFAULT 'Cashier',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Day-End Cash Drawer Closings Table
CREATE TABLE IF NOT EXISTS public.cash_closings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    closed_by_name TEXT NOT NULL,
    closing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    opening_drawer_cash NUMERIC NOT NULL DEFAULT 5000,
    cash_sales_collected NUMERIC NOT NULL DEFAULT 0,
    petty_cash_expenses NUMERIC NOT NULL DEFAULT 0,
    cash_refunds NUMERIC NOT NULL DEFAULT 0,
    expected_drawer_cash NUMERIC NOT NULL DEFAULT 0,
    actual_counted_cash NUMERIC NOT NULL DEFAULT 0,
    variance_amount NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    verified_by_manager BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Monthly Budgets Table
CREATE TABLE IF NOT EXISTS public.budgets (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    category_name TEXT NOT NULL,
    month_year TEXT NOT NULL, -- e.g. '2026-11'
    budget_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Public Policies for Demo/Testing
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Allow public insert on expenses" ON public.expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on expenses" ON public.expenses FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on expenses" ON public.expenses FOR DELETE USING (true);

CREATE POLICY "Allow public select on cash_closings" ON public.cash_closings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on cash_closings" ON public.cash_closings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on cash_closings" ON public.cash_closings FOR UPDATE USING (true);

CREATE POLICY "Allow public select on budgets" ON public.budgets FOR SELECT USING (true);
CREATE POLICY "Allow public insert on budgets" ON public.budgets FOR INSERT WITH CHECK (true);

-- Enable Realtime broadcasting on accounting tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_closings;

