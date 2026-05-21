import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../stores/useAuthStore';
import { useAdmin } from '../context/AdminContext';
import { Link, useNavigate } from 'react-router-dom';

export const Checkout: React.FC = () => {
  const { items, totalPrice, totalItems, clearCart, originalPriceSum, discountApplied, orderOfferDiscount: cartOrderOfferDiscount, stockWarnings } = useCart();
  const { user, addOrder } = useAuth();
  const { addAdminOrder, customers, applyOrderOffers, deductStockForOrder } = useAdmin();
  const navigate = useNavigate();
  const [isOrdered, setIsOrdered] = useState(false);
  const [stockError, setStockError] = useState<{ id: string; name: string; requested: number; available: number }[] | null>(null);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  const [deliveryMethod, setDeliveryMethod] = useState<'retiro' | 'envio'>(
    (localStorage.getItem('la-martina-delivery-method') as 'retiro' | 'envio') || 'envio'
  );

  const isPickup = deliveryMethod === 'retiro';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: isPickup ? '' : (user?.address || ''),
    notes: '',
    paymentMethod: 'cash',
    deliveryTime: isPickup ? 'Retiro en sucursal' : 'Lo antes posible (Entrega en 30-60 min)'
  });

  const handleMethodChange = (method: 'retiro' | 'envio') => {
    setDeliveryMethod(method);
    localStorage.setItem('la-martina-delivery-method', method);
    setFormData(prev => ({
      ...prev,
      address: method === 'retiro' ? '' : (user?.address || ''),
      deliveryTime: method === 'retiro' ? 'Retiro en sucursal' : 'Lo antes posible (Entrega en 30-60 min)'
    }));
  };

  const isAsap = formData.deliveryTime.includes('Lo antes posible');
  const shippingCost = isPickup ? 0 : (items.length > 0 ? (isAsap ? 2500 : 1500) : 0);

  // Check if current phone belongs to a customer
  const currentCustomer = React.useMemo(() => {
    if (!formData.phone) return null;
    const clean = (p: string) => {
      let c = p.replace(/\D/g, '');
      if (c.startsWith('549')) c = c.substring(3);
      else if (c.startsWith('54')) c = c.substring(2);
      if (c.startsWith('0')) c = c.substring(1);
      return c;
    };
    const formPhoneClean = clean(formData.phone);
    return customers.find(c => clean(c.phone) === formPhoneClean);
  }, [customers, formData.phone]);

  const hasCuentaCorriente = currentCustomer?.hasCurrentAccount;

  // Dynamic order offers recalculation based on the phone typed at checkout
  const subtotalAfterItemDiscounts = totalPrice + cartOrderOfferDiscount;
  const orderOffer = React.useMemo(() => {
    return applyOrderOffers(subtotalAfterItemDiscounts, currentCustomer);
  }, [subtotalAfterItemDiscounts, currentCustomer, applyOrderOffers]);

  const activeOrderOfferDiscount = orderOffer.discountAmount;
  const activeOrderOfferLabel = orderOffer.offerLabel;

  const activeTotalPrice = subtotalAfterItemDiscounts - activeOrderOfferDiscount;
  const activeDiscountApplied = originalPriceSum - activeTotalPrice;
  const finalTotal = activeTotalPrice + shippingCost;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const confirmMapLocation = () => {
    if (!formData.address) {
      setFormData(prev => ({ ...prev, address: 'Ubicación seleccionada en mapa (La Paz, Mendoza)' }));
    }
    setIsMapModalOpen(false);
  };

  const handleOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setStockError(null);

    // Final stock validation before confirming
    const stockResult = deductStockForOrder(items.map(i => ({ id: i.id, quantity: i.quantity })));
    if (!stockResult.success) {
      setStockError(stockResult.insufficientItems);
      return;
    }

    const orderId = Math.random().toString(36).substr(2, 9).toUpperCase();
    const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Guardar en el historial del usuario
    const userOrder = {
      id: orderId,
      date: dateStr,
      total: finalTotal,
      itemsCount: totalItems,
      status: 'Procesando' as const,
      address: formData.address,
      deliveryTime: formData.deliveryTime,
      items: [...items],
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined
    };
    addOrder(userOrder);

    // Guardar en el panel de administración
    const adminOrder = {
      id: orderId,
      date: dateStr,
      timestamp: Date.now(),
      customer: formData.name || 'Cliente Anónimo',
      phone: formData.phone,
      address: formData.address,
      deliveryTime: formData.deliveryTime,
      method: isPickup ? 'Retiro' : 'Envío',
      paymentMethod: formData.paymentMethod,
      paymentStatus: (formData.paymentMethod === 'transfer' ? 'Pagado' : 'Pendiente') as 'Pagado' | 'Pendiente',
      status: 'Nuevo' as const,
      total: finalTotal,
      items: items.map(i => ({ id: i.id, name: i.name, image: i.image, price: i.finalPrice ?? i.price, quantity: i.quantity })),
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined
    };
    addAdminOrder(adminOrder);

    setIsOrdered(true);

    setTimeout(() => {
      clearCart();
    }, 1000);
  };

  if (isOrdered) {
    return (
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-20 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-6xl">check_circle</span>
        </div>
        <h1 className="font-display-xl font-bold text-on-surface mb-2">¡Pedido Confirmado!</h1>
        <p className="text-on-surface-variant mb-8 max-w-sm">
          Gracias {formData.name}, hemos recibido tu pedido. En breve nos comunicaremos con vos al {formData.phone} para coordinar {isPickup ? 'el retiro' : 'la entrega'}.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Link 
            to="/" 
            className="bg-primary text-white font-bold py-4 rounded-2xl flex justify-center items-center hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-on-surface-variant">No hay productos para procesar.</p>
        <Link to="/" className="bg-primary text-white px-8 py-3 rounded-full font-bold">Volver a la tienda</Link>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-[25px] font-bold text-on-background mb-2">Finalizar Compra</h1>
          <p className="text-on-surface-variant text-base">Completá tus datos para finalizar el pedido.</p>

          <div className="mt-8 flex justify-center md:justify-start">
            <div className="inline-flex bg-surface-container-low p-1 rounded-2xl border border-outline-variant/10">
              <button
                type="button"
                onClick={() => handleMethodChange('envio')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${!isPickup ? 'bg-white text-primary shadow-sm border border-primary/10' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                Envío a domicilio
              </button>
              <button
                type="button"
                onClick={() => handleMethodChange('retiro')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isPickup ? 'bg-white text-green-600 shadow-sm border border-green-200' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <span className="material-symbols-outlined text-[18px]">storefront</span>
                Retiro en sucursal
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-12 items-start">
          <form onSubmit={handleOrder} className="flex-1 w-full space-y-8">
            {/* Paso 1: Datos */}
            <section className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">1</span>
                <h2 className="text-[25px] font-bold text-on-background">{isPickup ? 'Datos de Contacto' : 'Datos de Entrega'}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant">Nombre Completo</label>
                  <input required name="name" value={formData.name} onChange={handleInputChange} type="text" placeholder="Juan Pérez" className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant">Teléfono / WhatsApp</label>
                  <input required name="phone" value={formData.phone} onChange={handleInputChange} type="tel" placeholder="261 455 6677" className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all" />
                </div>
                {!isPickup && (
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-sm font-bold text-on-surface-variant">Dirección de Entrega</label>
                    <div className="relative">
                      <input required name="address" value={formData.address} onChange={handleInputChange} type="text" placeholder="Calle, Número, Departamento..." className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all" />
                      <button type="button" onClick={() => setIsMapModalOpen(true)} className="mt-2 text-primary text-sm font-bold flex items-center gap-1 hover:underline px-1">
                        <span className="material-symbols-outlined text-[18px]">map</span>
                        Seleccionar en mapa
                      </button>
                    </div>
                  </div>
                )}
                {isPickup && (
                  <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[24px] mt-0.5">storefront</span>
                      <div>
                        <p className="font-bold text-on-surface">Martina Supermercado</p>
                        <p className="text-sm text-on-surface-variant">La Paz, Mendoza</p>
                        <p className="text-xs text-on-surface-variant mt-1">Horario: Lunes a Sábados 8:00 - 21:00</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="md:col-span-2 space-y-4">
                  <label className="text-sm font-bold text-on-surface-variant">{isPickup ? 'Horario de Retiro' : 'Horario de Entrega'}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(() => {
                      const now = new Date();
                      const currentHour = now.getHours();
                      const currentMinutes = now.getMinutes();

                      const slots = [
                        { id: 'asap', label: 'Lo antes posible', sub: '30-60 min', icon: 'bolt', endHour: 24, endMin: 0 },
                        { id: 'today_midday', label: 'Hoy al Mediodía', sub: '13:00 a 14:00', icon: 'sunny', endHour: 14, endMin: 0 },
                        { id: 'today_2', label: 'Hoy a la Noche', sub: '21:00 a 22:00', icon: 'dark_mode', endHour: 22, endMin: 0 },
                        { id: 'tomorrow_1', label: 'Mañana al Mediodía', sub: '13:00 a 14:00', icon: 'event', isTomorrow: true }
                      ];

                      return slots.map(slot => {
                        // Lógica de disponibilidad
                        let isAvailable = true;
                        if (!slot.isTomorrow && slot.id !== 'asap') {
                          if (currentHour > slot.endHour || (currentHour === slot.endHour && currentMinutes >= slot.endMin)) {
                            isAvailable = false;
                          }
                          const minutesUntilEnd = (slot.endHour - currentHour) * 60 + (slot.endMin - currentMinutes);
                          if (minutesUntilEnd < 15) {
                            isAvailable = false;
                          }
                        }

                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => setFormData(prev => ({ ...prev, deliveryTime: `${slot.label} (${slot.sub})` }))}
                            className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 text-left transition-all relative ${!isAvailable
                              ? 'opacity-40 grayscale cursor-not-allowed border-outline-variant/5 bg-surface-container-low'
                              : formData.deliveryTime.includes(slot.label)
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-outline-variant/10 hover:bg-surface-container-low'
                              }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${!isAvailable ? 'bg-gray-200 text-gray-400' : formData.deliveryTime.includes(slot.label) ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                              <span className="material-symbols-outlined text-[18px]">{slot.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-bold text-[13px] truncate">{slot.label}</p>
                                {slot.id === 'asap' && isAvailable && !isPickup && (
                                  <span className="text-[9px] font-bold bg-error/10 text-error px-1.5 py-0.5 rounded-full shrink-0">
                                    +$1k
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-on-surface-variant leading-tight">{slot.sub}</p>
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </section>

            {/* Paso 2: Pago */}
            <section className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">2</span>
                <h2 className="text-[25px] font-bold text-on-background">Método de Pago</h2>
              </div>
              <div className="space-y-4">
                {[
                  { id: 'cash', label: isPickup ? 'Efectivo en sucursal' : 'Efectivo al recibir', icon: 'payments' },
                  { id: 'card', label: isPickup ? 'Tarjeta en sucursal' : 'Tarjeta (Posnet al recibir)', icon: 'credit_card' },
                  { id: 'transfer', label: 'Transferencia Bancaria', icon: 'account_balance' },
                  ...(hasCuentaCorriente ? [{ id: 'cuenta_corriente', label: 'Anotar en Cuenta Corriente', icon: 'menu_book' }] : [])
                ].map(method => (
                  <label key={method.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.paymentMethod === method.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container-low'}`}>
                    <input type="radio" name="paymentMethod" value={method.id} checked={formData.paymentMethod === method.id} onChange={handleInputChange} className="hidden" />
                    <span className={`material-symbols-outlined ${formData.paymentMethod === method.id ? 'text-primary' : 'text-on-surface-variant'}`}>{method.icon}</span>
                    <span className="font-bold flex-1">{method.label}</span>
                    {formData.paymentMethod === method.id && <span className="material-symbols-outlined text-primary">check_circle</span>}
                  </label>
                ))}
              </div>
            </section>

            {/* Stock error alert */}
            {stockError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-red-600 text-[20px]">error</span>
                  <p className="text-sm font-bold text-red-700">No hay suficiente stock para completar tu pedido</p>
                </div>
                {stockError.map(err => (
                  <p key={err.id} className="text-xs text-red-600 ml-7">
                    • {err.name}: pediste {err.requested}, solo {err.available === 0 ? 'no hay stock' : `quedan ${err.available}`}
                  </p>
                ))}
                <p className="text-xs text-red-500 mt-2 ml-7 font-medium">Volvé al carrito y ajustá las cantidades.</p>
              </div>
            )}

            {stockWarnings.length > 0 ? (
              <div className="w-full bg-gray-300 text-gray-500 font-label-sm py-5 rounded-full flex justify-center items-center gap-3 cursor-not-allowed text-lg font-bold">
                <span className="material-symbols-outlined">warning</span>
                AJUSTÁ LAS CANTIDADES
              </div>
            ) : (
              <button type="submit" className="w-full bg-primary text-white font-label-sm py-5 rounded-full flex justify-center items-center gap-3 hover:bg-primary/90 transition-all shadow-xl text-lg font-bold">
                CONFIRMAR PEDIDO
                <span className="material-symbols-outlined">send</span>
              </button>
            )}
          </form>

          {/* Resumen */}
          <aside className="w-full md:w-[400px] sticky top-24">
            <div className="bg-white p-6 rounded-3xl shadow-md border border-outline-variant/10">
              <h3 className="text-[25px] font-bold text-on-background mb-6">Tu Pedido</h3>
              <div className="max-h-[300px] overflow-y-auto space-y-4 mb-6 pr-2 no-scrollbar">
                {items.map(item => (
                  <div key={item.id} className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-[#fcf9f8] rounded-lg p-1">
                      <img src={item.image} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold line-clamp-1">{item.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {item.quantity} x $
                        {(item.finalPrice && item.finalPrice < item.price
                          ? item.finalPrice
                          : item.price
                        ).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-4 border-t border-outline-variant/20">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span>
                  <span>$ {originalPriceSum.toLocaleString('es-AR')}</span>
                </div>
                {activeDiscountApplied > 0 && (
                  <div className="flex justify-between text-error font-bold">
                    <span>Descuento {activeOrderOfferLabel ? `(${activeOrderOfferLabel})` : ''}</span>
                    <span>-$ {activeDiscountApplied.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div className="flex justify-between text-on-surface-variant">
                  <span>{isPickup ? 'Retiro' : 'Envío'}</span>
                  <span>{isPickup ? <span className="text-green-600 font-bold">Gratis</span> : `$ ${shippingCost.toLocaleString('es-AR')}`}</span>
                </div>
                <div className="flex justify-between items-center pt-2 font-bold text-xl text-on-surface border-t border-dashed border-outline-variant/10">
                  <span>Total</span>
                  <span className="text-primary text-2xl">$ {finalTotal.toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <MapModal isOpen={isMapModalOpen} onClose={() => setIsMapModalOpen(false)} onConfirm={confirmMapLocation} />
    </>
  );
};

const MapModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-on-background/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
          <h3 className="text-xl font-bold">Seleccioná tu ubicación</h3>
          <button onClick={onClose} className="hover:bg-surface-container-high p-2 rounded-full transition-colors"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="h-[400px] bg-surface-container-low relative">
          <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3345.8340798739953!2d-67.5539972!3d-33.4588047!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x967f5d9a53d32efb%3A0x20989bacf6605d80!2sMartina%20supermercado!5e0!3m2!1ses-419!2sar!4v1714567890123!5m2!1ses-419!2sar" width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy"></iframe>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative mb-8"><span className="material-symbols-outlined text-primary text-5xl drop-shadow-md animate-bounce">location_on</span><div className="w-4 h-1 bg-black/20 rounded-full blur-sm absolute -bottom-1 left-1/2 -translate-x-1/2 scale-x-150"></div></div>
          </div>
        </div>
        <div className="p-6 bg-surface-container-lowest flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant flex items-center gap-2 bg-primary/5 p-3 rounded-xl border border-primary/10"><span className="material-symbols-outlined text-primary">info</span>Arrastrá el mapa hasta que el pin rojo esté sobre tu domicilio.</p>
          <button onClick={onConfirm} className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 transition-all shadow-md">CONFIRMAR UBICACIÓN</button>
        </div>
      </div>
    </div>
  );
};
