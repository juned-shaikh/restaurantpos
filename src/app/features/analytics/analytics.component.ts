import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AnalyticsService, TableBreakdown, KitchenBreakdown } from '../../core/services/analytics.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';
import { LiveDashboardKPIs, PeakHourSlot, ItemSalesVelocity, CustomerRetentionMetric } from '../../core/models/analytics.model';
import { Order } from '../../core/models/order.model';

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  kpis: LiveDashboardKPIs = {
    today_sales: 0,
    today_orders_count: 0,
    active_tables_count: 0,
    total_tables_count: 0,
    occupancy_rate_pct: 0,
    pending_kot_count: 0,
    avg_prep_time_mins: 0,
    cash_in_drawer: 0,
    upi_sales_collected: 0
  };
  peakHours: PeakHourSlot[] = [];
  salesVelocity: ItemSalesVelocity[] = [];
  retention: CustomerRetentionMetric = {
    total_registered_customers: 0,
    new_customers_this_month: 0,
    repeat_customers_pct: 0,
    avg_spend_per_customer: 0,
    points_redeemed_value: 0
  };
  recentTransactions: Order[] = [];
  allOrders: Order[] = [];

  tableBreakdown: TableBreakdown = {
    available: 0,
    occupied: 0,
    reserved: 0,
    cleaning: 0
  };

  kitchenBreakdown: KitchenBreakdown = {
    new: 0,
    accepted: 0,
    preparing: 0,
    ready: 0
  };

  activeReport: 'dashboard' | 'peakhours' | 'velocity' | 'retention' = 'dashboard';
  selectedTimeframe: 'today' | 'week' | 'month' | 'last3m' | 'last6m' | 'year' = 'today';

  timeframeOptions = [
    { label: '📅 Daily (Today)', value: 'today' },
    { label: '📆 This Week (7 Days)', value: 'week' },
    { label: '🗓️ This Month (MTD)', value: 'month' },
    { label: '📊 Last 3 Months (Quarterly)', value: 'last3m' },
    { label: '📈 Last 6 Months (Half-Yearly)', value: 'last6m' },
    { label: '🏛️ This Year (FY 2026 YTD)', value: 'year' }
  ];

  private subs = new Subscription();

  constructor(
    public analyticsService: AnalyticsService,
    private orderService: OrderService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.subs.add(this.analyticsService.kpis$.subscribe(k => this.kpis = k));
    this.subs.add(this.analyticsService.tableBreakdown$.subscribe(b => this.tableBreakdown = b));
    this.subs.add(this.analyticsService.kitchenBreakdown$.subscribe(b => this.kitchenBreakdown = b));
    this.subs.add(this.analyticsService.recentTransactions$.subscribe(t => this.recentTransactions = t));
    this.subs.add(this.analyticsService.peakHours$.subscribe(p => this.peakHours = p));
    this.subs.add(this.analyticsService.salesVelocity$.subscribe(s => this.salesVelocity = s));
    this.subs.add(this.analyticsService.retention$.subscribe(r => this.retention = r));

    this.subs.add(this.orderService.activeOrders$.subscribe(orders => {
      this.allOrders = orders;
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  isOrderInTimeframe(orderDateStr: string, timeframe: string): boolean {
    if (!orderDateStr) return false;
    const today = new Date();
    const target = new Date(orderDateStr);
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    switch (timeframe) {
      case 'today':
        return orderDateStr.startsWith(today.toISOString().split('T')[0]);
      case 'week': {
        const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
        return target >= weekAgo && target <= now;
      }
      case 'month': {
        const m = today.toISOString().substring(0, 7);
        return orderDateStr.startsWith(m);
      }
      case 'last3m': {
        const threeMAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        return target >= threeMAgo && target <= now;
      }
      case 'last6m': {
        const sixMAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1);
        return target >= sixMAgo && target <= now;
      }
      case 'year': {
        const y = String(today.getFullYear());
        return orderDateStr.startsWith(y);
      }
      default:
        return true;
    }
  }

  get filteredOrders(): Order[] {
    return this.allOrders.filter(o => this.isOrderInTimeframe(o.created_at, this.selectedTimeframe));
  }

  get displayedRevenue(): number {
    return this.filteredOrders
      .filter(o => o.is_settled || o.status === 'SETTLED')
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  }

  get displayedOrders(): number {
    return this.filteredOrders.length;
  }

  get displayedCash(): number {
    return this.filteredOrders
      .filter(o => o.is_settled || o.status === 'SETTLED')
      .reduce((sum, o) => {
        if (o.payments && o.payments.length > 0) {
          return sum + o.payments.filter(p => p.payment_mode === 'CASH').reduce((s, p) => s + (Number(p.amount) || 0), 0);
        }
        return sum;
      }, 0);
  }

  get displayedUpi(): number {
    return this.filteredOrders
      .filter(o => o.is_settled || o.status === 'SETTLED')
      .reduce((sum, o) => {
        if (o.payments && o.payments.length > 0) {
          return sum + o.payments.filter(p => p.payment_mode === 'UPI').reduce((s, p) => s + (Number(p.amount) || 0), 0);
        }
        return sum;
      }, 0);
  }

  get timeframeTitle(): string {
    switch (this.selectedTimeframe) {
      case 'today': return "Today's";
      case 'week': return "This Week's";
      case 'month': return "This Month's";
      case 'last3m': return "Last 3 Months";
      case 'last6m': return "Last 6 Months";
      case 'year': return "This Year's (YTD)";
    }
  }

  setActiveReport(report: 'dashboard' | 'peakhours' | 'velocity' | 'retention'): void {
    this.activeReport = report;
  }

  onTimeframeSelect(val: any): void {
    this.selectedTimeframe = val;
  }

  exportPeakHoursCsv(): void {
    if (!this.peakHours || this.peakHours.length === 0) {
      this.toast.warning('No peak hours data available to export.');
      return;
    }
    const headers = 'Time Slot,Orders Count,Sales Amount (INR),Traffic Intensity (%)\n';
    const rows = this.peakHours.map(p =>
      `"${p.hour_label}",${p.order_count || 0},${p.sales_amount || 0},${p.occupancy_intensity || 0}%`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `peak_hours_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.toast.success('Peak hours CSV exported successfully!', 'Report Downloaded');
  }

  exportVelocityCsv(): void {
    if (!this.salesVelocity || this.salesVelocity.length === 0) {
      this.toast.warning('No sales velocity data available to export.');
      return;
    }
    const headers = 'Rank,Dish Name,Category,Qty Sold,Revenue (INR),Cost Margin (%)\n';
    const rows = this.salesVelocity.map((item, idx) =>
      `${item.velocity_rank || idx + 1},"${item.item_name}","${item.category_name || ''}",${item.quantity_sold || 0},${item.gross_revenue || 0},${item.gross_margin_pct || 0}%`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `menu_velocity_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
