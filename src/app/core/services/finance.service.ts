import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CashClosing, Expense, MonthlyBudget, ProfitAndLossSummary, TaxReportSummary } from '../models/finance.model';
import { Order } from '../models/order.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { StaffService } from './staff.service';

export interface MonthlyOverheads {
  store_rent: number;
  utilities: number;
  staff_payroll: number;
}

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  private get STORAGE_KEY_EXPENSES(): string {
    return `orderrestro_accounting_expenses_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_CASH_CLOSINGS(): string {
    return `orderrestro_accounting_cash_closings_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_OVERHEADS(): string {
    return `orderrestro_fixed_overheads_${this.currentOrgId}`;
  }

  get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'org-cafe-01';
  }

  get currentBranchId(): string {
    return this.tenantService?.activeBranch?.id || 'branch-01';
  }

  private overheads: MonthlyOverheads = {
    store_rent: 0,
    utilities: 0,
    staff_payroll: 0
  };

  private initialBudgets: { category_name: string; budget_amount: number; base_spent: number }[] = [
    { category_name: 'Dairy & Fresh Produce', budget_amount: 0, base_spent: 0 },
    { category_name: 'Fuel & LPG Cylinder', budget_amount: 0, base_spent: 0 },
    { category_name: 'Cleaning & Sanitation Supplies', budget_amount: 0, base_spent: 0 },
    { category_name: 'Staff Welfare & Petty Cash', budget_amount: 0, base_spent: 0 },
    { category_name: 'Kitchen Equipment Maintenance', budget_amount: 0, base_spent: 0 }
  ];

  private defaultCashClosings: CashClosing[] = [];
  private defaultExpenses: Expense[] = [];

  private cashClosingsSubject = new BehaviorSubject<CashClosing[]>([]);
  private expensesSubject = new BehaviorSubject<Expense[]>([]);
  private budgetsSubject = new BehaviorSubject<MonthlyBudget[]>([]);

  cashClosings$: Observable<CashClosing[]> = this.cashClosingsSubject.asObservable();
  expenses$: Observable<Expense[]> = this.expensesSubject.asObservable();
  budgets$: Observable<MonthlyBudget[]> = this.budgetsSubject.asObservable();

  public isSupabaseConnected: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService,
    private staffService: StaffService
  ) {
    this.initInitialState();
    this.recalculateBudgets();
    this.initSupabaseSync();

    // Reactively switch finance data when restaurant tenant switches
    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadFinanceForOrg(org.id);
      }
    });
  }

  get isCloudConnected(): boolean {
    return this.supabaseService.isConnected;
  }

  /**
   * 1. Load initial cache from localStorage immediately for offline-first zero-latency UI
   */
  private initInitialState(): void {
    try {
      const savedExpenses = localStorage.getItem(this.STORAGE_KEY_EXPENSES);
      if (savedExpenses) {
        this.expensesSubject.next(JSON.parse(savedExpenses));
      } else {
        this.expensesSubject.next([]);
      }

      const savedClosings = localStorage.getItem(this.STORAGE_KEY_CASH_CLOSINGS);
      if (savedClosings) {
        this.cashClosingsSubject.next(JSON.parse(savedClosings));
      } else {
        this.cashClosingsSubject.next([]);
      }

      const savedOverheads = localStorage.getItem(this.STORAGE_KEY_OVERHEADS);
      if (savedOverheads) {
        this.overheads = JSON.parse(savedOverheads);
      }
    } catch {
      this.expensesSubject.next([]);
      this.cashClosingsSubject.next([]);
    }
  }

  public async loadFinanceForOrg(orgId: string): Promise<void> {
    // 1. Try local storage cache for this org
    try {
      const savedExpenses = localStorage.getItem(`orderrestro_accounting_expenses_${orgId}`);
      if (savedExpenses) {
        this.expensesSubject.next(JSON.parse(savedExpenses));
      } else {
        this.expensesSubject.next([]);
      }

      const savedClosings = localStorage.getItem(`orderrestro_accounting_cash_closings_${orgId}`);
      if (savedClosings) {
        this.cashClosingsSubject.next(JSON.parse(savedClosings));
      } else {
        this.cashClosingsSubject.next([]);
      }

      this.recalculateBudgets();
    } catch (e) {}

    // 2. Fetch from Supabase for this org
    const client = this.supabaseService.client;
    if (!client) return;

    try {
      const { data: expData, error: expErr } = await this.supabaseService
        .from('expenses')
        .select('*')
        .eq('organization_id', orgId)
        .order('expense_date', { ascending: false });

      if (!expErr && expData) {
        this.setExpensesState(expData);
      }

      const { data: ccData, error: ccErr } = await this.supabaseService
        .from('cash_closings')
        .select('*')
        .eq('organization_id', orgId)
        .order('closing_date', { ascending: false });

      if (!ccErr && ccData) {
        this.setCashClosingsState(ccData);
      }
    } catch (err) {
      console.warn(`⚠️ [Finance] Error loading finance for tenant ${orgId}:`, err);
    }
  }

  /**
   * 2. Synchronize with Supabase Cloud Database (bidirectional)
   */
  private async initSupabaseSync(): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) {
      console.log('ℹ️ [Finance] Supabase not connected. Operating in local cache mode.');
      return;
    }

    this.isSupabaseConnected = true;
    const orgId = this.currentOrgId;

    // A. Fetch expenses from Supabase
    try {
      const { data, error } = await this.supabaseService
        .from('expenses')
        .select('*')
        .eq('organization_id', orgId)
        .order('expense_date', { ascending: false });

      if (!error && data && data.length > 0) {
        console.log(`☁️ [Finance] Loaded ${data.length} expenses from Supabase for ${orgId}.`);
        this.setExpensesState(data);
      } else if (error) {
        console.warn('⚠️ [Finance] Supabase expenses notice:', error.message || error);
      }
    } catch (err) {
      console.error('❌ [Finance] Error fetching expenses from Supabase:', err);
    }

    // B. Fetch cash closings from Supabase
    try {
      const { data: ccData, error: ccErr } = await this.supabaseService
        .from('cash_closings')
        .select('*')
        .eq('organization_id', orgId)
        .order('closing_date', { ascending: false });

      if (!ccErr && ccData && ccData.length > 0) {
        console.log(`☁️ [Finance] Loaded ${ccData.length} cash closings from Supabase for ${orgId}.`);
        this.setCashClosingsState(ccData);
      } else if (ccErr) {
        console.warn('⚠️ [Finance] Supabase cash_closings notice:', ccErr.message || ccErr);
      }
    } catch (err) {
      console.error('❌ [Finance] Error fetching cash closings from Supabase:', err);
    }

    // C. Subscribe to Real-time database changes across devices
    this.listenToRealtimeChanges();
  }

  private setExpensesState(expenses: Expense[]): void {
    this.expensesSubject.next(expenses);
    this.recalculateBudgets();
    try {
      localStorage.setItem(this.STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    } catch {}
  }

  private setCashClosingsState(closings: CashClosing[]): void {
    this.cashClosingsSubject.next(closings);
    try {
      localStorage.setItem(this.STORAGE_KEY_CASH_CLOSINGS, JSON.stringify(closings));
    } catch {}
  }

  private async seedInitialExpenses(): Promise<void> {
    const orgId = this.tenantService.currentOrg?.id || 'org-cafe-01';
    for (const exp of this.defaultExpenses) {
      try {
        await this.supabaseService.from('expenses').insert({
          ...exp,
          organization_id: orgId
        });
      } catch {}
    }
  }

  private async seedInitialCashClosings(): Promise<void> {
    const orgId = this.tenantService.currentOrg?.id || 'org-cafe-01';
    for (const cc of this.defaultCashClosings) {
      try {
        await this.supabaseService.from('cash_closings').insert({
          ...cc,
          organization_id: orgId
        });
      } catch {}
    }
  }

  private listenToRealtimeChanges(): void {
    try {
      this.supabaseService.subscribeToTableChanges('expenses', (payload: any) => {
        const item = payload.new as Expense;
        if (!item || (item.organization_id && item.organization_id !== this.currentOrgId)) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.expensesSubject.value.some(e => e.id === item.id);
          if (!exists) {
            this.setExpensesState([item, ...this.expensesSubject.value]);
          }
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old;
          if (old && old.id) {
            this.setExpensesState(this.expensesSubject.value.filter(e => e.id !== old.id));
          }
        }
      });

      this.supabaseService.subscribeToTableChanges('cash_closings', (payload: any) => {
        const closing = payload.new as CashClosing;
        if (!closing || (closing.organization_id && closing.organization_id !== this.currentOrgId)) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.cashClosingsSubject.value.some(c => c.id === closing.id);
          if (!exists) {
            this.setCashClosingsState([closing, ...this.cashClosingsSubject.value]);
          }
        }
      });
    } catch (e) {
      console.warn('⚠️ [Finance] Real-time Supabase subscriptions unavailable:', e);
    }
  }

  /**
   * Get and update customizable store monthly overheads (Rent, Electricity/Water, Staff Payroll)
   */
  getStaffPayrollMonthly(): number {
    try {
      if (this.staffService) {
        const liveTotal = this.staffService.getCurrentMonthNetPayrollTotal();
        if (liveTotal > 0) return liveTotal;
      }
    } catch {}
    return this.overheads.staff_payroll;
  }

  getMonthlyOverheads(): MonthlyOverheads {
    return {
      ...this.overheads,
      staff_payroll: this.getStaffPayrollMonthly()
    };
  }

  updateMonthlyOverheads(updated: MonthlyOverheads): void {
    this.overheads = {
      store_rent: Number(updated.store_rent) || 0,
      utilities: Number(updated.utilities) || 0,
      staff_payroll: Number(updated.staff_payroll) || 0
    };
    try {
      localStorage.setItem(this.STORAGE_KEY_OVERHEADS, JSON.stringify(this.overheads));
    } catch {}
  }

  /**
   * Dynamically aggregates recorded expenses per category and recalculates budget utilization
   */
  public recalculateBudgets(): void {
    const expenses = this.expensesSubject.value;
    const currentMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-11"

    const updatedBudgets: MonthlyBudget[] = this.initialBudgets.map((b, idx) => {
      const spentForCategory = expenses
        .filter(e => e.category_name.toLowerCase().trim() === b.category_name.toLowerCase().trim())
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const totalActual = b.base_spent + spentForCategory;
      const variance = b.budget_amount - totalActual;
      const utilization = b.budget_amount > 0 ? Math.round((totalActual / b.budget_amount) * 1000) / 10 : 0;

      return {
        id: `bg-0${idx + 1}`,
        category_name: b.category_name,
        month_year: currentMonth,
        budget_amount: b.budget_amount,
        actual_spent: totalActual,
        variance_amount: variance,
        utilization_pct: utilization
      };
    });

    this.budgetsSubject.next(updatedBudgets);
  }

  /**
   * Record Nightly Cash Close: Updates memory, saves to localStorage, and saves to Supabase Cloud
   */
  recordNightlyCashClose(
    openingDrawer: number,
    cashSales: number,
    pettyExpenses: number,
    cashRefunds: number,
    actualCountedCash: number,
    notes?: string
  ): CashClosing {
    const opening = Number(openingDrawer) || 0;
    const sales = Number(cashSales) || 0;
    const petty = Number(pettyExpenses) || 0;
    const refunds = Number(cashRefunds) || 0;
    const actual = Number(actualCountedCash) || 0;

    const expected = Math.round((opening + sales - petty - refunds) * 100) / 100;
    const variance = Math.round((actual - expected) * 100) / 100;

    const orgId = this.tenantService.currentOrg?.id || 'org-cafe-01';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const closing: CashClosing = {
      id: `cc-${Date.now()}`,
      organization_id: orgId,
      branch_id: branchId,
      closed_by_name: 'Current Cashier / Manager',
      closing_date: new Date().toISOString().split('T')[0],
      opening_drawer_cash: opening,
      cash_sales_collected: sales,
      petty_cash_expenses: petty,
      cash_refunds: refunds,
      expected_drawer_cash: expected,
      actual_counted_cash: actual,
      variance_amount: variance,
      notes,
      verified_by_manager: Math.abs(variance) <= 50,
      created_at: new Date().toISOString()
    };

    const updated = [closing, ...this.cashClosingsSubject.value];
    this.setCashClosingsState(updated);

    // Asynchronously insert into Supabase Cloud
    this.saveClosingToSupabase(closing);

    return closing;
  }

  private async saveClosingToSupabase(closing: CashClosing): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        const { error } = await this.supabaseService.from('cash_closings').insert({
          id: closing.id,
          organization_id: closing.organization_id,
          branch_id: closing.branch_id,
          closed_by_name: closing.closed_by_name,
          closing_date: closing.closing_date,
          opening_drawer_cash: closing.opening_drawer_cash,
          cash_sales_collected: closing.cash_sales_collected,
          petty_cash_expenses: closing.petty_cash_expenses,
          cash_refunds: closing.cash_refunds,
          expected_drawer_cash: closing.expected_drawer_cash,
          actual_counted_cash: closing.actual_counted_cash,
          variance_amount: closing.variance_amount,
          notes: closing.notes || '',
          verified_by_manager: closing.verified_by_manager,
          created_at: closing.created_at
        });

        if (error) {
          console.warn('⚠️ [Finance] Supabase save notice for cash close:', error.message || error);
        } else {
          console.log('☁️ [Finance] Cash close saved successfully to Supabase:', closing.id);
        }
      }
    } catch (e) {
      console.warn('⚠️ [Finance] Could not save cash close to Supabase (offline):', e);
    }
  }

  /**
   * Log Operational Expense: Updates memory, saves to localStorage, and saves to Supabase Cloud
   */
  addExpense(expense: Omit<Expense, 'id' | 'organization_id' | 'branch_id'>): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-cafe-01';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const newExp: Expense = {
      ...expense,
      id: `exp-${Date.now()}`,
      organization_id: orgId,
      branch_id: branchId
    };

    const updated = [newExp, ...this.expensesSubject.value];
    this.setExpensesState(updated);

    // Asynchronously insert into Supabase Cloud
    this.saveExpenseToSupabase(newExp);
  }

  private async saveExpenseToSupabase(expense: Expense): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        const { error } = await this.supabaseService.from('expenses').insert({
          id: expense.id,
          organization_id: expense.organization_id,
          branch_id: expense.branch_id,
          category_name: expense.category_name,
          amount: expense.amount,
          payment_mode: expense.payment_mode,
          paid_to: expense.paid_to,
          description: expense.description || '',
          expense_date: expense.expense_date,
          recorded_by_name: expense.recorded_by_name || 'Cashier'
        });

        if (error) {
          console.warn('⚠️ [Finance] Supabase save notice for expense:', error.message || error);
        } else {
          console.log('☁️ [Finance] Expense saved successfully to Supabase:', expense.id);
        }
      }
    } catch (e) {
      console.warn('⚠️ [Finance] Could not save expense to Supabase (offline):', e);
    }
  }

  /**
   * Dynamically generates Profit & Loss statement incorporating live settled orders,
   * logged expenses, and the active financial period filter (Daily, Weekly, Monthly, etc.)
   */
  getProfitAndLossSummary(
    settledOrders: Order[] = [],
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'YEARLY' = 'DAILY'
  ): ProfitAndLossSummary {
    const liveSales = settledOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const liveDiscounts = settledOrders.reduce((sum, o) => sum + (Number(o.discount_amount) || 0), 0);

    let periodName = 'November 2026 (Live Month-to-Date)';
    let baseGross = 0;
    let baseDiscounts = 0;
    let rentFactor = 1.0;
    let utilFactor = 1.0;
    let payrollFactor = 1.0;

    switch (period) {
      case 'DAILY':
        periodName = 'Daily (Today - Live Till & POS)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 1 / 30; // 1 day pro-rated rent
        utilFactor = 1 / 30;
        payrollFactor = 1 / 30;
        break;
      case 'WEEKLY':
        periodName = 'This Week (Rolling 7 Days)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 7 / 30;
        utilFactor = 7 / 30;
        payrollFactor = 7 / 30;
        break;
      case 'MONTHLY':
        periodName = 'November 2026 (Live Month-to-Date)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 1.0;
        utilFactor = 1.0;
        payrollFactor = 1.0;
        break;
      case 'LAST_3_MONTHS':
        periodName = 'Last 3 Months (Quarterly Q3)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 3.0;
        utilFactor = 3.0;
        payrollFactor = 3.0;
        break;
      case 'LAST_6_MONTHS':
        periodName = 'Last 6 Months (Half-Yearly)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 6.0;
        utilFactor = 6.0;
        payrollFactor = 6.0;
        break;
      case 'YEARLY':
        periodName = 'Financial Year 2026 (Annual YTD)';
        baseGross = 0;
        baseDiscounts = 0;
        rentFactor = 12.0;
        utilFactor = 12.0;
        payrollFactor = 12.0;
        break;
    }

    const grossSales = Math.round((baseGross + liveSales) * 100) / 100;
    const totalDiscounts = Math.round((baseDiscounts + liveDiscounts) * 100) / 100;
    const netSales = Math.max(0, Math.round((grossSales - totalDiscounts) * 100) / 100);

    // 28% Food & Raw ingredient cost (industry benchmark for upscale cafe)
    const cogs = Math.round(netSales * 0.28 * 100) / 100;
    const grossProfit = Math.round((netSales - cogs) * 100) / 100;
    const grossMarginPct = netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;

    // Fixed overheads pro-rated to the selected timeframe
    const dynamicStaffPayroll = this.getStaffPayrollMonthly();
    const fixedOverheads = [
      {
        category: period === 'DAILY' ? 'Store Rent & Property (Daily Pro-rated)' : (period === 'WEEKLY' ? 'Store Rent & Property (Weekly)' : 'Store Rent & Property Maintenance'),
        amount: Math.round(this.overheads.store_rent * rentFactor * 100) / 100
      },
      {
        category: period === 'DAILY' ? 'Utilities - Electricity & Water (Daily Pro-rated)' : (period === 'WEEKLY' ? 'Utilities (Weekly)' : 'Utilities (Electricity & Water)'),
        amount: Math.round(this.overheads.utilities * utilFactor * 100) / 100
      },
      {
        category: period === 'DAILY' ? 'Staff Payroll & Shift Wages (Daily Pro-rated)' : (period === 'WEEKLY' ? 'Staff Payroll (Weekly)' : 'Staff Payroll & Welfare'),
        amount: Math.round(dynamicStaffPayroll * payrollFactor * 100) / 100
      }
    ];

    // Dynamic operational overheads grouped from recorded expenses
    const expenses = this.expensesSubject.value;
    const expByCategory: { [cat: string]: number } = {};
    for (const exp of expenses) {
      let amt = Number(exp.amount) || 0;
      if (period === 'DAILY') {
        amt = exp.payment_mode === 'CASH' ? amt : Math.round((amt / 30) * 100) / 100;
      } else if (period === 'WEEKLY') {
        amt = Math.round((amt * 7 / 30) * 100) / 100;
      } else if (period === 'LAST_3_MONTHS') {
        amt = amt * 3;
      } else if (period === 'LAST_6_MONTHS') {
        amt = amt * 6;
      } else if (period === 'YEARLY') {
        amt = amt * 12;
      }
      expByCategory[exp.category_name] = (expByCategory[exp.category_name] || 0) + amt;
    }

    const dynamicExpenseLines = Object.entries(expByCategory).map(([cat, amt]) => ({
      category: cat,
      amount: Math.round(amt * 100) / 100
    }));

    const allOperatingExpenses = [...fixedOverheads, ...dynamicExpenseLines];
    const totalExpenses = Math.round(allOperatingExpenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
    const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
    const netProfitMarginPct = netSales > 0 ? Math.round((netProfit / netSales) * 1000) / 10 : 0;

    return {
      period: periodName,
      gross_sales: grossSales,
      discounts: totalDiscounts,
      net_sales: netSales,
      cost_of_goods_sold: cogs,
      gross_profit: grossProfit,
      gross_margin_pct: grossMarginPct,
      operating_expenses: allOperatingExpenses,
      total_expenses: totalExpenses,
      staff_payroll: Math.round(dynamicStaffPayroll * payrollFactor * 100) / 100,
      net_profit_before_tax: netProfit,
      net_profit_margin_pct: netProfitMarginPct
    };
  }

  /**
   * Dynamically aggregates GST tax report from settled POS orders and monthly ledger
   */
  getTaxReportSummary(settledOrders: Order[] = []): TaxReportSummary[] {
    const liveTaxable = settledOrders.reduce(
      (sum, o) => sum + (Number(o.taxable_amount || (o.subtotal - o.discount_amount)) || 0),
      0
    );
    const liveCgst = settledOrders.reduce((sum, o) => sum + (Number(o.cgst_amount) || 0), 0);
    const liveSgst = settledOrders.reduce((sum, o) => sum + (Number(o.sgst_amount) || 0), 0);
    const liveTaxLiability = Math.round((liveCgst + liveSgst) * 100) / 100;

    return [
      {
        tax_slab: "Today's Live POS Settled Billing (GST 5% - 2.5% CGST + 2.5% SGST)",
        taxable_sales: Math.round(liveTaxable * 100) / 100,
        cgst_collected: Math.round(liveCgst * 100) / 100,
        sgst_collected: Math.round(liveSgst * 100) / 100,
        total_tax_liability: liveTaxLiability
      },
      {
        tax_slab: 'Consolidated Month-to-Date GSTR-3B (GST 5%)',
        taxable_sales: Math.round(liveTaxable * 100) / 100,
        cgst_collected: Math.round(liveCgst * 100) / 100,
        sgst_collected: Math.round(liveSgst * 100) / 100,
        total_tax_liability: liveTaxLiability
      }
    ];
  }
}
