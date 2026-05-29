import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { products as catalogProducts, categories as catalogCategories, Product } from '../data/mockData';
import type { Category } from '../data/mockData';
export type { Category };
import { useProductStore } from '../stores/useProductStore';
import { useAuthStore } from '../stores/useAuthStore';
import { whatsappMessageService } from '../services/whatsapp-message.service';
import { supabase } from '../lib/supabase';
import { 
  fetchOrders, insertOrder, updateOrderInDb, 
  fetchCashMovements, insertCashMovement, 
  fetchCashCloses, insertCashClose, 
  fetchOffers, insertOffer, updateOfferInDb, deleteOfferInDb,
  fetchCustomerProfiles, upsertCustomerProfile,
  fetchSetting, saveSetting,
  fetchCategories, insertCategory, updateCategoryInDb, deleteCategoryFromDb
} from '../services/admin.service';


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
  status: 'Nuevo' | 'Preparando' | 'En Camino' | 'Entregado' | 'Cancelado';
  total: number;
  paidAmount?: number; // Amount already paid for this order (useful for partial payments)
  items: { id: string; name: string; image: string; price: number; quantity: number; originalPrice?: number; offerId?: string; lineDiscount?: number; discountedQuantity?: number }[];
  source?: 'pos' | 'whatsapp' | 'web';
  discount?: number;
  discountLabel?: string;
  discountOfferId?: string;
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
}

export interface CustomerProfile {
  dni?: string;
  phone: string;
  hasCurrentAccount: boolean;
  creditLimit?: number;
  birthday?: string;
  nombre?: string;
  apellido?: string;
  direccion?: string;
  isManual?: boolean; // true if created manually from Customers screen
  useCustomAccountLimits?: boolean;
  customDebtLimit?: number;
  customDebtDays?: number;
  accountLimitNotes?: string;
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

export interface CashRegister {
  isOpen: boolean;
  initialAmount: number;
  openedBy: string;
  openedAt: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
  taxRate: number; // e.g. 21, 10.5, 0
  total: number;
}

export interface Invoice {
  id: string;
  date: string;
  serie: string;
  folio: string;
  clientName: string;
  clientCuit: string;
  subtotal: number;
  taxes: number;
  total: number;
  saleId: string;
  type: 'A' | 'B' | 'C';
  status: 'Emitida' | 'Anulada' | 'Pendiente';
  direction?: 'venta' | 'compra';
  items?: InvoiceItem[];
  saleIds?: string[];
}

export interface BillingCustomer {
  id: string;
  name: string;
  cuit: string;
  address: string;
  phone: string;
  email: string;
  taxCondition: string;
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
  // Scope: product | category | all | customer | birthday | tier
  scope: 'product' | 'category' | 'all' | 'customer' | 'birthday' | 'tier';
  targetId?: string; // productId, categoryId, customerDni, or tier name depending on scope
  // Legacy field kept for backward compatibility
  productId?: string;
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

export interface StoreStatus {
  onlineSalesPaused: boolean;
  pauseReason: string;
  pausedAt: string | null;
  pausedBy: string | null;
  resumeMessage: string;
  allowBrowsingWhilePaused: boolean;
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

  // Tags (Badges)
  adminTags: string[];
  addTag: (tag: string) => void;
  updateTag: (oldTag: string, newTag: string) => void;
  deleteTag: (tag: string) => void;

  // Stock
  stockMap: Record<string, number>;
  updateStock: (productId: string, newStock: number) => void;
  getStock: (productId: string) => number;
  deductStockForOrder: (items: { id: string; quantity: number }[]) => { success: boolean; insufficientItems: { id: string; name: string; requested: number; available: number }[] };
  lowStockProducts: (Product & { stock: number })[];

  // Barcode
  findProductByBarcode: (barcode: string) => Product | undefined;
  searchProductExternal: (barcode: string) => Promise<Partial<Product> | null>;

  // Orders
  orders: AdminOrder[];
  addAdminOrder: (order: AdminOrder) => void;
  updateOrderStatus: (orderId: string, status: AdminOrder['status']) => void;
  updateOrderMethod: (orderId: string, method: string) => void;
  updateOrderPaymentMethod: (orderId: string, paymentMethod: string) => void;

  // Customers
  customers: AdminCustomer[];
  toggleCurrentAccount: (phone: string) => { success: boolean; message?: string };
  updateCustomerProfile: (oldPhone: string, updates: Partial<{ name: string; phone: string; dni: string; birthday: string; creditLimit: number; useCustomAccountLimits: boolean; customDebtLimit: number; customDebtDays: number; accountLimitNotes: string }>) => void;
  settleCurrentAccount: (phone: string, method: string, amount?: number) => void;
  addManualCustomer: (data: { nombre: string; apellido: string; telefono: string; direccion: string; dni?: string }) => void;
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

