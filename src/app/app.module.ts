import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// Shared Layout Components
import { HeaderComponent } from './shared/components/header/header.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { CustomSelectComponent } from './shared/components/custom-select/custom-select.component';

// Feature Components (11 Scoped Modules + Super Admin SaaS)
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

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    SidebarComponent,
    TablesComponent,
    KdsComponent,
    MenuComponent,
    OrdersComponent,
    InventoryComponent,
    ProcurementComponent,
    CrmComponent,
    StaffComponent,
    AccountingComponent,
    QrOrderComponent,
    AnalyticsComponent,
    AdminComponent,
    SuperAdminComponent,
    CustomerDisplayComponent,
    LoginComponent,
    CustomSelectComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
