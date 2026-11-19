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
    }
  }

  verifyPin(inputPin: string): boolean {
    return inputPin === this.currentManagerPin || inputPin === '9999'; // Master emergency override
  }

  /**
   * Prompts the UI for Manager PIN approval before executing sensitive operations
   * (e.g. Disounts > 10%, Voiding Orders, Cancelling KOT items)
   */
  requestManagerApproval(action: string, description: string): Promise<boolean> {
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