  // Offers
  offers: Offer[];
  addOffer: (offer: Offer) => void;
  updateOffer: (offerId: string, updates: Partial<Offer>) => void;
  deleteOffer: (offerId: string) => void;
  activeOffers: Offer[];
  applyOffersToCartItem: (item: { productId: string; categoryId?: string; price: number; quantity: number }, customer?: AdminCustomer | null) => { finalPrice: number; discountAmount: number; offerLabel: string | null; offerId: string | null; discountedQuantity: number };
  applyOrderOffers: (subtotalAfterItemDiscounts: number, customer?: AdminCustomer | null) => { discountAmount: number; offerLabel: string | null; offerId: string | null };
  offerRedemptions: OfferRedemption[];
  addOfferRedemption: (redemption: Omit<OfferRedemption, 'id' | 'created_at' | 'redemption_date'>) => void;

  // Store Status
  storeStatus: StoreStatus;
  updateStoreStatus: (updates: Partial<StoreStatus>) => void;

  // Cash Close & Movements
  cashCloses: CashClose[];
  performCashClose: (period: 'diario' | 'semanal' | 'mensual', withdrawals?: CashWithdrawal[]) => CashClose;
  updateCashCloseOpeningControl: (closeId: string, data: { counted: number; notes: string; checkedBy: string }) => void;
  cashMovements: CashMovement[];
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'timestamp'>) => void;
  addCashWithdrawal: (withdrawal: Omit<CashWithdrawal, 'id' | 'timestamp'>) => void;
  lastPOSCloseTimestamp: number;
  getCashCloseMovements: (closeId: string) => CashMovement[];

  // Ticket Config
  ticketConfig: TicketConfig;
  updateTicketConfig: (config: Partial<TicketConfig>) => void;

  // Cash Register
  cashRegister: CashRegister;
  openCashRegister: (amount: number, user?: string) => void;
  closeCashRegister: () => void;
  isCashRegisterOpen: boolean;

  // Invoices
  invoices: Invoice[];
  addInvoice: (invoice: Omit<Invoice, 'id' | 'folio'>) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  billingCustomers: BillingCustomer[];
  addBillingCustomer: (customer: Omit<BillingCustomer, 'id'>) => void;
  updateBillingCustomer: (id: string, updates: Partial<BillingCustomer>) => void;
  deleteBillingCustomer: (id: string) => void;

  // Analytics helpers
  getTopSellingProducts: (daysOrRange: number | { from: number, to: number }) => { product: Product; unitsSold: number; revenue: number }[];
  getRevenueByCategory: (range?: { from: number, to: number }) => { category: string; revenue: number; percent: number }[];
  getRevenueByDay: (daysOrRange: number | { from: number, to: number }) => { day: string; revenue: number }[];
  getOrderTimestamp: (o: AdminOrder) => number;

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

  useEffect(() => {
    storeFetch();
  }, [storeFetch]);

  useEffect(() => {
    if (!storeLoading) {
      if (storeProducts.length <= 1) {
        console.log('🌱 Base de datos de productos vacía o de prueba, sembrando catálogo original...');
        const toAdd = catalogProducts.map(p => ({
          name: p.name,
          brand: p.brand || '',
          categoryId: p.categoryId,
          price: p.price,
          originalPrice: p.originalPrice || null,
          image: p.image || '',
          format: p.format || '',
          isNew: p.isNew || false,
          discount: p.discount || null,
          badge: p.badge || '',
          minStock: p.minStock || 15,
          barcode: p.barcode || '',
          stock: p.stock || 0,
          branchId: 'main'
        }));
        useProductStore.getState().bulkAddProducts(toAdd as any)
          .then(() => {
            console.log('✅ Productos sembrados exitosamente');
            storeFetch();
          })
          .catch(console.error);
      } else {
        setAdminProducts(storeProducts as any);
        // Sincronizar stockMap con el stock de la base de datos para asegurar consistencia
        setStockMap(prev => {
          const next = { ...prev };
          storeProducts.forEach(p => {
            if (p.id) {
              next[p.id] = p.stock ?? 0;
            }
          });
          return next;
        });
      }
    }
  }, [storeProducts, storeLoading, storeFetch]);

  const [adminCategories, setAdminCategories] = useState<Category[]>([]);

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

  // Customers are now derived from orders for total consistency
  const customers = useMemo(() => {
    const customerMap: Record<string, AdminCustomer> = {};

    // Process orders from oldest to newest to ensure lastOrder/address is the most recent
    const sortedOrders = [...orders].sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      return tsA - tsB;
    });

      const limit30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;

