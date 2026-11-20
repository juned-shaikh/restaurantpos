import { Injectable } from '@angular/core';
import { Order } from '../models/order.model';
import { KotTicket } from '../models/kds.model';
import { Branch } from '../models/tenant.model';

@Injectable({
  providedIn: 'root'
})
export class PrintService {
  private iframeId = 'pos-silent-thermal-printer-frame';

  private getOrCreatePrintIframe(): HTMLIFrameElement {
    let iframe = document.getElementById(this.iframeId) as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = this.iframeId;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
    }
    return iframe;
  }

  /**
   * Generates and prints a commercial 80mm / 58mm thermal tax invoice or pre-bill
   * Directly triggers without browser popup blocks. Includes Dynamic UPI QR code.
   */
  printOrderReceipt(order: Order, branch: Branch, isProforma: boolean = false, paperWidthMm: number = 80): void {
    const iframe = this.getOrCreatePrintIframe();
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    // Generate UPI Payment QR string if branch has configured UPI VPA
    const upiVpa = (branch.upi_vpa || '').trim();
    const upiPayee = encodeURIComponent(branch.upi_payee_name || branch.name);
    const upiAmount = order.total_amount.toFixed(2);
    const upiUrl = upiVpa ? `upi://pay?pa=${upiVpa}&pn=${upiPayee}&am=${upiAmount}&cu=INR&tn=Order%20${order.order_number}` : '';
    const qrApiUrl = upiUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUrl)}` : '';

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin: 3px 0;">
        <span style="flex: 1; text-align: left;">${item.quantity} x ${item.name}</span>
        <span style="white-space: nowrap;">₹${item.total_price.toFixed(2)}</span>
      </div>
      ${item.modifiers?.length ? `<div style="font-size: 11px; color: #333; padding-left: 14px;">+ ${item.modifiers.map(m => m.name).join(', ')}</div>` : ''}
      ${item.notes ? `<div style="font-size: 11px; font-weight: bold; padding-left: 14px;">* Note: ${item.notes}</div>` : ''}
    `).join('');

    const printableWidth = paperWidthMm === 58 ? '52mm' : '72mm';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt #${order.order_number}</title>
        <style>
          @page {
            size: ${paperWidthMm}mm auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace, monospace;
            width: ${printableWidth};
            margin: 0 auto;
            padding: 6px 4px 20mm 4px;
            color: #000;
            background: #fff;
            font-size: 12px;
            line-height: 1.35;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: 800; }
          .dashed { border-top: 1px dashed #000; margin: 6px 0; }
          .double-line { border-top: 2px solid #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
          .title-lg { font-size: 16px; font-weight: 900; letter-spacing: 0.05em; }
          .proforma-box {
            border: 2px dashed #000;
            padding: 6px;
            margin: 6px 0;
            font-weight: 900;
            font-size: 13px;
            text-align: center;
          }
          .qr-box {
            margin: 10px auto;
            text-align: center;
          }
          .qr-box img {
            width: 120px;
            height: 120px;
            display: block;
            margin: 4px auto;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title-lg">${branch.name.toUpperCase()}</div>
          <div style="font-size: 11px;">${branch.address}</div>
          <div style="font-size: 11px;">Tel: ${branch.phone}</div>
          ${branch.gstin ? `<div style="font-size: 11px; font-weight: bold;">GSTIN: ${branch.gstin}</div>` : ''}
          ${branch.fssai ? `<div style="font-size: 10px;">FSSAI Lic No: ${branch.fssai}</div>` : ''}
        </div>

        ${isProforma ? `
          <div class="proforma-box">
            *** ESTIMATE / RUNNING BILL ***<br>
            <span style="font-size: 10px; font-weight: normal;">(NOT A TAX INVOICE — PAY AT COUNTER)</span>
          </div>
        ` : `
          <div class="dashed"></div>
          <div class="text-center bold" style="font-size: 14px;">*** TAX INVOICE ***</div>
        `}

        <div class="dashed"></div>

        <div class="row">
          <span>Invoice No: <b>#${order.order_number}</b></span>
          <span>Type: <b>${order.order_type}</b></span>
        </div>
        ${order.table_number ? `
          <div class="row" style="font-size: 13px;">
            <span>TABLE: <b>${order.table_number}</b></span>
            <span>Server: ${order.server_name || 'Captain'}</span>
          </div>
        ` : ''}
        <div class="row" style="font-size: 11px;">
          <span>Date: ${new Date(order.created_at).toLocaleDateString()}</span>
          <span>Time: ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${order.customer_name ? `<div class="row" style="font-size: 11px;"><span>Customer: ${order.customer_name}</span><span>${order.customer_phone || ''}</span></div>` : ''}

        <div class="double-line"></div>

        <div class="row bold" style="font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 2px;">
          <span>ITEM DESCRIPTION</span>
          <span>AMOUNT</span>
        </div>

        ${itemsHtml}

        <div class="double-line"></div>

        <div class="row"><span>Item Subtotal:</span><span>₹${order.subtotal.toFixed(2)}</span></div>
        ${order.discount_amount > 0 ? `
          <div class="row" style="font-weight: bold;">
            <span>Special Discount (${order.discount_pct}%):</span>
            <span>-₹${order.discount_amount.toFixed(2)}</span>
          </div>
          ${order.discount_approved_by ? `<div style="font-size: 10px; color: #555;">(Mgr Approval PIN Auth)</div>` : ''}
        ` : ''}
        <div class="row"><span>Taxable Value:</span><span>₹${order.taxable_amount.toFixed(2)}</span></div>
        <div class="row"><span>CGST (${branch.default_cgst_pct || 2.5}%):</span><span>₹${order.cgst_amount.toFixed(2)}</span></div>
        <div class="row"><span>SGST (${branch.default_sgst_pct || 2.5}%):</span><span>₹${order.sgst_amount.toFixed(2)}</span></div>
        ${order.round_off !== 0 ? `<div class="row"><span>Round Off:</span><span>₹${order.round_off.toFixed(2)}</span></div>` : ''}

        <div class="dashed"></div>

        <div class="row bold" style="font-size: 17px; margin: 4px 0;">
          <span>NET PAYABLE:</span>
          <span>₹${order.total_amount.toFixed(2)}</span>
        </div>

        <div class="dashed"></div>

        <!-- Settled Payments Block OR Dynamic UPI Scan to Pay -->
        ${order.is_settled && order.payments?.length ? `
          <div class="row bold">
            <span>PAID VIA:</span>
            <span>${order.payments.map(p => p.payment_mode).join(' + ')}</span>
          </div>
          <div class="text-center bold" style="font-size: 13px; margin: 4px 0;">*** PAYMENT RECEIVED IN FULL ***</div>
        ` : (upiVpa ? `
          <div class="qr-box">
            <div style="font-size: 11px; font-weight: bold;">SCAN TO PAY VIA UPI (GPay/PhonePe/Paytm)</div>
            <img src="${qrApiUrl}" alt="UPI QR">
            <div style="font-size: 10px;">VPA: <b>${upiVpa}</b></div>
          </div>
        ` : '')}

        <div class="dashed"></div>

        <div class="text-center" style="font-size: 11px; margin-top: 6px;">
          <div class="bold">Thank You For Dining With Us!</div>
          <div>Please Visit Again</div>
          <div style="font-size: 9px; margin-top: 4px; color: #555;">Powered by RestroPOS Cloud</div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    // Trigger print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Print execution failed:', err);
      }
    }, 200);
  }

  /**
   * Commercial Kitchen Order Ticket (KOT) Direct Thermal Print
   */
  printKotTicket(kot: KotTicket, isReprint: boolean = false, paperWidthMm: number = 80): void {
    const iframe = this.getOrCreatePrintIframe();
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const printableWidth = paperWidthMm === 58 ? '52mm' : '72mm';

    const itemsHtml = kot.items.map(item => `
      <div style="font-size: 16px; font-weight: 900; margin: 6px 0; border-bottom: 1px dotted #ccc; padding-bottom: 4px;">
        <span style="display: inline-block; width: 36px; font-size: 18px;">[${item.quantity}x]</span>
        <span>${item.name}</span>
        ${item.modifiers_summary ? `<div style="font-size: 12px; font-weight: normal; color: #222; margin-left: 36px;">--> ${item.modifiers_summary}</div>` : ''}
        ${item.notes ? `<div style="font-size: 12px; font-weight: 900; background: #000; color: #fff; padding: 2px 4px; margin-top: 2px; margin-left: 36px; border-radius: 2px;">* CHEF NOTE: ${item.notes}</div>` : ''}
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>KOT #${kot.kot_number}</title>
        <style>
          @page { size: ${paperWidthMm}mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: ${printableWidth};
            padding: 4px 4px 20mm 4px;
            color: #000;
            background: #fff;
          }
          .divider { border-top: 2px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 3px solid #000; margin: 6px 0; }
          .reprint-banner {
            background: #000;
            color: #fff;
            padding: 4px;
            font-size: 16px;
            font-weight: 900;
            text-align: center;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        ${isReprint ? `<div class="reprint-banner">*** DUPLICATE / REPRINT ***</div>` : ''}

        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 900;">${kot.kot_number}</div>
          <div style="font-size: 13px; font-weight: bold;">STATION: ${kot.kitchen_station_name || 'MAIN KITCHEN'}</div>
          
          <div style="border: 2px solid #000; padding: 4px; margin: 6px 0;">
            <div style="font-size: 22px; font-weight: 900;">TABLE: ${kot.table_number}</div>
            <div style="font-size: 12px;">Type: <b>${kot.order_type}</b></div>
          </div>

          <div style="font-size: 11px;">
            Order #${kot.order_number} · Time: ${new Date(kot.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div class="double-divider"></div>

        <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">KITCHEN DISHES:</div>
        ${itemsHtml}

        <div class="divider"></div>
        <div style="text-align: center; font-size: 11px;">END OF TICKET</div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('KOT Print failed:', err);
      }
    }, 200);
  }

  /**
   * Generates and prints a clean A6 / Tent Standee card for dining tables
   * Contains only restaurant branding, table number badge, high-res QR code, and scan instructions.
   */
  printTableTentCard(tableNumber: string, qrImageUrl: string, restaurantName: string): void {
    const iframe = this.getOrCreatePrintIframe();
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Table Standee - ${tableNumber}</title>
        <style>
          @page { size: A6 portrait; margin: 8mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            text-align: center;
            background: #fff;
            color: #0F172A;
            margin: 0;
            padding: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
          }
          .standee-card {
            border: 2px solid #E2E8F0;
            border-radius: 16px;
            padding: 24px;
            max-width: 300px;
            box-sizing: border-box;
          }
          .rest-name {
            font-size: 17px;
            font-weight: 800;
            color: #881337;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }
          .table-badge {
            display: inline-block;
            background: #881337;
            color: #fff;
            font-size: 22px;
            font-weight: 900;
            padding: 6px 20px;
            border-radius: 9999px;
            margin-bottom: 14px;
          }
          .qr-img {
            width: 190px;
            height: 190px;
            display: block;
            margin: 0 auto 14px auto;
            border-radius: 8px;
          }
          .scan-title {
            font-size: 15px;
            font-weight: 800;
            color: #1E293B;
            margin-bottom: 4px;
          }
          .scan-subtitle {
            font-size: 11.5px;
            color: #64748B;
            line-height: 1.4;
          }
          .footer-note {
            font-size: 9.5px;
            color: #94A3B8;
            margin-top: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="standee-card">
          <div class="rest-name">${restaurantName || 'Restaurant'}</div>
          <div class="table-badge">Table ${tableNumber}</div>
          <img class="qr-img" src="${qrImageUrl}" alt="Scan QR" />
          <div class="scan-title">Scan to View Menu & Order</div>
          <div class="scan-subtitle">Point your phone camera to browse dishes, place orders, or request the bill directly.</div>
          <div class="footer-note">No App Download Required • Contactless Dining</div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Standee print failed:', err);
      }
    }, 250);
  }
}
