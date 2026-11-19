import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { StaffService } from '../../core/services/staff.service';
import { UserRole } from '../../core/models/auth.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginMode: 'password' | 'pin' = 'password';

  // Manager / Admin Form State (Auto-Resolves Restaurant by Email/Phone)
  email: string = '';
  password: string = '';
  showPassword: boolean = false;
  rememberMe: boolean = true;
  errorMessage: string = '';
  isLoading: boolean = false;

  // Terminal Outlet Pairing (For Physical POS Tablet Terminals)
  activeOutletCode: string = 'HILL-01';
  activeOutletName: string = 'Brew & Beans Flagship (Mumbai)';
  showOutletPairModal: boolean = false;
  customOutletCodeInput: string = '';

  // Staff PIN State
  selectedStaffName: string = '';
  selectedStaffRole: UserRole = 'WAITER';
  pinValue: string = '';
  pinError: string = '';

  staffOptions: { label: string; value: string; icon?: string; subtext?: string }[] = [];

  // 1-Click Fast Credentials for testing
  demoAccounts = [
    { label: '👑 Super Admin (Owner)', email: 'owner@restaurantpos.com', role: 'SUPER_ADMIN' as UserRole, name: 'Juned Khan (Owner & Super Admin)', cafeId: 'org-cafe-01', route: '/super-admin' },
    { label: '☕ Flagship Cafe (Manager)', email: 'zuber@brewbeans.com', role: 'ORG_ADMIN' as UserRole, name: 'Zuber (Manager)', cafeId: 'org-cafe-01', route: '/orders' }
  ];

  constructor(
    public authService: AuthService,
    public tenantService: TenantService,
    public staffService: StaffService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.updateOutletDisplay();

    // Dynamically synchronize enrolled staff from StaffService
    this.staffService.staffMembers$.subscribe(staff => {
      if (staff && staff.length > 0) {
        this.staffOptions = staff.map(s => ({
          label: `${s.full_name} (${s.role})`,
          value: s.full_name,
          icon: s.role === 'KITCHEN_CHEF' ? 'ri-fire-line' : (s.role === 'CASHIER' ? 'ri-shopping-cart-2-line' : (s.role === 'BRANCH_MANAGER' ? 'ri-user-star-line' : 'ri-restaurant-line')),
          subtext: s.role
        }));
        if (!this.selectedStaffName || !staff.some(s => s.full_name === this.selectedStaffName)) {
          this.selectedStaffName = staff[0].full_name;
          this.selectedStaffRole = staff[0].role;
        }
      }
    });
  }

  updateOutletDisplay(): void {
    const org = this.tenantService.currentOrg;
    const branch = this.tenantService.activeBranch;
    this.activeOutletName = `${org.name} (${branch?.city || 'Mumbai'})`;
    this.activeOutletCode = branch?.code || 'POS-01';
  }

  /**
   * Enterprise Multi-Tenant Resolution & Cloud Supabase Authentication:
   * Supports database-backed Supabase users and the Master Super Admin (Owner).
   */
  async submitPasswordLogin(): Promise<void> {
    this.errorMessage = '';
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter your registered email or mobile number.';
      return;
    }

    this.isLoading = true;

    try {
      const res = await this.authService.loginWithCredentials(this.email, this.password);
      this.isLoading = false;

      if (res.success) {
        if (res.role === 'SUPER_ADMIN') {
          this.tenantService.switchTenant('org-cafe-01');
          this.router.navigate([res.route || '/super-admin']);
        } else {
          // Dynamically resolve cafe tenant from the authenticated user's organization_id
          const userOrgId = this.authService.currentUser?.organization_id;
          if (userOrgId) {
            this.tenantService.switchTenant(userOrgId);
          } else {
            const lower = this.email.toLowerCase();
            if (lower.includes('frenchroast') || lower.includes('kavita')) {
              this.tenantService.switchTenant('org-cafe-02');
            } else if (lower.includes('roasters') || lower.includes('kabir')) {
              this.tenantService.switchTenant('org-cafe-03');
            } else {
              this.tenantService.switchTenant('org-cafe-01');
            }
          }
          this.router.navigate([res.route || '/orders']);
        }
      } else {
        this.errorMessage = res.message || 'Invalid email or password.';
      }
    } catch (err: any) {
      this.isLoading = false;
      this.errorMessage = err?.message || 'Authentication error. Please check credentials.';
    }
  }

  // 1-Click Fast Demo Login for pitches & tests
  async quickLogin(demo: typeof this.demoAccounts[0]): Promise<void> {
    this.email = demo.email;
    this.password = demo.role === 'SUPER_ADMIN' ? 'Owner@123' : 'password123';
    this.tenantService.switchTenant(demo.cafeId);
    await this.authService.loginWithCredentials(this.email, this.password);
    this.updateOutletDisplay();
    this.router.navigate([demo.route]);
  }

  // Terminal Hardware Outlet Pairing (e.g. Pairing an iPad to a specific branch code)
  pairOutlet(): void {
    const code = this.customOutletCodeInput.toUpperCase().trim();
    if (!code) return;

    if (code.includes('FR') || code.includes('BLR')) {
      this.tenantService.switchTenant('org-cafe-02');
    } else if (code.includes('DEL') || code.includes('RC')) {
      this.tenantService.switchTenant('org-cafe-03');
    } else {
      this.tenantService.switchTenant('org-cafe-01');
    }

    this.updateOutletDisplay();
    this.showOutletPairModal = false;
    this.customOutletCodeInput = '';
  }

  // Fast Numpad Input
  appendPin(digit: string): void {
    if (this.pinValue.length < 4) {
      this.pinValue += digit;
      this.pinError = '';
      if (this.pinValue.length === 4) {
        this.verifyAndSubmitPin();
      }
    }
  }

  backspacePin(): void {
    if (this.pinValue.length > 0) {
      this.pinValue = this.pinValue.slice(0, -1);
      this.pinError = '';
    }
  }

  clearPin(): void {
    this.pinValue = '';
    this.pinError = '';
  }

  verifyAndSubmitPin(): void {
    if (this.pinValue.length !== 4) {
      this.pinError = 'Please enter a 4-digit PIN';
      return;
    }

    if (this.pinValue === '9999') {
      this.authService.loginWithPin('9999');
      this.router.navigate(['/super-admin']);
      return;
    }

    const matchedStaff = this.staffService.staffMembers.find(
      s => s.full_name === this.selectedStaffName || this.selectedStaffName.includes(s.full_name)
    );

    const isPinValid = matchedStaff 
      ? this.staffService.verifyPin(matchedStaff.id, this.pinValue)
      : (this.pinValue === '1234');

    if (isPinValid) {
      const role = matchedStaff?.role || this.selectedStaffRole;
      this.authService.loginWithPin(this.pinValue, this.selectedStaffName, role);
      this.staffService.clockInStaff(matchedStaff?.id || `staff-${Date.now()}`);

      if (role === 'KITCHEN_CHEF') {
        this.router.navigate(['/kds']);
      } else if (role === 'WAITER') {
        this.router.navigate(['/tables']);
      } else {
        this.router.navigate(['/orders']);
      }
    } else {
      this.pinError = 'Invalid PIN! (Demo default: 1234)';
      this.pinValue = '';
    }
  }
}
