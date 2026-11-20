import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiService } from '../../../core/services/ui.service';
import { Branch, Organization, BranchFeatureFlags } from '../../../core/models/tenant.model';
import { AppUser, UserRole } from '../../../core/models/auth.model';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: string;
  roles: UserRole[];
  flag?: keyof BranchFeatureFlags;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  currentOrg: Organization | null = null;
  activeBranch: Branch | null = null;
  branches: Branch[] = [];
  currentUser: AppUser | null = null;
  isMobileOpen = false;

  navItems: NavItem[] = [
    { label: 'SaaS Platform Control', route: '/super-admin', icon: 'ri-vip-crown-line', badge: 'OWNER', roles: ['SUPER_ADMIN'] },
    { label: 'Dashboard', route: '/analytics', icon: 'ri-dashboard-3-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'] },
    { label: 'Point of Sale', route: '/orders', icon: 'ri-shopping-cart-2-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER'] },
    { label: 'Tables', route: '/tables', icon: 'ri-layout-grid-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'WAITER', 'CASHIER'], flag: 'enable_tables' },
    { label: 'Menu', route: '/menu', icon: 'ri-restaurant-2-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_CHEF'] },
    { label: 'Kitchen Display', route: '/kds', icon: 'ri-fire-line', badge: 'LIVE', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_CHEF'], flag: 'enable_kds' },
    { label: 'Customers', route: '/crm', icon: 'ri-user-heart-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER'], flag: 'enable_crm' },
    { label: 'Inventory', route: '/inventory', icon: 'ri-box-3-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'STORE_KEEPER', 'KITCHEN_CHEF'], flag: 'enable_inventory' },
    { label: 'Staff Management', route: '/staff', icon: 'ri-team-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'], flag: 'enable_staff' },
    { label: 'Accounting & Cash', route: '/accounting', icon: 'ri-money-rupee-circle-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER'], flag: 'enable_accounting' },
    { label: 'Online QR Dine-in', route: '/qr-order', icon: 'ri-qr-code-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'WAITER', 'CASHIER'], flag: 'enable_qr' },
    { label: 'Settings', route: '/admin', icon: 'ri-settings-4-line', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'] }
  ];

  constructor(
    public tenantService: TenantService,
    public authService: AuthService,
    public uiService: UiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.tenantService.currentOrg$.subscribe(org => this.currentOrg = org);
    this.tenantService.activeBranch$.subscribe(b => this.activeBranch = b);
    this.tenantService.branches$.subscribe(bList => this.branches = bList);
    this.authService.currentUser$.subscribe(u => this.currentUser = u);
    this.uiService.sidebarOpen$.subscribe(open => this.isMobileOpen = open);
  }

  // Filter based on RBAC and active Branch Feature Toggles
  get filteredNavItems(): NavItem[] {
    const role = this.currentUser?.role;
    if (!role) return [];

    const flags = this.activeBranch?.feature_flags;

    return this.navItems.filter(item => {
      // 1. Role Check
      if (!item.roles.includes(role)) {
        return false;
      }
      // 2. Feature Toggle Check (Hide disabled modules)
      if (item.flag && flags && flags[item.flag] === false) {
        return false;
      }
      return true;
    });
  }

  get branchOptions(): { label: string; value: string; icon: string }[] {
    return this.branches.map(b => ({
      label: b.name,
      value: b.id,
      icon: 'ri-building-line'
    }));
  }

  onBranchSelect(branchId: string): void {
    this.tenantService.setActiveBranch(branchId);
  }

  closeSidebar(): void {
    this.uiService.closeSidebar();
  }

  onNavClick(): void {
    if (window.innerWidth <= 900) {
      this.uiService.closeSidebar();
    }
  }

  lockTerminal(): void {
    this.onNavClick();
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
