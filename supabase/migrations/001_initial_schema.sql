-- ==============================================================================
-- RESTAURANT POS & ERP — MULTI-TENANT SAAS DATABASE SCHEMA
-- Target Database: Supabase PostgreSQL 15+
-- Safe to re-run multiple times (100% Idempotent)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. SAFE ENUM TYPES CREATION (Avoids "type already exists" error)
-- ==============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        CREATE TYPE subscription_tier AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE', 'TRIAL');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_CHEF', 'STORE_KEEPER', 'ACCOUNTANT'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status') THEN
        CREATE TYPE table_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'RESERVED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_shape') THEN
        CREATE TYPE table_shape AS ENUM ('RECTANGLE', 'ROUND', 'SQUARE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
        CREATE TYPE waitlist_status AS ENUM ('WAITING', 'SEATED', 'CANCELLED', 'NO_SHOW');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
        CREATE TYPE reservation_status AS ENUM ('CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE order_type AS ENUM ('DINE_IN', 'TAKEAWAY', 'QR_ORDER', 'SCHEDULED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('OPEN', 'IN_KITCHEN', 'READY', 'SERVED', 'SETTLED', 'CANCELLED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode') THEN
        CREATE TYPE payment_mode AS ENUM ('CASH', 'UPI', 'CARD', 'SPLIT', 'LOYALTY_POINTS', 'GIFT_VOUCHER');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kot_status') THEN
        CREATE TYPE kot_status AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'BUMPED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guest_request_type') THEN
        CREATE TYPE guest_request_type AS ENUM ('CALL_WAITER', 'REQUEST_BILL', 'WATER', 'CUSTOM');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guest_request_status') THEN
        CREATE TYPE guest_request_status AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_of_measure') THEN
        CREATE TYPE unit_of_measure AS ENUM ('KG', 'G', 'L', 'ML', 'PCS', 'PORTION');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status') THEN
        CREATE TYPE po_status AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_txn_type') THEN
        CREATE TYPE loyalty_txn_type AS ENUM ('EARNED', 'REDEEMED', 'REFERRAL_BONUS', 'EXPIRED', 'MANUAL_ADJUST');
    END IF;
END $$;

-- ==============================================================================
-- 2. SAAS MULTI-TENANCY & SUBSCRIPTIONS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) UNIQUE NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    logo_url TEXT,
    tier subscription_tier DEFAULT 'TRIAL',
    subscription_status subscription_status DEFAULT 'ACTIVE',
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    subscription_ends_at TIMESTAMPTZ,
    max_branches INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(255),
    
    -- Per-Branch Tax & UPI Payee Settings
    gstin VARCHAR(20),
    tax_regime VARCHAR(20) DEFAULT 'INDIA_GST',
    is_tax_inclusive BOOLEAN DEFAULT FALSE,
    default_cgst_pct NUMERIC(5, 2) DEFAULT 2.50,
    default_sgst_pct NUMERIC(5, 2) DEFAULT 2.50,
    upi_vpa VARCHAR(100),
    upi_payee_name VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'INR',
    currency_symbol VARCHAR(5) DEFAULT '₹',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- ==============================================================================
-- 3. STAFF, ROLES & PIN-BASED AUTH
-- ==============================================================================

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'WAITER',
    pin_hash VARCHAR(255),
    hourly_rate NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. TABLE & FLOOR MANAGEMENT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    table_number VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 4,
    shape table_shape DEFAULT 'SQUARE',
    pos_x INT DEFAULT 50,
    pos_y INT DEFAULT 50,
    width INT DEFAULT 100,
    height INT DEFAULT 100,
    status table_status DEFAULT 'AVAILABLE',
    qr_token VARCHAR(100) UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    current_order_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, table_number)
);

CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    party_size INT NOT NULL DEFAULT 2,
    floor_preference_id UUID REFERENCES floors(id),
    status waitlist_status DEFAULT 'WAITING',
    notes TEXT,
    estimated_wait_mins INT DEFAULT 15,
    seated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id),
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    party_size INT NOT NULL,
    reservation_time TIMESTAMPTZ NOT NULL,
    status reservation_status DEFAULT 'CONFIRMED',
    special_requests TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. KITCHEN STATIONS & KDS (KITCHEN DISPLAY SYSTEM)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS kitchen_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    color_code VARCHAR(20) DEFAULT '#9F1239',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, code)
);

-- ==============================================================================
-- 6. MENU MANAGEMENT (CATEGORIES, DISHES, MODIFIERS, COMBOS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    icon_name VARCHAR(50) DEFAULT 'coffee',
    image_url TEXT,
    display_order INT DEFAULT 0,
    kitchen_station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    kitchen_station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    short_code VARCHAR(20),
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(10, 2) DEFAULT 0.00,
    tax_rate NUMERIC(5, 2) DEFAULT 5.00,
    is_veg BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    prep_time_mins INT DEFAULT 10,
    display_order INT DEFAULT 0,
    is_combo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    min_selection INT DEFAULT 0,
    max_selection INT DEFAULT 1,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (menu_item_id, modifier_group_id)
);

CREATE TABLE IF NOT EXISTS modifier_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_adjustment NUMERIC(10, 2) DEFAULT 0.00,
    is_default BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. ORDERS, BILLING & KOT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    order_type order_type DEFAULT 'DINE_IN',
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    customer_id UUID,
    server_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    status order_status DEFAULT 'OPEN',
    
    subtotal NUMERIC(10, 2) DEFAULT 0.00,
    discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) DEFAULT 0.00,
    taxable_amount NUMERIC(10, 2) DEFAULT 0.00,
    cgst_amount NUMERIC(10, 2) DEFAULT 0.00,
    sgst_amount NUMERIC(10, 2) DEFAULT 0.00,
    round_off NUMERIC(5, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) DEFAULT 0.00,
    
    is_settled BOOLEAN DEFAULT FALSE,
    special_notes TEXT,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_option_id UUID REFERENCES modifier_options(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    price_adjustment NUMERIC(10, 2) DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS kot_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kitchen_station_id UUID REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    kot_number VARCHAR(50) NOT NULL,
    table_number VARCHAR(50),
    status kot_status DEFAULT 'PENDING',
    prep_started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    bumped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kot_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_ticket_id UUID NOT NULL REFERENCES kot_tickets(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    modifiers_summary TEXT,
    is_struck_through BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_mode payment_mode NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    transaction_ref VARCHAR(100),
    received_by_user_id UUID REFERENCES app_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. QR GUEST SERVICE REQUESTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS table_guest_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    request_type guest_request_type NOT NULL,
    status guest_request_status DEFAULT 'PENDING',
    acknowledged_by_user_id UUID REFERENCES app_users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ==============================================================================
-- 9. INVENTORY & RECIPE COSTING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(50),
    uom unit_of_measure NOT NULL DEFAULT 'KG',
    current_stock NUMERIC(12, 3) DEFAULT 0.000,
    reorder_level NUMERIC(12, 3) DEFAULT 5.000,
    avg_unit_cost NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, name)
);

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID UNIQUE NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    yield_quantity INT DEFAULT 1,
    instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC(10, 3) NOT NULL,
    uom unit_of_measure NOT NULL,
    cost_contribution NUMERIC(10, 2) DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    initial_quantity NUMERIC(12, 3) NOT NULL,
    remaining_quantity NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(10, 2) NOT NULL,
    expiry_date DATE,
    received_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waste_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_wasted NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(10, 2) NOT NULL,
    total_loss_cost NUMERIC(10, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    logged_by_user_id UUID REFERENCES app_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. PROCUREMENT & SUPPLIERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    gstin VARCHAR(20),
    payment_terms_days INT DEFAULT 30,
    rating NUMERIC(3, 1) DEFAULT 5.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(50) NOT NULL,
    status po_status DEFAULT 'DRAFT',
    expected_delivery DATE,
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_by_user_id UUID REFERENCES app_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    ordered_qty NUMERIC(12, 3) NOT NULL,
    received_qty NUMERIC(12, 3) DEFAULT 0.000,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_receipt_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    grn_number VARCHAR(50) NOT NULL,
    supplier_invoice_no VARCHAR(100),
    received_date TIMESTAMPTZ DEFAULT NOW(),
    total_value NUMERIC(12, 2) NOT NULL,
    received_by_user_id UUID REFERENCES app_users(id)
);

