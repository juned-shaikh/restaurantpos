// ==============================================================================
// CRM, LOYALTY, REFERRALS & VOUCHER MODELS
// ==============================================================================

export type MembershipTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface Customer {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string;
  email?: string;
  birth_date?: string;
  anniversary_date?: string;
  total_spent: number;
  visit_count: number;
  loyalty_points: number;
  referral_code: string;
  referred_by_phone?: string;
  membership_tier: MembershipTier;
  favorite_items?: string[];
  last_visit_at?: string;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  customer_name?: string;
  order_id?: string;
  points: number; // Positive for earn, negative for redeem
  type: 'EARNED' | 'REDEEMED' | 'REFERRAL_BONUS' | 'EXPIRED' | 'MANUAL_ADJUST';
  description: string;
  created_at: string;
}

export interface GiftVoucher {
  id: string;
  organization_id: string;
  code: string;
  initial_amount: number;
  balance_amount: number;
  customer_phone?: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export interface CustomerFeedback {
  id: string;
  organization_id: string;
  branch_id: string;
  order_id?: string;
  customer_name?: string;
  phone?: string;
  rating: number; // 1 to 5
  food_rating: number;
  service_rating: number;
  ambience_rating: number;
  comments: string;
  created_at: string;
}

