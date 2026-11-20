import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { StaffService } from '../../../core/services/staff.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { UiService } from '../../../core/services/ui.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { Branch, Organization } from '../../../core/models/tenant.model';
import { AppUser } from '../../../core/models/auth.model';
import { GuestRequest } from '../../../core/models/order.model';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentOrg!: Organization;
  activeBranch!: Branch;
  branches: Branch[] = [];
  currentUser: AppUser | null = null;
  guestRequests: GuestRequest[] = [];
  showRequestsDropdown = false;
  showClockInModal = false;
  currentTimeString = '';

  showUserDropdown = false;
  private subs = new Subscription();
  private clockTimer: any = null;

  constructor(
    public tenantService: TenantService,
    public authService: AuthService,
    public orderService: OrderService,
    public staffService: StaffService,
    public supabaseService: SupabaseService,
    public uiService: UiService,
    public offlineSync: OfflineSyncService,
    public router: Router,
    private toast: ToastService
  ) {}

  async syncOfflineOrders(): Promise<void> {
    const synced = await this.offlineSync.autoSync();
    if (synced > 0) {
      this.toast.success(`Synced ${synced} offline orders to cloud successfully!`, 'Cloud Synced');
    } else {
      this.toast.info('Local offline order queue is clean.', 'Queue Up to Date');
    }
  }

  ngOnInit(): void {
    this.subs.add(this.tenantService.currentOrg$.subscribe(org => this.currentOrg = org));
    this.subs.add(this.tenantService.activeBranch$.subscribe(b => this.activeBranch = b));
    this.subs.add(this.tenantService.branches$.subscribe(list => this.branches = list));
    this.subs.add(this.authService.currentUser$.subscribe(u => this.currentUser = u));
    this.subs.add(this.orderService.guestRequests$.subscribe(reqs => this.guestRequests = reqs));

    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
    this.subs.unsubscribe();
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
    this.toast.success(`Clocked in as ${this.currentUser.full_name}!`, 'Clock-in Confirmed');
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
    this.toast.info(`Switched role to ${role} (${name})`, 'Role Changed');
  }

  switchCafe(cafeId: string): void {
    this.tenantService.switchTenant(cafeId);
    this.showUserDropdown = false;
    this.toast.success(`Switched active cafe tenant to: ${this.tenantService.currentOrg.name}`, 'Tenant Switched');
  }

  logout(): void {
    this.showUserDropdown = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
