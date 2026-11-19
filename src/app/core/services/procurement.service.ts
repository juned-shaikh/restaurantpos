import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Supplier, PurchaseOrder, GoodsReceiptNote } from '../models/procurement.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class ProcurementService {
  private get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'default';
  }

  private get STORAGE_KEY_SUPPLIERS(): string {
    return `orderrestro_suppliers_v1_${this.currentOrgId}`;
  }

  private get STORAGE_KEY_POS(): string {
    return `orderrestro_purchase_orders_v1_${this.currentOrgId}`;
  }

  private defaultSuppliers: Supplier[] = [];
  private defaultPOs: PurchaseOrder[] = [];
  private defaultGrn: GoodsReceiptNote[] = [];

  private suppliersSubject = new BehaviorSubject<Supplier[]>([]);
  private purchaseOrdersSubject = new BehaviorSubject<PurchaseOrder[]>([]);
  private grnSubject = new BehaviorSubject<GoodsReceiptNote[]>([]);

  suppliers$: Observable<Supplier[]> = this.suppliersSubject.asObservable();
  purchaseOrders$: Observable<PurchaseOrder[]> = this.purchaseOrdersSubject.asObservable();
  grnList$: Observable<GoodsReceiptNote[]> = this.grnSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadProcurementForOrg(org.id);
      }
    });
  }

  private initInitialState(): void {
    try {
      const savedSup = localStorage.getItem(this.STORAGE_KEY_SUPPLIERS);
      this.suppliersSubject.next(savedSup ? JSON.parse(savedSup) : []);

      const savedPOs = localStorage.getItem(this.STORAGE_KEY_POS);
      this.purchaseOrdersSubject.next(savedPOs ? JSON.parse(savedPOs) : []);
    } catch {
      this.suppliersSubject.next([]);
      this.purchaseOrdersSubject.next([]);
    }
  }

  async loadProcurementForOrg(orgId: string): Promise<void> {
    this.initInitialState();
    if (!this.supabaseService.client) return;

    try {
      const { data: supData } = await this.supabaseService
        .from('suppliers')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });
      if (supData) this.setSuppliersState(supData);

      const { data: poData } = await this.supabaseService
        .from('purchase_orders')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (poData) this.setPOsState(poData);
    } catch (e) {}
  }

  private async initSupabaseSync(): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) return;

    const orgId = this.tenantService.currentOrg?.id;

    // 1. Fetch Suppliers
    try {
      let query = this.supabaseService.from('suppliers').select('*');
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      const { data, error } = await query.order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        console.log(`🤝 [Procurement] Loaded ${data.length} suppliers from Supabase.`);
        this.setSuppliersState(data);
      }
    } catch (err) {
      console.warn('Procurement suppliers fetch warning:', err);
    }

    // 2. Fetch Purchase Orders
    try {
      let poQuery = this.supabaseService.from('purchase_orders').select('*');
      if (orgId) {
        poQuery = poQuery.eq('organization_id', orgId);
      }
      const { data: poData, error: poErr } = await poQuery.order('created_at', { ascending: false });

      if (!poErr && poData && poData.length > 0) {
        console.log(`📋 [Procurement] Loaded ${poData.length} purchase orders from Supabase.`);
        this.setPOsState(poData);
      }
    } catch (err) {
      console.warn('Procurement PO fetch warning:', err);
    }

    // 3. Realtime subscription
    try {
      this.supabaseService.subscribeToTableChanges('purchase_orders', (payload: any) => {
        const po = payload.new as PurchaseOrder;
        if (!po) return;
        const currentOrg = this.tenantService.currentOrg?.id;
        if (currentOrg && po.organization_id && po.organization_id !== currentOrg) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.purchaseOrdersSubject.value.some(p => p.id === po.id);
          if (!exists) {
            this.setPOsState([po, ...this.purchaseOrdersSubject.value]);
          }
        }
      });
    } catch {}
  }

  private setSuppliersState(s: Supplier[]): void {
    this.suppliersSubject.next(s);
    try { localStorage.setItem(this.STORAGE_KEY_SUPPLIERS, JSON.stringify(s)); } catch {}
  }

  private setPOsState(p: PurchaseOrder[]): void {
    this.purchaseOrdersSubject.next(p);
    try { localStorage.setItem(this.STORAGE_KEY_POS, JSON.stringify(p)); } catch {}
  }

  createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'created_at' | 'organization_id' | 'branch_id'>): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const newPo: PurchaseOrder = {
      ...po,
      id: `po-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: orgId,
      branch_id: branchId,
      created_at: new Date().toISOString()
    };

    // 1. Optimistic update
    this.setPOsState([newPo, ...this.purchaseOrdersSubject.value]);

    // 2. Persist to Supabase
    this.supabaseService
      .from('purchase_orders')
      .insert([newPo])
      .then((res: any) => {
        if (res?.error) console.warn('Supabase PO insert warning:', res.error);
      })
      .catch((err: any) => console.error(err));
  }
}
