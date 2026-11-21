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
    return this.tenantService?.currentOrg?.id || 'org-default';
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
  private defaultShifts: Shift[] = [
    { id: 'sh-01', organization_id: 'org-default', branch_id: 'branch-01', name: 'Morning Shift', start_time: '09:00 AM', end_time: '05:00 PM' },
    { id: 'sh-02', organization_id: 'org-default', branch_id: 'branch-01', name: 'Evening / Dinner Shift', start_time: '05:00 PM', end_time: '12:00 AM' },
    { id: 'sh-03', organization_id: 'org-default', branch_id: 'branch-01', name: 'Full Day Shift', start_time: '10:00 AM', end_time: '11:00 PM' }
  ];

  private staffMembersSubject = new BehaviorSubject<AppUser[]>([]);
  private attendanceSubject = new BehaviorSubject<AttendanceRecord[]>([]);
  private shiftsSubject = new BehaviorSubject<Shift[]>(this.defaultShifts);

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
          manager_pin: dbUser.manager_pin || '',
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
            organization_id: dbUser.organization_id || 'org-default',
            branch_id: dbUser.branch_id || 'branch-01',
            full_name: dbUser.full_name,
            role: dbUser.role || 'WAITER',
            phone: dbUser.phone || '',
            email: dbUser.email || '',
            manager_pin: dbUser.manager_pin || '',
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

      // Sync any local staff not yet in cloud
      const currentLocalStaff = this.staffMembersSubject.value;
      if (currentLocalStaff.length > 0) {
        const cloudIds = new Set((data || []).map((d: any) => d.id));
        const unsynced = currentLocalStaff.filter(s => !cloudIds.has(s.id));
        for (const localMember of unsynced) {
          const cleanPhone = (localMember.phone || '').replace(/[\s\-\(\)\+]/g, '');
          const pin = localMember.manager_pin || localMember.pin || '';
          const validEmail = localMember.email?.trim() || (cleanPhone ? `${cleanPhone}@pos.local` : `${localMember.id}@pos.local`);
          this.supabaseService.from('app_users').upsert({
            id: localMember.id,
            organization_id: localMember.organization_id || this.currentOrgId,
            branch_id: localMember.branch_id || 'branch-01',
            full_name: localMember.full_name,
            email: validEmail,
            phone: localMember.phone || '',
            role: localMember.role || 'WAITER',
            password: pin,
            manager_pin: pin,
            hourly_rate: localMember.hourly_rate || 150,
            is_active: localMember.is_active !== false,
            created_at: localMember.created_at || new Date().toISOString()
          }).then(() => {
            console.log('☁️ Synced offline staff to Supabase:', localMember.full_name);
          }).catch(() => {});
        }
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

    const user = this.staffMembers.find(s => s.id === userId);
    if (!user) return false;
    return (!!user.manager_pin && user.manager_pin === p) || (!!user.pin && user.pin === p);
  }

  async addStaffMember(staff: Partial<AppUser> & { pin?: string; monthly_salary?: number }): Promise<{ success: boolean; user?: AppUser; message?: string }> {
    const cleanPhone = (staff.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    // 1. Strict duplicate check in local staff roster
    const existingLocally = this.staffMembersSubject.value.find(s => (s.phone || '').replace(/\D/g, '') === cleanPhone);
    if (existingLocally) {
      return { success: false, message: `A staff member (${existingLocally.full_name}) with mobile number ${cleanPhone} already exists in this restaurant!` };
    }

    // 2. Strict duplicate check in Supabase Cloud database
    const client = this.supabaseService.client;
    if (client) {
      try {
        const { data: dupUsers } = await this.supabaseService
          .from('app_users')
          .select('id, full_name, phone, role')
          .eq('phone', cleanPhone)
          .limit(1);

        if (dupUsers && dupUsers.length > 0) {
          const dup = dupUsers[0];
          return { success: false, message: `Mobile number ${cleanPhone} is already registered to ${dup.full_name} (${dup.role})!` };
        }
      } catch (err) {
        console.warn('Duplicate check notice:', err);
      }
    }

    const assignedPin = staff.manager_pin || staff.pin || String(Math.floor(1000 + Math.random() * 9000));
    const baseSalary = Number(staff.monthly_salary) || (staff.hourly_rate ? staff.hourly_rate * 8 * 26 : 16000);
    const validEmail = staff.email && staff.email.trim() ? staff.email.trim() : `${cleanPhone}@pos.local`;
    const targetOrgId = staff.organization_id || this.currentOrgId;

    const newUser: AppUser = {
      id: `staff-${Date.now()}`,
      organization_id: targetOrgId,
      branch_id: staff.branch_id || 'branch-01',
      full_name: staff.full_name || 'New Staff',
      role: staff.role || 'WAITER',
      phone: cleanPhone,
      email: validEmail,
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

    // Also register in local auth fallback store (syncs both v3 and v2) so login works offline/instantly
    try {
      const regKeys = ['orderrestro_registered_users_v3', 'orderrestro_registered_users_v2'];
      for (const regKey of regKeys) {
        const existing = localStorage.getItem(regKey);
        let list: any[] = existing ? JSON.parse(existing) : [];
        list = list.filter(item => item.user?.phone !== newUser.phone && item.user?.email !== newUser.email);
        list.push({
          user: newUser,
          passwordPlain: assignedPin,
          passwordHash: assignedPin
        });
        localStorage.setItem(regKey, JSON.stringify(list));
      }
    } catch {}

    // Also create payroll entry for current month
    const month = new Date().toISOString().slice(0, 7);
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
    if (client) {
      try {
        await this.supabaseService.from('app_users').upsert({
          id: newUser.id,
          organization_id: newUser.organization_id,
          branch_id: newUser.branch_id,
          full_name: newUser.full_name,
          role: newUser.role,
          email: newUser.email,
          phone: newUser.phone,
          password: assignedPin,
          manager_pin: assignedPin,
          hourly_rate: newUser.hourly_rate,
          is_active: true,
          created_at: newUser.created_at
        });
        console.log('☁️ Staff enrolled in Supabase app_users table:', newUser.full_name);
      } catch (err: any) {
        console.warn('⚠️ Supabase staff enrollment notice (offline cache active):', err);
      }
    }

    return { success: true, user: newUser };
  }

  async updateStaffMember(
    staffId: string,
    updates: {
      full_name: string;
      role: any;
      phone: string;
      manager_pin?: string;
      monthly_salary?: number;
    }
  ): Promise<{ success: boolean; message?: string; user?: AppUser }> {
    const cleanPhone = (updates.phone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return { success: false, message: 'Please enter a valid 10-digit mobile number.' };
    }

    // 1. Check duplicate phone among other staff members locally
    const dupLocal = this.staffMembersSubject.value.find(
      s => s.id !== staffId && (s.phone || '').replace(/\D/g, '') === cleanPhone
    );
    if (dupLocal) {
      return { success: false, message: `Another staff member (${dupLocal.full_name}) is already using mobile number ${cleanPhone}!` };
    }

    // 2. Check Supabase for duplicates
    const client = this.supabaseService.client;
    if (client) {
      try {
        const { data: dupCloud } = await this.supabaseService
          .from('app_users')
          .select('id, full_name, phone')
          .eq('phone', cleanPhone)
          .neq('id', staffId)
          .limit(1);

        if (dupCloud && dupCloud.length > 0) {
          return { success: false, message: `Mobile number ${cleanPhone} is already registered to ${dupCloud[0].full_name}!` };
        }
      } catch (err) {
        console.warn('Update duplicate check notice:', err);
      }
    }

    const currentStaff = this.staffMembersSubject.value.find(s => s.id === staffId);
    if (!currentStaff) {
      return { success: false, message: 'Staff member not found.' };
    }

    const pin = updates.manager_pin || currentStaff.manager_pin || currentStaff.pin || '';
    const salary = Number(updates.monthly_salary) || currentStaff.monthly_salary || 16000;
    const validEmail = `${cleanPhone}@pos.local`;

    const updatedUser: AppUser = {
      ...currentStaff,
      full_name: updates.full_name.trim(),
      role: updates.role,
      phone: cleanPhone,
      email: validEmail,
      manager_pin: pin,
      pin: pin,
      monthly_salary: salary
    };

    const newStaffList = this.staffMembersSubject.value.map(s => (s.id === staffId ? updatedUser : s));
    this.staffMembersSubject.next(newStaffList);
    this.saveStaffToStorage(newStaffList);

    // Update in local auth store (both v3 and v2)
    try {
      const regKeys = ['orderrestro_registered_users_v3', 'orderrestro_registered_users_v2'];
      for (const regKey of regKeys) {
        const existing = localStorage.getItem(regKey);
        if (existing) {
          let list: any[] = JSON.parse(existing);
          list = list.map(item => {
            if (item.user?.id === staffId) {
              return {
                user: updatedUser,
                passwordPlain: pin,
                passwordHash: pin
              };
            }
            return item;
          });
          localStorage.setItem(regKey, JSON.stringify(list));
        }
      }
    } catch {}

    // Update corresponding payroll record
    const updatedPayroll = this.payrollSubject.value.map(p => {
      if (p.user_id === staffId) {
        const perDay = Math.round((salary / 30) * 100) / 100;
        return {
          ...p,
          user_name: updatedUser.full_name,
          role: updatedUser.role,
          base_monthly_salary: salary,
          per_day_rate: perDay,
          net_payable_salary: salary
        };
      }
      return p;
    });
    this.payrollSubject.next(updatedPayroll);
    this.savePayrollToStorage(updatedPayroll);

    // Sync to Supabase
    if (client) {
      try {
        await this.supabaseService
          .from('app_users')
          .update({
            full_name: updatedUser.full_name,
            role: updatedUser.role,
            phone: updatedUser.phone,
            email: updatedUser.email,
            password: pin,
            manager_pin: pin
          })
          .eq('id', staffId);
        console.log('☁️ Staff updated in Supabase:', updatedUser.full_name);
      } catch (err) {
        console.warn('⚠️ Supabase staff update notice:', err);
      }
    }

    return { success: true, user: updatedUser };
  }

  async deleteStaffMember(staffId: string): Promise<{ success: boolean; message?: string }> {
    const target = this.staffMembersSubject.value.find(s => s.id === staffId);
    if (!target) {
      return { success: false, message: 'Staff member not found.' };
    }

    // 1. Remove from local staff state
    const filteredStaff = this.staffMembersSubject.value.filter(s => s.id !== staffId);
    this.staffMembersSubject.next(filteredStaff);
    this.saveStaffToStorage(filteredStaff);

    // 2. Remove from payroll records
    const filteredPayroll = this.payrollSubject.value.filter(p => p.user_id !== staffId);
    this.payrollSubject.next(filteredPayroll);
    this.savePayrollToStorage(filteredPayroll);

    // 3. Remove from local auth store (both v3 and v2)
    try {
      const regKeys = ['orderrestro_registered_users_v3', 'orderrestro_registered_users_v2'];
      for (const regKey of regKeys) {
        const existing = localStorage.getItem(regKey);
        if (existing) {
          let list: any[] = JSON.parse(existing);
          list = list.filter(item => item.user?.id !== staffId && item.user?.phone !== target.phone);
          localStorage.setItem(regKey, JSON.stringify(list));
        }
      }
    } catch {}

    // 4. Delete from Supabase
    const client = this.supabaseService.client;
    if (client) {
      try {
        await this.supabaseService.from('app_users').delete().eq('id', staffId);
        console.log('☁️ Staff removed from Supabase:', target.full_name);
      } catch (err) {
        console.warn('⚠️ Supabase staff delete notice:', err);
      }
    }

    return { success: true };
  }

  clockInStaff(userId: string): AttendanceRecord {
    const user = this.staffMembers.find(s => s.id === userId);
    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      organization_id: this.currentOrgId,
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
        organization_id: this.currentOrgId,
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
        organization_id: this.currentOrgId,
        action_type: 'STAFF_CLOCK_OUT',
        action_details: `Staff ${rec.user_name} clocked out. Shift Total: ${rec.total_hours} hrs`,
        performed_by_name: rec.user_name,
        created_at: new Date().toISOString()
      }).then().catch();
    }
  }

  getPayrollRecords(monthYear: string = new Date().toISOString().slice(0, 7)): StaffMonthlyPayroll[] {
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

  markAllSalariesPaid(monthYear: string = new Date().toISOString().slice(0, 7)): void {
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

  getCurrentMonthNetPayrollTotal(monthYear: string = new Date().toISOString().slice(0, 7)): number {
    const records = this.payrollSubject.value.filter(p => p.month_year === monthYear);
    if (records.length === 0) return 0;
    return Math.round(records.reduce((sum, p) => sum + p.net_payable_salary, 0) * 100) / 100;
  }
}

