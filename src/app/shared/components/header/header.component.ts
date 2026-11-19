import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { StaffService } from '../../../core/services/staff.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { UiService } from '../../../core/services/ui.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { Branch, Organization } from '../../../core/models/tenant.model';
import { AppUser } from '../../../core/models/auth.model';
import { GuestRequest } from '../../../core/models/order.model';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  currentOrg!: Organization;
  activeBranch!: Branch;
  branches: Branch[] = [];
  currentUser: AppUser | null = null;
  guestRequests: GuestRequest[] = [];
  showRequestsDropdown = false;
  showClockInModal = false;
  currentTimeString = '';

  showUserDropdown = false;

  constructor(
    public tenantService: TenantService,
    public authService: AuthService,
    public orderService: OrderService,
    public staffService: StaffService,
    public supabaseService: SupabaseService,
    public uiService: UiService,
    public offlineSync: OfflineSyncService,
    public router: Router
  ) {}

  async syncOfflineOrders(): Promise<void> {
    const synced = await this.offlineSync.autoSync();
    if (synced > 0) {
      alert(`Synced ${synced} offline orders to cloud successfully!`);
    } else {
      alert('Local offline order queue is clean.');
    }
  }

  ngOnInit(): void {
    this.tenantService.currentOrg$.subscribe(org => this.currentOrg = org);
    this.tenantService.activeBranch$.subscribe(b => this.activeBranch = b);
    this.tenantService.branches$.subscribe(list => this.branches = list);
    this.authService.currentUser$.subscribe(u => this.currentUser = u);
    this.orderService.guestRequests$.subscribe(reqs => this.guestRequests = reqs);

    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  }

  updateClock(): void {
    const now = new Date();
    this.currentTimeString = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  toggleSidebar(): void {
    this.uiService.toggleSidebar();
  }

  onBranchChange(event: Event): void {
    const branchId = (event.target as HTMLSelectElement).value;
    this.tenantService.setActiveBranch(branchId);
  }

  toggleRequests(): void {
    this.showRequestsDropdown = !this.showRequestsDropdown;
  }

  resolveRequest(id: string): void {
    this.orderService.resolveGuestRequest(id);
  }

  quickClockIn(): void {
    if (!this.currentUser) return;
    this.staffService.clockInStaff(this.currentUser.id);
    this.showClockInModal = false;
    alert(`Successfully clocked in as ${this.currentUser.full_name} at ${new Date().toLocaleTimeString()}!`);
  }

  toggleUserDropdown(): void {
    this.showUserDropdown = !this.showUserDropdown;
  }

  switchRole(role: any, name: string): void {
    this.authService.switchUserRole(role, name);
    this.showUserDropdown = false;
    let target = '/orders';
    if (role === 'KITCHEN_CHEF') target = '/kds';
    else if (role === 'WAITER') target = '/tables';
    else if (role === 'SUPER_ADMIN') target = '/super-admin';
    else if (role === 'STORE_KEEPER') target = '/inventory';
    else if (role === 'ACCOUNTANT') target = '/accounting';
    this.router.navigate([target]);
  }

  switchCafe(cafeId: string): void {
    this.tenantService.switchTenant(cafeId);
    this.showUserDropdown = false;
    alert(`Switched active cafe tenant to: ${this.tenantService.currentOrg.name}`);
  }

  logout(): void {
    this.showUserDropdown = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
