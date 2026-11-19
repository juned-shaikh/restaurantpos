import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { OrderService } from '../../core/services/order.service';
import { TenantService } from '../../core/services/tenant.service';
import { TaxCalculatorService } from '../../core/services/tax-calculator.service';
import { Order } from '../../core/models/order.model';
import { Branch } from '../../core/models/tenant.model';
import { SelectOption } from '../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-customer-display',
  templateUrl: './customer-display.component.html',
  styleUrls: ['./customer-display.component.scss']
})
export class CustomerDisplayComponent implements OnInit, OnDestroy {
  activeOrder: Partial<Order> | null = null;
  activeBranch!: Branch;
  upiQrUri: string = '';
  encodedUpiUri: string = '';
  isLiveCart: boolean = false;
  isFullscreen: boolean = false;

  // Dual Screen / Source Modes
  selectedDisplayMode: string = 'LIVE_TILL';
  displayModeOptions: SelectOption[] = [
    { label: 'Live POS Till (Auto Sync)', value: 'LIVE_TILL', icon: 'ri-flashlight-line' },
    { label: 'Idle Standby Screen', value: 'IDLE', icon: 'ri-cup-line' }
  ];

  // Settlement Celebration Screen
  showPaymentSuccess: boolean = false;
  paymentSuccessDetails: { amount: number; mode: string; orderNo?: string } | null = null;
  settledDismissTimer: any = null;

  // Demo Simulation
  demoSimulationTimer: any = null;
  private subs: Subscription[] = [];

  constructor(
    public orderService: OrderService,
    public tenantService: TenantService,
    public taxCalculator: TaxCalculatorService
  ) {}

