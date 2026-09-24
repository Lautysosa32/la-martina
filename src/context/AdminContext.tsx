import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { products as catalogProducts, categories as catalogCategories } from '../data/mockData';
import type { Category, Subcategory } from '../data/mockData';
export type { Category, Subcategory };
import { Product } from '../types/product.types';
export type { Product };
import { useProductStore } from '../stores/useProductStore';
import { useAuthStore } from '../stores/useAuthStore';
import { whatsappMessageService } from '../services/whatsapp-message.service';
import { supabase } from '../lib/supabase';
import {
  fetchOrders, insertOrder, updateOrderInDb, updateOrderItemsInDb,
  fetchCashMovements, insertCashMovement,
  fetchCashCloses, insertCashClose,
  fetchOffers, insertOffer, updateOfferInDb, deleteOfferInDb,
  fetchCustomerProfiles, upsertCustomerProfile,
  fetchSetting, saveSetting,
  fetchCategories, insertCategory, updateCategoryInDb, deleteCategoryFromDb,
  fetchSubcategories, insertSubcategory, updateSubcategoryInDb, deleteSubcategoryFromDb
} from '../services/admin.service';
import { fetchExpenses, insertExpense, updateExpenseInDb, cancelExpenseInDb } from '../services/expense.service';
import type { Expense } from '../types/expense.types';
export type { Expense };
import { billingService, FiscalBusinessConfig } from '../services/billing.service';
export type { FiscalBusinessConfig };
import { thermalPrinterService, ThermalPrinterConfig } from '../services/thermalPrinter.service';
export type { ThermalPrinterConfig };
import { isTierMatch, applyOffersToCartItem as pureApplyOffersToCartItem, applyOrderOffers as pureApplyOrderOffers } from '../../supabase/functions/_shared/pricing';
import type { PricingItemInput } from '../../supabase/functions/_shared/pricing.types';

// ─── Interfaces ────────────────────────────────────────────

export interface AdminOrder {
  id: string;
  date: string;
  timestamp?: number; // ms since epoch — used for date filtering
  customer: string;
  phone: string;
  dni?: string; // Added for verification
  address: string;
  deliveryTime: string;
  method: string;
  paymentMethod: string;
  paymentStatus: 'Pagado' | 'Pendiente' | 'Fallido';
  status: 'Nuevo' | 'Preparando' | 'Listo' | 'En Camino' | 'Entregado' | 'Cancelado';
  total: number;
  estimatedTotal?: number; // Total original estimado antes de pesar
  weightAdjusted?: boolean; // Flag si fue ajustado por balanza
  paidAmount?: number; // Amount already paid for this order (useful for partial payments)
  items: {
    id: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
    originalQuantity?: number; // Cantidad pedida originalmente
    originalPrice?: number;
    offerId?: string;
    lineDiscount?: number;
    discountedQuantity?: number;
    saleType?: 'unit' | 'weight'
  }[];
  source?: 'pos' | 'whatsapp' | 'web';
  discount?: number;
  discountLabel?: string;
  discountOfferId?: string;
  checkoutToken?: string; // Temporal auth token from backend
  // Nuevos campos para ubicación detallada
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address_label?: string | null;
  delivery_house_number?: string | null;
  delivery_reference?: string | null;
  delivery_notes?: string | null;
  delivery_method?: 'envio' | 'retiro' | null;
  was_limit_override?: boolean;
  override_reason?: string;
}

export interface AdminCustomer {
  id?: string;
  dni: string;
  name: string;
  phone: string;
  address: string;
  totalOrders: number;
  totalSpent: number;
  lastOrder: string;
  hasCurrentAccount: boolean;
  currentDebt: number;
  creditLimit: number;
  birthday?: string; // YYYY-MM-DD
  spent30: number;
  tier: 'Gold' | 'Silver' | 'Bronze' | 'Regular';
  oldestDebtDays?: number;
  useCustomAccountLimits?: boolean;
  customDebtLimit?: number;
  customDebtDays?: number;
  accountLimitNotes?: string;

  // Campos Fiscales Unificados
  cuit?: string;
  documentType?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
  documentNumber?: string;
  taxCondition?: string;
  businessName?: string;
  fiscalAddress?: string;
  email?: string;
  isFiscal?: boolean;
}

export interface CustomerProfile {
  id?: string;
  dni?: string;
  phone: string;
  hasCurrentAccount: boolean;
  creditLimit?: number;
  birthday?: string;
  nombre?: string;
  name?: string;
  apellido?: string;
  last_name?: string;
  direccion?: string;
  address?: string;
  isManual?: boolean; // true if created manually from Customers screen
  useCustomAccountLimits?: boolean;
  customDebtLimit?: number;
  customDebtDays?: number;
  accountLimitNotes?: string;

  // Campos Fiscales Unificados
  cuit?: string;
  document_type?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
  documentType?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
  tax_condition?: string;
  taxCondition?: string;
  business_name?: string;
  businessName?: string;
  fiscal_address?: string;
  fiscalAddress?: string;
  email?: string;
  is_fiscal?: boolean;
  isFiscal?: boolean;
}

export interface CurrentAccountConfig {
  enabled: boolean;
  maxDebtAmount: number;
  maxDebtDays: number;
  warnOnAmountLimit: boolean;
  warnOnTimeLimit: boolean;
  allowOverride: boolean;
}

export interface TicketConfig {
  blankLinesTop: number;
  blankLinesBottom: number;
  headerText: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessCuit: string;
  footerMessage: string;
  showLogo: boolean;
}

export interface GeneralConfig {
  suspendEmployeeNotifications: boolean;
  deliveryRadiusKm: number;
  storeLat: number;
  storeLng: number;
  blockedPhones: string[];
  shippingBaseCost: number;
  shippingCostPerKm: number;
  freeShippingMinAmount: number;
}

export interface DeliveryTimeSlot {
  id: string;
  label: string;
  sub: string;
  icon: string;
  enabled: boolean;
  cutoffTime?: string; // HH:mm (ej: "13:45")
  startTime?: string;  // HH:mm (ej: "09:00")
  endTime?: string;    // HH:mm (ej: "21:00")
  endHour?: number;
  endMin?: number;
  isTomorrow?: boolean;
  freeShipping?: boolean; // si el envío es 100% gratuito en este horario
  order?: number;
}

export const defaultDeliveryTimeSlots: DeliveryTimeSlot[] = [
  { id: 'asap', label: 'Lo antes posible', sub: '30-60 min', icon: 'bolt', enabled: true, startTime: '09:00', endTime: '21:00' },
  { id: 'today_midday', label: 'Hoy al Mediodía', sub: '13:00 a 14:00', icon: 'sunny', enabled: true, cutoffTime: '13:45' },
  { id: 'today_2', label: 'Hoy a la Noche', sub: '21:00 a 22:00', icon: 'dark_mode', enabled: true, cutoffTime: '21:45' },
  { id: 'tomorrow_1', label: 'Mañana al Mediodía', sub: '13:00 a 14:00', icon: 'event', enabled: true, isTomorrow: true }
];

export interface CashRegister {
  isOpen: boolean;
  initialAmount: number;
  openedBy: string;
  openedAt: string;
}

export interface InvoiceItem {
  productId?: string;
  code?: string;
  codigoMtx?: string;
  barcode?: string;
  gtin?: string;
  ean?: string;
  unidadesMtx?: number;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  price: number;
  taxRate: number; // e.g. 21, 10.5, 0
  netAmount?: number;
  vatAmount?: number;
  discountAmount?: number;
  total: number;
}

export type InvoiceOrigin = 'ARCA_LOCAL' | 'EXTERNA_MANUAL';

export type InvoiceStatus = 
  | 'BORRADOR'
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'AUTORIZADA'
  | 'RECHAZADA'
  | 'ESTADO_DESCONOCIDO'
  | 'ERROR_TECNICO'
  | 'REGISTRADA_EXTERNAMENTE'
  | 'VERIFICADA_EN_ARCA'
  | 'ANULADA'
  | 'ANULADA_POR_NC'
  | 'Emitida'; // Legacy support

export type InvoiceType = 'A' | 'B' | 'C' | 'NC_A' | 'NC_B' | 'NC_C' | 'ND_A' | 'ND_B' | 'ND_C';

export interface Invoice {
  id: string;
  date: string;
  serie?: string;
  folio: string; // Ej: "0001-00000125"
  pointOfSale?: number;
  invoiceNumber?: number;
  origin?: InvoiceOrigin;
  attachmentUrl?: string;
  notes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  
  // Receptor
  customerId?: string;
  clientName: string;
  clientCuit: string;
  customerName?: string;
  customerDocumentType?: string;
  customerDocumentNumber?: string;
  customerCuit?: string;
  customerTaxCondition?: string;
  customerAddress?: string;

  // Importes
  subtotal: number;
  subtotalNet?: number;
  taxes: number;
  total: number;
  currency?: string;

  // Venta asociada
  saleId: string;
  saleIds?: string[];
  type: InvoiceType;
  invoiceType?: InvoiceType;
  invoiceTypeCode?: number;
  status: InvoiceStatus;
  direction?: 'venta' | 'compra';
  serviceUsed?: 'WSMTXCA' | 'WSFEv1';

  // Datos Fiscales ARCA
  arcaStatus?: 'AUTORIZADO' | 'RECHAZADO' | 'ESTADO_DESCONOCIDO' | 'ERROR';
  cae?: string;
  caeExpirationDate?: string;
  arcaObservations?: any[];
  arcaErrors?: any[];
  arcaErrorCode?: string;
  arcaErrorMessage?: string;
  operationId?: string;

  // Comprobantes Asociados (para Notas de Crédito / Débito)
  originalPointOfSale?: number;
  originalInvoiceNumber?: number;
  originalInvoiceType?: string;
  associatedInvoiceId?: string;
  associatedPointOfSale?: number;
  associatedInvoiceNumber?: number;
  associatedInvoiceType?: string;
  associatedInvoiceTypeCode?: number;
  associatedCuit?: string;

  // PDF y QR
  pdfUrl?: string;
  qrPayload?: string;
  qrDataUrl?: string;

  items?: InvoiceItem[];
  vatBreakdown?: Array<{ vatRate: number; vatCode: number; baseAmount: number; vatAmount: number }>;
  
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface BillingCustomer {
  id: string;
  name: string;
  documentType?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
  documentNumber?: string;
  cuit: string;
  taxCondition: string;
  address: string;
  phone: string;
  email: string;
  lastValidationDate?: string;
  fiscalValidationStatus?: 'valid' | 'invalid' | 'pending';
  notes?: string;
}

export interface CashWithdrawal {
  id: string;
  amount: number;
  reason: string;
  user: string;
  timestamp: number;
}

export interface Offer {
  id: string;
  name: string;
  description: string;
  // Scope: product | category | subcategory | tag | all | customer | birthday | tier
  scope: 'product' | 'category' | 'subcategory' | 'tag' | 'all' | 'customer' | 'birthday' | 'tier';
  targetId?: string; // productId, categoryId, subcategoryId, tag, customerDni, or tier name depending on scope
  targetIds?: string[]; // for multi-product selection when scope is 'product'
  // Legacy field kept for backward compatibility
  productId?: string;
  subcategoryId?: string;
  tagFilter?: string;
  requiredTier?: string; // optional restriction to customer tier e.g. 'Gold' | 'Silver' | 'Bronze' | 'Regular'
  discountType: 'percent' | 'fixed';
  discountPercent: number; // kept for backward compat, use discountValue
  discountValue: number;
  maxDiscountAmount?: number; // Optional ceiling for percentage discounts
  startDate: string;
  endDate: string;
  active: boolean;
  label?: string;
  daily_quantity_limit?: number | null;
  per_customer_daily_limit?: number | null;
  total_quantity_limit?: number | null;
  limit_strategy?: 'discount_only' | 'block_sale' | 'hide_offer';
}

export interface HeroBanner {
  id: string;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  linkUrl?: string;
  linkLabel?: string;
  linkExternal?: boolean;
  active: boolean;
  order: number;
}

export interface StoreStatus {
  onlineSalesPaused: boolean;
  pauseReason: string;
  pausedAt: string | null;
  pausedBy: string | null;
  resumeMessage: string;
  allowBrowsingWhilePaused: boolean;
}

export interface AutoCashCloseConfig {
  enabled: boolean;
  time: string; // HH:mm format, e.g. "22:00"
}

export interface OfferRedemption {
  id: string;
  offer_id: string;
  product_id?: string;
  order_id?: string;
  customer_phone?: string;
  quantity: number;
  discount_amount: number;
  redemption_date: string;
  created_at: string;
}

export interface CashClose {
  id: string;
  date: string;
  period: 'diario' | 'semanal' | 'mensual';
  totalSales: number;
  totalOrders: number;
  cashPayments: number;
  cardPayments: number;
  transferPayments: number;
  cuentaCorrientePayments?: number;
  closedAt: string;
  // Extended fields
  withdrawals: CashWithdrawal[];
  totalWithdrawals: number;
  movementIds: string[];
  initialAmount?: number;
  // Control de Apertura (para el día siguiente)
  openingControlExpected?: number;    // efectivo esperado calculado al cierre
  openingControlCounted?: number;     // efectivo real encontrado al abrir
  openingControlDifference?: number;  // counted - expected
  openingControlNotes?: string;
  openingControlCheckedAt?: string;   // ISO timestamp
  openingControlCheckedBy?: string;
}

export interface CashMovement {
  id: string;
  type: 'Ingreso' | 'Egreso' | 'Retiro';
  description: string;
  cashier: string;
  amount: number;
  timestamp: number;
  orderId?: string; // links to AdminOrder for detail view
}

export interface AdminContextType {
  // Products
  adminProducts: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;
  deleteProduct: (productId: string) => void;
  bulkUpdatePrice: (productIds: string[], percentageIncrease: number) => void;
  bulkAddProducts: (products: Product[], stockUpdates: Record<string, number>) => void;

  // Categories
  adminCategories: Category[];
  addCategory: (category: Category) => void;
  updateCategory: (categoryId: string, updates: Partial<Category>) => void;
  deleteCategory: (categoryId: string) => void;

  // Subcategories
  adminSubcategories: Subcategory[];
  addSubcategory: (subcategory: Subcategory) => void;
  updateSubcategory: (subcategoryId: string, updates: Partial<Subcategory>) => void;
  deleteSubcategory: (subcategoryId: string) => void;

