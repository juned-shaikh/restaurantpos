import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface SupabaseClient {
  from(tableName: string): any;
  channel(name: string): any;
  auth?: any;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient | null = null;
  public isConnected: boolean = false;

  constructor() {
    this.initSupabase();
  }

  private initSupabase(): void {
    const rawUrl = environment.supabaseUrl?.trim();
    const key = environment.supabaseAnonKey?.trim();

    if (rawUrl && key && rawUrl.startsWith('http')) {
      const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
      try {
        const createClientFn = (window as any).supabase?.createClient;
        if (createClientFn) {
          this.supabase = createClientFn(url, key, {
            auth: {
              persistSession: true,
              autoRefreshToken: true
            },
            realtime: {
              params: {
                eventsPerSecond: 10
              }
            }
          });
          this.isConnected = true;
          console.log('✅ [Supabase] Connected successfully to Cloud Database:', url);
        } else {
          this.isConnected = false;
          console.log('ℹ️ [Supabase] Waiting for window.supabase CDN to be ready.');
        }
      } catch (err) {
        console.error('❌ [Supabase] Failed to initialize client:', err);
        this.isConnected = false;
      }
    } else {
      this.isConnected = false;
    }
  }

  /**
   * Access to Supabase client
   */
  get client(): SupabaseClient | null {
    if (!this.supabase) {
      this.initSupabase();
    }
    return this.supabase;
  }

  /**
   * Helper to query tables safely
   */
  from(tableName: string) {
    const c = this.client;
    if (!c) {
      return {
        select: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        insert: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        update: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        delete: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') })
      };
    }
    return c.from(tableName);
  }

  /**
   * Listen to real-time changes
   */
  subscribeToTableChanges(
    tableName: string,
    callback: (payload: any) => void,
    filter?: string
  ) {
    if (!this.supabase) return null;

    const channelName = `realtime-${tableName}-${Date.now()}`;
    return this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName, filter },
        (payload: any) => callback(payload)
      )
      .subscribe();
  }
}