    sortedOrders.forEach(o => {
      if (o.status === 'Cancelado') return;

      if (!customerMap[o.phone]) {
        customerMap[o.phone] = {
          dni: o.dni || '',
          name: o.customer,
          phone: o.phone,
          address: o.address,
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: o.date,
          hasCurrentAccount: false,
          currentDebt: 0,
          creditLimit: 50000,
          spent30: 0,
          tier: 'Regular',
          oldestDebtDays: 0,
        };
      }

      const c = customerMap[o.phone];
      c.totalOrders += 1;
      c.totalSpent += o.total;
      c.lastOrder = o.date;
      c.address = o.address; // Keep the most recent address
      c.name = o.customer;   // Keep the most recent name

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

    // Inject profile data and ensure ALL profiles exist as customers (even without orders)
    Object.values(customerProfiles).forEach((profileRaw) => {
      const profile = profileRaw as CustomerProfile;
      if (!customerMap[profile.phone]) {
        const manualName = profile.nombre && profile.apellido
          ? `${profile.nombre} ${profile.apellido}`
          : (profile.nombre || 'Cliente Nuevo');
        customerMap[profile.phone] = {
          dni: profile.dni || '',
          name: manualName,
          phone: profile.phone,
          address: profile.direccion || '',
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: '-',
          hasCurrentAccount: profile.hasCurrentAccount || false,
          currentDebt: 0,
          creditLimit: profile.creditLimit || 50000,
          birthday: profile.birthday,
          spent30: 0,
          tier: 'Regular',
          oldestDebtDays: 0,
          useCustomAccountLimits: profile.useCustomAccountLimits,
          customDebtLimit: profile.customDebtLimit,
          customDebtDays: profile.customDebtDays,
          accountLimitNotes: profile.accountLimitNotes,
        };
      } else {
        const c = customerMap[profile.phone];
        c.hasCurrentAccount = profile.hasCurrentAccount || false;
        c.creditLimit = profile.creditLimit || 50000;
        c.birthday = profile.birthday;
        c.useCustomAccountLimits = profile.useCustomAccountLimits;
        c.customDebtLimit = profile.customDebtLimit;
        c.customDebtDays = profile.customDebtDays;
        c.accountLimitNotes = profile.accountLimitNotes;
        if (profile.dni) c.dni = profile.dni;
        if (profile.nombre) c.name = `${profile.nombre}${profile.apellido ? ' ' + profile.apellido : ''}`;
        if (profile.direccion) c.address = profile.direccion;
      }
    });

    Object.values(customerMap).forEach(c => {
      if (c.spent30 >= 200000) c.tier = 'Gold';
      else if (c.spent30 >= 100000) c.tier = 'Silver';
      else if (c.spent30 >= 50000) c.tier = 'Bronze';
      else c.tier = 'Regular';
    });

    return Object.values(customerMap);
  }, [orders, customerProfiles]);

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

