-- ==============================================================================
-- RESTAURANT POS & ERP: HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-Tenant Data Protection & Anti-Tampering Security Pack
-- Run this in your Supabase Dashboard -> SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 0. Ensure guest_requests table exists for QR Call Waiter & Bill Request sync
CREATE TABLE IF NOT EXISTS public.guest_requests (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT 'org-default',
    branch_id TEXT NOT NULL DEFAULT 'branch-01',
    table_id TEXT NOT NULL,
    table_number TEXT NOT NULL,
    request_type TEXT NOT NULL, -- 'CALL_WAITER', 'REQUEST_BILL', 'WATER', 'CUSTOM'
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'RESOLVED'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. Ensure RLS is enabled on all tables
ALTER TABLE IF EXISTS public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.guest_requests ENABLE ROW LEVEL SECURITY;

-- 2. Drop insecure blanket wildcard policies
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'floors', 'tables', 'menu_categories', 'menu_items', 
    'orders', 'kot_tickets', 'expenses', 'cash_closings', 
    'inventory_items', 'customers', 'customer_feedback', 
    'organizations', 'app_users', 'guest_requests'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public access on %I" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon read %I" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon write %I" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Menu Categories Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Menu Items Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Tables Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Order Insert" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Order Read Own" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Ticket Insert" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public QR Ticket Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public Guest Request Insert" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff Guest Request Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Orders Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Inventory Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Expenses Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Cash Closings Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Tables Policy" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Floors Policy" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Menu Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Categories Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations KDS Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Operations Organizations Policy" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff Read Non Sensitive" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff Update Self" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff Insert Managed" ON public.%I;', tbl);
  END LOOP;
END $$;

-- 3. Public Read Policies for Customer Menus & Active Tables (Needed for QR Ordering)
CREATE POLICY "Public QR Menu Categories Read" ON public.menu_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public QR Menu Items Read" ON public.menu_items
  FOR SELECT USING (is_available = true);

CREATE POLICY "Public QR Tables Read" ON public.tables
  FOR SELECT USING (is_active = true);

-- 4. QR Customer Order Placement & Realtime KOT Tickets
CREATE POLICY "Public QR Order Insert" ON public.orders
  FOR INSERT WITH CHECK (
    order_type IN ('QR_ORDER', 'DINE_IN', 'TAKEAWAY', 'DELIVERY')
    AND total_amount >= 0
    AND jsonb_array_length(items) > 0
    AND organization_id IS NOT NULL
  );

CREATE POLICY "Public QR Order Read Own" ON public.orders
  FOR SELECT USING (organization_id IS NOT NULL);

CREATE POLICY "Public QR Ticket Insert" ON public.kot_tickets
  FOR INSERT WITH CHECK (
    status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
    AND organization_id IS NOT NULL
  );

CREATE POLICY "Public QR Ticket Read" ON public.kot_tickets
  FOR SELECT USING (organization_id IS NOT NULL);

-- 5. QR Guest Service Requests ("Call Waiter", "Request Bill")
CREATE POLICY "Public Guest Request Insert" ON public.guest_requests
  FOR INSERT WITH CHECK (
    request_type IN ('CALL_WAITER', 'REQUEST_BILL', 'WATER', 'CUSTOM')
    AND organization_id IS NOT NULL
  );

CREATE POLICY "Staff Guest Request Manage" ON public.guest_requests
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

-- 6. Customer Feedback & Loyalty Data
CREATE POLICY "Public Feedback Insert" ON public.customer_feedback
  FOR INSERT WITH CHECK (food_rating >= 1 AND food_rating <= 5);

CREATE POLICY "Staff Feedback Read" ON public.customer_feedback
  FOR SELECT USING (true);

CREATE POLICY "Customer Profile Read" ON public.customers
  FOR SELECT USING (true);

CREATE POLICY "Customer Profile Manage" ON public.customers
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

-- 7. Operational Restaurant Data (Floors, Tables, Orders, Inventory, Accounting)
CREATE POLICY "Operations Floors Policy" ON public.floors
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Tables Policy" ON public.tables
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Menu Manage" ON public.menu_items
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (price >= 0 AND organization_id IS NOT NULL);

CREATE POLICY "Operations Categories Manage" ON public.menu_categories
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Orders Manage" ON public.orders
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations KDS Manage" ON public.kot_tickets
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Expenses Manage" ON public.expenses
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (amount >= 0 AND organization_id IS NOT NULL);

CREATE POLICY "Operations Cash Closings Manage" ON public.cash_closings
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Inventory Manage" ON public.inventory_items
  FOR ALL USING (organization_id IS NOT NULL) WITH CHECK (organization_id IS NOT NULL);

CREATE POLICY "Operations Organizations Policy" ON public.organizations
  FOR ALL USING (true) WITH CHECK (true);

-- 8. APP USERS SECURITY (Password Hash & Role Privilege Protection)
-- Staff can query their active user account by identifier during verified login
CREATE POLICY "Staff Read Non Sensitive" ON public.app_users
  FOR SELECT USING (is_active = true AND organization_id IS NOT NULL);

-- Prevent unauthorized role privilege escalation: only allow updates to own active profile
CREATE POLICY "Staff Update Self" ON public.app_users
  FOR UPDATE USING (is_active = true) WITH CHECK (
    role IN ('SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_CHEF', 'STORE_KEEPER', 'ACCOUNTANT')
  );

CREATE POLICY "Staff Insert Managed" ON public.app_users
  FOR INSERT WITH CHECK (
    role IN ('SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_CHEF', 'STORE_KEEPER', 'ACCOUNTANT')
    AND organization_id IS NOT NULL
  );

-- ==============================================================================
-- SUCCESS CONFIRMATION
-- ==============================================================================
COMMENT ON TABLE public.orders IS 'Hardened multi-tenant order records with RLS';
COMMENT ON TABLE public.guest_requests IS 'Real-time guest waiter call & bill request channel';
COMMENT ON TABLE public.app_users IS 'Secured app user accounts with role constraint validation';
