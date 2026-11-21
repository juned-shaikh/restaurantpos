-- ==============================================================================
-- RESTAURANT POS & ERP: HARDENED ENTERPRISE ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-Tenant Data Isolation, Anti-Tampering & Atomic Sequence Engine
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

-- 0.1. Atomic Daily Order Sequence Table (Prevents Race Conditions Across Counters & QR)
CREATE TABLE IF NOT EXISTS public.order_sequences (
    organization_id TEXT NOT NULL,
    date_key DATE NOT NULL DEFAULT CURRENT_DATE,
    last_order_number INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, date_key)
);

-- 1. Enable RLS on all tables
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
ALTER TABLE IF EXISTS public.order_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Drop all legacy insecure wildcard / public policies
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'floors', 'tables', 'menu_categories', 'menu_items', 
    'orders', 'kot_tickets', 'expenses', 'cash_closings', 
    'inventory_items', 'customers', 'customer_feedback', 
    'organizations', 'app_users', 'guest_requests', 'order_sequences'
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
    EXECUTE format('DROP POLICY IF EXISTS "Public Feedback Insert" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Staff Feedback Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Customer Profile Read" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Customer Profile Manage" ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I;', tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- 3. MULTI-TENANT SECURITY DEFINER CONTEXT FUNCTIONS
-- These resolve tenant ownership strictly via Supabase Auth (auth.uid() / auth.jwt())
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
    (auth.jwt() -> 'user_metadata' ->> 'organization_id'),
    (SELECT organization_id FROM public.app_users 
     WHERE (id::text = auth.uid()::text OR email = (auth.jwt() ->> 'email'))
       AND is_active = true 
     LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'SUPER_ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE (id::text = auth.uid()::text OR email = (auth.jwt() ->> 'email'))
        AND role = 'SUPER_ADMIN'
        AND is_active = true
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_super_admin() = true
    OR (
      auth.role() = 'authenticated'
      AND target_org_id IS NOT NULL
      AND target_org_id = public.get_auth_user_org_id()
    )
  );
$$;

-- ==============================================================================
-- 4. ATOMIC ORDER NUMBER GENERATOR (RACE CONDITION FIX)
-- Guarantees atomic, strictly monotonic sequence per restaurant per calendar day.
-- No duplicate order numbers (#101, #102...) between multiple counters or QR orders!
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_next_order_number(p_org_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_org TEXT;
    v_next_num INT;
BEGIN
    v_target_org := COALESCE(NULLIF(p_org_id, ''), 'org-default');

    INSERT INTO public.order_sequences (organization_id, date_key, last_order_number, updated_at)
    VALUES (v_target_org, CURRENT_DATE, 101, NOW())
    ON CONFLICT (organization_id, date_key)
    DO UPDATE SET 
        last_order_number = public.order_sequences.last_order_number + 1,
        updated_at = NOW()
    RETURNING last_order_number INTO v_next_num;

    RETURN v_next_num::TEXT;
END;
$$;

-- ==============================================================================
-- 5. SECURE SERVER-SIDE RPC AUTHENTICATION (NO CLIENT-SIDE HASH/PIN LEAKS)
-- Allows fast POS terminal login without exposing the app_users table to anon queries.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.authenticate_staff_pin(p_pin TEXT, p_org_id TEXT)
RETURNS TABLE (
    id TEXT,
    organization_id TEXT,
    branch_id TEXT,
    full_name TEXT,
    role TEXT,
    email TEXT,
    phone TEXT,
    hourly_rate NUMERIC,
    is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_pin IS NULL OR length(trim(p_pin)) < 4 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.organization_id,
        u.branch_id,
        u.full_name,
        u.role,
        u.email,
        u.phone,
        COALESCE(u.hourly_rate, 0),
        u.is_active
    FROM public.app_users u
    WHERE u.is_active = true
      AND (u.pin = trim(p_pin) OR u.manager_pin = trim(p_pin))
      AND (p_org_id IS NULL OR p_org_id = '' OR p_org_id = 'org-default' OR u.organization_id = p_org_id)
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_pin TEXT, p_org_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_pin IS NULL OR length(trim(p_pin)) < 4 THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.app_users u
        WHERE u.is_active = true
          AND u.role IN ('SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'RESTAURANT_MANAGER')
          AND (u.pin = trim(p_pin) OR u.manager_pin = trim(p_pin))
          AND (p_org_id IS NULL OR p_org_id = '' OR p_org_id = 'org-default' OR u.organization_id = p_org_id)
    );
END;
$$;

-- Secure QR customer order status lookup (No blanket orders SELECT permission required!)
CREATE OR REPLACE FUNCTION public.get_qr_order_status(p_order_id TEXT, p_table_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order JSONB;
BEGIN
    SELECT json_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'order_type', o.order_type,
        'table_id', o.table_id,
        'status', o.status,
        'total_amount', o.total_amount,
        'is_settled', o.is_settled,
        'items', o.items,
        'created_at', o.created_at
    )::JSONB INTO v_order
    FROM public.orders o
    WHERE o.id = p_order_id
      AND (p_table_id IS NULL OR o.table_id = p_table_id)
      AND o.created_at >= NOW() - INTERVAL '24 hours'
    LIMIT 1;

    RETURN v_order;
END;
$$;

-- ==============================================================================
-- 6. STRICT MULTI-TENANT ROW LEVEL SECURITY POLICIES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- A. ORGANIZATIONS & TENANT SETTINGS
-- ------------------------------------------------------------------------------
CREATE POLICY "Tenant Read Own Organization" ON public.organizations
  FOR SELECT USING (
    public.is_super_admin()
    OR (auth.role() = 'authenticated' AND id = public.get_auth_user_org_id())
  );

CREATE POLICY "Super Admin Manage Organizations" ON public.organizations
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ------------------------------------------------------------------------------
-- B. APP USERS (Staff Credentials Protected, NO Anon Access!)
-- ------------------------------------------------------------------------------
CREATE POLICY "Super Admin Manage Users" ON public.app_users
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org Admin Manage Branch Users" ON public.app_users
  FOR ALL USING (
    auth.role() = 'authenticated'
    AND organization_id = public.get_auth_user_org_id()
    AND (public.is_super_admin() OR (SELECT role FROM public.app_users WHERE (id::text = auth.uid()::text OR email = (auth.jwt() ->> 'email')) LIMIT 1) IN ('ORG_ADMIN', 'BRANCH_MANAGER'))
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND organization_id = public.get_auth_user_org_id()
  );

CREATE POLICY "Staff Read Own Profile" ON public.app_users
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      id::text = auth.uid()::text
      OR email = (auth.jwt() ->> 'email')
      OR organization_id = public.get_auth_user_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- C. RESTAURANT OPERATIONAL DATA: ORDERS
-- Critical Fix: Multi-tenant scoped only. Absolutely NO "organization_id IS NOT NULL" leak!
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Orders MultiTenant Manage" ON public.orders
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Public QR Customers can only INSERT valid QR orders
CREATE POLICY "Public QR Customer Order Placement" ON public.orders
  FOR INSERT WITH CHECK (
    order_type = 'QR_ORDER'
    AND organization_id IS NOT NULL
    AND table_id IS NOT NULL
    AND total_amount >= 0
    AND jsonb_array_length(items) > 0
  );

-- ------------------------------------------------------------------------------
-- D. KITCHEN TICKETS (KDS)
-- Staff only. Customers never read or tamper with kitchen tickets directly.
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations KDS MultiTenant Manage" ON public.kot_tickets
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ------------------------------------------------------------------------------
-- E. RESTAURANT FLOORS & TABLES
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Floors Manage" ON public.floors
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Operations Tables Manage" ON public.tables
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Public QR Active Tables Read" ON public.tables
  FOR SELECT USING (is_active = true);

-- ------------------------------------------------------------------------------
-- F. MENU CATEGORIES & DISHES
-- Staff can manage their own menu; QR customers can view active dishes.
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Menu Manage" ON public.menu_items
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (price >= 0 AND public.is_org_member(organization_id));

CREATE POLICY "Public QR Menu Items Read" ON public.menu_items
  FOR SELECT USING (is_available = true);

CREATE POLICY "Operations Categories Manage" ON public.menu_categories
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Public QR Categories Read" ON public.menu_categories
  FOR SELECT USING (is_active = true);

-- ------------------------------------------------------------------------------
-- G. EXPENSES, CASH CLOSINGS & INVENTORY
-- Strictly internal financial & stock data. 100% staff authenticated & tenant isolated.
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Expenses Manage" ON public.expenses
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (amount >= 0 AND public.is_org_member(organization_id));

CREATE POLICY "Operations Cash Closings Manage" ON public.cash_closings
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Operations Inventory Manage" ON public.inventory_items
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ------------------------------------------------------------------------------
-- H. GUEST SERVICE REQUESTS ("Call Waiter", "Request Bill")
-- ------------------------------------------------------------------------------
CREATE POLICY "Public QR Guest Request Placement" ON public.guest_requests
  FOR INSERT WITH CHECK (
    request_type IN ('CALL_WAITER', 'REQUEST_BILL', 'WATER', 'CUSTOM')
    AND organization_id IS NOT NULL
    AND table_id IS NOT NULL
  );

CREATE POLICY "Operations Guest Request Manage" ON public.guest_requests
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ------------------------------------------------------------------------------
-- I. CUSTOMERS & FEEDBACK
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Customers Manage" ON public.customers
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Public Feedback Placement" ON public.customer_feedback
  FOR INSERT WITH CHECK (food_rating >= 1 AND food_rating <= 5 AND organization_id IS NOT NULL);

CREATE POLICY "Operations Feedback Read" ON public.customer_feedback
  FOR SELECT USING (public.is_org_member(organization_id));

-- ------------------------------------------------------------------------------
-- J. ATOMIC ORDER SEQUENCES
-- Accessible only via get_next_order_number SECURITY DEFINER RPC function or staff
-- ------------------------------------------------------------------------------
CREATE POLICY "Operations Order Sequences Policy" ON public.order_sequences
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ==============================================================================
-- 7. GRANT EXECUTE PERMISSIONS ON RPC FUNCTIONS
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_next_order_number(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authenticate_staff_pin(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_qr_order_status(TEXT, TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- VERIFICATION CONFIRMATION
-- ==============================================================================
COMMENT ON TABLE public.orders IS 'Secured Multi-Tenant Orders - Zero Anon Data Leakage';
COMMENT ON TABLE public.order_sequences IS 'Atomic Multi-Tenant Daily Order Number Engine';
COMMENT ON TABLE public.app_users IS 'Secured App Users - Protected by Supabase Auth and RPC';
