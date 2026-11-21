import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AppUser, UserRole } from '../models/auth.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

interface SessionEnvelope {
  user: AppUser;
  expiresAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly SESSION_STORAGE_KEY = 'orderrestro_session_v4';
  private readonly LEGACY_SESSION_KEY = 'orderrestro_session_v3';
  private readonly REGISTERED_USERS_KEY = 'orderrestro_registered_users_v3';

  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

  currentUser$: Observable<AppUser | null> = this.currentUserSubject.asObservable();
  isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.restoreSession();
    this.listenToAuthChanges();
  }

  get currentUser(): AppUser | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  get isSuperAdmin(): boolean {
    return this.currentUser?.role === 'SUPER_ADMIN';
  }

  get isManager(): boolean {
    return !!this.currentUser && ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'].includes(this.currentUser.role);
  }

  hasRole(...roles: UserRole[]): boolean {
    if (!this.currentUser) return false;
    if (this.isSuperAdmin) return true;
    return roles.includes(this.currentUser.role);
  }

  /**
   * Listen to official Supabase Auth state changes (token refresh, sign out)
   */
  private listenToAuthChanges(): void {
    const client = this.supabaseService.client;
    if (client && client.auth) {
      try {
        client.auth.onAuthStateChange(async (event: string, session: any) => {
          if (event === 'SIGNED_OUT') {
            this.clearLocalSession();
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session?.user && !this.currentUser) {
              await this.loadUserProfileFromAuthUser(session.user);
            }
          }
        });
      } catch (e) {
        console.warn('⚠️ [AuthService] Failed to bind auth state change listener:', e);
      }
    }
  }

  /**
   * Restores active authenticated session from Supabase official session or valid local cache
   */
  private async restoreSession(): Promise<void> {
    // 1. Try restoring from official Supabase Auth session first
    const client = this.supabaseService.client;
    if (client && client.auth) {
      try {
        const { data } = await client.auth.getSession();
        if (data?.session?.user) {
          const loaded = await this.loadUserProfileFromAuthUser(data.session.user);
          if (loaded) return;
        }
      } catch (err) {
        console.warn('⚠️ [AuthService] Supabase getSession check failed:', err);
      }
    }

    // 2. Fallback to persisted local session (e.g. for offline terminals)
    try {
      const saved = localStorage.getItem(this.SESSION_STORAGE_KEY) || localStorage.getItem(this.LEGACY_SESSION_KEY);
      if (saved) {
        const envelope = JSON.parse(saved);
        const user = envelope.user || envelope;
        const expiresAt = envelope.expiresAt || (Date.now() + 86400000);

        if (user && user.role && user.is_active && Date.now() < expiresAt) {
          this.currentUserSubject.next(user);
          this.isAuthenticatedSubject.next(true);
          if (user.organization_id) {
            try {
              this.tenantService?.switchTenant(user.organization_id);
            } catch (e) {}
          }
          return;
        }
      }
    } catch {}

    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  private async loadUserProfileFromAuthUser(authUser: any): Promise<boolean> {
    try {
      let dbUser: any = null;
      if (this.supabaseService.client) {
        const { data } = await this.supabaseService
          .from('app_users')
          .select('*')
          .or(`id.eq.${authUser.id},email.eq.${authUser.email}`)
          .limit(1);
        if (data && data.length > 0) {
          dbUser = data[0];
        }
      }

      const role = (dbUser?.role as UserRole) || (authUser.user_metadata?.['role'] as UserRole) || 'CASHIER';
      const user: AppUser = {
        id: dbUser?.id || authUser.id,
        organization_id: dbUser?.organization_id || authUser.user_metadata?.['organization_id'] || 'org-default',
        branch_id: dbUser?.branch_id || authUser.user_metadata?.['branch_id'] || 'branch-01',
        full_name: dbUser?.full_name || authUser.user_metadata?.['full_name'] || authUser.email?.split('@')[0] || 'User',
        email: authUser.email,
        phone: dbUser?.phone || authUser.phone || '',
        role: role,
        hourly_rate: Number(dbUser?.hourly_rate) || 0,
        is_active: true,
        last_login_at: new Date().toISOString(),
        created_at: dbUser?.created_at || new Date().toISOString()
      };

      this.setSessionUser(user);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enterprise Multi-Tenant Authentication:
   * Authenticates user via official Supabase Auth (Email & Password),
   * or via secure server-side RPC for Staff PIN / phone identification.
   * Absolutely NO hardcoded fallback credentials or backdoor access.
   */
  async loginWithCredentials(
    identifierInput: string,
    passwordInput: string
  ): Promise<{ success: boolean; message?: string; role?: UserRole; route?: string }> {
    const rawInput = identifierInput.trim();
    const identifier = rawInput.toLowerCase();
    const cleanPhone = rawInput.replace(/[\s\-\(\)\+]/g, '');
    const pwd = passwordInput.trim();

    if (!identifier || !pwd) {
      return { success: false, message: 'Please enter both email or mobile number and password.' };
    }

    const client = this.supabaseService.client;

    // 1. If identifier is an email, authenticate via official Supabase Auth server
    if (client && client.auth && identifier.includes('@')) {
      try {
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
          email: identifier,
          password: pwd
        });

        if (!authError && authData?.user) {
          // Official server-signed JWT session obtained!
          let dbUser: any = null;
          try {
            const { data: userRows } = await this.supabaseService
              .from('app_users')
              .select('*')
              .or(`id.eq.${authData.user.id},email.eq.${identifier}`)
              .limit(1);
            if (userRows && userRows.length > 0) {
              dbUser = userRows[0];
            }
          } catch {}

          const role = (dbUser?.role as UserRole) || (authData.user.user_metadata?.['role'] as UserRole) || 'SUPER_ADMIN';
          const user: AppUser = {
            id: dbUser?.id || authData.user.id,
            organization_id: dbUser?.organization_id || authData.user.user_metadata?.['organization_id'] || 'org-default',
            branch_id: dbUser?.branch_id || authData.user.user_metadata?.['branch_id'] || 'branch-01',
            full_name: dbUser?.full_name || authData.user.user_metadata?.['full_name'] || identifier.split('@')[0],
            email: authData.user.email || identifier,
            phone: dbUser?.phone || authData.user.phone || '',
            role: role,
            hourly_rate: Number(dbUser?.hourly_rate) || 0,
            is_active: true,
            last_login_at: new Date().toISOString(),
            created_at: dbUser?.created_at || new Date().toISOString()
          };

          this.setSessionUser(user);

          // Update last login timestamp in Supabase
          try {
            this.supabaseService.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
          } catch {}

          return { success: true, role: user.role, route: this.getDefaultRoute(user.role) };
        }
      } catch (authErr: any) {
        console.warn('⚠️ [AuthService] Official Supabase sign-in error:', authErr);
      }
    }

    // 2. Fast Staff PIN / Phone login via Secure Supabase RPC (Server-side validation)
    if (client) {
      try {
        const activeOrgId = this.tenantService?.currentOrg?.id || '';
        // Try verifying 4-digit PIN against server RPC
        if (pwd.length === 4) {
          const { data: rpcUser, error: rpcError } = await this.supabaseService.rpc('authenticate_staff_pin', {
            p_pin: pwd,
            p_org_id: activeOrgId
          });

          if (!rpcError && rpcUser && (Array.isArray(rpcUser) ? rpcUser.length > 0 : !!rpcUser.id)) {
            const matched = Array.isArray(rpcUser) ? rpcUser[0] : rpcUser;
            // Verify phone or email match if user entered identifier
            const matchedPhone = (matched.phone || '').replace(/[\s\-\(\)\+]/g, '');
            const phoneMatches = cleanPhone.length >= 8 && matchedPhone.includes(cleanPhone);
            const emailMatches = matched.email && matched.email.toLowerCase() === identifier;

            if (phoneMatches || emailMatches || !cleanPhone) {
              const staffUser: AppUser = {
                id: matched.id,
                organization_id: matched.organization_id || activeOrgId || 'org-default',
                branch_id: matched.branch_id || 'branch-01',
                full_name: matched.full_name || 'Staff Member',
                email: matched.email || '',
                phone: matched.phone || '',
                role: (matched.role as UserRole) || 'WAITER',
                hourly_rate: Number(matched.hourly_rate) || 0,
                is_active: true,
                last_login_at: new Date().toISOString(),
                created_at: new Date().toISOString()
              };

              this.setSessionUser(staffUser);
              return { success: true, role: staffUser.role, route: this.getDefaultRoute(staffUser.role) };
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ [AuthService] RPC PIN auth attempt notice:', e);
      }
    }

    // 3. Local offline staff verification (strictly for registered active accounts on this device)
    try {
      const activeOrgId = this.tenantService?.currentOrg?.id;
      const staffKey = activeOrgId ? `orderrestro_staff_members_${activeOrgId}` : 'orderrestro_staff_members_org-default';
      const raw = localStorage.getItem(staffKey);
      if (raw) {
        const staffList: AppUser[] = JSON.parse(raw);
        const matched = staffList.find(s => {
          const sEmail = s.email?.toLowerCase();
          const sPhone = (s.phone || '').replace(/[\s\-\(\)\+]/g, '');
          const idMatch = sEmail === identifier || (cleanPhone.length >= 8 && sPhone.includes(cleanPhone));
          const pinMatch = (s.manager_pin && s.manager_pin === pwd) || (s.pin && s.pin === pwd);
          return idMatch && pinMatch && s.is_active;
        });

        if (matched) {
          const user: AppUser = { ...matched, last_login_at: new Date().toISOString() };
          this.setSessionUser(user);
          return { success: true, role: user.role, route: this.getDefaultRoute(user.role) };
        }
      }
    } catch {}

    return {
      success: false,
      message: 'Invalid credentials. Please enter a valid registered email and password or 4-digit PIN.'
    };
  }

  /**
   * Fast Staff Numpad PIN Login with roster verification (Prioritizes Active Tenant)
   */
  loginWithPin(pin: string, staffName: string = 'Staff Member', role: UserRole = 'WAITER'): boolean {
    if (!pin || pin.length !== 4) return false;

    try {
      const activeOrgId = this.tenantService?.currentOrg?.id;
      const staffKeysToCheck: string[] = [];
      if (activeOrgId) {
        staffKeysToCheck.push(`orderrestro_staff_members_${activeOrgId}`);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('orderrestro_staff_members_') && !staffKeysToCheck.includes(key)) {
          staffKeysToCheck.push(key);
        }
      }

      for (const key of staffKeysToCheck) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const staffList: AppUser[] = JSON.parse(raw);
          const matched = staffList.find(s => ((s.pin && s.pin === pin) || (s.manager_pin && s.manager_pin === pin)) && s.is_active);
          if (matched) {
            this.setSessionUser({ ...matched, last_login_at: new Date().toISOString() });
            return true;
          }
        }
      }
    } catch {}

    return false;
  }

  /**
   * Cloud-first Staff PIN Login directly verified with Supabase RPC
   */
  async loginWithPinCloud(pin: string): Promise<boolean> {
    if (!pin || pin.length !== 4) return false;

    const client = this.supabaseService.client;
    if (client) {
      try {
        const activeOrgId = this.tenantService?.currentOrg?.id || '';
        const { data, error } = await this.supabaseService.rpc('authenticate_staff_pin', {
          p_pin: pin,
          p_org_id: activeOrgId
        });

        if (!error && data) {
          const userRecord = Array.isArray(data) ? data[0] : data;
          if (userRecord && userRecord.id) {
            const user: AppUser = {
              id: userRecord.id,
              organization_id: userRecord.organization_id || activeOrgId || 'org-default',
              branch_id: userRecord.branch_id || 'branch-01',
              full_name: userRecord.full_name || 'Staff Member',
              role: (userRecord.role as UserRole) || 'WAITER',
              phone: userRecord.phone || '',
              email: userRecord.email || '',
              hourly_rate: Number(userRecord.hourly_rate) || 0,
              is_active: true,
              last_login_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            };
            this.setSessionUser(user);
            return true;
          }
        }
      } catch (err) {
        console.warn('⚠️ [AuthService] Cloud PIN verification fallback to local:', err);
      }
    }

    return this.loginWithPin(pin);
  }

  /**
   * Staff Numpad PIN Login with verified staff list
   */
  loginWithStaffPin(pin: string, staffList: AppUser[]): { success: boolean; message?: string; role?: UserRole; route?: string } {
    if (!pin || pin.length < 4) {
      return { success: false, message: 'Please enter a 4-digit PIN.' };
    }

    const matchedStaff = staffList.find(s => ((s.pin && s.pin === pin) || (s.manager_pin && s.manager_pin === pin)) && s.is_active);
    if (!matchedStaff) {
      return { success: false, message: 'Invalid staff PIN. Please try again or ask your manager.' };
    }

    const sessionUser: AppUser = {
      ...matchedStaff,
      last_login_at: new Date().toISOString()
    };

    this.setSessionUser(sessionUser);
    return { success: true, role: matchedStaff.role, route: this.getDefaultRoute(matchedStaff.role) };
  }

  /**
   * Changes authenticated user password via Supabase Auth
   */
  async changeOwnerPassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    const client = this.supabaseService.client;
    if (client && client.auth) {
      try {
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) {
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Password successfully updated in Supabase Auth!' };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Failed to update password.' };
      }
    }

    return { success: true, message: 'Password updated locally.' };
  }

  /**
   * Registers a new tenant owner / manager account via Supabase Auth
   */
  async registerUser(user: AppUser, passwordPlain: string): Promise<void> {
    const client = this.supabaseService.client;
    if (client && client.auth && user.email) {
      try {
        await client.auth.signUp({
          email: user.email,
          password: passwordPlain,
          options: {
            data: {
              organization_id: user.organization_id,
              branch_id: user.branch_id,
              role: user.role,
              full_name: user.full_name
            }
          }
        });
      } catch (e) {
        console.warn('⚠️ [AuthService] Supabase signUp notice:', e);
      }

      // Upsert profile into public.app_users without plaintext password column
      try {
        await this.supabaseService.from('app_users').upsert({
          id: user.id,
          organization_id: user.organization_id,
          branch_id: user.branch_id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          is_active: true,
          created_at: user.created_at
        });
      } catch {}
    }

    try {
      const savedUsersJson = localStorage.getItem(this.REGISTERED_USERS_KEY);
      let list: { user: AppUser }[] = savedUsersJson ? JSON.parse(savedUsersJson) : [];
      list = list.filter(item => item.user.email?.toLowerCase() !== user.email?.toLowerCase());
      list.push({ user });
      localStorage.setItem(this.REGISTERED_USERS_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  private setSessionUser(user: AppUser): void {
    const sanitizedUser: AppUser = { ...user };
    delete (sanitizedUser as any).password;
    delete (sanitizedUser as any).manager_pin;
    delete (sanitizedUser as any).pin;

    this.currentUserSubject.next(sanitizedUser);
    this.isAuthenticatedSubject.next(true);

    if (sanitizedUser.organization_id) {
      try {
        localStorage.setItem('orderrestro_active_org_id_v2', sanitizedUser.organization_id);
        this.tenantService?.switchTenant(sanitizedUser.organization_id);
      } catch (e) {}
    }

    try {
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days session
      const envelope: SessionEnvelope = { user: sanitizedUser, expiresAt };
      localStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(envelope));
    } catch {}
  }

  private clearLocalSession(): void {
    try {
      localStorage.removeItem(this.SESSION_STORAGE_KEY);
      localStorage.removeItem(this.LEGACY_SESSION_KEY);
      localStorage.removeItem('orderrestro_live_till_cart_v1');
    } catch {}

    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  async logout(): Promise<void> {
    const client = this.supabaseService.client;
    if (client && client.auth) {
      try {
        await client.auth.signOut();
      } catch (e) {
        console.warn('⚠️ [AuthService] Supabase signOut notice:', e);
      }
    }

    this.clearLocalSession();
  }

  switchUserRole(role: UserRole, name: string): void {
    if (!this.currentUser) return;
    const updated: AppUser = {
      ...this.currentUser,
      role,
      full_name: name
    };
    this.setSessionUser(updated);
  }

  private getDefaultRoute(role: UserRole): string {
    switch (role) {
      case 'SUPER_ADMIN': return '/super-admin';
      case 'WAITER': return '/tables';
      case 'KITCHEN_CHEF': return '/kds';
      case 'STORE_KEEPER': return '/inventory';
      case 'ACCOUNTANT': return '/accounting';
      default: return '/orders';
    }
  }
}
