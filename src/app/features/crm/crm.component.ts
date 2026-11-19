import { Component, OnInit } from '@angular/core';
import { CrmService } from '../../core/services/crm.service';
import { Customer, LoyaltyTransaction, GiftVoucher, CustomerFeedback } from '../../core/models/crm.model';

@Component({
  selector: 'app-crm',
  templateUrl: './crm.component.html',
  styleUrls: ['./crm.component.scss']
})
export class CrmComponent implements OnInit {
  customers: Customer[] = [];
  loyaltyTxns: LoyaltyTransaction[] = [];
  vouchers: GiftVoucher[] = [];
  feedbackList: CustomerFeedback[] = [];
  activeTab: 'customers' | 'loyalty' | 'vouchers' | 'feedback' = 'customers';

  showCustomerModal = false;
  showVoucherModal = false;
  searchQuery = '';
  newName = '';
  newPhone = '';
  newEmail = '';

  get newCustName(): string { return this.newName; }
  set newCustName(v: string) { this.newName = v; }

  get newCustPhone(): string { return this.newPhone; }
  set newCustPhone(v: string) { this.newPhone = v; }

  get newCustEmail(): string { return this.newEmail; }
  set newCustEmail(v: string) { this.newEmail = v; }

  get filteredCustomers(): Customer[] {
    if (!this.searchQuery) return this.customers;
    const q = this.searchQuery.toLowerCase().trim();
    return this.customers.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  }

  saveCustomer(): void {
    this.createCustomer();
  }

  constructor(public crmService: CrmService) {}

  ngOnInit(): void {
    this.crmService.customers$.subscribe(c => this.customers = c);
    this.crmService.loyaltyTxns$.subscribe(l => this.loyaltyTxns = l);
    this.crmService.vouchers$.subscribe(v => this.vouchers = v);
    this.crmService.feedbackList$.subscribe(f => this.feedbackList = f);
  }

  createCustomer(): void {
    if (!this.newName || !this.newPhone) {
      alert('Name and Phone are mandatory');
      return;
    }

    this.crmService.addCustomer({
      full_name: this.newName,
      phone: this.newPhone,
      email: this.newEmail
    });

    this.showCustomerModal = false;
    this.newName = '';
    this.newPhone = '';
    this.newEmail = '';
    alert('Customer enrolled with 50 Welcome Loyalty Points and unique Referral Code!');
  }

  getTierClass(tier: string): string {
    return 'badge-' + (tier || '').toLowerCase();
  }
}

