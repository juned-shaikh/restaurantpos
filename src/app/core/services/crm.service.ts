import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Customer, LoyaltyTransaction, GiftVoucher, CustomerFeedback } from '../models/crm.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class CrmService {
  private get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'default';
  }

  private get currentBranchId(): string {
    return this.tenantService?.activeBranch?.id || 'branch-01';
  }

  private customersSubject = new BehaviorSubject<Customer[]>([]);
  private loyaltyTxnsSubject = new BehaviorSubject<LoyaltyTransaction[]>([]);
  private vouchersSubject = new BehaviorSubject<GiftVoucher[]>([]);
  private feedbackSubject = new BehaviorSubject<CustomerFeedback[]>([]);

  customers$: Observable<Customer[]> = this.customersSubject.asObservable();
  loyaltyTxns$: Observable<LoyaltyTransaction[]> = this.loyaltyTxnsSubject.asObservable();
  vouchers$: Observable<GiftVoucher[]> = this.vouchersSubject.asObservable();
  feedbackList$: Observable<CustomerFeedback[]> = this.feedbackSubject.asObservable();

  private get STORAGE_KEY_CUSTOMERS(): string {
    return `orderrestro_customers_v1_${this.currentOrgId}`;
  }

  private get STORAGE_KEY_FEEDBACK(): string {
    return `orderrestro_feedback_v1_${this.currentOrgId}`;
  }

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadCrmForOrg(org.id);
      }
    });
  }

  private initInitialState(): void {
    try {
      const savedCust = localStorage.getItem(this.STORAGE_KEY_CUSTOMERS);
      this.customersSubject.next(savedCust ? JSON.parse(savedCust) : []);

      const savedFb = localStorage.getItem(this.STORAGE_KEY_FEEDBACK);
      this.feedbackSubject.next(savedFb ? JSON.parse(savedFb) : []);
    } catch (e) {
      this.customersSubject.next([]);
      this.feedbackSubject.next([]);
    }
  }

  private persistCustomersLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_CUSTOMERS, JSON.stringify(this.customersSubject.value));
    } catch (e) {}
  }

  private persistFeedbackLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_FEEDBACK, JSON.stringify(this.feedbackSubject.value));
    } catch (e) {}
  }

  async loadCrmForOrg(orgId: string): Promise<void> {
    this.initInitialState();
    if (!this.supabaseService.client) return;

    try {
      const { data: custData } = await this.supabaseService
        .from('customers')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (custData) {
        this.customersSubject.next(custData);
        this.persistCustomersLocally();
      }

      const { data: fbData } = await this.supabaseService
        .from('customer_feedback')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (fbData) {
        this.feedbackSubject.next(fbData);
        this.persistFeedbackLocally();
      }
    } catch (e) {}
  }

  private async initSupabaseSync(): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (!client) {
        console.log('ℹ️ [CrmService] Supabase not connected. Operating in local mode.');
        return;
      }

      const orgId = this.tenantService.currentOrg?.id;

      // Fetch customers
      let custQuery = this.supabaseService.from('customers').select('*');
      if (orgId) {
        custQuery = custQuery.eq('organization_id', orgId);
      }
      const { data: custData, error: custErr } = await custQuery.order('created_at', { ascending: false });

      if (!custErr && custData && custData.length > 0) {
        console.log(`☁️ [CrmService] Loaded ${custData.length} customers from Supabase.`);
        this.customersSubject.next(custData);
        this.persistCustomersLocally();
      }

      // Fetch feedback
      let fbQuery = this.supabaseService.from('customer_feedback').select('*');
      if (orgId) {
        fbQuery = fbQuery.eq('organization_id', orgId);
      }
      const { data: fbData, error: fbErr } = await fbQuery.order('created_at', { ascending: false });

      if (!fbErr && fbData && fbData.length > 0) {
        this.feedbackSubject.next(fbData);
        this.persistFeedbackLocally();
      }

      // Realtime subscriptions
      this.supabaseService.subscribeToTableChanges('customers', (payload: any) => {
        const cust = payload.new as Customer;
        if (!cust) return;
        const currentOrg = this.tenantService.currentOrg?.id;
        if (currentOrg && cust.organization_id && cust.organization_id !== currentOrg) return;

        if (payload.eventType === 'INSERT') {
          if (!this.customersSubject.value.some(c => c.id === cust.id)) {
            this.customersSubject.next([cust, ...this.customersSubject.value]);
            this.persistCustomersLocally();
          }
        } else if (payload.eventType === 'UPDATE') {
          this.customersSubject.next(this.customersSubject.value.map(c => c.id === cust.id ? { ...c, ...cust } : c));
          this.persistCustomersLocally();
        }
      });

      this.supabaseService.subscribeToTableChanges('customer_feedback', (payload: any) => {
        const fb = payload.new as CustomerFeedback;
        if (!fb) return;
        const currentOrg = this.tenantService.currentOrg?.id;
        if (currentOrg && fb.organization_id && fb.organization_id !== currentOrg) return;

        if (payload.eventType === 'INSERT') {
          if (!this.feedbackSubject.value.some(f => f.id === fb.id)) {
            this.feedbackSubject.next([fb, ...this.feedbackSubject.value]);
            this.persistFeedbackLocally();
          }
        }
      });
    } catch (err) {
      console.warn('⚠️ [CrmService] Supabase sync notice:', err);
    }
  }

  private async saveCustomerToSupabase(cust: Customer): Promise<void> {
    try {
      if (this.supabaseService.client) {
        await this.supabaseService.from('customers').upsert({
          id: cust.id,
          organization_id: cust.organization_id || this.currentOrgId,
          full_name: cust.full_name,
          phone: cust.phone,
          email: cust.email || null,
          total_spent: cust.total_spent || 0,
          visit_count: cust.visit_count || 1,
          loyalty_points: cust.loyalty_points || 0,
          referral_code: cust.referral_code || null,
          membership_tier: cust.membership_tier || 'BRONZE',
          last_visit_at: cust.last_visit_at || new Date().toISOString(),
          created_at: cust.created_at || new Date().toISOString()
        });
      }
    } catch (e) {}
  }

  private async saveFeedbackToSupabase(fb: CustomerFeedback): Promise<void> {
    try {
      if (this.supabaseService.client) {
        await this.supabaseService.from('customer_feedback').insert({
          id: fb.id,
          organization_id: fb.organization_id || this.currentOrgId,
          branch_id: fb.branch_id || this.currentBranchId,
          customer_name: fb.customer_name,
          phone: fb.phone,
          rating: fb.rating,
          food_rating: fb.food_rating || 5,
          service_rating: fb.service_rating || 5,
          ambience_rating: fb.ambience_rating || 5,
          comments: fb.comments || '',
          created_at: fb.created_at || new Date().toISOString()
        });
      }
    } catch (e) {}
  }

  get customers(): Customer[] {
    return this.customersSubject.value;
  }

  getCustomerByPhone(phone: string): Customer | undefined {
    return this.customers.find(c => c.phone.replace(/\D/g, '').endsWith(phone.replace(/\D/g, '')));
  }

  addCustomer(customer: Omit<Customer, 'id' | 'created_at' | 'organization_id' | 'total_spent' | 'visit_count' | 'loyalty_points' | 'membership_tier' | 'referral_code'>): Customer {
    const newCust: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
      organization_id: this.currentOrgId,
      total_spent: 0,
      visit_count: 0,
      loyalty_points: 50, // Welcome bonus points!
      membership_tier: 'BRONZE',
      referral_code: customer.full_name.substring(0, 4).toUpperCase() + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toISOString()
    };
    this.customersSubject.next([...this.customers, newCust]);
    this.persistCustomersLocally();
    this.saveCustomerToSupabase(newCust);
    return newCust;
  }

  submitFeedback(fb: Omit<CustomerFeedback, 'id' | 'created_at' | 'organization_id' | 'branch_id'>): void {
    const newFb: CustomerFeedback = {
      ...fb,
      id: `fb-${Date.now()}`,
      organization_id: this.currentOrgId,
      branch_id: this.currentBranchId,
      created_at: new Date().toISOString()
    };
    this.feedbackSubject.next([newFb, ...this.feedbackSubject.value]);
    this.persistFeedbackLocally();
    this.saveFeedbackToSupabase(newFb);
  }
}