  ngOnInit(): void {
    // 1. Subscribe to active branch
    this.subs.push(
      this.tenantService.activeBranch$.subscribe(b => {
        this.activeBranch = b;
        this.updateUpiString();
      })
    );

    // 2. Request initial sync from POS Till tab
    this.orderService.requestLiveCartSync();

    // Check if there is already a live till cart in OrderService or localStorage
    const initialCart = this.orderService.getLiveTillOrderValue();
    if (initialCart && initialCart.items && initialCart.items.length > 0) {
      this.activeOrder = initialCart;
      this.isLiveCart = true;
      this.selectedDisplayMode = 'LIVE_TILL';
      this.updateUpiString();
    } else {
      this.activeOrder = null;
      this.isLiveCart = false;
      this.updateUpiString();
    }

    // 3. Listen to Real-Time Live Till stream (cross-tab via BroadcastChannel & localStorage)
    this.subs.push(
      this.orderService.liveTillOrder$.subscribe(liveOrder => {
        if (liveOrder && liveOrder.items && liveOrder.items.length > 0) {
          if (this.demoSimulationTimer) {
            clearInterval(this.demoSimulationTimer);
            this.demoSimulationTimer = null;
          }
          this.activeOrder = liveOrder;
          this.isLiveCart = true;
          this.selectedDisplayMode = 'LIVE_TILL';
          this.updateUpiString();
        } else if (this.selectedDisplayMode === 'LIVE_TILL') {
          // Till was cleared
          this.activeOrder = null;
          this.isLiveCart = false;
          this.updateUpiString();
        }
      })
    );

    // 4. Listen to Order Settlement celebrations
    this.subs.push(
      this.orderService.orderSettled$.subscribe(settled => {
        if (settled) {
          this.triggerPaymentSuccess(settled.amount, settled.mode, settled.orderNo);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.demoSimulationTimer) {
      clearInterval(this.demoSimulationTimer);
    }
    if (this.settledDismissTimer) {
      clearTimeout(this.settledDismissTimer);
    }
  }

  onDisplayModeChange(mode: string): void {
    if (this.demoSimulationTimer) {
      clearInterval(this.demoSimulationTimer);
      this.demoSimulationTimer = null;
    }
    this.selectedDisplayMode = mode;

    if (mode === 'LIVE_TILL') {
      this.orderService.requestLiveCartSync();
      const current = this.orderService.getLiveTillOrderValue();
      if (current && current.items && current.items.length > 0) {
        this.activeOrder = current;
        this.isLiveCart = true;
      } else {
        this.activeOrder = null;
        this.isLiveCart = false;
      }
    } else {
      this.activeOrder = null;
      this.isLiveCart = false;
    }
    this.updateUpiString();
  }

  simulateLiveBilling(): void {
    if (this.demoSimulationTimer) {
      clearInterval(this.demoSimulationTimer);
    }
    this.selectedDisplayMode = 'SIMULATE';
    this.isLiveCart = true;

    const demoSteps: Partial<Order>[] = [
      {
        order_number: 'LIVE-DEMO',
        table_number: 'T-01',
        order_type: 'DINE_IN',
        customer_name: 'Walk-in Guest',
        items: [
          {
            menu_item_id: 'm-01',
            name: 'Single Origin Flat White',
            quantity: 1,
            unit_price: 240,
            total_price: 240,
            is_veg: true,
            modifiers: []
          }
        ],
        subtotal: 240,
        discount_pct: 0,
        discount_amount: 0,
        taxable_amount: 240,
        cgst_amount: 6.00,
        sgst_amount: 6.00,
        round_off: 0,
        total_amount: 252
      },
      {
        order_number: 'LIVE-DEMO',
        table_number: 'T-01',
        order_type: 'DINE_IN',
        customer_name: 'Walk-in Guest',
        items: [
          {
            menu_item_id: 'm-01',
            name: 'Single Origin Flat White',
            quantity: 1,
            unit_price: 240,
            total_price: 285,
            is_veg: true,
            modifiers: [{ name: 'Oat Milk (+₹45)', price_adjustment: 45 }],
            notes: 'Extra hot'
          },
          {
            menu_item_id: 'm-04',
            name: 'Truffled Wild Mushroom Sourdough',
            quantity: 1,
            unit_price: 380,
            total_price: 380,
            is_veg: true,
            modifiers: []
          }
        ],
        subtotal: 665,
        discount_pct: 0,
        discount_amount: 0,
        taxable_amount: 665,
        cgst_amount: 16.63,
        sgst_amount: 16.63,
        round_off: -0.26,
        total_amount: 698
      },
      {
        order_number: 'LIVE-DEMO',
        table_number: 'T-01',
        order_type: 'DINE_IN',
        customer_name: 'Walk-in Guest',
        items: [
          {
            menu_item_id: 'm-01',
            name: 'Single Origin Flat White',
            quantity: 1,
            unit_price: 240,
            total_price: 285,
            is_veg: true,
            modifiers: [{ name: 'Oat Milk (+₹45)', price_adjustment: 45 }],
            notes: 'Extra hot'
          },
          {
            menu_item_id: 'm-04',
            name: 'Truffled Wild Mushroom Sourdough',
            quantity: 1,
            unit_price: 380,
            total_price: 410,
            is_veg: true,
            modifiers: [{ name: 'Extra Cheese (+₹30)', price_adjustment: 30 }]
          },
          {
            menu_item_id: 'm-03',
            name: '18-Hour Nitro Cold Brew',
            quantity: 2,
            unit_price: 290,
            total_price: 580,
            is_veg: true,
            modifiers: []
          }
        ],
        subtotal: 1275,
        discount_pct: 10,
        discount_amount: 127.50,
        taxable_amount: 1147.50,
        cgst_amount: 28.69,
        sgst_amount: 28.69,
        round_off: 0.12,
        total_amount: 1205
      }
    ];

    let stepIdx = 0;
    this.activeOrder = demoSteps[0];
    this.updateUpiString();

    this.demoSimulationTimer = setInterval(() => {
      stepIdx++;
      if (stepIdx < demoSteps.length) {
        this.activeOrder = demoSteps[stepIdx];
        this.updateUpiString();
      } else {
        clearInterval(this.demoSimulationTimer);
        this.demoSimulationTimer = null;
      }
    }, 1800);
  }

  triggerPaymentSuccess(amount: number, mode: string, orderNo?: string): void {
    this.showPaymentSuccess = true;
    this.paymentSuccessDetails = { amount, mode, orderNo };

    if (this.settledDismissTimer) {
      clearTimeout(this.settledDismissTimer);
    }
    this.settledDismissTimer = setTimeout(() => {
      this.showPaymentSuccess = false;
      this.paymentSuccessDetails = null;
      this.activeOrder = null;
      this.isLiveCart = false;
      this.selectedDisplayMode = 'IDLE';
      this.updateUpiString();
    }, 4500);
  }

  openPosTill(): void {
    window.open('/orders', '_blank');
  }

  updateUpiString(): void {
    if (!this.activeOrder || !this.activeOrder.items || this.activeOrder.items.length === 0) {
      this.upiQrUri = '';
      this.encodedUpiUri = '';
      return;
    }
    const branch = this.activeBranch || this.tenantService.activeBranch;
    const vpa = branch?.upi_vpa || 'restaurant@upi';
    const payee = branch?.upi_payee_name || branch?.name || 'Restaurant POS';
    const orderNo = this.activeOrder.order_number || 'LiveTill';
    const amount = Number(this.activeOrder.total_amount) || 0;

    if (amount > 0) {
      this.upiQrUri = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Order #' + orderNo)}`;
      this.encodedUpiUri = encodeURIComponent(this.upiQrUri);
    } else {
      this.upiQrUri = '';
      this.encodedUpiUri = '';
    }
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen = true;
      }).catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          this.isFullscreen = false;
        });
      }
    }
  }
}
