import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SaasTenantSummary, SubscriptionTier } from '../../core/models/tenant.model';
import { AppUser } from '../../core/models/auth.model';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/services/auth.service';
import { MenuService } from '../../core/services/menu.service';
import { TableService } from '../../core/services/table.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-super-admin',
  templateUrl: './super-admin.component.html',
  styleUrls: ['./super-admin.component.scss']
})
export class SuperAdminComponent implements OnInit, OnDestroy {
  // SaaS Metrics
  totalCafes: number = 0;
  totalOutlets: number = 0;
  mrrAmount: number = 0;
  activeTrialsCount: number = 0;

  // Tenants List (Persistent via TenantService)
  tenants: SaasTenantSummary[] = [];
  private subs = new Subscription();

  // Onboard Modal State
  showOnboardModal = false;
  newCafeName = '';
  newOwnerName = '';
  newEmail = '';
  newPhone = '';
  newPassword = '';
  showPassword = false;
  newCity = 'Mumbai';
  newTier: SubscriptionTier = 'GROWTH';
  newMaxBranches = 1;

  // Handover Credentials Modal State (For ID & Password distribution)
  showCredentialsModal = false;
  copiedNotice = false;
  createdCredentials: {
    cafeName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    managerPin: string;
    loginUrl: string;
    tier: string;
    tenantId: string;
  } | null = null;

  // Starter Templates Setup (Defaults to TRUE so new restaurant immediately has live menu & tables)
  seedStarterMenu: boolean = true;
  seedStarterTables: boolean = true;

  tierOptions = [
    { label: '14-Day Free Trial (₹0)', value: 'TRIAL', icon: 'ri-time-line', subtext: 'Full feature trial' },
    { label: 'Starter Plan (₹1,499 / Mo)', value: 'STARTER', icon: 'ri-vip-diamond-line', subtext: '1 branch included' },
    { label: 'Growth Plan (₹2,999 / Mo)', value: 'GROWTH', icon: 'ri-vip-crown-line', subtext: 'Up to 3 branches' },
    { label: 'Enterprise Multi-Outlet (₹4,999 / Mo)', value: 'ENTERPRISE', icon: 'ri-building-line', subtext: 'Unlimited outlets' }
  ];

