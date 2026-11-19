import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    // 1. Ensure user is logged in
    if (!this.authService.isAuthenticated || !this.authService.currentUser) {
      return this.router.createUrlTree(['/login']);
    }

    const user = this.authService.currentUser;
    const allowedRoles: UserRole[] = route.data['roles'];

    // 2. If route does not specify any role restrictions, permit access
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    // 3. Super Admin has vendor authority
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // 4. Check if current user role matches permitted roles
    if (allowedRoles.includes(user.role)) {
      return true;
    }

    // 5. Access Denied (RBAC Block): Inform user & redirect to their authorized home
    const fallbackRoute = this.getDefaultRouteForRole(user.role);
    alert(`⛔ RBAC Access Restricted!\nYour role is "${user.role}". You do not have permission to access "${state.url}".\nRedirecting you to your authorized station (${fallbackRoute}).`);
    
    return this.router.createUrlTree([fallbackRoute]);
  }

  getDefaultRouteForRole(role: UserRole): string {
    switch (role) {
      case 'SUPER_ADMIN':
        return '/super-admin';
      case 'KITCHEN_CHEF':
        return '/kds';
      case 'WAITER':
        return '/tables';
      case 'CASHIER':
        return '/orders';
      case 'STORE_KEEPER':
        return '/inventory';
      case 'ACCOUNTANT':
        return '/accounting';
      case 'ORG_ADMIN':
      case 'BRANCH_MANAGER':
      default:
        return '/orders';
    }
  }
}

