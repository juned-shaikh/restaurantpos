import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { InventoryItem, Recipe, WasteLog, UnitOfMeasure } from '../models/inventory.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'org-default';
  }

  get currentBranchId(): string {
    return this.tenantService?.activeBranch?.id || 'branch-01';
  }

  private get STORAGE_KEY_ITEMS(): string {
    return `orderrestro_inventory_items_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_WASTE(): string {
    return `orderrestro_waste_logs_${this.currentOrgId}`;
  }

  private defaultIngredients: InventoryItem[] = [];
  private defaultWasteLogs: WasteLog[] = [];

  private ingredientsSubject = new BehaviorSubject<InventoryItem[]>([]);
  private recipesSubject = new BehaviorSubject<Recipe[]>([]);
  private wasteLogsSubject = new BehaviorSubject<WasteLog[]>([]);

  ingredients$: Observable<InventoryItem[]> = this.ingredientsSubject.asObservable();
  recipes$: Observable<Recipe[]> = this.recipesSubject.asObservable();
  wasteLogs$: Observable<WasteLog[]> = this.wasteLogsSubject.asObservable();

  public isSupabaseConnected: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    // Reactively switch inventory data when tenant switches
    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadInventoryForOrg(org.id);
      }
    });
  }

  get ingredients(): InventoryItem[] {
    return this.ingredientsSubject.value;
  }

  get wasteLogs(): WasteLog[] {
    return this.wasteLogsSubject.value;
  }

  private initInitialState(): void {
    // 1. Load from localStorage if present for fast render
    try {
      const savedItems = localStorage.getItem(this.STORAGE_KEY_ITEMS);
      if (savedItems) {
        this.ingredientsSubject.next(JSON.parse(savedItems));
      } else {
        this.ingredientsSubject.next([]);
      }

      const savedWaste = localStorage.getItem(this.STORAGE_KEY_WASTE);
      if (savedWaste) {
        this.wasteLogsSubject.next(JSON.parse(savedWaste));
      } else {
        this.wasteLogsSubject.next([]);
      }
    } catch {
      this.ingredientsSubject.next([]);
      this.wasteLogsSubject.next([]);
    }
  }

  public async loadInventoryForOrg(orgId: string): Promise<void> {
    try {
      const savedItems = localStorage.getItem(`orderrestro_inventory_items_${orgId}`);
      if (savedItems) {
        this.ingredientsSubject.next(JSON.parse(savedItems));
      } else {
        this.ingredientsSubject.next([]);
      }

      const savedWaste = localStorage.getItem(`orderrestro_waste_logs_${orgId}`);
      if (savedWaste) {
        this.wasteLogsSubject.next(JSON.parse(savedWaste));
      } else {
        this.wasteLogsSubject.next([]);
      }
    } catch (e) {}

    const client = this.supabaseService.client;
    if (!client) return;

    try {
      const { data, error } = await this.supabaseService
        .from('inventory_items')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });

      if (!error && data) {
        this.setIngredientsState(data);
      }

      const { data: wasteData, error: wasteErr } = await this.supabaseService
        .from('waste_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (!wasteErr && wasteData) {
        this.setWasteLogsState(wasteData);
      }
    } catch (err) {
      console.warn(`⚠️ [Inventory] Error loading inventory for tenant ${orgId}:`, err);
    }
  }

  private async initSupabaseSync(): Promise<void> {
    const client = this.supabaseService.client;
    if (!client) {
      console.log('ℹ️ [Inventory] Supabase not connected. Operating with local cache.');
      return;
    }

    this.isSupabaseConnected = true;
    const orgId = this.currentOrgId;

    // 1. Fetch inventory items from Supabase
    try {
      const { data, error } = await this.supabaseService
        .from('inventory_items')
        .select('*')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        console.log(`📦 [Inventory] Loaded ${data.length} items from Supabase for ${orgId}.`);
        this.setIngredientsState(data);
      } else if (error) {
        console.warn('⚠️ [Inventory] Supabase query notice:', error.message || error);
      }
    } catch (err) {
      console.error('❌ [Inventory] Error fetching inventory from Supabase:', err);
    }

    // 2. Fetch waste logs from Supabase
    try {
      const { data: wasteData, error: wasteErr } = await this.supabaseService
        .from('waste_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (!wasteErr && wasteData && wasteData.length > 0) {
        console.log(`🗑️ [Inventory] Loaded ${wasteData.length} waste logs from Supabase for ${orgId}.`);
        this.setWasteLogsState(wasteData);
      }
    } catch (err) {
      console.error('❌ [Inventory] Error fetching waste logs from Supabase:', err);
    }

    // 3. Realtime subscriptions for Live multi-device syncing
    this.listenToRealtimeChanges();
  }

  private listenToRealtimeChanges(): void {
    try {
      this.supabaseService.subscribeToTableChanges('inventory_items', (payload: any) => {
        const item = payload.new as InventoryItem;
        if (!item || (item.organization_id && item.organization_id !== this.currentOrgId)) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.ingredients.some(i => i.id === item.id);
          if (!exists) {
            this.setIngredientsState([item, ...this.ingredients]);
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = this.ingredients.map(i => i.id === item.id ? { ...i, ...item } : i);
          this.setIngredientsState(updated);
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old;
          if (old && old.id) {
            this.setIngredientsState(this.ingredients.filter(i => i.id !== old.id));
          }
        }
      });

      this.supabaseService.subscribeToTableChanges('waste_logs', (payload: any) => {
        const waste = payload.new as WasteLog;
        if (!waste || (waste.organization_id && waste.organization_id !== this.currentOrgId)) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.wasteLogs.some(w => w.id === waste.id);
          if (!exists) {
            this.setWasteLogsState([waste, ...this.wasteLogs]);
          }
        }
      });
    } catch (e) {
      console.warn('Could not setup realtime subscriptions:', e);
    }
  }

  private async seedInitialInventory(orgId: string): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .from('inventory_items')
        .insert(this.defaultIngredients);

      if (!error) {
        console.log('✅ [Inventory] Initial inventory successfully seeded to Supabase!');
      }
    } catch (err) {
      console.warn('Seed inventory skipped or failed:', err);
    }
  }

  private setIngredientsState(items: InventoryItem[]): void {
    this.ingredientsSubject.next(items);
    try {
      localStorage.setItem(this.STORAGE_KEY_ITEMS, JSON.stringify(items));
    } catch {}
  }

  private setWasteLogsState(logs: WasteLog[]): void {
    this.wasteLogsSubject.next(logs);
    try {
      localStorage.setItem(this.STORAGE_KEY_WASTE, JSON.stringify(logs));
    } catch {}
  }

  addIngredient(item: {
    name: string;
    uom: UnitOfMeasure | string;
    current_stock: number;
    reorder_level: number;
    avg_unit_cost: number;
    sku?: string;
  }): InventoryItem {
    const stock = Number(item.current_stock) || 0;
    const reorder = Number(item.reorder_level) || 0;
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const newItem: InventoryItem = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: orgId,
      branch_id: branchId,
      name: item.name,
      sku: item.sku || `RAW-${item.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)}-${Math.floor(Math.random() * 900 + 100)}`,
      uom: (item.uom as UnitOfMeasure) || 'KG',
      current_stock: stock,
      reorder_level: reorder,
      avg_unit_cost: Number(item.avg_unit_cost) || 0,
      is_low_stock: stock <= reorder,
      is_active: true,
      created_at: new Date().toISOString()
    };

    // 1. Optimistic local update
    this.setIngredientsState([newItem, ...this.ingredients]);

    // 2. Persist to Supabase
    this.supabaseService
      .from('inventory_items')
      .insert([newItem])
      .then((res: any) => {
        if (res?.error) {
          console.warn('⚠️ [Inventory] Supabase insert warning:', res.error);
        } else {
          console.log('✅ [Inventory] Saved item to Supabase:', newItem.name);
        }
      })
      .catch((err: any) => console.error('Supabase insert error:', err));

    return newItem;
  }

  /**
   * Restocks an inventory ingredient (e.g. from an Expense payout or supplier purchase)
   * Automatically updates stock level, clears low-stock flags, and syncs to Supabase Cloud
   */
  restockIngredient(itemId: string, addQty: number, unitCost?: number): boolean {
    const item = this.ingredients.find(i => i.id === itemId);
    if (!item) return false;

    const qty = Number(addQty) || 0;
    if (qty <= 0) return false;

    const newStock = Math.round((item.current_stock + qty) * 100) / 100;
    const isLow = newStock <= item.reorder_level;
    const avgCost = unitCost && unitCost > 0 ? Number(unitCost) : item.avg_unit_cost;

    const updated = this.ingredients.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          current_stock: newStock,
          is_low_stock: isLow,
          avg_unit_cost: avgCost
        };
      }
      return i;
    });

    this.setIngredientsState(updated);

    // Persist to Supabase
    if (this.supabaseService.client) {
      this.supabaseService
        .from('inventory_items')
        .update({
          current_stock: newStock,
          is_low_stock: isLow,
          avg_unit_cost: avgCost
        })
        .eq('id', itemId)
        .then((res: any) => {
          if (!res?.error) {
            console.log(`☁️ [Inventory] Restocked ${item.name}: +${qty} ${item.uom}. New stock: ${newStock}`);
          }
        })
        .catch(() => {});
    }

    return true;
  }

  logWaste(log: Omit<WasteLog, 'id' | 'created_at' | 'organization_id' | 'branch_id'>): void {
    const orgId = this.tenantService.currentOrg?.id || 'org-default';
    const branchId = this.tenantService.activeBranch?.id || 'branch-01';

    const newLog: WasteLog = {
      ...log,
      id: `wst-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: orgId,
      branch_id: branchId,
      created_at: new Date().toISOString()
    };

    // Deduct stock locally
    let updatedItem: InventoryItem | null = null;
    const updated = this.ingredients.map(item => {
      if (item.id === log.inventory_item_id) {
        const remaining = Math.max(0, Number((item.current_stock - log.quantity_wasted).toFixed(2)));
        updatedItem = {
          ...item,
          current_stock: remaining,
          is_low_stock: remaining <= item.reorder_level
        };
        return updatedItem;
      }
      return item;
    });

    this.setIngredientsState(updated);
    this.setWasteLogsState([newLog, ...this.wasteLogs]);

    // Persist log to Supabase
    this.supabaseService
      .from('waste_logs')
      .insert([newLog])
      .then((res: any) => {
        if (res?.error) console.warn('Supabase waste_logs insert error:', res.error);
      })
      .catch((err: any) => console.error(err));

    // Update stock in Supabase
    if (updatedItem) {
      const itemToUpdate = updatedItem as InventoryItem;
      this.supabaseService
        .from('inventory_items')
        .update({
          current_stock: itemToUpdate.current_stock,
          is_low_stock: itemToUpdate.is_low_stock
        })
        .eq('id', itemToUpdate.id)
        .then((res: any) => {
          if (res?.error) console.warn('Supabase stock update error:', res.error);
        })
        .catch((err: any) => console.error(err));
    }
  }

  updateStock(itemId: string, newStock: number): void {
    const numStock = Math.max(0, Number(newStock) || 0);
    let targetItem: InventoryItem | null = null;

    const updated = this.ingredients.map(item => {
      if (item.id === itemId) {
        targetItem = {
          ...item,
          current_stock: numStock,
          is_low_stock: numStock <= item.reorder_level
        };
        return targetItem;
      }
      return item;
    });

    this.setIngredientsState(updated);

    if (targetItem) {
      const itemToUpdate = targetItem as InventoryItem;
      this.supabaseService
        .from('inventory_items')
        .update({
          current_stock: itemToUpdate.current_stock,
          is_low_stock: itemToUpdate.is_low_stock
        })
        .eq('id', itemId)
        .then((res: any) => {
          if (res?.error) console.warn('Supabase updateStock error:', res.error);
        })
        .catch((err: any) => console.error(err));
    }
  }

  /**
   * Manual refresh trigger to pull latest data from Supabase
   */
  async refreshFromSupabase(): Promise<void> {
    await this.initSupabaseSync();
  }
}
