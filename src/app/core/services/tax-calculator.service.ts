import { Injectable } from '@angular/core';

export type TaxRegime = 'INDIA_GST';

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
   * Fast & accurate Indian GST (5% F&B default: 2.5% CGST + 2.5% SGST)
   * Supports both Inclusive and Exclusive GST with exact Indian Rupee rounding
   */
  calculateTax(
    rawSubtotal: number,
    discountPct: number = 0,
    cgstPct: number = 2.5,
    sgstPct: number = 2.5,
    isInclusive: boolean = false
  ): TaxCalculationResult {
    const discountAmount = Number(((rawSubtotal * discountPct) / 100).toFixed(2));
    const discountedTotal = Math.max(0, rawSubtotal - discountAmount);
    const totalTaxPct = cgstPct + sgstPct;

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let grandTotalBeforeRounding = 0;
    const taxLabel = `CGST (${cgstPct}%) + SGST (${sgstPct}%)`;

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
      regime: 'INDIA_GST',
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
