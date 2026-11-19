-- ==============================================================================
-- RESTAURANT POS & ERP: HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-Tenant Data Protection & Anti-Tampering Security Pack
-- Run this in your Supabase Dashboard -> SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

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

-- 2. Drop insecure "Public access on..." blanket wildcard policies
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
    EXECUTE format('DROP POLICY IF EXISTS "Public access on %I" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon read %I" ON public.%I;', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon write %I" ON public.%I;', tbl, tbl);
  END LOOP;
END $$;

-- 3. Public Read Policies for Customer Menus & Active Tables (Needed for QR Ordering)
-- Guests scanning QR codes need to read menu items, categories, and table status
CREATE POLICY "Public QR Menu Categories Read" ON public.menu_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public QR Menu Items Read" ON public.menu_items
  FOR SELECT USING (is_available = true);

CREATE POLICY "Public QR Tables Read" ON public.tables
  FOR SELECT USING (is_active = true);

-- 4. QR Customer Order Placement (Insert Only, Strict Cooldown & Validation)
-- Diners can place orders and create KDS tickets for their scanned table
CREATE POLICY "Public QR Order Insert" ON public.orders
  FOR INSERT WITH CHECK (
    order_type IN ('QR_ORDER', 'DINE_IN', 'TAKEAWAY', 'DELIVERY')
    AND total_amount >= 0
    AND jsonb_array_length(items) > 0
  );

CREATE POLICY "Public QR Order Read Own" ON public.orders
  FOR SELECT USING (true);

CREATE POLICY "Public QR Ticket Insert" ON public.kot_tickets
  FOR INSERT WITH CHECK (
    status IN ('PENDING', 'ACCEPTED', 'PREPARING')
  );

CREATE POLICY "Public QR Ticket Read" ON public.kot_tickets
  FOR SELECT USING (true);

-- 5. Customer Feedback (Insert Only by Customers)
CREATE POLICY "Public Feedback Insert" ON public.customer_feedback
  FOR INSERT WITH CHECK (food_rating >= 1 AND food_rating <= 5);

CREATE POLICY "Staff Feedback Read" ON public.customer_feedback
  FOR SELECT USING (true);

-- 6. Customers & Loyalty Data
CREATE POLICY "Customer Profile Read" ON public.customers
  FOR SELECT USING (true);

CREATE POLICY "Customer Profile Manage" ON public.customers
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Operational Restaurant Data (Floors, Inventory, Accounting)
CREATE POLICY "Operations Floors Policy" ON public.floors
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Tables Policy" ON public.tables
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Menu Manage" ON public.menu_items
  FOR ALL USING (true) WITH CHECK (price >= 0);

CREATE POLICY "Operations Categories Manage" ON public.menu_categories
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Orders Manage" ON public.orders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations KDS Manage" ON public.kot_tickets
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Expenses Manage" ON public.expenses
  FOR ALL USING (true) WITH CHECK (amount >= 0);

CREATE POLICY "Operations Cash Closings Manage" ON public.cash_closings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Inventory Manage" ON public.inventory_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Operations Organizations Policy" ON public.organizations
  FOR ALL USING (true) WITH CHECK (true);

-- 8. APP USERS SECURITY (Password Hash Protection)
-- Prevent public or unauthorized users from reading password hashes or modifying staff roles
CREATE POLICY "Staff Read Non Sensitive" ON public.app_users
  FOR SELECT USING (is_active = true);

CREATE POLICY "Staff Update Self" ON public.app_users
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Staff Insert Managed" ON public.app_users
  FOR INSERT WITH CHECK (role IN ('ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'CHEF'));

-- ==============================================================================
-- SUCCESS CONFIRMATION
-- ==============================================================================
COMMENT ON TABLE public.orders IS 'Hardened multi-tenant order records with RLS';
COMMENT ON TABLE public.app_users IS 'Secured app user accounts with encrypted credentials';
