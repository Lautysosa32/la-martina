import React, { useRef } from 'react';
import { useAdmin } from '../context/AdminContext';

export interface TicketItem {
  name: string;
  quantity: number;
  price: number;        // original unit price
  finalPrice: number;   // price of a discounted unit
  lineDiscount?: number;
  discountedQuantity?: number;
  offerLabel?: string | null;
}

export interface TicketData {
  ticketNumber: string;
  date: string;
  items: TicketItem[];
  subtotal: number;
  globalDiscount: number;   // percent 0-100
  globalDiscountAmount: number;
  globalDiscountLabel?: string;
  total: number;
  paymentMethod: string;
  customer?: string;
  cashier?: string;
}

interface TicketPrinterProps {
  ticket: TicketData;
  onClose: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta Corriente',
};

export const TicketPrinter: React.FC<TicketPrinterProps> = ({ ticket, onClose }) => {
  const ticketRef = useRef<HTMLDivElement>(null);
  const { ticketConfig } = useAdmin();

  const handlePrint = () => {
    const content = ticketRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Ticket ${ticket.ticketNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 8px; width: 300px; }
            .blank-line { height: 14px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
            .store-name { font-size: 18px; font-weight: bold; }
            .ticket-num { font-size: 11px; margin-top: 4px; }
            .date { font-size: 10px; color: #555; }
            .items { margin: 8px 0; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .item { margin-bottom: 4px; }
            .item-name { font-weight: bold; font-size: 11px; }
            .item-detail { display: flex; justify-content: space-between; font-size: 10px; color: #333; }
            .offer-line { font-size: 9px; color: #666; font-style: italic; }
            .totals { margin-top: 8px; }
            .total-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
            .total-row.grand { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 6px; margin-top: 6px; }
            .discount-row { color: #c00; }
            .footer { text-align: center; margin-top: 12px; font-size: 10px; color: #666; border-top: 1px dashed #000; padding-top: 8px; }
            @media print { body { width: 80mm; } }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="bg-white rounded-[2.5rem] shadow-2xl relative z-10 w-full max-w-md animate-in zoom-in-95 duration-300 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">receipt_long</span>
            <h3 className="text-xl font-black">Ticket #{ticket.ticketNumber}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Preview */}
        <div className="p-6 overflow-y-auto max-h-[60vh] no-scrollbar">
          <div ref={ticketRef} className="bg-white font-mono text-xs leading-relaxed">
            {/* Blank lines top */}
            {Array.from({ length: ticketConfig.blankLinesTop }).map((_, i) => (
              <div key={`top-${i}`} className="blank-line">&nbsp;</div>
            ))}

            {/* Ticket body – this is also what gets printed */}
            <div className="header">
              <div className="store-name">{ticketConfig.headerText || 'La Martina'}</div>
              <div className="date">{ticketConfig.businessName || 'Minimarket & Supermercado'}</div>
              {ticketConfig.businessAddress && <div className="date">{ticketConfig.businessAddress}</div>}
              {ticketConfig.businessPhone && <div className="date">Tel: {ticketConfig.businessPhone}</div>}
              {ticketConfig.businessCuit && <div className="date">CUIT: {ticketConfig.businessCuit}</div>}
              <div className="ticket-num">Ticket: #{ticket.ticketNumber}</div>
              <div className="date">{ticket.date}</div>
              {ticket.customer && <div className="date">Cliente: {ticket.customer}</div>}
              {ticket.cashier && <div className="date">Atendido por: {ticket.cashier}</div>}
            </div>

            <div className="items">
              {ticket.items.map((item, i) => {
                const lineTotal = (item.price * item.quantity) - (item.lineDiscount || 0);
                const hasDiscount = item.offerLabel && item.lineDiscount && item.lineDiscount > 0;
                return (
                  <div key={i} className="item">
                    <div className="item-name">{item.name}</div>
                    <div className="item-detail">
                      <span>{item.quantity} x ${fmt(item.price)}</span>
                      <span>${fmt(lineTotal)}</span>
                    </div>
                    {hasDiscount && (
                      <div className="offer-line">▸ {item.offerLabel} {item.discountedQuantity && item.discountedQuantity < item.quantity ? `(${item.discountedQuantity} unid.) ` : ''}(-${fmt(item.lineDiscount || 0)})</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="totals">
              <div className="total-row">
                <span>Subtotal</span>
                <span>${fmt(ticket.subtotal)}</span>
              </div>
              {ticket.globalDiscountAmount > 0 && (
                <div className="total-row discount-row">
                  <span>{ticket.globalDiscountLabel || (ticket.globalDiscount > 0 ? `Descuento (${ticket.globalDiscount}%)` : 'Descuento')}</span>
                  <span>-${fmt(ticket.globalDiscountAmount)}</span>
                </div>
              )}
              <div className="total-row grand">
                <span>TOTAL</span>
                <span>${fmt(ticket.total)}</span>
              </div>
              <div className="total-row">
                <span>Forma de pago</span>
                <span>{PAYMENT_LABELS[ticket.paymentMethod] || ticket.paymentMethod}</span>
              </div>
            </div>

            <div className="footer">
              <div>{ticketConfig.footerMessage || '¡Gracias por su compra!'}</div>
              <div>{ticketConfig.headerText || 'La Martina'} — {ticketConfig.businessAddress || 'La Paz, Mendoza'}</div>
            </div>

            {/* Blank lines bottom */}
            {Array.from({ length: ticketConfig.blankLinesBottom }).map((_, i) => (
              <div key={`bot-${i}`} className="blank-line">&nbsp;</div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">print</span>
            Imprimir Ticket
          </button>
        </div>
      </div>
    </div>
  );
};
