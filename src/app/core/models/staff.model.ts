// ==============================================================================
// STAFF, ATTENDANCE, SHIFTS & PAYROLL MODELS
// ==============================================================================

import { AppUser } from './auth.model';

export interface Shift {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string; // e.g. "Morning Rush (08:00 - 16:00)", "Evening Bar (16:00 - 00:00)"
  start_time: string; // "08:00"
  end_time: string;   // "16:00"
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  user_name: string;
  role: string;
  clock_in: string;
  clock_out?: string;
  total_hours: number;
  overtime_hours: number;
  is_clash: boolean;
  notes?: string;
  created_at: string;
}

export interface TipPool {
  id: string;
  organization_id: string;
  branch_id: string;
  pool_date: string;
  total_tips_collected: number;
  is_distributed: boolean;
  distributed_at?: string;
  staff_splits?: {
    user_id: string;
    user_name: string;
    hours_worked: number;
    tip_share: number;
  }[];
}

export interface PayrollRun {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  user_name: string;
  role: string;
  period_start: string;
  period_end: string;
  clocked_hours: number;
  hourly_rate: number;
  base_pay: number;
  tip_share: number;
  deductions: number;
  net_salary: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
}

export interface StaffMonthlyPayroll {
  id: string;
  user_id: string;
  user_name: string;
  role: string;
  month_year: string; // e.g. "2026-11"
  base_monthly_salary: number;
  total_days_in_month: number;
  days_present: number;
  paid_leaves: number;
  unpaid_leaves: number;
  per_day_rate: number;
  leave_deductions: number;
  overtime_bonus: number;
  net_payable_salary: number;
  status: 'PAID' | 'PENDING';
  paid_at?: string;
  payment_mode?: 'BANK_TRANSFER' | 'CASH' | 'UPI';
  notes?: string;
}

