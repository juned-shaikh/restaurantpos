import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private readonly REMEMBER_KEY = 'orderrestro_saved_login_identifier';

  email: string = '';
  password: string = '';
  showPassword: boolean = false;
  rememberMe: boolean = true;
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    public authService: AuthService,
    public tenantService: TenantService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check for saved identifier from "Remember this POS terminal"
    try {
      const saved = localStorage.getItem(this.REMEMBER_KEY);
      if (saved) {
        this.email = saved;
        this.rememberMe = true;
      }
    } catch {}

    // If already authenticated, route directly to the active session
    if (this.authService.isAuthenticated && this.authService.currentUser) {
      if (this.authService.isSuperAdmin) {
        this.router.navigate(['/super-admin']);
      } else {
        this.router.navigate(['/orders']);
      }
    }
  }

  onInputChange(): void {
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }

  onEmailEnter(pwdInput: HTMLInputElement): void {
    if (this.email?.trim()) {
      pwdInput.focus();
    }
  }

  /**
   * Enterprise Authentication:
   * Authenticates user via registered email/mobile and password,
   * switches to their assigned restaurant tenant.
   */
  async submitPasswordLogin(): Promise<void> {
    this.errorMessage = '';
    const cleanIdentifier = this.email?.trim();
    const cleanPwd = this.password?.trim();

    if (!cleanIdentifier || !cleanPwd) {
      this.errorMessage = 'Please enter both your email or mobile number and password.';
      return;
    }

    this.isLoading = true;

    try {
      const res = await this.authService.loginWithCredentials(cleanIdentifier, cleanPwd);
      this.isLoading = false;

      if (res.success) {
        // Save or remove remembered identifier
        try {
          if (this.rememberMe) {
            localStorage.setItem(this.REMEMBER_KEY, cleanIdentifier);
          } else {
            localStorage.removeItem(this.REMEMBER_KEY);
          }
        } catch {}

        if (res.role === 'SUPER_ADMIN') {
          this.router.navigate([res.route || '/super-admin']);
        } else {
          // Dynamically resolve restaurant tenant from authenticated user
          const userOrgId = this.authService.currentUser?.organization_id;
          if (userOrgId) {
            this.tenantService.switchTenant(userOrgId);
          }
          this.router.navigate([res.route || '/orders']);
        }
      } else {
        this.errorMessage = res.message || 'Invalid email/mobile number or password. Please try again.';
      }
    } catch (err: any) {
      this.isLoading = false;
      this.errorMessage = err?.message || 'Authentication error. Please check your credentials.';
    }
  }
}
