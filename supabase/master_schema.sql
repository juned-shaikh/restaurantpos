-- ==============================================================================
-- RESTAURANT POS & ERP: COMPLETE CLOUD SUPABASE MASTER SCHEMA
-- Multi-Tenant Architecture for Cafe / Restaurant POS & Operations
-- Run this in your Supabase Dashboard -> SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. FLOORS / SECTIONS TABLE
CREATE TABLE IF NOT EXISTS public.floors (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    name TEXT NOT NULL,
    display_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DINE-IN RESTAURANT TABLES
CREATE TABLE IF NOT EXISTS public.tables (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    floor_id TEXT NOT NULL DEFAULT 'floor-01',
    table_number TEXT NOT NULL,
    capacity INT NOT NULL DEFAULT 4,
    shape TEXT NOT NULL DEFAULT 'RECTANGLE', -- 'RECTANGLE', 'SQUARE', 'ROUND'
    pos_x NUMERIC NOT NULL DEFAULT 10,
    pos_y NUMERIC NOT NULL DEFAULT 10,
    width NUMERIC NOT NULL DEFAULT 120,
    height NUMERIC NOT NULL DEFAULT 90,
    status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILL_REQUESTED'
    qr_token TEXT,
    current_order_id TEXT,
    current_bill_amount NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. MENU CATEGORIES
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon_name TEXT DEFAULT 'coffee',
    display_order INT DEFAULT 1,
    kitchen_station_id TEXT DEFAULT 'st-01',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. MENU ITEMS (DISHES & DRINKS)
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    category_id TEXT NOT NULL,
    category_name TEXT,
    kitchen_station_id TEXT DEFAULT 'st-01',
    name TEXT NOT NULL,
    short_code TEXT,
    description TEXT,
    price NUMERIC NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    tax_rate NUMERIC DEFAULT 5.0,
    is_veg BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    prep_time_mins INT DEFAULT 10,
    display_order INT DEFAULT 1,
    is_combo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ORDERS & BILLING TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    order_number TEXT NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'DINE_IN', -- 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'QR_ORDER'
    table_id TEXT,
    table_number TEXT,
    customer_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    server_name TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_KITCHEN', 'READY', 'SERVED', 'SETTLED', 'CANCELLED'
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_pct NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    taxable_amount NUMERIC NOT NULL DEFAULT 0,
    cgst_amount NUMERIC NOT NULL DEFAULT 0,
    sgst_amount NUMERIC NOT NULL DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    payments JSONB DEFAULT '[]'::jsonb,
    is_settled BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ,
    special_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. KITCHEN DISPLAY TICKETS (KOT)
CREATE TABLE IF NOT EXISTS public.kot_tickets (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    order_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    kot_number TEXT NOT NULL,
    kitchen_station_id TEXT DEFAULT 'st-01',
    kitchen_station_name TEXT,
    table_number TEXT NOT NULL DEFAULT 'Counter',
    order_type TEXT NOT NULL DEFAULT 'DINE_IN',
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PREPARING', 'READY', 'SERVED', 'BUMPED'
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    prep_started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. OPERATIONAL EXPENSES
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

-- 8. DAY-END CASH DRAWER CLOSINGS
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

-- 9. INVENTORY RAW ITEMS & STOCK
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    uom TEXT NOT NULL, -- 'KG', 'L', 'UNITS', 'GM', 'ML'
    current_stock NUMERIC NOT NULL DEFAULT 0,
    reorder_level NUMERIC NOT NULL DEFAULT 10,
    avg_unit_cost NUMERIC NOT NULL DEFAULT 0,
    is_low_stock BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. CRM CUSTOMERS & LOYALTY
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    total_spent NUMERIC DEFAULT 0,
    visit_count INT DEFAULT 1,
    loyalty_points INT DEFAULT 0,
    referral_code TEXT,
    membership_tier TEXT DEFAULT 'SILVER', -- 'SILVER', 'GOLD', 'PLATINUM'
    last_visit_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. CUSTOMER FEEDBACK
CREATE TABLE IF NOT EXISTS public.customer_feedback (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    customer_name TEXT,
    phone TEXT,
    rating INT NOT NULL DEFAULT 5,
    food_rating INT DEFAULT 5,
    service_rating INT DEFAULT 5,
    ambience_rating INT DEFAULT 5,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. SAAS MULTI-TENANT ORGANIZATIONS (CAFE CLIENTS)
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT,
    tier TEXT DEFAULT 'GROWTH',
    subscription_status TEXT DEFAULT 'ACTIVE',
    trial_ends_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,
    max_branches INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    active_outlets INT DEFAULT 1,
    monthly_revenue NUMERIC DEFAULT 0,
    city TEXT DEFAULT 'Mumbai',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. APP USERS & STAFF ACCOUNTS (AUTHENTICATION)
CREATE TABLE IF NOT EXISTS public.app_users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
    branch_id TEXT DEFAULT 'branch-01',
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'WAITER',
    password TEXT,
    manager_pin TEXT DEFAULT '9999',
    hourly_rate NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR INSTANT DEMO & TESTING
-- ==============================================================================
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted CRUD on public demo schema
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['floors', 'tables', 'menu_categories', 'menu_items', 'orders', 'kot_tickets', 'expenses', 'cash_closings', 'inventory_items', 'customers', 'customer_feedback', 'organizations', 'app_users']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public access on %I" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Public access on %I" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- REALTIME BROADCASTING REPLICATION (SAFE & IDEMPOTENT)
-- ==============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'floors', 'tables', 'menu_categories', 'menu_items', 
    'orders', 'kot_tickets', 'expenses', 'cash_closings', 
    'inventory_items', 'customers', 'customer_feedback',
    'organizations', 'app_users'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
    END IF;
  END LOOP;
END $$;
