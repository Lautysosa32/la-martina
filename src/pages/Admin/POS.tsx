import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import { Product } from '../../data/mockData';
import { useAuthStore } from '../../stores/useAuthStore';
import { TicketPrinter, TicketData, TicketItem } from '../../components/TicketPrinter';
import { FiscalTicketPrinter } from '../../components/FiscalTicketPrinter';
import { MovementDetailModal } from '../../components/MovementDetailModal';
import { WeightInputModal } from '../../components/WeightInputModal';
import { BarcodeScannerModal } from '../../components/BarcodeScannerModal';
import type { CashWithdrawal, CashMovement } from '../../context/AdminContext';
import { shoppingSessionService } from '../../services/shopping-session.service';
import { whatsappMessageService, cleanAndFormatPhone } from '../../services/whatsapp-message.service';
import { checkCustomerOverdueDebt } from '../../utils/billing-cycle';
import { parseScaleBarcode } from '../../utils/scale-barcode';
import { useScrollLock } from '../../utils/useScrollLock';
import { supabase } from '../../lib/supabase';
import { saleRepository } from '../../offline/repositories/saleRepository';
import { cashRepository } from '../../offline/repositories/cashRepository';
import { syncEngine } from '../../offline/syncEngine';
import { useConnectionStatus } from '../../offline/hooks/useConnectionStatus';
import { cajaManager } from '../../offline/cajaManager';
import { syncQueue } from '../../offline/syncQueue';
import { OfflineSaleItem } from '../../offline/types';
import { usePOSShortcuts } from '../../hooks/usePOSShortcuts';
import { useProductStore } from '../../stores/useProductStore';
import type { Invoice, InvoiceItem } from '../../context/AdminContext';
import { billingService } from '../../services/billing.service';
import { buildCreatorItemsFromOrders } from '../../utils/billingProductMapper';
import { determineInvoiceType, validateCuit, recalculateFiscalInvoice } from '../../../server/services/arca/arcaTaxRules';

