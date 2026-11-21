import { Injectable } from '@angular/core';
import { get, set, del, keys, clear } from 'idb-keyval';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private isIndexedDbAvailable: boolean = true;
  private migrationDone: boolean = false;

  constructor() {
    this.checkIndexedDbSupport();
    this.migrateLegacyLocalStorage();
  }

  private checkIndexedDbSupport(): void {
    try {
      this.isIndexedDbAvailable = typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
    } catch {
      this.isIndexedDbAvailable = false;
    }
  }

  /**
   * Automatically migrates bulky keys from localStorage to IndexedDB once,
   * freeing up the browser's 5MB localStorage quota immediately.
   */
  public async migrateLegacyLocalStorage(): Promise<void> {
    if (!this.isIndexedDbAvailable || this.migrationDone || typeof localStorage === 'undefined') return;
    this.migrationDone = true;

    try {
      const keysToMigratePrefixes = [
        'orderrestro_offline_orders_queue_',
        'orderrestro_offline_inventory_queue_',
        'orderrestro_offline_expenses_queue_',
        'orderrestro_orders_cache_',
        'orderrestro_inventory_items_',
        'orderrestro_inventory_waste_',
        'orderrestro_inventory_recipes_',
        'orderrestro_accounting_expenses_',
        'orderrestro_accounting_cash_closings_',
        'orderrestro_accounting_overheads_'
      ];

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;

        const shouldMigrate = keysToMigratePrefixes.some(prefix => key.startsWith(prefix));
        if (shouldMigrate) {
          try {
            const rawVal = localStorage.getItem(key);
            if (rawVal) {
              const parsed = JSON.parse(rawVal);
              await set(key, parsed);
              localStorage.removeItem(key);
              console.log(`[StorageService] Successfully migrated '${key}' to IndexedDB and freed localStorage quota.`);
            }
          } catch (e) {
            console.warn(`[StorageService] Migration error for '${key}':`, e);
          }
        }
      }
    } catch (err) {
      console.warn('[StorageService] Error during localStorage to IndexedDB migration:', err);
    }
  }

  /**
   * Retrieve item from IndexedDB (with localStorage fallback)
   */
  async getItem<T>(key: string, defaultValue?: T): Promise<T | null> {
    if (this.isIndexedDbAvailable) {
      try {
        const val = await get<T>(key);
        if (val !== undefined && val !== null) {
          return val;
        }
      } catch (err) {
        console.warn(`[StorageService] Failed to read '${key}' from IndexedDB:`, err);
      }
    }

    // Fallback to localStorage if not found or IndexedDB error
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          return JSON.parse(raw) as T;
        }
      }
    } catch {}

    return defaultValue !== undefined ? defaultValue : null;
  }

  /**
   * Save item to IndexedDB (with localStorage fallback if IndexedDB is not supported)
   */
  async setItem<T>(key: string, value: T): Promise<void> {
    if (this.isIndexedDbAvailable) {
      try {
        await set(key, value);
        return;
      } catch (err) {
        console.error(`[StorageService] Failed to set '${key}' in IndexedDB:`, err);
      }
    }

    // Fallback if IndexedDB fails
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (quotaErr) {
      console.error(`[StorageService] LocalStorage quota exceeded for '${key}':`, quotaErr);
    }
  }

  /**
   * Remove item from both IndexedDB and localStorage
   */
  async removeItem(key: string): Promise<void> {
    if (this.isIndexedDbAvailable) {
      try {
        await del(key);
      } catch (err) {
        console.warn(`[StorageService] Failed to delete '${key}' from IndexedDB:`, err);
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  /**
   * List all keys stored in IndexedDB
   */
  async getAllKeys(): Promise<IDBValidKey[]> {
    if (this.isIndexedDbAvailable) {
      try {
        return await keys();
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Clear all IndexedDB storage
   */
  async clearAll(): Promise<void> {
    if (this.isIndexedDbAvailable) {
      try {
        await clear();
      } catch {}
    }
  }
}
