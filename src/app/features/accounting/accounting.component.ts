import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { FinanceService } from '../../core/services/finance.service';
import { OrderService } from '../../core/services/order.service';
import { InventoryService } from '../../core/services/inventory.service';
import { TenantService } from '../../core/services/tenant.service';
import { CashClosing, Expense, MonthlyBudget, ProfitAndLossSummary, TaxReportSummary } from '../../core/models/finance.model';
import { Order } from '../../core/models/order.model';
import { InventoryItem } from '../../core/models/inventory.model';

@Component({
  selector: 'app-accounting',
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit, OnDestroy {
  cashClosings: CashClosing[] = [];
  expenses: Expense[] = [];
  budgets: MonthlyBudget[] = [];
  pnl!: ProfitAndLossSummary;
  taxSummaries: TaxReportSummary[] = [];
  settledOrders: Order[] = [];

  activeTab: 'cashclose' | 'expenses' | 'pnl' | 'tax' | 'periodic' = 'cashclose';

  // Nightly Cash Close Form State
  openingDrawer: number = 0;
  cashSales: number = 0;
  pettyExpenses: number = 0;
  cashRefunds: number = 0;
  actualCountedCash: number = 0;
  cashCloseNotes: string = '';

  // User input tracking
  hasUserEditedSales: boolean = false;
  hasUserEditedExpenses: boolean = false;
  hasUserEditedCountedCash: boolean = false;

  // Expense Modal State
  showExpenseModal: boolean = false;
  expCategory: string = 'Dairy & Fresh Produce';
  expAmount: number = 0;
  expPaymentMode: string = 'CASH';
  expVendor: string = '';
  expDescription: string = '';

  // Store Fixed Overheads Modal State (Rent, Utilities, Staff Payroll)
  showOverheadsModal: boolean = false;
  rentInput: number = 0;
  utilitiesInput: number = 0;
  payrollInput: number = 0;

  // Smart Inventory Link state
  linkInventoryStock: boolean = false;
  selectedIngredientId: string = '';
  restockQty: number = 0;
  ingredients: InventoryItem[] = [];
  ingredientOptions: { label: string; value: string; icon?: string; subtext?: string }[] = [];

  // Filter mode for Expenses tab: 'PERIOD' (matches top dropdown) or 'ALL' (complete history)
  expenseViewFilter: 'PERIOD' | 'ALL' = 'PERIOD';

  expenseCategoryOptions = [
    { label: '🏢 Store Rent & Property Maintenance', value: 'Store Rent & Property Maintenance', icon: 'ri-building-line' },
    { label: '⚡ Utilities (Electricity, Water & Internet)', value: 'Utilities (Electricity & Water)', icon: 'ri-flashlight-line' },
    { label: '👥 Staff Payroll, Wages & Advances', value: 'Staff Payroll & Welfare', icon: 'ri-team-line' },
    { label: '🥛 Dairy & Fresh Produce', value: 'Dairy & Fresh Produce', icon: 'ri-cup-line' },
    { label: '🔥 Fuel & LPG Cylinder', value: 'Fuel & LPG Cylinder', icon: 'ri-fire-line' },
    { label: '✨ Cleaning & Sanitation Supplies', value: 'Cleaning & Sanitation Supplies', icon: 'ri-sparkling-line' },
    { label: '❤️ Staff Welfare & Petty Cash', value: 'Staff Welfare & Petty Cash', icon: 'ri-user-heart-line' },
    { label: '🔧 Kitchen Equipment Maintenance', value: 'Kitchen Equipment Maintenance', icon: 'ri-tools-line' }
  ];

  expensePaymentModes = [
    { label: '💵 Cash (Drawer Petty Cash)', value: 'CASH', icon: 'ri-money-dollar-circle-line' },
    { label: '📱 Cafe UPI (Bank)', value: 'UPI', icon: 'ri-qr-code-line' },
    { label: '🏦 Net Banking / NEFT', value: 'NEFT', icon: 'ri-bank-line' }
  ];

  periodOptions = [
    { label: '📅 Daily (Today)', value: 'DAILY' },
    { label: '📆 This Week (7 Days)', value: 'WEEKLY' },
    { label: '🗓️ This Month (MTD)', value: 'MONTHLY' },
    { label: '📊 Last 3 Months (Quarterly)', value: 'LAST_3_MONTHS' },
    { label: '📈 Last 6 Months (Half-Yearly)', value: 'LAST_6_MONTHS' },
    { label: '🏛️ This Year (FY 2026 YTD)', value: 'YEARLY' }
  ];

  private subs: Subscription = new Subscription();

  constructor(
    public financeService: FinanceService,
    public orderService: OrderService,
    public inventoryService: InventoryService,
    public tenantService: TenantService
  ) {}

  get isDemoCafe(): boolean {
    return false;
  }

  ngOnInit(): void {
    this.recalculateStatements();

    // 1. Subscribe to Historical Cash Closings
    this.subs.add(
      this.financeService.cashClosings$.subscribe(cc => {
        this.cashClosings = cc;
      })
    );

    // 2. Subscribe to Expenses
    this.subs.add(
      this.financeService.expenses$.subscribe(exp => {
        this.expenses = exp;
        if (!this.hasUserEditedExpenses) {
          this.pettyExpenses = this.todayPettyExpenses || 0;
          if (!this.hasUserEditedCountedCash) {
            this.actualCountedCash = this.computedExpectedCash;
          }
        }
        this.recalculateStatements();
      })
    );

    // 3. Subscribe to Dynamic Budgets
    this.subs.add(
      this.financeService.budgets$.subscribe(b => {
        this.budgets = b;
      })
    );

    // 4. Subscribe to Live Orders from POS
    this.subs.add(
      this.orderService.activeOrders$.subscribe(orders => {
        this.settledOrders = orders.filter(o => o.is_settled || o.status === 'SETTLED');

        // Dynamically auto-sync cash sales if cashier hasn't manually overridden it
        if (!this.hasUserEditedSales) {
          this.cashSales = this.todayPosCashSales;
          if (!this.hasUserEditedCountedCash) {
            this.actualCountedCash = this.computedExpectedCash;
          }
        }
        this.recalculateStatements();
      })
    );

    // 5. Subscribe to Inventory Ingredients for Single-Entry Auto Restock
    this.subs.add(
      this.inventoryService.ingredients$.subscribe(items => {
        this.ingredients = items;
        this.buildIngredientOptions();
      })
    );
  }

  private buildIngredientOptions(): void {
    this.ingredientOptions = this.ingredients.map(ing => ({
      label: `${ing.name}`,
      value: ing.id,
      icon: 'ri-archive-line',
      subtext: `Stock: ${ing.current_stock} ${ing.uom} • Avg: ₹${ing.avg_unit_cost}/${ing.uom}`
    }));
    if (this.ingredients.length > 0 && !this.selectedIngredientId) {
      const milk = this.ingredients.find(i => i.name.toLowerCase().includes('milk'));
      this.selectedIngredientId = milk ? milk.id : this.ingredients[0].id;
    }
  }

  get selectedIngredient(): InventoryItem | undefined {
    return this.ingredients.find(i => i.id === this.selectedIngredientId);
  }

  get calculatedUnitCost(): number {
    const qty = Number(this.restockQty);
    const amt = Number(this.expAmount);
    if (qty > 0 && amt > 0) {
      return Math.round((amt / qty) * 100) / 100;
    }
    return 0;
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get isCloudConnected(): boolean {
    return this.financeService.isCloudConnected;
  }

  // --- Dynamic Live Periodic Timeframes (Daily, Weekly, Monthly, 3M, 6M, Yearly) ---
  selectedPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'YEARLY' = 'DAILY';

  get periodLabel(): string {
    switch (this.selectedPeriod) {
      case 'DAILY': return 'Daily (Today)';
      case 'WEEKLY': return 'Weekly (Last 7 Days)';
      case 'MONTHLY': return 'This Month (Current MTD)';
      case 'LAST_3_MONTHS': return 'Last 3 Months (Sep - Nov)';
      case 'LAST_6_MONTHS': return 'Last 6 Months (Jun - Nov)';
      case 'YEARLY': return 'Yearly (FY 2026 YTD)';
    }
  }

  get selectedPeriodLabel(): string {
    return this.periodLabel;
  }

  isOrderInPeriod(order: any, period: string): boolean {
    const dateStr = order.settled_at || order.created_at;
    if (!dateStr) return false;
    const today = new Date();
    const orderDate = new Date(dateStr);
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    switch (period) {
      case 'DAILY':
        return dateStr.startsWith(this.todayDateStr);
      case 'WEEKLY': {
        const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7, 0, 0, 0);
        return orderDate >= weekAgo && orderDate <= now;
      }
      case 'MONTHLY': {
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        return dateStr.startsWith(`${y}-${m}`);
      }
      case 'LAST_3_MONTHS': {
        const threeMAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1, 0, 0, 0);
        return orderDate >= threeMAgo && orderDate <= now;
      }
      case 'LAST_6_MONTHS': {
        const sixMAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1, 0, 0, 0);
        return orderDate >= sixMAgo && orderDate <= now;
      }
      case 'YEARLY': {
        const y = String(today.getFullYear());
        return dateStr.startsWith(y);
      }
      default:
        return true;
    }
  }

  getOrdersForPeriod(period: string): Order[] {
    return this.settledOrders.filter(o => this.isOrderInPeriod(o, period));
  }

  getCashSalesForPeriod(period: string): number {
    return this.getOrdersForPeriod(period)
      .filter(o => o.payment_mode === 'CASH')
      .reduce((sum, o) => sum + (Number(o.grand_total || o.total_amount) || 0), 0);
  }

  getUpiSalesForPeriod(period: string): number {
    return this.getOrdersForPeriod(period)
      .filter(o => o.payment_mode === 'UPI')
      .reduce((sum, o) => sum + (Number(o.grand_total || o.total_amount) || 0), 0);
  }

  getCardSalesForPeriod(period: string): number {
    return this.getOrdersForPeriod(period)
      .filter(o => o.payment_mode === 'CARD')
      .reduce((sum, o) => sum + (Number(o.grand_total || o.total_amount) || 0), 0);
  }

  get periodCashTotal(): number {
    return this.getCashSalesForPeriod(this.selectedPeriod);
  }

  get periodUpiTotal(): number {
    return this.getUpiSalesForPeriod(this.selectedPeriod);
  }

  get periodCardTotal(): number {
    return this.getCardSalesForPeriod(this.selectedPeriod);
  }

  get periodTotalRevenue(): number {
    return this.periodCashTotal + this.periodUpiTotal + this.periodCardTotal;
  }

  get periodOrderCount(): number {
    return this.getOrdersForPeriod(this.selectedPeriod).length;
  }

  // --- Date & Period Calculation Logic for Expenses ---

  get todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  isExpenseInPeriod(expDateStr: string, period: string): boolean {
    if (!expDateStr) return false;
    const today = new Date();
    const target = new Date(expDateStr + 'T00:00:00');
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    switch (period) {
      case 'DAILY':
        return expDateStr === this.todayDateStr;

      case 'WEEKLY': {
        const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7, 0, 0, 0);
        return target >= weekAgo && target <= now;
      }

      case 'MONTHLY': {
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        return expDateStr.startsWith(`${y}-${m}`);
      }

      case 'LAST_3_MONTHS': {
        const threeMAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1, 0, 0, 0);
        return target >= threeMAgo && target <= now;
      }

      case 'LAST_6_MONTHS': {
        const sixMAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1, 0, 0, 0);
        return target >= sixMAgo && target <= now;
      }

      case 'YEARLY': {
        const y = String(today.getFullYear());
        return expDateStr.startsWith(y);
      }

      default:
        return true;
    }
  }

  get displayedExpenses(): Expense[] {
    if (this.expenseViewFilter === 'ALL') {
      return this.expenses;
    }
    return this.expenses.filter(e => this.isExpenseInPeriod(e.expense_date, this.selectedPeriod));
  }

  // Today's cash expenses taken out of cash register drawer
  get todayPettyExpenses(): number {
    const today = this.todayDateStr;
    return this.expenses
      .filter(e => e.payment_mode === 'CASH' && e.expense_date === today)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  // Today's total operational expenses (Cash + Online)
  get todayTotalExpenses(): number {
    const today = this.todayDateStr;
    return this.expenses
      .filter(e => e.expense_date === today)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  // Expenses for the currently selected period (Daily, Weekly, Monthly, etc.)
  get periodExpensesSum(): number {
    return this.expenses
      .filter(e => this.isExpenseInPeriod(e.expense_date, this.selectedPeriod))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get periodDrawerCashExpenses(): number {
    return this.expenses
      .filter(e => e.payment_mode === 'CASH' && this.isExpenseInPeriod(e.expense_date, this.selectedPeriod))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get periodOnlineExpenses(): number {
    return this.expenses
      .filter(e => e.payment_mode !== 'CASH' && this.isExpenseInPeriod(e.expense_date, this.selectedPeriod))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get periodExpensesCount(): number {
    return this.expenses.filter(e => this.isExpenseInPeriod(e.expense_date, this.selectedPeriod)).length;
  }

  get allPettyExpenses(): number {
    return this.expenses
      .filter(e => e.payment_mode === 'CASH')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get totalExpensesAmount(): number {
    return this.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  // Rolling 7 days total logged expenses
  get weekTotalExpenses(): number {
    return this.expenses
      .filter(e => this.isExpenseInPeriod(e.expense_date, 'WEEKLY'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get weekPettyExpenses(): number {
    return this.expenses
      .filter(e => e.payment_mode === 'CASH' && this.isExpenseInPeriod(e.expense_date, 'WEEKLY'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  // Current month total logged expenses
  get monthTotalExpenses(): number {
    return this.expenses
      .filter(e => this.isExpenseInPeriod(e.expense_date, 'MONTHLY'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get monthPettyExpenses(): number {
    return this.expenses
      .filter(e => e.payment_mode === 'CASH' && this.isExpenseInPeriod(e.expense_date, 'MONTHLY'))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get periodExpensesTotal(): number {
    return this.periodExpensesSum;
  }

  get periodMonthlyAverage(): number {
    if (this.selectedPeriod === 'LAST_3_MONTHS') {
      return Math.round(this.periodTotalRevenue / 3);
    }
    if (this.selectedPeriod === 'LAST_6_MONTHS') {
      return Math.round(this.periodTotalRevenue / 6);
    }
    return 0;
  }

  get periodicComparisonData() {
    const periods: ('DAILY' | 'WEEKLY' | 'MONTHLY' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'YEARLY')[] = [
      'DAILY', 'WEEKLY', 'MONTHLY', 'LAST_3_MONTHS', 'LAST_6_MONTHS', 'YEARLY'
    ];
    const periodMetadata: Record<string, { label: string; note: string }> = {
      DAILY: { label: 'Today (Daily)', note: 'Live Till + Today POS' },
      WEEKLY: { label: 'This Week (7 Days)', note: 'Rolling 7 Days' },
      MONTHLY: { label: 'This Month', note: 'Month-to-Date (MTD)' },
      LAST_3_MONTHS: { label: 'Last 3 Months', note: 'Quarterly Total' },
      LAST_6_MONTHS: { label: 'Last 6 Months', note: 'Half-Yearly Total' },
      YEARLY: { label: 'This Year (FY YTD)', note: 'Fiscal Year Total' }
    };

    return periods.map(p => {
      const cash = this.getCashSalesForPeriod(p);
      const upi = this.getUpiSalesForPeriod(p);
      const card = this.getCardSalesForPeriod(p);
      const total = cash + upi + card;
      const orders = this.getOrdersForPeriod(p).length;
      const expenses = this.expenses
        .filter(e => this.isExpenseInPeriod(e.expense_date, p))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const petty = this.expenses
        .filter(e => e.payment_mode === 'CASH' && this.isExpenseInPeriod(e.expense_date, p))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      return {
        period: periodMetadata[p].label,
        cash,
        upi,
        card,
        total,
        orders,
        expenses,
        netCash: cash - petty,
        note: periodMetadata[p].note
      };
    });
  }

  get displayedMonthlyTrend() {
    const monthsMap = new Map<string, { month: string; total: number; cash: number; upi: number; card: number; orders: number; isCurrent: boolean }>();
    const currentMonthKey = new Date().toISOString().substring(0, 7);

    for (const order of this.settledOrders) {
      const dateStr = order.settled_at || order.created_at || '';
      const key = dateStr.substring(0, 7);
      if (!key) continue;

      if (!monthsMap.has(key)) {
        const d = new Date(key + '-01');
        const monthName = isNaN(d.getTime()) ? key : d.toLocaleString('default', { month: 'long', year: 'numeric' });
        monthsMap.set(key, {
          month: key === currentMonthKey ? `${monthName} (Live)` : monthName,
          total: 0,
          cash: 0,
          upi: 0,
          card: 0,
          orders: 0,
          isCurrent: key === currentMonthKey
        });
      }

      const entry = monthsMap.get(key)!;
      const amt = Number(order.grand_total || order.total_amount) || 0;
      entry.total += amt;
      entry.orders += 1;
      if (order.payment_mode === 'CASH') entry.cash += amt;
      else if (order.payment_mode === 'UPI') entry.upi += amt;
      else if (order.payment_mode === 'CARD') entry.card += amt;
    }

    if (monthsMap.size === 0) {
      const d = new Date();
      const monthName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      monthsMap.set(currentMonthKey, {
        month: `${monthName} (Live)`,
        total: 0,
        cash: 0,
        upi: 0,
        card: 0,
        orders: 0,
        isCurrent: true
      });
    }

    const sorted = Array.from(monthsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(entry => entry[1]);

    if (this.selectedPeriod === 'LAST_3_MONTHS') {
      return sorted.slice(0, 3);
    }
    return sorted;
  }

  get monthlyBreakdownHistory() {
    return this.displayedMonthlyTrend;
  }

  // --- Dynamic Live Order Aggregations ---

  get todayPosCashSales(): number {
    return this.settledOrders.reduce((sum, o) => {
      if (o.payments && o.payments.length > 0) {
        const cashPay = o.payments
          .filter(p => p.payment_mode === 'CASH')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return sum + cashPay;
      }
      return sum;
    }, 0);
  }

  get todayUpiSales(): number {
    return this.settledOrders.reduce((sum, o) => {
      if (o.payments && o.payments.length > 0) {
        const upiPay = o.payments
          .filter(p => p.payment_mode === 'UPI')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return sum + upiPay;
      }
      return sum;
    }, 0);
  }

  get todayCardSales(): number {
    return this.settledOrders.reduce((sum, o) => {
      if (o.payments && o.payments.length > 0) {
        const cardPay = o.payments
          .filter(p => p.payment_mode === 'CARD' || p.payment_mode === 'SPLIT')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return sum + cardPay;
      }
      return sum;
    }, 0);
  }

  get todayTotalRevenue(): number {
    return this.todayPosCashSales + this.todayUpiSales + this.todayCardSales;
  }

  // --- Defensive Dynamic Computations (No String Concatenation) ---

  get computedExpectedCash(): number {
    const opening = Number(this.openingDrawer) || 0;
    const sales = Number(this.cashSales) || 0;
    const petty = Number(this.pettyExpenses) || 0;
    const refunds = Number(this.cashRefunds) || 0;
    return Math.round((opening + sales - petty - refunds) * 100) / 100;
  }

  get computedVariance(): number {
    const counted = Number(this.actualCountedCash) || 0;
    return Math.round((counted - this.computedExpectedCash) * 100) / 100;
  }

  onSalesChanged(): void {
    this.hasUserEditedSales = true;
  }

  onExpensesChanged(): void {
    this.hasUserEditedExpenses = true;
  }

  onCountedCashChanged(): void {
    this.hasUserEditedCountedCash = true;
  }

  /**
   * Resets and re-synchronizes drawer calculations with live POS settled orders & cash expenses
   */
  syncFromLivePos(): void {
    this.hasUserEditedSales = false;
    this.hasUserEditedExpenses = false;
    this.hasUserEditedCountedCash = false;
    this.cashSales = this.todayPosCashSales;
    this.pettyExpenses = this.todayPettyExpenses;
    this.actualCountedCash = this.computedExpectedCash;
    this.recalculateStatements();
  }

  /**
   * Quickly aligns counted cash with expected drawer cash for a balanced close
   */
  setCountedToExpected(): void {
    this.actualCountedCash = this.computedExpectedCash;
    this.hasUserEditedCountedCash = true;
  }

  onPeriodChange(period: any): void {
    this.selectedPeriod = period;
    this.recalculateStatements();
  }

  recalculateStatements(): void {
    this.pnl = this.financeService.getProfitAndLossSummary(this.settledOrders, this.selectedPeriod);
    this.taxSummaries = this.financeService.getTaxReportSummary(this.settledOrders);
  }

  recordCashClose(): void {
    const closing = this.financeService.recordNightlyCashClose(
      this.openingDrawer,
      this.cashSales,
      this.pettyExpenses,
      this.cashRefunds,
      this.actualCountedCash,
      this.cashCloseNotes
    );

    const sign = closing.variance_amount >= 0 ? '+' : '';
    alert(`✅ Day-End Cash Close recorded successfully!\n• Expected: ₹${closing.expected_drawer_cash}\n• Counted: ₹${closing.actual_counted_cash}\n• Variance: ${sign}₹${closing.variance_amount}`);
    this.cashCloseNotes = '';
  }

  saveExpense(): void {
    const amt = Number(this.expAmount);
    if (isNaN(amt) || amt <= 0 || !this.expVendor.trim()) {
      alert('Please enter a valid amount and vendor name.');
      return;
    }

    this.financeService.addExpense({
      category_name: this.expCategory,
      amount: amt,
      payment_mode: this.expPaymentMode,
      paid_to: this.expVendor.trim(),
      description: this.expDescription.trim() || 'Daily operational expense',
      expense_date: new Date().toISOString().split('T')[0],
      recorded_by_name: 'Current Cashier / Manager'
    });

    if (this.expPaymentMode === 'CASH' && !this.hasUserEditedExpenses) {
      this.pettyExpenses = this.todayPettyExpenses;
      if (!this.hasUserEditedCountedCash) {
        this.actualCountedCash = this.computedExpectedCash;
      }
    }

    // Auto-Restock Inventory Ingredient Stock if enabled
    let restockNote = '';
    if (this.linkInventoryStock && this.selectedIngredientId && this.restockQty > 0) {
      const ing = this.selectedIngredient;
      const unitCost = this.calculatedUnitCost;
      this.inventoryService.restockIngredient(this.selectedIngredientId, this.restockQty, unitCost);
      restockNote = `\n📦 Inventory Restocked: +${this.restockQty} ${ing?.uom || 'units'} added to ${ing?.name}!`;
    }

    this.showExpenseModal = false;
    this.expAmount = 0;
    this.expVendor = '';
    this.expDescription = '';
    this.expPaymentMode = 'CASH';
    this.linkInventoryStock = false;
    this.restockQty = 0;
    this.recalculateStatements();
    alert(`✅ Operational expense of ₹${amt} logged successfully in ${this.expCategory}!${restockNote}`);
  }

  openOverheadsModal(): void {
    const current = this.financeService.getMonthlyOverheads();
    this.rentInput = current.store_rent;
    this.utilitiesInput = current.utilities;
    this.payrollInput = current.staff_payroll;
    this.showOverheadsModal = true;
  }

  saveOverheads(): void {
    const rent = Number(this.rentInput);
    const util = Number(this.utilitiesInput);
    const payroll = Number(this.payrollInput);

    if (isNaN(rent) || rent < 0 || isNaN(util) || util < 0 || isNaN(payroll) || payroll < 0) {
      alert('Please enter valid non-negative amounts for monthly overheads.');
      return;
    }

    this.financeService.updateMonthlyOverheads({
      store_rent: rent,
      utilities: util,
      staff_payroll: payroll
    });

    this.showOverheadsModal = false;
    this.recalculateStatements();
    alert(`✅ Store Monthly Overheads updated successfully!\n• Rent: ₹${rent.toLocaleString('en-IN')}/mo (₹${Math.round(rent/30).toLocaleString('en-IN')}/day)\n• Utilities: ₹${util.toLocaleString('en-IN')}/mo (₹${Math.round(util/30).toLocaleString('en-IN')}/day)\n• Staff Payroll: ₹${payroll.toLocaleString('en-IN')}/mo (₹${Math.round(payroll/30).toLocaleString('en-IN')}/day)\n\nAll P&L statements have been recalculated.`);
  }
}
