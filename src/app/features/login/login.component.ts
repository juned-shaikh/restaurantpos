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
    // If already logged in, redirect to orders or super-admin
    if (this.authService.isAuthenticated && this.authService.currentUser) {
      if (this.authService.isSuperAdmin) {
        this.router.navigate(['/super-admin']);
      } else {
        this.router.navigate(['/orders']);
      }
    }
  }

  /**
   * Enterprise Authentication:
   * Authenticates user via registered credentials and switches to their assigned restaurant tenant.
   */
  async submitPasswordLogin(): Promise<void> {
    this.errorMessage = '';
    const cleanEmail = this.email?.trim().toLowerCase();
    const cleanPwd = this.password?.trim();

    if (!cleanEmail || !cleanPwd) {
      this.errorMessage = 'Please enter your registered email or mobile number and password.';
      return;
    }

    this.isLoading = true;

    try {
      const res = await this.authService.loginWithCredentials(cleanEmail, cleanPwd);
      this.isLoading = false;

      if (res.success) {
        if (res.role === 'SUPER_ADMIN') {
          this.router.navigate([res.route || '/super-admin']);
        } else {
          // Dynamically resolve cafe tenant from the authenticated user's organization_id
          const userOrgId = this.authService.currentUser?.organization_id;
          if (userOrgId) {
            this.tenantService.switchTenant(userOrgId);
          }
          this.router.navigate([res.route || '/orders']);
        }
      } else {
        this.errorMessage = res.message || 'Invalid email or password. Please try again.';
      }
    } catch (err: any) {
      this.isLoading = false;
      this.errorMessage = err?.message || 'Authentication error. Please check your credentials.';
    }
  }
}
