-- ==============================================================================
-- RESTAURANT POS & ERP SAAS — MASTER ENTERPRISE SUPABASE SCHEMA
-- Run this script in Supabase Dashboard -> SQL Editor
-- Sets up complete multi-tenant persistence, realtime channels & security
-- ==============================================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. MASTER APP USERS & ROLES
CREATE TABLE IF NOT EXISTS public.app_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  password TEXT DEFAULT 'Owner@123',
  role TEXT NOT NULL DEFAULT 'CASHIER', -- 'SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_CHEF'
  manager_pin TEXT DEFAULT '9999',      -- 4-Digit Security Override PIN
  hourly_rate NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure password column exists if table was previously created
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password TEXT DEFAULT 'Owner@123';
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. MENU CATEGORIES & DISHES
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  name TEXT NOT NULL,
  slug TEXT,
  icon_name TEXT DEFAULT 'restaurant-line',
  display_order INT DEFAULT 1,
  kitchen_station_id TEXT DEFAULT 'st-01',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  category_id TEXT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  category_name TEXT,
  kitchen_station_id TEXT DEFAULT 'st-01',
  name TEXT NOT NULL,
  short_code TEXT,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  tax_rate NUMERIC(5, 2) DEFAULT 5.0,
  is_veg BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  image_url TEXT,
  prep_time_mins INT DEFAULT 10,
  display_order INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FLOORS & SEATING TABLES
CREATE TABLE IF NOT EXISTS public.floors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  name TEXT NOT NULL,
  display_order INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tables (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  floor_id TEXT NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 4,
  shape TEXT DEFAULT 'SQUARE', -- 'SQUARE', 'RECTANGLE', 'ROUND'
  pos_x NUMERIC(6, 2) DEFAULT 10,
  pos_y NUMERIC(6, 2) DEFAULT 10,
  width NUMERIC(6, 2) DEFAULT 90,
  height NUMERIC(6, 2) DEFAULT 90,
  status TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILL_REQUESTED'
  current_bill_amount NUMERIC(10, 2) DEFAULT 0,
  qr_token TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ORDERS & BILLING
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'DINE_IN', -- 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'QR_ORDER'
  table_id TEXT,
  table_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  server_name TEXT,
  status TEXT NOT NULL DEFAULT 'IN_KITCHEN', -- 'IN_KITCHEN', 'SERVED', 'SETTLED', 'CANCELLED'
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5, 2) DEFAULT 0,
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  discount_approved_by TEXT,
  taxable_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(10, 2) DEFAULT 0,
  sgst_amount NUMERIC(10, 2) DEFAULT 0,
  round_off NUMERIC(6, 2) DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_settled BOOLEAN DEFAULT false,
  settled_at TIMESTAMPTZ,
  payments JSONB DEFAULT '[]'::jsonb,
  special_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. KITCHEN KOT TICKETS
CREATE TABLE IF NOT EXISTS public.kot_tickets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  order_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  kot_number TEXT NOT NULL,
  kitchen_station_id TEXT,
  kitchen_station_name TEXT,
  table_number TEXT DEFAULT 'Takeaway',
  order_type TEXT DEFAULT 'DINE_IN',
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. AUDIT TRAIL & ANTI-THEFT FRAUD LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  action_type TEXT NOT NULL, -- 'HIGH_DISCOUNT', 'VOID_ORDER', 'CANCEL_ITEM', 'REOPEN_BILL', 'MANUAL_CASH_ADJUST'
  authorized_by_pin TEXT,
  authorized_user_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access on app_users" ON public.app_users;
CREATE POLICY "Public access on app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on menu_categories" ON public.menu_categories;
CREATE POLICY "Public access on menu_categories" ON public.menu_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on menu_items" ON public.menu_items;
CREATE POLICY "Public access on menu_items" ON public.menu_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on floors" ON public.floors;
CREATE POLICY "Public access on floors" ON public.floors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on tables" ON public.tables;
CREATE POLICY "Public access on tables" ON public.tables FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on orders" ON public.orders;
CREATE POLICY "Public access on orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on kot_tickets" ON public.kot_tickets;
CREATE POLICY "Public access on kot_tickets" ON public.kot_tickets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access on audit_logs" ON public.audit_logs;
CREATE POLICY "Public access on audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- ENABLE REALTIME REPLICATION (Instant multi-device live sync)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kot_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;

-- ==============================================================================
-- SEED INITIAL FLOORS & TABLES (If empty)
-- ==============================================================================
INSERT INTO public.floors (id, organization_id, branch_id, name, display_order)
VALUES
  ('floor-01', 'org-cafe-01', 'branch-01', 'Main Indoor Cafe', 1),
  ('floor-02', 'org-cafe-01', 'branch-01', 'Open Air Terrace', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tables (id, organization_id, branch_id, floor_id, table_number, capacity, shape, pos_x, pos_y, status)
VALUES
  ('tbl-01', 'org-cafe-01', 'branch-01', 'floor-01', 'T-01', 2, 'SQUARE', 10, 15, 'AVAILABLE'),
  ('tbl-02', 'org-cafe-01', 'branch-01', 'floor-01', 'T-02', 4, 'RECTANGLE', 35, 15, 'OCCUPIED'),
  ('tbl-03', 'org-cafe-01', 'branch-01', 'floor-01', 'T-03', 4, 'RECTANGLE', 60, 15, 'AVAILABLE'),
  ('tbl-04', 'org-cafe-01', 'branch-01', 'floor-01', 'T-04', 6, 'ROUND', 82, 15, 'AVAILABLE'),
  ('tbl-05', 'org-cafe-01', 'branch-01', 'floor-02', 'TR-01', 4, 'SQUARE', 15, 20, 'AVAILABLE'),
  ('tbl-06', 'org-cafe-01', 'branch-01', 'floor-02', 'TR-02', 4, 'SQUARE', 45, 20, 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SEED SUPER ADMIN (PRODUCT OWNER) & STORE MANAGERS
-- ==============================================================================
INSERT INTO public.app_users (id, organization_id, branch_id, full_name, email, phone, password, role, manager_pin, is_active)
VALUES
  ('usr-super-owner-01', 'org-cafe-01', 'branch-01', 'Juned Khan (Product Owner & Super Admin)', 'owner@restaurantpos.com', '+91 98765 43210', 'Owner@123', 'SUPER_ADMIN', '9999', true),
  ('usr-super-owner-02', 'org-cafe-01', 'branch-01', 'Juned Khan (Founder)', 'juned@brewbeans.com', '+91 98765 43210', 'Owner@123', 'SUPER_ADMIN', '9999', true),
  ('usr-manager-01', 'org-cafe-01', 'branch-01', 'Zuber (Manager)', 'zuber@brewbeans.com', '+91 98765 43211', 'password123', 'ORG_ADMIN', '1234', true)
ON CONFLICT (id) DO UPDATE 
SET password = EXCLUDED.password, role = EXCLUDED.role, manager_pin = EXCLUDED.manager_pin;
