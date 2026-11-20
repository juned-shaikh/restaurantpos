import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { LiveDashboardKPIs, PeakHourSlot, ItemSalesVelocity, CustomerRetentionMetric } from '../models/analytics.model';
import { OrderService } from './order.service';
import { TableService } from './table.service';
import { KdsService } from './kds.service';
import { CrmService } from './crm.service';
import { Order } from '../models/order.model';
import { Table } from '../models/table.model';
import { KotTicket } from '../models/kds.model';
import { Customer } from '../models/crm.model';

export interface TableBreakdown {
  available: number;
  occupied: number;
  reserved: number;
  cleaning: number;
}

export interface KitchenBreakdown {
  new: number;
  accepted: number;
  preparing: number;
  ready: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private kpisSubject = new BehaviorSubject<LiveDashboardKPIs>({
    today_sales: 0,
    today_orders_count: 0,
    active_tables_count: 0,
    total_tables_count: 0,
    occupancy_rate_pct: 0,
    pending_kot_count: 0,
    avg_prep_time_mins: 0,
    cash_in_drawer: 0,
    upi_sales_collected: 0
  });

  private tableBreakdownSubject = new BehaviorSubject<TableBreakdown>({
    available: 0,
    occupied: 0,
    reserved: 0,
    cleaning: 0
  });

  private kitchenBreakdownSubject = new BehaviorSubject<KitchenBreakdown>({
    new: 0,
    accepted: 0,
    preparing: 0,
    ready: 0
  });

  private recentTransactionsSubject = new BehaviorSubject<Order[]>([]);

  private peakHoursSubject = new BehaviorSubject<PeakHourSlot[]>([
    { hour_label: '08:00 - 10:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '10:00 - 12:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '12:00 - 14:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '14:00 - 16:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '16:00 - 18:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '18:00 - 20:00', order_count: 0, sales_amount: 0, occupancy_intensity: 0 },
    { hour_label: '20:00 - 22:30', order_count: 0, sales_amount: 0, occupancy_intensity: 0 }
  ]);

  private salesVelocitySubject = new BehaviorSubject<ItemSalesVelocity[]>([]);

  private retentionSubject = new BehaviorSubject<CustomerRetentionMetric>({
    total_registered_customers: 0,
    new_customers_this_month: 0,
    repeat_customers_pct: 0,
    avg_spend_per_customer: 0,
    points_redeemed_value: 0
  });

  kpis$: Observable<LiveDashboardKPIs> = this.kpisSubject.asObservable();
  tableBreakdown$: Observable<TableBreakdown> = this.tableBreakdownSubject.asObservable();
  kitchenBreakdown$: Observable<KitchenBreakdown> = this.kitchenBreakdownSubject.asObservable();
  recentTransactions$: Observable<Order[]> = this.recentTransactionsSubject.asObservable();
  peakHours$: Observable<PeakHourSlot[]> = this.peakHoursSubject.asObservable();
  salesVelocity$: Observable<ItemSalesVelocity[]> = this.salesVelocitySubject.asObservable();
  retention$: Observable<CustomerRetentionMetric> = this.retentionSubject.asObservable();

  constructor(
    private orderService: OrderService,
    private tableService: TableService,
    private kdsService: KdsService,
    private crmService: CrmService
  ) {
    this.initDynamicAggregation();
  }

  private initDynamicAggregation(): void {
    combineLatest([
      this.orderService.activeOrders$,
      this.tableService.tables$,
      this.kdsService.tickets$,
      this.crmService.customers$
    ]).pipe(
      debounceTime(400) // Debounce heavy computations so fast billing/taps on POS never lag UI
    ).subscribe(([orders, tables, tickets, customers]) => {
      this.computeDashboardKPIs(orders, tables, tickets);
      this.computeTableBreakdown(tables);
      this.computeKitchenBreakdown(tickets);
      this.computeRecentTransactions(orders);
      this.computePeakHours(orders);
      this.computeSalesVelocity(orders);
      this.computeRetention(customers, orders);
    });
  }

  private computeDashboardKPIs(orders: Order[], tables: Table[], tickets: KotTicket[]): void {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at && o.created_at.startsWith(todayStr));
    const settledOrders = todayOrders.filter(o => o.is_settled || o.status === 'SETTLED');

    const liveSettledSales = settledOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    const liveCashSales = settledOrders.reduce((sum, o) => {
      if (o.payments && o.payments.length > 0) {
        return sum + (o.payments.filter(p => p.payment_mode === 'CASH').reduce((s, p) => s + (Number(p.amount) || 0), 0));
      }
      return sum;
    }, 0);

    const liveUpiSales = settledOrders.reduce((sum, o) => {
      if (o.payments && o.payments.length > 0) {
        return sum + (o.payments.filter(p => p.payment_mode === 'UPI').reduce((s, p) => s + (Number(p.amount) || 0), 0));
      }
      return sum;
    }, 0);

    const activeTables = tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length;
    const totalTables = tables.length;
    const occupancyPct = totalTables > 0 ? Math.round((activeTables / totalTables) * 1000) / 10 : 0;

    const pendingKots = tickets.filter(t => t.status === 'PENDING' || t.status === 'PREPARING').length;

    const kpis: LiveDashboardKPIs = {
      today_sales: liveSettledSales,
      today_orders_count: todayOrders.length,
      active_tables_count: activeTables,
      total_tables_count: totalTables,
      occupancy_rate_pct: occupancyPct,
      pending_kot_count: pendingKots,
      avg_prep_time_mins: pendingKots > 0 ? 8.5 : 0,
      cash_in_drawer: liveCashSales,
      upi_sales_collected: liveUpiSales
    };

    this.kpisSubject.next(kpis);
  }

