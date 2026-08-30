import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import { Product } from '../../data/mockData';
import { useAuthStore } from '../../stores/useAuthStore';
import { TicketPrinter, TicketData, TicketItem } from '../../components/TicketPrinter';
import { MovementDetailModal } from '../../components/MovementDetailModal';
import { WeightInputModal } from '../../components/WeightInputModal';
import type { CashWithdrawal, CashMovement } from '../../context/AdminContext';
import { shoppingSessionService } from '../../services/shopping-session.service';
import { whatsappMessageService, cleanAndFormatPhone } from '../../services/whatsapp-message.service';
import { checkCustomerOverdueDebt } from '../../utils/billing-cycle';
import { parseScaleBarcode } from '../../utils/scale-barcode';

export const generateTicketWhatsAppText = (ticket: TicketData, storeName = 'La Martina', footerMsg = '¡Gracias por su compra!'): string => {
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let text = `*${storeName} 🛒*\n`;
  text += `*Ticket:* #${ticket.ticketNumber}`;
  text += `  ${ticket.date}\n`;
  if (ticket.customer && ticket.customer !== 'Cliente Local') {
    text += `Cliente: ${ticket.customer}\n`;
  }
  text += `\n`;

  ticket.items.forEach(item => {
    text += `*${item.name}*\n`;
    const qtyStr = item.saleType === 'weight'
      ? `${parseFloat(item.quantity.toFixed(2))} kg`
      : `${item.quantity}`;
    const totalLine = fmt(item.price * item.quantity);
    text += `${qtyStr} x $${fmt(item.price)}       *$${totalLine}*\n`;

    if (item.offerLabel && item.lineDiscount && item.lineDiscount > 0) {
      const discQtyStr = item.discountedQuantity && item.discountedQuantity < item.quantity
        ? ` (${item.discountedQuantity} un.)`
        : '';
      text += `▸ ${item.offerLabel}${discQtyStr} (-$${fmt(item.lineDiscount)})\n`;
    }
    text += `\n`;
  });

  text += `Subtotal: *$${fmt(ticket.subtotal)}*\n`;

  const itemDisc = ticket.items.reduce((acc, it) => acc + (it.lineDiscount || 0), 0);
  const totalDisc = itemDisc + (ticket.globalDiscountAmount || 0);

  if (totalDisc > 0) {
    text += `Descuento: *-$${fmt(totalDisc)}*\n`;
  }

  text += `*TOTAL: $${fmt(ticket.total)}*\n`;


  return text;
};

interface POSCartItem {
  id: string;
  productId: string;
  productCode: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  offerDiscount?: number;
  offerLabel?: string | null;
  finalPrice?: number;
  lineDiscount?: number;
  offerId?: string | null;
  discountedQuantity?: number;
  saleType?: 'unit' | 'weight';
}

interface POSTab {
  id: string;
  label: string;
  cart: POSCartItem[];
  globalDiscount: number;
  selectedPaymentMethod: string;
  validatedCustomer: any;
  ccDni: string;
  shoppingSessionId?: string | null;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo', icon: 'payments' },
  { id: 'card', label: 'Tarjeta', icon: 'credit_card' },
  { id: 'transfer', label: 'Transferencia', icon: 'account_balance' },
  { id: 'cuenta_corriente', label: 'Cta. Corriente', icon: 'menu_book' },
];

const getPaymentMethodDisplay = (method: string) => {
  switch (method) {
    case 'cash': return 'Efectivo';
    case 'card': return 'Tarjeta';
    case 'transfer': return 'Transferencia';
    case 'cuenta_corriente': return 'Cta. Corriente';
    default: return method.replace('_', ' ');
  }
};

const createTab = (num: number): POSTab => ({
  id: `tab-${Date.now()}-${num}`,
  label: `Hoja ${num}`,
  cart: [],
  globalDiscount: 0,
  selectedPaymentMethod: 'cash',
  validatedCustomer: null,
  ccDni: '',
  shoppingSessionId: null,
});