  const updateCustomerProfile = (oldPhone: string, updates: Partial<{ name: string; phone: string; dni: string; birthday: string; creditLimit: number; useCustomAccountLimits: boolean; customDebtLimit: number; customDebtDays: number; accountLimitNotes: string }>) => {
    // Find current customer by phone
    const targetCustomer = customers.find(c => c.phone === oldPhone);
    if (!targetCustomer) return;

    const newPhone = updates.phone ? formatPhone(updates.phone) : oldPhone;

    // 1. Update orders if phone, name, or DNI changed
    if (newPhone !== oldPhone || updates.name || updates.dni) {
      setOrders(prev => prev.map(o => {
        if (o.phone === oldPhone) {
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

    // 2. Update profiles (DNI, birthday, and CC status)
    setCustomerProfiles(prev => {
      const newProfiles = { ...prev };
      const currentProfile = newProfiles[oldPhone] || { phone: oldPhone, hasCurrentAccount: false };
      const updatedProfile = { 
        ...currentProfile, 
        ...updates,
        nombre: updates.name || currentProfile.nombre || '',
        phone: newPhone 
      };

      if (newPhone !== oldPhone) {
        delete newProfiles[oldPhone];
        newProfiles[newPhone] = updatedProfile;
      } else {
        newProfiles[oldPhone] = updatedProfile;
      }
      upsertCustomerProfile(updatedProfile).catch(console.error);
      return newProfiles;
    });
  };

  const settleCurrentAccount = (phone: string, method: string, amount?: number) => {
    setOrders(prev => {
      // 1. Filter out any existing negative "PAGO-" orders to clean up the bug
      const filteredPrev = prev.filter(o => !o.id.startsWith('PAGO-'));

      const unpaidOrders = filteredPrev
        .filter(o => o.phone === phone && o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado' && o.status !== 'Cancelado')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (unpaidOrders.length === 0) return filteredPrev;

      const totalDebt = unpaidOrders.reduce((s, o) => s + (o.total - (o.paidAmount || 0)), 0);
      const paymentAmount = amount !== undefined ? amount : totalDebt;

      let remainingToSettle = paymentAmount;

      const updatedOrders = filteredPrev.map(o => {
        if (o.phone === phone && o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado' && o.status !== 'Cancelado') {
          if (remainingToSettle <= 0) return o;

          const orderDebt = o.total - (o.paidAmount || 0);

          if (remainingToSettle >= orderDebt) {
            remainingToSettle -= orderDebt;
            const updated = { ...o, paymentStatus: 'Pagado' as const, paidAmount: o.total };
            updateOrderInDb(o.id, { paymentStatus: 'Pagado' as const, paidAmount: o.total }).catch(console.error);
            return updated;
          } else {
            const newPaid = (o.paidAmount || 0) + remainingToSettle;
            remainingToSettle = 0;
            const updated = { ...o, paidAmount: newPaid };
            updateOrderInDb(o.id, { paidAmount: newPaid }).catch(console.error);
            return updated;
          }
        }
        return o;
      });

      const methodMap: Record<string, string> = { 'cash': 'Efectivo', 'card': 'Tarjeta', 'transfer': 'Transferencia' };
      const translatedMethod = methodMap[method] || method;

      // 2. Record the payment in Cash Movements for today's physical box
      addCashMovement({
        type: 'Ingreso',
        description: `Pago Cta. Corriente (${translatedMethod}) - ${unpaidOrders[0].customer}`,
        cashier: 'Admin',
        amount: paymentAmount
      });

      // Fase 3: Integración con Cuenta Corriente cuando se registra un pago
      const customerName = unpaidOrders[0].customer;
      const remainingDebt = Math.max(0, totalDebt - paymentAmount);
      whatsappMessageService.createCurrentAccountPaymentMessage(
        phone,
        customerName,
        paymentAmount,
        remainingDebt
      );

      return updatedOrders;
    });
  };

  // ─── Manual Customer CRUD ─────────────────────────────────
  const addManualCustomer = (data: { nombre: string; apellido: string; telefono: string; direccion: string; dni?: string }) => {
    const phone = formatPhone(data.telefono);
    const profile: CustomerProfile = {
      dni: data.dni || phone,
      phone,
      hasCurrentAccount: false,
      nombre: data.nombre,
      apellido: data.apellido,
      direccion: data.direccion,
      isManual: true
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

  useEffect(() => {
    // 1. Fetch initial data from Supabase
    const loadAllData = async () => {
      const [_orders, _cashMovements, _cashCloses, _offers, _profiles, _ticketCfg, _accCfg, _cashReg, _invoices, _billing, _lastCloseTs, _categories, _tags] = await Promise.all([
        fetchOrders(),
        fetchCashMovements(),
        fetchCashCloses(),
        fetchOffers(),
        fetchCustomerProfiles(),
        fetchSetting('ticket_config', defaultTicketConfig),
        fetchSetting('current_account_config', defaultCurrentAccountConfig),
        fetchSetting('cash_register', { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' } as CashRegister),
        fetchSetting('invoices', [] as Invoice[]),
        fetchSetting('billing_customers', [] as BillingCustomer[]),
        fetchSetting('last_pos_close_timestamp', 0),
        fetchCategories(),
        fetchSetting<string[]>('admin_tags', initialTags)
      ]);

      setOrders(_orders);
      setCashMovements(_cashMovements);
      setCashCloses(_cashCloses);
      setOffers(_offers);
      setCustomerProfiles(_profiles);
      setTicketConfig(_ticketCfg);
      setCurrentAccountConfig(_accCfg);
      setCashRegister(_cashReg);
      setInvoices(_invoices);
      setBillingCustomers(_billing);
      setLastPOSCloseTimestamp(_lastCloseTs);
      setAdminTags(_tags);

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

      // Store Status
      supabase.from('settings').select('value').eq('key', 'store_status').maybeSingle().then(({ data }) => {
        if (data?.value) setStoreStatusState(data.value as StoreStatus);
      });
      // Offer Redemptions
      supabase.from('offer_redemptions').select('*').then(({ data }) => {
        if (data) setOfferRedemptions(data);
      });
    };

    loadAllData();

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
        fetchSetting('invoices', [] as Invoice[]).then(setInvoices);
        fetchSetting('billing_customers', [] as BillingCustomer[]).then(setBillingCustomers);
        fetchSetting('last_pos_close_timestamp', 0).then(setLastPOSCloseTimestamp);
        fetchSetting<string[]>('admin_tags', initialTags).then(setAdminTags);
      })
      .subscribe();

    const productsSub = supabase.channel('products_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        console.log('🔔 Cambio en tabla products detectado, re-fecheando...');
        storeFetch();
      })
      .subscribe();

    const categoriesSub = supabase.channel('categories_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        console.log('🔔 Cambio en tabla categories detectado, re-fecheando...');
        fetchCategories().then(setAdminCategories);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(statusSub);
      supabase.removeChannel(redemptionsSub);
      supabase.removeChannel(ordersSub);
      supabase.removeChannel(movementsSub);
      supabase.removeChannel(closesSub);
      supabase.removeChannel(profilesSub);
      supabase.removeChannel(settingsSub);
      supabase.removeChannel(productsSub);
      supabase.removeChannel(categoriesSub);
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

  // ─── Ticket Config ────────────────────────────────────────
  const defaultTicketConfig: TicketConfig = {
    blankLinesTop: 0,
    blankLinesBottom: 2,
    headerText: 'La Martina',
    businessName: 'Minimarket & Supermercado',
    businessAddress: 'La Paz, Mendoza',
    businessPhone: '',
    businessCuit: '',
    footerMessage: '¡Gracias por su compra!',
    showLogo: false
  };
  const [ticketConfig, setTicketConfig] = useState<TicketConfig>(defaultTicketConfig);
  const updateTicketConfig = (updates: Partial<TicketConfig>) => {
    setTicketConfig(prev => {
      const next = { ...prev, ...updates };
      saveSetting('ticket_config', next).catch(console.error);
      return next;
    });
  };

  // ─── Cash Register ────────────────────────────────────────
  const [cashRegister, setCashRegister] = useState<CashRegister>({ isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' });
  const isCashRegisterOpen = cashRegister.isOpen;
  const openCashRegister = (amount: number, user: string = 'Admin') => {
    const reg: CashRegister = { isOpen: true, initialAmount: amount, openedBy: user, openedAt: new Date().toISOString() };
    setCashRegister(reg);
    saveSetting('cash_register', reg).catch(console.error);
  };
  const closeCashRegister = () => {
    const reg: CashRegister = { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' };
    setCashRegister(reg);
    saveSetting('cash_register', reg).catch(console.error);
  };

  // ─── Invoices ─────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingCustomers, setBillingCustomers] = useState<BillingCustomer[]>([]);

  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'folio'>): Invoice => {
    const folio = String(invoices.length + 1).padStart(6, '0');
    const invoice: Invoice = { ...invoiceData, id: `INV-${Date.now()}`, folio };
    setInvoices(prev => {
      const next = [invoice, ...prev];
      saveSetting('invoices', next).catch(console.error);
      return next;
    });
    return invoice;
  };
  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices(prev => {
      const next = prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv);
      saveSetting('invoices', next).catch(console.error);
      return next;
    });
  };
  const addBillingCustomer = (data: Omit<BillingCustomer, 'id'>) => {
    setBillingCustomers(prev => {
      const next = [...prev, { ...data, id: `BC-${Date.now()}` }];
      saveSetting('billing_customers', next).catch(console.error);
      return next;
    });
  };
  const updateBillingCustomer = (id: string, updates: Partial<BillingCustomer>) => {
    setBillingCustomers(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      saveSetting('billing_customers', next).catch(console.error);
      return next;
    });
  };
  const deleteBillingCustomer = (id: string) => {
    setBillingCustomers(prev => {
      const next = prev.filter(c => c.id !== id);
      saveSetting('billing_customers', next).catch(console.error);
      return next;
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
  const getStock = (pid: string): number => {
    let stockVal: any;
    if (stockMap[pid] !== undefined && stockMap[pid] !== null) {
      stockVal = stockMap[pid];
    } else {
      const prod = adminProducts.find(p => p.id === pid);
      stockVal = prod ? prod.stock : 0;
    }
    const num = Number(stockVal);
    return isNaN(num) ? 0 : num;
  };
  const deductStockForOrder = (orderItems: { id: string; quantity: number }[]): { success: boolean; insufficientItems: { id: string; name: string; requested: number; available: number }[] } => {
    const insufficient: { id: string; name: string; requested: number; available: number }[] = [];
    // First pass: validate all items
    for (const item of orderItems) {
      const available = getStock(item.id);
      if (item.quantity > available) {
        const prod = adminProducts.find(p => p.id === item.id);
        insufficient.push({ id: item.id, name: prod?.name || item.id, requested: item.quantity, available });
      }
    }
    if (insufficient.length > 0) return { success: false, insufficientItems: insufficient };
    // Second pass: atomically deduct all
    setStockMap(prev => {
      const next = { ...prev };
      for (const item of orderItems) {
        const currentStock = next[item.id] !== undefined ? next[item.id] : getStock(item.id);
        const newStock = Math.max(0, currentStock - item.quantity);
        next[item.id] = newStock;
        
        // Sync to Supabase in the background
        if (item.id !== 'PRODUCTO_COMUN' && !item.id.startsWith('GENERICO-')) {
          useProductStore.getState().updateStock(item.id, newStock).catch(console.error);
        }
      }
      return next;
    });
    return { success: true, insufficientItems: [] };
  };
  const lowStockProducts = adminProducts.map(p => ({ ...p, stock: getStock(p.id) })).filter(p => p.stock < (p.minStock ?? 15)).sort((a, b) => a.stock - b.stock);

  // Barcode lookup
  const findProductByBarcode = (barcode: string): Product | undefined => {
    if (!barcode) return undefined;
    return adminProducts.find(p => p.barcode === barcode);
  };

  let fallbackCatalogCache: Record<string, { n: string; b: string }> | null = null;

  const searchProductExternal = async (barcode: string): Promise<Partial<Product> | null> => {
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

  const addAdminOrder = (o: AdminOrder) => {
    setOrders(prev => [o, ...prev]);
    // Don't deduct stock for generic/common products
    o.items.forEach(i => {
      if (i.id !== 'PRODUCTO_COMUN' && !i.id.startsWith('GENERICO-')) {
        updateStock(i.id, getStock(i.id) - i.quantity);
      }
    });

    // Fase 3: Integración con Cuenta Corriente cuando se agrega una compra
    if (o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado') {
      const activeCustomer = customers.find(c => c.phone === o.phone);
      const currentDebt = activeCustomer ? activeCustomer.currentDebt : 0;
      const debtAmount = o.total - (o.paidAmount || 0);
      const newDebt = currentDebt + debtAmount;

      // Encolar mensaje de compra
      whatsappMessageService.createCurrentAccountDebtMessage(
        o.phone,
        o.customer,
        debtAmount,
        newDebt,
        `Compra en local (#${o.id}) - ${o.items.length} ítems`,
        o.id
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
    insertOrder(o).catch(console.error);
  };
  const updateOrderStatus = (id: string, s: AdminOrder['status']) => {
    // Buscar la orden previa para ver su estado actual antes del cambio
    const targetOrder = orders.find(o => o.id === id);
    const prevStatus = targetOrder ? targetOrder.status : null;

    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: s } : o));
    // Sincronizar con el perfil del cliente (usando Zustand directamente)
    useAuthStore.getState().updateOrderStatus(id, s);

    updateOrderInDb(id, { status: s }).catch(console.error);

    // Encolar mensaje si el estado cambió realmente
    if (targetOrder && prevStatus !== s) {
      whatsappMessageService.createOrderStatusMessage({
        id: targetOrder.id,
        customer: targetOrder.customer,
        phone: targetOrder.phone,
        status: s
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

  const ordersRevenue = orders
    .filter(o => o.status !== 'Cancelado' && o.source !== 'pos')
    .reduce((s, o) => s + o.total, 0);

  const posRevenue = orders
    .filter(o => o.status !== 'Cancelado' && o.source === 'pos')
    .reduce((s, o) => s + o.total, 0);

  const totalRevenue = ordersRevenue + posRevenue;
  const totalDebtInStreet = customers.reduce((s, c) => s + (c.currentDebt || 0), 0);
  const activeOrdersCount = orders.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado').length;
  const lowStockCount = lowStockProducts.length;
  const totalCustomers = customers.length;

  // ─── Offers ───────────────────────────────────────────────
  const addOffer = (o: Offer) => {
    setOffers(prev => [...prev, o]);
    insertOffer(o);
    // Apply discount to product price only for product-scoped percent offers (legacy behavior)
    if (o.scope === 'product' && o.targetId && o.active && o.discountType === 'percent') {
      const prod = adminProducts.find(p => p.id === o.targetId);
      if (prod) {
        const discountedPrice = Math.round(prod.price * (1 - o.discountValue / 100));
        updateProduct(o.targetId, {
          originalPrice: prod.originalPrice || prod.price,
          price: discountedPrice,
          discount: `-${o.discountValue}%`,
          badge: o.label || 'Oferta'
        });
      }
    }
  };
  const updateOffer = (id: string, up: Partial<Offer>) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...up } : o));
    updateOfferInDb(id, up);
  };
  const deleteOffer = (id: string) => {
    const offer = offers.find(o => o.id === id);
    if (offer && offer.scope === 'product' && offer.targetId) {
      const prod = adminProducts.find(p => p.id === offer.targetId);
      if (prod && prod.originalPrice) {
        updateProduct(offer.targetId, { price: prod.originalPrice, originalPrice: undefined, discount: undefined, badge: '' });
      }
    }
    setOffers(prev => prev.filter(o => o.id !== id));
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

  // Apply offers to a cart item at POS time (only product and category level)
  const applyOffersToCartItem = (
    item: { productId: string; categoryId?: string; price: number; quantity: number },
    customer?: AdminCustomer | null
  ) => {
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const applicable = offers.filter(o => {
      if (!o.active) return false;
      const startStr = (o.startDate || '').split('T')[0];
      const endStr = (o.endDate || '').split('T')[0];
      if (startStr && startStr > todayStr) return false;
      if (endStr && endStr < todayStr) return false;
      if (o.scope === 'product') return o.targetId === item.productId || o.productId === item.productId;
      if (o.scope === 'category') {
        const prod = adminProducts.find(p => p.id === item.productId);
        return prod?.categoryId === o.targetId;
      }
      return false;
    });

    if (applicable.length === 0) return { finalPrice: item.price, discountAmount: 0, offerLabel: null, offerId: null, discountedQuantity: 0 };

    // Use the best (highest discount) applicable offer, respecting quotas
    let bestDiscount = 0;
    let bestLabel: string | null = null;
    let bestOfferId: string | null = null;
    let finalDiscountedQuantity = 0;
    
    applicable.forEach(o => {
      // Validate quota before considering this offer
      let allowedQuantity = item.quantity;
      if (o.daily_quantity_limit || o.per_customer_daily_limit || o.total_quantity_limit) {
        const todayRedemptions = offerRedemptions.filter(r => r.offer_id === o.id && r.redemption_date === todayStr);
        const usedTodayTotal = todayRedemptions.reduce((s, r) => s + r.quantity, 0);
        const usedTodayCustomer = customer ? todayRedemptions.filter(r => {
          const clean1 = (r.customer_phone || '').replace(/\\D/g, '');
          const clean2 = (customer.phone || '').replace(/\\D/g, '');
          return clean1 === clean2 && clean1 !== '';
        }).reduce((s, r) => s + r.quantity, 0) : 0;
        
        let remainingGlobal = o.daily_quantity_limit ? Math.max(0, o.daily_quantity_limit - usedTodayTotal) : Infinity;
        let remainingTotal = o.total_quantity_limit ? Math.max(0, o.total_quantity_limit - offerRedemptions.filter(r => r.offer_id === o.id).reduce((s,r) => s+r.quantity, 0)) : Infinity;
        let remainingCustomer = o.per_customer_daily_limit ? Math.max(0, o.per_customer_daily_limit - usedTodayCustomer) : Infinity;
        
        const strictLimit = Math.min(remainingGlobal, remainingTotal, remainingCustomer);
        allowedQuantity = Math.min(item.quantity, strictLimit);
      }

      if (allowedQuantity <= 0) return; // Quota exceeded for this offer

      // Calculate discount for the allowed units
      let discVal = 0;
      if (o.discountType === 'percent') {
        const unitDiscount = item.price * (o.discountValue / 100);
        discVal = unitDiscount * allowedQuantity;
        if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
          discVal = o.maxDiscountAmount;
        }
      } else {
        discVal = Math.min(o.discountValue * allowedQuantity, item.price * allowedQuantity);
      }
      
      if (discVal > bestDiscount) {
        bestDiscount = discVal;
        bestLabel = o.label || o.name || 'Oferta';
        bestOfferId = o.id;
        finalDiscountedQuantity = allowedQuantity;
      }
    });

    return {
      finalPrice: bestDiscount > 0 && finalDiscountedQuantity > 0 ? Math.max(0, item.price - (bestDiscount / finalDiscountedQuantity)) : item.price, // Exact discounted unit price
      discountAmount: bestDiscount,
      offerLabel: bestLabel,
      offerId: bestOfferId,
      discountedQuantity: finalDiscountedQuantity
    };
  };

  // Apply order-scoped offers (all, customer, birthday) once to the entire subtotal
  const applyOrderOffers = (
    subtotalAfterItemDiscounts: number,
    customer?: AdminCustomer | null
  ) => {
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const applicable = offers.filter(o => {
      if (!o.active) return false;
      const startStr = (o.startDate || '').split('T')[0];
      const endStr = (o.endDate || '').split('T')[0];
      if (startStr && startStr > todayStr) return false;
      if (endStr && endStr < todayStr) return false;
      if (o.scope === 'all') return true;
      if (o.scope === 'tier') {
        if (!customer) return false;
        return customer.tier.toLowerCase() === (o.targetId || '').toLowerCase();
      }
      if (o.scope === 'customer') {
        if (!customer) return false;
        if (customer.dni === o.targetId) return true;
        const clean = (p: string) => {
          let c = (p || '').replace(/\D/g, '');
          if (c.startsWith('549')) c = c.substring(3);
          else if (c.startsWith('54')) c = c.substring(2);
          if (c.startsWith('0')) c = c.substring(1);
          return c;
        };
        return clean(customer.phone) === clean(o.targetId || '');
      }
      if (o.scope === 'birthday') {
        if (!customer?.birthday) return false;
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();
        const parts = customer.birthday.split('-');
        let bMonth: number, bDay: number;
        if (parts.length === 3) {
          // YYYY-MM-DD format
          bMonth = parseInt(parts[1]);
          bDay = parseInt(parts[2]);
        } else if (parts.length === 2) {
          // DD-MM format (as entered from the admin panel)
          bDay = parseInt(parts[0]);
          bMonth = parseInt(parts[1]);
        } else {
          return false;
        }
        return (todayMonth === bMonth && todayDay === bDay);
      }
      return false;
    });

    if (applicable.length === 0) return { discountAmount: 0, offerLabel: null, offerId: null };

    let bestDiscount = 0;
    let bestLabel: string | null = null;
    let bestId: string | null = null;

    applicable.forEach(o => {
      // Validate quota before considering this offer
      let isValid = true;
      if (o.daily_quantity_limit || o.per_customer_daily_limit || o.total_quantity_limit) {
        const todayRedemptions = offerRedemptions.filter(r => r.offer_id === o.id && r.redemption_date === todayStr);
        const usedTodayTotal = todayRedemptions.length; // per order applied, assume 1 usage
        const usedTodayCustomer = customer ? todayRedemptions.filter(r => {
          const clean1 = (r.customer_phone || '').replace(/\\D/g, '');
          const clean2 = (customer.phone || '').replace(/\\D/g, '');
          return clean1 === clean2 && clean1 !== '';
        }).length : 0;
        
        if (o.daily_quantity_limit && usedTodayTotal >= o.daily_quantity_limit) isValid = false;
        if (o.per_customer_daily_limit && usedTodayCustomer >= o.per_customer_daily_limit) isValid = false;
        const totalRedemptions = offerRedemptions.filter(r => r.offer_id === o.id).length;
        if (o.total_quantity_limit && totalRedemptions >= o.total_quantity_limit) isValid = false;
      }
      if (!isValid) return;

      let discVal = 0;
      if (o.discountType === 'percent') {
        discVal = subtotalAfterItemDiscounts * (o.discountValue / 100);
        if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
          discVal = o.maxDiscountAmount;
        }
      } else {
        discVal = o.discountValue; // Fixed discount amount off the entire order!
      }

      if (discVal > bestDiscount) {
        bestDiscount = discVal;
        bestLabel = o.label || o.name || 'Oferta';
        bestId = o.id;
      }
    });

    return {
      discountAmount: Math.min(bestDiscount, subtotalAfterItemDiscounts),
      offerLabel: bestLabel,
      offerId: bestId
    };
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

  const performCashClose = (period: 'diario' | 'semanal' | 'mensual', withdrawals: CashWithdrawal[] = []): CashClose => {
    const now = new Date();
    const fromDate = new Date();
    if (period === 'diario') { fromDate.setHours(0, 0, 0, 0); }
    else if (period === 'semanal') { fromDate.setDate(now.getDate() - 7); fromDate.setHours(0, 0, 0, 0); }
    else { fromDate.setDate(1); fromDate.setHours(0, 0, 0, 0); }

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

    const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);

    const cashPayments = periodOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    const cardPayments = periodOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0);
    const transferPayments = periodOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0);

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
      period,
      totalSales: periodOrders.reduce((s, o) => s + o.total, 0),
      totalOrders: periodOrders.length,
      cashPayments,
      cardPayments,
      transferPayments,
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
      .slice(0, 10);
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
      adminTags, addTag, updateTag, deleteTag,
      stockMap, updateStock, getStock, deductStockForOrder, lowStockProducts, findProductByBarcode, searchProductExternal,
      orders, addAdminOrder, updateOrderStatus, updateOrderMethod, updateOrderPaymentMethod, getOrderTimestamp,
      customers, toggleCurrentAccount, updateCustomerProfile, settleCurrentAccount,
      addManualCustomer, deleteCustomer,
      totalRevenue,
      ordersRevenue,
      posRevenue,
      totalDebtInStreet,
      activeOrdersCount, lowStockCount, totalCustomers,
      currentAccountConfig, updateCurrentAccountConfig,
      storeStatus, updateStoreStatus,
      offers, addOffer, updateOffer, deleteOffer, activeOffers, applyOffersToCartItem, applyOrderOffers, offerRedemptions, addOfferRedemption,
      cashCloses, performCashClose, updateCashCloseOpeningControl,
      cashMovements, addCashMovement, addCashWithdrawal, lastPOSCloseTimestamp, getCashCloseMovements,
      ticketConfig, updateTicketConfig,
      cashRegister, openCashRegister, closeCashRegister, isCashRegisterOpen,
      invoices, addInvoice, updateInvoice,
      billingCustomers, addBillingCustomer, updateBillingCustomer, deleteBillingCustomer,
      getTopSellingProducts, getRevenueByCategory, getRevenueByDay,
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

