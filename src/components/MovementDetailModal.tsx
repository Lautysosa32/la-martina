import React from 'react';
import { CashMovement, AdminOrder } from '../context/AdminContext';
import { TicketPrinter, TicketData } from './TicketPrinter';
import { useState } from 'react';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta Corriente',
};

const TYPE_STYLES: Record<string, string> = {
  Ingreso: 'bg-green-100 text-green-700',
  Egreso: 'bg-red-100 text-red-700',
  Retiro: 'bg-orange-100 text-orange-700',
  Venta: 'bg-yellow-100 text-yellow-700',
};

interface MovementDetailModalProps {
  movement: CashMovement;
  relatedOrder?: AdminOrder | null;
  formatCurrency: (value: number, isCurrency?: boolean, forceShow?: boolean) => string;
  onClose: () => void;
}

export const MovementDetailModal: React.FC<MovementDetailModalProps> = ({
  movement,
  relatedOrder,
  formatCurrency,
  onClose,
}) => {
  const [showTicket, setShowTicket] = useState(false);

  const isVenta = movement.description.includes('Venta Local') || movement.description.includes('Pago Cta. Corriente');
  const isRetiro = movement.type === 'Retiro';

  const paymentMethodMatch = movement.description.match(/\(([^)]+)\)/);
  const paymentMethod = paymentMethodMatch ? paymentMethodMatch[1] : 'Efectivo';

  const dateStr = new Date(movement.timestamp).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // Build ticket data from related order
  const ticketData: TicketData | null = relatedOrder ? {
    ticketNumber: relatedOrder.id,
    date: relatedOrder.date,
    items: relatedOrder.items.map(i => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      finalPrice: i.price,
      offerLabel: null
    })),
    subtotal: relatedOrder.total,
    globalDiscount: 0,
    globalDiscountAmount: 0,
    total: relatedOrder.total,
    paymentMethod: relatedOrder.paymentMethod,
    customer: relatedOrder.customer,
    cashier: 'Admin'
  } : null;

  return (
    <>
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white rounded-[2.5rem] shadow-2xl relative z-10 w-full max-w-lg animate-in zoom-in-95 duration-300 overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isVenta ? TYPE_STYLES['Venta'] : isRetiro ? TYPE_STYLES['Retiro'] : TYPE_STYLES[movement.type] || 'bg-gray-100 text-gray-600'}`}>
                <span className="material-symbols-outlined text-[20px]">
                  {isVenta ? 'shopping_cart' : isRetiro ? 'output' : movement.type === 'Ingreso' ? 'add_circle' : 'remove_circle'}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-black">Detalle de Movimiento</h3>
                <p className="text-xs text-on-surface-variant font-medium">{movement.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto max-h-[65vh] no-scrollbar space-y-4">
            {/* General info */}
            <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-on-surface-variant uppercase">Tipo</span>
                <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${isVenta ? TYPE_STYLES['Venta'] : isRetiro ? TYPE_STYLES['Retiro'] : TYPE_STYLES[movement.type]}`}>
                  {isVenta ? 'Venta' : movement.type}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-on-surface-variant uppercase">Fecha y Hora</span>
                <span className="text-sm font-bold">{dateStr}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-on-surface-variant uppercase">Responsable</span>
                <span className="text-sm font-bold">{movement.cashier}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-on-surface-variant uppercase">Método de pago</span>
                <span className="text-sm font-bold uppercase">{PAYMENT_LABELS[paymentMethod] || paymentMethod}</span>
              </div>
              {relatedOrder && (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-on-surface-variant uppercase">N° Ticket</span>
                  <span className="text-sm font-bold font-mono text-primary">#{relatedOrder.id}</span>
                </div>
              )}
              {relatedOrder?.customer && relatedOrder.customer !== 'Cliente Local' && (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-on-surface-variant uppercase">Cliente</span>
                  <span className="text-sm font-bold">{relatedOrder.customer}</span>
                </div>
              )}
            </div>

            {/* Items (if linked to order) */}
            {relatedOrder && relatedOrder.items.length > 0 && (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-outline-variant/10">
                  <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider">Productos</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-on-surface-variant uppercase bg-surface-container-low">
                      <th className="px-4 py-2 text-left">Descripción</th>
                      <th className="px-4 py-2 text-center">Cant.</th>
                      <th className="px-4 py-2 text-right">P. Unit.</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {relatedOrder.items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium text-on-background text-xs">{item.name}</td>
                        <td className="px-4 py-3 text-center font-bold text-xs">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-xs">${formatCurrency(item.price, true, true)}</td>
                        <td className="px-4 py-3 text-right font-bold text-xs">${formatCurrency(item.price * item.quantity, true, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Subtotals */}
                <div className="px-4 py-3 border-t border-outline-variant/10 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Subtotal</span>
                    <span className="font-bold">${formatCurrency(relatedOrder.total, true, true)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-black text-on-background">TOTAL</span>
                    <span className="font-black text-primary text-base">${formatCurrency(relatedOrder.total, true, true)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Description if no order */}
            {!relatedOrder && (
              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10">
                <p className="text-xs font-bold text-on-surface-variant uppercase mb-1">Descripción</p>
                <p className="text-sm font-medium text-on-background">{movement.description}</p>
              </div>
            )}

            {/* Total amount */}
            <div className={`rounded-2xl p-4 flex justify-between items-center ${movement.type === 'Egreso' || movement.type === 'Retiro' ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'}`}>
              <span className="font-bold text-sm">{movement.type === 'Egreso' || movement.type === 'Retiro' ? 'Egreso de caja' : 'Ingreso de caja'}</span>
              <span className={`text-2xl font-black ${movement.type === 'Egreso' || movement.type === 'Retiro' ? 'text-error' : 'text-green-600'}`}>
                {movement.type === 'Egreso' || movement.type === 'Retiro' ? '-' : '+'}${formatCurrency(movement.amount, true, true)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3">
            <button onClick={onClose} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">
              Cerrar
            </button>
            {ticketData && (
              <button
                onClick={() => setShowTicket(true)}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                Ver / Reimprimir Ticket
              </button>
            )}
          </div>
        </div>
      </div>

      {showTicket && ticketData && (
        <TicketPrinter ticket={ticketData} onClose={() => setShowTicket(false)} />
      )}
    </>
  );
};