  private computeTableBreakdown(tables: Table[]): void {
    const breakdown: TableBreakdown = {
      available: tables.filter(t => t.status === 'AVAILABLE').length,
      occupied: tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length,
      reserved: tables.filter(t => t.status === 'RESERVED').length,
      cleaning: tables.filter(t => (t.status as string) === 'CLEANING').length
    };
    this.tableBreakdownSubject.next(breakdown);
  }

  private computeKitchenBreakdown(tickets: KotTicket[]): void {
    const breakdown: KitchenBreakdown = {
      new: tickets.filter(t => t.status === 'PENDING').length,
      accepted: tickets.filter(t => (t.status as string) === 'ACCEPTED').length,
      preparing: tickets.filter(t => t.status === 'PREPARING').length,
      ready: tickets.filter(t => t.status === 'READY').length
    };
    this.kitchenBreakdownSubject.next(breakdown);
  }

  private computeRecentTransactions(orders: Order[]): void {
    const sorted = [...orders].sort((a, b) => {
      const tA = new Date(a.created_at || 0).getTime();
      const tB = new Date(b.created_at || 0).getTime();
      return tB - tA;
    });

    this.recentTransactionsSubject.next(sorted.slice(0, 8));
  }

  private computePeakHours(orders: Order[]): void {
    const slots = [
      { hour_label: '08:00 - 10:00', order_count: 0, sales_amount: 0, startH: 8, endH: 10 },
      { hour_label: '10:00 - 12:00', order_count: 0, sales_amount: 0, startH: 10, endH: 12 },
      { hour_label: '12:00 - 14:00', order_count: 0, sales_amount: 0, startH: 12, endH: 14 },
      { hour_label: '14:00 - 16:00', order_count: 0, sales_amount: 0, startH: 14, endH: 16 },
      { hour_label: '16:00 - 18:00', order_count: 0, sales_amount: 0, startH: 16, endH: 18 },
      { hour_label: '18:00 - 20:00', order_count: 0, sales_amount: 0, startH: 18, endH: 20 },
      { hour_label: '20:00 - 22:30', order_count: 0, sales_amount: 0, startH: 20, endH: 23 }
    ];

    for (const ord of orders) {
      const orderDate = new Date(ord.created_at || Date.now());
      const hour = orderDate.getHours();
      const targetSlot = slots.find(s => hour >= s.startH && hour < s.endH);
      if (targetSlot) {
        targetSlot.order_count += 1;
        targetSlot.sales_amount += Number(ord.total_amount) || 0;
      }
    }

    const maxSales = Math.max(...slots.map(s => s.sales_amount), 1);
    const result: PeakHourSlot[] = slots.map(s => ({
      hour_label: s.hour_label,
      order_count: s.order_count,
      sales_amount: s.sales_amount,
      occupancy_intensity: s.sales_amount > 0 ? Math.min(100, Math.round((s.sales_amount / maxSales) * 100)) : 0
    }));

    this.peakHoursSubject.next(result);
  }

  private computeSalesVelocity(orders: Order[]): void {
    const itemMap: { [name: string]: { category: string; qty: number; rev: number; cost: number } } = {};

    for (const ord of orders) {
      if (ord.items) {
        for (const it of ord.items) {
          const name = it.name;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.total_price) || (Number(it.unit_price) * qty) || 0;
          const ingredientCost = Math.round(price * 0.28);

          if (!itemMap[name]) {
            itemMap[name] = {
              category: 'Menu Items',
              qty: 0,
              rev: 0,
              cost: 0
            };
          }
          itemMap[name].qty += qty;
          itemMap[name].rev += price;
          itemMap[name].cost += ingredientCost;
        }
      }
    }

    const velocityList: ItemSalesVelocity[] = Object.entries(itemMap)
      .map(([name, data]) => {
        const marginPct = data.rev > 0 ? Math.round(((data.rev - data.cost) / data.rev) * 1000) / 10 : 0;
        return {
          menu_item_id: `m-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          item_name: name,
          category_name: data.category,
          quantity_sold: data.qty,
          gross_revenue: data.rev,
          ingredient_cost: data.cost,
          gross_margin_pct: marginPct,
          velocity_rank: 0
        };
      })
      .sort((a, b) => b.quantity_sold - a.quantity_sold)
      .map((item, idx) => ({ ...item, velocity_rank: idx + 1 }));

    this.salesVelocitySubject.next(velocityList);
  }

  private computeRetention(customers: Customer[], orders: Order[]): void {
    const totalReg = customers.length;
    const repeatCount = customers.filter(c => (c.visit_count || 1) > 1).length;
    const repeatPct = totalReg > 0 ? Math.round((repeatCount / totalReg) * 1000) / 10 : 0;

    const settled = orders.filter(o => o.is_settled || o.status === 'SETTLED');
    const totalSpent = settled.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const avgSpend = settled.length > 0 ? Math.round(totalSpent / settled.length) : 0;

    const thisMonthStr = new Date().toISOString().substring(0, 7);
    const newCustomers = customers.filter(c => c.created_at && c.created_at.startsWith(thisMonthStr)).length;

    const metric: CustomerRetentionMetric = {
      total_registered_customers: totalReg,
      new_customers_this_month: newCustomers,
      repeat_customers_pct: repeatPct,
      avg_spend_per_customer: avgSpend,
      points_redeemed_value: Math.round(customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0) * 0.5)
    };

    this.retentionSubject.next(metric);
  }
}
