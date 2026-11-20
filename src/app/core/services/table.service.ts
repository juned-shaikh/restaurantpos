import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Table, TableShape, Floor, WaitlistEntry, Reservation, TableTransferRequest } from '../models/table.model';
import { SoundService } from './sound.service';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable({
  providedIn: 'root'
})
export class TableService {
  private floorsSubject = new BehaviorSubject<Floor[]>([]);
  private tablesSubject = new BehaviorSubject<Table[]>([]);
  private waitlistSubject = new BehaviorSubject<WaitlistEntry[]>([]);
  private reservationsSubject = new BehaviorSubject<Reservation[]>([]);

  floors$: Observable<Floor[]> = this.floorsSubject.asObservable();
  tables$: Observable<Table[]> = this.tablesSubject.asObservable();
  waitlist$: Observable<WaitlistEntry[]> = this.waitlistSubject.asObservable();
  reservations$: Observable<Reservation[]> = this.reservationsSubject.asObservable();

  private get STORAGE_KEY_TABLES(): string {
    return `orderrestro_tables_${this.currentOrgId}`;
  }
  private get STORAGE_KEY_FLOORS(): string {
    return `orderrestro_floors_${this.currentOrgId}`;
  }

  get currentOrgId(): string {
    return this.tenantService?.currentOrg?.id || 'org-default';
  }

  get currentBranchId(): string {
    return this.tenantService?.currentBranch?.id || 'branch-01';
  }

  constructor(
    private soundService: SoundService,
    private supabaseService: SupabaseService,
    private tenantService: TenantService
  ) {
    this.initInitialState();
    this.initSupabaseSync();

    // Reactively switch floor & tables when restaurant tenant switches
    this.tenantService.currentOrg$.subscribe(org => {
      if (org?.id) {
        this.loadTablesForOrg(org.id);
      }
    });
  }

  private initInitialState(): void {
    try {
      const savedTables = localStorage.getItem(this.STORAGE_KEY_TABLES);
      if (savedTables) {
        const parsed = JSON.parse(savedTables);
        if (Array.isArray(parsed)) {
          this.tablesSubject.next(parsed);
        }
      } else {
        this.tablesSubject.next([]);
      }

      const savedFloors = localStorage.getItem(this.STORAGE_KEY_FLOORS);
      if (savedFloors) {
        const parsed = JSON.parse(savedFloors);
        if (Array.isArray(parsed)) {
          this.floorsSubject.next(parsed);
        }
      } else {
        this.floorsSubject.next([]);
      }
    } catch (e) {}
  }

