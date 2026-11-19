import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../../core/services/inventory.service';
import { ProcurementService } from '../../core/services/procurement.service';
import { InventoryItem, Recipe, WasteLog, UnitOfMeasure } from '../../core/models/inventory.model';
import { Supplier, PurchaseOrder } from '../../core/models/procurement.model';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent implements OnInit {
  ingredients: InventoryItem[] = [];
  recipes: Recipe[] = [];
  wasteLogs: WasteLog[] = [];
  suppliers: Supplier[] = [];
  purchaseOrders: PurchaseOrder[] = [];

  activeTab: 'ingredients' | 'suppliers' | 'orders' | 'waste' = 'ingredients';
  searchQuery: string = '';

  showWasteModal: boolean = false;
  showAddIngredientModal: boolean = false;
  showPoModal: boolean = false;

  selectedItemId: string = '';
  wasteQty: number = 0;
  wasteReason: WasteLog['reason'] = 'EXPIRED';

  // New Ingredient form
  newIngName: string = '';
  newIngUnit: UnitOfMeasure = 'KG';
  newIngStock: number = 10;
  newIngReorder: number = 5;
  newIngCost: number = 100;

  // New PO form
  selectedSupplierId: string = '';
  poItemName: string = '';
  poItemQty: number = 10;
  poItemPrice: number = 250;

  // Custom Dropdown Option Sets
  uomOptions = [
    { label: 'KG (Kilograms)', value: 'KG' },
    { label: 'G (Grams)', value: 'G' },
    { label: 'L (Liters)', value: 'L' },
    { label: 'ML (Milliliters)', value: 'ML' },
    { label: 'PCS (Pieces / Units)', value: 'PCS' },
    { label: 'PORTION', value: 'PORTION' }
  ];

  wasteReasonOptions = [
    { label: 'Spoilage / Expired Date', value: 'EXPIRED', icon: 'ri-time-line' },
    { label: 'Spillage / Cooking Error', value: 'PREP_SPILL', icon: 'ri-drop-line' },
    { label: 'Storage Moisture / Pest Damage', value: 'STORAGE_DAMAGE', icon: 'ri-archive-line' },
    { label: 'Quality Control Rejection', value: 'QUALITY_REJECT', icon: 'ri-close-circle-line' }
  ];

  get supplierOptions() {
    return this.suppliers.map(s => ({
      label: s.name,
      value: s.id,
      icon: 'ri-building-line',
      subtext: `Credit: Net ${s.payment_terms_days} Days`
    }));
  }

  get ingredientOptions() {
    return this.ingredients.map(i => ({
      label: i.name,
      value: i.id,
      icon: 'ri-box-3-line',
      subtext: `Stock: ${i.current_stock} ${i.uom}`
    }));
  }

  constructor(
    public inventoryService: InventoryService,
    public procurementService: ProcurementService
  ) {}

  ngOnInit(): void {
    this.inventoryService.ingredients$.subscribe(items => {
      this.ingredients = items;
      if (items.length > 0 && !this.selectedItemId) {
        this.selectedItemId = items[0].id;
      }
    });

    this.inventoryService.recipes$.subscribe(r => this.recipes = r);
    this.inventoryService.wasteLogs$.subscribe(w => this.wasteLogs = w);
    this.procurementService.suppliers$.subscribe(s => {
      this.suppliers = s;
      if (s.length > 0 && !this.selectedSupplierId) {
        this.selectedSupplierId = s[0].id;
      }
    });
    this.procurementService.purchaseOrders$.subscribe(p => this.purchaseOrders = p);
  }

  get filteredIngredients(): InventoryItem[] {
    if (!this.searchQuery) return this.ingredients;
    const q = this.searchQuery.toLowerCase().trim();
    return this.ingredients.filter(i =>
      i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
    );
  }

  openWasteModal(): void {
    this.wasteQty = 0;
    this.showWasteModal = true;
  }

  submitWasteLog(): void {
    const item = this.ingredients.find(i => i.id === this.selectedItemId);
    if (!item || this.wasteQty <= 0) {
      alert('Please select valid item and wasted quantity.');
      return;
    }

    this.inventoryService.logWaste({
      inventory_item_id: item.id,
      inventory_item_name: item.name,
      quantity_wasted: this.wasteQty,
      uom: item.uom,
      unit_cost: item.avg_unit_cost,
      total_loss_cost: Number((this.wasteQty * item.avg_unit_cost).toFixed(2)),
      reason: this.wasteReason,
      logged_by_name: 'Current Storekeeper'
    });

    this.showWasteModal = false;
    alert(`Waste of ${this.wasteQty} ${item.uom} logged successfully! Stock deducted.`);
  }

  saveIngredient(): void {
    if (!this.newIngName.trim()) {
      alert('Please enter an ingredient name.');
      return;
    }
    this.inventoryService.addIngredient({
      name: this.newIngName.trim(),
      uom: this.newIngUnit,
      current_stock: Number(this.newIngStock) || 0,
      reorder_level: Number(this.newIngReorder) || 0,
      avg_unit_cost: Number(this.newIngCost) || 0
    });
    this.showAddIngredientModal = false;
    this.newIngName = '';
    this.newIngStock = 10;
    this.newIngReorder = 5;
    this.newIngCost = 100;
  }

  savePurchaseOrder(): void {
    const supplier = this.suppliers.find(s => s.id === this.selectedSupplierId) || this.suppliers[0];
    if (!supplier) {
      alert('Please select a supplier.');
      return;
    }
    const qty = Number(this.poItemQty) || 1;
    const price = Number(this.poItemPrice) || 100;
    const total = qty * price;
    this.procurementService.createPurchaseOrder({
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      po_number: `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`,
      status: 'SENT',
      expected_delivery: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      total_amount: total,
      items: [
        {
          inventory_item_id: 'inv-item',
          inventory_item_name: this.poItemName.trim() || 'Assorted Raw Stock',
          ordered_qty: qty,
          received_qty: 0,
          unit_price: price,
          total_price: total
        }
      ],
      created_by_name: 'Zuber (Manager)'
    });
    this.showPoModal = false;
    this.poItemName = '';
    this.poItemQty = 10;
    this.poItemPrice = 250;
  }
}
