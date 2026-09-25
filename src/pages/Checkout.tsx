import React, { useState, useEffect, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth, Order } from '../stores/useAuthStore';
import { useAdmin, defaultDeliveryTimeSlots, DeliveryTimeSlot } from '../context/AdminContext';
import { Link, useNavigate } from 'react-router-dom';
import { MapSelector } from '../components/MapSelector';
import { whatsappMessageService } from '../services/whatsapp-message.service';
import { upsertCustomerProfile } from '../services/admin.service';
import { checkCustomerOverdueDebt } from '../utils/billing-cycle';
import { calculateDistanceKm, calculateShippingCost } from '../../supabase/functions/_shared/shipping';
import { supabase } from '../lib/supabase';

export const Checkout: React.FC = () => {
  const { items, totalPrice, totalItems, clearCart, originalPriceSum, discountApplied, potentialDiscount, orderOfferDiscount: cartOrderOfferDiscount, stockWarnings } = useCart();
  const { user, addOrder, updateUser, customerProfile, isAuthenticated } = useAuth();
  const { addAdminOrder, customers, orders, applyOrderOffers, deductStockForOrder, storeStatus, generalConfig, isPhoneBlocked, currentAccountConfig, formatCurrency, deliveryTimeSlots } = useAdmin();
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
    deliveryTime: isPickup ? 'Retiro en sucursal' : 'Lo antes posible'
  });

  // Sincronizar o seleccionar horario predeterminado válido según slots configurados
  useEffect(() => {
    const activeSlots = (deliveryTimeSlots && deliveryTimeSlots.length > 0 ? deliveryTimeSlots : defaultDeliveryTimeSlots)
      .filter(s => s.enabled !== false);
    if (activeSlots.length === 0) return;

    setFormData(prev => {
      const current = prev.deliveryTime;
      const matchesAny = activeSlots.some(s =>
        current === s.label ||
        (s.sub && current === `${s.label} (${s.sub})`) ||
        (Boolean(s.label) && current.startsWith(s.label))
      );
      if (!matchesAny) {
        const first = activeSlots[0];
        return {
          ...prev,
          deliveryTime: first.sub ? `${first.label} (${first.sub})` : first.label
        };
      }
      return prev;
    });
  }, [deliveryTimeSlots]);

  // Clean and format helper functions
  const cleanPhone = (p: string) => {
    let c = (p || '').replace(/\D/g, '');
    if (c.startsWith('549')) c = c.substring(3);
    else if (c.startsWith('54')) c = c.substring(2);
    if (c.startsWith('0')) c = c.substring(1);
    return c;
  };

  const cleanDni = (d: string) => (d || '').replace(/\D/g, '');

  const getOrCreateDeviceId = (): string => {
    const KEY = 'la_martina_trusted_device_id';
    let deviceId = localStorage.getItem(KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(KEY, deviceId);
    }
    return deviceId;
  };

  // ─── OTP Verification (Server-Side) ───────────────────────
  // Solo consideramos verificado el teléfono si poseemos el checkoutToken emitido por el backend
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [otpCodeSent, setOtpCodeSent] = useState<boolean>(false);
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);

  const isPhoneEffectiveVerified = isAuthenticated || !!checkoutToken;

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Auto-validar teléfono y emitir checkoutToken si el usuario está autenticado O si este dispositivo ya fue verificado
  useEffect(() => {
    let isCancelled = false;
    const phoneDigits = cleanPhone(formData.phone);

    // 1. Si está autenticado con cuenta (cliente/empleado/admin), obtener el token directamente sin OTP
    if (isAuthenticated) {
      const fetchAuthToken = async () => {
        try {
          const { data: authTok, error: authErr } = await supabase.rpc('get_authenticated_checkout_token', {
            p_phone: phoneDigits || null
          });
          if (!isCancelled && !authErr && authTok) {
            setCheckoutToken(authTok);
          }
        } catch (err) {
          console.warn('No se pudo obtener checkout token autenticado:', err);
        }
      };
      fetchAuthToken();
      return () => { isCancelled = true; };
    }

    setCheckoutToken(null);
    setOtpCodeSent(false);
    setOtpInput('');
    setOtpError(null);
    setOtpSuccess(null);

    if (!phoneDigits || phoneDigits.length < 8) return;

    // 2. Para invitados: verificar si este dispositivo ya fue verificado para este número
    const checkTrustedStatus = async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const { data: devTok, error: devErr } = await supabase.rpc('get_trusted_checkout_token', {
          p_phone: phoneDigits,
          p_device_token: deviceId
        });

        if (!isCancelled && !devErr && devTok) {
          setCheckoutToken(devTok);
        }
      } catch (err) {
        console.warn('No se pudo verificar dispositivo de confianza automáticamente:', err);
      }
    };

    checkTrustedStatus();

    return () => {
      isCancelled = true;
    };
  }, [formData.phone, isAuthenticated]);

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

    try {
      const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('La solicitud tardó demasiado tiempo. Por favor reintentá.')), 20000)
      );

      const rpcPromise = supabase.rpc('request_otp', { 
        p_phone: phoneDigits,
        p_customer_name: formData.name || 'Cliente'
      });

      const { error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      setOtpCodeSent(true);
      setOtpSuccess('¡Código enviado por WhatsApp! Revisá tus mensajes.');
      setOtpCountdown(60);
    } catch (err: any) {
      console.error('Error enviando OTP:', err);
      setOtpError(err.message || 'Error enviando código de verificación. Reintentá en unos momentos.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError(null);
    if (!otpInput || otpInput.trim().length !== 4) {
      setOtpError('Ingresá el código de 4 dígitos.');
      return;
    }
    
    const phoneDigits = cleanPhone(formData.phone);

    try {
      const timeoutPromise = new Promise<{ data: any; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('La verificación tardó demasiado tiempo. Por favor reintentá.')), 10000)
      );

      const rpcPromise = supabase.rpc('verify_otp', { 
        p_phone: phoneDigits, 
        p_code: otpInput.trim() 
      });

      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

      if (error) {
        throw error;
      }

      if (data) {
        setCheckoutToken(data);
        setOtpSuccess('¡Número verificado correctamente!');
        setOtpError(null);

        // Registrar este dispositivo como confiable para futuras compras
        try {
          const deviceId = getOrCreateDeviceId();
          await supabase.rpc('register_trusted_device', {
            p_phone: phoneDigits,
            p_device_token: deviceId,
            p_checkout_token: data
          });
        } catch (regErr) {
          console.warn('Error registrando dispositivo de confianza:', regErr);
        }
      } else {
        setOtpError('Respuesta inválida del servidor al verificar el código.');
      }
    } catch (err: any) {
      console.error('Error verificando OTP:', err);
      setOtpError(err.message || 'El código ingresado es incorrecto o ha expirado.');
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

  // Selected delivery slot details and free shipping check
  const currentSlots = useMemo(() => {
    return (deliveryTimeSlots && deliveryTimeSlots.length > 0 ? deliveryTimeSlots : defaultDeliveryTimeSlots);
  }, [deliveryTimeSlots]);

  const selectedDeliverySlot = useMemo(() => {
    return currentSlots.find(s =>
      formData.deliveryTime === s.label ||
      (s.sub && formData.deliveryTime === `${s.label} (${s.sub})`) ||
      (Boolean(s.label) && formData.deliveryTime.startsWith(s.label))
    );
  }, [currentSlots, formData.deliveryTime]);

  const hasSlotFreeShipping = Boolean(selectedDeliverySlot?.freeShipping);

  // Dynamic shipping calculation based on distance and slot benefits
  const shippingCalculation = useMemo(() => {
    const calc = calculateShippingCost({
      distanceKm: currentDistanceKm,
      cartTotal: activeTotalPrice,
      baseCost: generalConfig.shippingBaseCost ?? 1000,
      costPerKm: generalConfig.shippingCostPerKm ?? 400,
      freeShippingMinAmount: generalConfig.freeShippingMinAmount ?? 0,
      isPickup
    });

    if (hasSlotFreeShipping && !isPickup) {
      return {
        ...calc,
        cost: 0,
        isFreeShipping: true,
        breakdownText: '¡Envío gratis para este horario!'
      };
    }

    return calc;
  }, [currentDistanceKm, activeTotalPrice, generalConfig, isPickup, hasSlotFreeShipping]);

  const shippingCost = shippingCalculation.cost;
  const finalTotal = Math.round((activeTotalPrice + shippingCost) * 100) / 100;

  // Helper de disponibilidad y horario de atención para franjas horarias
  const checkSlotAvailability = (slot: DeliveryTimeSlot, now: Date = new Date()) => {
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinutes;

    const isAsap = !slot.isTomorrow && (slot.id === 'asap' || (!slot.cutoffTime && (slot.endHour === undefined || slot.endHour >= 24)));

    if (isAsap) {
      const start = slot.startTime || '09:00';
      const end = slot.endTime || '21:00';
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const sMinTotal = (isNaN(sH) ? 9 : sH) * 60 + (isNaN(sM) ? 0 : sM);
      const eMinTotal = (isNaN(eH) ? 21 : eH) * 60 + (isNaN(eM) ? 0 : eM);

      if (currentTotalMinutes < sMinTotal || currentTotalMinutes >= eMinTotal) {
        return {
          isAvailable: false,
          reason: `Cerrado (${start} a ${end} hs)`
        };
      }
      return { isAvailable: true, reason: '' };
    }

    if (!slot.isTomorrow) {
      if (slot.cutoffTime) {
        const [cHour, cMin] = slot.cutoffTime.split(':').map(Number);
        if (!isNaN(cHour) && !isNaN(cMin)) {
          if (currentHour > cHour || (currentHour === cHour && currentMinutes >= cMin)) {
            return { isAvailable: false, reason: `Corte superado (${slot.cutoffTime} hs)` };
          }
        }
      } else if (slot.endHour !== undefined || slot.endMin !== undefined) {
        const endHour = slot.endHour ?? 24;
        const endMin = slot.endMin ?? 0;
        if (currentHour > endHour || (currentHour === endHour && currentMinutes >= endMin)) {
          return { isAvailable: false, reason: 'Horario superado' };
        }
        const minutesUntilEnd = (endHour - currentHour) * 60 + (endMin - currentMinutes);
        if (minutesUntilEnd < 15) {
          return { isAvailable: false, reason: 'Fuera de horario' };
        }
      }
    }

    return { isAvailable: true, reason: '' };
  };

  // Auto-seleccionar primer horario disponible si el seleccionado no está disponible (ej: supermercado cerrado)
  useEffect(() => {
    const now = new Date();
    const activeSlots = currentSlots.filter(s => s.enabled !== false);
    if (activeSlots.length === 0) return;

    const currentMatches = activeSlots.find(s =>
      formData.deliveryTime === s.label ||
      (s.sub && formData.deliveryTime === `${s.label} (${s.sub})`) ||
      (Boolean(s.label) && formData.deliveryTime.startsWith(s.label))
    );

    const isCurrentValid = currentMatches && checkSlotAvailability(currentMatches, now).isAvailable;

    if (!isCurrentValid) {
      const firstAvailable = activeSlots.find(s => checkSlotAvailability(s, now).isAvailable);
      if (firstAvailable) {
        const val = firstAvailable.sub ? `${firstAvailable.label} (${firstAvailable.sub})` : firstAvailable.label;
        setFormData(prev => ({ ...prev, deliveryTime: val }));
      }
    }
  }, [currentSlots, formData.deliveryTime]);

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
    setFormData(prev => {
      const activeSlots = (deliveryTimeSlots && deliveryTimeSlots.length > 0 ? deliveryTimeSlots : defaultDeliveryTimeSlots)
        .filter(s => s.enabled !== false);
      const defaultTime = activeSlots[0] ? (activeSlots[0].sub ? `${activeSlots[0].label} (${activeSlots[0].sub})` : activeSlots[0].label) : 'Lo antes posible';
      return {
        ...prev,
        deliveryTime: defaultTime
      };
    });
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

  const [isConfirming, setIsConfirming] = useState(false);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirming) return;
    setIsConfirming(true);
    
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
      setIsConfirming(false);
      setFormError('No es posible procesar este pedido con este número de contacto.');
      window.scrollTo({ top: 200, behavior: 'smooth' });
      return;
    }

    // Phone OTP validation (solo para invitados si no tienen token ni están autenticados)
    let effectiveToken = checkoutToken;
    if (!effectiveToken && isAuthenticated) {
      try {
        const { data: authTok } = await supabase.rpc('get_authenticated_checkout_token', {
          p_phone: cleanP || null
        });
        if (authTok) {
          effectiveToken = authTok;
          setCheckoutToken(authTok);
        }
      } catch (err) {
        console.warn('No se pudo obtener checkout token autenticado:', err);
      }
    }

    if (!isAuthenticated && !effectiveToken) {
      setIsConfirming(false);
      setFormError('Debés verificar tu número de WhatsApp antes de confirmar tu pedido.');
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    // Coverage Zone Validation
    if (!isPickup && isOutsideCoverage) {
      setIsConfirming(false);
      setFormError(`La ubicación seleccionada está fuera de nuestro radio de entrega (${maxRadiusKm} km). Podés optar por 'Retiro en sucursal'.`);
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    // Validation for Cuenta Corriente
    if (formData.paymentMethod === 'cuenta_corriente') {
      const enteredDigits = cleanDni(ccDniInput);
      const registeredDigits = cleanDni(currentCustomer?.dni || '');
      if (!isCcValidated || !currentCustomer?.hasCurrentAccount || !enteredDigits || enteredDigits !== registeredDigits) {
        setIsConfirming(false);
        setFormError('Debés validar tu DNI antes de confirmar un pedido con Cuenta Corriente.');
        window.scrollTo({ top: 400, behavior: 'smooth' });
        return;
      }

      if (ccOverdueStatus.isOverdue) {
        setIsConfirming(false);
        setFormError(`Tu Cuenta Corriente tiene un saldo vencido de $${formatCurrency(ccOverdueStatus.overdueDebt, true, true)}. No es posible realizar pedidos a cuenta hasta regularizar el pago en el local.`);
        window.scrollTo({ top: 400, behavior: 'smooth' });
        return;
      }

      if (isCcExceedingAmount) {
        setIsConfirming(false);
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
        setIsConfirming(false);
        setFormError('Por favor, seleccioná tu ubicación en el mapa antes de continuar.');
        window.scrollTo({ top: 200, behavior: 'smooth' });
        return;
      }
      // Only require house number and reference if using the map (not saved address)
      if (!usingProfileAddress) {
        if (!deliveryHouseNumber.trim()) {
          setIsConfirming(false);
          setFormError('Por favor, ingresá el número de casa, lote o depto.');
          return;
        }
        if (!deliveryReference.trim()) {
          setIsConfirming(false);
          setFormError('Por favor, ingresá una referencia visual para guiar al repartidor.');
          return;
        }
      }
    }

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

    setIsConfirming(true);

    try {
      const payload = {
        items: items.map(i => ({ id: i.id, quantity: i.quantity })),
        checkout_token: effectiveToken,
        isPickup: isPickup,
        customer_phone: cleanP,
        customer_name: finalCustomerName,
        delivery_lat: finalLat,
        delivery_lng: finalLng,
        delivery_data: {
          address: backwardAddressString,
          addressLabel: finalAddressLabel,
          houseNumber: deliveryHouseNumber,
          reference: deliveryReference,
          deliveryTime: formData.deliveryTime
        },
        payment_method: formData.paymentMethod,
        notes: orderNotes,
        dni: validatedDni,
        expected_total: Math.round(finalTotal * 100) / 100
      };

      const { data, error } = await supabase.functions.invoke('checkout-api/checkout', {
        body: payload
      });

      if (error) {
        throw new Error(error.message || 'Error del servidor');
      }
      
      if (!data || !data.success) {
        throw new Error(data?.message || data?.error || 'Error al procesar el pedido');
      }

      // Check if server total matches frontend total
      // The edge function returns the real total calculated server-side
      const serverTotal = data.total;
      
      if (Math.abs(serverTotal - finalTotal) > 1) { // 1 peso tolerance
        const sFmt = (Math.round(serverTotal * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 });
        const cFmt = (Math.round(finalTotal * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 });
        setFormError(`El importe cotizado por el servidor ($${sFmt}) difiere de tu total en pantalla ($${cFmt}). Revisá los precios actualizados y confirmá de nuevo.`);
        window.scrollTo({ top: 300, behavior: 'smooth' });
        setIsConfirming(false);
        // Aquí idealmente deberíamos refrescar el carrito, pero como mínimo bloqueamos
        return;
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

    } catch (err: any) {
      console.error("Error al procesar el pedido:", err);
      if (err.message?.includes("Insufficient stock")) {
        setFormError('Lamentablemente, algunos de los productos ya no tienen stock suficiente. Modificá tu carrito.');
      } else if (err.message?.includes("token")) {
        setFormError('La sesión de pago expiró o es inválida. Verificá nuevamente tu teléfono.');
        setCheckoutToken(null);
      } else {
        // Limitar números decimales a un máximo de 2 dígitos después de la coma
        let cleanMsg = err.message || '';
        cleanMsg = cleanMsg.replace(/\$(\d+(?:\.\d+)?)/g, (_: string, numStr: string) => {
          const num = parseFloat(numStr);
          if (isNaN(num)) return `$${numStr}`;
          return `$${(Math.round(num * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
        });
        setFormError('Error al crear el pedido: ' + cleanMsg);
      }
      window.scrollTo({ top: 300, behavior: 'smooth' });
    } finally {
      setIsConfirming(false);
    }
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

          {!isAuthenticated && potentialDiscount > 0 && (
            <div className="mt-4 p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-white border border-primary/25 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs text-left">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[28px] shrink-0">loyalty</span>
                <div>
                  <p className="text-xs sm:text-sm font-black text-on-surface">
                    ¿Querés ahorrar <span className="text-primary">${potentialDiscount.toLocaleString('es-AR')}</span> en este pedido?
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Iniciá sesión o registrate gratis antes de confirmar para que se aplique tu descuento de Ofertas Relámpago.
                  </p>
                </div>
              </div>
              <Link
                to="/profile"
                className="shrink-0 w-full sm:w-auto px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl text-center shadow-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">login</span>
                <span>Registrarme / Iniciar Sesión</span>
              </Link>
            </div>
          )}

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

                {/* OTP Verification Block (solo para invitados si el número no está verificado en este dispositivo) */}
                {!isAuthenticated && !isPhoneEffectiveVerified && cleanPhone(formData.phone).length >= 8 && (
                  <div className="md:col-span-2 bg-amber-50/70 border border-amber-200 rounded-2xl p-4 md:p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[20px]">security</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-amber-950">Verificación de seguridad requerida</p>
                        <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                          Para proteger tu pedido, te enviaremos un código de 4 dígitos por WhatsApp. Una vez verificado, este dispositivo quedará autorizado para futuras compras sin pedirlo nuevamente.
                        </p>
                        <div className="mt-2.5 p-2.5 bg-amber-100/90 border border-amber-300/80 rounded-xl flex items-center gap-2 text-xs text-amber-950">
                          <span className="material-symbols-outlined text-amber-800 text-[18px] shrink-0">schedule</span>
                          <p>
                            <strong>Aviso importante:</strong> El código por WhatsApp se enviará cuando el supermercado esté abierto y con su sistema operativo.
                          </p>
                        </div>
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
                      const activeSlots = (deliveryTimeSlots && deliveryTimeSlots.length > 0 ? deliveryTimeSlots : defaultDeliveryTimeSlots)
                        .filter(s => s.enabled !== false);

                      return activeSlots.map(slot => {
                        const { isAvailable, reason: closedReason } = checkSlotAvailability(slot, now);
                        const slotFullValue = slot.sub ? `${slot.label} (${slot.sub})` : slot.label;
                        const isSelected =
                          formData.deliveryTime === slot.label ||
                          formData.deliveryTime === slotFullValue ||
                          (Boolean(slot.label) && formData.deliveryTime.startsWith(slot.label));

                        return (
                          <label
                            key={slot.id}
                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${!isAvailable
                                ? 'opacity-50 bg-surface-container-low border-outline-variant/10 cursor-not-allowed'
                                : isSelected
                                  ? 'border-primary bg-primary/5 cursor-pointer shadow-sm'
                                  : 'border-outline-variant/20 hover:bg-surface-container-low cursor-pointer'
                              }`}
                          >
                            <input
                              type="radio"
                              name="deliveryTime"
                              value={slotFullValue}
                              checked={isSelected}
                              onChange={() => {
                                if (isAvailable) {
                                  setFormData(prev => ({ ...prev, deliveryTime: slotFullValue }));
                                }
                              }}
                              disabled={!isAvailable}
                              className="hidden"
                            />
                            <span className={`material-symbols-outlined text-[22px] ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                              {slot.icon || 'schedule'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm text-on-surface leading-tight">{slot.label}</p>
                                {slot.freeShipping && !isPickup && (
                                  <span className="text-[10px] font-black uppercase text-green-700 bg-green-100 px-2 py-0.5 rounded-md inline-flex items-center gap-0.5">
                                    <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                                    Envío Gratis
                                  </span>
                                )}
                              </div>
                              {slot.sub && (
                                <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">{slot.sub}</p>
                              )}
                              {!isAvailable && closedReason && (
                                <span className="text-[10px] font-bold text-red-700 bg-red-100/90 px-2 py-0.5 rounded-md mt-1 inline-flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">lock_clock</span>
                                  {closedReason}
                                </span>
                              )}
                            </div>
                            {isSelected && (
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
                        <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.paymentMethod === 'cuenta_corriente' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container-low'
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
              <button 
                type="submit" 
                disabled={isConfirming}
                className={`w-full text-white font-label-sm py-5 rounded-full flex justify-center items-center gap-3 transition-all shadow-xl text-lg font-bold ${isConfirming ? 'bg-surface-variant text-on-surface-variant cursor-not-allowed shadow-none' : 'bg-primary hover:bg-primary/90'}`}
              >
                {isConfirming ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}
                {isConfirming ? (
                  <span className="material-symbols-outlined animate-spin">sync</span>
                ) : (
                  <span className="material-symbols-outlined">send</span>
                )}
              </button>
            )}
          </form>

          {/* Resumen */}
          <aside className="w-full md:w-100 sticky top-24">
            <div className="bg-white p-6 rounded-3xl shadow-md border border-outline-variant/10">
              <h3 className="text-[25px] font-bold text-on-background mb-6">Tu Pedido</h3>
              <div className="max-h-[50vh] overflow-y-auto space-y-4 mb-6 pr-2 no-scrollbar">
                {items.map(item => (
                  <div key={item.id} className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-[#fcf9f8] rounded-lg p-1 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt="" aria-hidden="true" className="w-full h-full object-contain mix-blend-multiply" />
                      ) : (
                        <span className="material-symbols-outlined text-outline-variant/40 text-[20px]">shopping_bag</span>
                      )}
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
                {!isAuthenticated && potentialDiscount > 0 && (
                  <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-1">
                    <div className="flex justify-between text-xs font-black text-primary">
                      <span>Descuento con registro:</span>
                      <span>-$ {potentialDiscount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant leading-tight">
                      <Link to="/profile" className="text-primary font-bold underline hover:opacity-80">
                        Registrate o iniciá sesión
                      </Link> para aplicar este descuento antes de confirmar.
                    </p>
                  </div>
                )}
                <div className="flex justify-between items-start text-on-surface-variant">
                  <div>
                    <span>{isPickup ? 'Retiro en sucursal' : 'Envío a domicilio'}</span>
                    {!isPickup && (
                      <span className="text-[10px] text-on-surface-variant/70 block">
                        {hasSlotFreeShipping
                          ? '¡Envío bonificado por horario elegido!'
                          : shippingCalculation.isFreeShipping
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
                    ) : (hasSlotFreeShipping || shippingCalculation.isFreeShipping) ? (
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
