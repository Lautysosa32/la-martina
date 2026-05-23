import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { products as catalogProducts, categories as catalogCategories, Product, Category } from '../data/mockData';
import { useProductStore } from '../stores/useProductStore';
import { useAuthStore } from '../stores/useAuthStore';

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
  items: { id: string; name: string; image: string; price: number; quantity: number }[];
  source?: 'pos' | 'whatsapp' | 'web';
  discount?: number;
  discountLabel?: string;
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
  updateCustomerProfile: (oldPhone: string, updates: Partial<{ name: string; phone: string; dni: string; birthday: string; creditLimit: number }>) => void;
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

  // Offers
  offers: Offer[];
  addOffer: (offer: Offer) => void;
  updateOffer: (offerId: string, updates: Partial<Offer>) => void;
  deleteOffer: (offerId: string) => void;
  activeOffers: Offer[];
  applyOffersToCartItem: (item: { productId: string; categoryId?: string; price: number; quantity: number }, customer?: AdminCustomer | null) => { finalPrice: number; discountAmount: number; offerLabel: string | null };
  applyOrderOffers: (subtotalAfterItemDiscounts: number, customer?: AdminCustomer | null) => { discountAmount: number; offerLabel: string | null; offerId: string | null };

  // Cash Close & Movements
  cashCloses: CashClose[];
  performCashClose: (period: 'diario' | 'semanal' | 'mensual', withdrawals?: CashWithdrawal[]) => CashClose;
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
  const [adminProducts, setAdminProducts] = useState<Product[]>(() => {
    // Reset if catalog version changed (removes stale offer data)
    const version = 'v3';
    const storedVersion = localStorage.getItem('la-martina-catalog-version');
    if (storedVersion !== version) {
      // Clear info that has been created, but KEEP products, categories, and tags
      const keysToClear = [
        'la-martina-admin-orders',
        'la-martina-admin-offers',
        'la-martina-admin-cash-closes',
        'la-martina-admin-cashmovements',
        'la-martina-admin-last-pos-close',
        'la-martina-admin-customer-profiles',
        'la-martina-user',
        'cart',
        'la-martina-favorites',
        'la-martina-admin-stock'
      ];
      keysToClear.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('la-martina-catalog-version', version);
    }
    const saved = localStorage.getItem('la-martina-admin-products');
    return saved ? JSON.parse(saved) : catalogProducts;
  });

  // Sincronización con Supabase (Zustand)
  const storeProducts = useProductStore((state) => state.products);
  const storeLoading = useProductStore((state) => state.loading);
  const storeFetch = useProductStore((state) => state.fetchProducts);

  useEffect(() => {
    storeFetch();
  }, [storeFetch]);

  useEffect(() => {
    if (!storeLoading) {
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
  }, [storeProducts, storeLoading]);

  const [adminCategories, setAdminCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-categories');
    return saved ? JSON.parse(saved) : catalogCategories;
  });

  const [adminTags, setAdminTags] = useState<string[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-tags');
    return saved ? JSON.parse(saved) : initialTags;
  });

  const [stockMap, setStockMap] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('la-martina-admin-stock');
    return saved ? JSON.parse(saved) : {};
  });

  const [orders, setOrders] = useState<AdminOrder[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-orders');
    if (saved) {
      // Backfill timestamp for old orders that lack it
      const parsed: AdminOrder[] = JSON.parse(saved);
      return parsed.map(o => {
        if (o.timestamp) return o;
        // Try to parse es-AR date: "DD/MM/YYYY, HH:MM" or with AM/PM
        const str = o.date;
        const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) {
          const timeM = str.match(/(\d{1,2}):(\d{2})/);
          const h = timeM ? parseInt(timeM[1]) : 0;
          const min = timeM ? parseInt(timeM[2]) : 0;
          const isPM = /p\.?\s*m/i.test(str);
          const isAM = /a\.?\s*m/i.test(str);
          let hour = h;
          if (isPM && h < 12) hour = h + 12;
          if (isAM && h === 12) hour = 0;
          return { ...o, timestamp: new Date(+m[3], +m[2] - 1, +m[1], hour, min).getTime() };
        }
        return { ...o, timestamp: new Date(str).getTime() };
      });
    }
    return [];
  });
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, CustomerProfile>>(() => {
    const saved = localStorage.getItem('la-martina-admin-customer-profiles');
    return saved ? JSON.parse(saved) : {};
  });

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
          tier: 'Regular'
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
        c.currentDebt += (o.total - (o.paidAmount || 0));
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
          tier: 'Regular'
        };
      } else {
        const c = customerMap[profile.phone];
        c.hasCurrentAccount = profile.hasCurrentAccount || false;
        c.creditLimit = profile.creditLimit || 50000;
        c.birthday = profile.birthday;
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
      return { ...prev, [phone]: { ...existing, hasCurrentAccount: !existing.hasCurrentAccount } };
    });

    return { success: true };
  };

  const formatPhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('54')) cleaned = cleaned.substring(2);
    return '+54' + cleaned;
  };

  const updateCustomerProfile = (oldPhone: string, updates: Partial<{ name: string; phone: string; dni: string; birthday: string; creditLimit: number }>) => {
    // Find current customer by phone
    const targetCustomer = customers.find(c => c.phone === oldPhone);
    if (!targetCustomer) return;

    const newPhone = updates.phone ? formatPhone(updates.phone) : oldPhone;

    // 1. Update orders if phone, name, or DNI changed
    if (newPhone !== oldPhone || updates.name || updates.dni) {
      setOrders(prev => prev.map(o => {
        if (o.phone === oldPhone) {
          return {
            ...o,
            phone: newPhone,
            customer: updates.name || o.customer,
            dni: updates.dni || o.dni
          };
        }
        return o;
      }));
    }

    // 2. Update profiles (DNI, birthday, and CC status)
    setCustomerProfiles(prev => {
      const newProfiles = { ...prev };
      const currentProfile = newProfiles[oldPhone] || { phone: oldPhone, hasCurrentAccount: false };

      if (newPhone !== oldPhone) {
        delete newProfiles[oldPhone];
        newProfiles[newPhone] = { ...currentProfile, ...updates, phone: newPhone };
      } else {
        newProfiles[oldPhone] = { ...currentProfile, ...updates };
      }
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
            return { ...o, paymentStatus: 'Pagado' as const, paidAmount: o.total };
          } else {
            const newPaid = (o.paidAmount || 0) + remainingToSettle;
            remainingToSettle = 0;
            return { ...o, paidAmount: newPaid };
          }
        }
        return o;
      });

      // 2. Record the payment in Cash Movements for today's physical box
      addCashMovement({
        type: 'Ingreso',
        description: `Pago Cta. Corriente (${method}) - ${unpaidOrders[0].customer}`,
        cashier: 'Admin',
        amount: paymentAmount
      });

      return updatedOrders;
    });
  };

  // ─── Manual Customer CRUD ─────────────────────────────────
  const addManualCustomer = (data: { nombre: string; apellido: string; telefono: string; direccion: string; dni?: string }) => {
    const phone = formatPhone(data.telefono);
    setCustomerProfiles(prev => ({
      ...prev,
      [phone]: {
        dni: data.dni || '',
        phone,
        hasCurrentAccount: false,
        nombre: data.nombre,
        apellido: data.apellido,
        direccion: data.direccion,
        isManual: true
      }
    }));
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
    return { success: true };
  };

  const [offers, setOffers] = useState<Offer[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-offers');
    return saved ? JSON.parse(saved) : [];
  });

  const [cashCloses, setCashCloses] = useState<CashClose[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-cash-closes');
    return saved ? JSON.parse(saved) : [];
  });

  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() => {
    const saved = localStorage.getItem('la-martina-admin-cashmovements');
    return saved ? JSON.parse(saved) : [];
  });

  const [lastPOSCloseTimestamp, setLastPOSCloseTimestamp] = useState<number>(() => {
    const saved = localStorage.getItem('la-martina-admin-last-pos-close');
    return saved ? parseInt(saved) : 0;
  });

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
  const [ticketConfig, setTicketConfig] = useState<TicketConfig>(() => {
    const saved = localStorage.getItem('la-martina-ticket-config');
    return saved ? { ...defaultTicketConfig, ...JSON.parse(saved) } : defaultTicketConfig;
  });
  const updateTicketConfig = (updates: Partial<TicketConfig>) => {
    setTicketConfig(prev => ({ ...prev, ...updates }));
  };

  // ─── Cash Register ────────────────────────────────────────
  const [cashRegister, setCashRegister] = useState<CashRegister>(() => {
    const saved = localStorage.getItem('la-martina-cash-register');
    return saved ? JSON.parse(saved) : { isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' };
  });
  const isCashRegisterOpen = cashRegister.isOpen;
  const openCashRegister = (amount: number, user: string = 'Admin') => {
    const reg: CashRegister = { isOpen: true, initialAmount: amount, openedBy: user, openedAt: new Date().toISOString() };
    setCashRegister(reg);
  };
  const closeCashRegister = () => {
    setCashRegister({ isOpen: false, initialAmount: 0, openedBy: '', openedAt: '' });
  };

  // ─── Invoices ─────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem('la-martina-invoices');
    return saved ? JSON.parse(saved) : [];
  });
  const [billingCustomers, setBillingCustomers] = useState<BillingCustomer[]>(() => {
    const saved = localStorage.getItem('la-martina-billing-customers');
    return saved ? JSON.parse(saved) : [];
  });

  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'folio'>): Invoice => {
    const folio = String(invoices.length + 1).padStart(6, '0');
    const invoice: Invoice = { ...invoiceData, id: `INV-${Date.now()}`, folio };
    setInvoices(prev => [invoice, ...prev]);
    return invoice;
  };
  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));
  };
  const addBillingCustomer = (data: Omit<BillingCustomer, 'id'>) => {
    setBillingCustomers(prev => [...prev, { ...data, id: `BC-${Date.now()}` }]);
  };
  const updateBillingCustomer = (id: string, updates: Partial<BillingCustomer>) => {
    setBillingCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };
  const deleteBillingCustomer = (id: string) => {
    setBillingCustomers(prev => prev.filter(c => c.id !== id));
  };

  // Persistence
  useEffect(() => { localStorage.setItem('la-martina-admin-products', JSON.stringify(adminProducts)); }, [adminProducts]);
  useEffect(() => { localStorage.setItem('la-martina-admin-categories', JSON.stringify(adminCategories)); }, [adminCategories]);
  useEffect(() => { localStorage.setItem('la-martina-admin-tags', JSON.stringify(adminTags)); }, [adminTags]);
  useEffect(() => { localStorage.setItem('la-martina-admin-stock', JSON.stringify(stockMap)); }, [stockMap]);
  useEffect(() => { localStorage.setItem('la-martina-admin-orders', JSON.stringify(orders)); }, [orders]);
  useEffect(() => { localStorage.setItem('la-martina-admin-offers', JSON.stringify(offers)); }, [offers]);
  useEffect(() => { localStorage.setItem('la-martina-admin-cash-closes', JSON.stringify(cashCloses)); }, [cashCloses]);
  useEffect(() => { localStorage.setItem('la-martina-admin-cashmovements', JSON.stringify(cashMovements)); }, [cashMovements]);
  useEffect(() => { localStorage.setItem('la-martina-admin-last-pos-close', lastPOSCloseTimestamp.toString()); }, [lastPOSCloseTimestamp]);
  useEffect(() => { localStorage.setItem('la-martina-admin-customer-profiles', JSON.stringify(customerProfiles)); }, [customerProfiles]);
  useEffect(() => { localStorage.setItem('la-martina-ticket-config', JSON.stringify(ticketConfig)); }, [ticketConfig]);
  useEffect(() => { localStorage.setItem('la-martina-cash-register', JSON.stringify(cashRegister)); }, [cashRegister]);
  useEffect(() => { localStorage.setItem('la-martina-invoices', JSON.stringify(invoices)); }, [invoices]);
  useEffect(() => { localStorage.setItem('la-martina-billing-customers', JSON.stringify(billingCustomers)); }, [billingCustomers]);

  // Handlers: Products
  const addProduct = (p: Product) => { setAdminProducts(prev => [...prev, p]); if (!stockMap[p.id]) updateStock(p.id, 0); };
  const updateProduct = (id: string, up: Partial<Product>) => setAdminProducts(prev => prev.map(p => p.id === id ? { ...p, ...up } : p));
  const deleteProduct = (id: string) => {
    setAdminProducts(prev => prev.filter(p => p.id !== id));
    setStockMap(prev => { const n = { ...prev }; delete n[id]; return n; });
  };
  const bulkUpdatePrice = (ids: string[], pct: number) => {
    const m = 1 + (pct / 100);
    setAdminProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, price: Math.round(p.price * m), originalPrice: p.originalPrice ? Math.round(p.originalPrice * m) : p.originalPrice } : p));
  };

  const bulkAddProducts = (newProds: Product[], stockUpdates: Record<string, number>) => {
    setAdminProducts(prev => [...prev, ...newProds]);
    setStockMap(prev => ({ ...prev, ...stockUpdates }));
  };

  // Handlers: Categories
  const addCategory = (c: Category) => setAdminCategories(prev => [...prev, c]);
  const updateCategory = (id: string, up: Partial<Category>) => {
    // Si cambia el ID (slug), hay que actualizar todos los productos que lo usan
    if (up.id && up.id !== id) {
      setAdminProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: up.id! } : p));
    }
    setAdminCategories(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };
  const deleteCategory = (id: string) => {
    setAdminCategories(prev => prev.filter(c => c.id !== id));
    // Opcional: mover productos a una categoría 'sin-categoria'
    setAdminProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: 'general' } : p));
  };

  // Handlers: Tags
  const addTag = (t: string) => setAdminTags(prev => prev.includes(t) ? prev : [...prev, t]);
  const updateTag = (oldT: string, newT: string) => {
    setAdminTags(prev => prev.map(t => t === oldT ? newT : t));
    setAdminProducts(prev => prev.map(p => p.badge === oldT ? { ...p, badge: newT } : p));
  };
  const deleteTag = (t: string) => {
    setAdminTags(prev => prev.filter(tag => tag !== t));
    setAdminProducts(prev => prev.map(p => p.badge === t ? { ...p, badge: '' } : p));
  };

  const updateStock = (pid: string, s: number) => setStockMap(prev => ({ ...prev, [pid]: Math.max(0, s) }));
  const getStock = (pid: string): number => {
    if (stockMap[pid] !== undefined) {
      return stockMap[pid];
    }
    const prod = adminProducts.find(p => p.id === pid);
    return prod ? (prod.stock ?? 0) : 0;
  };
  const deductStockForOrder = (orderItems: { id: string; quantity: number }[]): { success: boolean; insufficientItems: { id: string; name: string; requested: number; available: number }[] } => {
    const insufficient: { id: string; name: string; requested: number; available: number }[] = [];
    // First pass: validate all items
    for (const item of orderItems) {
      const available = stockMap[item.id] ?? 0;
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
        next[item.id] = Math.max(0, (next[item.id] ?? 0) - item.quantity);
      }
      return next;
    });
    return { success: true, insufficientItems: [] };
  };
  const lowStockProducts = adminProducts.map(p => ({ ...p, stock: stockMap[p.id] ?? 0 })).filter(p => p.stock < (p.minStock ?? 15)).sort((a, b) => a.stock - b.stock);

  // Barcode lookup
  const findProductByBarcode = (barcode: string): Product | undefined => {
    if (!barcode) return undefined;
    return adminProducts.find(p => p.barcode === barcode);
  };

  const searchProductExternal = async (barcode: string): Promise<Partial<Product> | null> => {
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
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
      return null;
    } catch (error) {
      console.error("Error buscando producto externo:", error);
      return null;
    }
  };

  const addAdminOrder = (o: AdminOrder) => {
    setOrders(prev => [o, ...prev]);
    // Don't deduct stock for generic/common products
    o.items.forEach(i => {
      if (i.id !== 'PRODUCTO_COMUN' && !i.id.startsWith('GENERICO-')) {
        updateStock(i.id, (stockMap[i.id] ?? 0) - i.quantity);
      }
    });
  };
  const updateOrderStatus = (id: string, s: AdminOrder['status']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: s } : o));
    // Sincronizar con el perfil del cliente (usando Zustand directamente)
    useAuthStore.getState().updateOrderStatus(id, s);
  };
  const updateOrderMethod = (id: string, method: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, method } : o));
  };
  const updateOrderPaymentMethod = (id: string, paymentMethod: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentMethod } : o));
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
  const updateOffer = (id: string, up: Partial<Offer>) => setOffers(prev => prev.map(o => o.id === id ? { ...o, ...up } : o));
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

    if (applicable.length === 0) return { finalPrice: item.price, discountAmount: 0, offerLabel: null };

    // Use the best (highest discount) applicable offer
    let bestDiscount = 0;
    let bestLabel: string | null = null;
    applicable.forEach(o => {
      let discVal = 0;
      if (o.discountType === 'percent') {
        discVal = item.price * (o.discountValue / 100);
        if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
          discVal = o.maxDiscountAmount;
        }
      } else {
        discVal = Math.min(o.discountValue, item.price);
      }
      
      if (discVal > bestDiscount) {
        bestDiscount = discVal;
        bestLabel = o.label || o.name || 'Oferta';
      }
    });

    return {
      finalPrice: Math.max(0, item.price - bestDiscount),
      discountAmount: bestDiscount,
      offerLabel: bestLabel
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

    // Collect movements in this period (since last close)
    const periodMovements = cashMovements.filter(m => m.timestamp >= lastPOSCloseTimestamp);
    const movementIds = periodMovements.map(m => m.id);

    const periodOrders = orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= from && ts <= to && o.status !== 'Cancelado';
    });

    const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);

    const close: CashClose = {
      id: 'CC_' + Date.now(),
      date: now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      period,
      totalSales: periodOrders.reduce((s, o) => s + o.total, 0),
      totalOrders: periodOrders.length,
      cashPayments: periodOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0),
      cardPayments: periodOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0),
      transferPayments: periodOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0),
      closedAt: now.toISOString(),
      withdrawals,
      totalWithdrawals,
      movementIds,
      initialAmount: cashRegister.initialAmount
    };
    setCashCloses(prev => [close, ...prev]);
    setLastPOSCloseTimestamp(Date.now());
    // Close the cash register
    closeCashRegister();
    return close;
  };

  const addCashMovement = (mov: Omit<CashMovement, 'id' | 'timestamp'>) => {
    const newMov: CashMovement = {
      ...mov,
      id: `MOV-${Date.now()}`,
      timestamp: Date.now()
    };
    setCashMovements(prev => [newMov, ...prev]);
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
      offers, addOffer, updateOffer, deleteOffer, activeOffers, applyOffersToCartItem, applyOrderOffers,
      cashCloses, performCashClose,
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