export const POS: React.FC = () => {
  const { customers, cashMovements, addCashMovement, addCashWithdrawal, addAdminOrder, adminProducts, performCashClose, lastPOSCloseTimestamp, formatCurrency, applyOffersToCartItem, applyOrderOffers, orders, cashRegister, openCashRegister, isCashRegisterOpen, getStock, currentAccountConfig, ticketConfig, cashCloses, updateCashCloseOpeningControl } = useAdmin();

  const employeeProfile = useAuthStore((state) => state.employeeProfile);
  const cashierName = employeeProfile ? employeeProfile.name : 'Admin';

  const [headerPortal, setHeaderPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderPortal(document.getElementById('admin-header-portal'));
  }, []);

  // Pre-purchase load modal state
  const [showPrePurchaseModal, setShowPrePurchaseModal] = useState(false);
  const [prePurchaseCodeInput, setPrePurchaseCodeInput] = useState('');
  const [prePurchaseLoading, setPrePurchaseLoading] = useState(false);
  const [prePurchaseError, setPrePurchaseError] = useState('');

  // Limit warning modal
  const [showLimitWarning, setShowLimitWarning] = useState<{
    customerName: string;
    currentDebt: number;
    cartTotal: number;
    newDebt: number;
    amountLimit: number;
    oldestDays: number;
    timeLimit: number;
    isOverAmount: boolean;
    isOverTime: boolean;
  } | null>(null);

  const handleLoadPrePurchase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = prePurchaseCodeInput.trim().toUpperCase();
    if (!code) return;

    setPrePurchaseLoading(true);
    setPrePurchaseError('');

    try {
      const session = await shoppingSessionService.getShoppingSessionByCode(code);
      if (!session) {
        setPrePurchaseError(`No se encontró ninguna pre-compra con el código "${code}".`);
        setPrePurchaseLoading(false);
        return;
      }

      if (session.status !== 'pending') {
        const statusLabels: Record<string, string> = {
          confirmed: 'ya fue cobrada',
          cancelled: 'fue cancelada',
          expired: 'ha expirado'
        };
        setPrePurchaseError(`Esta pre-compra ${statusLabels[session.status] || 'no está pendiente'} (Estado: ${session.status}).`);
        setPrePurchaseLoading(false);
        return;
      }

      // Check expiration
      if (new Date(session.expiresAt) < new Date()) {
        setPrePurchaseError('Esta pre-compra ha expirado (límite de validez de 60 minutos superado).');
        setPrePurchaseLoading(false);
        return;
      }

      // Fetch items
      const sessionItems = await shoppingSessionService.getShoppingSessionItems(session.id);
      if (sessionItems.length === 0) {
        setPrePurchaseError('Esta pre-compra no contiene ningún producto.');
        setPrePurchaseLoading(false);
        return;
      }

      // Map to POSCartItem, updating prices if they exist in active catalog products
      const posCartItems: POSCartItem[] = sessionItems.map(item => {
        const matchingProduct = adminProducts.find(
          p => p.id === item.productId || (p.barcode && p.barcode === item.barcode)
        );

        return {
          id: `prepurchase-${item.id}-${Date.now()}-${Math.random()}`,
          productId: item.productId || 'PRODUCTO_COMUN',
          productCode: item.barcode || 'COMUN',
          name: item.name,
          price: matchingProduct ? matchingProduct.price : item.price,
          quantity: item.quantity,
          image: matchingProduct ? matchingProduct.image : (item.image || ''),
          saleType: matchingProduct?.saleType || 'unit'
        };
      });

      // Update active tab cart and set shoppingSessionId
      setCart(posCartItems);
      updateTab({ shoppingSessionId: session.id });

      // Auto-associate customer if they are in registered customers
      const matchedCustomer = customers.find(c =>
        (session.customerPhone && c.phone === session.customerPhone) ||
        (session.customerName && c.name.toLowerCase() === session.customerName.toLowerCase())
      );

      if (matchedCustomer) {
        setValidatedCustomer(matchedCustomer);
      } else if (session.customerName) {
        // Create temporary validated customer object
        setValidatedCustomer({
          id: 'temp-customer',
          name: session.customerName,
          phone: session.customerPhone,
          hasCurrentAccount: false
        });
      }

      // Close modal and clean input
      setShowPrePurchaseModal(false);
      setPrePurchaseCodeInput('');

      // Auto-open POS list modal so cashier sees the imported cart immediately
      setShowModal(true);
      setTimeout(() => inputRef.current?.focus(), 100);

    } catch (err: any) {
      console.error('Error loading pre-purchase:', err);
      setPrePurchaseError('Ocurrió un error al obtener la pre-compra desde Supabase. Intentá de nuevo.');
    } finally {
      setPrePurchaseLoading(false);
    }
  };

  const [showModal, setShowModal] = useState(false);
  const [showCloseSuccess, setShowCloseSuccess] = useState(false);
  const [activeWeightItemIdx, setActiveWeightItemIdx] = useState<number | null>(null);
  const [inlineWeightEdit, setInlineWeightEdit] = useState<{ idx: number; str: string } | null>(null);

  // Cash Register Open modal
  const [showCashOpenModal, setShowCashOpenModal] = useState(false);
  const [cashOpenAmount, setCashOpenAmount] = useState('');
  // Arqueo de apertura: 'arqueo' | 'open'
  const [cashOpenStep, setCashOpenStep] = useState<'arqueo' | 'open'>('open');
  const [arqueoContado, setArqueoContado] = useState('');
  const [arqueoNotes, setArqueoNotes] = useState('');

  // Generic Product modal
  const [showGenericModal, setShowGenericModal] = useState(false);
  const [genericDesc, setGenericDesc] = useState('');
  const [genericQty, setGenericQty] = useState(1);
  const [genericPrice, setGenericPrice] = useState('');

  // --- TABS STATE ---
  const [tabs, setTabs] = useState<POSTab[]>([createTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Initialize activeTabId
  useEffect(() => { if (!activeTabId && tabs.length > 0) setActiveTabId(tabs[0].id); }, [tabs]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const cart = activeTab?.cart || [];
  const globalDiscount = activeTab?.globalDiscount || 0;
  const selectedPaymentMethod = activeTab?.selectedPaymentMethod || 'cash';
  const validatedCustomer = activeTab?.validatedCustomer || null;

  // Helper to update current tab
  const updateTab = (updates: Partial<POSTab>) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };
  const setCart = (updater: POSCartItem[] | ((prev: POSCartItem[]) => POSCartItem[])) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const newCart = typeof updater === 'function' ? updater(t.cart) : updater;
      return { ...t, cart: newCart };
    }));
  };
  const setGlobalDiscount = (v: number) => updateTab({ globalDiscount: v });
  const setSelectedPaymentMethod = (v: string) => updateTab({ selectedPaymentMethod: v });
  const setValidatedCustomer = (v: any) => updateTab({ validatedCustomer: v });

  const [searchCode, setSearchCode] = useState('');
  const [searchQty, setSearchQty] = useState<number>(1);
  const [searchQtyStr, setSearchQtyStr] = useState<string>('1');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // CC Validation
  const ccDni = activeTab?.ccDni || '';
  const setCcDni = (v: string) => updateTab({ ccDni: v });
  const [ccError, setCcError] = useState('');

  // Interaction States
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [showPriceModal, setShowPriceModal] = useState<{ idx: number, name: string } | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Success Modal
  const [showSuccessModal, setShowSuccessModal] = useState<{ orderId: string, customer: string, total: number, paymentMethod: string, phone: string } | null>(null);

  // Ticket state
  const [showTicket, setShowTicket] = useState<TicketData | null>(null);
  const [lastSaleTicket, setLastSaleTicket] = useState<TicketData | null>(null);

  // WhatsApp Ticket Modal state
  const [showWhatsAppTicketModal, setShowWhatsAppTicketModal] = useState<{ ticket: TicketData; phone: string } | null>(null);
  const [whatsappTicketPhone, setWhatsappTicketPhone] = useState('');
  const [isSendingWhatsAppTicket, setIsSendingWhatsAppTicket] = useState(false);
  const [whatsappTicketSuccess, setWhatsappTicketSuccess] = useState(false);
  const [whatsappTicketError, setWhatsappTicketError] = useState('');
  const whatsappPhoneInputRef = useRef<HTMLInputElement>(null);

  // Movement detail state
  const [selectedMovement, setSelectedMovement] = useState<CashMovement | null>(null);

  // Withdrawal state (for cash close flow)
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawals, setWithdrawals] = useState<CashWithdrawal[]>([]);
  const [wdAmount, setWdAmount] = useState('');
  const [wdReason, setWdReason] = useState('');

  // --- MANUAL MOVEMENT STATE ---
  const [showManualModal, setShowManualModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  // --- LIVE SEARCH STATE ---
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState<number>(-1);

  const filteredProducts = useMemo(() => {
    if (!searchCode.trim()) return [];
    const search = searchCode.trim().toLowerCase();
    return adminProducts.filter(p => {
      const barcodeStr = p.barcode ? String(p.barcode).toLowerCase() : '';
      const idStr = p.id ? String(p.id).toLowerCase() : '';
      const nameStr = p.name ? String(p.name).toLowerCase() : '';
      return barcodeStr.includes(search) || idStr.includes(search) || nameStr.includes(search);
    }).slice(0, 8);
  }, [searchCode, adminProducts]);

  // Stats
  const stats = useMemo(() => {
    let cash = cashRegister?.initialAmount || 0;
    let card = 0, transfer = 0;
    let currentBox = cashRegister?.initialAmount || 0;
    cashMovements.forEach(m => {
      if (m.timestamp > lastPOSCloseTimestamp) {
        const isVenta = m.description.includes('Venta Local');
        const isPagoCC = m.description.includes('Pago Cta. Corriente');
        const descLower = m.description.toLowerCase();
        const method = (descLower.includes('(card)') || descLower.includes('(tarjeta)')) ? 'card' :
          (descLower.includes('(transfer)') || descLower.includes('(transferencia)')) ? 'transfer' :
            (descLower.includes('(cuenta_corriente)') || descLower.includes('(cta. corriente)')) ? 'cuenta_corriente' : 'cash';
        if (isVenta || isPagoCC) {
          if (method === 'cash') cash += m.amount;
          else if (method === 'card') card += m.amount;
          else if (method === 'transfer') transfer += m.amount;
        }
        if (m.type === 'Ingreso') {
          // No sumamos las ventas a cuenta corriente a la caja física (es dinero no ingresado)
          if (method !== 'cuenta_corriente') {
            currentBox += m.amount;
          }
        }
        if (m.type === 'Egreso' || m.type === 'Retiro') {
          // Excluimos PAGO PROVEEDOR de restar de la caja chica/actual en vivo
          if (!m.description.startsWith('PAGO PROVEEDOR:')) {
            currentBox -= m.amount;
          }
        }
      }
    });
    return { cash, card, transfer, currentBox };
  }, [cashMovements, lastPOSCloseTimestamp, cashRegister?.initialAmount]);

  const recentActivity = useMemo(() => {
    return cashMovements
      .filter(m => m.timestamp > lastPOSCloseTimestamp)
      .map(m => {
        const isVenta = m.description.includes('Venta Local');
        const isPagoCC = m.description.includes('Pago Cta. Corriente');
        const isEgresoProv = m.description.startsWith('PAGO PROVEEDOR:');
        const isRetiro = m.type === 'Retiro';

        let paymentMethod = '-';
        let detail = m.description;

        if (isVenta || isPagoCC) {
          const methodMatch = m.description.match(/\(([^)]+)\)/);
          paymentMethod = methodMatch ? methodMatch[1] : 'Efectivo';

          const parts = m.description.split(' - ');
          if (isVenta) {
            const items = parts[1] || '';
            const customer = parts[2] || '';
            detail = customer ? `${items} (${customer})` : items;
          } else {
            const customer = parts[1] || '';
            detail = `Cobro Deuda${customer ? ` (${customer})` : ''}`;
          }
        } else if (isEgresoProv) {
          detail = m.description.replace('PAGO PROVEEDOR: ', '');
          paymentMethod = 'Efectivo';
        } else if (isRetiro) {
          detail = m.description.replace('Retiro: ', '');
          paymentMethod = 'Efectivo';
        }

        return {
          id: m.id,
          time: new Date(m.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          type: isVenta ? 'Venta' : isPagoCC ? 'Cobro CC' : isRetiro ? 'Retiro' : m.type,
          detail,
          paymentMethod,
          cashier: m.cashier,
          amount: (m.type === 'Egreso' || m.type === 'Retiro') ? -m.amount : m.amount,
          timestamp: m.timestamp,
          isVenta: isVenta || isPagoCC,
          rawMovement: m
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [cashMovements, lastPOSCloseTimestamp]);

  const handleCashClose = () => {
    // Register withdrawals as movements before close
    withdrawals.forEach(w => addCashWithdrawal(w));
    const result = performCashClose(withdrawals);
    if (result === null) {
      // Register was already closed — show feedback and abort
      setShowCloseConfirm(false);
      setWithdrawals([]);
      setShowWithdrawalModal(false);
      alert('La caja ya se encuentra cerrada.');
      return;
    }
    setShowCloseConfirm(false);
    setWithdrawals([]);
    setShowWithdrawalModal(false);
    setShowCloseSuccess(true);
    setTimeout(() => setShowCloseSuccess(false), 3000);
  };

  const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);

  // --- POS CART LOGIC ---
  const cartWithDiscounts = useMemo(() => {
    return cart.map(item => {
      const calculation = applyOffersToCartItem(
        { productId: item.productId, price: item.price, quantity: item.quantity },
        validatedCustomer
      );
      return {
        ...item,
        finalPrice: calculation.finalPrice,
        lineDiscount: calculation.discountAmount,
        offerLabel: calculation.offerLabel,
        offerId: calculation.offerId,
        discountedQuantity: calculation.discountedQuantity
      };
    });
  }, [cart, validatedCustomer, applyOffersToCartItem]);

  const subtotal = cartWithDiscounts.reduce((s, i) => s + (i.price * i.quantity), 0);
  const itemDiscountsTotal = cartWithDiscounts.reduce((s, i) => s + (i.lineDiscount || 0), 0);
  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

  const orderOfferCalc = useMemo(() => {
    return applyOrderOffers(subtotalAfterItemDiscounts, validatedCustomer);
  }, [subtotalAfterItemDiscounts, validatedCustomer, applyOrderOffers]);

  const manualDiscountAmount = ((subtotalAfterItemDiscounts - orderOfferCalc.discountAmount) * globalDiscount) / 100;
  const cartTotal = subtotalAfterItemDiscounts - orderOfferCalc.discountAmount - manualDiscountAmount;
  const discountAmount = orderOfferCalc.discountAmount + manualDiscountAmount;

  const handleAddItem = (productOrCode: Product | string) => {
    let productId: string;
    let productCode: string;
    let name: string;
    let price: number;
    let image: string;
    let saleType: 'unit' | 'weight' = 'unit';
    let itemQuantity = searchQty;

    if (typeof productOrCode !== 'string') {
      productId = productOrCode.id;
      productCode = productOrCode.barcode || productOrCode.id;
      name = productOrCode.name;
      price = productOrCode.price;
      image = productOrCode.image;
      saleType = productOrCode.saleType || 'unit';
    } else {
      const cleanCode = productOrCode.trim();
      if (!cleanCode) return;

      // 1. Detectar si es un código de balanza comercial (EAN-13 balanza prefijo 20/21/22)
      const scaleResult = parseScaleBarcode(cleanCode, adminProducts);
      if (scaleResult.isScaleBarcode && scaleResult.product) {
        const sp = scaleResult.product;
        productId = sp.id;
        productCode = sp.barcode || sp.id;
        name = sp.name;
        price = sp.price;
        image = sp.image;
        saleType = 'weight';
        itemQuantity = scaleResult.weightKg || 1;
      } else {
        const cleanLower = cleanCode.toLowerCase();
        const exactMatch = adminProducts.find(p => {
          const barcodeStr = p.barcode ? String(p.barcode).trim().toLowerCase() : '';
          const idStr = p.id ? String(p.id).trim().toLowerCase() : '';
          return (barcodeStr && barcodeStr === cleanLower) || (idStr && idStr === cleanLower);
        });
        if (exactMatch) {
          productId = exactMatch.id;
          productCode = exactMatch.barcode || exactMatch.id;
          name = exactMatch.name;
          price = exactMatch.price;
          image = exactMatch.image;
          saleType = exactMatch.saleType || 'unit';
        } else if (filteredProducts.length > 0) {
          const firstSug = filteredProducts[0];
          productId = firstSug.id;
          productCode = firstSug.barcode || firstSug.id;
          name = firstSug.name;
          price = firstSug.price;
          image = firstSug.image;
          saleType = firstSug.saleType || 'unit';
        } else {
          productId = 'GENERIC';
          productCode = cleanCode.toUpperCase();
          name = cleanCode.toUpperCase();
          price = 0;
          image = '';
        }
      }
    }

    if (productId !== 'GENERIC' && productId !== 'PRODUCTO_COMUN' && !productId.startsWith('GENERICO-')) {
      const availableStock = getStock(productId);
      const existingItem = cart.find(item => item.productCode === productCode);
      const existingQty = existingItem ? existingItem.quantity : 0;
      // Si no hay stock, se permite agregar igual (sin descontar) pero con aviso visual
      // El descuento de stock en addAdminOrder solo aplica si hay stock > 0
      if (availableStock > 0 && existingQty + itemQuantity > availableStock) {
        alert(`Stock insuficiente. Solo quedan ${availableStock} unidades/kg disponibles de este producto.`);
        return;
      }
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productCode === productCode);
      if (existingIdx !== -1) {
        const newCart = [...prev];
        newCart[existingIdx] = { 
          ...newCart[existingIdx], 
          quantity: parseFloat((newCart[existingIdx].quantity + itemQuantity).toFixed(3)) 
        };
        return newCart;
      }
      return [{ id: Date.now().toString() + Math.random(), productId, productCode, name, price, quantity: itemQuantity, image, saleType }, ...prev];
    });

    setSearchCode('');
    setSearchQty(1);
    setSearchQtyStr('1');
    setShowSuggestions(false);
    setFocusedSuggestionIndex(-1);
    setSelectedIndex(null);
    inputRef.current?.focus();
  };

  const handleRemoveItem = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    setSelectedIndex(null);
  };

  const updateItemQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const item = cart[index];
    if (item.productId !== 'GENERIC' && item.productId !== 'PRODUCTO_COMUN' && !item.productId.startsWith('GENERICO-')) {
      const availableStock = getStock(item.productId);
      // Solo bloquear si hay stock registrado y se supera — si stock es 0, permitir igual
      if (availableStock > 0 && newQty > availableStock) {
        alert(`Stock insuficiente. Solo quedan ${availableStock} unidades disponibles de este producto.`);
        return;
      }
    }
    setCart(prev => {
      const n = [...prev];
      n[index].quantity = newQty;
      return n;
    });
  };

  const handleAddGenericProduct = () => {
    if (!genericDesc.trim() || !genericPrice || parseFloat(genericPrice) <= 0) return;
    const item: POSCartItem = {
      id: 'GENERICO-' + Date.now(),
      productId: 'PRODUCTO_COMUN',
      productCode: 'COMUN',
      name: genericDesc.toUpperCase(),
      price: parseFloat(genericPrice),
      quantity: genericQty,
      image: ''
    };
    setCart(prev => [item, ...prev]);
    setGenericDesc('');
    setGenericQty(1);
    setGenericPrice('');
    setShowGenericModal(false);
    inputRef.current?.focus();
  };

  const handleOpenPOS = () => {
    if (isCashRegisterOpen) {
      setShowModal(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Si hay un cierre anterior, predeterminar con el saldo de cierre
      const lastClose = cashCloses.find(c => c.period === 'diario') || cashCloses[0];
      const previousClosingCash = lastClose && lastClose.openingControlExpected != null 
        ? Math.max(0, lastClose.openingControlExpected) 
        : 0;

      if (lastClose && lastClose.openingControlExpected != null) {
        setCashOpenStep('arqueo');
        setArqueoContado(previousClosingCash > 0 ? String(previousClosingCash) : '');
        setArqueoNotes('');
      } else {
        setCashOpenStep('open');
        setCashOpenAmount(previousClosingCash > 0 ? String(previousClosingCash) : '');
      }
      setShowCashOpenModal(true);
    }
  };

  const handleRegisterInitialCash = () => {
    const amount = parseFloat(cashOpenAmount);
    if (isNaN(amount) || amount < 0) return;
    openCashRegister(amount);
    setCashOpenAmount('');
    setShowCashOpenModal(false);
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleValidateCC = () => {
    if (!ccDni) return;
    const customer = customers.find(c => c.dni === ccDni);
    if (customer) {
      if (customer.hasCurrentAccount) {
        setValidatedCustomer(customer);
        setCcError('');
      } else {
        setCcError('El cliente no tiene habilitada la Cuenta Corriente');
        setValidatedCustomer(null);
      }
    } else {
      setCcError('DNI no encontrado o cliente no registrado');
      setValidatedCustomer(null);
    }
  };

  const handleValidatePOSCustomer = () => {
    if (!ccDni) return;
    const customer = customers.find(c => c.dni === ccDni || c.phone === ccDni);
    if (customer) {
      setValidatedCustomer(customer);
      setCcError('');
    } else {
      setCcError('Cliente no encontrado');
      setValidatedCustomer(null);
    }
  };

  const handleRegisterManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    addCashMovement({
      type: 'Egreso',
      description: `PAGO PROVEEDOR: ${description}`,
      cashier: cashierName,
      amount: parseFloat(amount)
    });
    setAmount('');
    setDescription('');
    setShowManualModal(false);
  };

  const handleCompleteSale = async (override = false) => {
    if (cart.length === 0) return;
    if (selectedPaymentMethod === 'cuenta_corriente') {
      if (!validatedCustomer) {
        alert('Por favor asocie un cliente al principio de la venta.');
        return;
      }

      if (currentAccountConfig.enabled && !override) {
        const effectiveAmountLimit = validatedCustomer.useCustomAccountLimits ? (validatedCustomer.customDebtLimit ?? currentAccountConfig.maxDebtAmount) : currentAccountConfig.maxDebtAmount;
        const effectiveTimeLimit = validatedCustomer.useCustomAccountLimits ? (validatedCustomer.customDebtDays ?? currentAccountConfig.maxDebtDays) : currentAccountConfig.maxDebtDays;

        const potentialDebt = validatedCustomer.currentDebt + cartTotal;
        const oldestDays = validatedCustomer.oldestDebtDays || 0;

        const overdueInfo = checkCustomerOverdueDebt(validatedCustomer.phone, orders);
        const isOverAmount = currentAccountConfig.warnOnAmountLimit && potentialDebt > effectiveAmountLimit;
        const isOverTime = (currentAccountConfig.warnOnTimeLimit && oldestDays > effectiveTimeLimit) || overdueInfo.isOverdue;

        if (isOverAmount || isOverTime) {
          setShowLimitWarning({
            customerName: validatedCustomer.name,
            currentDebt: validatedCustomer.currentDebt,
            cartTotal,
            newDebt: potentialDebt,
            amountLimit: effectiveAmountLimit,
            oldestDays,
            timeLimit: effectiveTimeLimit,
            isOverAmount,
            isOverTime
          });
          return;
        }
      }
    }

    const orderId = `LOC-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const total = cartTotal;
    const customerName = validatedCustomer ? validatedCustomer.name : 'Cliente Local';
    const customerPhone = validatedCustomer ? validatedCustomer.phone : '';
    const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const totalOrderDiscount = orderOfferCalc.discountAmount + manualDiscountAmount;
    const totalOrderDiscountLabel = orderOfferCalc.offerLabel
      ? `${orderOfferCalc.offerLabel}${globalDiscount > 0 ? ` + Descuento ${globalDiscount}%` : ''}`
      : (globalDiscount > 0 ? `Descuento ${globalDiscount}%` : undefined);

    await addAdminOrder({
      id: orderId,
      date: dateStr,
      timestamp: Date.now(),
      customer: customerName,
      phone: customerPhone,
      dni: validatedCustomer ? validatedCustomer.dni : '',
      address: 'Compra en local',
      deliveryTime: 'Inmediato',
      method: 'Caja Fija',
      paymentMethod: selectedPaymentMethod,
      paymentStatus: selectedPaymentMethod === 'cuenta_corriente' ? 'Pendiente' : 'Pagado',
      status: 'Entregado',
      total: total,
      items: cartWithDiscounts.map(i => ({ id: i.productId, name: i.name, image: i.image, price: i.finalPrice ?? i.price, quantity: i.quantity, originalPrice: i.price, offerId: i.offerId || undefined, lineDiscount: i.lineDiscount, discountedQuantity: i.discountedQuantity, saleType: i.saleType })),
      source: 'pos',
      discount: totalOrderDiscount,
      discountLabel: totalOrderDiscountLabel,
      was_limit_override: override,
      override_reason: override ? 'Aprobado manualmente en caja' : undefined
    });

    // Registramos el movimiento en la caja, incluso para cuenta corriente (para que figure en historial)
    // El cálculo de stats (currentBox) ignora las ventas por cuenta corriente.
    addCashMovement({
      type: 'Ingreso',
      description: `Venta Local (${getPaymentMethodDisplay(selectedPaymentMethod)}) - ${cartWithDiscounts.length} ítems${validatedCustomer ? ` - ${validatedCustomer.name}` : ''}`,
      cashier: cashierName,
      amount: total,
      orderId: orderId
    });

    // Build ticket data for printing
    const ticketData: TicketData = {
      ticketNumber: orderId,
      date: dateStr,
      items: cartWithDiscounts.map(i => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        finalPrice: i.finalPrice || i.price,
        lineDiscount: i.lineDiscount,
        discountedQuantity: i.discountedQuantity,
        offerLabel: i.offerLabel || null,
        saleType: i.saleType,
      })),
      subtotal,
      globalDiscount,
      globalDiscountAmount: discountAmount,
      globalDiscountLabel: orderOfferCalc.offerLabel
        ? `${orderOfferCalc.offerLabel}${globalDiscount > 0 ? ` + Desc. ${globalDiscount}%` : ''}`
        : (globalDiscount > 0 ? `Descuento ${globalDiscount}%` : undefined),
      total,
      paymentMethod: selectedPaymentMethod,
      customer: customerName !== 'Cliente Local' ? customerName : undefined,
      cashier: cashierName,
    };
    setLastSaleTicket(ticketData);

    setShowSuccessModal({
      orderId,
      customer: customerName,
      total,
      paymentMethod: selectedPaymentMethod,
      phone: customerPhone
    });

    // Confirm shopping session if this cart was loaded from a pre-purchase
    if (activeTab.shoppingSessionId) {
      shoppingSessionService.confirmShoppingSession(activeTab.shoppingSessionId, 'Admin')
        .then(() => console.log('✅ Pre-compra confirmada y cerrada en Supabase'))
        .catch(err => console.error('❌ Error al confirmar pre-compra en Supabase:', err));
    }

    setCart([]);
    setGlobalDiscount(0);
    setShowPaymentModal(false);
    setSelectedPaymentMethod('cash');
    setValidatedCustomer(null);
    setCcDni('');
    setCcError('');
    updateTab({ shoppingSessionId: null });
  };

  const handleSendWhatsAppTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!showWhatsAppTicketModal?.ticket) return;

    const phone = whatsappTicketPhone.trim();
    if (!phone) {
      setWhatsappTicketError('Por favor ingresá el número de celular del cliente.');
      whatsappPhoneInputRef.current?.focus();
      return;
    }

    setIsSendingWhatsAppTicket(true);
    setWhatsappTicketError('');

    try {
      const ticket = showWhatsAppTicketModal.ticket;
      const storeName = ticketConfig.headerText || 'La Martina';
      const footerMsg = ticketConfig.footerMessage || '¡Gracias por su compra!';
      const message = generateTicketWhatsAppText(ticket, storeName, footerMsg);

      const res = await whatsappMessageService.createWhatsAppMessage({
        phone: phone,
        customer_name: ticket.customer || 'Cliente Mostrador',
        type: 'pos_digital_ticket',
        title: `Ticket #${ticket.ticketNumber}`,
        message,
        order_id: ticket.ticketNumber,
        customer_phone: phone
      });

      if (res) {
        setWhatsappTicketSuccess(true);
        setTimeout(() => {
          setShowWhatsAppTicketModal(null);
          setShowSuccessModal(null);
          setWhatsappTicketSuccess(false);
          setTimeout(() => inputRef.current?.focus(), 100);
        }, 1200);
      } else {
        setWhatsappTicketError('No se pudo encolar el mensaje. Verificá el formato del número.');
      }
    } catch (err: any) {
      console.error('Error enviando ticket por WhatsApp:', err);
      setWhatsappTicketError('Ocurrió un error al procesar el envío: ' + (err.message || ''));
    } finally {
      setIsSendingWhatsAppTicket(false);
    }
  };

  // Keyboard events logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showModal || showPaymentModal || showManualModal || showDiscountModal || showPriceModal || showCloseConfirm || showSuccessModal || showWhatsAppTicketModal) return;
      if (e.key === 'F2') { e.preventDefault(); if (cart.length > 0) { inputRef.current?.blur(); setShowPaymentModal(true); } return; }
      if (e.key === 'F4') { e.preventDefault(); setCart([]); setGlobalDiscount(0); updateTab({ shoppingSessionId: null }); setSearchQty(1); setSearchQtyStr('1'); return; }
      if (document.activeElement === inputRef.current) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (cart.length === 0 ? null : prev === null ? 0 : Math.min(prev + 1, cart.length - 1))); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (cart.length === 0 ? null : prev === null ? cart.length - 1 : Math.max(prev - 1, 0))); }
      if (e.key === 'Delete') { e.preventDefault(); if (selectedIndex !== null) handleRemoveItem(selectedIndex); else if (cart.length > 0) handleRemoveItem(0); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, showPaymentModal, showManualModal, showDiscountModal, showPriceModal, showCloseConfirm, showSuccessModal, cart, selectedIndex]);

  useEffect(() => {
    if (!showPaymentModal) return;
    const handlePaymentKeyDown = (e: KeyboardEvent) => {
      if (selectedPaymentMethod === 'cuenta_corriente' && !validatedCustomer && document.activeElement === ccInputRef.current) {
        if (e.key === 'Enter') { e.preventDefault(); handleValidateCC(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); ccInputRef.current?.blur(); setSelectedPaymentMethod('transfer'); }
        return;
      }
      if (selectedPaymentMethod === 'cuenta_corriente' && validatedCustomer && e.key === 'Enter') { e.preventDefault(); handleCompleteSale(false); return; }
      const idx = PAYMENT_METHODS.findIndex(m => m.id === selectedPaymentMethod);
      if (e.key === 'ArrowRight') { e.preventDefault(); if (idx % 2 === 0) setSelectedPaymentMethod(PAYMENT_METHODS[idx + 1].id); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx % 2 !== 0) setSelectedPaymentMethod(PAYMENT_METHODS[idx - 1].id); }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (idx < 2) setSelectedPaymentMethod(PAYMENT_METHODS[idx + 2].id); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (idx >= 2) setSelectedPaymentMethod(PAYMENT_METHODS[idx - 2].id); }
      if (e.key === 'Enter' && selectedPaymentMethod !== 'cuenta_corriente') { e.preventDefault(); handleCompleteSale(false); }
      if (e.key === 'Escape') { e.preventDefault(); setShowPaymentModal(false); }
    };
    window.addEventListener('keydown', handlePaymentKeyDown);
    return () => window.removeEventListener('keydown', handlePaymentKeyDown);
  }, [showPaymentModal, selectedPaymentMethod, validatedCustomer, ccDni]);

  useEffect(() => {
    if (showPaymentModal && selectedPaymentMethod === 'cuenta_corriente' && !validatedCustomer) setTimeout(() => ccInputRef.current?.focus(), 100);
  }, [selectedPaymentMethod, showPaymentModal, validatedCustomer]);

  useEffect(() => {
    if (!showSuccessModal) return;
    const handleSuccessKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        setShowSuccessModal(null);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    window.addEventListener('keydown', handleSuccessKeyDown);
    return () => window.removeEventListener('keydown', handleSuccessKeyDown);
  }, [showSuccessModal]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 flex flex-col pb-20">
      {/* Header Portal for Buttons */}
      {headerPortal && createPortal(
        <div className="flex gap-3 items-center">
          <button onClick={handleOpenPOS} className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2 rounded-full transition-all flex items-center gap-2 shadow-lg shadow-primary/20 text-xs">
            <span className="material-symbols-outlined text-[16px]">point_of_sale</span>
            {isCashRegisterOpen ? 'Abrir Punto de Venta' : 'Abrir Caja'}
          </button>
          {isCashRegisterOpen && (
            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Caja abierta — Inicio: ${formatCurrency(cashRegister.initialAmount, true, true)}
            </span>
          )}
          <button
            onClick={() => {
              if (!isCashRegisterOpen) {
                alert('La caja ya se encuentra cerrada.');
              } else {
                setShowCloseConfirm(true);
              }
            }}
            className={isCashRegisterOpen
              ? "bg-error text-white font-bold px-6 py-2 rounded-full hover:bg-error/90 transition-all flex items-center gap-2 shadow-lg shadow-error/20 text-xs"
              : "bg-gray-200 text-gray-400 font-bold px-6 py-2 rounded-full transition-all flex items-center gap-2 text-xs cursor-pointer"
            }
          >
            <span className="material-symbols-outlined text-[16px]">lock</span>
            Cierre de Caja
          </button>
        </div>,
        headerPortal
      )}

      {showCloseSuccess && (
        <div className="bg-green-100 border border-green-200 text-green-800 px-6 py-4 rounded-[2rem] flex items-center gap-3 animate-in slide-in-from-top duration-500 shadow-sm flex-shrink-0">
          <span className="material-symbols-outlined text-green-600">check_circle</span>
          <p className="font-bold">Caja cerrada con éxito. El resumen se ha guardado en Analíticas.</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm relative overflow-hidden">
          <span className="absolute top-6 right-6 bg-error/10 text-error text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">En Vivo</span>
          <div className="w-12 h-12 bg-[#FFD700] rounded-2xl flex items-center justify-center mb-4"><span className="material-symbols-outlined text-[#8B6508]">account_balance_wallet</span></div>
          <p className="text-sm font-medium text-on-surface-variant">Total</p>
          <p className="text-3xl font-black text-on-background mt-1">${formatCurrency(stats.currentBox)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm relative">
          <div className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center mb-4"><span className="material-symbols-outlined text-on-surface-variant">payments</span></div>
          <p className="text-sm font-medium text-on-surface-variant">Efectivo</p>
          <p className="text-3xl font-black text-on-background mt-1">${formatCurrency(stats.cash)}</p>
          {isCashRegisterOpen && (
            <div className="absolute top-5 right-6 text-right flex flex-col gap-0.5">
              <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Inicio: ${formatCurrency(cashRegister.initialAmount, true, true)}</p>
              <p className="text-[12px] font-bold text-green-600 uppercase tracking-wider">Ventas: ${formatCurrency(stats.cash - cashRegister.initialAmount, true, true)}</p>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
          <div className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center mb-4"><span className="material-symbols-outlined text-on-surface-variant">account_balance</span></div>
          <p className="text-sm font-medium text-on-surface-variant">Transferencia</p>
          <p className="text-3xl font-black text-on-background mt-1">${formatCurrency(stats.transfer)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
          <div className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center mb-4"><span className="material-symbols-outlined text-on-surface-variant">credit_card</span></div>
          <p className="text-sm font-medium text-on-surface-variant">Tarjeta</p>
          <p className="text-3xl font-black text-on-background mt-1">${formatCurrency(stats.card)}</p>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden mb-8">
        <div className="p-6 border-b border-outline-variant/10"><h2 className="text-xl font-bold">Actividad de Caja Reciente</h2></div>
        <div>
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white z-10"><tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"><th className="px-6 py-4">Hora</th><th className="px-6 py-4">Tipo</th><th className="px-6 py-4">Descripción</th><th className="px-6 py-4">Pago</th><th className="px-6 py-4">Responsable</th><th className="px-6 py-4 text-right">Monto</th><th className="px-4 py-4 w-16"></th></tr></thead>
            <tbody className="divide-y divide-outline-variant/10">
              {recentActivity.map(act => (
                <tr key={act.id} onClick={() => setSelectedMovement(act.rawMovement)} className="hover:bg-surface-container-lowest transition-colors cursor-pointer group">
                  <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{act.time}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${act.isVenta ? 'bg-[#FFD700]/20 text-[#8B6508]' : act.type === 'Retiro' ? 'bg-orange-100 text-orange-700' : act.type === 'Ingreso' ? 'bg-green-100 text-green-700' : 'bg-error/10 text-error'}`}>{act.isVenta ? 'Venta' : act.type}</span></td>
                  <td className="px-6 py-4 text-sm font-bold text-on-background">{act.detail}</td>
                  <td className="px-6 py-4 text-[10px] font-black uppercase text-on-surface-variant tracking-widest">{getPaymentMethodDisplay(act.paymentMethod)}</td>
                  <td className="px-6 py-4 text-xs font-bold text-on-surface-variant">{act.cashier || 'Sistema'}</td>
                  <td className={`px-6 py-4 text-sm font-black text-right ${act.amount > 0 ? 'text-on-background' : 'text-error'}`}>{act.amount > 0 ? '+' : ''}${formatCurrency(Math.abs(act.amount))}</td>
                  <td className="px-4 py-4"><span className="material-symbols-outlined text-[18px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">visibility</span></td>
                </tr>
              ))}
              {recentActivity.length === 0 && (<tr><td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant">No hay movimientos.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* POS Modal Content */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex animate-in fade-in duration-200 overflow-hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="absolute inset-4 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-row border border-outline-variant/20 animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center text-black"><span className="material-symbols-outlined">close</span></button>
            <div className="w-2/3 flex flex-col border-r border-outline-variant/10 bg-[#fefefe] h-full overflow-hidden">
              {/* TABS BAR */}
              <div className="flex items-center gap-1 px-8 pt-6 pb-0 flex-shrink-0">
                {tabs.map((tab, i) => (
                  <button key={tab.id} onClick={() => setActiveTabId(tab.id)}
                    className={`relative px-4 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTabId === tab.id ? 'bg-white text-primary border border-b-0 border-outline-variant/20 shadow-sm -mb-[1px] z-10' : 'text-on-surface-variant hover:bg-white/50'}`}>
                    {tab.label}
                    {tab.cart.length > 0 && <span className="bg-primary/10 text-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{tab.cart.length}</span>}
                    {tabs.length > 1 && (
                      <span onClick={(e) => { e.stopPropagation(); const newTabs = tabs.filter(t => t.id !== tab.id); setTabs(newTabs); if (activeTabId === tab.id) setActiveTabId(newTabs[0].id); }}
                        className="ml-1 w-4 h-4 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error flex items-center justify-center text-[14px] leading-none">&times;</span>
                    )}
                  </button>
                ))}
                {tabs.length < 4 && (
                  <button onClick={() => { const newTab = createTab(tabs.length + 1); setTabs(prev => [...prev, newTab]); setActiveTabId(newTab.id); }}
                    className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all text-sm font-bold ml-1">+</button>
                )}
              </div>
              <div className="flex-1 flex flex-col p-8 pt-4 overflow-hidden">
                <div className="flex gap-4 mb-6 relative">
                  <form onSubmit={(e) => { e.preventDefault(); handleAddItem(searchCode); }} className="flex-1 flex gap-4">
                    <div className="flex-1 relative">
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase mb-1 block tracking-wider">Busca o escanea Producto</label>
                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchCode}
                          onChange={e => { setSearchCode(e.target.value); setShowSuggestions(true); setFocusedSuggestionIndex(0); }}
                          onFocus={() => { if (filteredProducts.length > 0) setShowSuggestions(true); }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (filteredProducts.length > 0) {
                                setShowSuggestions(true);
                                setFocusedSuggestionIndex(prev => (prev < 0 ? 0 : Math.min(prev + 1, filteredProducts.length - 1)));
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (filteredProducts.length > 0) {
                                setShowSuggestions(true);
                                setFocusedSuggestionIndex(prev => (prev <= 0 ? 0 : prev - 1));
                              }
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault();
                              setSearchQty(q => {
                                const n = parseFloat((q + 1).toFixed(2));
                                setSearchQtyStr(n.toString());
                                return n;
                              });
                            } else if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              setSearchQty(q => {
                                const n = Math.max(1, parseFloat((q - 1).toFixed(2)));
                                setSearchQtyStr(n.toString());
                                return n;
                              });
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (showSuggestions && filteredProducts.length > 0) {
                                const selectedProduct = focusedSuggestionIndex >= 0 && focusedSuggestionIndex < filteredProducts.length
                                  ? filteredProducts[focusedSuggestionIndex]
                                  : filteredProducts[0];
                                handleAddItem(selectedProduct);
                                setFocusedSuggestionIndex(-1);
                                setShowSuggestions(false);
                              } else {
                                handleAddItem(searchCode);
                              }
                            } else if (e.key === 'Escape') {
                              setShowSuggestions(false);
                              setFocusedSuggestionIndex(-1);
                            }
                          }}
                          placeholder="Código o nombre..."
                          className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-4 px-5 focus:outline-none focus:border-[#9c1c1c] focus:ring-4 focus:ring-[#9c1c1c]/10 font-bold text-lg"
                        />
                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                      </div>
                      {showSuggestions && filteredProducts.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-[300] mt-2 bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden">
                          {filteredProducts.map((p, idx) => {
                            const stockVal = getStock(p.id);
                            const isOutOfStock = stockVal === 0;
                            const isFocused = idx === focusedSuggestionIndex;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { handleAddItem(p); setFocusedSuggestionIndex(-1); }}
                                onMouseEnter={() => setFocusedSuggestionIndex(idx)}
                                className={`w-full p-4 flex items-center gap-4 transition-all text-left border-b border-outline-variant/5 ${isFocused
                                  ? 'bg-primary/10 border-l-4 border-primary shadow-inner font-bold'
                                  : isOutOfStock
                                    ? 'bg-red-50/70 hover:bg-red-100 border-l-4 border-red-400'
                                    : 'hover:bg-surface-container-low'
                                  }`}
                              >
                                <div className={`w-10 h-10 rounded-lg overflow-hidden border ${isOutOfStock ? 'bg-red-100 border-red-200' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
                                  <img src={p.image} alt="" className={`w-full h-full object-contain ${isOutOfStock ? 'opacity-50' : ''}`} />
                                </div>
                                <div className="flex-1">
                                  <p className={`font-bold text-sm ${isOutOfStock ? 'text-red-700' : ''}`}>{p.name}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-on-surface-variant font-medium">Cód: {p.barcode || p.id}</p>
                                    {isOutOfStock && (
                                      <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Sin Stock</span>
                                    )}
                                  </div>
                                </div>
                                <p className={`font-black ${isOutOfStock ? 'text-red-500' : 'text-primary'}`}>${formatCurrency(p.price, true, true)}</p>
                              </button>
                            );
                          })}

                        </div>
                      )}
                    </div>
                    <div className="w-36"><label className="text-[11px] font-bold text-on-surface-variant uppercase mb-1 block tracking-wider">Cant.</label><div className="flex bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl overflow-hidden h-[60px]"><button type="button" onClick={() => { const n = Math.max(0.01, parseFloat((searchQty - (searchQty > 1 ? 1 : 0.1)).toFixed(2))); setSearchQty(n); setSearchQtyStr(n.toString()); }} className="w-10 flex items-center justify-center hover:bg-black/5 text-xl font-bold">-</button><input type="text" inputMode="decimal" className="flex-1 w-full text-center font-bold text-xl bg-transparent outline-none" value={searchQtyStr} onChange={e => { const raw = e.target.value.replace(',', '.'); if (/^\d*\.?\d{0,2}$/.test(raw)) { setSearchQtyStr(raw); const n = parseFloat(raw); if (!isNaN(n) && n > 0) setSearchQty(n); } }} onBlur={() => { if (!searchQtyStr || isNaN(parseFloat(searchQtyStr))) { setSearchQtyStr('1'); setSearchQty(1); } }} /><button type="button" onClick={() => { const n = parseFloat((searchQty + 1).toFixed(2)); setSearchQty(n); setSearchQtyStr(n.toString()); }} className="w-10 flex items-center justify-center hover:bg-black/5 text-xl font-bold">+</button></div></div>
                  </form>
                </div>
                <div className="flex-1 mt-2 border border-outline-variant/20 rounded-2xl overflow-hidden flex flex-col bg-white shadow-sm min-h-0 relative">
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    <table className="w-full text-left table-fixed border-separate border-spacing-0">
                      <thead className="bg-[#fcfcfc] sticky top-0 z-20"><tr className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider"><th className="px-6 py-4 w-20 text-center border-b border-outline-variant/20">#</th><th className="px-6 py-4 border-b border-outline-variant/20">Descripción</th><th className="px-6 py-4 w-32 text-center border-b border-outline-variant/20">Cant.</th><th className="px-6 py-4 w-40 text-right border-b border-outline-variant/20">Precio Unit.</th><th className="px-6 py-4 w-40 text-right border-b border-outline-variant/20">Total</th></tr></thead>
                      <tbody className="divide-y divide-outline-variant/5">
                        {cartWithDiscounts.map((item, idx) => {
                          const itemStock = item.productId !== 'GENERIC' && item.productId !== 'PRODUCTO_COMUN' && !item.productId.startsWith('GENERICO-') ? getStock(item.productId) : null;
                          const isItemOutOfStock = itemStock !== null && itemStock === 0;
                          return (
                            <tr key={item.id} onClick={() => setSelectedIndex(idx)} className={`group transition-colors relative ${isItemOutOfStock ? 'bg-red-50' : ''}`}>
                              <td className="px-6 py-5 text-center text-sm font-bold text-on-surface-variant relative align-middle h-[70px]"><button onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }} className="absolute inset-0 flex items-center justify-center bg-red-100 text-error opacity-0 group-hover:opacity-100 transition-all z-10"><span className="material-symbols-outlined text-[20px]">delete</span></button><div className="flex items-center justify-center h-full">{selectedIndex === idx ? <span className="material-symbols-outlined text-primary text-[18px]">arrow_right</span> : cartWithDiscounts.length - idx}</div></td>
                              <td className="px-6 py-5 font-black text-sm text-on-background uppercase truncate align-middle h-[70px]">
                                <div className="flex flex-col justify-center h-full">
                                  <span>{item.name}</span>
                                  {item.offerLabel && (
                                    <span className="text-[10px] text-error font-extrabold flex items-center gap-0.5 lowercase tracking-wider mt-0.5 bg-error/5 self-start px-2 py-0.5 rounded-full">
                                      <span className="material-symbols-outlined text-[12px]">local_offer</span>
                                      {item.offerLabel}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-5 text-center font-bold text-sm align-middle h-[70px]">
                                <div className="flex items-center justify-center h-full">
                                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute">
                                    <button onClick={(e) => { e.stopPropagation(); updateItemQty(idx, item.quantity - 1); }} className="w-6 h-6 rounded-full bg-surface-container-low hover:bg-black/5 flex items-center justify-center">-</button>
                                    {item.saleType === 'weight' ? (
                                      inlineWeightEdit?.idx === idx ? (
                                        <input
                                          autoFocus
                                          type="text"
                                          inputMode="decimal"
                                          value={inlineWeightEdit.str}
                                          className="w-16 text-center border-b-2 border-primary outline-none bg-transparent font-bold text-primary"
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(',', '.');
                                            if (/^\d*\.?\d{0,2}$/.test(raw)) setInlineWeightEdit({ idx, str: raw });
                                          }}
                                          onBlur={() => {
                                            const n = parseFloat(inlineWeightEdit.str);
                                            if (!isNaN(n) && n > 0) updateItemQty(idx, n);
                                            setInlineWeightEdit(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const n = parseFloat(inlineWeightEdit.str);
                                              if (!isNaN(n) && n > 0) updateItemQty(idx, n);
                                              setInlineWeightEdit(null);
                                            }
                                            if (e.key === 'Escape') setInlineWeightEdit(null);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setInlineWeightEdit({ idx, str: parseFloat(item.quantity.toFixed(2)).toString() }); }}
                                          className="w-12 text-center text-primary underline decoration-primary/30 hover:decoration-primary cursor-pointer truncate"
                                        >{parseFloat(item.quantity.toFixed(2)).toString()}</button>
                                      )
                                    ) : (
                                      <span className="w-8 text-center">{item.quantity}</span>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); updateItemQty(idx, item.quantity + 1); }} className="w-6 h-6 rounded-full bg-surface-container-low hover:bg-black/5 flex items-center justify-center">+</button>
                                  </div>
                                  <span className="group-hover:hidden">
                                    {item.saleType === 'weight' ? `${parseFloat(item.quantity.toFixed(2))} kg` : item.quantity}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-right font-bold text-on-surface-variant align-middle h-[70px]">
                                <div className="flex flex-col justify-center items-end h-full">
                                  {item.price === 0 ? (
                                    <button onClick={() => { setShowPriceModal({ idx, name: item.name }); setPriceInput(''); }} className="text-primary hover:underline bg-primary/10 px-2 py-1 rounded text-xs">Ingresar Precio</button>
                                  ) : (
                                    <>
                                      {item.finalPrice < item.price && (
                                        <span className="text-xs text-on-surface-variant/50 line-through">${formatCurrency(item.price)}</span>
                                      )}
                                      <span className={item.finalPrice < item.price ? 'text-primary font-black' : ''}>
                                        ${formatCurrency(item.finalPrice, true, true)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-5 text-right font-black text-[#9c1c1c] align-middle h-[70px]"><div className="flex items-center justify-end h-full">$ {formatCurrency(item.finalPrice * item.quantity, true, true)}</div></td>
                            </tr>
                          );
                        })}
                        {cart.length === 0 && (<tr><td colSpan={5} className="px-6 py-16 text-center text-on-surface-variant">Escanea un producto para comenzar.</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex gap-4 mt-6 flex-shrink-0"><button onClick={() => { setDiscountInput(globalDiscount.toString()); setShowDiscountModal(true); }} className={`flex items-center gap-2 border border-outline-variant/20 px-6 py-3 rounded-xl font-bold text-sm transition-all ${globalDiscount > 0 ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`}><span className="material-symbols-outlined text-[18px]">percent</span> {globalDiscount > 0 ? `Descuento ${globalDiscount}%` : 'Aplicar Descuento'}</button><div className="flex-1"></div><p className="text-[10px] text-on-surface-variant font-bold uppercase self-center tracking-widest">Flechas ↑↓ para navegar • Del para borrar</p></div>
              </div>{/* close tab content wrapper */}
            </div>

            <div className="w-1/3 bg-[#f8f9fa] flex flex-col relative h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto no-scrollbar p-5 pb-32">
                {/* Asociar Cliente Widget */}
                <div className="bg-white rounded-3xl p-5 border border-outline-variant/10 shadow-sm mb-5 shrink-0">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Cliente Asociado</span>
                    {validatedCustomer && (
                      <button onClick={() => { setValidatedCustomer(null); setCcDni(''); }} className="text-xs text-error font-bold flex items-center gap-0.5 hover:underline">
                        Desasociar
                      </button>
                    )}
                  </div>
                  {validatedCustomer ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {validatedCustomer.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-on-background truncate">{validatedCustomer.name}</p>
                          <p className="text-[9px] text-on-surface-variant font-medium">DNI: {validatedCustomer.dni || 'Sin DNI'}</p>
                        </div>
                        {/* Birthday Indicator */}
                        {(() => {
                          if (!validatedCustomer.birthday) return null;
                          const today = new Date();
                          const parts = validatedCustomer.birthday.split('-');
                          if (parts.length >= 2) {
                            const bMonth = parseInt(parts[parts.length - 2]);
                            const bDay = parseInt(parts[parts.length - 1]);
                            const isBirthday = today.getMonth() + 1 === bMonth && today.getDate() === bDay;
                            if (isBirthday) {
                              return (
                                <span className="bg-pink-100 text-pink-600 text-[9px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-0.5 animate-bounce shrink-0">
                                  <span className="material-symbols-outlined text-[10px]">cake</span> Cumple
                                </span>
                              );
                            }
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Buscar por DNI..."
                        value={ccDni}
                        onChange={e => setCcDni(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleValidatePOSCustomer(); } }}
                        className="flex-1 bg-surface-container-low border border-outline-variant/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-primary"
                      />
                      <button onClick={handleValidatePOSCustomer} className="bg-primary hover:bg-primary/95 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center shrink-0 shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">person_search</span>
                      </button>
                    </div>
                  )}
                  {ccError && !validatedCustomer && <p className="text-error text-[10px] font-bold mt-1.5 ml-1">{ccError}</p>}
                </div>

                <div className="bg-[#b31414] text-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(179,20,20,0.3)] mb-6 relative overflow-hidden shrink-0">
                  <span className="material-symbols-outlined absolute -right-6 -bottom-6 text-[150px] opacity-10">point_of_sale</span>
                  <p className="font-bold text-xs tracking-[0.2em] uppercase mb-2 text-white/80">Monto Final</p>
                  <p className="text-6xl font-black mb-6 flex items-start gap-2"><span className="text-2xl mt-2">$</span> {formatCurrency(cartTotal, true, true)}</p>
                  <div className="flex justify-between text-xs font-bold text-white/80 pt-5 border-t border-white/20">
                    <div className="flex flex-col gap-1">
                      <span>Subtotal: $ {formatCurrency(subtotal, true, true)}</span>
                      {globalDiscount > 0 && <span className="text-white/60">Desc ({globalDiscount}%): -${formatCurrency(discountAmount, true, true)}</span>}
                    </div>
                    <span className="self-end">Tax (0%): $ 0,00</span>
                  </div>
                </div>

                <div className="flex gap-3 mb-8 shrink-0">
                  <button onClick={() => { setCart([]); setGlobalDiscount(0); updateTab({ shoppingSessionId: null }); }} className="flex-1 bg-white border border-outline-variant/10 rounded-2xl py-6 flex flex-col items-center justify-center gap-1 font-bold text-[10px] text-error shadow-sm hover:bg-error/5 transition-all"><span className="material-symbols-outlined text-[20px]">receipt_long</span> F4 - Nuevo</button>
                  <button onClick={() => { if (cart.length > 0) { inputRef.current?.blur(); setShowPaymentModal(true); } }} className={`flex-[1] bg-[#ffeb3b] text-black rounded-2xl py-4 flex flex-col items-center justify-center gap-1 font-black text-xs shadow-lg transition-all border border-[#fdd835] ${cart.length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}><span className="material-symbols-outlined text-[22px]">credit_card</span>F2 - COBRAR</button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowGenericModal(true)}
                    className="bg-primary hover:bg-[#9c1c1c] text-black rounded-2xl py-8 flex items-center justify-center gap-1.5 font-bold shadow-md shadow-yellow-200/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs w-full"
                  >
                    <span className="material-symbols-outlined text-[18px] shrink-0">add_shopping_cart</span>
                    <span className="font-black truncate">Prod. Común</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrePurchaseCodeInput('');
                      setPrePurchaseError('');
                      setShowPrePurchaseModal(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white rounded-2xl py-8 flex items-center justify-center gap-1.5 font-bold shadow-md shadow-green-200/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs w-full"
                  >
                    <span className="material-symbols-outlined text-[18px] shrink-0">assignment_turned_in</span>
                    <span className="font-black truncate">Pre-compra</span>
                  </button>
                </div>
              </div>


            </div>

            {showPaymentModal && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[3rem] w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
                  <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest flex-shrink-0"><h3 className="text-2xl font-black">Finalizar Venta</h3><button onClick={() => setShowPaymentModal(false)} className="w-10 h-10 rounded-full bg-surface-container-low hover:bg-black/5 flex items-center justify-center"><span className="material-symbols-outlined">close</span></button></div>
                  <div className="p-5 flex-1 overflow-y-auto no-scrollbar">
                    <div className="text-center mb-8"><p className="text-sm font-bold text-on-surface-variant uppercase mb-2 tracking-widest">Total a Pagar</p><p className="text-6xl font-black text-primary">${formatCurrency(cartTotal, true, true)}</p></div>
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      {PAYMENT_METHODS
                        .filter(m => m.id !== 'cuenta_corriente' || (validatedCustomer && validatedCustomer.hasCurrentAccount))
                        .map(m => (
                          <button key={m.id} onClick={() => { setSelectedPaymentMethod(m.id); setCcError(''); }} className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${selectedPaymentMethod === m.id ? 'border-primary bg-primary/5 text-primary scale-[1.02] shadow-lg shadow-primary/10' : 'border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-lowest'}`}>
                            <span className="material-symbols-outlined text-[32px]">{m.icon}</span>
                            <span className="font-bold">{m.label}</span>
                          </button>
                        ))
                      }
                    </div>
                    {selectedPaymentMethod === 'cuenta_corriente' && validatedCustomer && (
                      <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-green-600">check_circle</span>
                          <div>
                            <p className="text-xs font-bold text-green-800">{validatedCustomer.name}</p>
                            <p className="text-[10px] text-green-600 font-medium tracking-tight">DNI: {validatedCustomer.dni} • Cuenta Corriente Habilitada</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase">Deuda Actual</p>
                          <p className="text-sm font-black text-primary">${formatCurrency(validatedCustomer.currentDebt)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-8 border-t border-outline-variant/10 bg-surface-container-lowest flex-shrink-0"><button onClick={() => handleCompleteSale(false)} className="w-full bg-primary text-white font-black text-xl py-6 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-transform">Confirmar y Cobrar (Enter)</button><p className="text-center text-[10px] font-bold text-on-surface-variant uppercase mt-4 tracking-widest">Enter para cobrar</p></div>
                </div>
              </div>
            )}

            {showDiscountModal && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 p-8"><h3 className="text-xl font-black mb-6 text-center">Aplicar Descuento</h3><div className="relative mb-6"><input ref={discountRef} type="number" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder="0" className="w-full bg-surface-container-low border-2 border-outline-variant/10 rounded-2xl py-4 px-6 text-4xl font-black text-center outline-none focus:border-primary" /><span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant opacity-50">%</span></div><div className="flex gap-3"><button onClick={() => setShowDiscountModal(false)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl transition-colors">Cancelar</button><button onClick={() => { const val = parseFloat(discountInput); if (!isNaN(val) && val >= 0 && val <= 100) setGlobalDiscount(val); setShowDiscountModal(false); }} className="flex-1 bg-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">Aplicar</button></div></div>
              </div>
            )}

            {showPriceModal && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 p-8"><h3 className="text-xl font-black mb-2 text-center">Ingresar Precio</h3><p className="text-sm text-on-surface-variant text-center mb-6">{showPriceModal.name}</p><div className="relative mb-6"><span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant opacity-50">$</span><input ref={priceRef} type="number" value={priceInput} onChange={e => setPriceInput(e.target.value)} placeholder="0.00" className="w-full bg-surface-container-low border-2 border-outline-variant/10 rounded-2xl py-4 px-12 text-3xl font-black text-center outline-none focus:border-primary" /></div><div className="flex gap-3"><button onClick={() => setShowPriceModal(null)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl transition-colors">Cancelar</button><button onClick={() => { const val = parseFloat(priceInput); if (!isNaN(val) && val >= 0) { setCart(cArr => cArr.map((c, i) => i === showPriceModal.idx ? { ...c, price: val } : c)); setShowPriceModal(null); } }} className="flex-1 bg-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">Guardar</button></div></div>
              </div>
            )}

            {showCloseConfirm && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 p-8 text-center"><div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6"><span className="material-symbols-outlined text-[32px]">lock</span></div><h3 className="text-xl font-black mb-2">¿Cerrar Caja Diaria?</h3><p className="text-sm text-on-surface-variant mb-8 leading-relaxed">Esta acción guardará el resumen en analíticas y reiniciará la actividad actual. ¿Deseas continuar?</p><div className="flex flex-col gap-3"><button onClick={handleCashClose} className="w-full bg-error text-white font-bold py-4 rounded-2xl shadow-lg shadow-error/20 hover:bg-error/90 transition-all">Confirmar Cierre</button><button onClick={() => setShowCloseConfirm(false)} className="w-full py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">Cancelar</button></div></div>
              </div>
            )}

            {/* SUCCESS MODAL WITH WHATSAPP BUTTON */}
            {showSuccessModal && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[500] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 p-10 text-center relative">
                  <div className="w-20 h-20 bg-[#e6fcf0] text-[#00c853] rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-[42px] font-black">check</span>
                  </div>
                  <h3 className="text-2xl font-black mb-2 text-[#2d2828]">¡Venta Exitosa!</h3>
                  <p className="text-on-surface-variant mb-8 font-medium text-sm text-[#5d5454]">La operación #{showSuccessModal.orderId} se ha registrado correctamente.</p>

                  <div className="bg-[#f5f3f3] rounded-[1.75rem] p-6 mb-8 text-left space-y-3.5">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider">Cliente</span><span className="font-extrabold text-sm text-[#2d2828]">{showSuccessModal.customer}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider">Total</span><span className="text-lg font-black text-[#b71c1c]">${formatCurrency(showSuccessModal.total, true, true)}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider">Pago</span><span className="text-[10px] font-black uppercase bg-white text-[#2d2828] px-3 py-1 rounded-full border border-outline-variant/10 shadow-sm">{getPaymentMethodDisplay(showSuccessModal.paymentMethod)}</span></div>
                  </div>

                  <div className="space-y-3">
                    {lastSaleTicket && (
                      <button
                        onClick={() => { setShowTicket(lastSaleTicket); }}
                        className="w-full bg-[#b71c1c] text-white font-black py-4.5 rounded-[1.25rem] shadow-lg shadow-red-900/10 hover:bg-[#a31919] transition-all flex items-center justify-center gap-2.5 text-sm"
                      >
                        <span className="material-symbols-outlined text-[20px]">print</span>
                        Imprimir Ticket
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const initialPhone = showSuccessModal.phone || (validatedCustomer?.phone || '');
                        setWhatsappTicketPhone(initialPhone);
                        setWhatsappTicketError('');
                        setWhatsappTicketSuccess(false);
                        if (lastSaleTicket) {
                          setShowWhatsAppTicketModal({
                            ticket: lastSaleTicket,
                            phone: initialPhone
                          });
                          setTimeout(() => whatsappPhoneInputRef.current?.focus(), 150);
                        }
                      }}
                      className="w-full bg-[#20ba56] text-white font-black py-4.5 rounded-[1.25rem] shadow-lg shadow-green-500/10 hover:bg-[#1caa4e] transition-all flex items-center justify-center gap-2.5 text-sm"
                    >
                      <span className="material-symbols-outlined text-[20px]">chat</span>
                      Notificar por WhatsApp
                    </button>
                    <button
                      onClick={() => { setShowSuccessModal(null); setTimeout(() => inputRef.current?.focus(), 100); }}
                      className="w-full py-3 font-black text-sm text-[#5d5454] hover:bg-black/5 rounded-[1.25rem] transition-colors mt-2"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Movement Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowManualModal(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest"><h3 className="text-xl font-black">Pago a Proveedor</h3><button onClick={() => setShowManualModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5"><span className="material-symbols-outlined">close</span></button></div>
            <form onSubmit={handleRegisterManual} className="p-8 space-y-6">
              <div><label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block">Monto</label><input type="number" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-2xl py-4 px-4 text-2xl font-black outline-none" placeholder="0.00" autoFocus /></div>
              <div><label className="text-xs font-bold text-on-surface-variant uppercase mb-2 block">Proveedor</label><input type="text" required value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 font-medium outline-none" /></div>
              <button type="submit" className="w-full bg-[#9c1c1c] text-white font-black py-4 rounded-xl shadow-lg shadow-red-900/10 hover:bg-[#7a1515] transition-colors">Registrar Egreso</button>
            </form>
          </div>
        </div>
      )}

      {/* Cash Close Confirm with Withdrawal Step */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowCloseConfirm(false); setWithdrawals([]); }} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center"><span className="material-symbols-outlined text-[28px]">lock</span></div>
              <div><h3 className="text-xl font-black">Cierre de Caja Diario</h3><p className="text-xs text-on-surface-variant">Registrá retiros antes de confirmar el cierre</p></div>
            </div>

            {/* Withdrawal form */}
            <div className="p-6 space-y-4">
              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 space-y-3">
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider">Retiros de Efectivo</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Monto" value={wdAmount} onChange={e => setWdAmount(e.target.value)} className="flex-1 bg-white border border-outline-variant/20 rounded-xl px-0 py-2 text-sm font-bold outline-none focus:border-primary" />
                  <input type="text" placeholder="Motivo" value={wdReason} onChange={e => setWdReason(e.target.value)} className="flex-[2] bg-white border border-outline-variant/20 rounded-xl px-0 py-2 text-sm font-medium outline-none focus:border-primary" />
                  <button onClick={() => {
                    if (!wdAmount || parseFloat(wdAmount) <= 0 || !wdReason) return;
                    setWithdrawals(prev => [...prev, { id: `WD-${Date.now()}`, amount: parseFloat(wdAmount), reason: wdReason, user: cashierName, timestamp: Date.now() }]);
                    setWdAmount(''); setWdReason('');
                  }} className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">Agregar</button>
                </div>
                {withdrawals.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {withdrawals.map((w, i) => (
                      <div key={w.id} className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
                        <div><p className="text-xs font-bold text-orange-800">{w.reason}</p><p className="text-[10px] text-orange-600">{w.user}</p></div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-orange-700">-${formatCurrency(w.amount, true, true)}</span>
                          <button onClick={() => setWithdrawals(prev => prev.filter((_, idx) => idx !== i))} className="text-error hover:bg-error/10 rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-outline-variant/10">
                      <span className="text-xs font-bold text-on-surface-variant uppercase">Total Retiros</span>
                      <span className="font-black text-orange-700">${formatCurrency(totalWithdrawals, true, true)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-on-surface-variant font-medium">Efectivo en Caja</span><span className="font-bold">${formatCurrency(stats.currentBox, true, true)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-on-surface-variant font-medium">Retiros</span><span className="font-bold text-orange-600">-${formatCurrency(totalWithdrawals, true, true)}</span></div>
                <div className="flex justify-between text-sm pt-2 border-t border-outline-variant/10"><span className="font-bold">Efectivo esperado</span><span className="font-black text-primary">${formatCurrency(stats.currentBox - totalWithdrawals, true, true)}</span></div>
              </div>
            </div>

            <div className="p-6 border-t border-outline-variant/10 flex gap-3">
              <button onClick={() => { setShowCloseConfirm(false); setWithdrawals([]); }} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">Cancelar</button>
              <button onClick={handleCashClose} className="flex-[2] bg-error text-white font-bold py-4 rounded-2xl shadow-lg shadow-error/20 hover:bg-error/90 transition-all">Confirmar Cierre</button>
            </div>
          </div>
        </div>
      )}

      {/* Movement Detail Modal */}
      {selectedMovement && (
        <MovementDetailModal
          movement={selectedMovement}
          relatedOrder={orders.find(o => o.id === selectedMovement.orderId) || null}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedMovement(null)}
        />
      )}

      {/* Ticket Printer */}
      {showTicket && (
        <TicketPrinter ticket={showTicket} onClose={() => setShowTicket(null)} />
      )}
      {/* Cash Register Open Modal */}
      {showCashOpenModal && (() => {
        const lastDailyClose = cashCloses.find(c => c.period === 'diario');
        const expected = lastDailyClose?.openingControlExpected ?? 0;
        const arqueoNum = parseFloat(arqueoContado.replace(',', '.')) || 0;
        const arqueoDiff = arqueoNum - expected;
        const diffColor = arqueoDiff === 0 ? 'text-green-600' : arqueoDiff > 0 ? 'text-blue-600' : 'text-red-600';
        const diffLabel = arqueoDiff === 0 ? 'Caja cuadrada ✓' : arqueoDiff > 0 ? 'Sobrante' : 'Faltante';

        const handleConfirmArqueo = () => {
          if (arqueoContado === '') return;
          if (lastDailyClose) {
            updateCashCloseOpeningControl(lastDailyClose.id, {
              counted: arqueoNum,
              notes: arqueoNotes,
              checkedBy: 'Admin',
            });
          }
          // Abre la caja directamente con el monto contado — sin segundo paso
          openCashRegister(arqueoNum);
          setShowCashOpenModal(false);
          setShowModal(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        };

        const handleSkipArqueo = () => {
          // Sin arqueo: va al paso de ingresar monto inicial precargado con el cierre anterior
          const prevCash = lastDailyClose && lastDailyClose.openingControlExpected != null 
            ? Math.max(0, lastDailyClose.openingControlExpected) 
            : 0;
          setCashOpenAmount(prevCash > 0 ? String(prevCash) : '');
          setCashOpenStep('open');
        };

        return (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-in fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCashOpenModal(false)} />
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">

              {cashOpenStep === 'arqueo' && lastDailyClose ? (
                <>
                  {/* PASO 1: Arqueo de apertura */}
                  <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-[28px]">lock_open</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black">Arqueo de Apertura</h3>
                      <p className="text-xs text-on-surface-variant">Verificá el efectivo antes de abrir — Último cierre: {lastDailyClose.date}</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-5">
                    {/* Efectivo esperado */}
                    <div className="bg-surface-container-low rounded-2xl p-4 flex justify-between items-center">
                      <span className="font-bold text-sm text-on-surface-variant">Efectivo esperado según último cierre:</span>
                      <span className="font-black text-lg text-primary">${formatCurrency(expected)}</span>
                    </div>
                    {/* Campo: efectivo encontrado */}
                    <div>
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 block ml-1">Efectivo real encontrado *</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant/50">$</span>
                        <input
                          type="number"
                          min="0"
                          value={arqueoContado}
                          onChange={e => setArqueoContado(e.target.value)}
                          placeholder="0"
                          className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-2xl py-5 pl-12 pr-6 text-3xl font-black text-center outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter' && arqueoContado !== '') handleConfirmArqueo(); }}
                        />
                      </div>
                    </div>
                    {/* Diferencia en tiempo real */}
                    {arqueoContado !== '' && (
                      <div className={`rounded-2xl p-4 flex justify-between items-center ${arqueoDiff === 0 ? 'bg-green-50' : arqueoDiff > 0 ? 'bg-blue-50' : 'bg-red-50'
                        }`}>
                        <span className="font-black text-sm uppercase tracking-wide">Diferencia:</span>
                        <div className="text-right">
                          <p className={`font-black text-xl ${diffColor}`}>
                            {arqueoDiff > 0 ? '+' : ''}{arqueoDiff < 0 ? '-' : ''}${formatCurrency(Math.abs(arqueoDiff))}
                          </p>
                          <p className={`text-[10px] font-black uppercase tracking-wider ${diffColor}`}>{diffLabel}</p>
                        </div>
                      </div>
                    )}
                    {/* Observaciones */}
                    <div>
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 block ml-1">Observaciones (opcional)</label>
                      <input
                        type="text"
                        value={arqueoNotes}
                        onChange={e => setArqueoNotes(e.target.value)}
                        placeholder="Ej: Faltaban $2.000, consultado con cajero anterior..."
                        className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 font-medium text-sm outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </div>
                  <div className="p-6 border-t border-outline-variant/10 flex gap-3">
                    <button onClick={handleSkipArqueo} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors text-sm">
                      Omitir arqueo
                    </button>
                    <button
                      onClick={handleConfirmArqueo}
                      disabled={arqueoContado === ''}
                      className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                      Confirmar y abrir caja
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* PASO 2: Efectivo inicial */}
                  <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-[28px]">point_of_sale</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black">Abrir Caja</h3>
                      <p className="text-xs text-on-surface-variant">Registrá el efectivo inicial para comenzar</p>
                    </div>
                  </div>
                  <div className="p-8 space-y-6">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 block">Efectivo Inicial en Caja</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant/50">$</span>
                        <input
                          type="number"
                          value={cashOpenAmount}
                          onChange={e => setCashOpenAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-2xl py-5 pl-12 pr-6 text-3xl font-black text-center outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleRegisterInitialCash(); }}
                        />
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-2 text-center italic">Ingresá $0 si no hay efectivo inicial</p>
                    </div>
                    <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-on-surface-variant font-medium flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">person</span> Usuario
                        </span>
                        <span className="font-bold">Admin</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-on-surface-variant font-medium flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">schedule</span> Fecha / Hora
                        </span>
                        <span className="font-bold">{new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-outline-variant/10 flex gap-3">
                    <button onClick={() => setShowCashOpenModal(false)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleRegisterInitialCash}
                      className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[20px]">lock_open</span>
                      Registrar dinero inicial en caja
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Generic Product Modal */}
      {showGenericModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowGenericModal(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className="w-12 h-12 bg-[#FFD700]/30 text-[#8B6508] rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">add_shopping_cart</span>
              </div>
              <div>
                <h3 className="text-xl font-black">Producto Común</h3>
                <p className="text-xs text-on-surface-variant">Agregá un producto que no está en inventario</p>
              </div>
            </div>
            <div className="p-8 space-y-5">
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Descripción</label>
                <input
                  type="text"
                  value={genericDesc}
                  onChange={e => setGenericDesc(e.target.value)}
                  placeholder="Ej: Pan casero, Empanadas..."
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Cantidad</label>
                  <div className="flex bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl overflow-hidden h-[50px]">
                    <button type="button" onClick={() => setGenericQty(Math.max(1, genericQty - 1))} className="w-10 flex items-center justify-center hover:bg-black/5 font-bold text-lg">-</button>
                    <input type="number" min="1" className="flex-1 w-full text-center font-bold text-lg bg-transparent outline-none" value={genericQty} onChange={e => setGenericQty(parseInt(e.target.value) || 1)} />
                    <button type="button" onClick={() => setGenericQty(genericQty + 1)} className="w-10 flex items-center justify-center hover:bg-black/5 font-bold text-lg">+</button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Precio unitario</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant/50">$</span>
                    <input
                      type="number"
                      value={genericPrice}
                      onChange={e => setGenericPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 pl-8 pr-4 font-black text-lg outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddGenericProduct(); }}
                    />
                  </div>
                </div>
              </div>
              {genericDesc && genericPrice && parseFloat(genericPrice) > 0 && (
                <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 flex justify-between items-center animate-in fade-in">
                  <span className="text-sm font-bold text-on-surface-variant">Total línea</span>
                  <span className="text-xl font-black text-primary">${(parseFloat(genericPrice) * genericQty).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-outline-variant/10 flex gap-3">
              <button onClick={() => { setShowGenericModal(false); setGenericDesc(''); setGenericPrice(''); setGenericQty(1); }} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleAddGenericProduct}
                disabled={!genericDesc.trim() || !genericPrice || parseFloat(genericPrice) <= 0}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[20px]">check</span>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Limit Warning Modal */}
      {showLimitWarning && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLimitWarning(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-red-100 flex items-center gap-4 bg-red-50 text-red-700">
              <div className="w-12 h-12 bg-white text-red-600 rounded-2xl flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[28px]">gavel</span>
              </div>
              <div>
                <h3 className="text-xl font-black leading-tight">Límite Superado</h3>
                <p className="text-xs font-bold opacity-80">{showLimitWarning.customerName}</p>
              </div>
            </div>

            <div className="p-8 space-y-4">
              <p className="text-sm font-bold text-on-background mb-2">Este cliente superó uno o más límites de cuenta corriente. Podés cancelar la operación o continuar bajo tu responsabilidad.</p>

              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Deuda actual:</span>
                  <span className="font-bold">${formatCurrency(showLimitWarning.currentDebt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Total esta compra:</span>
                  <span className="font-bold text-primary">+ ${formatCurrency(showLimitWarning.cartTotal)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-outline-variant/10">
                  <span className="font-black">Nueva deuda:</span>
                  <span className={`font-black ${showLimitWarning.isOverAmount ? 'text-error' : ''}`}>${formatCurrency(showLimitWarning.newDebt)}</span>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Límite permitido:</span>
                  <span className="font-bold">${formatCurrency(showLimitWarning.amountLimit)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-outline-variant/10">
                  <span className="text-on-surface-variant">Deuda más antigua:</span>
                  <span className={`font-bold ${showLimitWarning.isOverTime ? 'text-error' : ''}`}>hace {showLimitWarning.oldestDays} días</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Límite de días:</span>
                  <span className="font-bold">{showLimitWarning.timeLimit} días</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest">
              <button
                onClick={() => setShowLimitWarning(null)}
                className="flex-1 font-bold text-on-surface-variant bg-white border border-outline-variant/10 hover:bg-black/5 py-4 rounded-2xl transition-colors shadow-sm"
              >
                Cancelar
              </button>
              {currentAccountConfig.allowOverride ? (
                <button
                  onClick={() => {
                    setShowLimitWarning(null);
                    handleCompleteSale(true);
                  }}
                  className="flex-[2] bg-red-600 text-white font-black py-4 rounded-2xl hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                >
                  Continuar de todas formas
                </button>
              ) : (
                <div className="flex-[2] bg-surface-container-high text-on-surface-variant font-bold py-4 rounded-2xl text-center text-xs px-2 flex items-center justify-center opacity-70">
                  Override desactivado en Configuración
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────
          MODAL: CARGAR PRE-COMPRA DESDE EL CELULAR DEL CLIENTE
          ──────────────────────────────────────────────────────── */}
      {showPrePurchaseModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPrePurchaseModal(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">assignment_turned_in</span>
              </div>
              <div>
                <h3 className="text-xl font-black">Cargar Pre-compra</h3>
                <p className="text-xs text-on-surface-variant">Importá los productos escaneados por el cliente</p>
              </div>
            </div>

            <form onSubmit={handleLoadPrePurchase} className="p-8 space-y-6">
              {prePurchaseError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{prePurchaseError}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 block">Código de Pre-compra (ej: LM-8F3K9A)</label>
                <input
                  type="text"
                  required
                  placeholder="LM-XXXXXX"
                  value={prePurchaseCodeInput}
                  onChange={e => setPrePurchaseCodeInput(e.target.value)}
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-2xl py-4 px-4 text-center font-black text-2xl outline-none focus:border-primary uppercase tracking-widest font-mono"
                  autoFocus
                  disabled={prePurchaseLoading}
                />
              </div>

              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 text-xs text-on-surface-variant leading-relaxed">
                <p>• Escribí el código que el cliente muestra en la pantalla de su celular.</p>
                <p>• Los productos se cargarán de manera automática en el Punto de Venta.</p>
                <p>• El stock se descontará únicamente al confirmar el cobro final.</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPrePurchaseModal(false)}
                  className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors"
                  disabled={prePurchaseLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={prePurchaseLoading || !prePurchaseCodeInput.trim()}
                  className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prePurchaseLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      <span>Cargando...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">download</span>
                      <span>Importar Carrito</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────
          MODAL: ENVIAR TICKET DIGITAL POR WHATSAPP (POS)
          ──────────────────────────────────────────────────────── */}
      {showWhatsAppTicketModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => {
              if (!isSendingWhatsAppTicket) setShowWhatsAppTicketModal(null);
            }}
          />
          <div className="bg-white rounded-[2.5rem] shadow-2xl relative z-10 w-full max-w-lg animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">chat</span>
                </div>
                <div>
                  <h3 className="text-xl font-black">Enviar Ticket por WhatsApp</h3>
                  <p className="text-xs text-on-surface-variant">Ticket #{showWhatsAppTicketModal.ticket.ticketNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppTicketModal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
                disabled={isSendingWhatsAppTicket}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSendWhatsAppTicket} className="p-6 overflow-y-auto space-y-5 no-scrollbar flex-1">
              {/* Phone Input Field */}
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 block">
                  Número de WhatsApp del Cliente *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 material-symbols-outlined text-[20px]">
                    call
                  </span>
                  <input
                    ref={whatsappPhoneInputRef}
                    type="tel"
                    required
                    placeholder="Ej: 2634877314 o 5492634877314"
                    value={whatsappTicketPhone}
                    onChange={e => {
                      setWhatsappTicketPhone(e.target.value);
                      if (whatsappTicketError) setWhatsappTicketError('');
                    }}
                    className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-2xl py-4 pl-12 pr-4 font-bold text-lg outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10 transition-all font-mono"
                    autoFocus
                    disabled={isSendingWhatsAppTicket || whatsappTicketSuccess}
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1.5 ml-1">
                  Ingresá el número con código de área (sin el 0 ni el 15 si es de Argentina).
                </p>
              </div>

              {/* Error Message */}
              {whatsappTicketError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2.5 animate-in fade-in">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{whatsappTicketError}</span>
                </div>
              )}

              {/* Success Message */}
              {whatsappTicketSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-xs font-bold rounded-2xl flex items-center gap-3 animate-in fade-in">
                  <span className="material-symbols-outlined text-green-600 text-[24px]">check_circle</span>
                  <div>
                    <p className="font-black text-sm">¡Ticket encolado con éxito!</p>
                    <p className="font-medium text-green-700">Se enviará automáticamente por WhatsApp en segundo plano.</p>
                  </div>
                </div>
              )}

              {/* Ticket Preview Box */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block">
                    Vista previa del Ticket
                  </label>
                  <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    Formato WhatsApp
                  </span>
                </div>

                <div className="bg-[#fcfbf9] border-2 border-outline-variant/15 rounded-2xl p-5 font-mono text-xs shadow-inner space-y-3 leading-relaxed select-text">
                  {/* Header Preview */}
                  <div className="text-center pb-3 border-b border-dashed border-outline-variant/30">
                    <p className="font-black text-sm text-[#2d2828] uppercase tracking-wide">
                      {ticketConfig.headerText || 'La Martina'}
                    </p>
                    <p className="font-bold text-[#5d5454] text-[11px]">
                      Ticket: #{showWhatsAppTicketModal.ticket.ticketNumber}
                    </p>
                    <p className="text-[#8c8282] text-[10px]">
                      {showWhatsAppTicketModal.ticket.date}
                    </p>
                    {showWhatsAppTicketModal.ticket.customer && (
                      <p className="text-[10px] text-primary font-bold mt-0.5">
                        Cliente: {showWhatsAppTicketModal.ticket.customer}
                      </p>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-2.5 py-1">
                    {showWhatsAppTicketModal.ticket.items.map((item, i) => {
                      const hasDiscount = item.offerLabel && item.lineDiscount && item.lineDiscount > 0;
                      const qtyStr = item.saleType === 'weight'
                        ? `${parseFloat(item.quantity.toFixed(2))} kg`
                        : `${item.quantity}`;
                      const totalLine = (item.price * item.quantity).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const unitPrice = item.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                      return (
                        <div key={i} className="space-y-0.5 border-b border-black/5 pb-2 last:border-0 last:pb-0">
                          <div className="font-bold text-[#2d2828] text-[11px]">{item.name}</div>
                          <div className="flex justify-between text-[10px] text-[#5d5454]">
                            <span>{qtyStr} x ${unitPrice}</span>
                            <span className="font-bold text-[#2d2828]">${totalLine}</span>
                          </div>
                          {hasDiscount && (
                            <div className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block">
                              ▸ {item.offerLabel} {item.discountedQuantity && item.discountedQuantity < item.quantity ? `(${item.discountedQuantity} un.) ` : ''}(-${(item.lineDiscount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals Preview */}
                  <div className="pt-2 border-t border-dashed border-outline-variant/30 space-y-1 text-[11px]">
                    <div className="flex justify-between text-[#5d5454]">
                      <span>Subtotal</span>
                      <span>${showWhatsAppTicketModal.ticket.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {(() => {
                      const itemDisc = showWhatsAppTicketModal.ticket.items.reduce((acc, it) => acc + (it.lineDiscount || 0), 0);
                      const totalDisc = itemDisc + (showWhatsAppTicketModal.ticket.globalDiscountAmount || 0);
                      if (totalDisc > 0) {
                        return (
                          <div className="flex justify-between text-green-700 font-bold">
                            <span>Descuento</span>
                            <span>-${totalDisc.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex justify-between text-sm font-black text-[#b71c1c] pt-1.5 border-t border-outline-variant/20">
                      <span>TOTAL</span>
                      <span>${showWhatsAppTicketModal.ticket.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-[#5d5454] pt-1">
                      <span>Forma de pago:</span>
                      <span className="font-bold uppercase">{getPaymentMethodDisplay(showWhatsAppTicketModal.ticket.paymentMethod)}</span>
                    </div>
                  </div>

                  {/* Footer Message Preview */}
                  <div className="text-center text-[10px] text-[#8c8282] pt-2 border-t border-dashed border-outline-variant/30 italic">
                    {ticketConfig.footerMessage || '¡Gracias por su compra!'}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-outline-variant/10 flex gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppTicketModal(null)}
                  className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors text-sm"
                  disabled={isSendingWhatsAppTicket || whatsappTicketSuccess}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={isSendingWhatsAppTicket || whatsappTicketSuccess || !whatsappTicketPhone.trim()}
                  className="flex-[2] bg-[#20ba56] text-white font-black py-4 rounded-2xl shadow-lg shadow-green-600/20 hover:bg-[#1caa4e] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingWhatsAppTicket ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">send</span>
                      <span>Enviar por WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
