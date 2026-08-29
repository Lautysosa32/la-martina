import React, { useState, useEffect, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth, Order } from '../stores/useAuthStore';
import { useAdmin } from '../context/AdminContext';
import { Link, useNavigate } from 'react-router-dom';
import { MapSelector } from '../components/MapSelector';
import { whatsappMessageService } from '../services/whatsapp-message.service';
import { upsertCustomerProfile } from '../services/admin.service';
import { checkCustomerOverdueDebt } from '../utils/billing-cycle';
import { calculateDistanceKm, calculateShippingCost } from '../utils/shipping';

export const Checkout: React.FC = () => {
  const { items, totalPrice, totalItems, clearCart, originalPriceSum, discountApplied, orderOfferDiscount: cartOrderOfferDiscount, stockWarnings } = useCart();
  const { user, addOrder, updateUser, customerProfile } = useAuth();
  const { addAdminOrder, customers, orders, applyOrderOffers, deductStockForOrder, storeStatus, generalConfig, isPhoneBlocked, currentAccountConfig, formatCurrency } = useAdmin();
  const navigate = useNavigate();
  const [isOrdered, setIsOrdered] = useState(false);
  const [confirmedName, setConfirmedName] = useState('');
  const [stockError, setStockError] = useState<{ id: string; name: string; requested: number; available: number }[] | null>(null);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delivery method selection
  const [deliveryMethod, setDeliveryMethod] = useState<'retiro' | 'envio'>(
    (localStorage.getItem('la-martina-delivery-method') as 'retiro' | 'envio') || 'envio'
  );

  const isPickup = deliveryMethod === 'retiro';

  // Map & Address specific details (load last used from local storage if available)
  const getLastLocation = () => {
    try {
      const data = localStorage.getItem('la_martina_last_delivery_location');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  };
  const lastSavedLoc = getLastLocation();

  const savedProfileAddress = user?.address || '';
  const [usingProfileAddress, setUsingProfileAddress] = useState<boolean>(!!user?.address && !lastSavedLoc);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(
    lastSavedLoc?.coords || null
  );
  const [deliveryAddressLabel, setDeliveryAddressLabel] = useState<string>(
    lastSavedLoc?.addressLabel || ''
  );
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState<string>(
    lastSavedLoc?.houseNumber || ''
  );
  const [deliveryReference, setDeliveryReference] = useState<string>(
    lastSavedLoc?.reference || ''
  );

  const saveLastDeliveryLocation = (coords: any, label: string, houseNum: string, ref: string) => {
    try {
      localStorage.setItem('la_martina_last_delivery_location', JSON.stringify({
        coords,
        addressLabel: label,
        houseNumber: houseNum,
        reference: ref
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const initialName = (user?.name && user.name !== 'Invitado' && user.name !== 'Sin Nombre') ? user.name : '';
  const [formData, setFormData] = useState({
    name: initialName,
    phone: user?.phone || '',
    notes: '',
    paymentMethod: 'cash',
    deliveryTime: isPickup ? 'Retiro en sucursal' : 'Lo antes posible (Entrega en 30-60 min)'
  });

  // Clean and format helper functions
  const cleanPhone = (p: string) => {
    let c = (p || '').replace(/\D/g, '');
    if (c.startsWith('549')) c = c.substring(3);
    else if (c.startsWith('54')) c = c.substring(2);
    if (c.startsWith('0')) c = c.substring(1);
    return c;
  };

  const cleanDni = (d: string) => (d || '').replace(/\D/g, '');

  // ─── Trusted Device & OTP Verification ───────────────────────
  const getDeviceVerifiedPhones = (): string[] => {
    try {
      const stored = localStorage.getItem('la_martina_verified_phones');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const addDeviceVerifiedPhone = (p: string) => {
    const clean = cleanPhone(p);
    if (!clean) return;
    const list = getDeviceVerifiedPhones();
    if (!list.includes(clean)) {
      list.push(clean);
      localStorage.setItem('la_martina_verified_phones', JSON.stringify(list));
    }
  };

  const [otpCodeSent, setOtpCodeSent] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [deviceVerifiedManually, setDeviceVerifiedManually] = useState(false);

  // Check if current phone is verified in this device
  const isPhoneVerifiedOnDevice = useMemo(() => {
    const clean = cleanPhone(formData.phone);
    if (!clean || clean.length < 8) return false;
    return getDeviceVerifiedPhones().includes(clean);
  }, [formData.phone]);

  const isPhoneEffectiveVerified = isPhoneVerifiedOnDevice || deviceVerifiedManually;

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Reset manual verification when phone changes
  useEffect(() => {
    setDeviceVerifiedManually(false);
    setOtpCodeSent(null);
    setOtpInput('');
    setOtpError(null);
    setOtpSuccess(null);
  }, [formData.phone]);

  const handleSendOtp = async () => {
    setOtpError(null);
    setOtpSuccess(null);
    const phoneDigits = cleanPhone(formData.phone);
    if (!phoneDigits || phoneDigits.length < 8) {
      setOtpError('Ingresá un número de celular válido con código de área.');
      return;
    }

    if (isPhoneBlocked(phoneDigits)) {
      setOtpError('No se pueden procesar pedidos con este número de teléfono.');
      return;
    }

    setIsSendingOtp(true);
    const generated = Math.floor(1000 + Math.random() * 9000).toString(); // 4 dígitos
    setOtpCodeSent(generated);

    try {
      await whatsappMessageService.createOtpMessage(phoneDigits, generated, formData.name);
      setOtpSuccess('¡Código enviado por WhatsApp! Revisá tus mensajes.');
      setOtpCountdown(60);
    } catch (err) {
      console.error('Error enviando OTP:', err);
      setOtpError('Error enviando código de verificación. Reintentá en unos momentos.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = () => {
    setOtpError(null);
    if (!otpInput || otpInput.trim().length !== 4) {
      setOtpError('Ingresá el código de 4 dígitos.');
      return;
    }
    if (otpInput.trim() === otpCodeSent) {
      addDeviceVerifiedPhone(formData.phone);
      setDeviceVerifiedManually(true);
      setOtpSuccess('¡Número verificado correctamente en este dispositivo!');
      setOtpError(null);
    } else {
      setOtpError('El código ingresado es incorrecto.');
    }
  };

  // Check if current phone belongs to a registered customer
  const currentCustomer = useMemo(() => {
    if (!formData.phone) return null;
    const formPhoneClean = cleanPhone(formData.phone);
    if (!formPhoneClean) return null;
    return customers.find(c => cleanPhone(c.phone) === formPhoneClean) || null;
  }, [customers, formData.phone]);

  const hasCuentaCorriente = !!currentCustomer?.hasCurrentAccount;
  const isRegisteredCustomer = !!(currentCustomer && currentCustomer.name && currentCustomer.name !== 'Invitado' && currentCustomer.name !== 'Sin Nombre');

  // ─── Distance & Coverage Zone Check ──────────────────────────
  const storeLat = generalConfig.storeLat ?? -33.459009;
  const storeLng = generalConfig.storeLng ?? -67.551826;
  const maxRadiusKm = generalConfig.deliveryRadiusKm ?? 5;

  const currentDistanceKm = useMemo(() => {
    if (isPickup) return 0;
    const lat = usingProfileAddress ? user?.address_lat : deliveryCoords?.lat;
    const lng = usingProfileAddress ? user?.address_lng : deliveryCoords?.lng;
    if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
    return calculateDistanceKm(storeLat, storeLng, lat, lng);
  }, [isPickup, usingProfileAddress, user, deliveryCoords, storeLat, storeLng]);

  const isOutsideCoverage = useMemo(() => {
    if (isPickup || currentDistanceKm === null) return false;
    return currentDistanceKm > maxRadiusKm;
  }, [isPickup, currentDistanceKm, maxRadiusKm]);

  // Dynamic order offers recalculation based on the phone typed at checkout
  const subtotalAfterItemDiscounts = totalPrice + cartOrderOfferDiscount;
  const orderOffer = React.useMemo(() => {
    return applyOrderOffers(subtotalAfterItemDiscounts, currentCustomer);
  }, [subtotalAfterItemDiscounts, currentCustomer, applyOrderOffers]);

  const activeOrderOfferDiscount = orderOffer.discountAmount;
  const activeOrderOfferLabel = orderOffer.offerLabel;

  const activeTotalPrice = subtotalAfterItemDiscounts - activeOrderOfferDiscount;
  const activeDiscountApplied = originalPriceSum - activeTotalPrice;

  // Dynamic shipping calculation based on distance
  const shippingCalculation = useMemo(() => {
    return calculateShippingCost({
      distanceKm: currentDistanceKm,
      cartTotal: activeTotalPrice,
      baseCost: generalConfig.shippingBaseCost ?? 1000,
      costPerKm: generalConfig.shippingCostPerKm ?? 400,
      freeShippingMinAmount: generalConfig.freeShippingMinAmount ?? 0,
      isPickup
    });
  }, [currentDistanceKm, activeTotalPrice, generalConfig, isPickup]);

  const shippingCost = shippingCalculation.cost;
  const finalTotal = activeTotalPrice + shippingCost;

  // Cuenta Corriente Validations (Temporal Overdue & Monetary Limit including Shipping)
  const ccOverdueStatus = useMemo(() => {
    if (!formData.phone || !currentCustomer?.hasCurrentAccount) {
      return { isOverdue: false, overdueDebt: 0, oldestDueDate: null, oldestOrderDate: null };
    }
    return checkCustomerOverdueDebt(formData.phone, orders);
  }, [formData.phone, currentCustomer, orders]);

  const effectiveCcAmountLimit = useMemo(() => {
    if (!currentCustomer) return currentAccountConfig.maxDebtAmount;
    return currentCustomer.useCustomAccountLimits
      ? (currentCustomer.customDebtLimit ?? currentAccountConfig.maxDebtAmount)
      : currentAccountConfig.maxDebtAmount;
  }, [currentCustomer, currentAccountConfig]);

  const currentCustomerDebt = currentCustomer?.currentDebt || 0;
  const potentialTotalCcDebt = currentCustomerDebt + finalTotal;
  const isCcExceedingAmount = potentialTotalCcDebt > effectiveCcAmountLimit;

  // Cuenta Corriente DNI validation state
  const [ccDniInput, setCcDniInput] = useState('');
  const [isCcValidated, setIsCcValidated] = useState(false);
  const [ccValidationError, setCcValidationError] = useState<string | null>(null);

  // Reset CC validation when phone number changes
  useEffect(() => {
    setIsCcValidated(false);
    setCcValidationError(null);
    setCcDniInput('');
    setFormData(prev => {
      if (prev.paymentMethod === 'cuenta_corriente') {
        return { ...prev, paymentMethod: 'cash' };
      }
      return prev;
    });
  }, [formData.phone]);

  const handleValidateDniForCC = () => {
    setCcValidationError(null);
    const enteredDigits = cleanDni(ccDniInput);
    if (!enteredDigits) {
      setCcValidationError('Por favor ingresá tu número de DNI para validar tu cuenta.');
      return;
    }
    if (!currentCustomer) {
      setCcValidationError('No se encontró una cuenta de cliente asociada a este número de teléfono.');
      return;
    }
    if (!currentCustomer.hasCurrentAccount) {
      setCcValidationError('Este cliente no tiene habilitada la opción de Cuenta Corriente.');
      return;
    }
    const registeredDigits = cleanDni(currentCustomer.dni || '');
    if (!registeredDigits) {
      setCcValidationError('Tu cuenta corriente no tiene un DNI registrado. Por favor comunicate con el local para asociarlo.');
      return;
    }

    if (enteredDigits === registeredDigits) {
      if (ccOverdueStatus.isOverdue) {
        setIsCcValidated(false);
        const dueFormatted = ccOverdueStatus.oldestDueDate ? ccOverdueStatus.oldestDueDate.toLocaleDateString('es-AR') : 'el día 10';
        setCcValidationError(`Tu Cuenta Corriente está pausada por saldo vencido ($${formatCurrency(ccOverdueStatus.overdueDebt, true, true)} - venció el ${dueFormatted}). Regularizá tu saldo en el local o elegí otro medio de pago.`);
        setFormData(prev => ({ ...prev, paymentMethod: 'cash' }));
        return;
      }

      setIsCcValidated(true);
      setCcValidationError(null);
      setFormData(prev => ({ ...prev, paymentMethod: 'cuenta_corriente' }));
    } else {
      setIsCcValidated(false);
      setCcValidationError('El DNI ingresado no coincide con el titular registrado.');
      setFormData(prev => {
        if (prev.paymentMethod === 'cuenta_corriente') {
          return { ...prev, paymentMethod: 'cash' };
        }
        return prev;
      });
    }
  };

  const handleMethodChange = (method: 'retiro' | 'envio') => {
    setDeliveryMethod(method);
    localStorage.setItem('la-martina-delivery-method', method);
    setFormError(null);
    setFormData(prev => ({
      ...prev,
      deliveryTime: method === 'retiro' ? 'Retiro en sucursal' : 'Lo antes posible (Entrega en 30-60 min)'
    }));
  };

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
    saveLastDeliveryLocation({ lat, lng }, address, deliveryHouseNumber, deliveryReference);
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

    // Name resolution: prioritize existing registered customer in database
    const finalCustomerName = isRegisteredCustomer
      ? currentCustomer.name
      : formData.name.trim();

    if (!finalCustomerName) {
      setFormError('Por favor, ingresá tu nombre completo antes de continuar.');
      window.scrollTo({ top: 200, behavior: 'smooth' });
      return;
    }

    // Phone blocklist validation
    const cleanP = cleanPhone(formData.phone);
    if (isPhoneBlocked(cleanP)) {
      setFormError('No es posible procesar este pedido con este número de contacto.');
      window.scrollTo({ top: 200, behavior: 'smooth' });
      return;
    }

    // Phone OTP validation (device-based trust)
    if (!isPhoneEffectiveVerified) {
      setFormError('Debés verificar tu número de WhatsApp antes de confirmar tu pedido.');
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    // Coverage Zone Validation
    if (!isPickup && isOutsideCoverage) {
      setFormError(`La ubicación seleccionada está fuera de nuestro radio de entrega (${maxRadiusKm} km). Podés optar por 'Retiro en sucursal'.`);
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    // Validation for Cuenta Corriente
    if (formData.paymentMethod === 'cuenta_corriente') {
      const enteredDigits = cleanDni(ccDniInput);
      const registeredDigits = cleanDni(currentCustomer?.dni || '');
      if (!isCcValidated || !currentCustomer?.hasCurrentAccount || !enteredDigits || enteredDigits !== registeredDigits) {
        setFormError('Debés validar tu DNI antes de confirmar un pedido con Cuenta Corriente.');
        window.scrollTo({ top: 400, behavior: 'smooth' });
        return;
      }

      if (ccOverdueStatus.isOverdue) {
        setFormError(`Tu Cuenta Corriente tiene un saldo vencido de $${formatCurrency(ccOverdueStatus.overdueDebt, true, true)}. No es posible realizar pedidos a cuenta hasta regularizar el pago en el local.`);
        window.scrollTo({ top: 400, behavior: 'smooth' });
        return;
      }

      if (isCcExceedingAmount) {
        setFormError(`El pedido ($${formatCurrency(finalTotal, true, true)}) supera tu límite disponible de Cuenta Corriente ($${formatCurrency(effectiveCcAmountLimit, true, true)}). Por favor reducí las cantidades en el carrito o seleccioná otro método de pago.`);
        window.scrollTo({ top: 400, behavior: 'smooth' });
        return;
      }
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

    // Resolve final delivery coordinates
    const finalLat = usingProfileAddress ? (user?.address_lat ?? null) : (deliveryCoords?.lat ?? null);
    const finalLng = usingProfileAddress ? (user?.address_lng ?? null) : (deliveryCoords?.lng ?? null);
    const finalAddressLabel = usingProfileAddress ? savedProfileAddress : deliveryAddressLabel;
    const validatedDni = isCcValidated ? cleanDni(currentCustomer?.dni || ccDniInput) : (currentCustomer?.dni || undefined);

    const orderNotes = formData.notes?.trim() || null;

    // Build address string — use saved profile address or newly selected map address
    const backwardAddressString = isPickup
      ? 'Retiro en sucursal'
      : usingProfileAddress && savedProfileAddress
        ? [
            savedProfileAddress,
            orderNotes ? `[NOTAS:${orderNotes}]` : '',
            (finalLat && finalLng) ? `[GEO:${finalLat},${finalLng}]` : ''
          ].filter(Boolean).join(' ')
        : [
            deliveryAddressLabel,
            deliveryHouseNumber?.trim() ? `[ALTURA:${deliveryHouseNumber.trim()}]` : '',
            deliveryReference?.trim() ? `[REF:${deliveryReference.trim()}]` : '',
            orderNotes ? `[NOTAS:${orderNotes}]` : '',
            (finalLat && finalLng) ? `[GEO:${finalLat},${finalLng}]` : ''
          ].filter(Boolean).join(' ');

    // Guardar en el historial del usuario
    const userOrder = {
      id: orderId,
      date: dateStr,
      timestamp: Date.now(),
      total: finalTotal,
      itemsCount: totalItems,
      status: 'Procesando' as const,
      address: backwardAddressString,
      deliveryTime: formData.deliveryTime,
      items: [...items],
      phone: formData.phone,
      dni: validatedDni,
      notes: orderNotes,
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined,
      delivery_lat: finalLat,
      delivery_lng: finalLng,
      delivery_address_label: finalAddressLabel || null,
      delivery_house_number: usingProfileAddress ? null : (deliveryHouseNumber?.trim() || null),
      delivery_reference: usingProfileAddress ? null : (deliveryReference?.trim() || null),
      delivery_notes: orderNotes,
      delivery_method: isPickup ? ('retiro' as const) : ('envio' as const)
    };
    addOrder(userOrder as Order);

    // Guardar en el panel de administración
    const adminOrder = {
      id: orderId,
      date: dateStr,
      timestamp: Date.now(),
      customer: finalCustomerName,
      phone: formData.phone,
      dni: validatedDni,
      address: backwardAddressString,
      deliveryTime: formData.deliveryTime,
      method: isPickup ? 'Retiro' : 'Envío',
      paymentMethod: formData.paymentMethod,
      paymentStatus: (formData.paymentMethod === 'transfer' ? 'Pagado' : 'Pendiente') as 'Pagado' | 'Pendiente',
      status: 'Nuevo' as const,
      total: finalTotal,
      items: items.map(i => ({ id: i.id, name: i.name, image: i.image, price: i.finalPrice ?? i.price, quantity: i.quantity, originalPrice: i.price, offerId: i.offerId, lineDiscount: i.lineDiscount, discountedQuantity: i.discountedQuantity })),
      notes: orderNotes,
      discount: activeOrderOfferDiscount,
      discountLabel: activeOrderOfferLabel || undefined,
      delivery_lat: finalLat,
      delivery_lng: finalLng,
      delivery_address_label: finalAddressLabel || null,
      delivery_house_number: usingProfileAddress ? null : (deliveryHouseNumber?.trim() || null),
      delivery_reference: usingProfileAddress ? null : (deliveryReference?.trim() || null),
      delivery_notes: orderNotes,
      delivery_method: isPickup ? 'retiro' : 'envio'
    };
    addAdminOrder(adminOrder as any);

    // Auto-crear cliente verificado en la base de datos si es invitado nuevo
    if (cleanP && !currentCustomer) {
      const parts = finalCustomerName.trim().split(' ');
      const firstName = parts[0] || finalCustomerName;
      const lastName = parts.slice(1).join(' ') || '';
      upsertCustomerProfile({
        user_id: customerProfile?.user_id || `guest_${cleanP}`,
        phone: cleanP,
        name: firstName,
        last_name: lastName,
        address: backwardAddressString,
        address_lat: finalLat,
        address_lng: finalLng,
        branch_id: 'main',
        active: true,
        dni: validatedDni || cleanP
      } as any).catch(console.error);
    }

    // Guardar última ubicación en localStorage para futuros pedidos
    if (!isPickup && finalLat && finalLng) {
      saveLastDeliveryLocation(
        { lat: finalLat, lng: finalLng },
        finalAddressLabel || '',
        deliveryHouseNumber,
        deliveryReference
      );
    }

    // Guardar datos en perfil local del invitado si aplica
    updateUser({ name: finalCustomerName, phone: formData.phone });
    setConfirmedName(finalCustomerName);
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
          Gracias {confirmedName || formData.name}, hemos recibido tu pedido. En breve nos comunicaremos con vos al {formData.phone} para coordinar {isPickup ? 'el retiro' : 'la entrega'}.
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
                  <div className="h-6 flex items-center">
                    <label className="text-sm font-bold text-on-surface-variant">Nombre Completo</label>
                  </div>
                  <input required name="name" value={formData.name} onChange={handleInputChange} type="text" placeholder="Juan Pérez" className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold" />
                </div>
                <div className="space-y-2">
                  <div className="h-6 flex justify-between items-center">
                    <label className="text-sm font-bold text-on-surface-variant">Teléfono / WhatsApp</label>
                    {isPhoneEffectiveVerified && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 inline-flex items-center gap-1 shrink-0">
                        <span className="material-symbols-outlined text-[13px]">verified</span>
                        Verificado
                      </span>
                    )}
                  </div>
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

                {/* OTP Verification Block (si el número no está verificado en este dispositivo) */}
                {!isPhoneEffectiveVerified && cleanPhone(formData.phone).length >= 8 && (
                  <div className="md:col-span-2 bg-amber-50/70 border border-amber-200 rounded-2xl p-4 md:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[20px]">security</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-amber-950">Verificación de seguridad requerida</p>
                        <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                          Para proteger tu pedido, te enviaremos un código de 4 dígitos por WhatsApp. Una vez verificado, este dispositivo quedará autorizado para futuras compras.
                        </p>
                      </div>
                    </div>

                    {!otpCodeSent ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp}
                          className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">chat</span>
                          {isSendingOtp ? 'Enviando código...' : 'Solicitar código por WhatsApp'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="Código 4 dígitos"
                            value={otpInput}
                            onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleVerifyOtp();
                              }
                            }}
                            className="bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 font-mono text-center tracking-[0.3em] font-black text-base outline-none focus:border-amber-600 sm:w-44"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpCountdown > 0 || isSendingOtp}
                            className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-4 py-2.5 rounded-xl text-xs transition-all disabled:opacity-50 text-center"
                          >
                            {otpCountdown > 0 ? `Reenviar (${otpCountdown}s)` : 'Reenviar código'}
                          </button>
                        </div>
                      </div>
                    )}

                    {otpError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700 animate-in fade-in duration-200">
                        <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                        <p>{otpError}</p>
                      </div>
                    )}

                    {otpSuccess && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs font-bold text-green-700 animate-in fade-in duration-200">
                        <span className="material-symbols-outlined text-[16px] shrink-0">check_circle</span>
                        <p>{otpSuccess}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Badge if registered customer is detected by phone */}
                {isRegisteredCustomer && (
                  <div className="md:col-span-2 bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in duration-300">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-[20px]">person_check</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary uppercase tracking-wider">Cliente Registrado Identificado</p>
                      <p className="font-bold text-sm text-on-surface truncate">
                        {currentCustomer.name}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Tu pedido se registrará automáticamente a este nombre.
                      </p>
                    </div>
                  </div>
                )}

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
                                {currentDistanceKm !== null && (
                                  <p className="text-xs font-bold text-primary mt-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[15px]">near_me</span>
                                    A {currentDistanceKm.toFixed(1)} km del local • Envío: {shippingCalculation.isFreeShipping ? '¡Gratis (Promoción)!' : `$${shippingCost.toLocaleString('es-AR')}`}
                                  </p>
                                )}
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
                                {currentDistanceKm !== null && (
                                  <p className="text-xs font-bold text-green-700 mt-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[15px]">near_me</span>
                                    A {currentDistanceKm.toFixed(1)} km del local • Envío: {shippingCalculation.isFreeShipping ? '¡Gratis (Promoción)!' : `$${shippingCost.toLocaleString('es-AR')}`}
                                  </p>
                                )}
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

                    {/* Advertencia de Zona de Cobertura */}
                    {!isPickup && isOutsideCoverage && currentDistanceKm !== null && (
                      <div className="p-4 bg-red-50 border border-red-300 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <span className="material-symbols-outlined text-red-600 text-2xl shrink-0 mt-0.5">wrong_location</span>
                        <div>
                          <h4 className="font-bold text-sm text-red-900">Ubicación fuera del radio de entrega</h4>
                          <p className="text-xs text-red-700 mt-1 leading-relaxed">
                            La dirección seleccionada se encuentra a <strong>{currentDistanceKm.toFixed(1)} km</strong> del local. Nuestro radio máximo de entrega es de <strong>{maxRadiusKm} km</strong>.
                          </p>
                          <p className="text-xs text-red-700 font-bold mt-2">
                            👉 Podés cambiar la opción a <strong>"Retiro en sucursal"</strong> para completar tu pedido.
                          </p>
                        </div>
                      </div>
                    )}

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
                          <label
                            key={slot.id}
                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                              !isAvailable
                                ? 'opacity-40 bg-surface-container-low border-outline-variant/10 cursor-not-allowed'
                                : formData.deliveryTime === slot.label
                                  ? 'border-primary bg-primary/5 cursor-pointer shadow-sm'
                                  : 'border-outline-variant/20 hover:bg-surface-container-low cursor-pointer'
                            }`}
                          >
                            <input
                              type="radio"
                              name="deliveryTime"
                              value={slot.label}
                              checked={formData.deliveryTime === slot.label}
                              onChange={handleInputChange}
                              disabled={!isAvailable}
                              className="hidden"
                            />
                            <span className={`material-symbols-outlined text-[22px] ${formData.deliveryTime === slot.label ? 'text-primary' : 'text-on-surface-variant'}`}>
                              {slot.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-on-surface leading-tight">{slot.label}</p>
                              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">{slot.sub}</p>
                            </div>
                            {formData.deliveryTime === slot.label && (
                              <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                            )}
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant">Notas o aclaraciones para el pedido</label>
                  <textarea 
                    name="notes" 
                    value={formData.notes} 
                    onChange={handleInputChange} 
                    rows={3} 
                    placeholder="Ej: Timbre roto, llamar al celular al llegar, instrucciones sobre tus productos..." 
                    className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-medium text-sm resize-none"
                  ></textarea>
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
                  { id: 'cash', label: isPickup ? 'Efectivo en el local' : 'Efectivo contra entrega', icon: 'payments' },
                  { id: 'card', label: 'Tarjeta de Débito / Crédito', icon: 'credit_card' },
                  { id: 'transfer', label: 'Transferencia Bancaria', icon: 'account_balance' },
                ].map((method) => (
                  <label key={method.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.paymentMethod === method.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container-low'}`}>
                    <input type="radio" name="paymentMethod" value={method.id} checked={formData.paymentMethod === method.id} onChange={handleInputChange} className="hidden" />
                    <span className={`material-symbols-outlined ${formData.paymentMethod === method.id ? 'text-primary' : 'text-on-surface-variant'}`}>{method.icon}</span>
                    <span className="font-bold flex-1">{method.label}</span>
                    {formData.paymentMethod === method.id && <span className="material-symbols-outlined text-primary">check_circle</span>}
                  </label>
                ))}

                {/* Cuenta Corriente: Solo si el cliente asociado al teléfono tiene habilitada cuenta corriente */}
                {hasCuentaCorriente && (
                  <div className="pt-2">
                    {isCcValidated ? (
                      <div className="space-y-3">
                        <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                          formData.paymentMethod === 'cuenta_corriente' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container-low'
                        }`}>
                          <input type="radio" name="paymentMethod" value="cuenta_corriente" checked={formData.paymentMethod === 'cuenta_corriente'} onChange={handleInputChange} className="hidden" />
                          <span className={`material-symbols-outlined ${formData.paymentMethod === 'cuenta_corriente' ? 'text-primary' : 'text-on-surface-variant'}`}>menu_book</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">Anotar en Cuenta Corriente</span>
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[12px]">check</span> Verificado
                              </span>
                            </div>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              Titular: <strong>{currentCustomer?.name}</strong> • DNI: ***{cleanDni(currentCustomer?.dni || '').slice(-3)}
                            </p>
                          </div>
                          {formData.paymentMethod === 'cuenta_corriente' && <span className="material-symbols-outlined text-primary">check_circle</span>}
                        </label>

                        {/* Advertencia de Límite Monetario Superado */}
                        {isCcExceedingAmount && (
                          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-3 animate-in fade-in">
                            <div className="flex items-start gap-2.5 text-amber-900">
                              <span className="material-symbols-outlined text-[20px] text-amber-700 shrink-0 mt-0.5">warning</span>
                              <div>
                                <p className="font-bold text-sm">Este pedido supera tu límite de Cuenta Corriente</p>
                                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                  Límite de crédito: <strong>${formatCurrency(effectiveCcAmountLimit, true, true)}</strong> • Deuda actual: <strong>${formatCurrency(currentCustomerDebt, true, true)}</strong>.
                                  Con este pedido de <strong>${formatCurrency(finalTotal, true, true)}</strong>{!isPickup && shippingCost > 0 ? ` (incluye $${formatCurrency(shippingCost, true, true)} de envío)` : ''}, el saldo acumulado sería <strong>${formatCurrency(potentialTotalCcDebt, true, true)}</strong> (supera por ${formatCurrency(potentialTotalCcDebt - effectiveCcAmountLimit, true, true)}).
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => navigate('/cart')}
                                className="bg-primary hover:bg-primary/90 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                              >
                                <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                                Volver al Carrito para modificar cantidades
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'cash' }))}
                                className="bg-white border border-amber-300 text-amber-900 font-bold py-2.5 px-4 rounded-xl text-xs hover:bg-amber-100/50 transition-all text-center"
                              >
                                Cambiar a Efectivo
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pr-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCcValidated(false);
                              setCcDniInput('');
                              setFormData(prev => ({ ...prev, paymentMethod: 'cash' }));
                            }}
                            className="text-xs text-on-surface-variant hover:text-red-600 transition-colors underline"
                          >
                            Cancelar validación de Cuenta Corriente
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-surface-container-lowest border-2 border-dashed border-primary/30 rounded-2xl p-5 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                            <span className="material-symbols-outlined text-[20px]">lock</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-on-surface">Cuenta Corriente disponible para este número</p>
                              <span className="text-[10px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">Requiere DNI</span>
                            </div>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              Para pagar con Cuenta Corriente, ingresá el número de documento (DNI) del titular para validar tu identidad:
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <div className="relative flex-1">
                            <input 
                              type="text" 
                              inputMode="numeric"
                              placeholder="Ingresá tu DNI (ej: 38123456)" 
                              value={ccDniInput}
                              onChange={(e) => {
                                setCcDniInput(e.target.value.replace(/\D/g, ''));
                                setCcValidationError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleValidateDniForCC();
                                }
                              }}
                              className="w-full bg-white border border-outline-variant/30 rounded-xl px-4 py-2.5 outline-none focus:border-primary font-semibold text-sm transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleValidateDniForCC}
                            className="bg-primary hover:bg-primary/90 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                          >
                            <span className="material-symbols-outlined text-[16px]">verified</span>
                            Validar DNI
                          </button>
                        </div>

                        {ccValidationError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700 animate-in fade-in duration-200">
                            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                            <p>{ccValidationError}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
            ) : !isPhoneEffectiveVerified ? (
              <div className="w-full bg-amber-100 text-amber-900 py-4 px-6 rounded-full flex justify-center items-center gap-2 text-sm font-bold border border-amber-300 cursor-not-allowed text-center">
                <span className="material-symbols-outlined text-[20px]">lock</span>
                VERIFICÁ TU NÚMERO DE TELÉFONO PARA CONFIRMAR
              </div>
            ) : !isPickup && isOutsideCoverage ? (
              <div className="w-full bg-red-100 text-red-900 py-4 px-6 rounded-full flex justify-center items-center gap-2 text-sm font-bold border border-red-300 cursor-not-allowed text-center">
                <span className="material-symbols-outlined text-[20px]">block</span>
                UBICACIÓN FUERA DE COBERTURA (CAMBIÁ A RETIRO)
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
                <div className="flex justify-between items-start text-on-surface-variant">
                  <div>
                    <span>{isPickup ? 'Retiro en sucursal' : 'Envío a domicilio'}</span>
                    {!isPickup && (
                      <span className="text-[10px] text-on-surface-variant/70 block">
                        {shippingCalculation.isFreeShipping
                          ? '¡Envío bonificado por monto!'
                          : currentDistanceKm !== null
                            ? `(${currentDistanceKm.toFixed(1)} km)`
                            : '(Tarifa base)'}
                      </span>
                    )}
                  </div>
                  <span className="text-right">
                    {isPickup ? (
                      <span className="text-green-600 font-bold">Gratis</span>
                    ) : shippingCalculation.isFreeShipping ? (
                      <span className="text-green-600 font-bold">¡Gratis!</span>
                    ) : (
                      <span className="font-semibold text-on-surface">$ {shippingCost.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    )}
                  </span>
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
          storeLat={storeLat}
          storeLng={storeLng}
          deliveryRadiusKm={maxRadiusKm}
          onClose={() => setIsMapModalOpen(false)} 
          onLocationSelected={handleLocationSelected} 
        />
      )}
    </>
  );
};
