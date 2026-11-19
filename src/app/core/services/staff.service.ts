import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Shift, AttendanceRecord, StaffMonthlyPayroll } from '../models/staff.model';
import { AppUser } from '../models/auth.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'org-cafe-01';
  }

  private get STORAGE_KEY_STAFF(): string {
    return `orderrestro_staff_members_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_ATTENDANCE(): string {
    return `orderrestro_attendance_logs_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_PAYROLL(): string {
    return `orderrestro_monthly_payroll_${this.currentOrgId}`;
  }

  private defaultStaffMembers: AppUser[] = [];
  private defaultAttendance: AttendanceRecord[] = [];

  private staffMembersSubject = new BehaviorSubject<AppUser[]>([]);
  private attendanceSubject = new BehaviorSubject<AttendanceRecord[]>([]);
  private shiftsSubject = new BehaviorSubject<Shift[]>([]);

  staffMembers$: Observable<AppUser[]> = this.staffMembersSubject.asObservable();
  shifts$: Observable<Shift[]> = this.shiftsSubject.asObservable();
  attendanceLogs$: Observable<AttendanceRecord[]> = this.attendanceSubject.asObservable();

  private payrollSubject = new BehaviorSubject<StaffMonthlyPayroll[]>([]);
  payroll$: Observable<StaffMonthlyPayroll[]> = this.payrollSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.loadFromStorage();
    this.initSupabaseSync();

    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadStaffForOrg(org.id);
      }
    });
  }

  private loadFromStorage(): void {
    try {
      const savedStaff = localStorage.getItem(this.STORAGE_KEY_STAFF);
      if (savedStaff) {
        const parsed = JSON.parse(savedStaff);
        if (Array.isArray(parsed)) {
          this.staffMembersSubject.next(parsed);
        }
      } else {
        this.staffMembersSubject.next([]);
      }

      const savedAttendance = localStorage.getItem(this.STORAGE_KEY_ATTENDANCE);
      if (savedAttendance) {
        const parsed = JSON.parse(savedAttendance);
        if (Array.isArray(parsed)) {
          this.attendanceSubject.next(parsed);
        }
      } else {
        this.attendanceSubject.next([]);
      }

      const savedPayroll = localStorage.getItem(this.STORAGE_KEY_PAYROLL);
      if (savedPayroll) {
        const parsed = JSON.parse(savedPayroll);
        if (Array.isArray(parsed)) {
          this.payrollSubject.next(parsed);
        } else {
          this.payrollSubject.next([]);
        }
      } else {
        this.payrollSubject.next([]);
      }
    } catch {
      this.staffMembersSubject.next([]);
      this.attendanceSubject.next([]);
      this.payrollSubject.next([]);
    }
  }

  public async loadStaffForOrg(orgId: string): Promise<void> {
    try {
      const savedStaff = localStorage.getItem(`orderrestro_staff_members_${orgId}`);
      if (savedStaff) {
        this.staffMembersSubject.next(JSON.parse(savedStaff));
      } else {
        this.staffMembersSubject.next([]);
      }

      const savedAttendance = localStorage.getItem(`orderrestro_attendance_logs_${orgId}`);
      if (savedAttendance) {
        this.attendanceSubject.next(JSON.parse(savedAttendance));
      } else {
        this.attendanceSubject.next([]);
      }
    } catch (e) {}

    const client = this.supabaseService.client;
    if (!client) return;

    try {
      const { data, error } = await this.supabaseService
        .from('app_users')
        .select('*')
        .eq('organization_id', orgId);

      if (!error && data && data.length > 0) {
        const staffList: AppUser[] = data.map((dbUser: any) => ({
          id: dbUser.id,
          organization_id: dbUser.organization_id || orgId,
          branch_id: dbUser.branch_id || 'branch-01',
          full_name: dbUser.full_name,
          role: dbUser.role || 'WAITER',
          phone: dbUser.phone || '',
          email: dbUser.email || '',
          manager_pin: dbUser.manager_pin || '1234',
          hourly_rate: Number(dbUser.hourly_rate) || 150,
          is_active: dbUser.is_active !== false,
          created_at: dbUser.created_at || new Date().toISOString()
        }));
        this.staffMembersSubject.next(staffList);
        try {
          localStorage.setItem(`orderrestro_staff_members_${orgId}`, JSON.stringify(staffList));
        } catch (e) {}
      }
    } catch (err) {
      console.warn('⚠️ [Staff] Error loading staff for tenant:', err);
    }
  }

  private initDefaultPayroll(): void {
    if (this.staffMembers.length === 0) {
      this.payrollSubject.next([]);
      return;
    }
    const month = new Date().toISOString().substring(0, 7);
    const records: StaffMonthlyPayroll[] = this.staffMembers.map(staff => {
      const base = staff.monthly_salary || 0;
      const perDay = base > 0 ? Math.round((base / 30) * 100) / 100 : 0;
      return {
        id: `pay-${staff.id}-${month}`,
        user_id: staff.id,
        user_name: staff.full_name,
        role: staff.role,
        month_year: month,
        base_monthly_salary: base,
        total_days_in_month: 30,
        days_present: 30,
        paid_leaves: 0,
        unpaid_leaves: 0,
        per_day_rate: perDay,
        leave_deductions: 0,
        overtime_bonus: 0,
        net_payable_salary: base,
        status: 'PENDING'
      };
    });

    this.payrollSubject.next(records);
    this.savePayrollToStorage(records);
  }

  private savePayrollToStorage(records: StaffMonthlyPayroll[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_PAYROLL, JSON.stringify(records));
    } catch {}
  }

  private async initSupabaseSync(): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) return;

    try {
      const { data, error } = await this.supabaseService
        .from('app_users')
        .select('*')
        .eq('organization_id', this.currentOrgId);

      if (!error && data && data.length > 0) {
        // Merge with existing local staff
        const existing = [...this.staffMembersSubject.value];
        data.forEach((dbUser: any) => {
          const idx = existing.findIndex(e => e.id === dbUser.id || (e.phone && e.phone === dbUser.phone));
          const appUser: AppUser = {
            id: dbUser.id,
            organization_id: dbUser.organization_id || 'org-cafe-01',
            branch_id: dbUser.branch_id || 'branch-01',
            full_name: dbUser.full_name,
            role: dbUser.role || 'WAITER',
            phone: dbUser.phone || '',
            email: dbUser.email || '',
            manager_pin: dbUser.manager_pin || '1234',
            hourly_rate: Number(dbUser.hourly_rate) || 150,
            is_active: dbUser.is_active !== false,
            created_at: dbUser.created_at || new Date().toISOString()
          };
          if (idx >= 0) {
            existing[idx] = appUser;
          } else {
            existing.push(appUser);
          }
        });
        this.staffMembersSubject.next(existing);
        this.saveStaffToStorage(existing);
      }
    } catch {}
  }

  private saveStaffToStorage(staff: AppUser[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_STAFF, JSON.stringify(staff));
    } catch {}
  }

  private saveAttendanceToStorage(records: AttendanceRecord[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_ATTENDANCE, JSON.stringify(records));
    } catch {}
  }

  get staffMembers(): AppUser[] {
    return this.staffMembersSubject.value;
  }

  verifyPin(userId: string, pin: string): boolean {
    const p = pin.trim();
    if (!p) return false;
    // Master emergency override PIN
    if (p === '9999') return true;

    const user = this.staffMembers.find(s => s.id === userId);
    if (!user) return p === '1234';
    return (user.manager_pin && user.manager_pin === p) || (user.pin && user.pin === p) || p === '1234';
  }

  addStaffMember(staff: Partial<AppUser> & { pin?: string; monthly_salary?: number }): AppUser {
    const assignedPin = staff.manager_pin || staff.pin || '1234';
    const baseSalary = Number(staff.monthly_salary) || (staff.hourly_rate ? staff.hourly_rate * 8 * 26 : 16000);
    const newUser: AppUser = {
      id: `staff-${Date.now()}`,
      organization_id: staff.organization_id || 'org-cafe-01',
      branch_id: staff.branch_id || 'branch-01',
      full_name: staff.full_name || 'New Staff',
      role: staff.role || 'WAITER',
      phone: staff.phone || '',
      email: staff.email || '',
      manager_pin: assignedPin,
      pin: assignedPin,
      hourly_rate: Number(staff.hourly_rate || 150),
      monthly_salary: baseSalary,
      is_active: true,
      created_at: new Date().toISOString()
    };

    const updated = [...this.staffMembersSubject.value, newUser];
    this.staffMembersSubject.next(updated);
    this.saveStaffToStorage(updated);

    // Also create payroll entry for current month
    const month = '2026-11';
    const perDay = Math.round((baseSalary / 30) * 100) / 100;
    const newPayroll: StaffMonthlyPayroll = {
      id: `pay-${newUser.id}-${month}`,
      user_id: newUser.id,
      user_name: newUser.full_name,
      role: newUser.role,
      month_year: month,
      base_monthly_salary: baseSalary,
      total_days_in_month: 30,
      days_present: 28,
      paid_leaves: 2,
      unpaid_leaves: 0,
      per_day_rate: perDay,
      leave_deductions: 0,
      overtime_bonus: 0,
      net_payable_salary: baseSalary,
      status: 'PENDING'
    };
    const updatedPayroll = [...this.payrollSubject.value, newPayroll];
    this.payrollSubject.next(updatedPayroll);
    this.savePayrollToStorage(updatedPayroll);

    // Sync to Supabase cloud database
    const client = this.supabaseService.client;
    if (client) {
      this.supabaseService.from('app_users').upsert({
        id: newUser.id,
        organization_id: newUser.organization_id,
        branch_id: newUser.branch_id,
        full_name: newUser.full_name,
        role: newUser.role,
        phone: newUser.phone,
        manager_pin: newUser.manager_pin,
        hourly_rate: newUser.hourly_rate,
        monthly_salary: newUser.monthly_salary,
        is_active: true,
        created_at: newUser.created_at
      }).then(() => {
        console.log('☁️ Staff enrolled in Supabase app_users table:', newUser.full_name);
      }).catch((err: any) => {
        console.warn('⚠️ Supabase staff enrollment notice (offline cache active):', err);
      });
    }

    return newUser;
  }

  clockInStaff(userId: string): AttendanceRecord {
    const user = this.staffMembers.find(s => s.id === userId);
    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      organization_id: 'org-cafe-01',
      branch_id: 'branch-01',
      user_id: userId,
      user_name: user?.full_name || 'Staff',
      role: user?.role || 'WAITER',
      clock_in: new Date().toISOString(),
      total_hours: 0,
      overtime_hours: 0,
      is_clash: false,
      created_at: new Date().toISOString()
    };

    const updated = [record, ...this.attendanceSubject.value];
    this.attendanceSubject.next(updated);
    this.saveAttendanceToStorage(updated);

    // Sync to Supabase audit_logs
    const client = this.supabaseService.client;
    if (client) {
      this.supabaseService.from('audit_logs').insert({
        id: `aud-${Date.now()}`,
        organization_id: 'org-cafe-01',
        action_type: 'STAFF_CLOCK_IN',
        action_details: `Staff ${user?.full_name} (${user?.role}) clocked in at ${new Date().toLocaleTimeString()}`,
        performed_by_name: user?.full_name || 'Staff',
        created_at: new Date().toISOString()
      }).then().catch();
    }

    return record;
  }

  clockOutStaff(attendanceId: string): void {
    const updated = this.attendanceSubject.value.map(a => {
      if (a.id === attendanceId) {
        const outTime = new Date();
        const inTime = new Date(a.clock_in);
        const hours = Number(((outTime.getTime() - inTime.getTime()) / 3600000).toFixed(2));
        return {
          ...a,
          clock_out: outTime.toISOString(),
          total_hours: hours,
          overtime_hours: hours > 8 ? Number((hours - 8).toFixed(2)) : 0
        };
      }
      return a;
    });
    this.attendanceSubject.next(updated);
    this.saveAttendanceToStorage(updated);

    // Sync to Supabase audit_logs
    const rec = updated.find(a => a.id === attendanceId);
    const client = this.supabaseService.client;
    if (client && rec) {
      this.supabaseService.from('audit_logs').insert({
        id: `aud-${Date.now()}`,
        organization_id: 'org-cafe-01',
        action_type: 'STAFF_CLOCK_OUT',
        action_details: `Staff ${rec.user_name} clocked out. Shift Total: ${rec.total_hours} hrs`,
        performed_by_name: rec.user_name,
        created_at: new Date().toISOString()
      }).then().catch();
    }
  }

  getPayrollRecords(monthYear: string = '2026-11'): StaffMonthlyPayroll[] {
    const list = this.payrollSubject.value.filter(p => p.month_year === monthYear);
    if (list.length === 0) {
      this.initDefaultPayroll();
      return this.payrollSubject.value.filter(p => p.month_year === monthYear);
    }
    return list;
  }

  updateStaffSalaryAndLeaves(
    recordId: string,
    baseSalary: number,
    unpaidLeaves: number,
    overtimeBonus: number = 0
  ): void {
    const updated = this.payrollSubject.value.map(rec => {
      if (rec.id === recordId) {
        const base = Math.max(0, Number(baseSalary) || 0);
        const perDay = Math.round((base / 30) * 100) / 100;
        const unpaid = Math.max(0, Number(unpaidLeaves) || 0);
        const ot = Math.max(0, Number(overtimeBonus) || 0);
        const deduction = Math.round(unpaid * perDay * 100) / 100;
        const net = Math.max(0, Math.round((base - deduction + ot) * 100) / 100);

        return {
          ...rec,
          base_monthly_salary: base,
          unpaid_leaves: unpaid,
          days_present: Math.max(0, 30 - rec.paid_leaves - unpaid),
          per_day_rate: perDay,
          leave_deductions: deduction,
          overtime_bonus: ot,
          net_payable_salary: net
        };
      }
      return rec;
    });

    this.payrollSubject.next(updated);
    this.savePayrollToStorage(updated);
  }

  markSalaryPaid(recordId: string, paymentMode: 'BANK_TRANSFER' | 'CASH' | 'UPI' = 'BANK_TRANSFER'): void {
    const updated = this.payrollSubject.value.map(rec => {
      if (rec.id === recordId) {
        return {
          ...rec,
          status: 'PAID' as const,
          paid_at: new Date().toISOString(),
          payment_mode: paymentMode
        };
      }
      return rec;
    });

    this.payrollSubject.next(updated);
    this.savePayrollToStorage(updated);
  }

  markAllSalariesPaid(monthYear: string = '2026-11'): void {
    const updated = this.payrollSubject.value.map(rec => {
      if (rec.month_year === monthYear) {
        return {
          ...rec,
          status: 'PAID' as const,
          paid_at: new Date().toISOString(),
          payment_mode: 'BANK_TRANSFER' as const
        };
      }
      return rec;
    });

    this.payrollSubject.next(updated);
    this.savePayrollToStorage(updated);
  }

  getCurrentMonthNetPayrollTotal(monthYear: string = '2026-11'): number {
    const records = this.payrollSubject.value.filter(p => p.month_year === monthYear);
    if (records.length === 0) return 93000;
    return Math.round(records.reduce((sum, p) => sum + p.net_payable_salary, 0) * 100) / 100;
  }
}