  public async loadTablesForOrg(orgId: string): Promise<void> {
    // 1. Try local storage cache for this org
    try {
      const savedTables = localStorage.getItem(`orderrestro_tables_${orgId}`);
      if (savedTables) {
        this.tablesSubject.next(JSON.parse(savedTables));
      } else {
        this.tablesSubject.next([]);
      }

      const savedFloors = localStorage.getItem(`orderrestro_floors_${orgId}`);
      if (savedFloors) {
        this.floorsSubject.next(JSON.parse(savedFloors));
      } else {
        this.floorsSubject.next([]);
      }
    } catch (e) {}

    // 2. Fetch from Supabase for this org
    const client = this.supabaseService.client;
    if (!client) return;

    try {
      // Fetch floors
      const { data: floorsData, error: floorsErr } = await this.supabaseService
        .from('floors')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!floorsErr && floorsData) {
        this.floorsSubject.next(floorsData);
        this.persistFloorsLocally();
      }

      // Fetch tables
      const { data: tablesData, error: tablesErr } = await this.supabaseService
        .from('tables')
        .select('*')
        .eq('organization_id', orgId)
        .order('table_number', { ascending: true });

      if (!tablesErr && tablesData) {
        this.tablesSubject.next(tablesData);
        this.persistTablesLocally();
      }
    } catch (err) {
      console.warn(`⚠️ [TableService] Error loading tables for tenant ${orgId}:`, err);
    }
  }

  private persistTablesLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_TABLES, JSON.stringify(this.tables));
    } catch (e) {}
  }

  private persistFloorsLocally(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_FLOORS, JSON.stringify(this.floorsSubject.value));
    } catch (e) {}
  }

  private async initSupabaseSync(): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (!client) {
        console.log('ℹ️ [TableService] Supabase not connected. Operating in local mode.');
        return;
      }

      const orgId = this.currentOrgId;

      // Fetch floors for current tenant
      const { data: floorsData, error: floorsErr } = await this.supabaseService
        .from('floors')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });

      if (!floorsErr && floorsData && floorsData.length > 0) {
        this.floorsSubject.next(floorsData);
        this.persistFloorsLocally();
      }

      // Fetch tables for current tenant
      const { data: tablesData, error: tablesErr } = await this.supabaseService
        .from('tables')
        .select('*')
        .eq('organization_id', orgId)
        .order('table_number', { ascending: true });

      if (!tablesErr && tablesData && tablesData.length > 0) {
        console.log(`☁️ [TableService] Loaded ${tablesData.length} tables from Supabase for ${orgId}.`);
        this.tablesSubject.next(tablesData);
        this.persistTablesLocally();
      }

      // Subscribe to real-time changes
      this.supabaseService.subscribeToTableChanges('tables', (payload: any) => {
        const item = payload.new as Table;
        if (!item || (item.organization_id && item.organization_id !== this.currentOrgId)) return;

        if (payload.eventType === 'INSERT') {
          const exists = this.tables.some(t => t.id === item.id);
          if (!exists) {
            this.tablesSubject.next([...this.tables, item]);
            this.persistTablesLocally();
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = this.tables.map(t => t.id === item.id ? { ...t, ...item } : t);
          this.tablesSubject.next(updated);
          this.persistTablesLocally();
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          this.tablesSubject.next(this.tables.filter(t => t.id !== payload.old.id));
          this.persistTablesLocally();
        }
      });
    } catch (err) {
      console.warn('⚠️ [TableService] Supabase sync notice:', err);
    }
  }

  /**
   * Seed Starter Tables (T-01 to T-06) for a newly registered tenant
   */
  async seedStarterTablesForTenant(orgId: string, branchId: string = 'branch-01'): Promise<void> {
    const starterFloor: Floor = {
      id: `floor-${orgId}-main`,
      organization_id: orgId,
      branch_id: branchId,
      name: 'Main Dining Hall',
      display_order: 1,
      is_active: true
    };

    const starterTables: Table[] = [
      { id: `tbl-${orgId}-01`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-01', capacity: 2, shape: 'SQUARE', pos_x: 10, pos_y: 15, width: 90, height: 90, status: 'AVAILABLE', qr_token: `qr-${orgId}-t01`, is_active: true },
      { id: `tbl-${orgId}-02`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-02', capacity: 4, shape: 'RECTANGLE', pos_x: 35, pos_y: 15, width: 120, height: 90, status: 'AVAILABLE', qr_token: `qr-${orgId}-t02`, is_active: true },
      { id: `tbl-${orgId}-03`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-03', capacity: 4, shape: 'RECTANGLE', pos_x: 65, pos_y: 15, width: 120, height: 90, status: 'AVAILABLE', qr_token: `qr-${orgId}-t03`, is_active: true },
      { id: `tbl-${orgId}-04`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-04', capacity: 6, shape: 'ROUND', pos_x: 20, pos_y: 55, width: 110, height: 110, status: 'AVAILABLE', qr_token: `qr-${orgId}-t04`, is_active: true },
      { id: `tbl-${orgId}-05`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-05', capacity: 2, shape: 'SQUARE', pos_x: 50, pos_y: 55, width: 90, height: 90, status: 'AVAILABLE', qr_token: `qr-${orgId}-t05`, is_active: true },
      { id: `tbl-${orgId}-06`, organization_id: orgId, branch_id: branchId, floor_id: starterFloor.id, table_number: 'T-06', capacity: 8, shape: 'RECTANGLE', pos_x: 75, pos_y: 55, width: 140, height: 90, status: 'AVAILABLE', qr_token: `qr-${orgId}-t06`, is_active: true }
    ];

    try {
      await this.saveFloorToSupabase(starterFloor);
      for (const t of starterTables) {
        await this.saveTableToSupabase(t);
      }
      try {
        localStorage.setItem(`orderrestro_floors_${orgId}`, JSON.stringify([starterFloor]));
        localStorage.setItem(`orderrestro_tables_${orgId}`, JSON.stringify(starterTables));
      } catch (e) {}

      if (this.currentOrgId === orgId) {
        this.floorsSubject.next([starterFloor]);
        this.tablesSubject.next(starterTables);
      }
      console.log(`✅ [TableService] Provisioned starter tables for ${orgId}`);
    } catch (err) {
      console.error('❌ [TableService] Error provisioning starter tables:', err);
    }
  }

  private async saveTableToSupabase(table: Table): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        await this.supabaseService.from('tables').upsert({
          id: table.id,
          organization_id: table.organization_id || 'org-default',
          branch_id: table.branch_id || 'branch-01',
          floor_id: table.floor_id || 'floor-01',
          table_number: table.table_number,
          capacity: table.capacity,
          shape: table.shape,
          pos_x: table.pos_x,
          pos_y: table.pos_y,
          width: table.width,
          height: table.height,
          status: table.status,
          qr_token: table.qr_token,
          current_order_id: table.current_order_id || null,
          current_bill_amount: table.active_bill_amount || 0,
          is_active: table.is_active ?? true,
          updated_at: new Date().toISOString()
        });
      }
    } catch (e) {}
  }

  private async updateTableInSupabase(tableId: string, status: Table['status'], billAmount?: number): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        await this.supabaseService.from('tables').update({
          status,
          current_bill_amount: status === 'AVAILABLE' ? 0 : (billAmount ?? 0),
          updated_at: new Date().toISOString()
        }).eq('id', tableId);
      }
    } catch (e) {}
  }

  private async deleteTableFromSupabase(tableId: string): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        await this.supabaseService.from('tables').delete().eq('id', tableId);
      }
    } catch (e) {}
  }

  private async saveFloorToSupabase(floor: Floor): Promise<void> {
    try {
      const client = this.supabaseService.client;
      if (client) {
        await this.supabaseService.from('floors').upsert({
          id: floor.id,
          organization_id: floor.organization_id,
          branch_id: floor.branch_id,
          name: floor.name,
          display_order: floor.display_order,
          is_active: floor.is_active
        });
      }
    } catch (e) {}
  }

  get tables(): Table[] {
    return this.tablesSubject.value;
  }

  getTableById(id: string): Table | undefined {
    return this.tables.find(t => t.id === id);
  }

  getTableByQrToken(qrToken: string): Table | undefined {
    return this.tables.find(t => t.qr_token === qrToken);
  }

  updateTableStatus(tableId: string, status: Table['status'], billAmount?: number): void {
    const updated = this.tables.map(t => {
      if (t.id === tableId) {
        return {
          ...t,
          status,
          active_bill_amount: status === 'AVAILABLE' ? 0 : (billAmount ?? t.active_bill_amount),
          current_order_id: status === 'AVAILABLE' ? undefined : t.current_order_id,
          seated_at: status === 'AVAILABLE' ? undefined : (t.seated_at || new Date().toISOString())
        };
      }
      return t;
    });
    this.tablesSubject.next(updated);
    this.persistTablesLocally();
    const tbl = this.getTableById(tableId);
    if (tbl) this.saveTableToSupabase(tbl);
  }

  transferTable(req: TableTransferRequest): boolean {
    const fromTable = this.getTableById(req.fromTableId);
    const toTable = this.getTableById(req.toTableId);

    if (!fromTable || !toTable || toTable.status !== 'AVAILABLE') {
      return false;
    }

    const updated = this.tables.map(t => {
      if (t.id === req.fromTableId) {
        return {
          ...t,
          status: 'AVAILABLE' as const,
          current_order_id: undefined,
          active_bill_amount: 0,
          seated_at: undefined
        };
      }
      if (t.id === req.toTableId) {
        return {
          ...t,
          status: 'OCCUPIED' as const,
          current_order_id: req.orderId,
          active_bill_amount: fromTable.active_bill_amount,
          seated_at: fromTable.seated_at || new Date().toISOString(),
          server_name: fromTable.server_name
        };
      }
      return t;
    });

    this.tablesSubject.next(updated);
    this.persistTablesLocally();
    this.updateTableInSupabase(req.fromTableId, 'AVAILABLE', 0);
    this.updateTableInSupabase(req.toTableId, 'OCCUPIED', fromTable.active_bill_amount);
    return true;
  }

  addToWaitlist(entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'organization_id' | 'branch_id'>): void {
    const newEntry: WaitlistEntry = {
      ...entry,
      id: `wl-${Date.now()}`,
      organization_id: this.currentOrgId,
      branch_id: this.currentBranchId,
      created_at: new Date().toISOString()
    };
    this.waitlistSubject.next([...this.waitlistSubject.value, newEntry]);
  }

  seatWaitlistGuest(id: string, tableId: string): void {
    const wl = this.waitlistSubject.value.find(w => w.id === id);
    if (!wl) return;

    this.waitlistSubject.next(this.waitlistSubject.value.filter(w => w.id !== id));
    this.updateTableStatus(tableId, 'OCCUPIED');
  }

  addReservation(res: Omit<Reservation, 'id' | 'created_at' | 'organization_id' | 'branch_id'>): void {
    const newRes: Reservation = {
      ...res,
      id: `res-${Date.now()}`,
      organization_id: this.currentOrgId,
      branch_id: this.currentBranchId,
      created_at: new Date().toISOString()
    };
    this.reservationsSubject.next([...this.reservationsSubject.value, newRes]);
    if (res.table_id) {
      this.updateTableStatus(res.table_id, 'RESERVED');
    }
  }

  updateTablePosition(tableId: string, posX: number, posY: number): void {
    const updated = this.tables.map(t => t.id === tableId ? { ...t, pos_x: posX, pos_y: posY } : t);
    this.tablesSubject.next(updated);
    this.persistTablesLocally();
    const tbl = this.getTableById(tableId);
    if (tbl) this.saveTableToSupabase(tbl);
  }

  /**
   * Adds a single table to the floor plan
   */
  addTable(data: Partial<Table>): Table {
    let targetFloorId = data.floor_id;
    if (!targetFloorId || !this.floorsSubject.value.some(f => f.id === targetFloorId)) {
      if (this.floorsSubject.value.length === 0) {
        const defaultFloor: Floor = {
          id: `floor-${this.currentOrgId}-main`,
          organization_id: this.currentOrgId,
          branch_id: this.currentBranchId,
          name: 'Main Dining Hall',
          display_order: 1,
          is_active: true
        };
        this.floorsSubject.next([defaultFloor]);
        this.persistFloorsLocally();
        this.saveFloorToSupabase(defaultFloor);
        targetFloorId = defaultFloor.id;
      } else {
        targetFloorId = this.floorsSubject.value[0].id;
      }
    }

    const currentFloorTables = this.tables.filter(t => t.floor_id === targetFloorId);
    const count = currentFloorTables.length;
    const cols = 5;
    const posX = data.pos_x ?? (8 + (count % cols) * 18);
    const posY = data.pos_y ?? (10 + Math.floor(count / cols) * 18);

    const tableNumber = data.table_number || `T-${String(count + 1).padStart(2, '0')}`;
    const newTable: Table = {
      id: `tbl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organization_id: this.currentOrgId,
      branch_id: this.currentBranchId,
      floor_id: targetFloorId,
      table_number: tableNumber,
      capacity: data.capacity || 4,
      shape: data.shape || 'RECTANGLE',
      pos_x: posX,
      pos_y: posY,
      width: data.shape === 'ROUND' ? 100 : (data.shape === 'SQUARE' ? 90 : 120),
      height: data.shape === 'ROUND' ? 100 : 90,
      status: 'AVAILABLE',
      qr_token: `qr-token-${tableNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      is_active: true
    };

    this.tablesSubject.next([...this.tables, newTable]);
    this.persistTablesLocally();
    this.saveTableToSupabase(newTable);
    return newTable;
  }

  /**
   * Quick Bulk Table Generator: creates 1 to 50+ tables with automatic non-overlapping grid layout
   */
  bulkCreateTables(options: {
    prefix: string;
    startNumber: number;
    count: number;
    capacity: number;
    shape: TableShape;
    floorId: string;
  }): Table[] {
    let targetFloorId = options.floorId;
    if (!targetFloorId || !this.floorsSubject.value.some(f => f.id === targetFloorId)) {
      if (this.floorsSubject.value.length === 0) {
        const defaultFloor: Floor = {
          id: `floor-${this.currentOrgId}-main`,
          organization_id: this.currentOrgId,
          branch_id: this.currentBranchId,
          name: 'Main Dining Hall',
          display_order: 1,
          is_active: true
        };
        this.floorsSubject.next([defaultFloor]);
        this.persistFloorsLocally();
        this.saveFloorToSupabase(defaultFloor);
        targetFloorId = defaultFloor.id;
      } else {
        targetFloorId = this.floorsSubject.value[0].id;
      }
    }

    const newTables: Table[] = [];
    const cols = 5;
    const xStep = 18;
    const yStep = 18;

    for (let i = 0; i < options.count; i++) {
      const num = options.startNumber + i;
      const formattedNum = `${options.prefix}${num < 10 ? '0' + num : num}`;
      const posX = 6 + (i % cols) * xStep;
      const posY = 10 + Math.floor(i / cols) * yStep;

      newTables.push({
        id: `tbl-bulk-${Date.now()}-${i}`,
        organization_id: this.currentOrgId,
        branch_id: this.currentBranchId,
        floor_id: targetFloorId,
        table_number: formattedNum,
        capacity: options.capacity,
        shape: options.shape,
        pos_x: posX,
        pos_y: posY,
        width: options.shape === 'ROUND' ? 100 : (options.shape === 'SQUARE' ? 90 : 120),
        height: options.shape === 'ROUND' ? 100 : 90,
        status: 'AVAILABLE',
        qr_token: `qr-token-${formattedNum.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        is_active: true
      });
    }

    // Append new tables
    this.tablesSubject.next([...this.tables, ...newTables]);
    this.persistTablesLocally();
    for (const tbl of newTables) {
      this.saveTableToSupabase(tbl);
    }
    return newTables;
  }

  /**
   * Deletes a table from the floor
   */
  deleteTable(tableId: string): boolean {
    const table = this.getTableById(tableId);
    if (!table) return false;
    this.tablesSubject.next(this.tables.filter(t => t.id !== tableId));
    this.persistTablesLocally();
    this.deleteTableFromSupabase(tableId);
    return true;
  }

  /**
   * Adds a new floor section (e.g. "Rooftop Garden", "AC Family Lounge")
   */
  addFloor(name: string): Floor {
    const newFloor: Floor = {
      id: `floor-${Date.now()}`,
      organization_id: this.currentOrgId,
      branch_id: this.currentBranchId,
      name: name.trim(),
      display_order: this.floorsSubject.value.length + 1,
      is_active: true
    };
    this.floorsSubject.next([...this.floorsSubject.value, newFloor]);
    this.persistFloorsLocally();
    this.saveFloorToSupabase(newFloor);
    return newFloor;
  }
}

