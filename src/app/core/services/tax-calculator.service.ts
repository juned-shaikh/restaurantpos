import { Injectable } from '@angular/core';

export type TaxRegime = 'INDIA_GST' | 'US_SALES_TAX' | 'EU_VAT';

export interface TaxCalculationResult {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  regime: TaxRegime;
  taxLabel: string;
}

@Injectable({
  providedIn: 'root'
})
export class TaxCalculatorService {
  /**
   * Multi-region tax calculator supporting:
   * 1. INDIA_GST: 5% (2.5% CGST + 2.5% SGST), inclusive or exclusive
   * 2. US_SALES_TAX: Single rate (e.g. 8.25%), always exclusive
   * 3. EU_VAT: Single rate (e.g. 10% / 20%), inclusive
   * 4. ES_IVA: Spain IVA (10% hospitality / 21% standard), inclusive + VERI*FACTU chain
   */
  calculateTax(
    rawSubtotal: number,
    discountPct: number = 0,
    cgstPct: number = 2.5,
    sgstPct: number = 2.5,
    isInclusive: boolean = false,
    regime: TaxRegime = 'INDIA_GST'
  ): TaxCalculationResult {
    const discountAmount = Number(((rawSubtotal * discountPct) / 100).toFixed(2));
    const discountedTotal = Math.max(0, rawSubtotal - discountAmount);

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let grandTotalBeforeRounding = 0;
    let taxLabel = 'GST (5%)';

    const totalTaxPct = cgstPct + sgstPct;

    if (regime === 'US_SALES_TAX') {
      taxLabel = `Sales Tax (${totalTaxPct}%)`;
      taxableAmount = Number(discountedTotal.toFixed(2));
      cgstAmount = Number(((taxableAmount * totalTaxPct) / 100).toFixed(2));
      sgstAmount = 0;
      grandTotalBeforeRounding = taxableAmount + cgstAmount;
    } else if (regime === 'EU_VAT') {
      taxLabel = `VAT (${totalTaxPct}%)`;
      taxableAmount = Number((discountedTotal / (1 + totalTaxPct / 100)).toFixed(2));
      cgstAmount = Number(((taxableAmount * totalTaxPct) / 100).toFixed(2));
      sgstAmount = 0;
      grandTotalBeforeRounding = discountedTotal;
    } else {
      // Default: INDIA_GST
      taxLabel = `CGST (${cgstPct}%) + SGST (${sgstPct}%)`;
      if (isInclusive) {
        taxableAmount = Number((discountedTotal / (1 + totalTaxPct / 100)).toFixed(2));
        cgstAmount = Number(((taxableAmount * cgstPct) / 100).toFixed(2));
        sgstAmount = Number(((taxableAmount * sgstPct) / 100).toFixed(2));
        grandTotalBeforeRounding = discountedTotal;
      } else {
        taxableAmount = Number(discountedTotal.toFixed(2));
        cgstAmount = Number(((taxableAmount * cgstPct) / 100).toFixed(2));
        sgstAmount = Number(((taxableAmount * sgstPct) / 100).toFixed(2));
        grandTotalBeforeRounding = taxableAmount + cgstAmount + sgstAmount;
      }
    }

    const grandTotalRounded = Math.round(grandTotalBeforeRounding);
    const roundOff = Number((grandTotalRounded - grandTotalBeforeRounding).toFixed(2));

    return {
      subtotal: rawSubtotal,
      discountAmount,
      taxableAmount,
      cgstRate: cgstPct,
      cgstAmount,
      sgstRate: sgstPct,
      sgstAmount,
      totalTax: Number((cgstAmount + sgstAmount).toFixed(2)),
      roundOff,
      grandTotal: grandTotalRounded,
      regime,
      taxLabel
    };
  }

  /**
   * Generates dynamic NPCI UPI Intent URI for QR code generation
   * Format: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&cu=INR&tn=BILL_REF
   */
  generateUpiIntentString(vpa: string, payeeName: string, amount: number, billRef: string): string {
    const cleanVpa = encodeURIComponent(vpa.trim());
    const cleanName = encodeURIComponent(payeeName.trim());
    const cleanAmount = amount.toFixed(2);
    const cleanNote = encodeURIComponent(`Order ${billRef}`);
    return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
  }
}
