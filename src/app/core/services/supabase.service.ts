import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

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
        this.supabase = createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          },
          realtime: {
            params: {
              eventsPerSecond: 10
            }
          }
        });
        this.isConnected = true;
        console.log('✅ [Supabase] Bundled client connected to Cloud Database:', url);
      } catch (err) {
        console.error('❌ [Supabase] Failed to initialize client:', err);
        this.isConnected = false;
      }
    } else {
      this.isConnected = false;
    }
  }

  /**
   * Direct access to typed Supabase client
   */
  get client(): SupabaseClient | null {
    if (!this.supabase) {
      this.initSupabase();
    }
    return this.supabase;
  }

  /**
   * Safe helper to query tables
   */
  from(tableName: string): any {
    const c = this.client;
    if (!c) {
      return {
        select: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        insert: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        update: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        delete: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') }),
        upsert: () => Promise.resolve({ data: null, error: new Error('Supabase client not initialized') })
      };
    }
    return c.from(tableName);
  }

  /**
   * Call a Supabase RPC Database Function atomically
   */
  async rpc(functionName: string, params?: Record<string, any>): Promise<{ data: any; error: any }> {
    const c = this.client;
    if (!c) {
      return { data: null, error: new Error('Supabase client not initialized') };
    }
    try {
      return await c.rpc(functionName, params);
    } catch (err: any) {
      return { data: null, error: err };
    }
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
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: tableName, filter },
        (payload: any) => callback(payload)
      )
      .subscribe();
  }
}
