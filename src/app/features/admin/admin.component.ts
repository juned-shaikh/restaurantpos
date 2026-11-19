import { Component, OnInit } from '@angular/core';
import { TenantService } from '../../core/services/tenant.service';
import { SecurityService } from '../../core/services/security.service';
import { ToastService } from '../../core/services/toast.service';
import { Organization, Branch, BranchFeatureFlags } from '../../core/models/tenant.model';
import { SelectOption } from '../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  org!: Organization;
  branch!: Branch;

  taxRegimeOptions: SelectOption[] = [
    { label: 'India GST (CGST + SGST Dual Split)', value: 'INDIA_GST', icon: 'ri-flag-line', subtext: 'Default 2.5% CGST + 2.5% SGST' },
    { label: 'US Sales Tax (State + County, Exclusive)', value: 'US_SALES_TAX', icon: 'ri-flag-line', subtext: 'Default 8.25% exclusive' },
    { label: 'European Union VAT (Inclusive)', value: 'EU_VAT', icon: 'ri-flag-line', subtext: 'Default 10.0% inclusive' },
    { label: 'Custom Flat Tax', value: 'CUSTOM', icon: 'ri-percent-line', subtext: 'Single flat rate' }
  ];

  // Form editable copies
  branchName: string = '';
  gstin: string = '';
  upiVpa: string = '';
  upiPayee: string = '';
  taxRegime: 'INDIA_GST' | 'US_SALES_TAX' | 'EU_VAT' | 'CUSTOM' = 'INDIA_GST';
  isTaxInclusive: boolean = false;
  cgstPct: number = 2.5;
  sgstPct: number = 2.5;
  managerPin: string = '1234';

  // Dynamic Module Toggles (For Simple Cafe vs Full Restaurant)
  featureFlags: BranchFeatureFlags = {
    enable_tables: true,
    enable_kds: true,
    enable_inventory: true,
    enable_staff: true,
    enable_crm: true,
    enable_qr: true,
    enable_accounting: true
  };

  constructor(
    public tenantService: TenantService,
    public securityService: SecurityService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.managerPin = this.securityService.currentManagerPin;
    this.tenantService.currentOrg$.subscribe(o => this.org = o);
    this.tenantService.activeBranch$.subscribe(b => {
      this.branch = b;
      this.branchName = b.name;
      this.gstin = b.gstin || '';
      this.upiVpa = b.upi_vpa || '';
      this.upiPayee = b.upi_payee_name || '';
      this.taxRegime = (b.tax_regime as any) || 'INDIA_GST';
      this.isTaxInclusive = b.is_tax_inclusive;
      this.cgstPct = b.default_cgst_pct;
      this.sgstPct = b.default_sgst_pct;
      if (b.feature_flags) {
        this.featureFlags = { ...b.feature_flags };
      }
    });
  }

  onRegimeChange(): void {
    if (this.taxRegime === 'INDIA_GST') {
      this.cgstPct = 2.5;
      this.sgstPct = 2.5;
      this.isTaxInclusive = false;
    } else if (this.taxRegime === 'US_SALES_TAX') {
      this.cgstPct = 8.25;
      this.sgstPct = 0;
      this.isTaxInclusive = false;
    } else if (this.taxRegime === 'EU_VAT') {
      this.cgstPct = 10.0;
      this.sgstPct = 0;
      this.isTaxInclusive = true;
    } else if (this.taxRegime === 'CUSTOM') {
      this.cgstPct = 5.0;
      this.sgstPct = 0;
      this.isTaxInclusive = false;
    }
  }

  toggleModule(key: keyof BranchFeatureFlags): void {
    this.featureFlags[key] = !this.featureFlags[key];
    this.tenantService.updateFeatureFlags({ [key]: this.featureFlags[key] });
  }

  saveBranchSettings(): void {
    if (this.managerPin && this.managerPin.length >= 4) {
      this.securityService.setManagerPin(this.managerPin);
    }

    this.tenantService.updateBranchSettings({
      name: this.branchName,
      gstin: this.gstin,
      upi_vpa: this.upiVpa,
      upi_payee_name: this.upiPayee,
      tax_regime: this.taxRegime,
      is_tax_inclusive: this.isTaxInclusive,
      default_cgst_pct: Number(this.cgstPct),
      default_sgst_pct: Number(this.sgstPct)
    });
    this.tenantService.updateFeatureFlags(this.featureFlags);

    this.toast.success('Settings saved! Manager PIN & active modules updated.', 'Settings Saved');
  }
}
