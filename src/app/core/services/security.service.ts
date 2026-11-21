import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

export interface AuditLog {
  id: string;
  organization_id: string;
  branch_id: string;
  action_type: string;
  authorized_by_pin?: string;
  authorized_user_name?: string;
  details: any;
  created_at: string;
}

export interface SecurityApprovalRequest {
  action: string;
  description: string;
  resolve: (approved: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class SecurityService {
  private readonly PIN_STORAGE_KEY = 'orderrestro_manager_pin_v1';
  private defaultManagerPin = '1234';

  private activeApprovalRequestSubject = new BehaviorSubject<SecurityApprovalRequest | null>(null);
  activeApprovalRequest$: Observable<SecurityApprovalRequest | null> = this.activeApprovalRequestSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {}

  get currentManagerPin(): string {
    try {
      return localStorage.getItem(this.PIN_STORAGE_KEY) || this.defaultManagerPin;
    } catch {
      return this.defaultManagerPin;
    }
  }

  setManagerPin(newPin: string): void {
    if (newPin && newPin.length >= 4) {
      try {
        localStorage.setItem(this.PIN_STORAGE_KEY, newPin);
      } catch {}

      // Cloud Sync: Update manager PIN in Supabase for this organization
      if (this.supabaseService.client) {
        const orgId = this.tenantService.currentOrg?.id;
        if (orgId && orgId !== 'org-default') {
          this.supabaseService.from('app_users')
            .update({ manager_pin: newPin })
            .eq('organization_id', orgId)
            .in('role', ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'RESTAURANT_MANAGER'])
            .then().catch();
        }
      }
    }
  }

  verifyPin(inputPin: string): boolean {
    if (!inputPin) return false;
    const cleanPin = inputPin.trim();

    // 1. Verify against configured Manager PIN
    if (cleanPin === this.currentManagerPin) {
      return true;
    }

    // 2. Verify against active registered managers/admins from local cache (Correct Key!)
    try {
      const orgId = this.tenantService.currentOrg?.id || 'org-default';
      const keysToCheck = [
        `orderrestro_staff_members_${orgId}`,
        `orderrestro_staff_v1_${orgId}`,
        'orderrestro_registered_users_v3',
        'orderrestro_registered_users_v2'
      ];

      for (const k of keysToCheck) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const isAuthorized = parsed.some((item: any) => {
            const s = item.user || item;
            const pinMatch = (s.pin === cleanPin || s.manager_pin === cleanPin || item.passwordPlain === cleanPin);
            const isManagerRole = ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'RESTAURANT_MANAGER'].includes(s.role);
            return s.is_active !== false && isManagerRole && pinMatch;
          });
          if (isAuthorized) return true;
        }
      }
    } catch {}

    return false;
  }

  /**
   * Real Supabase Cloud verification for Manager PIN authorization
   */
  async verifyPinCloud(inputPin: string): Promise<boolean> {
    if (!inputPin) return false;
    const cleanPin = inputPin.trim();

    // 1. Instant local check
    if (this.verifyPin(cleanPin)) return true;

    // 2. Verify directly against Supabase Cloud app_users
    if (this.supabaseService.client) {
      try {
        const orgId = this.tenantService.currentOrg?.id;
        let query = this.supabaseService.from('app_users')
          .select('id, role, pin, manager_pin, is_active')
          .eq('is_active', true)
          .or(`pin.eq.${cleanPin},manager_pin.eq.${cleanPin}`);
        if (orgId && orgId !== 'org-default') {
          query = query.eq('organization_id', orgId);
        }
        const { data, error } = await query.limit(5);
        if (!error && data && data.length > 0) {
          const isAuthorized = data.some((u: any) =>
            ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'RESTAURANT_MANAGER'].includes(u.role)
          );
          if (isAuthorized) return true;
        }
      } catch (e) {
        console.warn('⚠️ [SecurityService] Cloud PIN verification fallback to local:', e);
      }
    }

    return false;
  }

  /**
   * Prompts the UI for Manager PIN approval before executing sensitive operations
   * Auto-approves without dialog if the logged-in user is already an Owner / Admin / Manager
   */
  requestManagerApproval(action: string, description: string): Promise<boolean> {
    try {
      const savedSession = localStorage.getItem('orderrestro_session_v3');
      if (savedSession) {
        const env = JSON.parse(savedSession);
        const role = env?.user?.role;
        // If logged in as Admin / Owner / Manager, auto-approve directly without blocking the cashier
        if (role === 'ORG_ADMIN' || role === 'BRANCH_MANAGER' || role === 'SUPER_ADMIN') {
          return Promise.resolve(true);
        }
      }
    } catch {}

    return new Promise((resolve) => {
      this.activeApprovalRequestSubject.next({
        action,
        description,
        resolve: (approved: boolean) => {
          this.activeApprovalRequestSubject.next(null);
          resolve(approved);
        }
      });
    });
  }

  cancelApprovalRequest(): void {
    const current = this.activeApprovalRequestSubject.value;
    if (current) {
      current.resolve(false);
      this.activeApprovalRequestSubject.next(null);
    }
  }

  async logAudit(actionType: string, details: any, authorizedByPin?: string, managerName: string = 'Authorized Manager'): Promise<void> {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: orgId,
      branch_id: branchId,
      action_type: actionType,
      authorized_by_pin: authorizedByPin ? '****' : undefined,
      authorized_user_name: managerName,
      details,
      created_at: new Date().toISOString()
    };

    console.warn(`🔒 [Security Audit] ${actionType}:`, details);

    // Save locally
    try {
      const logsKey = 'orderrestro_audit_logs_v1';
      const existing = JSON.parse(localStorage.getItem(logsKey) || '[]');
      existing.unshift(log);
      localStorage.setItem(logsKey, JSON.stringify(existing.slice(0, 100)));
    } catch {}

    // Save to Supabase
    if (this.supabaseService.client) {
      try {
        await this.supabaseService.from('audit_logs').insert([log]);
      } catch (err) {
        console.warn('Could not persist audit log to Supabase:', err);
      }
    }
  }
}
