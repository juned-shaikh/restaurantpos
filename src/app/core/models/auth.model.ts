// ==============================================================================
// AUTH, USER & RBAC MODELS
// ==============================================================================

export type UserRole = 
  | 'SUPER_ADMIN' 
  | 'ORG_ADMIN' 
  | 'BRANCH_MANAGER' 
  | 'CASHIER' 
  | 'WAITER' 
  | 'KITCHEN_CHEF' 
  | 'STORE_KEEPER' 
  | 'ACCOUNTANT';

export interface AppUser {
  id: string;
  auth_user_id?: string;
  organization_id: string;
  branch_id?: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  manager_pin?: string;
  pin?: string;
  hourly_rate: number;
  monthly_salary?: number;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface UserSession {
  user: AppUser;
  token?: string;
  organizationName: string;
  branchName?: string;
}

