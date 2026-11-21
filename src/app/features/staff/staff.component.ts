import { Component, OnInit } from '@angular/core';
import { StaffService } from '../../core/services/staff.service';
import { ToastService } from '../../core/services/toast.service';
import { AppUser } from '../../core/models/auth.model';

@Component({
  selector: 'app-staff',
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.scss']
})
export class StaffComponent implements OnInit {
  staffMembers: AppUser[] = [];
  searchQuery: string = '';

  showAddStaffModal = false;
  showEditStaffModal = false;

  // Add Staff form state
  newStaffName = '';
  newStaffRole: AppUser['role'] = 'WAITER';
  newStaffPhone = '';
  newStaffPin = '';

  // Edit Staff form state
  editingStaffId = '';
  editStaffName = '';
  editStaffRole: AppUser['role'] = 'WAITER';
  editStaffPhone = '';
  editStaffPin = '';

  roleOptions = [
    { label: 'Waiter / Steward', value: 'WAITER', icon: 'ri-restaurant-line' },
    { label: 'Kitchen Chef', value: 'KITCHEN_CHEF', icon: 'ri-fire-line' },
    { label: 'Cashier / Billing Counter', value: 'CASHIER', icon: 'ri-shopping-cart-2-line' },
    { label: 'Floor Supervisor / Captain', value: 'BRANCH_MANAGER', icon: 'ri-user-star-line' },
    { label: 'Storekeeper / Inventory', value: 'STORE_KEEPER', icon: 'ri-box-3-line' }
  ];

  get filteredStaff(): AppUser[] {
    if (!this.searchQuery.trim()) {
      return this.staffMembers;
    }
    const q = this.searchQuery.toLowerCase().trim();
    return this.staffMembers.filter(s =>
      (s.full_name && s.full_name.toLowerCase().includes(q)) ||
      (s.role && s.role.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  }

  constructor(
    public staffService: StaffService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.staffService.staffMembers$.subscribe(s => {
      this.staffMembers = s;
    });
  }

  openAddStaff(): void {
    this.newStaffName = '';
    this.newStaffRole = 'WAITER';
    this.newStaffPhone = '';
    this.newStaffPin = '';
    this.showAddStaffModal = true;
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 10);
    this.newStaffPhone = input.value;
  }

  async saveNewStaff(): Promise<void> {
    const name = this.newStaffName.trim();
    const phone = this.newStaffPhone.trim().replace(/\D/g, '');

    if (!name) {
      this.toast.warning('Please enter staff full name.');
      return;
    }

    if (!phone || phone.length !== 10) {
      this.toast.warning('Please enter a valid 10-digit mobile number.');
      return;
    }

    const pin = this.newStaffPin.trim() || String(Math.floor(1000 + Math.random() * 9000));

    const res = await this.staffService.addStaffMember({
      full_name: name,
      role: this.newStaffRole,
      phone: phone,
      manager_pin: pin,
      pin: pin,
      hourly_rate: 0
    });

    if (!res.success) {
      this.toast.error(res.message || 'Staff enrollment failed. Mobile number already exists.', 'Duplicate Staff Error');
      return;
    }

    this.showAddStaffModal = false;
    this.toast.success(`Staff member ${name} (${this.newStaffRole}) enrolled successfully! PIN: ${pin}`, 'Staff Enrolled');
  }

  openEditStaff(staff: AppUser): void {
    this.editingStaffId = staff.id;
    this.editStaffName = staff.full_name || '';
    this.editStaffRole = staff.role || 'WAITER';
    this.editStaffPhone = (staff.phone || '').replace(/\D/g, '');
    this.editStaffPin = staff.manager_pin || staff.pin || '';
    this.showEditStaffModal = true;
  }

  onEditPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 10);
    this.editStaffPhone = input.value;
  }

  async saveEditStaff(): Promise<void> {
    const name = this.editStaffName.trim();
    const phone = this.editStaffPhone.trim().replace(/\D/g, '');

    if (!name) {
      this.toast.warning('Please enter staff full name.');
      return;
    }

    if (!phone || phone.length !== 10) {
      this.toast.warning('Please enter a valid 10-digit mobile number.');
      return;
    }

    const pin = this.editStaffPin.trim();

    const res = await this.staffService.updateStaffMember(this.editingStaffId, {
      full_name: name,
      role: this.editStaffRole,
      phone: phone,
      manager_pin: pin
    });

    if (!res.success) {
      this.toast.error(res.message || 'Could not update staff member.', 'Update Error');
      return;
    }

    this.showEditStaffModal = false;
    this.toast.success(`Staff member ${name} updated successfully!`, 'Staff Updated');
  }

  async confirmDeleteStaff(staff: AppUser): Promise<void> {
    const confirmed = confirm(`Are you sure you want to remove ${staff.full_name} (${staff.role})? This will delete their staff account and PIN.`);
    if (!confirmed) return;

    const res = await this.staffService.deleteStaffMember(staff.id);
    if (res.success) {
      this.toast.info(`Staff member ${staff.full_name} removed successfully.`, 'Staff Deleted');
    } else {
      this.toast.error(res.message || 'Could not delete staff member.', 'Delete Error');
    }
  }
}
