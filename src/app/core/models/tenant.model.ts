// ==============================================================================
// SAAS MULTI-TENANCY & BRANCH MODELS
// ==============================================================================

export type SubscriptionTier = 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'TRIAL';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface BranchFeatureFlags {
  enable_tables: boolean;
  enable_kds: boolean;
  enable_inventory: boolean;
  enable_staff: boolean;
  enable_crm: boolean;
  enable_qr: boolean;
  enable_accounting: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  logo_url?: string;
  tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  max_branches: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaasTenantSummary extends Organization {
  active_outlets: number;
  monthly_revenue: number;
  city: string;
  branches?: Branch[];
}

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  email: string;
  
  // Tax & UPI Configuration
  gstin?: string;
  fssai?: string;
  tax_regime: 'INDIA_GST' | 'US_SALES_TAX' | 'EU_VAT' | 'CUSTOM' | 'NONE';
  is_tax_inclusive: boolean;
  default_cgst_pct: number;
  default_sgst_pct: number;
  upi_vpa?: string; // e.g. cafe@upi
  upi_payee_name?: string;
  currency: string; // 'INR'
  currency_symbol: string; // '₹'
  timezone: string;
  
  // Dynamic Module Toggles (For Simple Cafe vs Full Restaurant)
  feature_flags: BranchFeatureFlags;

  is_active: boolean;
  created_at: string;
}