  // Tags (Badges)
  adminTags: string[];
  addTag: (tag: string) => void;
  updateTag: (oldTag: string, newTag: string) => void;
  deleteTag: (tag: string) => void;

  // Stock
  stockMap: Record<string, number>;
  updateStock: (productId: string, newStock: number) => void;
  getStock: (productId: string, fallbackStock?: number) => number;
  deductStockForOrder: (items: { id: string; quantity: number; stock?: number }[]) => { success: boolean; insufficientItems: { id: string; name: string; requested: number; available: number }[] };
  lowStockProducts: (Product & { stock: number })[];

  // Barcode
  findProductByBarcode: (barcode: string) => Product | undefined;
  searchProductExternal: (barcode: string) => Promise<Partial<Product> | null>;

  // Orders
  orders: AdminOrder[];
  addAdminOrder: (order: AdminOrder) => Promise<void>;
  updateOrderStatus: (orderId: string, status: AdminOrder['status']) => void;
  updateOrderMethod: (orderId: string, method: string) => void;
  updateOrderPaymentMethod: (orderId: string, paymentMethod: string) => void;
  updateOrderWeightItems: (orderId: string, updatedItems: AdminOrder['items']) => void;

  // Customers
  customers: AdminCustomer[];
  toggleCurrentAccount: (phone: string) => { success: boolean; message?: string };
  updateCustomerProfile: (oldPhone: string, updates: Partial<{ 
    name: string; 
    phone: string; 
    dni: string; 
    birthday: string; 
    creditLimit: number; 
    useCustomAccountLimits: boolean; 
    customDebtLimit: number; 
    customDebtDays: number; 
    accountLimitNotes: string;
    cuit: string;
    documentType: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
    documentNumber: string;
    taxCondition: string;
    businessName: string;
    fiscalAddress: string;
    email: string;
    isFiscal: boolean;
  }>) => Promise<boolean> | void;
  settleCurrentAccount: (phone: string, method: string, amount?: number) => void;
  addManualCustomer: (data: { 
    nombre: string; 
    apellido: string; 
    telefono: string; 
    direccion: string; 
    dni?: string;
    cuit?: string;
    documentType?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
    taxCondition?: string;
    businessName?: string;
    fiscalAddress?: string;
    email?: string;
  }) => void;
  deleteCustomer: (phone: string) => { success: boolean; message?: string };

  // Stats
  totalRevenue: number;
  ordersRevenue: number;
  posRevenue: number;
  totalDebtInStreet: number;
  activeOrdersCount: number;
  lowStockCount: number;
  totalCustomers: number;

  // Current Account Limits
  currentAccountConfig: CurrentAccountConfig;
  updateCurrentAccountConfig: (config: Partial<CurrentAccountConfig>) => void;
  loadAdminData: () => Promise<void>;

  // Offers
  offers: Offer[];
  addOffer: (offer: Offer) => void;
  updateOffer: (offerId: string, updates: Partial<Offer>) => void;
  deleteOffer: (offerId: string) => void;
  activeOffers: Offer[];
  applyOffersToCartItem: (item: { productId: string; categoryId?: string; price: number; quantity: number }, customer?: AdminCustomer | null, options?: { forDisplay?: boolean }) => { finalPrice: number; discountAmount: number; offerLabel: string | null; offerId: string | null; discountedQuantity: number; originalPrice?: number };
  applyOrderOffers: (subtotalAfterItemDiscounts: number, customer?: AdminCustomer | null) => { discountAmount: number; offerLabel: string | null; offerId: string | null };
  offerRedemptions: OfferRedemption[];
  addOfferRedemption: (redemption: Omit<OfferRedemption, 'id' | 'created_at' | 'redemption_date'>) => void;

  // Store Status
  storeStatus: StoreStatus;
  updateStoreStatus: (updates: Partial<StoreStatus>) => void;

  // Cash Close & Movements
  cashCloses: CashClose[];
  performCashClose: (withdrawals?: CashWithdrawal[]) => CashClose | null;
  updateCashCloseOpeningControl: (closeId: string, data: { counted: number; notes: string; checkedBy: string }) => void;
  cashMovements: CashMovement[];
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'timestamp'>) => void;
  addCashWithdrawal: (withdrawal: Omit<CashWithdrawal, 'id' | 'timestamp'>) => void;
  lastPOSCloseTimestamp: number;
  getCashCloseMovements: (closeId: string) => CashMovement[];

  // Ticket Config
  ticketConfig: TicketConfig;
  updateTicketConfig: (config: Partial<TicketConfig>) => Promise<void> | void;
  thermalPrinterConfig: ThermalPrinterConfig;
  updateThermalPrinterConfig: (config: Partial<ThermalPrinterConfig>) => void;

  // Fiscal Config (ARCA)
  fiscalConfig: FiscalBusinessConfig;
  updateFiscalConfig: (config: Partial<FiscalBusinessConfig>) => Promise<void>;

  // General Config
  generalConfig: GeneralConfig;
  updateGeneralConfig: (config: Partial<GeneralConfig>) => Promise<void> | void;
  blockPhone: (phone: string) => void;
  unblockPhone: (phone: string) => void;
  isPhoneBlocked: (phone: string) => boolean;

  // Delivery Time Slots (Clientes)
  deliveryTimeSlots: DeliveryTimeSlot[];
  updateDeliveryTimeSlots: (slots: DeliveryTimeSlot[]) => Promise<void> | void;

  // Cash Register
  cashRegister: CashRegister;
  openCashRegister: (amount: number, user?: string) => void;
  closeCashRegister: () => void;

  // Auto Cash Close
  autoCashCloseConfig: AutoCashCloseConfig;
  updateAutoCashCloseConfig: (config: AutoCashCloseConfig) => Promise<void> | void;
  isCashRegisterOpen: boolean;

  // Invoices
  invoices: Invoice[];
  addInvoice: (invoice: Omit<Invoice, 'id' | 'folio'> & { id?: string; folio?: string }) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  refreshInvoices: () => Promise<void>;
  checkSaleBilledStatus: (saleId: string) => { isBilled: boolean; invoice?: Invoice; canRetry: boolean; needsReconciliation: boolean };
  billingCustomers: BillingCustomer[];
  addBillingCustomer: (customer: Omit<BillingCustomer, 'id'>) => void;
  updateBillingCustomer: (id: string, updates: Partial<BillingCustomer>) => void;
  deleteBillingCustomer: (id: string) => void;

  // Analytics helpers
  getTopSellingProducts: (daysOrRange: number | { from: number, to: number }) => { product: Product; unitsSold: number; revenue: number }[];
  getRevenueByCategory: (range?: { from: number, to: number }) => { category: string; revenue: number; percent: number }[];
  getRevenueByDay: (daysOrRange: number | { from: number, to: number }) => { day: string; revenue: number }[];
  getOrderTimestamp: (o: AdminOrder) => number;

  // Egresos
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'payment_status' | 'cancellation_date' | 'cancellation_method' | 'last_activity_at'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  cancelExpense: (id: string) => void;
  payExpense: (id: string, method: 'cash' | 'card' | 'transfer') => void;

  // Hero Banners (Home Carousel)
  heroBanners: HeroBanner[];
  addHeroBanner: (banner: Omit<HeroBanner, 'id' | 'order'>) => void;
  updateHeroBanner: (id: string, updates: Partial<HeroBanner>) => void;
  deleteHeroBanner: (id: string) => void;
  reorderHeroBanners: (banners: HeroBanner[]) => void;
  toggleHeroBannerActive: (id: string) => void;

