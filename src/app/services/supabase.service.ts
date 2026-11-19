import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public isConnected = false;

  public initSupabase(): boolean {
    return false;
  }

  public getClient(): any {
    return null;
  }

  public subscribeToTable(tableName: string, callback: (payload: any) => void) {
    return null;
  }
}
