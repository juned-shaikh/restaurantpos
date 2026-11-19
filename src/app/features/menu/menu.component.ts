import { Component, OnInit } from '@angular/core';
import { MenuService } from '../../core/services/menu.service';
import { ToastService } from '../../core/services/toast.service';
import { MenuCategory, MenuItem } from '../../core/models/menu.model';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent implements OnInit {
  categories: MenuCategory[] = [];
  items: MenuItem[] = [];
  selectedCategoryId: string = 'ALL';
  searchQuery: string = '';
  showItemModal: boolean = false;
  get showAddModal(): boolean { return this.showItemModal; }
  set showAddModal(val: boolean) { this.showItemModal = val; }

  get newItemName(): string { return this.editingItem.name || ''; }
  set newItemName(val: string) { this.editingItem.name = val; }

  get newItemPrice(): number { return this.editingItem.price || 0; }
  set newItemPrice(val: number) { this.editingItem.price = val; }

  get newItemCost(): number { return this.editingItem.cost_price || 0; }
  set newItemCost(val: number) { this.editingItem.cost_price = val; }

  get newItemCategoryId(): string { return this.editingItem.category_id || ''; }
  set newItemCategoryId(val: string) { this.editingItem.category_id = val; }

  get newItemIsVeg(): boolean { return !!this.editingItem.is_veg; }
  set newItemIsVeg(val: boolean) { this.editingItem.is_veg = val; }

  get categoryOptions() {
    return this.categories.map(c => ({
      label: c.name,
      value: c.id,
      icon: 'ri-restaurant-2-line'
    }));
  }

  saveNewItem(): void {
    this.saveItem();
  }

  showAddCategoryModal = false;
  newCategoryName = '';

  openAddCategoryModal(): void {
    this.newCategoryName = '';
    this.showAddCategoryModal = true;
  }

  saveCategory(): void {
    if (!this.newCategoryName.trim()) {
      this.toast.warning('Please enter a category name.');
      return;
    }
    const cat = this.menuService.addCategory(this.newCategoryName.trim());
    this.selectedCategoryId = cat.id;
    this.showAddCategoryModal = false;
    this.toast.success(`Category "${cat.name}" added successfully!`, 'Category Created');
  }

  // New Item Model
  editingItem: Partial<MenuItem> = {
    name: '',
    short_code: '',
    description: '',
    price: 0,
    cost_price: 0,
    category_id: '',
    is_veg: true,
    is_available: true,
    prep_time_mins: 10,
    tax_rate: 5.0
  };

  constructor(
    public menuService: MenuService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.menuService.categories$.subscribe(cats => {
      this.categories = cats;
      if (cats.length > 0 && this.selectedCategoryId === 'ALL') {
        this.editingItem.category_id = cats[0].id;
      }
    });

    this.menuService.items$.subscribe(items => this.items = items);
  }

  get filteredItems(): MenuItem[] {
    return this.items.filter(item => {
      const matchCat = this.selectedCategoryId === 'ALL' || item.category_id === this.selectedCategoryId;
      const matchQuery = !this.searchQuery || item.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }

  toggleAvailability(item: MenuItem): void {
    this.menuService.toggleItemAvailability(item.id);
  }

  openAddItemModal(): void {
    this.editingItem = {
      name: '',
      short_code: '',
      description: '',
      price: 0,
      cost_price: 0,
      category_id: this.categories[0]?.id || '',
      is_veg: true,
      is_available: true,
      prep_time_mins: 8,
      tax_rate: 5.0
    };
    this.showItemModal = true;
  }

  saveItem(): void {
    if (!this.editingItem.name || !this.editingItem.price) {
      this.toast.warning('Please enter Item Name and Price.');
      return;
    }

    const cat = this.categories.find(c => c.id === this.editingItem.category_id);

    this.menuService.saveMenuItem({
      id: this.editingItem.id || '',
      organization_id: 'org-cafe-01',
      name: this.editingItem.name,
      short_code: this.editingItem.short_code,
      description: this.editingItem.description,
      price: Number(this.editingItem.price),
      cost_price: Number(this.editingItem.cost_price || 0),
      category_id: this.editingItem.category_id || '',
      category_name: cat?.name || 'Beverages',
      is_veg: !!this.editingItem.is_veg,
      is_available: true,
      prep_time_mins: Number(this.editingItem.prep_time_mins || 5),
      tax_rate: 5.0,
      display_order: 1,
      is_combo: false
    });

    this.showItemModal = false;
    this.toast.success(`Dish "${this.editingItem.name}" saved successfully!`, 'Menu Updated');
  }

  deleteItem(id: string): void {
    if (confirm('Are you sure you want to delete this menu dish?')) {
      this.menuService.deleteMenuItem(id);
    }
  }

  calculateMargin(price: number, cost: number): number {
    if (!price || price <= 0) return 0;
    return Math.round(((price - (cost || 0)) / price) * 100);
  }
}

