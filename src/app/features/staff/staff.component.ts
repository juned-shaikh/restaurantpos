import { Component, OnInit } from '@angular/core';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import { AppUser } from '../../core/models/auth.model';
import { AttendanceRecord, Shift, StaffMonthlyPayroll } from '../../core/models/staff.model';

@Component({
  selector: 'app-staff',
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.scss']
})
export class StaffComponent implements OnInit {
  staffMembers: AppUser[] = [];
  shifts: Shift[] = [];
  attendanceLogs: AttendanceRecord[] = [];
  payrollRecords: StaffMonthlyPayroll[] = [];
  activeTab: 'attendance' | 'accounts' | 'shifts' | 'payroll' = 'payroll';

  showAddStaffModal = false;
  showClockInModal = false;
  showPayrollModal = false;

  // Add Staff form state
  newStaffName = '';
  newStaffRole: AppUser['role'] = 'WAITER';
  newStaffPhone = '';
  newStaffHourlyRate = 150;
  newStaffMonthlySalary = 16000;
  newStaffPin = '';

  // Quick Attendance PIN state
  selectedStaffForClockIn = '';
  attendancePin = '';

  // Payroll state
  selectedPayrollMonth = '2026-11';
  editingPayroll: StaffMonthlyPayroll | null = null;
  editBaseSalary = 0;
  editUnpaidLeaves = 0;
  editOvertimeBonus = 0;

  monthOptions = [
    { label: 'November 2026 (Live Current Month)', value: '2026-11', icon: 'ri-calendar-event-line' },
    { label: 'October 2026 (Previous Month)', value: '2026-10', icon: 'ri-calendar-line' },
    { label: 'September 2026', value: '2026-09', icon: 'ri-calendar-line' }
  ];

  roleOptions = [
    { label: 'Waiter / Steward', value: 'WAITER', icon: 'ri-restaurant-line' },
    { label: 'Kitchen Chef', value: 'KITCHEN_CHEF', icon: 'ri-fire-line' },
    { label: 'Cashier / Billing Counter', value: 'CASHIER', icon: 'ri-shopping-cart-2-line' },
    { label: 'Floor Supervisor / Captain', value: 'BRANCH_MANAGER', icon: 'ri-user-star-line' },
    { label: 'Storekeeper / Inventory', value: 'STORE_KEEPER', icon: 'ri-box-3-line' }
  ];

  get staffClockInOptions() {
    return this.staffMembers.map(s => ({
      label: s.full_name,
      value: s.id,
      icon: 'ri-user-line',
      subtext: s.role
    }));
  }

  get filteredPayroll(): StaffMonthlyPayroll[] {
    return this.payrollRecords.filter(p => p.month_year === this.selectedPayrollMonth);
  }

  get totalNetPayroll(): number {
    return this.filteredPayroll.reduce((sum, p) => sum + (Number(p.net_payable_salary) || 0), 0);
  }

  get totalBasePayroll(): number {
    return this.filteredPayroll.reduce((sum, p) => sum + (Number(p.base_monthly_salary) || 0), 0);
  }

  get totalLeaveDeductions(): number {
    return this.filteredPayroll.reduce((sum, p) => sum + (Number(p.leave_deductions) || 0), 0);
  }

  get totalOvertimeBonus(): number {
    return this.filteredPayroll.reduce((sum, p) => sum + (Number(p.overtime_bonus) || 0), 0);
  }

  get totalPaidStaffCount(): number {
    return this.filteredPayroll.filter(p => p.status === 'PAID').length;
  }

  constructor(
    public staffService: StaffService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.staffService.staffMembers$.subscribe(s => {
      this.staffMembers = s;
      if (s.length > 0 && !this.selectedStaffForClockIn) {
        this.selectedStaffForClockIn = s[0].id;
      }
    });
    this.staffService.shifts$.subscribe(sh => this.shifts = sh);
    this.staffService.attendanceLogs$.subscribe(att => this.attendanceLogs = att);
    this.staffService.payroll$.subscribe(p => this.payrollRecords = p);
  }

  openAddStaff(): void {
    this.newStaffName = '';
    this.newStaffRole = 'WAITER';
    this.newStaffPhone = '';
    this.newStaffHourlyRate = 150;
    this.newStaffMonthlySalary = 16000;
    this.newStaffPin = '';
    this.showAddStaffModal = true;
  }

  saveNewStaff(): void {
    if (!this.newStaffName.trim() || !this.newStaffPhone.trim()) {
      this.toast.warning('Please fill in Staff Name and Phone Number.');
      return;
    }

    const pin = this.newStaffPin.trim() || '1234';

    this.staffService.addStaffMember({
      full_name: this.newStaffName.trim(),
      role: this.newStaffRole,
      phone: this.newStaffPhone.trim(),
      manager_pin: pin,
      pin: pin,
      hourly_rate: Number(this.newStaffHourlyRate),
      monthly_salary: Number(this.newStaffMonthlySalary) || 16000
    });

    this.showAddStaffModal = false;
    this.toast.success(`Staff member ${this.newStaffName} (${this.newStaffRole}) enrolled! PIN: ${pin}`, 'Staff Enrolled');
  }

  submitClockIn(): void {
    if (!this.selectedStaffForClockIn) {
      this.toast.warning('Please select a staff member.');
      return;
    }

    if (!this.attendancePin) {
      this.toast.warning('Please enter your 4-digit PIN to clock in.');
      return;
    }

    const isValid = this.staffService.verifyPin(this.selectedStaffForClockIn, this.attendancePin);
    if (!isValid) {
      this.toast.error('Invalid PIN! Please enter your registered 4-digit PIN (Demo: 1234).', 'Authentication Failed');
      return;
    }

    const staff = this.staffMembers.find(s => s.id === this.selectedStaffForClockIn);
    this.staffService.clockInStaff(this.selectedStaffForClockIn);
    this.showClockInModal = false;
    this.attendancePin = '';
    this.toast.success(`Clock-in Confirmed! ${staff?.full_name} (${staff?.role}) clocked in.`, 'Clock In Confirmed');
  }

  clockOut(recordId: string): void {
    this.staffService.clockOutStaff(recordId);
    this.toast.info('Staff successfully clocked out! Hours logged.', 'Clock Out');
  }

  // Payroll Methods
  openEditPayroll(record: StaffMonthlyPayroll): void {
    this.editingPayroll = record;
    this.editBaseSalary = record.base_monthly_salary;
    this.editUnpaidLeaves = record.unpaid_leaves;
    this.editOvertimeBonus = record.overtime_bonus;
    this.showPayrollModal = true;
  }

  savePayrollAdjustment(): void {
    if (!this.editingPayroll) return;
    this.staffService.updateStaffSalaryAndLeaves(
      this.editingPayroll.id,
      this.editBaseSalary,
      this.editUnpaidLeaves,
      this.editOvertimeBonus
    );
    this.showPayrollModal = false;
    this.editingPayroll = null;
  }

  quickAdjustLeaves(record: StaffMonthlyPayroll, delta: number): void {
    const newLeaves = Math.max(0, record.unpaid_leaves + delta);
    this.staffService.updateStaffSalaryAndLeaves(
      record.id,
      record.base_monthly_salary,
      newLeaves,
      record.overtime_bonus
    );
  }

  markPaid(recordId: string): void {
    this.staffService.markSalaryPaid(recordId, 'BANK_TRANSFER');
  }

  markAllPaid(): void {
    if (confirm(`Confirm marking all staff salaries as PAID for ${this.selectedPayrollMonth}?`)) {
      this.staffService.markAllSalariesPaid(this.selectedPayrollMonth);
    }
  }
}