-- ==============================================================================
-- 11. CRM, LOYALTY & FEEDBACK
-- ==============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    birth_date DATE,
    anniversary_date DATE,
    total_spent NUMERIC(12, 2) DEFAULT 0.00,
    visit_count INT DEFAULT 0,
    loyalty_points INT DEFAULT 0,
    referral_code VARCHAR(20) UNIQUE DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)),
    referred_by_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    membership_tier VARCHAR(50) DEFAULT 'BRONZE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, phone)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    points INT NOT NULL,
    type loyalty_txn_type NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    initial_amount NUMERIC(10, 2) NOT NULL,
    balance_amount NUMERIC(10, 2) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    customer_name VARCHAR(255),
    phone VARCHAR(20),
    rating INT CHECK (rating >= 1 AND rating <= 5),
    food_rating INT,
    service_rating INT,
    ambience_rating INT,
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 12. STAFF, ATTENDANCE & TIP POOL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    clock_in TIMESTAMPTZ NOT NULL,
    clock_out TIMESTAMPTZ,
    total_hours NUMERIC(5, 2) DEFAULT 0.00,
    overtime_hours NUMERIC(5, 2) DEFAULT 0.00,
    is_clash BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tip_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    pool_date DATE NOT NULL,
    total_tips_collected NUMERIC(10, 2) NOT NULL,
    is_distributed BOOLEAN DEFAULT FALSE,
    distributed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, pool_date)
);

CREATE TABLE IF NOT EXISTS tip_distributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tip_pool_id UUID NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    hours_worked NUMERIC(5, 2) NOT NULL,
    tip_amount_awarded NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 13. ACCOUNTING & NIGHTLY CASH CLOSING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS cash_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    closed_by_user_id UUID NOT NULL REFERENCES app_users(id),
    closing_date DATE NOT NULL,
    opening_drawer_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_sales_collected NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    petty_cash_expenses NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cash_refunds NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_drawer_cash NUMERIC(10, 2) NOT NULL,
    actual_counted_cash NUMERIC(10, 2) NOT NULL,
    variance_amount NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    verified_by_manager BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, closing_date)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    amount NUMERIC(10, 2) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'CASH',
    paid_to VARCHAR(255) NOT NULL,
    bill_receipt_url TEXT,
    description TEXT,
    recorded_by_user_id UUID REFERENCES app_users(id),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    month_year VARCHAR(7) NOT NULL,
    budget_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, category_id, month_year)
);

-- ==============================================================================
-- 14. REALTIME REPLICATION (Safe block to prevent duplicate object errors)
-- ==============================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_items;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tables;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE table_guest_requests;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ==============================================================================
-- 15. ROW-LEVEL SECURITY (RLS) FOR MULTI-TENANCY
-- ==============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;

-- Helper SQL Function to get current user's organization
CREATE OR REPLACE FUNCTION current_user_org_id() 
RETURNS UUID AS $$
    SELECT organization_id FROM app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Safe re-creatable policies
DROP POLICY IF EXISTS org_orders_isolation ON orders;
CREATE POLICY org_orders_isolation ON orders FOR ALL USING (organization_id = current_user_org_id() OR current_user_org_id() IS NULL);

DROP POLICY IF EXISTS org_tables_isolation ON tables;
CREATE POLICY org_tables_isolation ON tables FOR ALL USING (organization_id = current_user_org_id() OR current_user_org_id() IS NULL);

DROP POLICY IF EXISTS org_menu_isolation ON menu_items;
CREATE POLICY org_menu_isolation ON menu_items FOR ALL USING (organization_id = current_user_org_id() OR current_user_org_id() IS NULL);
