import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MenuCategory, MenuItem, ModifierGroup, ComboMenu } from '../models/menu.model';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  private categoriesSubject = new BehaviorSubject<MenuCategory[]>([]);
  private itemsSubject = new BehaviorSubject<MenuItem[]>([]);

  categories$: Observable<MenuCategory[]> = this.categoriesSubject.asObservable();
  items$: Observable<MenuItem[]> = this.itemsSubject.asObservable();

  get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'org-default';
  }

  private get STORAGE_KEY_CATEGORIES(): string {
    return `orderrestro_menu_categories_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_ITEMS(): string {
    return `orderrestro_menu_items_${this.currentOrgId}`;
  }

  constructor(
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    // Reactively switch menu when restaurant tenant switches
    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadMenuForOrg(org.id);
      }
    });
  }

  private initInitialState(): void {
    try {
      const savedCats = localStorage.getItem(this.STORAGE_KEY_CATEGORIES);
      if (savedCats) {
        const parsed = JSON.parse(savedCats);
        if (Array.isArray(parsed)) {
          this.categoriesSubject.next(parsed);
        }
      } else {
        this.categoriesSubject.next([]);
      }

      const savedItems = localStorage.getItem(this.STORAGE_KEY_ITEMS);
      if (savedItems) {
        const parsed = JSON.parse(savedItems);
        if (Array.isArray(parsed)) {
          this.itemsSubject.next(parsed);
        }
      } else {
        this.itemsSubject.next([]);
      }
    } catch (e) {}
  }

  public async loadMenuForOrg(orgId: string): Promise<void> {
    // 1. Try local storage cache for this org
    try {
      const savedCats = localStorage.getItem(`orderrestro_menu_categories_${orgId}`);
      if (savedCats) {
        this.categoriesSubject.next(JSON.parse(savedCats));
      } else {
        this.categoriesSubject.next([]);
      }

      const savedItems = localStorage.getItem(`orderrestro_menu_items_${orgId}`);
      if (savedItems) {
        this.itemsSubject.next(JSON.parse(savedItems));
      } else {
        this.itemsSubject.next([]);
      }
    } catch (e) {}

    // 2. Fetch from Supabase for this org
    const client = this.supabaseService.client;
    if (!client) return;

    try {
      // Fetch Categories
      const { data: catData, error: catErr } = await this.supabaseService
        .from('menu_categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!catErr && catData && catData.length > 0) {
        this.categoriesSubject.next(catData);
        this.persistCategoriesLocally();
      }

      // Fetch Menu Items
      const { data: itemData, error: itemErr } = await this.supabaseService
        .from('menu_items')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!itemErr && itemData && itemData.length > 0) {
        this.itemsSubject.next(itemData);
        this.persistItemsLocally();
      }
    } catch (err) {
      console.warn(`⚠️ [MenuService] Error loading menu for tenant ${orgId}:`, err);
    }
  }

  private persistCategoriesLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_CATEGORIES, JSON.stringify(this.categoriesSubject.value));
    } catch (e) {}
  }

  private persistItemsLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_ITEMS, JSON.stringify(this.itemsSubject.value));
    } catch (e) {}
  }

  private async initSupabaseSync(): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (!client) {
        console.log('ℹ️ [MenuService] Supabase not connected. Operating in local mode.');
        return;
      }

      const orgId = this.currentOrgId;

      // 1. Fetch Categories for current tenant
      const { data: catData, error: catErr } = await this.supabaseService
        .from('menu_categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!catErr && catData && catData.length > 0) {
        this.categoriesSubject.next(catData);
        this.persistCategoriesLocally();
      }

      // 2. Fetch Menu Items for current tenant
      const { data: itemData, error: itemErr } = await this.supabaseService
        .from('menu_items')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!itemErr && itemData && itemData.length > 0) {
        console.log(`☁️ [MenuService] Loaded ${itemData.length} menu items from Supabase for ${orgId}.`);
        this.itemsSubject.next(itemData);
        this.persistItemsLocally();
      }

      // 3. Realtime Subscriptions
      this.supabaseService.subscribeToTableChanges('menu_categories', (payload: any) => {
        const cat = payload.new as MenuCategory;
        if (!cat || (cat.organization_id && cat.organization_id !== this.currentOrgId)) return;
        if (payload.eventType === 'INSERT') {
          if (!this.categoriesSubject.value.some(c => c.id === cat.id)) {
            this.categoriesSubject.next([...this.categoriesSubject.value, cat]);
            this.persistCategoriesLocally();
          }
        } else if (payload.eventType === 'UPDATE') {
          this.categoriesSubject.next(this.categoriesSubject.value.map(c => c.id === cat.id ? { ...c, ...cat } : c));
          this.persistCategoriesLocally();
        }
      });

      this.supabaseService.subscribeToTableChanges('menu_items', (payload: any) => {
        const item = payload.new as MenuItem;
        if (!item || (item.organization_id && item.organization_id !== this.currentOrgId)) return;
        if (payload.eventType === 'INSERT') {
          if (!this.itemsSubject.value.some(i => i.id === item.id)) {
            this.itemsSubject.next([...this.itemsSubject.value, item]);
            this.persistItemsLocally();
          }
        } else if (payload.eventType === 'UPDATE') {
          this.itemsSubject.next(this.itemsSubject.value.map(i => i.id === item.id ? { ...i, ...item } : i));
          this.persistItemsLocally();
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          this.itemsSubject.next(this.itemsSubject.value.filter(i => i.id !== payload.old.id));
          this.persistItemsLocally();
        }
      });
    } catch (err) {
      console.warn('⚠️ [MenuService] Supabase sync notice:', err);
    }
  }

  /**
   * Seed Starter Menu (Standard Categories & Dishes) for a newly registered tenant
   */
  async seedStarterMenuForTenant(orgId: string): Promise<void> {
    const starterCategories: MenuCategory[] = [
      { id: `cat-${orgId}-01`, organization_id: orgId, name: 'Hot Beverages & Tea', slug: 'hot-beverages', icon_name: 'coffee', display_order: 1, kitchen_station_id: 'st-01', is_active: true, item_count: 2 },
      { id: `cat-${orgId}-02`, organization_id: orgId, name: 'Cold Drinks & Coolers', slug: 'cold-drinks', icon_name: 'cup-soda', display_order: 2, kitchen_station_id: 'st-01', is_active: true, item_count: 2 },
      { id: `cat-${orgId}-03`, organization_id: orgId, name: 'Fast Food & Snacks', slug: 'fast-food', icon_name: 'sandwich', display_order: 3, kitchen_station_id: 'st-02', is_active: true, item_count: 2 },
      { id: `cat-${orgId}-04`, organization_id: orgId, name: 'Desserts & Sweets', slug: 'desserts', icon_name: 'cake', display_order: 4, kitchen_station_id: 'st-03', is_active: true, item_count: 2 }
    ];

    const starterItems: MenuItem[] = [
      { id: `m-${orgId}-01`, organization_id: orgId, category_id: `cat-${orgId}-01`, category_name: 'Hot Beverages & Tea', kitchen_station_id: 'st-01', name: 'Masala Chai', short_code: 'CHAI', description: 'Freshly brewed aromatic spiced milk tea', price: 40, cost_price: 10, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 5, display_order: 1, is_combo: false },
      { id: `m-${orgId}-02`, organization_id: orgId, category_id: `cat-${orgId}-01`, category_name: 'Hot Beverages & Tea', kitchen_station_id: 'st-01', name: 'Classic Cappuccino', short_code: 'CAPP', description: 'Fresh espresso with steamed textured milk foam', price: 120, cost_price: 30, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 5, display_order: 2, is_combo: false },
      { id: `m-${orgId}-03`, organization_id: orgId, category_id: `cat-${orgId}-02`, category_name: 'Cold Drinks & Coolers', kitchen_station_id: 'st-01', name: 'Classic Cold Coffee', short_code: 'CLD-COF', description: 'Chilled blended milk coffee with vanilla scoop', price: 140, cost_price: 35, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 5, display_order: 1, is_combo: false },
      { id: `m-${orgId}-04`, organization_id: orgId, category_id: `cat-${orgId}-02`, category_name: 'Cold Drinks & Coolers', kitchen_station_id: 'st-01', name: 'Mint Mojito Mocktail', short_code: 'MOJITO', description: 'Fresh mint, lime wedges, simple syrup and soda', price: 110, cost_price: 25, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 4, display_order: 2, is_combo: false },
      { id: `m-${orgId}-05`, organization_id: orgId, category_id: `cat-${orgId}-03`, category_name: 'Fast Food & Snacks', kitchen_station_id: 'st-02', name: 'Veg Grilled Club Sandwich', short_code: 'CLUB-SND', description: 'Multi-layer sandwich with crisp veggies, cheese, and house mayo', price: 160, cost_price: 45, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 10, display_order: 1, is_combo: false },
      { id: `m-${orgId}-06`, organization_id: orgId, category_id: `cat-${orgId}-03`, category_name: 'Fast Food & Snacks', kitchen_station_id: 'st-02', name: 'Crispy French Fries (Peri-Peri)', short_code: 'FRIES', description: 'Golden potato fries seasoned with zesty peri-peri mix', price: 110, cost_price: 28, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 8, display_order: 2, is_combo: false },
      { id: `m-${orgId}-07`, organization_id: orgId, category_id: `cat-${orgId}-04`, category_name: 'Desserts & Sweets', kitchen_station_id: 'st-03', name: 'Chocolate Sizzler Brownie', short_code: 'BROWNIE', description: 'Warm fudge brownie served with vanilla ice cream and chocolate sauce', price: 180, cost_price: 50, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 6, display_order: 1, is_combo: false },
      { id: `m-${orgId}-08`, organization_id: orgId, category_id: `cat-${orgId}-04`, category_name: 'Desserts & Sweets', kitchen_station_id: 'st-03', name: 'Gulab Jamun (2 Pcs)', short_code: 'JAMUN', description: 'Soft, melt-in-the-mouth milk dumplings in warm rose syrup', price: 80, cost_price: 20, tax_rate: 5.0, is_veg: true, is_available: true, prep_time_mins: 3, display_order: 2, is_combo: false }
    ];

    try {
      for (const cat of starterCategories) {
        await this.saveCategoryToSupabase(cat);
      }
      for (const item of starterItems) {
        await this.saveMenuItemToSupabase(item);
      }
      try {
        localStorage.setItem(`orderrestro_menu_categories_${orgId}`, JSON.stringify(starterCategories));
        localStorage.setItem(`orderrestro_menu_items_${orgId}`, JSON.stringify(starterItems));
      } catch (e) {}

      if (this.currentOrgId === orgId) {
        this.categoriesSubject.next(starterCategories);
        this.itemsSubject.next(starterItems);
      }
      console.log(`✅ [MenuService] Provisioned starter menu for ${orgId}`);
    } catch (err) {
      console.error('❌ [MenuService] Error provisioning starter menu:', err);
    }
  }

  private async saveCategoryToSupabase(cat: MenuCategory): Promise<void> {
    try {
      if (this.supabaseService.client) {
        const { error } = await this.supabaseService.from('menu_categories').upsert({
          id: cat.id,
          organization_id: cat.organization_id || this.currentOrgId,
          name: cat.name,
          slug: cat.slug,
          icon_name: cat.icon_name || 'restaurant',
          display_order: cat.display_order || 1,
          kitchen_station_id: cat.kitchen_station_id || 'st-01',
          is_active: cat.is_active ?? true
        });
        if (error) {
          console.warn('⚠️ [MenuService] Supabase menu_categories notice:', error.message || error);
        }
      }
    } catch (e) {
      console.warn('⚠️ [MenuService] Could not save category to Supabase:', e);
    }
  }

  private async saveMenuItemToSupabase(item: MenuItem): Promise<void> {
    try {
      if (this.supabaseService.client) {
        const { error } = await this.supabaseService.from('menu_items').upsert({
          id: item.id,
          organization_id: item.organization_id || this.currentOrgId,
          category_id: item.category_id,
          category_name: item.category_name,
          kitchen_station_id: item.kitchen_station_id || 'st-01',
          name: item.name,
          short_code: item.short_code,
          description: item.description,
          price: item.price,
          cost_price: item.cost_price || 0,
          tax_rate: item.tax_rate ?? 5.0,
          is_veg: item.is_veg ?? true,
          is_available: item.is_available ?? true,
          image_url: item.image_url,
          prep_time_mins: item.prep_time_mins || 10,
          display_order: item.display_order || 1,
          is_combo: item.is_combo ?? false
        });
        if (error) {
          console.warn('⚠️ [MenuService] Supabase menu_items notice:', error.message || error);
        }
      }
    } catch (e) {
      console.warn('⚠️ [MenuService] Could not save menu item to Supabase:', e);
    }
  }

  private async deleteMenuItemFromSupabase(itemId: string): Promise<void> {
    try {
      if (this.supabaseService.client) {
        await this.supabaseService.from('menu_items').delete().eq('id', itemId);
      }
    } catch (e) {}
  }

  get items(): MenuItem[] {
    return this.itemsSubject.value;
  }

  get categories(): MenuCategory[] {
    return this.categoriesSubject.value;
  }

  toggleItemAvailability(itemId: string): void {
    const updated = this.items.map(i => i.id === itemId ? { ...i, is_available: !i.is_available } : i);
    this.itemsSubject.next(updated);
    this.persistItemsLocally();
    const target = updated.find(i => i.id === itemId);
    if (target) {
      this.saveMenuItemToSupabase(target);
    }
  }

  saveMenuItem(item: MenuItem): void {
    if (item.id) {
      const updated = this.items.map(i => i.id === item.id ? { ...item, organization_id: item.organization_id || this.currentOrgId } : i);
      this.itemsSubject.next(updated);
      this.persistItemsLocally();
      this.saveMenuItemToSupabase({ ...item, organization_id: item.organization_id || this.currentOrgId });
    } else {
      const newItem: MenuItem = {
        ...item,
        id: `m-${Date.now()}`,
        organization_id: this.currentOrgId
      };
      this.itemsSubject.next([...this.items, newItem]);
      this.persistItemsLocally();
      this.saveMenuItemToSupabase(newItem);
    }
  }

  deleteMenuItem(itemId: string): void {
    this.itemsSubject.next(this.items.filter(i => i.id !== itemId));
    this.persistItemsLocally();
    this.deleteMenuItemFromSupabase(itemId);
  }

  clearAllMenuForTenant(orgId: string): void {
    this.itemsSubject.next([]);
    this.categoriesSubject.next([]);
    try {
      localStorage.removeItem(`orderrestro_menu_categories_${orgId}`);
      localStorage.removeItem(`orderrestro_menu_items_${orgId}`);
    } catch {}
    if (this.supabaseService.client) {
      this.supabaseService.from('menu_items').delete().eq('organization_id', orgId).then().catch();
      this.supabaseService.from('menu_categories').delete().eq('organization_id', orgId).then().catch();
    }
  }

  addCategory(name: string): MenuCategory {
    const newCat: MenuCategory = {
      id: `cat-${Date.now()}`,
      organization_id: this.currentOrgId,
      name: name.trim(),
      slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      icon_name: 'restaurant',
      display_order: this.categoriesSubject.value.length + 1,
      kitchen_station_id: 'st-01',
      is_active: true,
      item_count: 0
    };
    this.categoriesSubject.next([...this.categoriesSubject.value, newCat]);
    this.persistCategoriesLocally();
    this.saveCategoryToSupabase(newCat);
    return newCat;
  }
}