  // Privacy Mode
  privacyMode: boolean;
  togglePrivacyMode: () => void;
  formatCurrency: (value: number, isCurrency?: boolean, forceShow?: boolean) => string;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// ─── Seed initial data ─────────────────────────────────────
function generateInitialStock(prods: Product[]): Record<string, number> {
  const map: Record<string, number> = {};
  prods.forEach(p => {
    const seed = p.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    map[p.id] = (seed * 7) % 200;
  });
  return map;
}

const initialTags = ['Oferta', 'Nuevo', 'Orgánico', '3x2', 'Local', 'Premium'];

export const defaultHeroBanners: HeroBanner[] = [
  {
    id: 'banner-1',
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1600',
    badge: 'Calidad y Frescura Garantizada',
    title: 'Tu Supermercado de Confianza',
    subtitle: 'Cortes seleccionados, lácteos, bebidas y las mejores marcas a precios directos en tu mesa.',
    linkUrl: '/category/almacen',
    linkLabel: 'Comprar Ahora',
    linkExternal: false,
    active: true,
    order: 0,
  },
  {
    id: 'banner-2',
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&q=80&w=1600',
    badge: '🔥 Ofertas Especiales',
    title: 'Carnes y Cortes Seleccionados',
    subtitle: 'La mejor calidad al mejor precio de la zona para tus asados y comidas diarias.',
    linkUrl: '/category/carnes',
    linkLabel: 'Ver Cortes',
    linkExternal: false,
    active: true,
    order: 1,
  },
  {
    id: 'banner-3',
    imageUrl: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&q=80&w=1600',
    badge: '🚚 Envíos a Domicilio',
    title: 'Hacé tu Pedido Online',
    subtitle: 'Te llevamos tu compra directo a tu puerta con entrega rápida y segura.',
    linkUrl: '/delivery',
    linkLabel: 'Conocer Zonas',
    linkExternal: false,
    active: true,
    order: 2,
  },
];

const parseDiscount = (d: any): number | null => {
  if (d === undefined || d === null || d === '') return null;
  if (typeof d === 'number') return d;
  const parsed = parseFloat(String(d).replace('%', ''));
  return isNaN(parsed) ? null : parsed;
};

const generateSeedOrders = (prods: Product[]): AdminOrder[] => {
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const pick = (arr: Product[], n: number) => arr.slice(0, n);
  const sample = pick(prods, 5);
  const t1 = now.getTime() - 1000 * 60 * 5;
  const t2 = now.getTime() - 1000 * 60 * 30;
  const t3 = now.getTime() - 1000 * 60 * 90;
  return [
    {
      id: 'DEMO01',
      date: fmt(new Date(t1)),
      timestamp: t1,
      customer: 'María López',
      phone: '2612345678',
      dni: '11222333',
      address: 'San Martín 450, La Paz',
      deliveryTime: 'Lo antes posible (30-60 min)',
      method: 'Envío',
      paymentMethod: 'cash',
      paymentStatus: 'Pendiente',
      status: 'Nuevo',
      total: (sample[0]?.price ?? 500) * 2 + (sample[1]?.price ?? 300),
      items: [
        { id: sample[0]?.id || 'x', name: sample[0]?.name || 'Producto A', image: sample[0]?.image || '', price: sample[0]?.price ?? 500, quantity: 2 },
        { id: sample[1]?.id || 'y', name: sample[1]?.name || 'Producto B', image: sample[1]?.image || '', price: sample[1]?.price ?? 300, quantity: 1 }
      ]
    },
    {
      id: 'DEMO02',
      date: fmt(new Date(t2)),
      timestamp: t2,
      customer: 'Carlos Ruiz',
      phone: '2619876543',
      dni: '44555666',
      address: 'Belgrano 120, La Paz',
      deliveryTime: 'Hoy al Mediodía (13:00 a 14:00)',
      method: 'Envío',
      paymentMethod: 'transfer',
      paymentStatus: 'Pagado',
      status: 'Preparando',
      total: (sample[2]?.price ?? 800) * 3,
      items: [
        { id: sample[2]?.id || 'z', name: sample[2]?.name || 'Producto C', image: sample[2]?.image || '', price: sample[2]?.price ?? 800, quantity: 3 }
      ]
    },
    {
      id: 'DEMO03',
      date: fmt(new Date(t3)),
      timestamp: t3,
      customer: 'Ana García',
      phone: '2614561234',
      dni: '77888999',
      address: 'Rivadavia 800, La Paz',
      deliveryTime: 'Hoy a la Noche (21:00 a 22:00)',
      method: 'Envío',
      paymentMethod: 'card',
      paymentStatus: 'Pagado',
      status: 'En Camino',
      total: (sample[3]?.price ?? 450) + (sample[4]?.price ?? 600) * 2,
      items: [
        { id: sample[3]?.id || 'w', name: sample[3]?.name || 'Producto D', image: sample[3]?.image || '', price: sample[3]?.price ?? 450, quantity: 1 },
        { id: sample[4]?.id || 'v', name: sample[4]?.name || 'Producto E', image: sample[4]?.image || '', price: sample[4]?.price ?? 600, quantity: 2 }
      ]
    }
  ];
};

// ─── Provider ──────────────────────────────────────────────

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);

  // Sincronización con Supabase (Zustand)
  const storeProducts = useProductStore((state) => state.products);
  const storeLoading = useProductStore((state) => state.loading);
  const storeFetch = useProductStore((state) => state.fetchProducts);
  // Hidratación y sincronización de catálogo de productos
  useEffect(() => {
    if (storeProducts.length === 0) {
      storeFetch();
    }
  }, [storeProducts.length, storeFetch]);

  useEffect(() => {
    if (!storeLoading && storeProducts.length > 0) {
      setAdminProducts(storeProducts as any);
      setStockMap(prev => {
        const next = { ...prev };
        let hasChanges = false;
        storeProducts.forEach(p => {
          if (p.id && next[p.id] !== (p.stock ?? 0)) {
            next[p.id] = p.stock ?? 0;
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [storeProducts, storeLoading]);

  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [adminSubcategories, setAdminSubcategories] = useState<Subcategory[]>([]);

  const [adminTags, setAdminTags] = useState<string[]>(initialTags);

  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>({});

  const defaultCurrentAccountConfig: CurrentAccountConfig = {
    enabled: true,
    maxDebtAmount: 50000,
    maxDebtDays: 35,
    warnOnAmountLimit: true,
    warnOnTimeLimit: true,
    allowOverride: true,
  };

  const [currentAccountConfig, setCurrentAccountConfig] = useState<CurrentAccountConfig>(defaultCurrentAccountConfig);

  const updateCurrentAccountConfig = (updates: Partial<CurrentAccountConfig>) => {
    setCurrentAccountConfig(prev => {
      const next = { ...prev, ...updates };
      saveSetting('current_account_config', next).catch(console.error);
      return next;
    });
  };

  // Customers are derived strictly from registered profiles (customerProfiles)
  const customers = useMemo(() => {
    const customerMap: Record<string, AdminCustomer> = {};

    // 1. Initialize map only with registered customer profiles
    Object.values(customerProfiles).forEach((profileRaw) => {
      const profile = profileRaw as any;
      const firstName = (profile.nombre || profile.name || '').trim();
      const lastName = (profile.apellido || profile.last_name || '').trim();

      if (firstName === 'Invitado') return; // Hide guest profiles from Admin panel

      let fullName = firstName;
      if (lastName && firstName) {
        const lowerFirst = firstName.toLowerCase();
        const lowerLast = lastName.toLowerCase();
        if (!lowerFirst.includes(lowerLast)) {
          fullName = `${firstName} ${lastName}`;
        }
      } else if (!fullName) {
        fullName = lastName || 'Sin Nombre';
      }

      const cleanDni = (profile.dni && profile.dni !== profile.phone) ? profile.dni : (profile.cuit || '');

      const isFiscalClient = Boolean(
        profile.is_fiscal ||
        profile.isFiscal ||
        (profile.cuit && String(profile.cuit).trim().length > 0) ||
        (profile.business_name && String(profile.business_name).trim().length > 0) ||
        (profile.businessName && String(profile.businessName).trim().length > 0) ||
        (profile.tax_condition && profile.tax_condition !== 'Consumidor Final') ||
        (profile.taxCondition && profile.taxCondition !== 'Consumidor Final')
      );

      customerMap[profile.phone] = {
        id: profile.id,
        dni: cleanDni,
        name: fullName !== 'Sin Nombre' ? fullName : (profile.business_name || profile.businessName || 'Sin Nombre'),
        phone: profile.phone,
        address: profile.fiscal_address || profile.fiscalAddress || profile.direccion || profile.address || '',
        totalOrders: 0,
        totalSpent: 0,
        lastOrder: '-',
        hasCurrentAccount: profile.hasCurrentAccount || false,
        currentDebt: 0,
        creditLimit: profile.customDebtLimit || profile.creditLimit || currentAccountConfig.maxDebtAmount || 50000,
        birthday: profile.birthday || '',
        spent30: 0,
        tier: 'Regular',
        oldestDebtDays: 0,
        useCustomAccountLimits: profile.useCustomAccountLimits || false,
        customDebtLimit: profile.customDebtLimit,
        customDebtDays: profile.customDebtDays,
        accountLimitNotes: profile.accountLimitNotes || '',

        // Campos Fiscales Unificados
        cuit: profile.cuit || '',
        documentType: profile.document_type || profile.documentType || (profile.cuit ? 'CUIT' : 'DNI'),
        documentNumber: profile.cuit || cleanDni || '',
        taxCondition: profile.tax_condition || profile.taxCondition || 'Consumidor Final',
        businessName: profile.business_name || profile.businessName || '',
        fiscalAddress: profile.fiscal_address || profile.fiscalAddress || profile.direccion || profile.address || '',
        email: profile.email || '',
        isFiscal: isFiscalClient
      };
    });

    // 2. Accumulate order statistics only for these registered customers
    const sortedOrders = [...orders].sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      return tsA - tsB;
    });

    const limit30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;

    sortedOrders.forEach(o => {
      if (o.status === 'Cancelado') return;

      const clean = (p?: string) => (p || '').replace(/\D/g, '');
      const oClean = clean(o.phone);
      if (!oClean) return;

      const c = Object.values(customerMap).find(cust => {
        const cClean = clean(cust.phone);
        if (!cClean) return false;
        return cClean === oClean ||
          (cClean.length >= 8 && oClean.endsWith(cClean.slice(-8))) ||
          (oClean.length >= 8 && cClean.endsWith(oClean.slice(-8)));
      });

      if (!c) return; // Ignore orders from guest/unregistered clients

      c.totalOrders += 1;
      c.totalSpent += o.total;
      c.lastOrder = o.date;
      if (o.address && o.address !== 'Compra en local') c.address = o.address; // Keep the latest address, avoiding in-store default
      if (!c.dni && o.dni) c.dni = o.dni; // Keep order DNI if profile lacks one

      if ((o.timestamp || 0) >= limit30Days) {
        c.spent30 += o.total;
      }

      if (o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado') {
        const debtAmount = o.total - (o.paidAmount || 0);
        c.currentDebt += debtAmount;

        // Calculate oldest debt days
        if (debtAmount > 0 && o.timestamp) {
          const daysOld = Math.floor((Date.now() - o.timestamp) / (1000 * 60 * 60 * 24));
          if (!c.oldestDebtDays || daysOld > c.oldestDebtDays) {
            c.oldestDebtDays = daysOld;
          }
        }
      }
    });

    // 3. Assign tier levels
    Object.values(customerMap).forEach(c => {
      if (c.spent30 >= 200000) c.tier = 'Gold';
      else if (c.spent30 >= 100000) c.tier = 'Silver';
      else if (c.spent30 >= 50000) c.tier = 'Bronze';
      else c.tier = 'Regular';
    });

    return Object.values(customerMap);
  }, [orders, customerProfiles, currentAccountConfig]);

  const toggleCurrentAccount = (phone: string) => {
    // Find debt from derived customers
    const customer = customers.find(c => c.phone === phone);
    if (customer && customer.hasCurrentAccount && (customer.currentDebt ?? 0) > 0) {
      return {
        success: false,
        message: `No se puede deshabilitar la cuenta corriente de ${customer.name} porque tiene una deuda pendiente de $${customer.currentDebt.toLocaleString('es-AR')}.`
      };
    }

    setCustomerProfiles(prev => {
      const existing = prev[phone] || { phone, hasCurrentAccount: false };
      const nextProfile = { ...existing, hasCurrentAccount: !existing.hasCurrentAccount };
      upsertCustomerProfile(nextProfile).catch(console.error);
      return { ...prev, [phone]: nextProfile };
    });

    return { success: true };
  };

  const formatPhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('54')) cleaned = cleaned.substring(2);
    return '+54' + cleaned;
  };

  const updateCustomerProfile = async (oldPhone: string, updates: Partial<{ 
    name: string; 
    phone: string; 
    dni: string; 
    birthday: string; 
    creditLimit: number; 
    useCustomAccountLimits: boolean; 
    customDebtLimit: number; 
    customDebtDays: number; 
    accountLimitNotes: string;
    cuit: string;
    documentType: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
    documentNumber: string;
    taxCondition: string;
    businessName: string;
    fiscalAddress: string;
    email: string;
    isFiscal: boolean;
  }>): Promise<boolean> => {
    // Find current customer by exact phone or normalized digits
    const cleanDigits = (p?: string) => (p || '').replace(/\D/g, '');
    const targetClean = cleanDigits(oldPhone);
    const targetCustomer = customers.find(c => {
      const cClean = cleanDigits(c.phone);
      return cClean === targetClean || (targetClean.length >= 8 && cClean.endsWith(targetClean.slice(-8))) || (cClean.length >= 8 && targetClean.endsWith(cClean.slice(-8)));
    }) || customers.find(c => c.phone === oldPhone);

    if (!targetCustomer) {
      console.warn('updateCustomerProfile: targetCustomer not found for phone:', oldPhone);
      return false;
    }

    const newPhone = updates.phone ? formatPhone(updates.phone) : oldPhone;

    // 1. Update orders if phone, name, or DNI changed
    if (newPhone !== oldPhone || updates.name || updates.dni) {
      setOrders(prev => prev.map(o => {
        if (cleanDigits(o.phone) === targetClean || o.phone === oldPhone) {
          const updated = {
            ...o,
            phone: newPhone,
            customer: updates.name || o.customer,
            dni: updates.dni || o.dni
          };
          updateOrderInDb(o.id, updated).catch(console.error);
          return updated;
        }
        return o;
      }));
    }

    // 2. Update profiles (DNI, birthday, CC status, and Fiscal fields)
    let profileToPersist: CustomerProfile | null = null;
    setCustomerProfiles(prev => {
      const newProfiles = { ...prev };
      const matchedKey = Object.keys(newProfiles).find(k => {
        const kClean = cleanDigits(k);
        return kClean === targetClean || (targetClean.length >= 8 && kClean.endsWith(targetClean.slice(-8))) || k === oldPhone;
      }) || oldPhone;
      const currentProfile = newProfiles[matchedKey] || { phone: oldPhone, hasCurrentAccount: targetCustomer.hasCurrentAccount ?? false };
      const finalIsFiscal = updates.isFiscal !== undefined 
        ? updates.isFiscal 
        : (updates.cuit && updates.cuit.trim().length > 0)
          ? true
          : (currentProfile.isFiscal ?? currentProfile.is_fiscal ?? false);

      const updatedProfile: CustomerProfile = {
        ...currentProfile,
        ...updates,
        hasCurrentAccount: currentProfile.hasCurrentAccount ?? targetCustomer.hasCurrentAccount ?? false,
        nombre: updates.name !== undefined ? updates.name.trim() : (currentProfile.nombre || currentProfile.name || ''),
        name: updates.name !== undefined ? updates.name.trim() : (currentProfile.name || currentProfile.nombre || ''),
        apellido: updates.name !== undefined ? '' : (currentProfile.apellido || ''),
        last_name: updates.name !== undefined ? '' : (currentProfile.last_name || ''),
        phone: newPhone,
        dni: updates.dni !== undefined ? updates.dni : ((currentProfile.dni && currentProfile.dni !== currentProfile.phone) ? currentProfile.dni : ''),
        cuit: updates.cuit !== undefined ? updates.cuit : currentProfile.cuit,
        document_type: updates.documentType || currentProfile.document_type || (updates.cuit ? 'CUIT' : 'DNI'),
        documentType: updates.documentType || currentProfile.documentType || (updates.cuit ? 'CUIT' : 'DNI'),
        tax_condition: updates.taxCondition || currentProfile.tax_condition || 'Consumidor Final',
        taxCondition: updates.taxCondition || currentProfile.taxCondition || 'Consumidor Final',
        business_name: updates.businessName !== undefined ? updates.businessName : (currentProfile.business_name || currentProfile.businessName || ''),
        businessName: updates.businessName !== undefined ? updates.businessName : (currentProfile.businessName || currentProfile.business_name || ''),
        fiscal_address: updates.fiscalAddress !== undefined ? updates.fiscalAddress : (currentProfile.fiscal_address || currentProfile.fiscalAddress || ''),
        fiscalAddress: updates.fiscalAddress !== undefined ? updates.fiscalAddress : (currentProfile.fiscalAddress || currentProfile.fiscal_address || ''),
        email: updates.email !== undefined ? updates.email : currentProfile.email,
        isFiscal: finalIsFiscal,
        is_fiscal: finalIsFiscal
      };

      if (newPhone !== oldPhone) {
        delete newProfiles[oldPhone];
        newProfiles[newPhone] = updatedProfile;
      } else {
        newProfiles[oldPhone] = updatedProfile;
      }
      profileToPersist = updatedProfile;
      return newProfiles;
    });

    if (profileToPersist) {
      const res = await upsertCustomerProfile(profileToPersist, oldPhone);
      return res.success;
    }
    return true;
  };

  const settleCurrentAccount = (phone: string, method: string, amount?: number) => {
    let movementToRecord: any = null;
    let whatsappData: any = null;
    let ordersToUpdate: { id: string, updates: any }[] = [];

    const clean = (p?: string) => (p || '').replace(/\D/g, '');
    const targetPhone = clean(phone);

    const matchesPhone = (oPhone?: string) => {
      const op = clean(oPhone);
      if (!op || !targetPhone) return false;
      return op === targetPhone || (targetPhone.length >= 8 && op.endsWith(targetPhone.slice(-8))) || (op.length >= 8 && targetPhone.endsWith(op.slice(-8)));
    };

    setOrders(prev => {
      const filteredPrev = prev.filter(o => !o.id.startsWith('PAGO-'));

      const unpaidOrders = filteredPrev
        .filter(o => matchesPhone(o.phone) && o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado' && o.status !== 'Cancelado')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (unpaidOrders.length === 0) return filteredPrev;

      const totalDebt = unpaidOrders.reduce((s, o) => s + (o.total - (o.paidAmount || 0)), 0);
      const paymentAmount = amount !== undefined ? amount : totalDebt;
      let remainingToSettle = paymentAmount;

      const updatedOrders = filteredPrev.map(o => {
        if (matchesPhone(o.phone) && o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado' && o.status !== 'Cancelado') {
          if (remainingToSettle <= 0) return o;

          const orderDebt = o.total - (o.paidAmount || 0);

          if (remainingToSettle >= orderDebt) {
            remainingToSettle -= orderDebt;
            const updated = { ...o, paymentStatus: 'Pagado' as const, paidAmount: o.total };
            ordersToUpdate.push({ id: o.id, updates: { paymentStatus: 'Pagado', paidAmount: o.total } });
            return updated;
          } else {
            const newPaid = (o.paidAmount || 0) + remainingToSettle;
            remainingToSettle = 0;
            const updated = { ...o, paidAmount: newPaid };
            ordersToUpdate.push({ id: o.id, updates: { paidAmount: newPaid } });
            return updated;
          }
        }
        return o;
      });

      const methodMap: Record<string, string> = { 'cash': 'Efectivo', 'card': 'Tarjeta', 'transfer': 'Transferencia' };
      const translatedMethod = methodMap[method] || method;

      // Guard values to execute side effects outside
      movementToRecord = {
        type: 'Ingreso',
        description: `Pago Cta. Corriente (${translatedMethod}) - ${unpaidOrders[0].customer}`,
        cashier: useAuthStore.getState().employeeProfile?.name || 'Admin',
        amount: paymentAmount
      };

      const customerName = unpaidOrders[0].customer;
      const remainingDebt = Math.max(0, totalDebt - paymentAmount);
      whatsappData = { phone, customerName, paymentAmount, remainingDebt };

      return updatedOrders;
    });

    // Execute side effects outside of setOrders
    if (ordersToUpdate.length > 0) {
      ordersToUpdate.forEach(u => updateOrderInDb(u.id, u.updates).catch(console.error));
    }
    if (movementToRecord) {
      addCashMovement(movementToRecord);
    }
    if (whatsappData) {
      whatsappMessageService.createCurrentAccountPaymentMessage(
        whatsappData.phone,
        whatsappData.customerName,
        whatsappData.paymentAmount,
        whatsappData.remainingDebt
      );
    }
  };

  // ─── Manual Customer CRUD ─────────────────────────────────
  const addManualCustomer = (data: { 
    nombre: string; 
    apellido: string; 
    telefono: string; 
    direccion: string; 
    dni?: string;
    cuit?: string;
    documentType?: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
    taxCondition?: string;
    businessName?: string;
    fiscalAddress?: string;
    email?: string;
  }) => {
    const rawPhone = data.telefono?.trim() || '';
    const phone = rawPhone ? formatPhone(rawPhone) : `+54999${(data.cuit || data.dni || Date.now()).toString().replace(/\D/g, '').slice(-9)}`;
    const profile: CustomerProfile = {
      dni: data.dni || '',
      phone,
      hasCurrentAccount: false,
      nombre: data.nombre,
      apellido: data.apellido,
      direccion: data.direccion,
      isManual: true,
      cuit: data.cuit || '',
      document_type: data.documentType || (data.cuit ? 'CUIT' : 'DNI'),
      tax_condition: data.taxCondition || 'Consumidor Final',
      business_name: data.businessName || (data.nombre && data.apellido ? `${data.nombre} ${data.apellido}` : data.nombre),
      fiscal_address: data.fiscalAddress || data.direccion || '',
      email: data.email || ''
    };
    setCustomerProfiles(prev => ({
      ...prev,
      [phone]: profile
    }));
    upsertCustomerProfile(profile).catch(console.error);
  };

  const deleteCustomer = (phone: string): { success: boolean; message?: string } => {
    const customer = customers.find(c => c.phone === phone);
    if (customer && customer.currentDebt > 0) {
      return { success: false, message: `No se puede eliminar a ${customer.name} porque tiene deuda pendiente de $${customer.currentDebt.toLocaleString('es-AR')}.` };
    }
    setCustomerProfiles(prev => {
      const next = { ...prev };
      delete next[phone];
      return next;
    });
    supabase.from('customer_profiles').delete().eq('phone', phone).eq('branch_id', 'main').then(({ error }) => { if (error) console.error('Error deleting customer profile:', error); });
    return { success: true };
  };

  const [offers, setOffers] = useState<Offer[]>([]);

  const [offerRedemptions, setOfferRedemptions] = useState<OfferRedemption[]>([]);

  const [storeStatus, setStoreStatusState] = useState<StoreStatus>({
    onlineSalesPaused: false,
    pauseReason: '',
    pausedAt: null,
    pausedBy: null,
    resumeMessage: '',
    allowBrowsingWhilePaused: true
  });

  const [isAdminDataLoaded, setIsAdminDataLoaded] = useState(false);

  // Carga de datos exclusivos para el panel administrativo (NO se transfieren a clientes comunes de la tienda)
  const loadAdminData = async () => {
    if (isAdminDataLoaded) return;
    try {
      const [
        _orders, _cashMovements, _cashCloses, _profiles, _accCfg,
        _cashReg, _lastCloseTs, _expenses, _autoCashClose
      ] = await Promise.all([
        fetchOrders(),
        fetchCashMovements(),
        fetchCashCloses(),
        fetchCustomerProfiles(),
        fetchSetting('current_account_config', defaultCurrentAccountConfig),
        fetchSetting('cash_register', { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' } as CashRegister),
        fetchSetting('last_pos_close_timestamp', 0),
        fetchExpenses(),
        fetchSetting<AutoCashCloseConfig>('auto_cash_close_config', { enabled: false, time: '22:00' }),
      ]);

      setOrders(_orders);
      setCashMovements(_cashMovements);
      setCashCloses(_cashCloses);
      setCustomerProfiles(_profiles);
      setCurrentAccountConfig(_accCfg);
      setCashRegister(_cashReg);
      setLastPOSCloseTimestamp(_lastCloseTs);
      setExpenses(_expenses);
      setAutoCashCloseConfig(_autoCashClose);
      setIsAdminDataLoaded(true);

      // Cargar facturas fiscales reales desde el backend ARCA / PostgreSQL
      try {
        const fiscalRecords = await billingService.getFiscalInvoices();
        if (Array.isArray(fiscalRecords) && fiscalRecords.length > 0) {
          const mapped: Invoice[] = fiscalRecords.map((r: any) => ({
            id: r.id,
            date: r.date || r.created_at,
            folio: (r.folio && !r.folio.includes('undefined'))
              ? r.folio
              : (r.point_of_sale || r.pointOfSale) && (r.invoice_number || r.invoiceNumber)
                ? `${String(r.point_of_sale || r.pointOfSale).padStart(4, '0')}-${String(r.invoice_number || r.invoiceNumber).padStart(8, '0')}`
                : r.id,
            pointOfSale: r.point_of_sale || r.pointOfSale,
            invoiceNumber: r.invoice_number || r.invoiceNumber,
            customerId: r.customer_id,
            clientName: r.customer_name || 'Consumidor Final',
            clientCuit: r.customer_cuit || r.customer_document_number || '',
            customerName: r.customer_name,
            customerDocumentType: r.customer_document_type,
            customerDocumentNumber: r.customer_document_number,
            customerCuit: r.customer_cuit,
            customerTaxCondition: r.customer_tax_condition,
            customerAddress: r.customer_address,
            subtotal: Number(r.subtotal_net || 0),
            subtotalNet: Number(r.subtotal_net || 0),
            taxes: Number(r.taxes || 0),
            total: Number(r.total || 0),
            currency: r.currency || 'PES',
            saleId: Array.isArray(r.sale_ids) ? r.sale_ids.join(', ') : (r.saleId || ''),
            saleIds: Array.isArray(r.sale_ids) ? r.sale_ids : (r.saleIds || []),
            type: (r.invoice_type || 'B') as any,
            invoiceType: (r.invoice_type || 'B') as any,
            invoiceTypeCode: r.invoice_type_code,
            origin: r.origin || 'ARCA_LOCAL',
            status: r.status || 'AUTORIZADA',
            direction: r.direction || 'venta',
            serviceUsed: r.service_used || 'WSMTXCA',
            cae: r.cae,
            caeExpirationDate: r.cae_expiration_date,
            arcaObservations: r.arca_observations,
            qrPayload: r.qr_payload,
            qrDataUrl: r.qrDataUrl,
            attachmentUrl: r.attachment_url,
            notes: r.notes,
            verifiedAt: r.verified_at,
            verifiedBy: r.verified_by,
            items: r.items,
            vatBreakdown: r.vat_breakdown,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          }));
          setInvoices(prev => {
            const map = new Map<string, Invoice>();
            prev.filter(i => (i.status as any) !== 'Emitida').forEach(i => map.set(i.id, i));
            mapped.forEach(i => map.set(i.id, i));
            return Array.from(map.values());
          });
        }
      } catch (errArca) {
        console.warn('Backend fiscal no disponible al inicio:', errArca);
      }

      // Cargar alertas de bajo stock solo para el panel de administración
      useProductStore.getState().fetchLowStockDashboardProducts({ page: 1, limit: 50 });
    } catch (err) {
      console.error('Error cargando datos de administración:', err);
    }
  };

  useEffect(() => {
    // 1. Cargar datos esenciales para la tienda pública (Liviano, con caché y proyección de columnas)
    const loadStorefrontData = async () => {
      try {
        const [_offers, _ticketCfg, _categories, _subcategories, _tags, _generalCfg, _heroBanners, _deliverySlots, _fiscalCfg] = await Promise.all([
          fetchOffers(),
          fetchSetting('ticket_config', defaultTicketConfig),
          fetchCategories(),
          fetchSubcategories(),
          fetchSetting<string[]>('admin_tags', initialTags),
          fetchSetting<GeneralConfig>('general_config', {
            suspendEmployeeNotifications: false,
            deliveryRadiusKm: 5,
            storeLat: -33.459009,
            storeLng: -67.551826,
            blockedPhones: [],
            shippingBaseCost: 1000,
            shippingCostPerKm: 400,
            freeShippingMinAmount: 0
          }),
          fetchSetting<HeroBanner[]>('hero_banners', defaultHeroBanners),
          fetchSetting<DeliveryTimeSlot[]>('delivery_time_slots', defaultDeliveryTimeSlots),
          fetchSetting<FiscalBusinessConfig>('fiscal_config', defaultFiscalConfig)
        ]);

        setOffers(_offers);
        setTicketConfig(_ticketCfg);
        if (_fiscalCfg) setFiscalConfig(_fiscalCfg);
        setAdminTags(_tags);
        if (_deliverySlots && _deliverySlots.length > 0) {
          setDeliveryTimeSlots(_deliverySlots);
        }
        setGeneralConfig({
          ..._generalCfg,
          shippingBaseCost: _generalCfg?.shippingBaseCost ?? 1000,
          shippingCostPerKm: _generalCfg?.shippingCostPerKm ?? 400,
          freeShippingMinAmount: _generalCfg?.freeShippingMinAmount ?? 0
        });
        setHeroBanners(_heroBanners || defaultHeroBanners);

        // Seed categories if empty
        let finalCategories = _categories;
        if (_categories.length === 0) {
          console.log('🌱 No se encontraron categorías en Supabase. Sembrando categorías...');
          for (const cat of catalogCategories) {
            await insertCategory(cat);
          }
          finalCategories = await fetchCategories();
        }
        setAdminCategories(finalCategories);
        console.log('📦 Subcategorías cargadas desde Supabase:', _subcategories?.length, _subcategories?.slice(0, 3));
        setAdminSubcategories(_subcategories || []);

        // Store Status
        supabase.from('settings').select('value').eq('key', 'store_status').maybeSingle().then(({ data }) => {
          if (data?.value) setStoreStatusState(data.value as StoreStatus);
        });
        // Offer Redemptions
        supabase.from('offer_redemptions').select('*').then(({ data }) => {
          if (data) setOfferRedemptions(data);
        });
      } catch (err) {
        console.error('❌ Error cargando datos del storefront:', err);
      }
    };

    loadStorefrontData();

    // Si la ruta actual es del panel administrativo, cargar inmediatamente datos de admin
    const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    if (isAdminRoute) {
      loadAdminData();
    }

    // 2. Real-time subscriptions for critical sync
    const statusSub = supabase.channel('store_status_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'key=eq.store_status' }, (payload) => {
        if (payload.new && (payload.new as any).value) {
          setStoreStatusState((payload.new as any).value as StoreStatus);
        }
      })
      .subscribe();

    const redemptionsSub = supabase.channel('offer_redemptions_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'offer_redemptions' }, (payload) => {
        setOfferRedemptions(prev => [...prev, payload.new as OfferRedemption]);
      })
      .subscribe();

    // Sync new orders from other devices
    const ordersSub = supabase.channel('orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders().then(setOrders);
      })
      .subscribe();

    const movementsSub = supabase.channel('cash_movements_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements' }, () => {
        fetchCashMovements().then(setCashMovements);
      })
      .subscribe();

    const closesSub = supabase.channel('cash_closes_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_closes' }, () => {
        fetchCashCloses().then(setCashCloses);
      })
      .subscribe();

    const profilesSub = supabase.channel('customer_profiles_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_profiles' }, () => {
        fetchCustomerProfiles().then(setCustomerProfiles);
      })
      .subscribe();

    const settingsSub = supabase.channel('settings_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        fetchSetting('ticket_config', defaultTicketConfig).then(setTicketConfig);
        fetchSetting('current_account_config', defaultCurrentAccountConfig).then(setCurrentAccountConfig);
        fetchSetting('cash_register', { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' } as CashRegister).then(setCashRegister);
        fetchSetting('last_pos_close_timestamp', 0).then(setLastPOSCloseTimestamp);
        fetchSetting<string[]>('admin_tags', initialTags).then(setAdminTags);
        fetchSetting<AutoCashCloseConfig>('auto_cash_close_config', { enabled: false, time: '22:00' }).then(setAutoCashCloseConfig);
        fetchSetting<HeroBanner[]>('hero_banners', defaultHeroBanners).then(setHeroBanners);
        fetchSetting<DeliveryTimeSlot[]>('delivery_time_slots', defaultDeliveryTimeSlots).then(slots => {
          if (slots && slots.length > 0) setDeliveryTimeSlots(slots);
        });
        fetchOffers().then(setOffers);
      })
      .subscribe();

    let productsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const productsSub = supabase.channel('products_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        if (productsDebounceTimer) clearTimeout(productsDebounceTimer);
        productsDebounceTimer = setTimeout(() => {
          console.log('🔔 Cambio en tabla products detectado (debounced), sincronizando catálogo...');
          storeFetch();
        }, 2500);
      })
      .subscribe();

    const categoriesSub = supabase.channel('categories_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        console.log('🔔 Cambio en tabla categories detectado, re-fecheando...');
        fetchCategories().then(setAdminCategories);
      })
      .subscribe();

    const subcategoriesSub = supabase.channel('subcategories_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcategories' }, () => {
        console.log('🔔 Cambio en tabla subcategories detectado, re-fecheando...');
        fetchSubcategories().then(setAdminSubcategories);
      })
      .subscribe();

    const expensesSub = supabase.channel('expenses_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        fetchExpenses().then(setExpenses);
      })
      .subscribe();

    const offersSub = supabase.channel('offers_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, () => {
        console.log('🔔 Cambio en tabla offers detectado, re-fecheando...');
        fetchOffers().then(setOffers);
      })
      .subscribe();

    return () => {
      if (productsDebounceTimer) clearTimeout(productsDebounceTimer);
      supabase.removeChannel(statusSub);
      supabase.removeChannel(redemptionsSub);
      supabase.removeChannel(ordersSub);
      supabase.removeChannel(movementsSub);
      supabase.removeChannel(closesSub);
      supabase.removeChannel(profilesSub);
      supabase.removeChannel(settingsSub);
      supabase.removeChannel(productsSub);
      supabase.removeChannel(categoriesSub);
      supabase.removeChannel(subcategoriesSub);
      supabase.removeChannel(expensesSub);
      supabase.removeChannel(offersSub);
    };
  }, []);

  const updateStoreStatus = async (updates: Partial<StoreStatus>) => {
    const nextStatus = { ...storeStatus, ...updates };
    setStoreStatusState(nextStatus); // optimistic update
    await saveSetting('store_status', nextStatus);
  };

  const addOfferRedemption = async (redemption: Omit<OfferRedemption, 'id' | 'created_at' | 'redemption_date'>) => {
    const todayStr = new Date().toISOString().split('T')[0];
    await supabase.from('offer_redemptions').insert({
      offer_id: redemption.offer_id,
      product_id: redemption.product_id || null,
      order_id: redemption.order_id || null,
      customer_phone: redemption.customer_phone || null,
      quantity: redemption.quantity,
      discount_amount: redemption.discount_amount,
      redemption_date: todayStr,
      branch_id: 'main'
    });
  };

  const [cashCloses, setCashCloses] = useState<CashClose[]>([]);

  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  const [lastPOSCloseTimestamp, setLastPOSCloseTimestamp] = useState<number>(0);

  const [privacyMode, setPrivacyMode] = useState<boolean>(false);

  // ─── Expenses ─────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const addExpense = (expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'payment_status' | 'cancellation_date' | 'cancellation_method' | 'last_activity_at'>) => {
    const now = new Date().toISOString();
    const isCC = expenseData.payment_method === 'cuenta_corriente';
    const newExpense: Expense = {
      ...expenseData,
      id: `EXP-${Date.now()}`,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      payment_status: isCC ? 'pending' : 'paid',
      cancellation_date: null,
      cancellation_method: null,
    };
    setExpenses(prev => [newExpense, ...prev]);
    insertExpense(newExpense).catch(console.error);
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e));
    updateExpenseInDb(id, updates).catch(console.error);
  };

  const cancelExpense = (id: string) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: 'cancelled', updated_at: new Date().toISOString() } : e));
    cancelExpenseInDb(id).catch(console.error);
  };

  const payExpense = (id: string, method: 'cash' | 'card' | 'transfer') => {
    const now = new Date().toISOString();
    const updates = {
      payment_status: 'paid' as const,
      cancellation_date: now,
      cancellation_method: method,
      last_activity_at: now,
      updated_at: now
    };
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    updateExpenseInDb(id, updates).catch(console.error);
  };

  // ─── Ticket Config ────────────────────────────────────────
  const defaultTicketConfig: TicketConfig = {
    blankLinesTop: 0,
    blankLinesBottom: 2,
    headerText: 'Martina Supermercado',
    businessName: 'Minimarket & Supermercado',
    businessAddress: 'La Paz, Mendoza',
    businessPhone: '',
    businessCuit: '',
    footerMessage: '¡Gracias por su compra!',
    showLogo: false
  };
  const [ticketConfig, setTicketConfig] = useState<TicketConfig>(defaultTicketConfig);
  const updateTicketConfig = async (updates: Partial<TicketConfig>) => {
    const next = { ...ticketConfig, ...updates };
    setTicketConfig(next);
    await saveSetting('ticket_config', next);
  };

  // ─── Fiscal Business Config (ARCA) ─────────────────────────
  const defaultFiscalConfig: FiscalBusinessConfig = {
    businessName: 'LA MARTINA',
    fantasyName: 'Supermercado La Martina',
    cuit: '',
    taxCondition: 'Responsable Inscripto',
    grossIncome: '',
    startDate: '',
    fiscalAddress: '',
    postalCode: '',
    phone: '',
    defaultPointOfSale: 1
  };
  const [fiscalConfig, setFiscalConfig] = useState<FiscalBusinessConfig>(defaultFiscalConfig);
  const updateFiscalConfig = async (updates: Partial<FiscalBusinessConfig>) => {
    const next = { ...fiscalConfig, ...updates };
    setFiscalConfig(next);
    await saveSetting('fiscal_config', next);
    try {
      await billingService.updateConfig(next);
    } catch (err) {
      console.warn('Backend sync warning for fiscal config:', err);
    }
  };

  // ─── Thermal Printer Config ────────────────────────────────
  const [thermalPrinterConfig, setThermalPrinterConfigState] = useState<ThermalPrinterConfig>(() => thermalPrinterService.getConfig());
  const updateThermalPrinterConfig = useCallback((updates: Partial<ThermalPrinterConfig>) => {
    const next = thermalPrinterService.saveConfig(updates);
    setThermalPrinterConfigState(next);
  }, []);

  // ─── General Config ───────────────────────────────────────
  const defaultGeneralConfig: GeneralConfig = {
    suspendEmployeeNotifications: false,
    deliveryRadiusKm: 5,
    storeLat: -33.459009,
    storeLng: -67.551826,
    blockedPhones: [],
    shippingBaseCost: 1000,
    shippingCostPerKm: 400,
    freeShippingMinAmount: 0
  };
  const [generalConfig, setGeneralConfig] = useState<GeneralConfig>(defaultGeneralConfig);
  const updateGeneralConfig = async (updates: Partial<GeneralConfig>) => {
    const next = { ...generalConfig, ...updates };
    setGeneralConfig(next);
    await saveSetting('general_config', next);
  };

  const blockPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return;
    setGeneralConfig(prev => {
      const currentList = prev.blockedPhones || [];
      if (currentList.includes(clean)) return prev;
      const next = { ...prev, blockedPhones: [...currentList, clean] };
      saveSetting('general_config', next).catch(console.error);
      return next;
    });
  };

  const unblockPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return;
    setGeneralConfig(prev => {
      const currentList = prev.blockedPhones || [];
      const next = { ...prev, blockedPhones: currentList.filter(p => p !== clean) };
      saveSetting('general_config', next).catch(console.error);
      return next;
    });
  };

  const isPhoneBlocked = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return false;
    const list = generalConfig.blockedPhones || [];
    return list.some(p => clean.includes(p) || p.includes(clean));
  };

  // ─── Delivery Time Slots (Clientes) ────────────────────────
  const [deliveryTimeSlots, setDeliveryTimeSlots] = useState<DeliveryTimeSlot[]>(defaultDeliveryTimeSlots);
  const updateDeliveryTimeSlots = async (slots: DeliveryTimeSlot[]) => {
    setDeliveryTimeSlots(slots);
    await saveSetting('delivery_time_slots', slots);
  };

  // ─── Hero Banners (Home Carousel) ─────────────────────────
  const [heroBanners, setHeroBanners] = useState<HeroBanner[]>(defaultHeroBanners);

  const addHeroBanner = (banner: Omit<HeroBanner, 'id' | 'order'>) => {
    setHeroBanners(prev => {
      const newBanner: HeroBanner = {
        ...banner,
        id: `banner-${Date.now()}`,
        order: prev.length,
      };
      const next = [...prev, newBanner];
      saveSetting('hero_banners', next).catch(console.error);
      return next;
    });
  };

  const updateHeroBanner = (id: string, updates: Partial<HeroBanner>) => {
    setHeroBanners(prev => {
      const next = prev.map(b => (b.id === id ? { ...b, ...updates } : b));
      saveSetting('hero_banners', next).catch(console.error);
      return next;
    });
  };

  const deleteHeroBanner = (id: string) => {
    setHeroBanners(prev => {
      const next = prev
        .filter(b => b.id !== id)
        .map((b, idx) => ({ ...b, order: idx }));
      saveSetting('hero_banners', next).catch(console.error);
      return next;
    });
  };

  const reorderHeroBanners = (banners: HeroBanner[]) => {
    const next = banners.map((b, idx) => ({ ...b, order: idx }));
    setHeroBanners(next);
    saveSetting('hero_banners', next).catch(console.error);
  };

  const toggleHeroBannerActive = (id: string) => {
    setHeroBanners(prev => {
      const next = prev.map(b => (b.id === id ? { ...b, active: !b.active } : b));
      saveSetting('hero_banners', next).catch(console.error);
      return next;
    });
  };

  // ─── Cash Register ────────────────────────────────────────
  const [cashRegister, setCashRegister] = useState<CashRegister>({ isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' });
  const isCashRegisterOpen = cashRegister.isOpen;
  const openCashRegister = (amount: number, user: string = 'Admin') => {
    if (cashRegister.isOpen) {
      console.warn('openCashRegister: Ya existe una caja abierta. No se puede abrir una nueva.');
      return;
    }
    const reg: CashRegister = { isOpen: true, initialAmount: amount, openedBy: user, openedAt: new Date().toISOString() };
    setCashRegister(reg);
    saveSetting('cash_register', reg).catch(console.error);
  };
  const closeCashRegister = () => {
    if (!cashRegister.isOpen) {
      console.warn('closeCashRegister: La caja ya está cerrada.');
      return;
    }
    const reg: CashRegister = { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' };
    setCashRegister(reg);
    saveSetting('cash_register', reg).catch(console.error);
  };

  // ─── Auto Cash Close Config ──────────────────────────────
  const defaultAutoCashCloseConfig: AutoCashCloseConfig = { enabled: false, time: '22:00' };
  const [autoCashCloseConfig, setAutoCashCloseConfig] = useState<AutoCashCloseConfig>(defaultAutoCashCloseConfig);
  const updateAutoCashCloseConfig = async (config: AutoCashCloseConfig) => {
    setAutoCashCloseConfig(config);
    await saveSetting('auto_cash_close_config', config);
  };

  // ─── Auto Cash Close Timer ────────────────────────────────
  // Track last auto-close execution minute to avoid double-firing
  const lastAutoCloseMinuteRef = React.useRef<string>('');
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!autoCashCloseConfig.enabled) return;
      if (!cashRegister.isOpen) return;

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const minuteKey = `${now.toDateString()}-${currentTime}`;

      if (currentTime === autoCashCloseConfig.time && lastAutoCloseMinuteRef.current !== minuteKey) {
        lastAutoCloseMinuteRef.current = minuteKey;
        console.log(`⏰ Cierre automático de caja activado a las ${currentTime}`);
        performCashClose([]);
      }
    }, 60000); // check every minute

    return () => clearInterval(intervalId);
  }, [autoCashCloseConfig, cashRegister.isOpen]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Clientes Fiscales derivados directamente de la fuente única customer_profiles (customers)
  // Solo se listan clientes que tengan datos fiscales explícitos (CUIT, Razón Social, Condición IVA específica o marca fiscal)
  const billingCustomers = useMemo<BillingCustomer[]>(() => {
    return customers
      .filter(c => {
        const hasCuit = Boolean(c.cuit && c.cuit.trim().length > 0);
        const hasBusinessName = Boolean(c.businessName && c.businessName.trim().length > 0);
        const isSpecialTax = Boolean(c.taxCondition && c.taxCondition !== 'Consumidor Final');
        const isDocCuit = c.documentType === 'CUIT' || c.documentType === 'CUIL';
        const isExplicitFiscal = c.isFiscal === true;
        return hasCuit || hasBusinessName || isSpecialTax || isDocCuit || isExplicitFiscal;
      })
      .map(c => ({
        id: c.phone || c.dni || c.name,
        name: c.businessName ? `${c.businessName} (${c.name})` : c.name,
        documentType: (c.documentType as any) || (c.cuit ? 'CUIT' : 'DNI'),
        documentNumber: c.cuit || c.dni || '',
        cuit: c.cuit || '',
        taxCondition: c.taxCondition || 'Consumidor Final',
        address: c.fiscalAddress || c.address || '',
        phone: c.phone || '',
        email: c.email || '',
        notes: c.accountLimitNotes || ''
      }));
  }, [customers]);

  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'folio'> & { folio?: string; id?: string }): Invoice => {
    const pv = invoiceData.pointOfSale || (invoiceData as any).point_of_sale;
    const num = invoiceData.invoiceNumber || (invoiceData as any).invoice_number;
    const folio = (invoiceData.folio && !invoiceData.folio.includes('undefined'))
      ? invoiceData.folio
      : (pv && num
        ? `${String(pv).padStart(4, '0')}-${String(num).padStart(8, '0')}`
        : `COM-${Date.now().toString().slice(-6)}`);
    const invoice: Invoice = { ...invoiceData, id: invoiceData.id || `INV-${Date.now()}`, folio };
    setInvoices(prev => [invoice, ...prev]);
    return invoice;
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices(prev => {
      return prev.map(inv => {
        if (inv.id === id) {
          if (inv.status === 'AUTORIZADA' && updates.status === 'ANULADA' && !updates.originalInvoiceNumber) {
            console.warn('Aviso: para anular fiscalmente un comprobante autorizado se debe generar la correspondiente Nota de Crédito.');
          }
          return { ...inv, ...updates };
        }
        return inv;
      });
    });
  };

  const refreshInvoices = useCallback(async (): Promise<void> => {
    try {
      const fiscalRecords = await billingService.getFiscalInvoices();
      if (Array.isArray(fiscalRecords) && fiscalRecords.length > 0) {
        const mapped: Invoice[] = fiscalRecords.map((r: any) => ({
          id: r.id,
          date: r.date || r.created_at,
          folio: (r.folio && !r.folio.includes('undefined'))
            ? r.folio
            : (r.point_of_sale || r.pointOfSale) && (r.invoice_number || r.invoiceNumber)
              ? `${String(r.point_of_sale || r.pointOfSale).padStart(4, '0')}-${String(r.invoice_number || r.invoiceNumber).padStart(8, '0')}`
              : r.id,
          pointOfSale: r.point_of_sale || r.pointOfSale,
          invoiceNumber: r.invoice_number || r.invoiceNumber,
          customerId: r.customer_id,
          clientName: r.customer_name || 'Consumidor Final',
          clientCuit: r.customer_cuit || r.customer_document_number || '',
          customerName: r.customer_name,
          customerDocumentType: r.customer_document_type,
          customerDocumentNumber: r.customer_document_number,
          customerCuit: r.customer_cuit,
          customerTaxCondition: r.customer_tax_condition,
          customerAddress: r.customer_address,
          subtotal: Number(r.subtotal_net || 0),
          subtotalNet: Number(r.subtotal_net || 0),
          taxes: Number(r.taxes || 0),
          total: Number(r.total || 0),
          currency: r.currency || 'PES',
          saleId: Array.isArray(r.sale_ids) ? r.sale_ids.join(', ') : (r.saleId || ''),
          saleIds: Array.isArray(r.sale_ids) ? r.sale_ids : (r.saleIds || []),
          type: (r.invoice_type || 'B') as any,
          invoiceType: (r.invoice_type || 'B') as any,
          invoiceTypeCode: r.invoice_type_code,
          origin: r.origin || 'ARCA_LOCAL',
          status: r.status || 'AUTORIZADA',
          direction: r.direction || 'venta',
          serviceUsed: r.service_used || 'WSMTXCA',
          cae: r.cae,
          caeExpirationDate: r.cae_expiration_date,
          arcaObservations: r.arca_observations,
          qrPayload: r.qr_payload,
          qrDataUrl: r.qrDataUrl,
          attachmentUrl: r.attachment_url,
          notes: r.notes,
          verifiedAt: r.verified_at,
          verifiedBy: r.verified_by,
          items: r.items,
          vatBreakdown: r.vat_breakdown,
          associatedInvoiceId: r.associated_invoice_id,
          associatedPointOfSale: r.associated_point_of_sale,
          associatedInvoiceNumber: r.associated_invoice_number,
          associatedInvoiceType: r.associated_invoice_type,
          associatedInvoiceTypeCode: r.associated_invoice_type_code,
          associatedCuit: r.associated_cuit,
          operationId: r.operation_id || r.idempotency_key,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
        setInvoices(prev => {
          const map = new Map<string, Invoice>();
          prev.filter(i => (i.status as any) !== 'Emitida').forEach(i => map.set(i.id, i));
          mapped.forEach(i => map.set(i.id, i));
          return Array.from(map.values());
        });
      }
    } catch (e) {
      console.warn('Error al refrescar facturas fiscales:', e);
    }
  }, []);

  const checkSaleBilledStatus = useCallback((saleId: string) => {
    if (!saleId) return { isBilled: false, canRetry: true, needsReconciliation: false };
    const cleanId = String(saleId).trim();
    const found = invoices.find(inv => {
      if (inv.saleId && inv.saleId === cleanId) return true;
      if (Array.isArray(inv.saleIds) && inv.saleIds.includes(cleanId)) return true;
      return false;
    });

    if (!found) {
      return { isBilled: false, canRetry: true, needsReconciliation: false };
    }

    if (found.status === 'AUTORIZADA') {
      return { isBilled: true, invoice: found, canRetry: false, needsReconciliation: false };
    }
    if (found.status === 'ESTADO_DESCONOCIDO') {
      return { isBilled: false, invoice: found, canRetry: false, needsReconciliation: true };
    }
    if (found.status === 'RECHAZADA' || found.status === 'ERROR_TECNICO') {
      return { isBilled: false, invoice: found, canRetry: true, needsReconciliation: false };
    }
    return { isBilled: false, invoice: found, canRetry: true, needsReconciliation: false };
  }, [invoices]);

  const addBillingCustomer = (data: Omit<BillingCustomer, 'id'>) => {
    const rawPhone = data.phone?.trim() || '';
    const formattedPhone = rawPhone ? formatPhone(rawPhone) : `+54999${(data.cuit || data.documentNumber || Date.now()).toString().replace(/\D/g, '').slice(-9)}`;
    const profile: CustomerProfile = {
      phone: formattedPhone,
      nombre: data.name,
      name: data.name,
      dni: data.documentType === 'DNI' ? (data.documentNumber || '') : '',
      cuit: data.cuit || (data.documentType === 'CUIT' ? data.documentNumber : '') || '',
      document_type: data.documentType || (data.cuit ? 'CUIT' : 'DNI'),
      documentType: data.documentType || (data.cuit ? 'CUIT' : 'DNI'),
      tax_condition: data.taxCondition || 'Consumidor Final',
      taxCondition: data.taxCondition || 'Consumidor Final',
      business_name: data.name,
      businessName: data.name,
      direccion: data.address || '',
      fiscal_address: data.address || '',
      fiscalAddress: data.address || '',
      email: data.email || '',
      hasCurrentAccount: false,
      isManual: true,
      isFiscal: true,
      is_fiscal: true,
      accountLimitNotes: data.notes || ''
    };
    upsertCustomerProfile(profile).catch(console.error);
    setCustomerProfiles(prev => ({
      ...prev,
      [formattedPhone]: profile
    }));
  };

  const updateBillingCustomer = (id: string, updates: Partial<BillingCustomer>) => {
    const target = customers.find(c => c.phone === id || c.cuit === id || c.dni === id || c.name === id);
    if (!target) return;
    updateCustomerProfile(target.phone, {
      name: updates.name,
      businessName: updates.name,
      cuit: updates.cuit,
      documentType: updates.documentType,
      documentNumber: updates.documentNumber || updates.cuit,
      taxCondition: updates.taxCondition,
      fiscalAddress: updates.address,
      phone: updates.phone,
      email: updates.email,
      accountLimitNotes: updates.notes,
      isFiscal: true
    });
  };

  const deleteBillingCustomer = (id: string) => {
    const target = customers.find(c => c.phone === id || c.cuit === id || c.dni === id || c.name === id);
    if (!target) return;
    // NO eliminar el perfil del cliente en el supermercado; solo desasociar sus datos fiscales
    updateCustomerProfile(target.phone, {
      cuit: '',
      businessName: '',
      taxCondition: 'Consumidor Final',
      fiscalAddress: '',
      isFiscal: false
    });
  };

  // Handlers: Products
  const addProduct = (p: Product) => {
    const input = {
      name: p.name,
      brand: p.brand || '',
      categoryId: p.categoryId,
      price: p.price,
      originalPrice: p.originalPrice || null,
      image: p.image || '',
      format: p.format || '',
      isNew: p.isNew || false,
      discount: parseDiscount(p.discount),
      badge: p.badge || '',
      minStock: p.minStock || 15,
      barcode: p.barcode || '',
      stock: p.stock || 0,
      branchId: 'main'
    };
    useProductStore.getState().addProduct(input).catch(console.error);
  };

  const updateProduct = (id: string, up: Partial<Product>) => {
    const input = {
      ...(up.name !== undefined && { name: up.name }),
      ...(up.brand !== undefined && { brand: up.brand }),
      ...(up.categoryId !== undefined && { categoryId: up.categoryId }),
      ...(up.subcategoryId !== undefined && { subcategoryId: up.subcategoryId }),
      ...(up.price !== undefined && { price: up.price }),
      ...(up.originalPrice !== undefined && { originalPrice: up.originalPrice }),
      ...(up.image !== undefined && { image: up.image }),
      ...(up.format !== undefined && { format: up.format }),
      ...(up.isNew !== undefined && { isNew: up.isNew }),
      ...(up.discount !== undefined && { discount: parseDiscount(up.discount) }),
      ...(up.badge !== undefined && { badge: up.badge }),
      ...(up.minStock !== undefined && { minStock: up.minStock }),
      ...(up.barcode !== undefined && { barcode: up.barcode }),
      ...(up.stock !== undefined && { stock: up.stock }),
    };
    useProductStore.getState().updateProduct(id, input).catch(console.error);
  };

  const deleteProduct = (id: string) => {
    useProductStore.getState().deleteProduct(id).catch(console.error);
    setStockMap(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const bulkUpdatePrice = (ids: string[], pct: number) => {
    useProductStore.getState().bulkUpdatePrice(ids, pct).catch(console.error);
  };

  const bulkAddProducts = (newProds: Product[], stockUpdates?: Record<string, number>) => {
    const inputs = newProds.map(p => ({
      name: p.name,
      brand: p.brand || '',
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId || null,
      price: p.price,
      originalPrice: p.originalPrice || null,
      image: p.image || '',
      format: p.format || '',
      isNew: p.isNew || false,
      discount: parseDiscount(p.discount),
      badge: p.badge || '',
      minStock: p.minStock || 15,
      barcode: p.barcode || '',
      stock: p.stock || 0,
      branchId: 'main'
    }));
    useProductStore.getState().bulkAddProducts(inputs).catch(console.error);
  };

  // Handlers: Categories
  const addCategory = (c: Category) => {
    setAdminCategories(prev => [...prev, c]);
    insertCategory(c).catch(console.error);
  };

  const updateCategory = (id: string, up: Partial<Category>) => {
    if (up.id && up.id !== id) {
      setAdminProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: up.id! } : p));
    }
    setAdminCategories(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
    updateCategoryInDb(id, up).catch(console.error);
  };

  const deleteCategory = (id: string) => {
    setAdminCategories(prev => prev.filter(c => c.id !== id));
    setAdminProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: 'general' } : p));
    deleteCategoryFromDb(id).catch(console.error);
  };

  // Handlers: Subcategories
  const addSubcategory = (s: Subcategory) => {
    setAdminSubcategories(prev => [...prev, s]);
    insertSubcategory(s).catch(console.error);
  };

  const updateSubcategory = (id: string, up: Partial<Subcategory>) => {
    setAdminSubcategories(prev => prev.map(s => s.id === id ? { ...s, ...up } : s));
    updateSubcategoryInDb(id, up).catch(console.error);
  };

  const deleteSubcategory = (id: string) => {
    setAdminSubcategories(prev => prev.filter(s => s.id !== id));
    setAdminProducts(prev => prev.map(p => p.subcategoryId === id ? { ...p, subcategoryId: null } : p));
    deleteSubcategoryFromDb(id).catch(console.error);
  };

  // Handlers: Tags
  const addTag = (t: string) => {
    setAdminTags(prev => {
      const next = prev.includes(t) ? prev : [...prev, t];
      saveSetting('admin_tags', next).catch(console.error);
      return next;
    });
  };

  const updateTag = (oldT: string, newT: string) => {
    setAdminTags(prev => {
      const next = prev.map(t => t === oldT ? newT : t);
      saveSetting('admin_tags', next).catch(console.error);
      return next;
    });
    setAdminProducts(prev => prev.map(p => p.badge === oldT ? { ...p, badge: newT } : p));
  };

  const deleteTag = (t: string) => {
    setAdminTags(prev => {
      const next = prev.filter(tag => tag !== t);
      saveSetting('admin_tags', next).catch(console.error);
      return next;
    });
    setAdminProducts(prev => prev.map(p => p.badge === t ? { ...p, badge: '' } : p));
  };

  const updateStock = (pid: string, s: number) => {
    const newStock = Math.max(0, Number(s) || 0);
    setStockMap(prev => ({ ...prev, [pid]: newStock }));
    useProductStore.getState().updateStock(pid, newStock).catch(console.error);
  };
  const getStock = (pid: string, fallbackStock?: number): number => {
    let stockVal: any;
    if (stockMap[pid] !== undefined && stockMap[pid] !== null) {
      // Si stockMap tiene 0 pero fallbackStock tiene un stock válido > 0 (ej. traído de base de datos),
      // priorizamos fallbackStock para no pisar productos disponibles con datos en 0 desactualizados
      if (Number(stockMap[pid]) === 0 && fallbackStock !== undefined && fallbackStock !== null && Number(fallbackStock) > 0) {
        stockVal = fallbackStock;
      } else {
        stockVal = stockMap[pid];
      }
    } else if (fallbackStock !== undefined && fallbackStock !== null) {
      stockVal = fallbackStock;
    } else {
      const prod = adminProducts.find(p => p.id === pid);
      stockVal = prod ? prod.stock : 0;
    }
    const num = Number(stockVal);
    return isNaN(num) ? 0 : num;
  };

  const deductStockForOrder = (orderItems: { id: string; quantity: number; stock?: number }[]): { success: boolean; insufficientItems: { id: string; name: string; requested: number; available: number }[] } => {
    // ESTA FUNCION SE MANTIENE SINCRONA POR AHORA PARA NO ROMPER CHECKOUT
    // Pero asume que el stock fue cargado o se permite sobreventa si no se encuentra.
    const insufficient: { id: string; name: string; requested: number; available: number }[] = [];
    for (const item of orderItems) {
      const available = getStock(item.id, item.stock);
      if (item.quantity > available && available > 0) { // Solo bloquear si sabemos que hay stock, pero es menor
        const prod = adminProducts.find(p => p.id === item.id);
        insufficient.push({ id: item.id, name: prod?.name || item.id, requested: item.quantity, available });
      }
    }
    if (insufficient.length > 0) return { success: false, insufficientItems: insufficient };

    setStockMap(prev => {
      const next = { ...prev };
      for (const item of orderItems) {
        const currentStock = next[item.id] !== undefined ? next[item.id] : getStock(item.id, item.stock);
        const newStock = Math.max(0, currentStock - item.quantity);
        next[item.id] = newStock;

        if (item.id !== 'PRODUCTO_COMUN' && !item.id.startsWith('GENERICO-')) {
          useProductStore.getState().updateStock(item.id, newStock).catch(console.error);
        }
      }
      return next;
    });
    return { success: true, insufficientItems: [] };
  };

  const restoreStockForOrder = (orderItems: { id: string; quantity: number; stock?: number }[]) => {
    setStockMap(prev => {
      const next = { ...prev };
      for (const item of orderItems) {
        const currentStock = next[item.id] !== undefined ? next[item.id] : getStock(item.id, item.stock);
        const newStock = currentStock + item.quantity;
        next[item.id] = newStock;

        if (item.id !== 'PRODUCTO_COMUN' && !item.id.startsWith('GENERICO-')) {
          useProductStore.getState().updateStock(item.id, newStock).catch(console.error);
        }
      }
      return next;
    });
  };

  // Mantenemos array vacio para que no rompa la UI legacy que lo use directamente
  const lowStockProducts: any[] = [];

  // Barcode lookup
  const findProductByBarcode = (barcode: string): Product | undefined => {
    if (!barcode) return undefined;
    return adminProducts.find(p => p.barcode === barcode);
  };

  let fallbackCatalogCache: Record<string, { n: string; b: string }> | null = null;

  const searchProductExternal = async (barcode: string): Promise<Partial<Product> | null> => {
    // 0. AHORA: Buscar primero en Supabase ya que los productos no están en memoria
    try {
      const dbProduct = await useProductStore.getState().getProductByBarcode(barcode); // This is local though
      // Wait, getProductByBarcode in useProductStore uses state.products (which is empty).
      // We must use productsService to query DB.
      const { productsService } = await import('../services/products.service');
      const dbProd = await productsService.getProductByBarcode(barcode);
      if (dbProd) {
        return dbProd; // Retornamos el producto tal cual lo encuentra en Supabase
      }
    } catch (e) {
      console.error("Error buscando en Supabase:", e);
    }

    // 1. Check OpenFoodFacts API first
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 1) {
          const p = data.product;
          return {
            name: p.product_name || '',
            brand: p.brands || '',
            image: p.image_url || p.image_front_url || '',
            format: p.quantity || '',
            barcode: barcode
          };
        }
      }
    } catch (error) {
      console.error("Error buscando producto en API externa:", error);
    }

    // 2. Check Local Excel Catalog (35k products JSON)
    try {
      if (!fallbackCatalogCache) {
        const fallbackRes = await fetch('/fallback_catalog.json');
        if (fallbackRes.ok) {
          fallbackCatalogCache = await fallbackRes.json();
        } else {
          fallbackCatalogCache = {};
        }
      }

      if (fallbackCatalogCache && fallbackCatalogCache[barcode]) {
        const item = fallbackCatalogCache[barcode];
        return {
          name: item.n,
          brand: item.b,
          barcode: barcode
        };
      }
    } catch (error) {
      console.error("Error buscando en catálogo de respaldo local:", error);
    }

    return null;
  };

  const addAdminOrder = async (o: AdminOrder) => {
    setOrders(prev => [o, ...prev]);
    // Don't deduct stock for generic/common products, nor for products already at 0
    o.items.forEach(async (i) => {
      if (i.id !== 'PRODUCTO_COMUN' && !i.id.startsWith('GENERICO-')) {
        let currentStock = getStock(i.id);
        if (currentStock === 0) {
          // Si no lo teniamos en memoria (o era 0), consultamos a la DB real para evitar mandar a 0 algo que tiene
          try {
            const { supabase } = await import('../lib/supabase');
            const { data } = await supabase.from('products').select('stock').eq('id', i.id).single();
            if (data) currentStock = data.stock;
          } catch (e) { }
        }
        if (currentStock > 0) {
          updateStock(i.id, Math.max(0, currentStock - i.quantity));
        }
      }
    });

    // Encolar mensaje de WhatsApp de confirmación/estado inicial del pedido si tiene teléfono
    // Si el pedido es a Cuenta Corriente, evitamos este mensaje genérico porque se enviará el mensaje unificado detallado.
    const isCuentaCorriente = o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado';

    if (o.phone && !isCuentaCorriente) {
      whatsappMessageService.createOrderStatusMessage({
        id: o.id,
        customer: o.customer,
        phone: o.phone,
        status: o.status || 'Nuevo',
        total: o.total,
        method: o.method
      });
    }

    // Encolar mensaje para el delivery si es envío (o.method === 'Envío' o 'envio')
    if ((o.method?.toLowerCase() === 'envío' || o.method?.toLowerCase() === 'envio') && !generalConfig.suspendEmployeeNotifications) {
      const { employeesService } = await import('../services/employees.service');
      const activeDelivery = await employeesService.getActiveDeliveryAssignment();
      let deliveryPhone = null;
      if (activeDelivery && activeDelivery.employee && activeDelivery.employee.phone) {
        deliveryPhone = activeDelivery.employee.phone;
      }
      const itemsCount = o.items.reduce((acc, i) => acc + (i.quantity || 1), 0);
      whatsappMessageService.createDeliveryAlertMessage(
        { id: o.id, customer: o.customer, itemsCount, total: o.total },
        deliveryPhone
      );
    }

    // Fase 3: Integración con Cuenta Corriente cuando se agrega una compra
    if (isCuentaCorriente && o.phone) {
      const activeCustomer = customers.find(c => c.phone === o.phone);
      const currentDebt = activeCustomer ? activeCustomer.currentDebt : 0;
      const debtAmount = o.total - (o.paidAmount || 0);
      const newDebt = currentDebt + debtAmount;

      const methodLabel = (o.method?.toLowerCase() === 'envío' || o.delivery_method === 'envio')
        ? 'Envío a domicilio'
        : (o.method?.toLowerCase() === 'retiro' || o.delivery_method === 'retiro')
          ? 'Retiro en sucursal'
          : 'Compra en local';

      const itemsCount = o.items.reduce((acc, i) => acc + (i.quantity || 1), 0);

      // Buscar la compra impaga más antigua previa a esta orden
      const previousUnpaidCcOrders = orders.filter(ord => {
        const ordPhone = (ord.phone || '').replace(/\D/g, '');
        const targetClean = (o.phone || '').replace(/\D/g, '');
        const isMatch = ordPhone === targetClean || (targetClean.length >= 8 && ordPhone.endsWith(targetClean.slice(-8)));
        return isMatch && ord.paymentMethod === 'cuenta_corriente' && ord.paymentStatus !== 'Pagado' && ord.status !== 'Cancelado' && (ord.total - (ord.paidAmount || 0)) > 0;
      });

      const oldestDebtDate = previousUnpaidCcOrders.length > 0
        ? Math.min(...previousUnpaidCcOrders.map(ord => ord.timestamp || (ord.date ? new Date(ord.date).getTime() : Date.now())))
        : o.timestamp || Date.now();

      // Encolar mensaje unificado de confirmación + cuenta corriente
      whatsappMessageService.createCurrentAccountDebtMessage(
        o.phone,
        o.customer,
        debtAmount,
        newDebt,
        `${methodLabel} (#${o.id}) - ${itemsCount} ítems`,
        o.id,
        methodLabel,
        itemsCount,
        oldestDebtDate
      );

      // Alerta de límite superado
      const effectiveAmountLimit = activeCustomer?.useCustomAccountLimits
        ? (activeCustomer.customDebtLimit ?? currentAccountConfig.maxDebtAmount)
        : currentAccountConfig.maxDebtAmount;

      if (currentAccountConfig.warnOnAmountLimit && newDebt > effectiveAmountLimit) {
        whatsappMessageService.createLimitExceededMessage(
          o.phone,
          o.customer,
          newDebt,
          effectiveAmountLimit
        );
      }
    }

    // Registrar redenciones de ofertas para descontar los cupos
    o.items.forEach(i => {
      if (i.offerId && i.lineDiscount && i.lineDiscount > 0) {
        addOfferRedemption({
          offer_id: i.offerId,
          product_id: i.id,
          order_id: o.id,
          customer_phone: o.phone,
          quantity: i.discountedQuantity || i.quantity,
          discount_amount: i.lineDiscount
        });
      }
    });
    if (o.discountOfferId && o.discount && o.discount > 0) {
      addOfferRedemption({
        offer_id: o.discountOfferId,
        order_id: o.id,
        customer_phone: o.phone,
        quantity: 1,
        discount_amount: o.discount
      });
    }
    await insertOrder(o);
  };
  const updateOrderStatus = (id: string, s: AdminOrder['status']) => {
    // Buscar la orden previa para ver su estado actual antes del cambio
    const targetOrder = orders.find(o => o.id === id);
    const prevStatus = targetOrder ? targetOrder.status : null;

    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: s } : o));
    // Sincronizar con el perfil del cliente (usando Zustand directamente)
    useAuthStore.getState().updateOrderStatus(id, s);

    updateOrderInDb(id, { status: s }).catch(console.error);

    if (targetOrder && prevStatus !== s) {
      if (s === 'Cancelado' && prevStatus !== 'Cancelado') {
        if (targetOrder.items && targetOrder.items.length > 0) {
          restoreStockForOrder(targetOrder.items);
        }

        // Alertar al personal/repartidor de turno activo sobre la cancelación del pedido (tanto retiro como envío)
        if (!generalConfig.suspendEmployeeNotifications) {
          (async () => {
            try {
              const { employeesService } = await import('../services/employees.service');
              const activeDelivery = await employeesService.getActiveDeliveryAssignment();
              let deliveryPhone = null;
              if (activeDelivery && activeDelivery.employee && activeDelivery.employee.phone) {
                deliveryPhone = activeDelivery.employee.phone;
              }
              whatsappMessageService.createDeliveryCancellationAlertMessage(
                { id: targetOrder.id, customer: targetOrder.customer, total: targetOrder.total, method: targetOrder.method },
                deliveryPhone
              );
            } catch (err) {
              console.error('Error enviando alerta de cancelación al personal:', err);
            }
          })();
        }
      }

      whatsappMessageService.createOrderStatusMessage({
        id: targetOrder.id,
        customer: targetOrder.customer,
        phone: targetOrder.phone,
        status: s,
        total: targetOrder.total,
        estimatedTotal: targetOrder.estimatedTotal,
        weightAdjusted: targetOrder.weightAdjusted,
        method: targetOrder.method
      });
    }
  };
  const updateOrderMethod = (id: string, method: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, method } : o));
    updateOrderInDb(id, { method }).catch(console.error);
  };
  const updateOrderPaymentMethod = (id: string, paymentMethod: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentMethod } : o));
    updateOrderInDb(id, { paymentMethod }).catch(console.error);
  };

  const updateOrderWeightItems = (orderId: string, updatedItems: AdminOrder['items']) => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return;

    const initialEstimated = target.estimatedTotal || target.total;

    // Calcular el nuevo subtotal de los ítems
    const itemsSubtotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const newTotal = Math.max(0, itemsSubtotal - (target.discount || 0));

    // Ajustar diferencias de stock si la orden no está cancelada
    if (target.status !== 'Cancelado') {
      updatedItems.forEach(newItem => {
        const oldItem = target.items.find(i => i.id === newItem.id);
        if (oldItem && oldItem.quantity !== newItem.quantity) {
          const diff = newItem.quantity - oldItem.quantity;
          setStockMap(prev => {
            const currentStock = prev[newItem.id] !== undefined ? prev[newItem.id] : getStock(newItem.id);
            const newStock = Math.max(0, parseFloat((currentStock - diff).toFixed(3)));
            if (newItem.id !== 'PRODUCTO_COMUN' && !newItem.id.startsWith('GENERICO-')) {
              useProductStore.getState().updateStock(newItem.id, newStock).catch(console.error);
            }
            return { ...prev, [newItem.id]: newStock };
          });
        }
      });
    }

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: updatedItems,
          total: newTotal,
          estimatedTotal: initialEstimated,
          weightAdjusted: true
        };
      }
      return o;
    }));

    updateOrderItemsInDb(orderId, updatedItems, newTotal).catch(console.error);
  };

  const ordersRevenue = orders
    .filter(o => o.status !== 'Cancelado' && o.source !== 'pos')
    .reduce((s, o) => s + o.total, 0);

  const posRevenue = orders
    .filter(o => o.status !== 'Cancelado' && o.source === 'pos')
    .reduce((s, o) => s + o.total, 0);

  const totalRevenue = ordersRevenue + posRevenue;
  const totalDebtInStreet = customers.reduce((s, c) => s + (c.currentDebt || 0), 0);
  const activeOrdersCount = orders.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado').length;
  const lowStockCount = useProductStore((state) => state.lowStockDashboardTotal);
  const totalCustomers = customers.length;

  // Helper to match customer tiers flexibly (Gold/Oro, Silver/Plata, Bronze/Bronce, Regular)
  // Reused from pricing.ts
  const localIsTierMatch = isTierMatch;

  // ─── Offers ───────────────────────────────────────────────
  const addOffer = (o: Offer) => {
    setOffers(prev => [...prev, o]);
    insertOffer(o);
    // Apply discount to product price only for product-scoped percent offers without tier restriction
    if (o.scope === 'product' && o.active && o.discountType === 'percent' && (!o.requiredTier || o.requiredTier === 'all')) {
      const idsToUpdate = o.targetIds && o.targetIds.length > 0 ? o.targetIds : (o.targetId ? [o.targetId] : []);
      idsToUpdate.forEach(pId => {
        const prod = adminProducts.find(p => p.id === pId);
        if (prod) {
          const discountedPrice = Math.round(prod.price * (1 - o.discountValue / 100));
          updateProduct(pId, {
            originalPrice: prod.originalPrice || prod.price,
            price: discountedPrice,
            discount: o.discountValue,
            badge: o.label || 'Oferta'
          });
        }
      });
    }
  };
  const updateOffer = (id: string, up: Partial<Offer>) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...up } : o));
    updateOfferInDb(id, up);
  };
  const deleteOffer = (id: string) => {
    const offer = offers.find(o => o.id === id);
    if (offer && offer.scope === 'product') {
      const idsToRestore = offer.targetIds && offer.targetIds.length > 0 ? offer.targetIds : (offer.targetId ? [offer.targetId] : []);
      idsToRestore.forEach(pId => {
        const prod = adminProducts.find(p => p.id === pId);
        if (prod && prod.originalPrice) {
          updateProduct(pId, { price: prod.originalPrice, originalPrice: undefined, discount: undefined, badge: '' });
        }
      });
    }
    setOffers(prev => prev.filter(o => o.id !== id));
    deleteOfferInDb(id);
  };

  const activeOffers = useMemo(() => {
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    return offers.filter(o => {
      if (!o.active) return false;
      const startStr = (o.startDate || '').split('T')[0];
      const endStr = (o.endDate || '').split('T')[0];
      if (startStr && startStr > todayStr) return false;
      if (endStr && endStr < todayStr) return false;
      return true;
    });
  }, [offers]);

  // Apply offers to a cart item at POS/Cart time (product, category, subcategory, tag level)
  const applyOffersToCartItem = (
    item: { productId: string; categoryId?: string; price: number; quantity: number },
    customer?: AdminCustomer | null,
    options?: { forDisplay?: boolean }
  ) => {
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // Adapter for pure function
    return pureApplyOffersToCartItem(
      item as PricingItemInput,
      adminProducts,
      offers,
      offerRedemptions,
      todayStr,
      customer,
      options
    );
  };

  // Apply order-scoped offers (all, customer, birthday, tier) once to the entire subtotal
  const applyOrderOffers = (
    subtotalAfterItemDiscounts: number,
    customer?: AdminCustomer | null
  ) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    return pureApplyOrderOffers(
      subtotalAfterItemDiscounts,
      offers,
      offerRedemptions,
      todayStr,
      todayMonth,
      todayDay,
      customer
    );
  };


  // ─── Cash Close ───────────────────────────────────────────
  // Use timestamp if available, otherwise try to parse the date string
  const getOrderTimestamp = (o: AdminOrder): number => {
    if (o.timestamp) return o.timestamp;
    // Robust parse for es-AR format: "07/05/2026, 10:30" or "07/05/2026 10:30 a. m."
    const str = o.date;
    const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const timeM = str.match(/(\d{1,2}):(\d{2})/);
      const h = timeM ? parseInt(timeM[1]) : 0;
      const min = timeM ? parseInt(timeM[2]) : 0;
      // Handle AM/PM
      const isPM = /p\.?\s*m/i.test(str);
      const isAM = /a\.?\s*m/i.test(str);
      let hour = h;
      if (isPM && h < 12) hour = h + 12;
      if (isAM && h === 12) hour = 0;
      return new Date(+m[3], +m[2] - 1, +m[1], hour, min).getTime();
    }
    return new Date(str).getTime();
  };

  const performCashClose = (withdrawals: CashWithdrawal[] = []): CashClose | null => {
    // Guard: do not close if register is already closed
    if (!cashRegister.isOpen) {
      console.warn('performCashClose: La caja ya se encuentra cerrada. No se generará un cierre duplicado.');
      return null;
    }

    const now = new Date();
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);

    const from = fromDate.getTime();
    const to = now.getTime();

    // Collect movements and orders SINCE the last close (not since start of day)
    // This prevents accumulation: each close only covers its own period
    const periodMovements = cashMovements.filter(m => m.timestamp >= lastPOSCloseTimestamp);
    const movementIds = periodMovements.map(m => m.id);

    const periodOrders = orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= lastPOSCloseTimestamp && ts <= to && o.status !== 'Cancelado';
    });

    const totalSales = periodOrders.reduce((s, o) => s + o.total, 0);
    const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);
    const totalMovements = periodMovements.length;

    // Guard: If box closed in 0 (no sales, no movements, no withdrawals), do not save it to list/db.
    if (totalSales === 0 && totalMovements === 0 && totalWithdrawals === 0) {
      console.log('performCashClose: Caja cerrada en 0 (sin ventas, movimientos ni retiros). No se agrega al historial.');
      closeCashRegister();
      return null;
    }

    const cashPayments = periodOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    const cardPayments = periodOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0);
    const transferPayments = periodOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0);
    const cuentaCorrientePayments = periodOrders.filter(o => o.paymentMethod === 'cuenta_corriente').reduce((s, o) => s + o.total, 0);

    // Calcular efectivo esperado al cierre (se guarda para el arqueo de apertura del día siguiente)
    // Filtramos para que manualCashIncomes no incluya "Venta Local", ya que eso ya está en cashPayments
    const manualCashIncomes = periodMovements
      .filter(m => m.type === 'Ingreso' && !m.description.includes('Venta Local'))
      .reduce((s, m) => s + m.amount, 0);
    const manualCashExpenses = periodMovements
      .filter(m => m.type === 'Egreso' && !m.description.startsWith('PAGO PROVEEDOR:'))
      .reduce((s, m) => s + m.amount, 0);
    const openingControlExpected = (cashRegister.initialAmount ?? 0)
      + cashPayments
      + manualCashIncomes
      - totalWithdrawals
      - manualCashExpenses;

    const close: CashClose = {
      id: 'CC_' + Date.now(),
      date: now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      period: 'diario',
      totalSales,
      totalOrders: periodOrders.length,
      cashPayments,
      cardPayments,
      transferPayments,
      cuentaCorrientePayments,
      closedAt: now.toISOString(),
      withdrawals,
      totalWithdrawals,
      movementIds,
      initialAmount: cashRegister.initialAmount,
      openingControlExpected,
    };
    setCashCloses(prev => [close, ...prev]);
    insertCashClose(close).catch(console.error);
    const newTs = Date.now();
    setLastPOSCloseTimestamp(newTs);
    saveSetting('last_pos_close_timestamp', newTs).catch(console.error);
    // Close the cash register
    closeCashRegister();
    return close;
  };

  const updateCashCloseOpeningControl = (
    closeId: string,
    data: { counted: number; notes: string; checkedBy: string }
  ) => {
    setCashCloses(prev => prev.map(c => {
      if (c.id === closeId) {
        const updated = {
          ...c,
          openingControlCounted: data.counted,
          openingControlDifference: data.counted - (c.openingControlExpected ?? 0),
          openingControlNotes: data.notes,
          openingControlCheckedAt: new Date().toISOString(),
          openingControlCheckedBy: data.checkedBy,
        };
        supabase.from('cash_closes').update(updated).eq('id', closeId).eq('branch_id', 'main').then(({ error }) => { if (error) console.error('Error updating cash close:', error); });
        return updated;
      }
      return c;
    }));
  };

  const addCashMovement = (mov: Omit<CashMovement, 'id' | 'timestamp'>) => {
    const newMov: CashMovement = {
      ...mov,
      id: `MOV-${Date.now()}`,
      timestamp: Date.now()
    };
    setCashMovements(prev => [newMov, ...prev]);
    insertCashMovement(newMov).catch(console.error);
  };

  const addCashWithdrawal = (w: Omit<CashWithdrawal, 'id' | 'timestamp'>) => {
    const ts = Date.now();
    const withdrawal: CashWithdrawal = { ...w, id: `WD-${ts}`, timestamp: ts };
    // Also record as a cash movement so it appears in activity
    addCashMovement({
      type: 'Retiro',
      description: `Retiro: ${w.reason}`,
      cashier: w.user,
      amount: w.amount
    });

    // Auto-record as an expense under Retiro del Dueño
    addExpense({
      branch_id: 'main',
      type: 'retiro',
      supplier_name: undefined,
      amount: w.amount,
      payment_method: 'cash',
      description: w.reason,
      observations: 'Registrado automáticamente desde retiro de caja',
      created_by: w.user,
      expense_date: new Date().toISOString().split('T')[0],
      status: 'active'
    });

    return withdrawal;
  };

  const getCashCloseMovements = (closeId: string): CashMovement[] => {
    const close = cashCloses.find(c => c.id === closeId);
    if (!close) return [];
    if (close.movementIds && close.movementIds.length > 0) {
      return cashMovements.filter(m => close.movementIds.includes(m.id));
    }
    // Fallback for older closes: movements between prev close and this close
    const closeTs = new Date(close.closedAt).getTime();
    const prevClose = cashCloses.find(c => {
      const ts = new Date(c.closedAt).getTime();
      return ts < closeTs;
    });
    const prevTs = prevClose ? new Date(prevClose.closedAt).getTime() : 0;
    return cashMovements.filter(m => m.timestamp >= prevTs && m.timestamp <= closeTs);
  };


  // ─── Analytics Helpers ────────────────────────────────────
  const getTopSellingProducts = (daysOrRange: number | { from: number, to: number }) => {
    let from: number;
    let to: number = Date.now();

    if (typeof daysOrRange === 'number') {
      from = Date.now() - daysOrRange * 24 * 60 * 60 * 1000;
    } else {
      from = daysOrRange.from;
      to = daysOrRange.to;
    }

    const relevantOrders = orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= from && ts <= to && o.status !== 'Cancelado';
    });
    const salesMap: Record<string, { unitsSold: number; revenue: number }> = {};
    relevantOrders.forEach(o => {
      o.items.forEach(item => {
        if (!salesMap[item.id]) salesMap[item.id] = { unitsSold: 0, revenue: 0 };
        salesMap[item.id].unitsSold += item.quantity;
        salesMap[item.id].revenue += item.price * item.quantity;
      });
    });
    return Object.entries(salesMap)
      .map(([id, data]) => ({ product: adminProducts.find(p => p.id === id)!, ...data }))
      .filter(e => e.product)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 100);
  };

  const getRevenueByCategory = (range?: { from: number, to: number }) => {
    const catMap: Record<string, number> = {};
    const filteredOrders = range
      ? orders.filter(o => { const ts = getOrderTimestamp(o); return ts >= range.from && ts <= range.to && o.status !== 'Cancelado'; })
      : orders.filter(o => o.status !== 'Cancelado');

    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        const prod = adminProducts.find(p => p.id === item.id);
        const cat = prod?.categoryId || 'otros';
        catMap[cat] = (catMap[cat] || 0) + item.price * item.quantity;
      });
    });
    const total = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(catMap)
      .map(([cat, revenue]) => ({ category: adminCategories.find(c => c.id === cat)?.title || cat, revenue, percent: Math.round((revenue / total) * 100) }))
      .sort((a, b) => b.revenue - a.revenue);
  };

  const getRevenueByDay = (daysOrRange: number | { from: number, to: number }) => {
    const result: { day: string; revenue: number }[] = [];
    let from: number;
    let to: number;
    let totalDays: number;

    if (typeof daysOrRange === 'number') {
      to = Date.now();
      from = to - (daysOrRange - 1) * 24 * 60 * 60 * 1000;
      totalDays = daysOrRange;
    } else {
      from = daysOrRange.from;
      to = daysOrRange.to;
      const diffTime = Math.abs(to - from);
      totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    }

    // Heuristic for grouping to keep ~12-16 bars
    if (totalDays <= 16) {
      // Daily resolution
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(from + i * 24 * 60 * 60 * 1000);
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
        const rev = orders
          .filter(o => { const ts = getOrderTimestamp(o); return ts >= startOfDay && ts <= endOfDay && o.status !== 'Cancelado'; })
          .reduce((s, o) => s + o.total, 0);

        const label = totalDays <= 7
          ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()]
          : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        result.push({ day: label, revenue: rev });
      }
    } else if (totalDays >= 28 && totalDays <= 31) {
      // Monthly resolution: 4-5 weeks
      for (let i = 0; i < totalDays; i += 7) {
        const bucketStart = from + i * 24 * 60 * 60 * 1000;
        const bucketEnd = Math.min(to, bucketStart + 6 * 24 * 60 * 60 * 1000 + 86399999);
        const rev = orders
          .filter(o => { const ts = getOrderTimestamp(o); return ts >= bucketStart && ts <= bucketEnd && o.status !== 'Cancelado'; })
          .reduce((s, o) => s + o.total, 0);

        const weekNum = Math.floor(i / 7) + 1;
        result.push({ day: `Sem ${weekNum}`, revenue: rev });
      }
    } else if (totalDays >= 360 && totalDays <= 370) {
      // Yearly resolution: 12 months
      const start = new Date(from);
      for (let i = 0; i < 12; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const endMonth = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59, 999);
        const rev = orders
          .filter(o => { const ts = getOrderTimestamp(o); return ts >= d.getTime() && ts <= endMonth.getTime() && o.status !== 'Cancelado'; })
          .reduce((s, o) => s + o.total, 0);

        const label = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()];
        result.push({ day: label, revenue: rev });
      }
    } else {
      // Custom grouping
      const bucketSize = Math.ceil(totalDays / 14);
      for (let i = 0; i < totalDays; i += bucketSize) {
        const bucketStart = from + i * 24 * 60 * 60 * 1000;
        const bucketEnd = Math.min(to, bucketStart + (bucketSize - 1) * 24 * 60 * 60 * 1000 + 86399999);

        const rev = orders
          .filter(o => { const ts = getOrderTimestamp(o); return ts >= bucketStart && ts <= bucketEnd && o.status !== 'Cancelado'; })
          .reduce((s, o) => s + o.total, 0);

        const dStart = new Date(bucketStart);
        const dEnd = new Date(bucketEnd);
        const label = `${dStart.getDate()}/${dStart.getMonth() + 1}${bucketSize > 1 ? `-${dEnd.getDate()}/${dEnd.getMonth() + 1}` : ''}`;
        result.push({ day: label, revenue: rev });
      }
    }

    return result;
  };

  // Automatic cleanup of all phone numbers in the database
  useEffect(() => {
    const sanitize = (phone: string) => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 0) return '';
      if (cleaned.startsWith('54')) cleaned = cleaned.substring(2);
      return '+54' + cleaned;
    };

    // 1. Sanitize orders
    setOrders(prev => {
      const needsUpdate = prev.some(o => o.phone && !o.phone.startsWith('+'));
      if (!needsUpdate) return prev;
      return prev.map(o => ({
        ...o,
        phone: o.phone ? sanitize(o.phone) : ''
      }));
    });

    // 2. Sanitize profiles
    setCustomerProfiles(prev => {
      const needsUpdate = Object.values(prev).some((p: any) => p.phone && !p.phone.startsWith('+'));
      if (!needsUpdate) return prev;
      const newProfiles: Record<string, CustomerProfile> = {};
      Object.entries(prev).forEach(([oldPhone, profile]) => {
        const newPhone = sanitize(oldPhone);
        const p = profile as CustomerProfile;
        newProfiles[newPhone] = { ...p, phone: newPhone };
      });
      return newProfiles;
    });
  }, [orders.length]); // Run once or when count changes

  return (
    <AdminContext.Provider value={{
      adminProducts, addProduct, updateProduct, deleteProduct, bulkUpdatePrice, bulkAddProducts,
      adminCategories, addCategory, updateCategory, deleteCategory,
      adminSubcategories, addSubcategory, updateSubcategory, deleteSubcategory,
      adminTags, addTag, updateTag, deleteTag,
      stockMap, updateStock, getStock, deductStockForOrder, lowStockProducts, findProductByBarcode, searchProductExternal,
      orders, addAdminOrder, updateOrderStatus, updateOrderMethod, updateOrderPaymentMethod, updateOrderWeightItems, getOrderTimestamp,
      customers, toggleCurrentAccount, updateCustomerProfile, settleCurrentAccount,
      addManualCustomer, deleteCustomer,
      totalRevenue,
      ordersRevenue,
      posRevenue,
      totalDebtInStreet,
      activeOrdersCount, lowStockCount, totalCustomers,
      currentAccountConfig, updateCurrentAccountConfig, loadAdminData,
      storeStatus, updateStoreStatus,
      deliveryTimeSlots, updateDeliveryTimeSlots,
      autoCashCloseConfig, updateAutoCashCloseConfig,
      generalConfig, updateGeneralConfig, blockPhone, unblockPhone, isPhoneBlocked,
      offers, addOffer, updateOffer, deleteOffer, activeOffers, applyOffersToCartItem, applyOrderOffers, offerRedemptions, addOfferRedemption,
      cashCloses, performCashClose, updateCashCloseOpeningControl,
      cashMovements, addCashMovement, addCashWithdrawal, lastPOSCloseTimestamp, getCashCloseMovements,
      ticketConfig, updateTicketConfig,
      fiscalConfig, updateFiscalConfig,
      thermalPrinterConfig, updateThermalPrinterConfig,
      cashRegister, openCashRegister, closeCashRegister, isCashRegisterOpen,
      invoices, addInvoice, updateInvoice, refreshInvoices, checkSaleBilledStatus,
      billingCustomers, addBillingCustomer, updateBillingCustomer, deleteBillingCustomer,
      getTopSellingProducts, getRevenueByCategory, getRevenueByDay,
      expenses, addExpense, updateExpense, cancelExpense, payExpense,
      heroBanners, addHeroBanner, updateHeroBanner, deleteHeroBanner, reorderHeroBanners, toggleHeroBannerActive,
      privacyMode, togglePrivacyMode: () => setPrivacyMode(p => !p),
      formatCurrency: (val: number, isCurrency = true, forceShow = false) => {
        if (val === undefined || val === null) return '0';
        if (privacyMode && !forceShow) return '***';
        return isCurrency ? val.toLocaleString('es-AR') : val.toString();
      }
    }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
};