export const generateTicketWhatsAppText = (ticket: TicketData, storeName = 'Martina Supermercado', footerMsg = '¡Gracias por su compra!'): string => {
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
  brand?: string;
  price: number;
  originalPrice?: number | null;
  quantity: number;
  image: string;
  offerDiscount?: number;
  offerLabel?: string | null;
  finalPrice?: number;
  lineDiscount?: number;
  offerId?: string | null;
  discountedQuantity?: number;
  saleType?: 'unit' | 'weight';
  categoryId?: string;
  subcategoryId?: string;
  badge?: string | null;
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
  const {
    customers, cashMovements, addCashMovement, addCashWithdrawal, addAdminOrder, adminProducts,
    performCashClose, lastPOSCloseTimestamp, formatCurrency, applyOffersToCartItem, applyOrderOffers,
    orders, cashRegister, openCashRegister, isCashRegisterOpen, getStock, currentAccountConfig,
    ticketConfig, cashCloses, updateCashCloseOpeningControl,
    invoices, addInvoice, refreshInvoices, checkSaleBilledStatus,
    posConfig
  } = useAdmin();

  const storeProducts = useProductStore((state) => state.products);
  const fetchProducts = useProductStore((state) => state.fetchProducts);
  const updateProduct = useProductStore((state) => state.updateProduct);

  useEffect(() => {
    if (storeProducts.length === 0) {
      fetchProducts();
    }
  }, [storeProducts.length, fetchProducts]);

  const activeCatalogProducts = useMemo(() => {
    return storeProducts.length > 0 ? storeProducts : adminProducts;
  }, [storeProducts, adminProducts]);

  const employeeProfile = useAuthStore((state) => state.employeeProfile);
  const cashierName = employeeProfile ? employeeProfile.name : 'Admin';
  const { isHealthy, cajaId } = useConnectionStatus();

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
        const matchingProduct = activeCatalogProducts.find(
          p => p.id === item.productId || (p.barcode && p.barcode === item.barcode)
        );

        return {
          id: `prepurchase-${item.id}-${Date.now()}-${Math.random()}`,
          productId: item.productId || 'PRODUCTO_COMUN',
          productCode: item.barcode || 'COMUN',
          name: item.name,
          brand: matchingProduct?.brand || '',
          price: matchingProduct ? matchingProduct.price : item.price,
          originalPrice: matchingProduct?.originalPrice || (matchingProduct as any)?.original_price || null,
          quantity: item.quantity,
          image: matchingProduct ? matchingProduct.image : (item.image || ''),
          saleType: matchingProduct?.saleType || 'unit',
          categoryId: matchingProduct?.categoryId || (matchingProduct as any)?.category_id,
          subcategoryId: matchingProduct?.subcategoryId || (matchingProduct as any)?.subcategory_id,
          badge: matchingProduct?.badge
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
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
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

  // --- FISCAL INVOICE STATE (ARCA POS INTEGRATION) ---
  const [lastConfirmedSale, setLastConfirmedSale] = useState<{
    orderId: string;
    customerName: string;
    customerPhone: string;
    customerDni?: string;
    paymentMethod: string;
    total: number;
    subtotal: number;
    discountAmount: number;
    discountLabel?: string;
    items: Array<{
      id?: string;
      productId?: string;
      name: string;
      price: number;
      originalPrice?: number;
      quantity: number;
      saleType?: 'unit' | 'weight';
      barcode?: string;
      finalPrice?: number;
      lineDiscount?: number;
    }>;
  } | null>(null);

  const [showPosFiscalModal, setShowPosFiscalModal] = useState(false);
  const [fiscalCustomerName, setFiscalCustomerName] = useState('Consumidor Final');
  const [fiscalTaxCondition, setFiscalTaxCondition] = useState('Consumidor Final');
  const [fiscalDocType, setFiscalDocType] = useState('SIN_IDENTIFICAR');
  const [fiscalDocNumber, setFiscalDocNumber] = useState('');
  const [fiscalCustomerAddress, setFiscalCustomerAddress] = useState('');
  const [fiscalPointOfSale, setFiscalPointOfSale] = useState(1);
  const [fiscalNextNumber, setFiscalNextNumber] = useState<number | null>(null);
  const [isLoadingNextNumber, setIsLoadingNextNumber] = useState(false);
  const [fiscalInvoiceType, setFiscalInvoiceType] = useState<'A' | 'B' | 'C'>('B');
  const [fiscalTypeReason, setFiscalTypeReason] = useState('');
  const [fiscalError, setFiscalError] = useState('');
  const [isAuthorizingFiscal, setIsAuthorizingFiscal] = useState(false);
  const [fiscalAuthStep, setFiscalAuthStep] = useState('');
  const [authorizedInvoiceResult, setAuthorizedInvoiceResult] = useState<Invoice | null>(null);
  const [unknownOpId, setUnknownOpId] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [enlargedQrUrl, setEnlargedQrUrl] = useState<string | null>(null);
  const [fiscalPrinterInvoice, setFiscalPrinterInvoice] = useState<any | null>(null);
  const [showFiscalPrinterModal, setShowFiscalPrinterModal] = useState(false);
  const [quickFiscalError, setQuickFiscalError] = useState<string | null>(null);
  const [quickFiscalStep, setQuickFiscalStep] = useState<string | null>(null);

  // Selector / buscador rápido de cliente registrado para emisión fiscal
  const [fiscalCustomerSearch, setFiscalCustomerSearch] = useState('');
  const [showFiscalCustomerSearchDropdown, setShowFiscalCustomerSearchDropdown] = useState(false);

  // WhatsApp Fiscal Invoice Modal State (Separated from commercial ticket)
  const [showWhatsAppFiscalModal, setShowWhatsAppFiscalModal] = useState<{ invoice: Invoice; phone: string } | null>(null);
  const [whatsappFiscalPhone, setWhatsappFiscalPhone] = useState('');
  const [isSendingWhatsAppFiscal, setIsSendingWhatsAppFiscal] = useState(false);
  const [whatsappFiscalSuccess, setWhatsappFiscalSuccess] = useState(false);
  const [whatsappFiscalError, setWhatsappFiscalError] = useState('');
  const whatsappFiscalPhoneInputRef = useRef<HTMLInputElement>(null);

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
  const posCustomerDniRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Hook global de atajos de teclado POS (F1, F2, F3, F4, F5, F6, F8, F9, ESC, Ctrl+P)
  usePOSShortcuts({
    enabled: showModal,
    searchInputRef: inputRef,
    customerDniInputRef: posCustomerDniRef,
    quantityInputRef: qtyInputRef,
    onCheckout: () => {
      if (cart.length > 0 && !showPaymentModal && !showDiscountModal && !showPriceModal && !showCloseConfirm && !showSuccessModal && !showWhatsAppTicketModal && !showPosFiscalModal && !showWhatsAppFiscalModal) {
        inputRef.current?.blur();
        setShowPaymentModal(true);
      }
    },
    onClearCart: () => {
      if (!showPaymentModal && !showDiscountModal && !showPriceModal && !showCloseConfirm && !showSuccessModal && !showWhatsAppTicketModal && !showPosFiscalModal && !showWhatsAppFiscalModal) {
        setCart([]);
        setGlobalDiscount(0);
        updateTab({ shoppingSessionId: null });
        setSearchQty(1);
        setSearchQtyStr('1');
      }
    },
    onNewTab: () => {
      if (tabs.length < 4) {
        const newTab = createTab(tabs.length + 1);
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
    },
    onToggleTab: () => {
      if (tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTabId(tabs[nextIndex].id);
      }
    },
    onOpenDiscount: () => {
      if (!showPaymentModal && !showPriceModal && !showCloseConfirm && !showSuccessModal && !showWhatsAppTicketModal && !showPosFiscalModal && !showWhatsAppFiscalModal) {
        setDiscountInput(globalDiscount.toString());
        setShowDiscountModal(true);
      }
    },
    onCloseModalsOrBlur: () => {
      if (enlargedQrUrl) { setEnlargedQrUrl(null); return; }
      if (showWhatsAppFiscalModal) { setShowWhatsAppFiscalModal(null); return; }
      if (showPosFiscalModal) { if (!isAuthorizingFiscal) setShowPosFiscalModal(false); return; }
      if (showWhatsAppTicketModal) { setShowWhatsAppTicketModal(null); return; }
      if (showSuccessModal) { setShowSuccessModal(null); return; }
      if (showDiscountModal) { setShowDiscountModal(false); return; }
      if (showPriceModal) { setShowPriceModal(null); return; }
      if (showPaymentModal) { setShowPaymentModal(false); return; }
      if (showCloseConfirm) { setShowCloseConfirm(false); return; }
      if (showGenericModal) { setShowGenericModal(false); return; }
      if (showPrePurchaseModal) { setShowPrePurchaseModal(false); return; }
      if (showSuggestions) { setShowSuggestions(false); return; }
    },
    onReprintLastTicket: () => {
      if (lastSaleTicket) {
        setShowTicket(lastSaleTicket);
      }
    }
  });

  // --- LIVE SEARCH STATE ---
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState<number>(-1);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchCode.trim()) return [];
    const search = searchCode.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!search) return [];

    const scored: { product: Product; score: number }[] = [];
    for (const p of activeCatalogProducts) {
      const barcode = (p.barcode || '').trim().toLowerCase();
      const name = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const brand = (p.brand || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

      let score = -1;
      if (barcode === search) {
        score = 100; // Coincidencia exacta de código de barras
      } else if (barcode.startsWith(search)) {
        score = 90;  // Prefijo de código de barras
      } else if (name.startsWith(search)) {
        score = 80;  // El nombre empieza exactamente con lo buscado (ej: "Leche...")
      } else {
        const words = name.split(/\s+/);
        if (words.some(w => w.startsWith(search))) {
          score = 70; // Alguna palabra interna empieza con la búsqueda (ej: "Dulce de Leche")
        } else if (name.includes(search)) {
          score = 50; // Contenido en alguna parte del nombre
        } else if (brand.startsWith(search)) {
          score = 40; // Marca empieza con la búsqueda
        } else if (brand.includes(search)) {
          score = 30; // Marca contiene la búsqueda
        } else if (barcode.includes(search)) {
          score = 20; // Código contiene los dígitos
        }
      }

      if (score > 0) {
        scored.push({ product: p, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(s => s.product);
  }, [searchCode, activeCatalogProducts]);

  // Stats
  const stats = useMemo(() => {
    const initialAmount = cashRegister?.initialAmount || 0;
    let cashNew = 0; // Efectivo nuevo de ventas/cobros del período
    let card = 0, transfer = 0;
    let netMovements = 0; // Ingresos menos egresos/retiros del período (sin incluir monto inicial)

    cashMovements.forEach(m => {
      if (m.timestamp > lastPOSCloseTimestamp) {
        const isVenta = m.description.includes('Venta Local');
        const isPagoCC = m.description.includes('Pago Cta. Corriente');
        const descLower = m.description.toLowerCase();
        const method = (descLower.includes('(card)') || descLower.includes('(tarjeta)')) ? 'card' :
          (descLower.includes('(transfer)') || descLower.includes('(transferencia)')) ? 'transfer' :
            (descLower.includes('(cuenta_corriente)') || descLower.includes('(cta. corriente)')) ? 'cuenta_corriente' : 'cash';

        if (isVenta || isPagoCC) {
          if (method === 'cash') cashNew += m.amount;
          else if (method === 'card') card += m.amount;
          else if (method === 'transfer') transfer += m.amount;
        }

        if (m.type === 'Ingreso') {
          // No sumamos las ventas a cuenta corriente a la caja física (es dinero no ingresado)
          if (method !== 'cuenta_corriente') {
            netMovements += m.amount;
          }
        }
        if (m.type === 'Egreso' || m.type === 'Retiro') {
          // Excluimos PAGO PROVEEDOR de restar de la caja chica/actual en vivo
          if (!m.description.startsWith('PAGO PROVEEDOR:')) {
            netMovements -= m.amount;
          }
        }
      }
    });

    const totalToday = netMovements; // Total generado en el día/período (sin el inicio)
    const cashTotal = initialAmount + cashNew; // Total de efectivo en caja: inicio + nuevo
    const currentBox = initialAmount + netMovements; // Total real en caja con inicio incluido

    return {
      cash: cashNew, // Efectivo nuevo generado hoy
      cashTotal,     // Efectivo total en caja (inicio + nuevo)
      initialAmount, // Monto con el que inició la caja
      totalToday,    // Total de hoy (menos el inicio)
      card,
      transfer,
      currentBox
    };
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

  const handleCashClose = async () => {
    // Register withdrawals as movements before close
    withdrawals.forEach(w => addCashWithdrawal(w));

    // Realizar el cierre canónico completo (incluye todos los pedidos, ventas, retiros y arqueo)
    const result = performCashClose(withdrawals);
    if (result === null) {
      // Register was already closed — show feedback and abort
      setShowCloseConfirm(false);
      setWithdrawals([]);
      setShowWithdrawalModal(false);
      alert('La caja ya se encuentra cerrada.');
      return;
    }

    // Conteo de operaciones pendientes en este momento
    const pendingCount = await syncQueue.getPendingCount();

    // Registrar en cashRepository (IndexedDB + cola de sync) con el MISMO ID canónico y datos completos
    try {
      await cashRepository.createCashClose({
        id: result.id,
        date: result.date,
        period: result.period,
        total_sales: result.totalSales,
        total_orders: result.totalOrders,
        cash_payments: result.cashPayments,
        card_payments: result.cardPayments,
        transfer_payments: result.transferPayments,
        cuenta_corriente_payments: result.cuentaCorrientePayments || 0,
        initial_amount: result.initialAmount,
        total_withdrawals: result.totalWithdrawals,
        closed_at: result.closedAt,
        closed_by: cashierName,
        pending_sync_count: pendingCount,
        withdrawals: withdrawals.map(w => ({ amount: w.amount, reason: w.reason, timestamp: w.timestamp }))
      });
    } catch (err) {
      console.warn('Error saving cash close to local repository:', err);
    }

    // Si hay conexión, sincronizar de inmediato
    if (isHealthy) {
      syncEngine.syncNow().catch(e => console.warn('Background sync after cash close:', e));
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
      // Buscar en activeCatalogProducts si faltan metadatos para ofertas por categoría / subcategoría / etiqueta / marca
      const catProduct = (!item.categoryId || !item.subcategoryId || !item.brand)
        ? activeCatalogProducts.find(p => p.id === item.productId || (p.barcode && p.barcode === item.productCode))
        : null;

      const categoryId = item.categoryId || catProduct?.categoryId || (catProduct as any)?.category_id;
      const subcategoryId = item.subcategoryId || catProduct?.subcategoryId || (catProduct as any)?.subcategory_id;
      const badge = item.badge !== undefined ? item.badge : catProduct?.badge;
      const brand = (item.brand !== undefined && item.brand !== null) ? item.brand : (catProduct?.brand || '');
      const originalPrice = item.originalPrice !== undefined && item.originalPrice !== null
        ? item.originalPrice
        : (catProduct?.originalPrice || (catProduct as any)?.original_price || null);

      const basePrice = (originalPrice && originalPrice > item.price) ? originalPrice : item.price;

      const calculation = applyOffersToCartItem(
        {
          productId: item.productId,
          productCode: item.productCode,
          categoryId,
          subcategoryId,
          badge,
          price: basePrice,
          originalPrice,
          quantity: item.quantity
        },
        validatedCustomer
      );
      return {
        ...item,
        brand,
        categoryId,
        subcategoryId,
        badge,
        originalPrice: calculation.originalPrice || originalPrice || item.price,
        finalPrice: calculation.finalPrice,
        lineDiscount: calculation.discountAmount,
        offerLabel: calculation.offerLabel,
        offerId: calculation.offerId,
        discountedQuantity: calculation.discountedQuantity
      };
    });
  }, [cart, validatedCustomer, applyOffersToCartItem, activeCatalogProducts]);

  const subtotal = cartWithDiscounts.reduce((s, i) => s + (((i.originalPrice && i.originalPrice > i.finalPrice) ? i.originalPrice : i.price) * i.quantity), 0);
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
    let brand = '';
    let price: number;
    let originalPrice: number | null = null;
    let image: string;
    let saleType: 'unit' | 'weight' = 'unit';
    let itemQuantity = searchQty;
    let categoryId: string | undefined;
    let subcategoryId: string | undefined;
    let badge: string | null | undefined;

    if (typeof productOrCode !== 'string') {
      productId = productOrCode.id;
      productCode = productOrCode.barcode || productOrCode.id;
      name = productOrCode.name;
      brand = productOrCode.brand || '';
      price = productOrCode.price;
      originalPrice = productOrCode.originalPrice || (productOrCode as any).original_price || null;
      image = productOrCode.image;
      saleType = productOrCode.saleType || 'unit';
      categoryId = productOrCode.categoryId || (productOrCode as any).category_id;
      subcategoryId = productOrCode.subcategoryId || (productOrCode as any).subcategory_id;
      badge = productOrCode.badge;
    } else {
      const cleanCode = productOrCode.trim();
      if (!cleanCode) return;

      // 1. Detectar si es un código de balanza comercial (EAN-13 balanza prefijo 20/21/22)
      const scaleResult = parseScaleBarcode(cleanCode, activeCatalogProducts);
      if (scaleResult.isScaleBarcode && scaleResult.product) {
        const sp = scaleResult.product;
        productId = sp.id;
        productCode = sp.barcode || sp.id;
        name = sp.name;
        brand = sp.brand || '';
        price = sp.price;
        originalPrice = sp.originalPrice || (sp as any).original_price || null;
        image = sp.image;
        saleType = 'weight';
        itemQuantity = scaleResult.weightKg || 1;
        categoryId = sp.categoryId || (sp as any).category_id;
        subcategoryId = sp.subcategoryId || (sp as any).subcategory_id;
        badge = sp.badge;
      } else {
        const cleanLower = cleanCode.toLowerCase();
        const exactMatch = activeCatalogProducts.find(p => {
          const barcodeStr = p.barcode ? String(p.barcode).trim().toLowerCase() : '';
          const idStr = p.id ? String(p.id).trim().toLowerCase() : '';
          return (barcodeStr && barcodeStr === cleanLower) || (idStr && idStr === cleanLower);
        });
        if (exactMatch) {
          productId = exactMatch.id;
          productCode = exactMatch.barcode || exactMatch.id;
          name = exactMatch.name;
          brand = exactMatch.brand || '';
          price = exactMatch.price;
          originalPrice = exactMatch.originalPrice || (exactMatch as any).original_price || null;
          image = exactMatch.image;
          saleType = exactMatch.saleType || 'unit';
          categoryId = exactMatch.categoryId || (exactMatch as any).category_id;
          subcategoryId = exactMatch.subcategoryId || (exactMatch as any).subcategory_id;
          badge = exactMatch.badge;
        } else if (filteredProducts.length > 0) {
          const firstSug = filteredProducts[0];
          productId = firstSug.id;
          productCode = firstSug.barcode || firstSug.id;
          name = firstSug.name;
          brand = firstSug.brand || '';
          price = firstSug.price;
          originalPrice = firstSug.originalPrice || (firstSug as any).original_price || null;
          image = firstSug.image;
          saleType = firstSug.saleType || 'unit';
          categoryId = firstSug.categoryId || (firstSug as any).category_id;
          subcategoryId = firstSug.subcategoryId || (firstSug as any).subcategory_id;
          badge = firstSug.badge;
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
          brand: newCart[existingIdx].brand || brand,
          categoryId: newCart[existingIdx].categoryId || categoryId,
          subcategoryId: newCart[existingIdx].subcategoryId || subcategoryId,
          badge: newCart[existingIdx].badge ?? badge,
          originalPrice: newCart[existingIdx].originalPrice ?? originalPrice,
          quantity: parseFloat((newCart[existingIdx].quantity + itemQuantity).toFixed(3))
        };
        return newCart;
      }
      return [{
        id: Date.now().toString() + Math.random(),
        productId,
        productCode,
        name,
        brand,
        price,
        originalPrice,
        quantity: itemQuantity,
        image,
        saleType,
        categoryId,
        subcategoryId,
        badge
      }, ...prev];
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
    if (isSubmittingSale) return;
    if (cart.length === 0) return;

    // Validación defensiva de seguridad: total de venta y descuentos
    if (cartTotal <= 0) {
      alert('Error de seguridad: El total de la venta debe ser mayor a $0.');
      return;
    }

    if (globalDiscount < 0 || globalDiscount > 100) {
      alert('Error de seguridad: El porcentaje de descuento no es válido (debe estar entre 0% y 100%).');
      return;
    }

    // Validación de estado de caja registradora
    if (selectedPaymentMethod === 'cash' && !isCashRegisterOpen) {
      alert('Caja cerrada: Debe realizar la apertura de caja antes de cobrar en efectivo.');
      return;
    }

    // Validar que ningún ítem tenga cantidad o precio anómalo
    for (const item of cartWithDiscounts) {
      if (item.quantity <= 0 || isNaN(item.quantity)) {
        alert(`Error en producto "${item.name}": Cantidad inválida (${item.quantity}).`);
        return;
      }
      if (item.price < 0 || isNaN(item.price)) {
        alert(`Error en producto "${item.name}": Precio base negativo.`);
        return;
      }
    }

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

    setIsSubmittingSale(true);
    try {
      let total = cartTotal;
      const customerName = validatedCustomer ? validatedCustomer.name : 'Cliente Local';
      const customerPhone = validatedCustomer ? validatedCustomer.phone : '';
      const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const totalOrderDiscount = orderOfferCalc.discountAmount + manualDiscountAmount;
      const totalOrderDiscountLabel = orderOfferCalc.offerLabel
        ? `${orderOfferCalc.offerLabel}${globalDiscount > 0 ? ` + Descuento ${globalDiscount}%` : ''}`
        : (globalDiscount > 0 ? `Descuento ${globalDiscount}%` : undefined);

      // 1. REGISTRO ATÓMICO OFFLINE-FIRST (IndexedDB)
      // Genera el sale_id canónico e inmutable (POS-CAJA01-...), persiste la venta,
      // descuenta stock local y encola para Supabase.
      const offlineItems: OfflineSaleItem[] = cartWithDiscounts.map(i => ({
        productId: i.productId,
        productCode: i.productCode || i.productId,
        name: i.name,
        price: i.price,
        originalPrice: i.price,
        quantity: i.quantity,
        saleType: i.saleType || 'unit',
        image: i.image,
        discount: i.lineDiscount,
        lineDiscount: i.lineDiscount,
        total: (i.finalPrice || i.price) * i.quantity
      }));

      const clientSaleToken = `CART-${activeTab.id}-${cart.length}-${cartTotal}-${Date.now()}`;

      const localSale = await saleRepository.createSale({
        employee_id: employeeProfile?.id,
        employee_name: cashierName,
        customer_id: validatedCustomer?.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_dni: validatedCustomer?.dni,
        payment_method: selectedPaymentMethod as 'cash' | 'card' | 'transfer' | 'cuenta_corriente',
        items: offlineItems,
        subtotal,
        discount_amount: totalOrderDiscount,
        discount_label: totalOrderDiscountLabel,
        total,
        is_offline: !isHealthy,
        idempotency_key: clientSaleToken
      });

    const orderId = localSale.sale_id;

    // 2. Si hay conexión activa, disparar sincronización inmediata hacia Supabase
    if (isHealthy) {
      syncEngine.syncNow().catch(e => console.warn('Sync en segundo plano:', e));

      // Sincronizar con el estado en memoria de AdminContext
      try {
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

        if (selectedPaymentMethod === 'cash') {
          addCashMovement({
            type: 'Ingreso',
            description: `Venta Local (${getPaymentMethodDisplay(selectedPaymentMethod)}) - ${cartWithDiscounts.length} ítems${validatedCustomer ? ` - ${validatedCustomer.name}` : ''}`,
            cashier: cashierName,
            amount: total,
            orderId: orderId
          });
        }
      } catch (e) {
        console.warn('Error sincronizando estado en memoria de AdminContext (venta segura en IndexedDB):', e);
      }
    } else {
      // Si estamos offline, registrar también el movimiento localmente para balance de caja del día
      if (selectedPaymentMethod === 'cash') {
        addCashMovement({
          type: 'Ingreso',
          description: `Venta Local (${getPaymentMethodDisplay(selectedPaymentMethod)}) - ${cartWithDiscounts.length} ítems${validatedCustomer ? ` - ${validatedCustomer.name}` : ''}`,
          cashier: cashierName,
          amount: total,
          orderId: orderId
        });
      }
    }

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

    setLastConfirmedSale({
      orderId,
      customerName,
      customerPhone,
      customerDni: validatedCustomer?.dni,
      paymentMethod: selectedPaymentMethod,
      total,
      subtotal,
      discountAmount: totalOrderDiscount,
      discountLabel: totalOrderDiscountLabel,
      items: cartWithDiscounts.map(i => ({
        id: i.productId,
        productId: i.productId,
        name: i.name,
        price: i.finalPrice ?? i.price,
        originalPrice: i.price,
        quantity: i.quantity,
        saleType: i.saleType,
        barcode: (activeCatalogProducts.find(p => p.id === i.productId)?.barcode) || undefined,
        finalPrice: i.finalPrice,
        lineDiscount: i.lineDiscount
      }))
    });

    // Auto-activación de productos inactivos vendidos (Offline First)
    if (posConfig?.autoActivateProducts) {
      try {
        cartWithDiscounts.forEach(item => {
        const prod = activeCatalogProducts.find(p => p.id === item.productId);
        if (prod && prod.isPaused) {
          console.log(`Auto-activando producto que pasó por caja: ${prod.name}`);
          updateProduct(prod.id, { isPaused: false }).catch(err => console.warn('Error auto-activando producto:', err));
        }
      });
    } catch (actErr) {
      console.warn('Error en proceso de auto-activación de productos:', actErr);
    }
    }

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
    } catch (saleErr: any) {
      console.error('Error registrando venta en caja:', saleErr);
      alert(`Error al registrar la venta: ${saleErr.message || 'Intente nuevamente.'}`);
    } finally {
      setIsSubmittingSale(false);
    }
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
      const storeName = ticketConfig.headerText || 'Martina Supermercado';
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

  // ─── FACTURACIÓN FISCAL ARCA (INTEGRACIÓN POS) ────────────────────
  const CF_DNI_REQUIRED_LIMIT = 344488;
  const isCfDniMandatory = (lastConfirmedSale?.total || 0) >= CF_DNI_REQUIRED_LIMIT;

  // Resuelve ítems de la última venta contra el catálogo activo
  const fiscalItems = useMemo<InvoiceItem[]>(() => {
    if (!lastConfirmedSale || !lastConfirmedSale.items) return [];
    return buildCreatorItemsFromOrders([{ items: lastConfirmedSale.items }], activeCatalogProducts);
  }, [lastConfirmedSale, activeCatalogProducts]);

  // Recálculo fiscal estricto según alícuotas ARCA
  const fiscalCalculations = useMemo(() => {
    return recalculateFiscalInvoice(fiscalItems, true);
  }, [fiscalItems]);

  // Consulta número oficial en ARCA (con fallback seguro a último número local)
  const fetchNextVoucherNumber = async (pv: number, type: string) => {
    setIsLoadingNextNumber(true);
    setFiscalError('');
    try {
      const res = await billingService.getLastVoucherNumber(pv, type);
      setFiscalNextNumber(res.nextNumber || 1);
    } catch (err: any) {
      console.warn('Aviso consultando próximo número en ARCA, usando correlativo local:', err);
      const localMax = invoices
        .filter(inv => (inv.type === type || inv.invoiceType === type))
        .map(inv => Number(inv.invoiceNumber) || (inv.folio ? Number(inv.folio.split('-').pop()) : 0) || 0)
        .reduce((max, curr) => Math.max(max, curr), 0);
      setFiscalNextNumber(localMax + 1);
    } finally {
      setIsLoadingNextNumber(false);
    }
  };

  // Abre el flujo fiscal validando si ya fue facturada previamente
  const openFiscalFlow = (saleData: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    customerDni?: string;
    paymentMethod: string;
    total: number;
    subtotal: number;
    discountAmount: number;
    discountLabel?: string;
    items: Array<any>;
  }) => {
    // 1. Validar si la venta ya está facturada o en estado desconocido
    const billStatus = checkSaleBilledStatus(saleData.orderId);
    if (billStatus.isBilled && billStatus.invoice) {
      setAuthorizedInvoiceResult(billStatus.invoice);
      setShowPosFiscalModal(true);
      return;
    }
    if (billStatus.needsReconciliation && billStatus.invoice) {
      setAuthorizedInvoiceResult(billStatus.invoice);
      setUnknownOpId(billStatus.invoice.operationId || null);
      setShowPosFiscalModal(true);
      return;
    }

    // 2. Determinar condición fiscal sugerida según emisor y receptor
    const initialName = (validatedCustomer?.businessName || (saleData.customerName && saleData.customerName !== 'Cliente Local'))
      ? (validatedCustomer?.businessName || saleData.customerName)
      : 'Consumidor Final';

    const initialCond = (validatedCustomer?.taxCondition) || 'Consumidor Final';
    const taxRule = determineInvoiceType('Responsable Inscripto', initialCond as any);

    setFiscalCustomerName(initialName);
    setFiscalTaxCondition(initialCond);
    setFiscalInvoiceType(taxRule.invoiceType as 'A' | 'B' | 'C');
    setFiscalTypeReason(taxRule.reason);

    // 3. Documento inicial según condición fiscal
    if (initialCond === 'Consumidor Final') {
      if (validatedCustomer?.dni || saleData.customerDni) {
        setFiscalDocType('DNI');
        setFiscalDocNumber(validatedCustomer?.dni || saleData.customerDni || '');
      } else {
        setFiscalDocType('SIN_IDENTIFICAR');
        setFiscalDocNumber('');
      }
    } else if (initialCond === 'Responsable Inscripto' || initialCond === 'Monotributista') {
      setFiscalDocType('CUIT');
      setFiscalDocNumber(validatedCustomer?.cuit || validatedCustomer?.dni || saleData.customerDni || '');
    } else {
      setFiscalDocType(validatedCustomer?.cuit ? 'CUIT' : 'DNI');
      setFiscalDocNumber(validatedCustomer?.cuit || validatedCustomer?.dni || saleData.customerDni || '');
    }

    setFiscalCustomerAddress(validatedCustomer?.fiscalAddress || validatedCustomer?.address || '');
    setFiscalPointOfSale(1);
    setFiscalError('');
    setAuthorizedInvoiceResult(null);
    setUnknownOpId(null);
    setFiscalCustomerSearch('');
    setShowFiscalCustomerSearchDropdown(false);
    setShowPosFiscalModal(true);

    fetchNextVoucherNumber(1, taxRule.invoiceType);
  };

  // Clientes filtrados para búsqueda rápida en el modal fiscal
  const matchedFiscalCustomers = useMemo(() => {
    if (!fiscalCustomerSearch.trim()) return [];
    const q = fiscalCustomerSearch.toLowerCase().trim();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.businessName && c.businessName.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.cuit && c.cuit.includes(q)) ||
      (c.dni && c.dni.includes(q))
    ).slice(0, 5);
  }, [customers, fiscalCustomerSearch]);

  const handleSelectCustomerForFiscal = (cust: typeof customers[0]) => {
    const targetCond = cust.taxCondition || 'Consumidor Final';
    const targetName = cust.businessName || cust.name;
    const targetDoc = (targetCond === 'Responsable Inscripto' || targetCond === 'Monotributista')
      ? (cust.cuit || cust.dni || '')
      : (cust.dni || cust.cuit || '');
    const targetDocType = (targetCond === 'Responsable Inscripto' || targetCond === 'Monotributista')
      ? 'CUIT'
      : (targetDoc ? 'DNI' : 'SIN_IDENTIFICAR');

    setFiscalCustomerName(targetName);
    setFiscalTaxCondition(targetCond);
    setFiscalDocNumber(targetDoc);
    setFiscalDocType(targetDocType);
    setFiscalCustomerAddress(cust.fiscalAddress || cust.address || '');

    const rule = determineInvoiceType('Responsable Inscripto', targetCond as any);
    setFiscalInvoiceType(rule.invoiceType as 'A' | 'B' | 'C');
    setFiscalTypeReason(rule.reason);
    fetchNextVoucherNumber(fiscalPointOfSale, rule.invoiceType);
    setShowFiscalCustomerSearchDropdown(false);
    setFiscalCustomerSearch('');
  };

  const handleResetToAnonymousCf = () => {
    setFiscalCustomerName('Consumidor Final');
    setFiscalTaxCondition('Consumidor Final');
    setFiscalDocNumber('');
    setFiscalDocType('SIN_IDENTIFICAR');
    setFiscalCustomerAddress('');

    const rule = determineInvoiceType('Responsable Inscripto', 'Consumidor Final');
    setFiscalInvoiceType(rule.invoiceType as 'A' | 'B' | 'C');
    setFiscalTypeReason(rule.reason);
    fetchNextVoucherNumber(fiscalPointOfSale, rule.invoiceType);
    setShowFiscalCustomerSearchDropdown(false);
    setFiscalCustomerSearch('');
  };

  // Cambio de condición fiscal por el cajero
  const handleFiscalTaxConditionChange = (newCond: string) => {
    setFiscalTaxCondition(newCond);
    const rule = determineInvoiceType('Responsable Inscripto', newCond as any);
    setFiscalInvoiceType(rule.invoiceType as 'A' | 'B' | 'C');
    setFiscalTypeReason(rule.reason);

    if (newCond === 'Responsable Inscripto' || newCond === 'Monotributista') {
      setFiscalDocType('CUIT');
    } else if (newCond === 'Consumidor Final') {
      if (!fiscalDocNumber || fiscalDocNumber === '0') {
        setFiscalDocType('SIN_IDENTIFICAR');
      } else {
        setFiscalDocType('DNI');
      }
    }

    fetchNextVoucherNumber(fiscalPointOfSale, rule.invoiceType);
  };

  // Autorización en ARCA
  const handleAuthorizeFiscal = async () => {
    if (!lastConfirmedSale) return;
    setFiscalError('');

    // Validaciones estrictas antes de emitir
    if (!fiscalCustomerName.trim()) {
      setFiscalError('Debe indicar la razón social o nombre del cliente.');
      return;
    }

    if (fiscalInvoiceType === 'A') {
      const cuitVal = validateCuit(fiscalDocNumber);
      if (!cuitVal.valid) {
        setFiscalError(`Factura A exige un CUIT válido: ${cuitVal.error}`);
        return;
      }
    }

    if (fiscalTaxCondition === 'Consumidor Final' && isCfDniMandatory && (!fiscalDocNumber || fiscalDocNumber === '0')) {
      setFiscalError(`Para ventas a Consumidor Final superiores a $${CF_DNI_REQUIRED_LIMIT.toLocaleString('es-AR')}, ARCA exige identificar al cliente con DNI.`);
      return;
    }

    if (fiscalItems.length === 0) {
      setFiscalError('La venta no contiene ítems para facturar.');
      return;
    }

    const missingFiscalCode = fiscalItems.find(i => !(i.codigoMtx || i.barcode || i.gtin || i.ean || '').trim());
    if (missingFiscalCode) {
      setFiscalError(`El producto "${missingFiscalCode.description}" no posee código de barras registrado. ARCA WSMTXCA exige código de barras comercial.`);
      return;
    }

    setIsAuthorizingFiscal(true);
    setFiscalAuthStep('Validando reglas fiscales y conectando con ARCA WSMTXCA...');

    try {
      setFiscalAuthStep('Enviando comprobante al servicio fiscal de ARCA...');

      const response = await billingService.authorizeInvoice({
        saleIds: [lastConfirmedSale.orderId],
        pointOfSale: fiscalPointOfSale,
        invoiceType: fiscalInvoiceType,
        customer: {
          name: fiscalCustomerName,
          documentType: (fiscalDocType === 'SIN_IDENTIFICAR' || !fiscalDocType) ? 'DNI' : fiscalDocType,
          documentNumber: (fiscalDocType === 'SIN_IDENTIFICAR' || !fiscalDocNumber) ? '0' : fiscalDocNumber,
          cuit: (fiscalInvoiceType === 'A' || fiscalDocType === 'CUIT') ? fiscalDocNumber : undefined,
          taxCondition: fiscalTaxCondition,
          address: fiscalCustomerAddress,
          phone: lastConfirmedSale.customerPhone
        },
        items: fiscalItems,
        pricesIncludeTax: true,
        requestedBy: cashierName || 'Cajero POS'
      });

      const isCaeValid = Boolean(
        response.success &&
        response.status === 'AUTORIZADA' &&
        response.invoice?.cae &&
        /^\d{14}$/.test(String(response.invoice.cae).trim())
      );

      if (isCaeValid && response.invoice) {
        setFiscalAuthStep('¡Comprobante autorizado con CAE por ARCA!');

        const pv = response.invoice.pointOfSale || response.invoice.point_of_sale || fiscalPointOfSale || 1;
        const num = response.invoice.invoiceNumber || response.invoice.invoice_number || 1;
        const folioStr = response.invoice.folio && !response.invoice.folio.includes('undefined')
          ? response.invoice.folio
          : `${String(pv).padStart(4, '0')}-${String(num).padStart(8, '0')}`;

        const authorizedInv = addInvoice({
          ...response.invoice,
          id: response.invoice.id,
          pointOfSale: pv,
          invoiceNumber: num,
          folio: folioStr,
          clientName: fiscalCustomerName,
          clientCuit: fiscalDocNumber || 'Consumidor Final',
          direction: 'venta',
          status: 'AUTORIZADA',
          type: fiscalInvoiceType,
          saleId: lastConfirmedSale.orderId,
          saleIds: [lastConfirmedSale.orderId],
          qrDataUrl: response.qrDataUrl,
          paymentMethod: lastConfirmedSale.paymentMethod
        });

        await saleRepository.markSaleAsBilled(lastConfirmedSale.orderId, response.invoice.id);
        await refreshInvoices();
        setAuthorizedInvoiceResult(authorizedInv);

        // Envío directo a la impresora térmica mediante FiscalTicketPrinter
        setFiscalPrinterInvoice(authorizedInv);
        setShowFiscalPrinterModal(true);
        setShowPosFiscalModal(false);
        setShowSuccessModal(null);
      } else if (response.status === 'ESTADO_DESCONOCIDO') {
        setUnknownOpId(response.operationId || null);
        setFiscalError(
          'Tiempo de espera agotado con ARCA. La operación quedó en ESTADO_DESCONOCIDO. Por seguridad fiscal, ARCA prohíbe reintentar inmediatamente. Utilice el botón Reconciliar para comprobar si ARCA emitió el CAE.'
        );
      } else {
        const errMsg = response.error
          ? `${response.error.title}: ${response.error.reason} (${response.error.suggestedAction})`
          : (response.message || 'La solicitud fue rechazada por ARCA.');
        setFiscalError(`La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal. Motivo: ${errMsg}`);
      }
    } catch (err: any) {
      console.error('Error autorizando comprobante en POS:', err);
      setFiscalError(`Error de comunicación con el servicio fiscal: ${err.message}`);
    } finally {
      setIsAuthorizingFiscal(false);
    }
  };

  // Emisión rápida de factura electrónica directa desde el modal de confirmación de venta
  const handleQuickFiscalInvoice = async () => {
    if (!showSuccessModal || isAuthorizingFiscal) return;
    setQuickFiscalError(null);

    // 1. Si ya está facturada, reimprimir directamente con la factura existente (0 llamadas a ARCA)
    const billStatus = checkSaleBilledStatus(showSuccessModal.orderId);
    if (billStatus.isBilled && billStatus.invoice) {
      setFiscalPrinterInvoice(billStatus.invoice);
      setShowFiscalPrinterModal(true);
      return;
    }

    if (billStatus.needsReconciliation && billStatus.invoice) {
      setAuthorizedInvoiceResult(billStatus.invoice);
      setUnknownOpId(billStatus.invoice.operationId || null);
      setShowPosFiscalModal(true);
      return;
    }

    if (!lastConfirmedSale) {
      setQuickFiscalError('No se encontraron los datos de la última venta confirmada.');
      return;
    }

    // 2. Determinar condición fiscal y receptor
    const customerCond = validatedCustomer?.taxCondition || 'Consumidor Final';
    const customerName = validatedCustomer?.businessName || (lastConfirmedSale.customerName && lastConfirmedSale.customerName !== 'Cliente Local' ? lastConfirmedSale.customerName : 'Consumidor Final');
    const taxRule = determineInvoiceType('Responsable Inscripto', customerCond as any);
    const invoiceType = taxRule.invoiceType as 'A' | 'B' | 'C';

    let docType = 'DNI';
    let docNumber = '0';
    if (customerCond === 'Consumidor Final') {
      if (validatedCustomer?.dni || lastConfirmedSale.customerDni) {
        docType = 'DNI';
        docNumber = (validatedCustomer?.dni || lastConfirmedSale.customerDni || '').replace(/\D/g, '');
      } else {
        docType = 'DNI';
        docNumber = '0';
      }
    } else {
      docType = 'CUIT';
      docNumber = (validatedCustomer?.cuit || validatedCustomer?.dni || lastConfirmedSale.customerDni || '').replace(/\D/g, '');
    }

    // 3. Validación de umbral ARCA para Consumidor Final ($191.624)
    if (invoiceType === 'B' && customerCond === 'Consumidor Final' && lastConfirmedSale.total >= CF_DNI_REQUIRED_LIMIT) {
      if (!docNumber || docNumber === '0') {
        openFiscalFlow(lastConfirmedSale);
        return;
      }
    }

    // 4. Validación de CUIT para Factura A
    if (invoiceType === 'A') {
      const cuitVal = validateCuit(docNumber);
      if (!cuitVal.valid) {
        setQuickFiscalError(`Para Factura A se exige CUIT válido: ${cuitVal.error}.`);
        openFiscalFlow(lastConfirmedSale);
        return;
      }
    }

    // 5. Validación de ítems
    if (fiscalItems.length === 0) {
      setQuickFiscalError('La venta no contiene ítems para facturar.');
      return;
    }

    const missingFiscalCode = fiscalItems.find(i => !(i.codigoMtx || i.barcode || i.gtin || i.ean || '').trim());
    if (missingFiscalCode) {
      setQuickFiscalError(`El producto "${missingFiscalCode.description}" no posee código de barras registrado para ARCA WSMTXCA.`);
      openFiscalFlow(lastConfirmedSale);
      return;
    }

    setIsAuthorizingFiscal(true);
    setQuickFiscalStep('Procesando venta...');

    try {
      setQuickFiscalStep('Generando comprobante electrónico...');
      await new Promise(r => setTimeout(r, 200));

      setQuickFiscalStep('Solicitando autorización a ARCA...');

      const response = await billingService.authorizeInvoice({
        saleIds: [lastConfirmedSale.orderId],
        pointOfSale: fiscalPointOfSale || 1,
        invoiceType: invoiceType,
        customer: {
          name: customerName,
          documentType: docType,
          documentNumber: docNumber,
          cuit: (invoiceType === 'A' || docType === 'CUIT') ? docNumber : undefined,
          taxCondition: customerCond,
          address: validatedCustomer?.fiscalAddress || validatedCustomer?.address || '',
          phone: lastConfirmedSale.customerPhone
        },
        items: fiscalItems,
        pricesIncludeTax: true,
        requestedBy: cashierName || 'Cajero POS'
      });

      const isCaeValid = Boolean(
        response.success &&
        response.status === 'AUTORIZADA' &&
        response.invoice?.cae &&
        /^\d{14}$/.test(String(response.invoice.cae).trim())
      );

      if (isCaeValid && response.invoice) {
        setQuickFiscalStep('¡Autorizada con CAE por ARCA!');

        const pv = response.invoice.pointOfSale || response.invoice.point_of_sale || fiscalPointOfSale || 1;
        const num = response.invoice.invoiceNumber || response.invoice.invoice_number || 1;
        const folioStr = response.invoice.folio && !response.invoice.folio.includes('undefined')
          ? response.invoice.folio
          : `${String(pv).padStart(4, '0')}-${String(num).padStart(8, '0')}`;

        const authorizedInv = addInvoice({
          ...response.invoice,
          id: response.invoice.id,
          pointOfSale: pv,
          invoiceNumber: num,
          folio: folioStr,
          clientName: customerName,
          clientCuit: docNumber || 'Consumidor Final',
          direction: 'venta',
          status: 'AUTORIZADA',
          type: invoiceType,
          saleId: lastConfirmedSale.orderId,
          saleIds: [lastConfirmedSale.orderId],
          qrDataUrl: response.qrDataUrl,
          paymentMethod: lastConfirmedSale.paymentMethod
        });

        await saleRepository.markSaleAsBilled(lastConfirmedSale.orderId, response.invoice.id);
        await refreshInvoices();

        setFiscalPrinterInvoice(authorizedInv);
        setShowFiscalPrinterModal(true);
        setShowSuccessModal(null);
      } else if (response.status === 'ESTADO_DESCONOCIDO') {
        setUnknownOpId(response.operationId || null);
        setQuickFiscalError(
          'No fue posible determinar si ARCA autorizó el comprobante. La factura NO será impresa hasta verificar su estado. Utilice el botón Reconciliar.'
        );
      } else {
        const errorDetail = response.error
          ? `${response.error.title}: ${response.error.reason}`
          : (response.message || 'La factura fue rechazada por ARCA.');
        setQuickFiscalError(
          `La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal. Motivo: ${errorDetail}`
        );
      }
    } catch (err: any) {
      console.error('[POS] Error autorizando comprobante rápido:', err);
      setQuickFiscalError(`Error de comunicación con el servicio fiscal: ${err.message}`);
    } finally {
      setIsAuthorizingFiscal(false);
      setQuickFiscalStep(null);
    }
  };

  // Reconciliación de operación en ESTADO_DESCONOCIDO
  const handleReconcileFiscal = async () => {
    const opId = unknownOpId || authorizedInvoiceResult?.operationId;
    if (!opId) {
      setFiscalError('No se encontró el identificador de la operación para reconciliar.');
      return;
    }

    setIsReconciling(true);
    setFiscalError('');
    try {
      const res = await billingService.reconcileOperation(opId);
      if (res.status === 'AUTORIZADA' && res.invoice) {
        const authorizedInv = addInvoice({
          ...res.invoice,
          id: res.invoice.id,
          folio: `${String(res.invoice.pointOfSale).padStart(4, '0')}-${String(res.invoice.invoiceNumber).padStart(8, '0')}`,
          status: 'AUTORIZADA',
          type: res.invoice.invoiceType || fiscalInvoiceType,
          saleId: lastConfirmedSale?.orderId || 'POS',
          saleIds: lastConfirmedSale ? [lastConfirmedSale.orderId] : [],
          qrDataUrl: res.qrDataUrl
        });
        await refreshInvoices();
        setAuthorizedInvoiceResult(authorizedInv);
        setUnknownOpId(null);
      } else if (res.status === 'RECHAZADA') {
        setFiscalError('ARCA confirmó que el comprobante no fue emitido. Ahora puede volver a intentar la autorización.');
        setUnknownOpId(null);
      } else {
        setFiscalError('La operación aún no pudo ser reconciliada con ARCA. Intente nuevamente en unos instantes.');
      }
    } catch (err: any) {
      setFiscalError(`Error durante la reconciliación: ${err.message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  // Envío seguro de Factura Fiscal por WhatsApp (Separado de ticket comercial y sin localhost)
  const handleSendWhatsAppFiscal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!showWhatsAppFiscalModal?.invoice) return;

    const phone = cleanAndFormatPhone(whatsappFiscalPhone);
    if (!phone) {
      setWhatsappFiscalError('Por favor ingresá un número de teléfono celular válido.');
      return;
    }

    setIsSendingWhatsAppFiscal(true);
    setWhatsappFiscalError('');

    try {
      const inv = showWhatsAppFiscalModal.invoice;
      // Regla 5: NO usar localhost como URL de factura. Usar URL pública configurada o dominio actual.
      const isLocal = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1');
      const publicBaseUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string) || 'https://la-martina.vercel.app';
      const safeOrigin = isLocal ? publicBaseUrl : window.location.origin;
      const invoiceUrl = `${safeOrigin}/factura/${inv.id}`;

      const pvStr = String(inv.pointOfSale || 1).padStart(4, '0');
      const numStr = String(inv.invoiceNumber || 1).padStart(8, '0');

      let msg = `*SUPERMERCADO LA MARTINA* 🛒\n`;
      msg += `*Factura Electrónica ARCA*\n\n`;
      msg += `Estimado/a *${inv.clientName || 'Cliente'}*:\n`;
      msg += `Le enviamos los datos de su comprobante electrónico oficial:\n\n`;
      msg += `▸ *Tipo:* Factura ${inv.type}\n`;
      msg += `▸ *Número:* ${pvStr}-${numStr}\n`;
      msg += `▸ *CAE:* ${inv.cae || 'N/A'}\n`;
      msg += `▸ *Vto. CAE:* ${inv.caeExpirationDate || 'N/A'}\n`;
      msg += `▸ *Total:* $${formatCurrency(inv.total, true, true)}\n\n`;
      msg += `📥 *Ver y Descargar Factura Oficial en PDF:*\n${invoiceUrl}\n\n`;
      msg += `¡Muchas gracias por su compra!`;

      const encoded = encodeURIComponent(msg);
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');

      setWhatsappFiscalSuccess(true);
      setTimeout(() => {
        setShowWhatsAppFiscalModal(null);
        setWhatsappFiscalSuccess(false);
      }, 1500);
    } catch (err: any) {
      setWhatsappFiscalError(`Error al preparar el mensaje: ${err.message}`);
    } finally {
      setIsSendingWhatsAppFiscal(false);
    }
  };

  // Keyboard events logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showModal || showPaymentModal || showManualModal || showDiscountModal || showPriceModal || showCloseConfirm || showSuccessModal || showWhatsAppTicketModal || showPosFiscalModal || showWhatsAppFiscalModal) return;
      if (e.key === 'F2') { e.preventDefault(); if (cart.length > 0) { inputRef.current?.blur(); setShowPaymentModal(true); } return; }
      if (e.key === 'F4') { e.preventDefault(); setCart([]); setGlobalDiscount(0); updateTab({ shoppingSessionId: null }); setSearchQty(1); setSearchQtyStr('1'); return; }
      if (document.activeElement === inputRef.current) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (cart.length === 0 ? null : prev === null ? 0 : Math.min(prev + 1, cart.length - 1))); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (cart.length === 0 ? null : prev === null ? cart.length - 1 : Math.max(prev - 1, 0))); }
      if (e.key === 'Delete') { e.preventDefault(); if (selectedIndex !== null) handleRemoveItem(selectedIndex); else if (cart.length > 0) handleRemoveItem(0); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, showPaymentModal, showManualModal, showDiscountModal, showPriceModal, showCloseConfirm, showSuccessModal, showWhatsAppTicketModal, showPosFiscalModal, showWhatsAppFiscalModal, cart, selectedIndex]);

  useEffect(() => {
    if (!showPaymentModal) return;
    const handlePaymentKeyDown = (e: KeyboardEvent) => {
      if (selectedPaymentMethod === 'cuenta_corriente' && !validatedCustomer && document.activeElement === ccInputRef.current) {
        if (e.key === 'Enter') { e.preventDefault(); handleValidateCC(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); ccInputRef.current?.blur(); setSelectedPaymentMethod('transfer'); }
        return;
      }
      if (e.key === 'Enter') {
        if (isSubmittingSale) return;
        e.preventDefault();
        handleCompleteSale();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowPaymentModal(false); return; }
    };
    window.addEventListener('keydown', handlePaymentKeyDown);
    return () => window.removeEventListener('keydown', handlePaymentKeyDown);
  }, [showPaymentModal, selectedPaymentMethod, validatedCustomer, cartWithDiscounts, cartTotal, globalDiscount, isSubmittingSale]);

  useEffect(() => {
    if (showPaymentModal && selectedPaymentMethod === 'cuenta_corriente' && !validatedCustomer) setTimeout(() => ccInputRef.current?.focus(), 100);
  }, [selectedPaymentMethod, showPaymentModal, validatedCustomer]);

  useEffect(() => {
    if (!showSuccessModal || showPosFiscalModal || showFiscalPrinterModal) return;
    const handleSuccessKeyDown = (e: KeyboardEvent) => {
      if (isAuthorizingFiscal) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        setShowSuccessModal(null);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    window.addEventListener('keydown', handleSuccessKeyDown);
    return () => window.removeEventListener('keydown', handleSuccessKeyDown);
  }, [showSuccessModal, showPosFiscalModal, showFiscalPrinterModal, isAuthorizingFiscal]);

  const hasPosOpenModal = showModal || showCloseConfirm || !!selectedMovement || !!showTicket || showCashOpenModal || showGenericModal || !!showLimitWarning || showPrePurchaseModal || !!showWhatsAppTicketModal || showPosFiscalModal || showFiscalPrinterModal || !!showWhatsAppFiscalModal || !!enlargedQrUrl;
  useScrollLock(hasPosOpenModal);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 flex flex-col pb-20">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 flex-shrink-0">
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-outline-variant/10 shadow-sm relative overflow-hidden">
          <span className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-error/10 text-error text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">En Vivo</span>
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#FFD700] rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"><span className="material-symbols-outlined text-[#8B6508] text-[20px] sm:text-[24px]">account_balance_wallet</span></div>
          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">Total</p>
          <p className="text-xl sm:text-3xl font-black text-on-background mt-1 truncate">${formatCurrency(stats.totalToday)}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-outline-variant/10 shadow-sm relative">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-surface-container-highest rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"><span className="material-symbols-outlined text-on-surface-variant text-[20px] sm:text-[24px]">payments</span></div>
          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">Efectivo</p>
          <p className="text-xl sm:text-3xl font-black text-on-background mt-1 truncate">${formatCurrency(stats.cash)}</p>
          {isCashRegisterOpen && (
            <div className="mt-2 pt-2 border-t border-outline-variant/10 sm:border-0 sm:mt-0 sm:pt-0 sm:absolute sm:top-5 sm:right-6 sm:text-right flex flex-col gap-0.5">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider truncate">Inicio: ${formatCurrency(stats.initialAmount, true, true)}</p>
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider truncate">Total: ${formatCurrency(stats.cashTotal, true, true)}</p>
            </div>
          )}
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-outline-variant/10 shadow-sm">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-surface-container-highest rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"><span className="material-symbols-outlined text-on-surface-variant text-[20px] sm:text-[24px]">account_balance</span></div>
          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">Transferencia</p>
          <p className="text-xl sm:text-3xl font-black text-on-background mt-1 truncate">${formatCurrency(stats.transfer)}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-outline-variant/10 shadow-sm">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-surface-container-highest rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"><span className="material-symbols-outlined text-on-surface-variant text-[20px] sm:text-[24px]">credit_card</span></div>
          <p className="text-xs sm:text-sm font-medium text-on-surface-variant">Tarjeta</p>
          <p className="text-xl sm:text-3xl font-black text-on-background mt-1 truncate">${formatCurrency(stats.card)}</p>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden mb-8">
        <div className="p-4 sm:p-6 border-b border-outline-variant/10"><h2 className="text-lg sm:text-xl font-bold">Actividad de Caja Reciente</h2></div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left min-w-[900px]">
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
          <div className="absolute inset-2 sm:inset-4 bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row border border-outline-variant/20 animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowModal(false)} className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 w-9 h-9 sm:w-10 sm:h-10 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center text-black"><span className="material-symbols-outlined text-[20px]">close</span></button>
            <div className="w-full lg:w-2/3 shrink-0 lg:shrink flex flex-col border-b lg:border-b-0 lg:border-r border-outline-variant/10 bg-[#fefefe] min-h-[460px] lg:h-full lg:overflow-hidden">
              {/* TABS BAR */}
              <div className="flex items-center gap-1 px-4 sm:px-8 pt-4 sm:pt-6 pb-0 flex-shrink-0 overflow-x-auto hide-scrollbar">
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
              <div className="flex-none lg:flex-1 flex flex-col p-2 sm:p-8 pt-3 sm:pt-4 lg:overflow-hidden">
                <div className="flex gap-4 mb-4 sm:mb-6 relative">
                  <form onSubmit={(e) => { e.preventDefault(); handleAddItem(searchCode); }} className="flex-1 flex flex-row gap-2 sm:gap-4 items-end">
                    <div className="flex-1 relative transition-all duration-300">
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase mb-1 block tracking-wider truncate"><span className="sm:hidden">Buscar / Escanear</span><span className="hidden sm:inline">Busca o escanea Producto</span></label>
                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchCode}
                          onChange={e => { setSearchCode(e.target.value); setShowSuggestions(true); setFocusedSuggestionIndex(0); }}
                          onFocus={() => { if (filteredProducts.length > 0) setShowSuggestions(true); setIsSearchFocused(true); }}
                          onBlur={() => { setTimeout(() => setIsSearchFocused(false), 200); }}
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
                          className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-4 pl-4 pr-14 sm:pr-12 focus:outline-none focus:border-[#9c1c1c] focus:ring-4 focus:ring-[#9c1c1c]/10 font-bold text-lg"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button type="button" onClick={() => setShowBarcodeScanner(true)} className="sm:hidden w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-white shadow-md hover:bg-primary/90 active:scale-95 transition-all">
                            <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                          </button>
                          <span className="material-symbols-outlined hidden sm:block text-on-surface-variant mr-2">search</span>
                        </div>
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
                                <div className={`w-10 h-10 rounded-lg overflow-hidden border flex items-center justify-center ${isOutOfStock ? 'bg-red-100 border-red-200' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
                                  {p.image && p.image.trim() !== '' ? (
                                    <img src={p.image} alt="" className={`w-full h-full object-contain ${isOutOfStock ? 'opacity-50' : ''}`} />
                                  ) : (
                                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40">image</span>
                                  )}
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
                    <div className={`transition-all duration-300 overflow-hidden ${isSearchFocused ? 'w-0 opacity-0 sm:w-36 sm:opacity-100' : 'w-[100px] sm:w-36 opacity-100'}`}>
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase mb-1 block tracking-wider truncate"><span className="sm:hidden">Cant.</span><span className="hidden sm:inline">Cant. (F8/*)</span></label>
                      <div className="flex bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl overflow-hidden h-[54px] sm:h-[60px]">
                        <button type="button" onClick={() => { const n = Math.max(0.01, parseFloat((searchQty - (searchQty > 1 ? 1 : 0.1)).toFixed(2))); setSearchQty(n); setSearchQtyStr(n.toString()); }} className="w-8 sm:w-10 flex items-center justify-center hover:bg-black/5 text-xl font-bold">-</button>
                        <input ref={qtyInputRef} type="text" inputMode="decimal" className="flex-1 w-full text-center font-bold text-lg sm:text-xl bg-transparent outline-none px-0" value={searchQtyStr} onChange={e => { const raw = e.target.value.replace(',', '.'); if (/^\d*\.?\d{0,2}$/.test(raw)) { setSearchQtyStr(raw); const n = parseFloat(raw); if (!isNaN(n) && n > 0) setSearchQty(n); } }} onBlur={() => { if (!searchQtyStr || isNaN(parseFloat(searchQtyStr))) { setSearchQtyStr('1'); setSearchQty(1); } }} />
                        <button type="button" onClick={() => { const n = parseFloat((searchQty + 1).toFixed(2)); setSearchQty(n); setSearchQtyStr(n.toString()); }} className="w-8 sm:w-10 flex items-center justify-center hover:bg-black/5 text-xl font-bold">+</button>
                      </div>
                    </div>
                  </form>
                </div>
                <div className="flex-none lg:flex-1 mt-2 border border-outline-variant/20 rounded-2xl lg:overflow-hidden flex flex-col bg-white shadow-sm lg:min-h-0 relative">
                  <div className="flex-none lg:flex-1 overflow-x-hidden overflow-y-visible lg:overflow-y-auto no-scrollbar w-full">
                    <table className="w-full text-left block lg:table table-auto lg:table-fixed border-separate border-spacing-0 lg:min-w-0">
                      <thead className="bg-[#fcfcfc] sticky top-0 z-20 block lg:table-header-group border-b border-outline-variant/20 lg:border-none">
                        <tr className="text-[10px] lg:text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex lg:table-row w-full">
                          {/* 1. # (Móvil: order-4 para espacio de botón eliminar) */}
                          <th className="order-4 lg:order-none w-10 lg:w-16 px-1 lg:px-4 py-2 lg:py-4 text-center lg:border-b border-outline-variant/20 block lg:table-cell">
                            <span className="hidden lg:inline">#</span>
                          </th>
                          {/* 2. Descripción (Móvil: order-3) */}
                          <th className="order-3 lg:order-none flex-1 px-2 lg:px-6 py-2 lg:py-4 lg:border-b border-outline-variant/20 block lg:table-cell text-left">
                            <span className="sm:hidden">Desc.</span>
                            <span className="hidden sm:inline">Descripción</span>
                          </th>
                          {/* 3. Precio Unit. (Oculto en móvil) */}
                          <th className="hidden lg:table-cell px-4 lg:px-6 py-4 w-32 lg:w-36 text-right border-b border-outline-variant/20">
                            Precio Unit.
                          </th>
                          {/* 4. Cantidad (Móvil: order-1) */}
                          <th className="order-1 lg:order-none w-[105px] lg:w-36 px-1 lg:px-4 py-2 lg:py-4 text-center lg:border-b border-outline-variant/20 block lg:table-cell">
                            Cant.
                          </th>
                          {/* 5. Total (Móvil: order-2) */}
                          <th className="order-2 lg:order-none w-[75px] lg:w-32 px-2 lg:px-6 py-2 lg:py-4 text-right lg:border-b border-outline-variant/20 block lg:table-cell">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 lg:divide-outline-variant/5 block lg:table-row-group w-full">
                        {cartWithDiscounts.map((item, idx) => {
                          const itemStock = item.productId !== 'GENERIC' && item.productId !== 'PRODUCTO_COMUN' && !item.productId.startsWith('GENERICO-') ? getStock(item.productId) : null;
                          const isItemOutOfStock = itemStock !== null && itemStock === 0;

                          const brandTrimmed = (item.brand || '').trim();
                          const nameTrimmed = (item.name || '').trim();
                          const displayFullName = brandTrimmed && !nameTrimmed.toLowerCase().startsWith(brandTrimmed.toLowerCase())
                            ? `${brandTrimmed} ${nameTrimmed}`
                            : nameTrimmed;

                          return (
                            <tr key={item.id} onClick={() => setSelectedIndex(idx)} className={`group transition-colors relative flex lg:table-row items-center w-full py-2 lg:py-0 border-b border-outline-variant/10 lg:border-none ${isItemOutOfStock ? 'bg-red-50' : ''}`}>
                              {/* 1. # (Móvil: order-4 con botón borrar) */}
                              <td className="order-4 lg:order-none w-10 lg:w-16 px-1 lg:px-4 py-1 lg:py-5 text-center text-sm font-bold text-on-surface-variant relative align-middle h-auto lg:h-[70px] block lg:table-cell shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }} className="absolute inset-0 m-1 lg:m-0 flex items-center justify-center bg-red-100 text-error opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all z-10 rounded-lg lg:rounded-none" title="Eliminar ítem">
                                  <span className="material-symbols-outlined text-[18px] lg:text-[20px]">delete</span>
                                </button>
                                <div className="hidden lg:flex items-center justify-center h-full">
                                  {selectedIndex === idx ? <span className="material-symbols-outlined text-primary text-[18px]">arrow_right</span> : cartWithDiscounts.length - idx}
                                </div>
                              </td>

                              {/* 2. Descripción (Móvil: order-3, en PC marca primero y después nombre) */}
                              <td className="order-3 lg:order-none flex-1 min-w-0 px-2 lg:px-6 py-1 lg:py-5 font-black text-[11px] lg:text-sm text-on-background uppercase align-middle h-auto lg:h-[70px] block lg:table-cell">
                                <div className="flex flex-col justify-center h-full overflow-hidden">
                                  <span className="truncate w-full block">
                                    <span className="lg:hidden">{item.name}</span>
                                    <span className="hidden lg:inline">{displayFullName}</span>
                                  </span>
                                  {item.offerLabel && (
                                    <span className="text-[9px] lg:text-[10px] text-error font-extrabold flex items-center gap-0.5 lowercase tracking-wider mt-0.5 bg-error/5 self-start px-2 py-0.5 rounded-full truncate max-w-full">
                                      <span className="material-symbols-outlined text-[10px] lg:text-[12px]">local_offer</span>
                                      {item.offerLabel}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 3. Precio Unit. (Oculto en móvil, visible en PC) */}
                              <td className="hidden lg:table-cell px-4 lg:px-6 py-5 text-right font-bold text-on-surface-variant align-middle h-[70px] w-32 lg:w-36">
                                <div className="flex flex-col justify-center items-end h-full">
                                  {item.price === 0 ? (
                                    <button onClick={() => { setShowPriceModal({ idx, name: item.name }); setPriceInput(''); }} className="text-primary hover:underline bg-primary/10 px-2 py-1 rounded text-xs">Ingresar Precio</button>
                                  ) : (
                                    <>
                                      {(item.originalPrice && item.originalPrice > item.finalPrice) ? (
                                        <>
                                          <span className="text-xs text-on-surface-variant/50 line-through">
                                            ${formatCurrency(item.originalPrice)}
                                          </span>
                                          <span className="text-primary font-black">
                                            ${formatCurrency(item.finalPrice, true, true)}
                                          </span>
                                        </>
                                      ) : item.finalPrice < item.price ? (
                                        <>
                                          <span className="text-xs text-on-surface-variant/50 line-through">
                                            ${formatCurrency(item.price)}
                                          </span>
                                          <span className="text-primary font-black">
                                            ${formatCurrency(item.finalPrice, true, true)}
                                          </span>
                                        </>
                                      ) : (
                                        <span>
                                          ${formatCurrency(item.finalPrice, true, true)}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* 4. Cantidad (Móvil: order-1) */}
                              <td className="order-1 lg:order-none w-[105px] lg:w-36 shrink-0 px-0 lg:px-4 py-1 lg:py-5 text-center font-bold text-sm align-middle h-auto lg:h-[70px] block lg:table-cell">
                                <div className="flex items-center justify-center h-full w-full">
                                  <div className="flex items-center justify-between w-full max-w-[105px] lg:max-w-[120px] mx-auto">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateItemQty(idx, item.quantity - 1); }}
                                      className="w-7 h-7 lg:w-6 lg:h-6 rounded-full bg-surface-container-low hover:bg-black/10 flex items-center justify-center shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity pointer-events-auto lg:pointer-events-none lg:group-hover:pointer-events-auto"
                                      title="Disminuir cantidad"
                                    >
                                      -
                                    </button>
                                    <div className="flex-1 text-center font-bold text-xs lg:text-sm px-1 min-w-0">
                                      {item.saleType === 'weight' ? (
                                        inlineWeightEdit?.idx === idx ? (
                                          <input
                                            autoFocus
                                            type="text"
                                            inputMode="decimal"
                                            value={inlineWeightEdit.str}
                                            className="w-12 lg:w-16 text-center border-b-2 border-primary outline-none bg-transparent font-bold text-primary text-xs lg:text-sm"
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
                                            className="w-full text-center text-primary underline decoration-primary/30 hover:decoration-primary cursor-pointer truncate text-xs lg:text-sm"
                                          >
                                            <span className="lg:hidden">{parseFloat(item.quantity.toFixed(2)).toString()}</span>
                                            <span className="hidden lg:inline">{parseFloat(item.quantity.toFixed(2)).toString()} kg</span>
                                          </button>
                                        )
                                      ) : (
                                        <span className="text-xs lg:text-sm">{item.quantity}</span>
                                      )}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateItemQty(idx, item.quantity + 1); }}
                                      className="w-7 h-7 lg:w-6 lg:h-6 rounded-full bg-surface-container-low hover:bg-black/10 flex items-center justify-center shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity pointer-events-auto lg:pointer-events-none lg:group-hover:pointer-events-auto"
                                      title="Aumentar cantidad"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* 5. Total (Móvil: order-2) */}
                              <td className="order-2 lg:order-none w-[75px] lg:w-32 shrink-0 px-2 lg:px-6 py-1 lg:py-5 text-right font-black text-[#9c1c1c] align-middle h-auto lg:h-[70px] block lg:table-cell">
                                <div className="flex items-center justify-end h-full text-[13px] lg:text-base">${formatCurrency(item.finalPrice * item.quantity, true, true)}</div>
                              </td>
                            </tr>
                          );
                        })}
                        {cart.length === 0 && (<tr><td colSpan={5} className="py-16 text-on-surface-variant"><div className="w-full max-w-[280px] sm:max-w-none mx-auto text-center sticky left-0 sm:static">Escanea un producto para comenzar.</div></td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-6 flex-shrink-0 flex-wrap">
                  <button onClick={() => { setDiscountInput(globalDiscount.toString()); setShowDiscountModal(true); }} className={`flex items-center gap-2 border border-outline-variant/20 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shrink-0 ${globalDiscount > 0 ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`}><span className="material-symbols-outlined text-[16px]">percent</span> <span className="sm:hidden">Descuento</span><span className="hidden sm:inline">{globalDiscount > 0 ? `Descuento ${globalDiscount}% (F9)` : 'Aplicar Descuento (F9)'}</span></button>

                  {/* F-Keys Shortcuts Bar */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { inputRef.current?.focus(); inputRef.current?.select(); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="Foco en buscador o escáner de productos"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">F1</kbd>
                      <span>Buscar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { if (cart.length > 0) { inputRef.current?.blur(); setShowPaymentModal(true); } }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer shadow-2xs ${cart.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100' : 'bg-surface-container-lowest border-outline-variant/15 text-on-surface-variant opacity-60'}`}
                      title="Abrir ventana de cobro"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-amber-900 border border-amber-300 rounded shadow-2xs">F2</kbd>
                      <span>Cobrar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { posCustomerDniRef.current?.focus(); posCustomerDniRef.current?.select(); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="Foco en buscar cliente por DNI"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">F3</kbd>
                      <span>Cliente</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (tabs.length < 4) {
                          const newTab = createTab(tabs.length + 1);
                          setTabs(prev => [...prev, newTab]);
                          setActiveTabId(newTab.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="Crear nueva hoja de venta en espera"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">F5</kbd>
                      <span>Nueva Hoja</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (tabs.length > 1) {
                          const currentIndex = tabs.findIndex(t => t.id === activeTabId);
                          const nextIndex = (currentIndex + 1) % tabs.length;
                          setActiveTabId(tabs[nextIndex].id);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="Alternar entre hojas de venta"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">F6</kbd>
                      <span>Cambiar Hoja</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select(); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="Editar cantidad del producto"
                    >
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">F8 / *</kbd>
                      <span>Cant.</span>
                    </button>

                    {lastSaleTicket && (
                      <button
                        type="button"
                        onClick={() => setShowTicket(lastSaleTicket)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/15 text-[11px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all cursor-pointer shadow-2xs"
                        title="Reimprimir ticket de la última venta"
                      >
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white text-on-surface border border-outline-variant/25 rounded shadow-2xs">Ctrl+P</kbd>
                        <span>Reimprimir</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1"></div>
                  <p className="hidden sm:block text-[10px] text-on-surface-variant font-bold uppercase self-center tracking-widest shrink-0">↑↓ navegar • Del borrar</p>
                </div>
              </div>{/* close tab content wrapper */}
            </div>

            <div className="w-full lg:w-1/3 shrink-0 lg:shrink bg-[#f8f9fa] flex flex-col relative h-auto lg:h-full lg:overflow-hidden">
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-5 pb-8 sm:pb-32">
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
                        ref={posCustomerDniRef}
                        type="text"
                        placeholder="Buscar por DNI... (F3)"
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

                <div className="bg-[#b31414] text-white rounded-3xl p-4 sm:p-5 shadow-[0_8px_30px_rgb(179,20,20,0.3)] mb-4 sm:mb-6 relative overflow-hidden shrink-0">
                  <span className="material-symbols-outlined absolute -right-6 -bottom-6 text-[150px] opacity-10">point_of_sale</span>
                  <p className="font-bold text-xs tracking-[0.2em] uppercase mb-2 text-white/80">Monto Final</p>
                  <p className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 sm:mb-6 flex items-start gap-1 sm:gap-2"><span className="text-xl sm:text-2xl mt-1 sm:mt-2">$</span> <span className="truncate">{formatCurrency(cartTotal, true, true)}</span></p>
                  <div className="flex justify-between text-xs font-bold text-white/80 pt-4 sm:pt-5 border-t border-white/20">
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>$ {formatCurrency(subtotal, true, true)}</span>
                      </div>
                      {itemDiscountsTotal > 0 && (
                        <div className="flex justify-between text-emerald-200">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">local_offer</span>
                            Ofertas en productos:
                          </span>
                          <span>-${formatCurrency(itemDiscountsTotal, true, true)}</span>
                        </div>
                      )}
                      {orderOfferCalc.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-200">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">loyalty</span>
                            {orderOfferCalc.offerLabel || 'Oferta general'}:
                          </span>
                          <span>-${formatCurrency(orderOfferCalc.discountAmount, true, true)}</span>
                        </div>
                      )}
                      {globalDiscount > 0 && (
                        <div className="flex justify-between text-amber-200">
                          <span>Desc. manual ({globalDiscount}%):</span>
                          <span>-${formatCurrency(manualDiscountAmount, true, true)}</span>
                        </div>
                      )}
                      {(itemDiscountsTotal > 0 || orderOfferCalc.discountAmount > 0 || manualDiscountAmount > 0) && (
                        <div className="flex justify-between text-white font-black pt-1.5 border-t border-white/10 text-[11px]">
                          <span>Ahorro total aplicado:</span>
                          <span className="text-emerald-300">-${formatCurrency(itemDiscountsTotal + orderOfferCalc.discountAmount + manualDiscountAmount, true, true)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 sm:gap-3 mb-4 sm:mb-8 shrink-0">
                  <button onClick={() => { setCart([]); setGlobalDiscount(0); updateTab({ shoppingSessionId: null }); }} className="flex-1 bg-white border border-outline-variant/10 rounded-2xl py-4 sm:py-6 flex flex-col items-center justify-center gap-1 font-bold text-[10px] text-error shadow-sm hover:bg-error/5 transition-all"><span className="material-symbols-outlined text-[18px] sm:text-[20px]">receipt_long</span> F4 - Nuevo</button>
                  <button onClick={() => { if (cart.length > 0) { inputRef.current?.blur(); setShowPaymentModal(true); } }} className={`flex-[1] bg-[#ffeb3b] text-black rounded-2xl py-3 sm:py-4 flex flex-col items-center justify-center gap-1 font-black text-xs shadow-lg transition-all border border-[#fdd835] ${cart.length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}><span className="material-symbols-outlined text-[20px] sm:text-[22px]">credit_card</span>F2 - COBRAR</button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    onClick={() => setShowGenericModal(true)}
                    className="bg-primary hover:bg-[#9c1c1c] text-black rounded-2xl py-4 sm:py-8 flex items-center justify-center gap-1.5 font-bold shadow-md shadow-yellow-200/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs w-full"
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
                    className="bg-green-600 hover:bg-green-700 text-white rounded-2xl py-4 sm:py-8 flex items-center justify-center gap-1.5 font-bold shadow-md shadow-green-200/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs w-full"
                  >
                    <span className="material-symbols-outlined text-[18px] shrink-0">assignment_turned_in</span>
                    <span className="font-black truncate">Pre-compra</span>
                  </button>
                </div>
              </div>
            </div>

            {showPaymentModal && createPortal(
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-8 animate-in fade-in">
                <div className="bg-white rounded-3xl sm:rounded-[3rem] w-full max-w-2xl max-h-[92vh] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
                  <div className="p-4 sm:p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest flex-shrink-0"><h3 className="text-xl sm:text-2xl font-black">Finalizar Venta</h3><button onClick={() => setShowPaymentModal(false)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-container-low hover:bg-black/5 flex items-center justify-center"><span className="material-symbols-outlined text-[20px]">close</span></button></div>
                  <div className="p-4 sm:p-5 flex-1 overflow-y-auto no-scrollbar">
                    <div className="text-center mb-6 sm:mb-8">
                      <p className="text-xs sm:text-sm font-bold text-on-surface-variant uppercase mb-1 sm:mb-2 tracking-widest">Total a Pagar</p>
                      <p className="text-4xl sm:text-6xl font-black text-primary">${formatCurrency(cartTotal, true, true)}</p>
                      {(itemDiscountsTotal + orderOfferCalc.discountAmount + manualDiscountAmount) > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold mt-2">
                          <span className="material-symbols-outlined text-[14px]">savings</span>
                          <span>Ahorro aplicado: -${formatCurrency(itemDiscountsTotal + orderOfferCalc.discountAmount + manualDiscountAmount, true, true)}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 mb-6 sm:mb-8">
                      {PAYMENT_METHODS
                        .filter(m => m.id !== 'cuenta_corriente' || (validatedCustomer && validatedCustomer.hasCurrentAccount))
                        .map(m => (
                          <button key={m.id} onClick={() => { setSelectedPaymentMethod(m.id); setCcError(''); }} className={`p-4 sm:p-6 rounded-2xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${selectedPaymentMethod === m.id ? 'border-primary bg-primary/5 text-primary scale-[1.02] shadow-lg shadow-primary/10' : 'border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-lowest'}`}>
                            <span className="material-symbols-outlined text-[26px] sm:text-[32px]">{m.icon}</span>
                            <span className="font-bold text-xs sm:text-base">{m.label}</span>
                          </button>
                        ))
                      }
                    </div>
                    {selectedPaymentMethod === 'cuenta_corriente' && validatedCustomer && (
                      <div className="mt-4 space-y-2">
                        {!isHealthy && (
                          <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300 font-semibold animate-pulse shadow-sm">
                            <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">warning</span>
                            <span>Modo offline: el límite de crédito podría no estar actualizado.</span>
                          </div>
                        )}
                        <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-center justify-between">
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
                      </div>
                    )}
                  </div>
                  <div className="p-4 sm:p-8 border-t border-outline-variant/10 bg-surface-container-lowest flex-shrink-0">
                    <button 
                      disabled={isSubmittingSale || cart.length === 0}
                      onClick={() => handleCompleteSale(false)} 
                      className={`w-full text-white font-black text-base sm:text-xl py-4 sm:py-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 ${
                        isSubmittingSale
                          ? 'bg-gray-400 cursor-not-allowed opacity-80'
                          : 'bg-primary hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    >
                      {isSubmittingSale ? (
                        <>
                          <span className="inline-block w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Procesando venta...</span>
                        </>
                      ) : (
                        'Confirmar y Cobrar (Enter)'
                      )}
                    </button>
                    <p className="text-center text-[10px] font-bold text-on-surface-variant uppercase mt-4 tracking-widest">
                      {isSubmittingSale ? 'Guardando operación en caja...' : 'Enter para cobrar'}
                    </p>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {showDiscountModal && createPortal(
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 p-8"><h3 className="text-xl font-black mb-6 text-center">Aplicar Descuento</h3><div className="relative mb-6"><input ref={discountRef} type="number" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder="0" className="w-full bg-surface-container-low border-2 border-outline-variant/10 rounded-2xl py-4 px-6 text-4xl font-black text-center outline-none focus:border-primary" /><span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant opacity-50">%</span></div><div className="flex gap-3"><button onClick={() => setShowDiscountModal(false)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl transition-colors">Cancelar</button><button onClick={() => { const val = parseFloat(discountInput); if (!isNaN(val) && val >= 0 && val <= 100) setGlobalDiscount(val); setShowDiscountModal(false); }} className="flex-1 bg-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">Aplicar</button></div></div>
              </div>,
              document.body
            )}

            {showPriceModal && createPortal(
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-8 animate-in fade-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 p-8"><h3 className="text-xl font-black mb-2 text-center">Ingresar Precio</h3><p className="text-sm text-on-surface-variant text-center mb-6">{showPriceModal.name}</p><div className="relative mb-6"><span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-on-surface-variant opacity-50">$</span><input ref={priceRef} type="number" value={priceInput} onChange={e => setPriceInput(e.target.value)} placeholder="0.00" className="w-full bg-surface-container-low border-2 border-outline-variant/10 rounded-2xl py-4 px-12 text-3xl font-black text-center outline-none focus:border-primary" /></div><div className="flex gap-3"><button onClick={() => setShowPriceModal(null)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl transition-colors">Cancelar</button><button onClick={() => { const val = parseFloat(priceInput); if (!isNaN(val) && val >= 0) { setCart(cArr => cArr.map((c, i) => i === showPriceModal.idx ? { ...c, price: val } : c)); setShowPriceModal(null); } }} className="flex-1 bg-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">Guardar</button></div></div>
              </div>,
              document.body
            )}


            {/* SUCCESS MODAL: VENTA CONFIRMADA */}
            {showSuccessModal && createPortal(
              <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
                <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] w-full max-w-sm sm:max-w-md shadow-2xl overflow-y-auto max-h-[92vh] animate-in zoom-in-95 p-5 sm:p-7 text-center relative my-auto">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#e6fcf0] text-[#00c853] rounded-[1.5rem] flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-[32px] sm:text-[36px] font-black">check</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black mb-1 text-[#2d2828]">Venta confirmada</h3>
                  <p className="text-on-surface-variant mb-4 font-medium text-xs sm:text-sm text-[#5d5454] truncate">
                    Operación #{showSuccessModal.orderId} cobrada correctamente.
                  </p>

                  <div className="bg-[#f5f3f3] rounded-2xl p-4 mb-4 text-left space-y-2.5">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider shrink-0">Cliente</span>
                      <span className="font-extrabold text-xs sm:text-sm text-[#2d2828] truncate">{showSuccessModal.customer}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider shrink-0">Total</span>
                      <span className="text-base sm:text-lg font-black text-[#b71c1c]">${formatCurrency(showSuccessModal.total, true, true)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[10px] font-black text-[#8c8282] uppercase tracking-wider shrink-0">Pago</span>
                      <span className="text-[10px] font-black uppercase bg-white text-[#2d2828] px-2.5 py-0.5 rounded-full border border-outline-variant/10 shadow-xs">
                        {getPaymentMethodDisplay(showSuccessModal.paymentMethod)}
                      </span>
                    </div>
                  </div>

                  {/* Facturación Fiscal Status Indicator */}
                  {(() => {
                    const billStatus = checkSaleBilledStatus(showSuccessModal.orderId);
                    if (billStatus.isBilled && billStatus.invoice) {
                      return (
                        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-emerald-600 text-[20px] shrink-0">verified</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-emerald-950 truncate">
                              Factura {billStatus.invoice.type} #{billStatus.invoice.folio || billStatus.invoice.invoiceNumber} Autorizada
                            </p>
                            <p className="text-[10px] font-mono text-emerald-700 truncate">CAE: {billStatus.invoice.cae}</p>
                          </div>
                        </div>
                      );
                    }
                    if (billStatus.needsReconciliation) {
                      return (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0">warning</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-amber-950">Estado Desconocido</p>
                            <p className="text-[10px] text-amber-800">Requiere reconciliar con ARCA.</p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="space-y-2.5">
                    {/* Acción 1: Imprimir ticket de venta */}
                    {lastSaleTicket && (
                      <button
                        type="button"
                        onClick={() => { setShowTicket(lastSaleTicket); }}
                        className="w-full bg-[#3d3333] hover:bg-[#2b2424] text-white font-black py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                        1. Imprimir ticket de venta
                      </button>
                    )}

                    {/* Acción 2: Enviar por WhatsApp (ticket comercial) */}
                    <button
                      type="button"
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
                      className="w-full bg-[#20ba56] hover:bg-[#1caa4e] text-white font-black py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                      2. Enviar ticket por WhatsApp
                    </button>

                    {/* Acción 3: Realizar factura electrónica o Reimprimir */}
                    {(() => {
                      const billStatus = checkSaleBilledStatus(showSuccessModal.orderId);
                      if (billStatus.isBilled && billStatus.invoice) {
                        return (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950 font-bold">
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="material-symbols-outlined text-emerald-700 text-[16px] shrink-0">verified</span>
                                <span className="truncate">Venta facturada ({billStatus.invoice.type || 'B'} #{billStatus.invoice.folio || `${String(billStatus.invoice.pointOfSale).padStart(4, '0')}-${String(billStatus.invoice.invoiceNumber).padStart(8, '0')}`})</span>
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFiscalPrinterInvoice(billStatus.invoice!);
                                  setShowFiscalPrinterModal(true);
                                }}
                                className="flex-1 bg-[#1b5e20] hover:bg-[#144a19] text-white font-black py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer min-w-0"
                              >
                                <span className="material-symbols-outlined text-[16px] shrink-0">print</span>
                                <span className="truncate">3. Reimprimir Ticket</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (billStatus.invoice?.id) {
                                    billingService.openInvoicePdf(billStatus.invoice.id);
                                  }
                                }}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-black py-3 px-3 rounded-2xl transition-all flex items-center justify-center gap-1 text-xs cursor-pointer shrink-0"
                                title="Ver comprobante oficial en PDF"
                              >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>Ver PDF</span>
                              </button>
                            </div>
                          </div>
                        );
                      }
                      if (billStatus.needsReconciliation) {
                        return (
                          <div className="space-y-2">
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-950 font-bold">
                              <span className="material-symbols-outlined text-amber-700 text-[16px] shrink-0">sync_problem</span>
                              <span className="truncate">Comprobante en estado desconocido con ARCA.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (billStatus.invoice) {
                                  setAuthorizedInvoiceResult(billStatus.invoice);
                                  setUnknownOpId(billStatus.invoice.operationId || null);
                                }
                                setShowPosFiscalModal(true);
                              }}
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[18px]">sync_problem</span>
                              3. Reconciliar Factura con ARCA
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          <button
                            type="button"
                            disabled={isAuthorizingFiscal}
                            onClick={() => {
                              if (lastConfirmedSale) {
                                openFiscalFlow(lastConfirmedSale);
                              }
                            }}
                            className="w-full bg-[#b71c1c] hover:bg-[#a31919] text-white font-black py-3.5 px-3 rounded-2xl shadow-md shadow-red-900/10 transition-all flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className={`material-symbols-outlined text-[18px] shrink-0 ${isAuthorizingFiscal ? 'animate-spin' : ''}`}>
                              {isAuthorizingFiscal ? 'progress_activity' : 'receipt_long'}
                            </span>
                            <span className="truncate">{isAuthorizingFiscal ? (quickFiscalStep || 'Autorizando con ARCA...') : '3. Realizar factura electrónica'}</span>
                          </button>
                          {quickFiscalError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 font-medium space-y-1 text-left animate-in fade-in break-words">
                              <p className="font-bold flex items-center gap-1 text-red-950">
                                <span className="material-symbols-outlined text-[16px]">error</span>
                                Aviso de Facturación
                              </p>
                              <p className="break-words leading-relaxed">{quickFiscalError}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Acción 4: Finalizar */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowSuccessModal(null);
                        setTimeout(() => inputRef.current?.focus(), 100);
                      }}
                      className="w-full py-2.5 font-black text-xs sm:text-sm text-[#5d5454] hover:bg-black/5 rounded-2xl transition-colors cursor-pointer"
                    >
                      4. Finalizar
                    </button>
                  </div>
                </div>
              </div>,
              document.body
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

      {/* Fiscal Ticket Printer (Impresión Térmica Directa sin window.print()) */}
      <FiscalTicketPrinter
        invoice={fiscalPrinterInvoice}
        isOpen={showFiscalPrinterModal}
        autoPrint={true}
        onClose={() => setShowFiscalPrinterModal(false)}
      />
      {/* Cash Register Open Modal */}
      {showCashOpenModal && (() => {
        const lastDailyClose = cashCloses.find(c => c.period === 'diario' && !c.openingControlCheckedAt) || cashCloses.find(c => c.period === 'diario') || cashCloses[0];
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
              checkedBy: cashierName || 'Cajero',
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
                    {/* Efectivo esperado con desglose */}
                    <div className="bg-surface-container-low rounded-2xl p-4 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-on-surface-variant">Efectivo esperado según cierre:</span>
                        <span className="font-black text-lg text-primary">${formatCurrency(expected)}</span>
                      </div>
                      <div className="text-[10px] text-on-surface-variant/80 flex flex-wrap gap-x-2 pt-1.5 border-t border-outline-variant/10">
                        <span>Inicio: ${formatCurrency(lastDailyClose.initialAmount ?? 0)}</span>
                        <span>+ Ventas Ef.: ${formatCurrency(lastDailyClose.cashPayments ?? 0)}</span>
                        {Boolean((lastDailyClose.totalWithdrawals ?? 0) > 0) && (
                          <span className="text-error font-medium">- Retiros: ${formatCurrency(lastDailyClose.totalWithdrawals ?? 0)}</span>
                        )}
                      </div>
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
                  disabled={isSubmittingSale}
                  onClick={() => {
                    if (isSubmittingSale) return;
                    setShowLimitWarning(null);
                    handleCompleteSale(true);
                  }}
                  className={`flex-[2] text-white font-black py-4 rounded-2xl transition-colors shadow-lg flex items-center justify-center gap-2 ${
                    isSubmittingSale
                      ? 'bg-gray-400 cursor-not-allowed opacity-80'
                      : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                  }`}
                >
                  {isSubmittingSale ? (
                    <>
                      <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    'Continuar de todas formas'
                  )}
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
                    placeholder="Ej: 2614421234 o 5492614421234"
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
                      {ticketConfig.headerText || 'Martina Supermercado'}
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

      {/* ─── MODAL FISCAL POS: EMISIÓN Y CONSULTA ARCA ──────────────── */}
      {showPosFiscalModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95">

            {/* POST-CAE: VISTA COMPROBANTE AUTORIZADO POR ARCA */}
            {authorizedInvoiceResult && authorizedInvoiceResult.status === 'AUTORIZADA' ? (
              <>
                {/* Header post-CAE */}
                <div className="p-6 border-b border-outline-variant/10 bg-[#e6fcf0] flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-700/20">
                      <span className="material-symbols-outlined text-[28px]">verified</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        Comprobante Oficial Autorizado por ARCA
                      </span>
                      <h3 className="text-xl font-black text-emerald-950 mt-1">
                        Factura {authorizedInvoiceResult.type} #{authorizedInvoiceResult.folio || `${String(authorizedInvoiceResult.pointOfSale).padStart(4, '0')}-${String(authorizedInvoiceResult.invoiceNumber).padStart(8, '0')}`}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPosFiscalModal(false);
                      setShowSuccessModal(null);
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 text-neutral-600 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {/* Body post-CAE */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                  {/* Highlight Banner CAE */}
                  <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200/80 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Código de Autorización Electrónico (CAE)</p>
                      <p className="text-2xl font-mono font-black text-emerald-950 tracking-wider">
                        {authorizedInvoiceResult.cae || 'N/A'}
                      </p>
                      <p className="text-xs text-emerald-700 font-medium mt-1">
                        Vencimiento CAE: <span className="font-bold font-mono">{authorizedInvoiceResult.caeExpirationDate || 'N/A'}</span>
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Total Facturado</p>
                      <p className="text-2xl font-black text-[#b71c1c]">
                        ${formatCurrency(authorizedInvoiceResult.total, true, true)}
                      </p>
                    </div>
                  </div>

                  {/* 2 Column Details: QR & Receptor */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Left: Metadata */}
                    <div className="md:col-span-2 bg-[#f9f8f8] rounded-2xl p-5 border border-outline-variant/10 space-y-3">
                      <h4 className="text-xs font-black uppercase tracking-wider text-[#8c8282] border-b border-outline-variant/10 pb-2">
                        Datos del Comprobante y Receptor
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">Tipo y Número</span>
                          <span className="font-bold text-neutral-800">
                            Factura {authorizedInvoiceResult.type} ({authorizedInvoiceResult.pointOfSale ? String(authorizedInvoiceResult.pointOfSale).padStart(4, '0') : '0001'}-{authorizedInvoiceResult.invoiceNumber ? String(authorizedInvoiceResult.invoiceNumber).padStart(8, '0') : '1'})
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">Fecha de Emisión</span>
                          <span className="font-bold text-neutral-800">{authorizedInvoiceResult.date?.split(',')[0] || new Date().toLocaleDateString('es-AR')}</span>
                        </div>
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">Cliente / Razón Social</span>
                          <span className="font-bold text-neutral-800">{authorizedInvoiceResult.clientName || 'Consumidor Final'}</span>
                        </div>
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">CUIT / DNI</span>
                          <span className="font-bold font-mono text-neutral-800">{authorizedInvoiceResult.clientCuit || 'Sin identificar (CF)'}</span>
                        </div>
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">Venta POS Asociada</span>
                          <span className="font-mono text-neutral-800">#{authorizedInvoiceResult.saleId || lastConfirmedSale?.orderId}</span>
                        </div>
                        <div>
                          <span className="text-[#8c8282] block text-[10px] font-bold uppercase">Servicio Utilizado</span>
                          <span className="font-bold text-emerald-700">{authorizedInvoiceResult.serviceUsed || 'WSMTXCA'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: QR Fiscal con Zoom */}
                    <div className="bg-[#f9f8f8] rounded-2xl p-5 border border-outline-variant/10 flex flex-col items-center justify-center text-center">
                      {authorizedInvoiceResult.qrDataUrl ? (
                        <>
                          <div
                            onClick={() => setEnlargedQrUrl(authorizedInvoiceResult.qrDataUrl || null)}
                            className="bg-white p-2.5 rounded-2xl border-2 border-neutral-200 shadow-sm cursor-pointer hover:scale-105 transition-transform group relative"
                            title="Hacé clic para ampliar el código QR"
                          >
                            <img src={authorizedInvoiceResult.qrDataUrl} alt="QR Fiscal Oficial ARCA" className="w-28 h-28 object-contain" />
                            <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <span className="material-symbols-outlined text-[24px]">zoom_in</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-[#8c8282] font-semibold mt-2 cursor-pointer hover:text-primary transition-colors" onClick={() => setEnlargedQrUrl(authorizedInvoiceResult.qrDataUrl || null)}>
                            🔍 Clic para ampliar QR
                          </span>
                        </>
                      ) : (
                        <div className="text-center p-4 text-xs text-[#8c8282]">
                          <span className="material-symbols-outlined text-[32px] text-neutral-400">qr_code</span>
                          <p>QR no disponible</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items Table */}
                  {authorizedInvoiceResult.items && authorizedInvoiceResult.items.length > 0 && (
                    <div className="border border-outline-variant/10 rounded-2xl overflow-hidden">
                      <div className="bg-neutral-100 px-4 py-2 text-[10px] font-black uppercase text-[#8c8282] flex justify-between">
                        <span>Ítem / Descripción</span>
                        <span>Total</span>
                      </div>
                      <div className="divide-y divide-neutral-100 max-h-40 overflow-y-auto">
                        {authorizedInvoiceResult.items.map((item, idx) => (
                          <div key={idx} className="px-4 py-2.5 flex justify-between items-center text-xs">
                            <div>
                              <p className="font-bold text-neutral-800">{item.description}</p>
                              <p className="text-[10px] text-[#8c8282]">
                                {item.quantity} {item.unit || 'un.'} x ${formatCurrency(item.price, true, true)}
                                {item.codigoMtx && <span className="ml-2 font-mono text-[9px] bg-neutral-100 px-1 py-0.5 rounded">MTX: {item.codigoMtx}</span>}
                              </p>
                            </div>
                            <span className="font-bold text-neutral-900">${formatCurrency(item.total, true, true)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-neutral-50 px-4 py-3 border-t border-outline-variant/10 flex justify-between items-center text-xs">
                        <div className="space-x-4 text-[#8c8282]">
                          <span>Neto: <b className="text-neutral-800">${formatCurrency(authorizedInvoiceResult.subtotalNet ?? authorizedInvoiceResult.subtotal, true, true)}</b></span>
                          <span>IVA: <b className="text-neutral-800">${formatCurrency(authorizedInvoiceResult.taxes, true, true)}</b></span>
                        </div>
                        <div className="text-sm font-black text-[#b71c1c]">
                          Total: ${formatCurrency(authorizedInvoiceResult.total, true, true)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer post-CAE: Acciones fiscales (Reglas 8 y 9) */}
                <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-wrap gap-3 shrink-0">
                  {/* Imprimir Factura (Solo mostrada después de CAE) */}
                  <button
                    onClick={() => {
                      const printUrl = `/api/arca/invoices/${authorizedInvoiceResult.id}/pdf`;
                      const printWin = window.open(printUrl, '_blank');
                      if (printWin) printWin.focus();
                    }}
                    className="flex-1 min-w-[140px] bg-[#3d3333] hover:bg-[#2b2424] text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">print</span>
                    Imprimir Factura
                  </button>

                  {/* Ver PDF Oficial */}
                  <button
                    type="button"
                    onClick={() => {
                      if (authorizedInvoiceResult?.id) {
                        billingService.openInvoicePdf(authorizedInvoiceResult.id);
                      }
                    }}
                    className="flex-1 min-w-[140px] bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs text-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    Ver PDF Oficial
                  </button>

                  {/* Enviar Factura por WhatsApp */}
                  <button
                    onClick={() => {
                      const clientPhone = lastConfirmedSale?.customerPhone || '';
                      setWhatsappFiscalPhone(clientPhone);
                      setWhatsappFiscalError('');
                      setWhatsappFiscalSuccess(false);
                      setShowWhatsAppFiscalModal({
                        invoice: authorizedInvoiceResult,
                        phone: clientPhone
                      });
                      setTimeout(() => whatsappFiscalPhoneInputRef.current?.focus(), 150);
                    }}
                    className="flex-1 min-w-[140px] bg-[#20ba56] hover:bg-[#1caa4e] text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">chat</span>
                    Enviar por WhatsApp
                  </button>

                  {/* Finalizar */}
                  <button
                    onClick={() => {
                      setShowPosFiscalModal(false);
                      setShowSuccessModal(null);
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className="py-3.5 px-6 font-bold text-neutral-600 hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                  >
                    Finalizar
                  </button>
                </div>
              </>
            ) : (
              /* PRE-AUTHORIZATION VIEW: DETERMINACIÓN Y RESUMEN PREVIO (Reglas 1, 2, 6, 7) */
              <>
                {/* Header pre-autorización */}
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined">receipt_long</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-neutral-900">
                        Emisión de Factura Electrónica ARCA
                      </h3>
                      <p className="text-xs text-neutral-500 font-medium">
                        Venta #{lastConfirmedSale?.orderId} • La venta ya fue cobrada y registrada independientemente
                      </p>
                    </div>
                  </div>
                  {!isAuthorizingFiscal && (
                    <button
                      onClick={() => setShowPosFiscalModal(false)}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 text-neutral-500 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  )}
                </div>

                {/* Body pre-autorización */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                  {/* Alert Error */}
                  {fiscalError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-start gap-3">
                      <span className="material-symbols-outlined text-red-600 shrink-0 text-[20px]">error</span>
                      <div className="flex-1">
                        <p className="font-bold">Atención Fiscal</p>
                        <p className="mt-0.5 leading-relaxed">{fiscalError}</p>
                      </div>
                    </div>
                  )}

                  {/* Warning Estado Desconocido (Regla 3) */}
                  {unknownOpId && (
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-900 text-xs flex items-start gap-3">
                      <span className="material-symbols-outlined text-amber-600 shrink-0 text-[24px]">sync_problem</span>
                      <div className="flex-1">
                        <p className="font-black text-sm">Operación en ESTADO_DESCONOCIDO</p>
                        <p className="mt-1 leading-relaxed text-amber-800">
                          Se agotó el tiempo de espera con ARCA. Por seguridad fiscal estricta, ARCA prohíbe volver a emitir sin verificar antes si el CAE fue generado.
                        </p>
                        <div className="mt-3">
                          <button
                            onClick={handleReconcileFiscal}
                            disabled={isReconciling}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            {isReconciling ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <span>Reconciliando con ARCA...</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[16px]">sync</span>
                                <span>Reconciliar Operación con ARCA</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Regla 1: Determinación de Comprobante según Condición Fiscal */}
                  <div className="bg-[#f9f8f8] rounded-2xl p-5 border border-outline-variant/10 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#8c8282]">
                      1. Condición Fiscal y Tipo de Comprobante (Reglas ARCA)
                    </h4>

                    {/* Selector de Condición del Receptor */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento'] as const).map(cond => (
                        <button
                          key={cond}
                          type="button"
                          disabled={isAuthorizingFiscal}
                          onClick={() => handleFiscalTaxConditionChange(cond)}
                          className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all cursor-pointer ${fiscalTaxCondition === cond
                              ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                              : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                            }`}
                        >
                          {cond}
                        </button>
                      ))}
                    </div>

                    {/* Explicación y Tipo Sugerido */}
                    <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs">
                      <span className="material-symbols-outlined text-blue-600 text-[20px] shrink-0 mt-0.5">balance</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-blue-950">Tipo sugerido: Factura {fiscalInvoiceType}</span>
                          <span className="text-[10px] bg-blue-200/80 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                            Determinado por Normativa Fiscal
                          </span>
                        </div>
                        <p className="text-blue-800 text-[11px] mt-1 leading-relaxed">
                          {fiscalTypeReason}
                        </p>
                      </div>
                    </div>

                    {/* Botones de Comprobante (Control estricto según condición) */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
                      <span className="text-xs font-bold text-neutral-600 shrink-0">Tipo de Comprobante:</span>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={fiscalTaxCondition === 'Responsable Inscripto' || fiscalTaxCondition === 'Monotributista' || isAuthorizingFiscal}
                          onClick={() => {
                            setFiscalInvoiceType('B');
                            fetchNextVoucherNumber(fiscalPointOfSale, 'B');
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${fiscalInvoiceType === 'B'
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed'
                            }`}
                        >
                          Factura B
                        </button>
                        <button
                          type="button"
                          disabled={fiscalTaxCondition === 'Consumidor Final' || fiscalTaxCondition === 'Exento' || isAuthorizingFiscal}
                          onClick={() => {
                            setFiscalInvoiceType('A');
                            fetchNextVoucherNumber(fiscalPointOfSale, 'A');
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${fiscalInvoiceType === 'A'
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed'
                            }`}
                        >
                          Factura A
                        </button>
                      </div>
                      {(fiscalTaxCondition === 'Consumidor Final' || fiscalTaxCondition === 'Exento') && (
                        <span className="text-[10px] text-neutral-500 italic">
                          (Factura A bloqueada para Consumidor Final)
                        </span>
                      )}
                      {(fiscalTaxCondition === 'Responsable Inscripto' || fiscalTaxCondition === 'Monotributista') && (
                        <span className="text-[10px] text-neutral-500 italic">
                          (Factura A obligatoria por RG 5003)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. Datos del Cliente / Receptor */}
                  <div className="bg-[#f9f8f8] rounded-2xl p-5 border border-outline-variant/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-[#8c8282]">
                        2. Datos del Cliente / Receptor
                      </h4>
                      {fiscalTaxCondition !== 'Consumidor Final' && (
                        <button
                          type="button"
                          onClick={handleResetToAnonymousCf}
                          className="text-[11px] font-bold text-neutral-500 hover:text-primary transition-colors cursor-pointer"
                        >
                          Restablecer a Consumidor Final
                        </button>
                      )}
                    </div>

                    {/* Buscador de Cliente Registrado */}
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[18px]">
                            person_search
                          </span>
                          <input
                            type="text"
                            placeholder="Buscar en clientes registrados (Nombre, CUIT, DNI, Teléfono)..."
                            value={fiscalCustomerSearch}
                            onChange={e => {
                              setFiscalCustomerSearch(e.target.value);
                              setShowFiscalCustomerSearchDropdown(true);
                            }}
                            onFocus={() => {
                              if (fiscalCustomerSearch.trim()) setShowFiscalCustomerSearchDropdown(true);
                            }}
                            className="w-full bg-white border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-neutral-800 outline-none focus:border-primary"
                          />
                        </div>
                        {fiscalCustomerSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setFiscalCustomerSearch('');
                              setShowFiscalCustomerSearchDropdown(false);
                            }}
                            className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>

                      {/* Dropdown con resultados */}
                      {showFiscalCustomerSearchDropdown && matchedFiscalCustomers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-xl border border-outline-variant/20 shadow-xl overflow-hidden divide-y divide-neutral-100 max-h-48 overflow-y-auto">
                          {matchedFiscalCustomers.map(cust => (
                            <div
                              key={cust.id}
                              onClick={() => handleSelectCustomerForFiscal(cust)}
                              className="p-2.5 hover:bg-neutral-50 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <div>
                                <p className="text-xs font-bold text-neutral-800">
                                  {cust.businessName || cust.name}
                                  {cust.businessName && cust.name && cust.businessName !== cust.name && (
                                    <span className="text-[10px] text-neutral-400 ml-1 font-normal">({cust.name})</span>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                                  {cust.cuit && <span>CUIT: <strong className="font-mono">{cust.cuit}</strong></span>}
                                  {cust.dni && <span>DNI: {cust.dni}</span>}
                                  <span>{cust.phone}</span>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                cust.taxCondition === 'Responsable Inscripto' ? 'bg-purple-100 text-purple-700' :
                                cust.taxCondition === 'Monotributista' ? 'bg-blue-100 text-blue-700' :
                                'bg-neutral-100 text-neutral-600'
                              }`}>
                                {cust.taxCondition || 'Consumidor Final'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Razón Social */}
                      <div>
                        <label className="text-[10px] font-bold text-neutral-600 uppercase mb-1 block">
                          Razón Social / Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          disabled={isAuthorizingFiscal}
                          value={fiscalCustomerName}
                          onChange={e => setFiscalCustomerName(e.target.value)}
                          placeholder="Nombre del cliente o razón social"
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-neutral-800 outline-none focus:border-primary"
                        />
                      </div>

                      {/* Documento (Regla 6: Consumidor Final DNI no exigido < 344.488) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase">
                            {fiscalInvoiceType === 'A' ? 'CUIT del Cliente *' : (fiscalTaxCondition === 'Consumidor Final' ? 'DNI del Cliente' : 'CUIT / DNI *')}
                          </label>
                          {fiscalTaxCondition === 'Consumidor Final' && (
                            <span className="text-[9px] text-neutral-500">
                              {isCfDniMandatory ? 'Obligatorio (> $344.488)' : 'Opcional según ARCA'}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          disabled={isAuthorizingFiscal}
                          value={fiscalDocNumber}
                          onChange={e => {
                            const val = e.target.value;
                            setFiscalDocNumber(val);
                            if (fiscalTaxCondition === 'Consumidor Final') {
                              setFiscalDocType(val.trim() ? 'DNI' : 'SIN_IDENTIFICAR');
                            }
                          }}
                          placeholder={
                            fiscalInvoiceType === 'A'
                              ? 'CUIT (11 dígitos sin guiones)'
                              : (fiscalTaxCondition === 'Consumidor Final' ? (isCfDniMandatory ? 'DNI obligatorio' : 'Opcional a pedido del cliente') : 'Número de documento')
                          }
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-neutral-800 outline-none focus:border-primary"
                        />
                        {/* Validación en tiempo real para CUIT */}
                        {fiscalInvoiceType === 'A' && fiscalDocNumber && (
                          <div className="mt-1 text-[10px]">
                            {validateCuit(fiscalDocNumber).valid ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span> CUIT Válido (Módulo 11 oficial)
                              </span>
                            ) : (
                              <span className="text-red-600 font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">cancel</span> {validateCuit(fiscalDocNumber).error}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. Punto de Venta y Próximo Número (Regla 7, 10, 11) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#f9f8f8] rounded-2xl p-4 border border-outline-variant/10 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase block">Punto de Venta</span>
                        <span className="text-lg font-black text-neutral-800">
                          {String(fiscalPointOfSale).padStart(4, '0')}
                        </span>
                      </div>
                      <span className="text-[10px] bg-neutral-200 text-neutral-700 font-bold px-2 py-0.5 rounded-md">
                        Comercio Principal
                      </span>
                    </div>

                    <div className="bg-[#f9f8f8] rounded-2xl p-4 border border-outline-variant/10 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase block">Próximo Número Oficial</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isLoadingNextNumber ? (
                            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                              <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                              <span>Consultando a ARCA...</span>
                            </div>
                          ) : fiscalNextNumber !== null ? (
                            <span className="text-lg font-black font-mono text-neutral-900">
                              {String(fiscalNextNumber).padStart(8, '0')}
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 font-bold">Sin respuesta ARCA</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                        Consultado a ARCA
                      </span>
                    </div>
                  </div>

                  {/* 4. Lista de Productos Resuelta (Regla 7) */}
                  <div className="border border-outline-variant/10 rounded-2xl overflow-hidden">
                    <div className="bg-neutral-100 px-4 py-2.5 text-[10px] font-black uppercase text-[#8c8282] grid grid-cols-12 gap-2">
                      <span className="col-span-6">Producto</span>
                      <span className="col-span-2 text-center">Cant.</span>
                      <span className="col-span-2 text-right">Unitario</span>
                      <span className="col-span-2 text-right">Subtotal</span>
                    </div>
                    <div className="divide-y divide-neutral-100 max-h-44 overflow-y-auto">
                      {fiscalItems.map((item, idx) => {
                        const hasBarcode = !!(item.codigoMtx || item.barcode || item.gtin || item.ean || '').trim();
                        return (
                          <div key={idx} className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-6">
                              <p className="font-bold text-neutral-800 truncate">{item.description}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {hasBarcode ? (
                                  <span className="text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded">
                                    MTX: {item.codigoMtx || item.barcode}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.2 rounded">
                                    Sin código fiscal MTX
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="col-span-2 text-center font-bold text-neutral-700">
                              {item.quantity} {item.unit || 'un.'}
                            </span>
                            <span className="col-span-2 text-right font-medium text-neutral-600">
                              ${formatCurrency(item.price, true, true)}
                            </span>
                            <span className="col-span-2 text-right font-bold text-neutral-900">
                              ${formatCurrency(item.total, true, true)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 5. Totales Fiscales (Regla 7) */}
                  <div className="bg-neutral-50 rounded-2xl p-5 border border-outline-variant/10 space-y-2">
                    <div className="flex justify-between text-xs text-neutral-600">
                      <span>Subtotal Neto Gravado</span>
                      <span className="font-bold text-neutral-800">${formatCurrency(fiscalCalculations.subtotalNet, true, true)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-neutral-600">
                      <span>IVA Discriminado (21%)</span>
                      <span className="font-bold text-neutral-800">${formatCurrency(fiscalCalculations.taxes, true, true)}</span>
                    </div>
                    <div className="flex justify-between text-base font-black pt-2 border-t border-neutral-200">
                      <span className="text-neutral-900">TOTAL FACTURA {fiscalInvoiceType}</span>
                      <span className="text-[#b71c1c] text-lg">${formatCurrency(fiscalCalculations.total, true, true)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer pre-autorización */}
                <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={isAuthorizingFiscal}
                    onClick={() => setShowPosFiscalModal(false)}
                    className="flex-1 py-3.5 font-bold text-neutral-600 hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                  >
                    Volver a Caja
                  </button>
                  <button
                    type="button"
                    disabled={
                      isAuthorizingFiscal ||
                      isLoadingNextNumber ||
                      fiscalNextNumber === null ||
                      !fiscalCustomerName.trim() ||
                      (fiscalInvoiceType === 'A' && !validateCuit(fiscalDocNumber).valid) ||
                      (fiscalTaxCondition === 'Consumidor Final' && isCfDniMandatory && (!fiscalDocNumber || fiscalDocNumber === '0')) ||
                      fiscalItems.length === 0 ||
                      fiscalItems.some(i => !(i.barcode || i.codigoMtx || '').trim())
                    }
                    onClick={handleAuthorizeFiscal}
                    className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAuthorizingFiscal ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <span>{fiscalAuthStep || 'Conectando con ARCA...'}</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Confirmar y Solicitar CAE a ARCA</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL WHATSAPP FACTURA FISCAL (Regla 5) ─────────────────── */}
      {showWhatsAppFiscalModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 text-left relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-[#e6fcf0] text-[#20ba56] rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[26px]">chat</span>
              </div>
              <div>
                <h3 className="text-lg font-black text-neutral-900">Enviar Factura por WhatsApp</h3>
                <p className="text-xs text-neutral-500 font-medium">Factura {showWhatsAppFiscalModal.invoice.type} #{showWhatsAppFiscalModal.invoice.folio || showWhatsAppFiscalModal.invoice.invoiceNumber}</p>
              </div>
            </div>

            {whatsappFiscalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {whatsappFiscalError}
              </div>
            )}

            {whatsappFiscalSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check</span> Mensaje generado correctamente
              </div>
            )}

            {/* Aviso de entorno seguro / No localhost (Regla 5) */}
            {(window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-[11px] rounded-xl flex items-start gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[18px] shrink-0">info</span>
                <span>
                  <b>Entrega Segura de PDF:</b> En entorno local se utilizará la URL pública configurada para que el cliente pueda abrir el PDF desde su teléfono.
                </span>
              </div>
            )}

            <form onSubmit={handleSendWhatsAppFiscal} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-700 uppercase mb-1.5 block">
                  Número de Celular del Cliente
                </label>
                <div className="relative">
                  <input
                    ref={whatsappFiscalPhoneInputRef}
                    type="tel"
                    required
                    disabled={isSendingWhatsAppFiscal || whatsappFiscalSuccess}
                    value={whatsappFiscalPhone}
                    onChange={e => setWhatsappFiscalPhone(e.target.value)}
                    placeholder="Ej: 3794123456"
                    className="w-full bg-[#f9f8f8] border border-neutral-200 rounded-2xl py-3.5 px-4 text-sm font-bold text-neutral-800 outline-none focus:border-[#20ba56]"
                  />
                  <span className="absolute right-3 top-3.5 text-[10px] text-neutral-400 font-mono">AR (+54 9)</span>
                </div>
              </div>

              {/* Vista Previa del Mensaje Fiscal */}
              <div className="bg-[#f5f3f3] rounded-2xl p-4 text-[11px] text-neutral-700 space-y-1 font-mono">
                <p className="font-bold text-neutral-900">Vista previa del mensaje:</p>
                <p className="text-[#20ba56] font-bold">SUPERMERCADO LA MARTINA - Factura Electrónica 📄</p>
                <p>Estimado/a {showWhatsAppFiscalModal.invoice.clientName || 'Cliente'}:</p>
                <p>Comprobante: Factura {showWhatsAppFiscalModal.invoice.type} #{showWhatsAppFiscalModal.invoice.folio}</p>
                <p>CAE: {showWhatsAppFiscalModal.invoice.cae}</p>
                <p>Total: ${formatCurrency(showWhatsAppFiscalModal.invoice.total, true, true)}</p>
                <p className="text-blue-600 font-bold truncate">Descarga PDF: /api/arca/invoices/{showWhatsAppFiscalModal.invoice.id}/pdf</p>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  disabled={isSendingWhatsAppFiscal || whatsappFiscalSuccess}
                  onClick={() => setShowWhatsAppFiscalModal(null)}
                  className="flex-1 py-3.5 font-bold text-neutral-600 hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSendingWhatsAppFiscal || whatsappFiscalSuccess || !whatsappFiscalPhone.trim()}
                  className="flex-[2] bg-[#20ba56] hover:bg-[#1caa4e] text-white font-black py-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Enviar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL ZOOM QR FISCAL ──────────────────────────────────── */}
      {enlargedQrUrl && (
        <div
          className="fixed inset-0 bg-black/85 z-[700] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in cursor-pointer"
          onClick={() => setEnlargedQrUrl(null)}
        >
          <div
            className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center max-w-sm w-full text-center cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
            </div>
            <h4 className="font-black text-base text-neutral-900 mb-1">Código QR Fiscal Oficial ARCA</h4>
            <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
              Acercá la cámara del celular para escanear y validar el CAE directamente en el portal oficial de ARCA.
            </p>
            <div className="p-4 bg-white border-2 border-neutral-200 rounded-3xl shadow-inner mb-6">
              <img src={enlargedQrUrl} alt="QR Fiscal Oficial Ampliado" className="w-64 h-64 object-contain" />
            </div>
            <button
              onClick={() => setEnlargedQrUrl(null)}
              className="w-full py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold rounded-2xl transition-colors text-xs cursor-pointer"
            >
              Cerrar Vista de QR
            </button>
          </div>
        </div>
      )}
      {/* Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <BarcodeScannerModal
          open={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onDetected={(code) => {
            setSearchCode(code);
            handleAddItem(code);
          }}
        />
      )}
    </div>
  );
};
