-- ==============================================================================
-- RESTAURANT POS ERP — INVENTORY & PROCUREMENT SUPABASE SCHEMA
-- Run this in your Supabase Project -> SQL Editor to create tables & enable RLS
-- ==============================================================================

-- 1. Enable UUID Extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. INVENTORY ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  name TEXT NOT NULL,
  sku TEXT,
  uom TEXT NOT NULL DEFAULT 'KG',
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 0,
  avg_unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_low_stock BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. WASTE LOGS TABLE
CREATE TABLE IF NOT EXISTS public.waste_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  inventory_item_id TEXT NOT NULL,
  inventory_item_name TEXT,
  quantity_wasted NUMERIC(12, 3) NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'KG',
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_loss_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'EXPIRED',
  logged_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  payment_terms_days INT DEFAULT 15,
  rating NUMERIC(3, 1) DEFAULT 5.0,
  total_spend NUMERIC(12, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PURCHASE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'org-cafe-01',
  branch_id TEXT NOT NULL DEFAULT 'branch-01',
  supplier_id TEXT NOT NULL,
  supplier_name TEXT,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  expected_delivery DATE,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) & ALLOW PUBLIC ACCESS (FOR POS DEMO/APP)
-- ==============================================================================

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Allow read/write for all users (or authenticated app)
DROP POLICY IF EXISTS "Public full access on inventory_items" ON public.inventory_items;
CREATE POLICY "Public full access on inventory_items" ON public.inventory_items
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on waste_logs" ON public.waste_logs;
CREATE POLICY "Public full access on waste_logs" ON public.waste_logs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on suppliers" ON public.suppliers;
CREATE POLICY "Public full access on suppliers" ON public.suppliers
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on purchase_orders" ON public.purchase_orders;
CREATE POLICY "Public full access on purchase_orders" ON public.purchase_orders
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for live multi-device syncing
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;

-- ==============================================================================
-- SEED INITIAL RAW INGREDIENTS (If empty)
-- ==============================================================================
INSERT INTO public.inventory_items (id, organization_id, branch_id, name, sku, uom, current_stock, reorder_level, avg_unit_cost, is_low_stock, is_active)
VALUES
  ('inv-01', 'org-cafe-01', 'branch-01', 'Arabica Espresso Beans (Estate Blend)', 'RAW-BEAN-01', 'KG', 18.5, 10.0, 1100.00, false, true),
  ('inv-02', 'org-cafe-01', 'branch-01', 'Full Cream Milk (Fresh)', 'RAW-MILK-02', 'L', 35.0, 20.0, 68.00, false, true),
  ('inv-03', 'org-cafe-01', 'branch-01', 'Oat Milk Barista Edition', 'RAW-OAT-03', 'L', 6.0, 10.0, 240.00, true, true),
  ('inv-04', 'org-cafe-01', 'branch-01', 'Sourdough Artisan Loaf', 'RAW-SOUR-04', 'PCS', 14.0, 8.0, 120.00, false, true),
  ('inv-05', 'org-cafe-01', 'branch-01', 'Fresh Hass Avocado', 'RAW-AVO-05', 'KG', 4.2, 5.0, 380.00, true, true),
  ('inv-06', 'org-cafe-01', 'branch-01', 'Fresh Chicken Breast', 'RAW-CHK-06', 'KG', 12.0, 6.0, 290.00, false, true)
ON CONFLICT (id) DO NOTHING;
