import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Organization, Branch, BranchFeatureFlags, SaasTenantSummary } from '../models/tenant.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class TenantService {
  private readonly STORAGE_KEY_TENANTS = 'orderrestro_saas_tenants_v2';
  private readonly STORAGE_KEY_ACTIVE_ORG = 'orderrestro_active_org_id_v2';

  // Master Initial Cafes / Tenants
  private readonly defaultTenants: SaasTenantSummary[] = [
    {
      id: 'org-default',
      name: 'Restaurant POS',
      slug: 'restaurant-pos',
      owner_name: 'Store Owner',
      owner_email: 'owner@restaurantpos.com',
      owner_phone: '+91 98000 00000',
      tier: 'GROWTH',
      subscription_status: 'ACTIVE',
      subscription_ends_at: '2026-12-31T23:59:59Z',
      max_branches: 1,
      is_active: true,
      active_outlets: 1,
      monthly_revenue: 0,
      city: 'Main Branch',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      branches: [
        {
          id: 'branch-01',
          organization_id: 'org-default',
          name: 'Main Outlet',
          code: 'MAIN-01',
          address: 'Main Commercial High Street',
          city: 'Main Outlet',
          state: '',
          postal_code: '400001',
          phone: '+91 98000 00000',
          email: 'owner@restaurantpos.com',
          tax_regime: 'INDIA_GST',
          is_tax_inclusive: false,
          default_cgst_pct: 2.50,
          default_sgst_pct: 2.50,
          upi_vpa: '',
          upi_payee_name: '',
          currency: 'INR',
          currency_symbol: '₹',
          timezone: 'Asia/Kolkata',
          feature_flags: {
            enable_tables: true,
            enable_kds: true,
            enable_inventory: true,
            enable_staff: true,
            enable_crm: true,
            enable_qr: true,
            enable_accounting: true
          },
          is_active: true,
          created_at: '2026-01-01T00:00:00Z'
        }
      ]
    }
  ];

  private tenantsSubject = new BehaviorSubject<SaasTenantSummary[]>([]);
  tenants$: Observable<SaasTenantSummary[]> = this.tenantsSubject.asObservable();

  private currentOrgSubject = new BehaviorSubject<Organization>(this.defaultTenants[0]);
  private branchesSubject = new BehaviorSubject<Branch[]>(this.defaultTenants[0].branches || []);
  private activeBranchSubject = new BehaviorSubject<Branch>(this.defaultTenants[0].branches![0]);

  currentOrg$: Observable<Organization> = this.currentOrgSubject.asObservable();
  branches$: Observable<Branch[]> = this.branchesSubject.asObservable();
  activeBranch$: Observable<Branch> = this.activeBranchSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.initTenants();
  }

  get currentOrg(): Organization {
    return this.currentOrgSubject.value;
  }

  get activeBranch(): Branch {
    return this.activeBranchSubject.value;
  }

  get currentBranch(): Branch {
    return this.activeBranchSubject.value;
  }

  private initTenants(): void {
    let loadedTenants: SaasTenantSummary[] = [];

    // 1. Try reading from localStorage for instant persistent restore on page refresh
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY_TENANTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Purge any legacy 'Brew & Beans' or 'org-cafe-01'
          loadedTenants = parsed.filter((t: any) => t.id !== 'org-cafe-01' && !t.name?.toLowerCase().includes('brew & beans') && t.slug !== 'brew-and-beans');
          this.saveTenantsLocally(loadedTenants);
        }
      }
    } catch {}

    if (loadedTenants.length === 0) {
      loadedTenants = this.defaultTenants;
      this.saveTenantsLocally(loadedTenants);
    }

    this.tenantsSubject.next(loadedTenants);

    // 2. Restore active organization if previously selected
    try {
      const savedOrgId = localStorage.getItem(this.STORAGE_KEY_ACTIVE_ORG);
      if (savedOrgId && savedOrgId !== 'org-cafe-01') {
        const found = loadedTenants.find(t => t.id === savedOrgId);
        if (found) {
          this.switchTenant(found.id);
        } else if (loadedTenants.length > 0) {
          this.switchTenant(loadedTenants[0].id);
        }
      } else if (loadedTenants.length > 0) {
        this.switchTenant(loadedTenants[0].id);
      }
    } catch {}

    // 3. Cloud Supabase Sync
    this.fetchCloudOrganizations();
  }

  private async fetchCloudOrganizations(): Promise<void> {
    const client = this.supabaseService.client;
    if (client) {
      try {
        const { data, error } = await this.supabaseService.from('organizations').select('*');
        if (!error && data && data.length > 0) {
          // Filter out legacy dummy tenants
          const cleanData = data.filter((org: any) => org.id !== 'org-cafe-01' && !org.name?.toLowerCase().includes('brew & beans') && org.slug !== 'brew-and-beans');
          
          const current = this.tenantsSubject.value.filter(t => t.id !== 'org-cafe-01' && !t.name?.toLowerCase().includes('brew & beans') && (cleanData.length > 0 ? t.id !== 'org-default' : true));
          const merged = [...current];

          for (const org of cleanData) {
            const idx = merged.findIndex((m: any) => m.id === org.id);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...org };
            } else {
              merged.push({
                ...org,
                active_outlets: org.active_outlets || 1,
                monthly_revenue: Number(org.monthly_revenue) || 0,
                city: org.city || 'Outlet'
              });
            }
          }

          if (merged.length > 0) {
            this.tenantsSubject.next(merged);
            this.saveTenantsLocally(merged);
          }
        }
      } catch (err) {
        console.warn('⚠️ [Tenant] Could not sync cloud organizations:', err);
      }
    }
  }

  private saveTenantsLocally(tenants: SaasTenantSummary[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_TENANTS, JSON.stringify(tenants));
    } catch {}
  }

  /**
   * Registers a brand new restaurant/cafe client and provisions its flagship branch
   * Persists both locally to localStorage and cloud to Supabase PostgreSQL organizations table
   */
  addTenant(newTenant: SaasTenantSummary): void {
    const defaultFlags: BranchFeatureFlags = {
      enable_tables: true,
      enable_kds: true,
      enable_inventory: true,
      enable_staff: true,
      enable_crm: true,
      enable_qr: true,
      enable_accounting: true
    };

    const defaultBranch: Branch = {
      id: `branch-${Date.now()}`,
      organization_id: newTenant.id,
      name: `${newTenant.name} (Main Outlet)`,
      code: `${newTenant.slug.substring(0, 4).toUpperCase()}-01`,
      address: `Main Commercial High Street`,
      city: newTenant.city || 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400001',
      phone: newTenant.owner_phone || '+91 98000 00000',
      email: newTenant.owner_email,
      tax_regime: 'INDIA_GST',
      is_tax_inclusive: false,
      default_cgst_pct: 2.50,
      default_sgst_pct: 2.50,
      currency: 'INR',
      currency_symbol: '₹',
      timezone: 'Asia/Kolkata',
      feature_flags: defaultFlags,
      is_active: true,
      created_at: new Date().toISOString()
    };

    newTenant.branches = [defaultBranch];

    // Prepend to tenants list
    const updated = [newTenant, ...this.tenantsSubject.value];
    this.tenantsSubject.next(updated);
    this.saveTenantsLocally(updated);

    // Asynchronously insert into Supabase Cloud
    this.saveTenantToSupabase(newTenant);
  }

  private async saveTenantToSupabase(tenant: SaasTenantSummary): Promise<void> {
    const client = this.supabaseService.client;
    if (client) {
      try {
        await this.supabaseService.from('organizations').upsert({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          owner_name: tenant.owner_name,
          owner_email: tenant.owner_email,
          owner_phone: tenant.owner_phone,
          tier: tenant.tier,
          subscription_status: tenant.subscription_status,
          trial_ends_at: tenant.trial_ends_at,
          subscription_ends_at: tenant.subscription_ends_at,
          max_branches: tenant.max_branches,
          is_active: tenant.is_active,
          active_outlets: tenant.active_outlets,
          monthly_revenue: tenant.monthly_revenue,
          city: tenant.city,
          created_at: tenant.created_at,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('⚠️ [Tenant] Could not save tenant to Supabase:', e);
      }
    }
  }

  toggleTenantStatus(tenantId: string): void {
    const list = this.tenantsSubject.value.map(t => {
      if (t.id === tenantId) {
        const nextActive = !t.is_active;
        return {
          ...t,
          is_active: nextActive,
          subscription_status: (nextActive ? 'ACTIVE' : 'CANCELLED') as any
        };
      }
      return t;
    });

    this.tenantsSubject.next(list);
    this.saveTenantsLocally(list);

    const changed = list.find(t => t.id === tenantId);
    if (changed) {
      this.saveTenantToSupabase(changed);
    }
  }

  setActiveBranch(branchId: string): void {
    const found = this.branchesSubject.value.find(b => b.id === branchId);
    if (found) {
      this.activeBranchSubject.next(found);
    }
  }

  updateFeatureFlags(flags: Partial<BranchFeatureFlags>): void {
    const active = this.activeBranchSubject.value;
    active.feature_flags = { ...active.feature_flags, ...flags };
    this.activeBranchSubject.next({ ...active });
    try {
      localStorage.setItem(`cafe_flags_${active.id}`, JSON.stringify(active.feature_flags));
    } catch (e) {}
  }

  /**
   * Switches the active restaurant/organization across the entire application
   */
  switchTenant(orgId: string, persist: boolean = true): void {
    const found = this.tenantsSubject.value.find(c => c.id === orgId) || this.defaultTenants[0];

    const newOrg: Organization = {
      id: found.id,
      name: found.name,
      slug: found.slug,
      owner_name: found.owner_name,
      owner_email: found.owner_email,
      owner_phone: found.owner_phone,
      tier: found.tier,
      subscription_status: found.subscription_status,
      max_branches: found.max_branches,
      is_active: found.is_active,
      created_at: found.created_at,
      updated_at: found.updated_at
    };

    const defaultFlags: BranchFeatureFlags = {
      enable_tables: true,
      enable_kds: true,
      enable_inventory: true,
      enable_staff: true,
      enable_crm: true,
      enable_qr: true,
      enable_accounting: true
    };

    let branchesToUse: Branch[] = found.branches || [];
    if (branchesToUse.length === 0) {
      branchesToUse = [
        {
          id: `branch-${found.id}`,
          organization_id: found.id,
          name: `${found.name} (Main Outlet)`,
          code: `${found.slug.substring(0, 4).toUpperCase()}-01`,
          address: 'Main Commercial High Street',
          city: found.city || 'Mumbai',
          state: 'Maharashtra',
          postal_code: '400001',
          phone: found.owner_phone || '+91 98000 00000',
          email: found.owner_email,
          tax_regime: 'INDIA_GST',
          is_tax_inclusive: false,
          default_cgst_pct: 2.50,
          default_sgst_pct: 2.50,
          currency: 'INR',
          currency_symbol: '₹',
          timezone: 'Asia/Kolkata',
          feature_flags: defaultFlags,
          is_active: true,
          created_at: found.created_at
        }
      ];
    }

    const branchesWithFlags: Branch[] = branchesToUse.map(b => ({
      ...b,
      feature_flags: b.feature_flags || defaultFlags
    }));

    this.currentOrgSubject.next(newOrg);
    this.branchesSubject.next(branchesWithFlags);
    this.activeBranchSubject.next(branchesWithFlags[0]);

    if (persist) {
      try {
        localStorage.setItem(this.STORAGE_KEY_ACTIVE_ORG, orgId);
      } catch {}
    }
  }

  updateBranchSettings(updated: Partial<Branch>): void {
    const current = this.activeBranchSubject.value;
    const merged: Branch = { ...current, ...updated };
    this.activeBranchSubject.next(merged);

    const updatedList = this.branchesSubject.value.map(b => b.id === merged.id ? merged : b);
    this.branchesSubject.next(updatedList);
  }
}
