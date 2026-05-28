import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth, Order } from '../stores/useAuthStore';
import { useAdmin } from '../context/AdminContext';
import { Link, useNavigate } from 'react-router-dom';
import { MapSelector } from '../components/MapSelector';

export const Checkout: React.FC = () => {
  const { items, totalPrice, totalItems, clearCart, originalPriceSum, discountApplied, orderOfferDiscount: cartOrderOfferDiscount, stockWarnings } = useCart();
  const { user, addOrder } = useAuth();
  const { addAdminOrder, customers, applyOrderOffers, deductStockForOrder, storeStatus } = useAdmin();
  const navigate = useNavigate();
  const [isOrdered, setIsOrdered] = useState(false);
  const [stockError, setStockError] = useState<{ id: string; name: string; requested: number; available: number }[] | null>(null);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delivery method selection
  const [deliveryMethod, setDeliveryMethod] = useState<'retiro' | 'envio'>(
    (localStorage.getItem('la-martina-delivery-method') as 'retiro' | 'envio') || 'envio'
  );

  const isPickup = deliveryMethod === 'retiro';

  // Map & Address specific details
  const savedProfileAddress = user?.address || '';
  const [usingProfileAddress, setUsingProfileAddress] = useState<boolean>(!!user?.address);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryAddressLabel, setDeliveryAddressLabel] = useState<string>('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState<string>('');
  const [deliveryReference, setDeliveryReference] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    notes: '',
    paymentMethod: 'cash',
    deliveryTime: isPickup ? 'Retiro en sucursal' : 'Lo antes posible (Entrega en 30-60 min)'
  });

  const handleMethodChange = (method: 'retiro' | 'envio') => {
    setDeliveryMethod(method);
    localStorage.setItem('la-martina-delivery-method', method);
    setFormError(null);
    setFormData(prev => ({
      ...prev,
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

  const handleLocationSelected = (lat: number, lng: number, address: string) => {
    setDeliveryCoords({ lat, lng });
    setDeliveryAddressLabel(address);
    setUsingProfileAddress(false);
    setFormError(null);
    setIsMapModalOpen(false);
  };

  const handleSwitchToMapAddress = () => {
    setUsingProfileAddress(false);
    setDeliveryCoords(null);
    setDeliveryAddressLabel('');
    setDeliveryHouseNumber('');
    setDeliveryReference('');
  };

  const handleOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setStockError(null);
    setFormError(null);

    if (storeStatus?.onlineSalesPaused) {
      setFormError('Las compras online están pausadas temporalmente. ' + (storeStatus.pauseReason || 'Estamos actualizando precios o realizando mantenimiento. Volvé a intentar en unos minutos.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validation for delivery map location
    if (!isPickup) {
      // Valid if using saved profile address OR if new map coords were selected
      const hasValidAddress = usingProfileAddress && savedProfileAddress ? true : !!deliveryCoords;
      if (!hasValidAddress) {
        setFormError('Por favor, seleccioná tu ubicación en el mapa antes de continuar.');
        window.scrollTo({ top: 200, behavior: 'smooth' });
        return;
      }
      // Only require house number and reference if using the map (not saved address)
      if (!usingProfileAddress) {
        if (!deliveryHouseNumber.trim()) {
          setFormError('Por favor, ingresá el número de casa, lote o depto.');
          return;
        }
        if (!deliveryReference.trim()) {
          setFormError('Por favor, ingresá una referencia visual para guiar al repartidor.');
          return;
        }
      }
    }

    // Final stock validation before confirming
    const stockResult = deductStockForOrder(items.map(i => ({ id: i.id, quantity: i.quantity })));
    if (!stockResult.success) {
      setStockError(stockResult.insufficientItems);
      return;
    }

    const orderId = Math.random().toString(36).substr(2, 9).toUpperCase();
    const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Build address string — use saved profile address or newly selected map address
    const backwardAddressString = isPickup
      ? 'Retiro en sucursal'
      : usingProfileAddress && savedProfileAddress
        ? savedProfileAddress
        : `${deliveryAddressLabel} ${deliveryHouseNumber ? 'Nº ' + deliveryHouseNumber : ''} (${deliveryReference})`;

    // Resolve final delivery coordinates
    // If using saved profile address → use stored coords; if using new map → use deliveryCoords
    const finalLat = usingProfileAddress ? (user?.address_lat ?? null) : (deliveryCoords?.lat ?? null);
    const finalLng = usingProfileAddress ? (user?.address_lng ?? null) : (deliveryCoords?.lng ?? null);
    const finalAddressLabel = usingProfileAddress ? savedProfileAddress : deliveryAddressLabel;

    // Guardar en el historial del usuario
    const userOrder = {
      id: orderId,
      date: dateStr,
      total: finalTotal,
      itemsCount: totalItems,
      status: 'Procesando' as const,
      address: backwardAddressString,
      deliveryTime: formData.deliveryTime,
      items: [...items],
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined,
      delivery_lat: finalLat,
      delivery_lng: finalLng,
      delivery_address_label: finalAddressLabel || null,
      delivery_house_number: usingProfileAddress ? null : (deliveryHouseNumber || null),
      delivery_reference: usingProfileAddress ? null : (deliveryReference || null),
      delivery_notes: deliveryNotes || null,
      delivery_method: isPickup ? ('retiro' as const) : ('envio' as const)
    };
    addOrder(userOrder as Order);

    // Guardar en el panel de administración
    const adminOrder = {
      id: orderId,
      date: dateStr,
      timestamp: Date.now(),
      customer: formData.name || 'Cliente Anónimo',
      phone: formData.phone,
      address: backwardAddressString,
      deliveryTime: formData.deliveryTime,
      method: isPickup ? 'Retiro' : 'Envío',
      paymentMethod: formData.paymentMethod,
      paymentStatus: (formData.paymentMethod === 'transfer' ? 'Pagado' : 'Pendiente') as 'Pagado' | 'Pendiente',
      status: 'Nuevo' as const,
      total: finalTotal,
      items: items.map(i => ({ id: i.id, name: i.name, image: i.image, price: i.finalPrice ?? i.price, quantity: i.quantity, originalPrice: i.price, offerId: i.offerId, lineDiscount: i.lineDiscount, discountedQuantity: i.discountedQuantity })),
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined,
      delivery_lat: finalLat,
      delivery_lng: finalLng,
      delivery_address_label: finalAddressLabel || null,
      delivery_house_number: usingProfileAddress ? null : (deliveryHouseNumber || null),
      delivery_reference: usingProfileAddress ? null : (deliveryReference || null),
      delivery_notes: deliveryNotes || null,
      delivery_method: isPickup ? 'retiro' : 'envio'
    };
    addAdminOrder(adminOrder as any);

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
        {storeStatus?.onlineSalesPaused && (
          <div className="mb-8 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm animate-in slide-in-from-top-4">
            <div className="flex items-start">
              <span className="material-symbols-outlined text-red-500 mr-3 mt-0.5 text-2xl">block</span>
              <div>
                <h3 className="text-red-800 font-black text-lg">Las compras online están pausadas temporalmente</h3>
                <p className="text-red-700 text-sm mt-1">{storeStatus.pauseReason || 'Estamos actualizando precios o realizando mantenimiento. Volvé a intentar en unos minutos.'}</p>
                <div className="mt-4">
                  <Link to="/" className="text-sm font-bold text-red-700 bg-red-100/80 px-5 py-2.5 rounded-xl inline-flex items-center gap-2 hover:bg-red-200 transition-colors">
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Volver a la tienda
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {formError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
            <span className="material-symbols-outlined text-red-600 text-[20px]">error</span>
            <p className="text-sm font-bold text-red-700">{formError}</p>
          </div>
        )}

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
                  <input required name="name" value={formData.name} onChange={handleInputChange} type="text" placeholder="Juan Pérez" className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant">Teléfono / WhatsApp</label>
                  <div className="relative flex items-center bg-[#fcf9f8] border border-outline-variant/30 rounded-xl focus-within:border-primary transition-all overflow-hidden">
                    <span className="material-symbols-outlined pl-4 text-on-surface-variant text-[20px] shrink-0">call</span>
                    <span className="pl-2 pr-1.5 text-on-surface font-semibold text-sm shrink-0 border-r border-outline-variant/20 mr-2">+54</span>
                    <input 
                      required 
                      type="tel" 
                      placeholder="261 455 6677" 
                      value={formData.phone.startsWith('+54') ? formData.phone.substring(3) : (formData.phone.startsWith('54') ? formData.phone.substring(2) : formData.phone)} 
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData(prev => ({ ...prev, phone: val ? '+54' + val : '' }));
                      }} 
                      className="w-full bg-transparent py-3 pr-4 outline-none font-semibold text-sm" 
                    />
                  </div>
                </div>

                {!isPickup && (
                  <div className="md:col-span-2 space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-on-surface-variant block">Ubicación de Entrega (Mapa)</label>

                      {/* CASO 1: Tiene dirección guardada en el perfil y la está usando */}
                      {usingProfileAddress && savedProfileAddress ? (
                        <div className="space-y-2">
                          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex justify-between items-center gap-4">
                            <div className="flex gap-3 items-center min-w-0">
                              <span className="material-symbols-outlined text-primary shrink-0 text-3xl">home</span>
                              <div className="min-w-0">
                                <p className="text-xs text-primary font-bold uppercase tracking-wider">Dirección del perfil</p>
                                <p className="font-bold text-sm text-on-surface leading-tight mt-0.5 line-clamp-2">{savedProfileAddress}</p>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleSwitchToMapAddress}
                            className="text-red-500 text-xs font-bold hover:text-red-600 transition-colors flex items-center gap-1 pl-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            Usar otra ubicación
                          </button>
                        </div>

                      /* CASO 2: Seleccionó nueva ubicación en el mapa */
                      ) : deliveryCoords ? (
                        <div className="space-y-2">
                          <div className="bg-green-50/50 border border-green-200 rounded-2xl p-4 flex justify-between items-center gap-4 animate-in fade-in duration-300">
                            <div className="flex gap-3 items-center min-w-0">
                              <span className="material-symbols-outlined text-green-600 shrink-0 text-3xl">location_on</span>
                              <div className="min-w-0">
                                <p className="text-xs text-green-600 font-bold uppercase tracking-wider">Dirección Seleccionada</p>
                                <p className="font-bold text-sm text-on-surface truncate leading-tight mt-0.5">{deliveryAddressLabel}</p>
                                <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">Lat: {deliveryCoords.lat.toFixed(5)}, Lng: {deliveryCoords.lng.toFixed(5)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsMapModalOpen(true)}
                              className="bg-white hover:bg-green-50 border border-green-200 text-green-700 font-bold px-4 py-2.5 rounded-xl text-xs transition-all shrink-0 shadow-sm"
                            >
                              CAMBIAR
                            </button>
                          </div>
                          {/* Mostrar link para volver a dirección del perfil si tiene una */}
                          {savedProfileAddress && (
                            <button
                              type="button"
                              onClick={() => setUsingProfileAddress(true)}
                              className="text-primary/70 text-xs font-bold hover:text-primary transition-colors flex items-center gap-1 pl-1"
                            >
                              <span className="material-symbols-outlined text-[14px]">home</span>
                              Volver a mi dirección guardada
                            </button>
                          )}
                        </div>

                      /* CASO 3: Sin dirección — botón para abrir el mapa */
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsMapModalOpen(true)}
                          className="w-full bg-red-50 hover:bg-red-100/70 border border-dashed border-red-300 text-red-700 rounded-2xl p-5 font-bold text-sm flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                        >
                          <span className="material-symbols-outlined text-red-600 text-3xl animate-bounce">location_on</span>
                          <span>SELECCIONAR UBICACIÓN EN MAPA * (REQUERIDO)</span>
                          <span className="text-[10px] text-red-600/70 font-medium">Marcá tu casa en el mapa para guiar al repartidor</span>
                        </button>
                      )}
                    </div>

                    {deliveryCoords && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-in slide-in-from-top-3 duration-500">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-on-surface-variant">Número de casa / Altura / Lote *</label>
                          <input 
                            required 
                            type="text" 
                            placeholder="Ej: 145, Manzana B Lote 4" 
                            value={deliveryHouseNumber}
                            onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                            className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-on-surface-variant">Referencia visual *</label>
                          <input 
                            required 
                            type="text" 
                            placeholder="Ej: Portón negro, casa de esquina" 
                            value={deliveryReference}
                            onChange={(e) => setDeliveryReference(e.target.value)}
                            className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold" 
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <label className="text-sm font-bold text-on-surface-variant">Aclaración adicional para delivery</label>
                          <input 
                            type="text" 
                            placeholder="Ej: Timbre roto, llamar al celular al llegar" 
                            value={deliveryNotes}
                            onChange={(e) => setDeliveryNotes(e.target.value)}
                            className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-medium" 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isPickup && (
                  <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[24px] mt-0.5">storefront</span>
                      <div>
                        <p className="font-bold text-on-surface">La Martina Supermercado</p>
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
                          const endHour = slot.endHour ?? 0;
                          const endMin = slot.endMin ?? 0;
                          if (currentHour > endHour || (currentHour === endHour && currentMinutes >= endMin)) {
                            isAvailable = false;
                          }
                          const minutesUntilEnd = (endHour - currentHour) * 60 + (endMin - currentMinutes);
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
                            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${!isAvailable ? 'bg-gray-200 text-gray-400' : formData.deliveryTime.includes(slot.label) ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
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
            ) : storeStatus?.onlineSalesPaused ? (
              <div className="w-full bg-red-100 text-red-700 font-label-sm py-5 rounded-full flex justify-center items-center gap-3 cursor-not-allowed text-lg font-bold border border-red-200">
                <span className="material-symbols-outlined">block</span>
                COMPRAS PAUSADAS
              </div>
            ) : (
              <button type="submit" className="w-full bg-primary text-white font-label-sm py-5 rounded-full flex justify-center items-center gap-3 hover:bg-primary/90 transition-all shadow-xl text-lg font-bold">
                CONFIRMAR PEDIDO
                <span className="material-symbols-outlined">send</span>
              </button>
            )}
          </form>

          {/* Resumen */}
          <aside className="w-full md:w-100 sticky top-24">
            <div className="bg-white p-6 rounded-3xl shadow-md border border-outline-variant/10">
              <h3 className="text-[25px] font-bold text-on-background mb-6">Tu Pedido</h3>
              <div className="max-h-75 overflow-y-auto space-y-4 mb-6 pr-2 no-scrollbar">
                {items.map(item => (
                  <div key={item.id} className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-[#fcf9f8] rounded-lg p-1">
                      <img src={item.image} alt="" aria-hidden="true" className="w-full h-full object-contain mix-blend-multiply" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold line-clamp-1">{item.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {item.quantity} x $
                        {(item.finalPrice && item.finalPrice < item.price
                          ? item.finalPrice
                          : item.price
                        ).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-4 border-t border-outline-variant/20">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span>
                  <span>$ {originalPriceSum.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
                {activeDiscountApplied > 0 && (
                  <div className="flex justify-between text-error font-bold">
                    <span>Descuento {activeOrderOfferLabel ? `(${activeOrderOfferLabel})` : ''}</span>
                    <span>-$ {activeDiscountApplied.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-on-surface-variant">
                  <span>{isPickup ? 'Retiro' : 'Envío'}</span>
                  <span>{isPickup ? <span className="text-green-600 font-bold">Gratis</span> : `$ ${shippingCost.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}</span>
                </div>
                <div className="flex justify-between items-center pt-2 font-bold text-xl text-on-surface border-t border-dashed border-outline-variant/10">
                  <span>Total</span>
                  <span className="text-primary text-2xl">$ {finalTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {isMapModalOpen && (
        <MapSelector 
          initialLat={deliveryCoords?.lat}
          initialLng={deliveryCoords?.lng}
          onClose={() => setIsMapModalOpen(false)} 
          onLocationSelected={handleLocationSelected} 
        />
      )}
    </>
  );
};
