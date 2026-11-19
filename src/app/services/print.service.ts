import { Injectable } from '@angular/core';
import { Order } from '../models';

@Injectable({
  providedIn: 'root'
})
export class PrintService {

  printReceipt(order: Order, restaurantInfo: { name: string; address: string; phone: string; gstNumber: string }): void {
    const existing = document.getElementById('printable-receipt');
    if (existing) {
      existing.remove();
    }

    const receiptDiv = document.createElement('div');
    receiptDiv.id = 'printable-receipt';

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="flex: 2;">${item.menuItem.name} x${item.quantity}</span>
        <span style="flex: 1; text-align: right;">₹${item.lineTotal.toFixed(2)}</span>
      </div>
      ${item.selectedModifiers && item.selectedModifiers.length > 0 ? `
        <div style="font-size: 10px; color: #555; padding-left: 8px;">
          + ${item.selectedModifiers.map(m => m.name).join(', ')}
        </div>` : ''}
    `).join('');

    receiptDiv.innerHTML = `
      <div style="text-align: center; font-family: monospace; font-size: 12px; line-height: 1.4; padding: 10px; width: 78mm; margin: 0 auto; color: #000; background: #fff;">
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px;">${restaurantInfo.name}</div>
        <div style="font-size: 11px;">${restaurantInfo.address}</div>
        <div style="font-size: 11px;">Tel: ${restaurantInfo.phone}</div>
        ${restaurantInfo.gstNumber ? `<div style="font-size: 11px; margin-bottom: 6px;">GSTIN: ${restaurantInfo.gstNumber}</div>` : ''}
        
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span>Invoice: #${order.orderNumber}</span>
          <span>Table: ${order.tableNumber || order.orderType}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
          <span>Date: ${new Date(order.createdAt).toLocaleDateString()}</span>
          <span>Time: ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        
        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 6px;">
          <span>Item</span>
          <span>Amount</span>
        </div>
        
        ${itemsHtml}
        
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Subtotal:</span>
          <span>₹${order.subtotal.toFixed(2)}</span>
        </div>
        
        ${order.discountAmount > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #c00;">
            <span>Discount:</span>
            <span>-₹${order.discountAmount.toFixed(2)}</span>
          </div>` : ''}
          
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
          <span>CGST (2.5%):</span>
          <span>₹${order.cgst.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
          <span>SGST (2.5%):</span>
          <span>₹${order.sgst.toFixed(2)}</span>
        </div>
        
        ${order.roundOff !== 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span>Round Off:</span>
            <span>${order.roundOff > 0 ? '+' : ''}₹${order.roundOff.toFixed(2)}</span>
          </div>` : ''}
          
        <div style="border-top: 1px double #000; margin: 6px 0;"></div>
        
        <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin-bottom: 6px;">
          <span>GRAND TOTAL:</span>
          <span>₹${order.grandTotal.toFixed(2)}</span>
        </div>
        
        <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
        <div style="font-size: 11px; text-align: center; margin-top: 6px;">Thank You! Please Visit Again.</div>
        <div style="font-size: 9px; color: #888; text-align: center; margin-top: 2px;">Powered by Nodedr Restaurant POS</div>
      </div>
    `;

    document.body.appendChild(receiptDiv);
    window.print();
  }
}
