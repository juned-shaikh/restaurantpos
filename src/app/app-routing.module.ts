import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TablesComponent } from './features/tables/tables.component';
import { KdsComponent } from './features/kds/kds.component';
import { MenuComponent } from './features/menu/menu.component';
import { OrdersComponent } from './features/orders/orders.component';
import { InventoryComponent } from './features/inventory/inventory.component';
import { ProcurementComponent } from './features/procurement/procurement.component';
import { CrmComponent } from './features/crm/crm.component';
import { StaffComponent } from './features/staff/staff.component';
import { AccountingComponent } from './features/accounting/accounting.component';
import { QrOrderComponent } from './features/qr-order/qr-order.component';
import { AnalyticsComponent } from './features/analytics/analytics.component';
import { AdminComponent } from './features/admin/admin.component';
import { SuperAdminComponent } from './features/super-admin/super-admin.component';
import { CustomerDisplayComponent } from './features/customer-display/customer-display.component';
import { LoginComponent } from './features/login/login.component';
import { RoleGuard } from './core/guards/role.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'orders', pathMatch: 'full' },
  {
    path: 'analytics',
    component: AnalyticsComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'] }
  },
  {
    path: 'tables',
    component: TablesComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'WAITER', 'CASHIER'] }
  },
  {
    path: 'kds',
    component: KdsComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_CHEF'] }
  },
  {
    path: 'menu',
    component: MenuComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'KITCHEN_CHEF'] }
  },
  {
    path: 'orders',
    component: OrdersComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER'] }
  },
  {
    path: 'inventory',
    component: InventoryComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'STORE_KEEPER', 'KITCHEN_CHEF'] }
  },
  {
    path: 'procurement',
    component: ProcurementComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'STORE_KEEPER'] }
  },
  {
    path: 'crm',
    component: CrmComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] }
  },
  {
    path: 'staff',
    component: StaffComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'] }
  },
  {
    path: 'accounting',
    component: AccountingComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'CASHIER'] }
  },
  {
    path: 'qr-order',
    component: QrOrderComponent
  },
  {
    path: 'customer-display',
    component: CustomerDisplayComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] }
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_MANAGER'] }
  },
  {
    path: 'super-admin',
    component: SuperAdminComponent,
    canActivate: [RoleGuard],
    data: { roles: ['SUPER_ADMIN'] }
  },
  { path: '**', redirectTo: 'orders' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