  constructor(
    public tenantService: TenantService,
    public authService: AuthService,
    public menuService: MenuService,
    public tableService: TableService,
    private router: Router,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.tenantService.tenants$.subscribe(list => {
        this.tenants = list;
        this.recalculateSaaSStats();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  recalculateSaaSStats(): void {
    this.totalCafes = this.tenants.length;
    this.totalOutlets = this.tenants.reduce((sum, t) => sum + (t.active_outlets || 1), 0);
    this.mrrAmount = this.tenants.reduce((sum, t) => sum + (t.is_active ? t.monthly_revenue : 0), 0);
    this.activeTrialsCount = this.tenants.filter(t => t.tier === 'TRIAL').length;
  }

  toggleTenantStatus(tenant: SaasTenantSummary): void {
    this.tenantService.toggleTenantStatus(tenant.id);
  }

  generateRandomPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const cleanName = this.newCafeName ? this.newCafeName.split(' ')[0].replace(/[^a-zA-Z]/g, '') : 'Cafe';
    const prefix = cleanName.length >= 3 ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase() : 'Cafe';
    this.newPassword = `${prefix}#${rand}`;
  }

  openOnboardModal(): void {
    this.newCafeName = '';
    this.newOwnerName = '';
    this.newPhone = '';
    this.newEmail = '';
    this.newCity = 'Mumbai';
    this.newTier = 'GROWTH';
    this.newMaxBranches = 1;
    this.newPassword = '';
    this.seedStarterMenu = false;
    this.seedStarterTables = false;
    this.showPassword = false;
    this.showOnboardModal = true;
  }

  onboardNewCafe(): void {
    if (!this.newCafeName.trim() || !this.newOwnerName.trim() || !this.newPhone.trim()) {
      this.toast.warning('Please fill cafe name, owner name and phone number.');
      return;
    }

    const priceMap: Record<SubscriptionTier, number> = {
      STARTER: 1499,
      GROWTH: 2999,
      ENTERPRISE: 4999,
      TRIAL: 0
    };

    const newSlug = this.newCafeName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const finalEmail = (this.newEmail.trim() || `${newSlug}@cafeclient.com`).toLowerCase();
    const finalPassword = this.newPassword.trim() || `Cafe#${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedPin = String(Math.floor(1000 + Math.random() * 9000));

    const newTenant: SaasTenantSummary = {
      id: `org-cafe-${Date.now()}`,
      name: this.newCafeName.trim(),
      slug: newSlug,
      owner_name: this.newOwnerName.trim(),
      owner_email: finalEmail,
      owner_phone: this.newPhone.trim(),
      tier: this.newTier,
      subscription_status: 'ACTIVE',
      trial_ends_at: this.newTier === 'TRIAL' ? new Date(Date.now() + 14 * 86400000).toISOString() : undefined,
      subscription_ends_at: this.newTier !== 'TRIAL' ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined,
      max_branches: Number(this.newMaxBranches) || 1,
      is_active: true,
      active_outlets: 1,
      monthly_revenue: priceMap[this.newTier],
      city: this.newCity.trim() || 'Mumbai',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. Persist Tenant to TenantService (saved in localStorage & synced to Supabase)
    this.tenantService.addTenant(newTenant);

    // 2. Register Owner Login Account with Credentials in AuthService (saved in localStorage & synced to Supabase)
    const ownerUser: AppUser = {
      id: `usr-owner-${Date.now()}`,
      organization_id: newTenant.id,
      branch_id: newTenant.branches?.[0]?.id || `branch-${Date.now()}`,
      full_name: `${newTenant.owner_name} (Owner & Admin)`,
      email: finalEmail,
      phone: newTenant.owner_phone,
      role: 'ORG_ADMIN',
      hourly_rate: 0,
      is_active: true,
      created_at: new Date().toISOString()
    };
    this.authService.registerUser(ownerUser, finalPassword);

    // 3. Optionally provision Starter Templates (Tables & Menu)
    if (this.seedStarterTables) {
      this.tableService.seedStarterTablesForTenant(newTenant.id, ownerUser.branch_id);
    }
    if (this.seedStarterMenu) {
      this.menuService.seedStarterMenuForTenant(newTenant.id);
    }

    // 3. Show Credential Handover Card for SuperAdmin
    const originUrl = window.location.origin;
    this.createdCredentials = {
      cafeName: newTenant.name,
      ownerName: newTenant.owner_name,
      email: finalEmail,
      phone: newTenant.owner_phone,
      password: finalPassword,
      managerPin: generatedPin,
      loginUrl: `${originUrl}/login`,
      tier: newTenant.tier,
      tenantId: newTenant.id
    };

    this.showOnboardModal = false;
    this.showCredentialsModal = true;
    this.copiedNotice = false;
  }

  copyCredentialsToClipboard(): void {
    if (!this.createdCredentials) return;

    const c = this.createdCredentials;
    const shareMessage = `🏪 *Welcome to ${c.cafeName}!*
Your Restaurant POS & Cloud ERP instance is active on the *${c.tier}* plan.

*Owner Login Credentials:*
🌐 *Login Portal:* ${c.loginUrl}
📧 *User ID / Email:* ${c.email}
🔒 *Password:* ${c.password}
🔢 *Manager Override PIN:* ${c.managerPin}

_Please keep your credentials safe and bookmark the portal link._`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareMessage).then(() => {
        this.copiedNotice = true;
        this.toast.success('Restaurant credentials copied to clipboard!', 'Credentials Copied');
        setTimeout(() => this.copiedNotice = false, 3500);
      });
    } else {
      this.toast.info(`Email: ${c.email} | Password: ${c.password} | URL: ${c.loginUrl}`, 'Credentials');
    }
  }

  switchToCreatedCafe(tenantId: string): void {
    this.showCredentialsModal = false;
    this.tenantService.switchTenant(tenantId);
    this.router.navigate(['/orders']);
  }

  getTenantExpiry(t: SaasTenantSummary): string | undefined {
    return t.subscription_ends_at || t.trial_ends_at;
  }
}
