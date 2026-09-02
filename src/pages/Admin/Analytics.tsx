import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import type { Offer, CashClose, CashMovement } from '../../context/AdminContext';
import { MovementDetailModal } from '../../components/MovementDetailModal';
import { TicketPrinter, TicketData } from '../../components/TicketPrinter';
import { AdminPeriodSelector, getPeriodRange } from '../../components/AdminPeriodSelector';
import { useAuthStore } from '../../stores/useAuthStore';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta Corriente',
};

const PAYMENT_BADGE_STYLES: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  card: 'bg-blue-100 text-blue-700',
  transfer: 'bg-purple-100 text-purple-700',
  cuenta_corriente: 'bg-orange-100 text-orange-700',
};

const CATEGORY_COLORS: Record<string, string> = {
  carnes: "#DC2626",      // rojo fuerte
  lacteos: "#06B6D4",     // celeste/cyan
  limpieza: "#8B5CF6",   // violeta
  perfumeria: "#EC4899", // rosa
  bebidas: "#2563EB",    // azul
  almacen: "#F59E0B",    // amarillo/ámbar
  otros: "#111827"       // negro/gris oscuro
};

const getCategoryColor = (categoryName: string): string => {
  const normalized = categoryName.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return CATEGORY_COLORS[normalized] || CATEGORY_COLORS['otros'];
};

export const Analytics: React.FC = () => {
  const {
    adminProducts, adminCategories, orders, totalRevenue, activeOffers, offers,
    addOffer, deleteOffer, cashCloses, performCashClose, getCashCloseMovements,
    getTopSellingProducts, getRevenueByCategory, getRevenueByDay, getOrderTimestamp,
    formatCurrency, customers, cashMovements, offerRedemptions, expenses, isCashRegisterOpen
  } = useAdmin();

  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  const [period, setPeriod] = useState('Últimos 30 días');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById('admin-header-portal'));
  }, []);

  // Enforce Últimos 30 días period for common employees
  useEffect(() => {
    if (employeeProfile?.role === 'employee' && period !== 'Últimos 30 días') {
      setPeriod('Últimos 30 días');
    }
  }, [employeeProfile, period]);
  
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showCloseResult, setShowCloseResult] = useState<CashClose | null>(null);
  const [offerForm, setOfferForm] = useState({
    scope: 'product' as Offer['scope'],
    targetId: '',
    discountType: 'percent' as Offer['discountType'],
    discountValue: '',
    maxDiscountAmount: '',
    label: 'Oferta',
    endDate: '',
    daily_quantity_limit: '',
    per_customer_daily_limit: '',
    total_quantity_limit: ''
  });
  const [closeSortOrder, setCloseSortOrder] = useState<'date-desc' | 'date-asc' | 'revenue-desc' | 'revenue-asc'>('date-desc');

  // Cash close modal activity state (default to 'todos', separated into 'local' and 'pedidos')
  const [closeActivityTab, setCloseActivityTab] = useState<'todos' | 'local' | 'pedidos' | 'otros'>('todos');
  const [closeExpandedRowId, setCloseExpandedRowId] = useState<string | null>(null);
  const [activeCloseTicket, setActiveCloseTicket] = useState<TicketData | null>(null);

  const analyticsParams = useMemo(() => {
    return getPeriodRange(period, customRange);
  }, [period, customRange]);

  const topProducts = getTopSellingProducts(analyticsParams);
  const dailyRevenue = getRevenueByDay(analyticsParams);
  const maxRev = Math.max(...dailyRevenue.map(d => d.revenue), 1);

  // Filter orders by the selected period (applying the time filter perfectly)
  const filteredOrdersForPeriod = useMemo(() => {
    return orders.filter(o => {
      const t = getOrderTimestamp(o);
      return t >= analyticsParams.from && t <= analyticsParams.to;
    });
  }, [orders, analyticsParams, getOrderTimestamp]);

  // Datos completos de ventas y movimientos del cierre actualmente abierto
  const closePeriodData = useMemo(() => {
    if (!showCloseResult) {
      return { 
        allUnifiedItems: [],
        periodOrders: [],
        localOrders: [],
        pedidoOrders: [],
        otherMovements: [], 
        hasOtherMovements: false, 
        totalSalesSum: 0,
        totalLocalSales: 0,
        totalPedidoSales: 0,
        totalOtherMovements: 0
      };
    }

    const closeTs = new Date(showCloseResult.closedAt).getTime();
    const prevClose = cashCloses
      .filter(c => c.id !== showCloseResult.id && new Date(c.closedAt).getTime() < closeTs)
      .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())[0];
    const prevTs = prevClose ? new Date(prevClose.closedAt).getTime() : 0;

    // Todas las ventas u órdenes correspondientes al período de este cierre
    const pOrders = orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= prevTs && ts <= closeTs && o.status !== 'Cancelado';
    }).sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));

    // Separar órdenes de local y pedidos (web/envío/retiro)
    const isLocalOrder = (o: any) => o.method === 'Caja Fija' || (o.id && String(o.id).startsWith('LOC-'));
    const localOrders = pOrders.filter(isLocalOrder);
    const pedidoOrders = pOrders.filter(o => !isLocalOrder(o));
    const totalLocalSales = localOrders.reduce((s, o) => s + o.total, 0);
    const totalPedidoSales = pedidoOrders.reduce((s, o) => s + o.total, 0);

    // Movimientos de caja registrados
    const cMovs = getCashCloseMovements(showCloseResult.id);

    // Otros movimientos de caja (cobros de cuenta corriente, retiros o egresos) que no son órdenes ya listadas
    const oMovs = cMovs.filter(m => {
      const isLinkedToOrder = pOrders.some(o => o.id === m.orderId || (o.id && m.description.includes(o.id)));
      return !isLinkedToOrder;
    });

    // Mapear órdenes a items unificados diferenciando Ventas de Local vs Pedidos
    const unifiedOrders = pOrders.map(o => {
      const ts = getOrderTimestamp(o);
      const isLocal = isLocalOrder(o);
      const relMov = cMovs.find(m => m.orderId === o.id || (o.id && m.description.includes(o.id)));
      const paymentMethodKey = o.paymentMethod || 'cash';
      const paymentLabel = PAYMENT_LABELS[paymentMethodKey] || paymentMethodKey;
      
      const itemsCount = o.items?.length ? `${o.items.length} ítems` : '1 ítem';
      const custSuffix = o.customer && o.customer !== 'Cliente Local' ? ` - ${o.customer}` : '';

      let title = '';
      if (isLocal) {
        title = relMov?.description || `Venta Local (${paymentLabel}) - ${itemsCount}${custSuffix}`;
      } else {
        const methodLabel = o.method === 'Envío' ? 'Envío' : o.method === 'Retiro' ? 'Retiro' : 'Web';
        title = `Pedido #${o.id} · ${methodLabel} (${paymentLabel}) - ${itemsCount}${custSuffix}`;
      }

      const cashier = relMov?.cashier || ((o as any).cashier || 'Lautaro');
      const timeStr = new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = o.date || new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      return {
        id: o.id,
        type: 'Ingreso' as const,
        saleCategory: (isLocal ? 'local' : 'pedido') as 'local' | 'pedido' | 'otro',
        badgeText: isLocal ? 'LOCAL' : 'PEDIDO',
        badgeStyle: isLocal ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/60' : 'bg-blue-100 text-blue-800 border border-blue-200/60',
        isVenta: true,
        title,
        description: title,
        timestamp: ts,
        timeStr,
        dateStr,
        cashier,
        amount: o.total,
        paymentMethod: paymentMethodKey,
        paymentLabel,
        customer: o.customer,
        orderId: o.id,
        orderMethod: isLocal ? 'Caja Fija (Local)' : (o.method || 'Web'),
        items: o.items || []
      };
    });

    // Mapear otros movimientos a items unificados
    const unifiedOther = oMovs.map(m => {
      const paymentMethodMatch = m.description.match(/\(([^)]+)\)/);
      const paymentKey = paymentMethodMatch ? paymentMethodMatch[1].toLowerCase() : 'cash';
      const paymentLabel = PAYMENT_LABELS[paymentKey] || (paymentMethodMatch ? paymentMethodMatch[1] : 'Efectivo');
      const timeStr = new Date(m.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(m.timestamp).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const isIngreso = m.type === 'Ingreso';
      const isRetiro = m.type === 'Retiro';

      return {
        id: m.id,
        type: m.type as 'Ingreso' | 'Egreso' | 'Retiro',
        saleCategory: 'otro' as const,
        badgeText: isIngreso ? 'INGRESO' : isRetiro ? 'RETIRO' : 'EGRESO',
        badgeStyle: isIngreso ? 'bg-amber-100 text-amber-800 border border-amber-200/60' : isRetiro ? 'bg-orange-100 text-orange-800 border border-orange-200/60' : 'bg-red-100 text-red-800 border border-red-200/60',
        isVenta: false,
        title: m.description,
        description: m.description,
        timestamp: m.timestamp,
        timeStr,
        dateStr,
        cashier: m.cashier || 'Lautaro',
        amount: m.amount,
        paymentMethod: paymentKey,
        paymentLabel,
        customer: '',
        orderId: undefined,
        orderMethod: undefined,
        items: []
      };
    });

    // Combinar todos ordenados cronológicamente descendente
    const allUnifiedItems = [...unifiedOrders, ...unifiedOther].sort((a, b) => b.timestamp - a.timestamp);

    // Sumar otros movimientos netos
    const totalOtherMovements = oMovs.reduce((s, m) => m.type === 'Ingreso' ? s + m.amount : s - m.amount, 0);

    return {
      allUnifiedItems,
      periodOrders: pOrders,
      localOrders,
      pedidoOrders,
      otherMovements: oMovs,
      hasOtherMovements: oMovs.length > 0,
      totalSalesSum: pOrders.reduce((sum, o) => sum + o.total, 0),
      totalLocalSales,
      totalPedidoSales,
      totalOtherMovements
    };
  }, [showCloseResult, orders, cashCloses, getCashCloseMovements, getOrderTimestamp]);

  // Calculate revenue for each of the 6 fixed categories in the period
  const catData = useMemo(() => {
    const revenueMap: Record<string, number> = {
      carnes: 0,
      lacteos: 0,
      limpieza: 0,
      perfumeria: 0,
      bebidas: 0,
      almacen: 0
    };

    filteredOrdersForPeriod.forEach(o => {
      o.items.forEach(item => {
        const prod = adminProducts.find(p => p.id === item.id);
        const rawCatId = prod?.categoryId || '';
        // Normalizamos las categorías no encontradas o externas al grupo a 'almacen'
        const catId = Object.hasOwnProperty.call(revenueMap, rawCatId) ? rawCatId : 'almacen';
        revenueMap[catId] += item.price * item.quantity;
      });
    });

    const totalRevenueInPeriod = Object.values(revenueMap).reduce((s, r) => s + r, 0);

    const categoriesList = [
      { id: 'carnes', title: 'Carnes' },
      { id: 'lacteos', title: 'Lácteos' },
      { id: 'limpieza', title: 'Limpieza' },
      { id: 'perfumeria', title: 'Perfumería' },
      { id: 'bebidas', title: 'Bebidas' },
      { id: 'almacen', title: 'Almacén' }
    ];

    return categoriesList.map(cat => {
      const revenue = revenueMap[cat.id];
      const percent = totalRevenueInPeriod > 0 ? Math.round((revenue / totalRevenueInPeriod) * 100) : 0;
      return {
        id: cat.id,
        category: cat.title,
        revenue,
        percent
      };
    });
  }, [filteredOrdersForPeriod, adminProducts]);

  const totalCatRevenue = useMemo(() => {
    return catData.reduce((s, c) => s + c.revenue, 0);
  }, [catData]);

  // Payment methods breakdown: ingresos desde órdenes + egresos desde tabla expenses
  const paymentMethodData = useMemo(() => {
    // --- Ingresos (órdenes no canceladas en el período) ---
    const filteredOrders = orders.filter(o => {
      const t = getOrderTimestamp(o);
      return t >= analyticsParams.from && t <= analyticsParams.to;
    }).filter(o => o.status !== 'Cancelado');

    let cashIn = filteredOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    let cardIn = filteredOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0);
    let transferIn = filteredOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0);
    
    // Ventas CC en el periodo
    const ccSales = filteredOrders.filter(o => o.paymentMethod === 'cuenta_corriente').reduce((s, o) => s + o.total, 0);

    // --- Cobros de Cuenta Corriente (Clientes) en el período ---
    const filteredMovements = cashMovements.filter(m => {
      const ts = m.timestamp;
      return ts >= analyticsParams.from && ts <= analyticsParams.to;
    });

    const ccCollectionsCash = filteredMovements.filter(m => m.type === 'Ingreso' && m.description.includes('Pago Cta. Corriente (Efectivo)')).reduce((s, m) => s + m.amount, 0);
    const ccCollectionsCard = filteredMovements.filter(m => m.type === 'Ingreso' && m.description.includes('Pago Cta. Corriente (Tarjeta)')).reduce((s, m) => s + m.amount, 0);
    const ccCollectionsTransfer = filteredMovements.filter(m => m.type === 'Ingreso' && m.description.includes('Pago Cta. Corriente (Transferencia)')).reduce((s, m) => s + m.amount, 0);

    // --- Egresos en el período ---
    const filteredExpenses = expenses.filter(e => {
      const ts = new Date(e.last_activity_at || e.created_at).getTime();
      return ts >= analyticsParams.from && ts <= analyticsParams.to && e.status === 'active';
    });

    // Para efectivo, tarjeta y transferencia, sumamos los egresos creados con ese método 
    // Y los egresos de CC que fueron cancelados con ese método.
    const cashExpenses = filteredExpenses.filter(e => e.payment_method === 'cash' || (e.payment_method === 'cuenta_corriente' && e.payment_status === 'paid' && e.cancellation_method === 'cash')).reduce((s, e) => s + e.amount, 0);
    const cardExpenses = filteredExpenses.filter(e => e.payment_method === 'card' || (e.payment_method === 'cuenta_corriente' && e.payment_status === 'paid' && e.cancellation_method === 'card')).reduce((s, e) => s + e.amount, 0);
    const transferExpenses = filteredExpenses.filter(e => e.payment_method === 'transfer' || (e.payment_method === 'cuenta_corriente' && e.payment_status === 'paid' && e.cancellation_method === 'transfer')).reduce((s, e) => s + e.amount, 0);
    
    // Compras a cuenta corriente (histórico en el periodo)
    const ccPurchases = filteredExpenses.filter(e => e.payment_method === 'cuenta_corriente').reduce((s, e) => s + e.amount, 0);

    // Pendientes globales (No filtrados por fecha, muestran la realidad actual)
    const currentCustomerDebt = customers.reduce((s, c) => s + (c.currentDebt || 0), 0);
    const currentSupplierDebt = expenses.filter(e => e.status === 'active' && e.payment_method === 'cuenta_corriente' && e.payment_status === 'pending').reduce((s, e) => s + e.amount, 0);

    return {
      cash:     { sales: cashIn, collections: ccCollectionsCash, expenses: cashExpenses, net: cashIn + ccCollectionsCash - cashExpenses },
      card:     { sales: cardIn, collections: ccCollectionsCard, expenses: cardExpenses, net: cardIn + ccCollectionsCard - cardExpenses },
      transfer: { sales: transferIn, collections: ccCollectionsTransfer, expenses: transferExpenses, net: transferIn + ccCollectionsTransfer - transferExpenses },
      cc:       { sales: ccSales, purchases: ccPurchases, pendingCollections: currentCustomerDebt, pendingPayments: currentSupplierDebt },
      totalIn: cashIn + cardIn + transferIn + ccSales, // Sólo ventas para el revenue (excluye cobranzas CC para no duplicar en otras métricas)
      totalOut: cashExpenses + cardExpenses + transferExpenses + ccPurchases
    };
  }, [orders, expenses, cashMovements, customers, analyticsParams, getOrderTimestamp]);

  // Period comparison: current vs previous equivalent period
  const periodComparison = useMemo(() => {
    const currentFrom = analyticsParams.from;
    const currentTo = analyticsParams.to;
    const duration = currentTo - currentFrom;
    const prevFrom = currentFrom - duration;
    const prevTo = currentFrom;

    // 1. Revenues (Orders total excluding canceled)
    const currentRevenue = orders.filter(o => { 
      const t = getOrderTimestamp(o); 
      return t >= currentFrom && t <= currentTo && o.status !== 'Cancelado'; 
    }).reduce((s, o) => s + o.total, 0);

    const previousRevenue = orders.filter(o => { 
      const t = getOrderTimestamp(o); 
      return t >= prevFrom && t <= prevTo && o.status !== 'Cancelado'; 
    }).reduce((s, o) => s + o.total, 0);

    const revenueDiff = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

    // 2. Expenses from the expenses table (active only)
    const currentExpenses = expenses.filter(e => {
      const ts = new Date(e.created_at).getTime();
      return ts >= currentFrom && ts <= currentTo && e.status === 'active';
    }).reduce((s, e) => s + e.amount, 0);

    const previousExpenses = expenses.filter(e => {
      const ts = new Date(e.created_at).getTime();
      return ts >= prevFrom && ts <= prevTo && e.status === 'active';
    }).reduce((s, e) => s + e.amount, 0);

    const expensesDiff = previousExpenses > 0 ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 : null;

    // 3. Balance / Net Result
    const currentResult = currentRevenue - currentExpenses;
    const previousResult = previousRevenue - previousExpenses;
    
    let resultDiff: number | null = null;
    if (previousResult !== 0) {
      resultDiff = ((currentResult - previousResult) / Math.abs(previousResult)) * 100;
    }

    // Net Profit Margin: (Result / Revenue) * 100
    const netMargin = currentRevenue > 0 ? (currentResult / currentRevenue) * 100 : 0;

    return {
      revenue: { current: currentRevenue, previous: previousRevenue, diff: revenueDiff },
      expenses: { current: currentExpenses, previous: previousExpenses, diff: expensesDiff },
      result: { current: currentResult, previous: previousResult, diff: resultDiff, margin: netMargin }
    };
  }, [orders, cashMovements, analyticsParams, getOrderTimestamp]);

  const handleAddOffer = () => {
    if (!offerForm.discountValue || !offerForm.endDate) return;
    const discountVal = parseFloat(offerForm.discountValue);
    
    // Determine the name based on the scope if empty
    let calculatedName = offerForm.label || 'Oferta';
    if (!offerForm.label) {
      if (offerForm.scope === 'product') {
        const prod = adminProducts.find(p => p.id === offerForm.targetId);
        calculatedName = prod ? `Descuento ${prod.name}` : 'Descuento Producto';
      } else if (offerForm.scope === 'category') {
        const cat = adminCategories.find(c => c.id === offerForm.targetId);
        calculatedName = `Descuento Categoría ${cat ? cat.title : offerForm.targetId}`;
      } else if (offerForm.scope === 'customer') {
        const cust = customers.find(c => c.dni === offerForm.targetId || c.phone === offerForm.targetId);
        calculatedName = `Descuento Especial ${cust ? cust.name : 'Cliente'}`;
      } else if (offerForm.scope === 'birthday') {
        calculatedName = 'Descuento de Cumpleaños';
      } else if (offerForm.scope === 'all') {
        calculatedName = 'Descuento Global Local';
      }
    }

    const offer: Offer = {
      id: 'OF_' + Date.now(),
      name: calculatedName,
      description: '',
      scope: offerForm.scope,
      targetId: offerForm.targetId,
      productId: offerForm.scope === 'product' ? offerForm.targetId : undefined,
      discountType: offerForm.discountType,
      discountPercent: offerForm.discountType === 'percent' ? discountVal : 0, // legacy
      discountValue: discountVal,
      maxDiscountAmount: offerForm.maxDiscountAmount ? parseFloat(offerForm.maxDiscountAmount) : undefined,
      startDate: (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
      endDate: offerForm.endDate,
      active: true,
      label: offerForm.label || calculatedName,
      daily_quantity_limit: offerForm.daily_quantity_limit ? parseInt(offerForm.daily_quantity_limit) : null,
      per_customer_daily_limit: offerForm.per_customer_daily_limit ? parseInt(offerForm.per_customer_daily_limit) : null,
      total_quantity_limit: offerForm.total_quantity_limit ? parseInt(offerForm.total_quantity_limit) : null,
      limit_strategy: 'discount_only'
    };
    addOffer(offer);
    setOfferForm({
      scope: 'product',
      targetId: '',
      discountType: 'percent',
      discountValue: '',
      maxDiscountAmount: '',
      label: 'Oferta',
      endDate: '',
      daily_quantity_limit: '',
      per_customer_daily_limit: '',
      total_quantity_limit: ''
    });
    setShowOfferModal(false);
  };


  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {portalTarget && employeeProfile?.role !== 'employee' && createPortal(
        <AdminPeriodSelector 
          period={period} 
          setPeriod={setPeriod} 
          customRange={customRange} 
          setCustomRange={setCustomRange} 
        />,
        portalTarget
      )}

      {/* Financial Comparison Grid Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Ingresos */}
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between h-full transition-all hover:shadow-md hover:border-outline-variant/20">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.18em]">Ingresos del Período</p>
              <p className="text-3xl font-black text-on-background">${formatCurrency(periodComparison.revenue.current)}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <span className="material-symbols-outlined text-[24px]">trending_up</span>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-outline-variant/5 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Período Anterior</p>
              <p className="text-sm font-bold text-on-surface-variant/80">${formatCurrency(periodComparison.revenue.previous)}</p>
            </div>
            
            {periodComparison.revenue.diff !== null ? (
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
                periodComparison.revenue.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <span className="material-symbols-outlined text-[16px]">
                  {periodComparison.revenue.diff >= 0 ? 'arrow_upward' : 'arrow_downward'}
                </span>
                <span>
                  {periodComparison.revenue.diff >= 0 ? '+' : ''}{periodComparison.revenue.diff.toFixed(1)}%
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-bold text-on-surface-variant/50 bg-surface-container-low px-2.5 py-1.5 rounded-lg">
                Sin Comparativa
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Egresos */}
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col justify-between h-full transition-all hover:shadow-md hover:border-outline-variant/20">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.18em]">Egresos del Período</p>
              <p className="text-3xl font-black text-on-background">${formatCurrency(periodComparison.expenses.current)}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
              <span className="material-symbols-outlined text-[24px]">trending_down</span>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-outline-variant/5 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Período Anterior</p>
              <p className="text-sm font-bold text-on-surface-variant/80">${formatCurrency(periodComparison.expenses.previous)}</p>
            </div>
            
            {periodComparison.expenses.diff !== null ? (
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
                periodComparison.expenses.diff <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <span className="material-symbols-outlined text-[16px]">
                  {periodComparison.expenses.diff <= 0 ? 'arrow_downward' : 'arrow_upward'}
                </span>
                <span>
                  {periodComparison.expenses.diff >= 0 ? '+' : ''}{periodComparison.expenses.diff.toFixed(1)}%
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-bold text-on-surface-variant/50 bg-surface-container-low px-2.5 py-1.5 rounded-lg">
                Sin Comparativa
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Balance / Resultado Neto */}
        {(() => {
          const isPositive = periodComparison.result.current >= 0;
          return (
            <div className={`p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between h-full transition-all hover:shadow-md ${
              isPositive 
                ? 'bg-gradient-to-br from-emerald-50/50 via-green-50/20 to-white border-emerald-500/15' 
                : 'bg-gradient-to-br from-rose-50/50 via-red-50/20 to-white border-rose-500/15'
            }`}>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.18em]">Balance / Resultado</p>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                      isPositive ? 'bg-emerald-600/10 text-emerald-700' : 'bg-rose-600/10 text-rose-700'
                    }`}>
                      {isPositive ? 'Superávit' : 'Déficit'}
                    </span>
                  </div>
                  <p className={`text-3xl font-black ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isPositive ? '' : '-'}${formatCurrency(Math.abs(periodComparison.result.current))}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  isPositive ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                }`}>
                  <span className="material-symbols-outlined text-[24px]">
                    {isPositive ? 'account_balance_wallet' : 'money_off'}
                  </span>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-outline-variant/10 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Margen Neto</p>
                  <p className={`text-sm font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {periodComparison.result.margin.toFixed(1)}%
                  </p>
                </div>
                
                {periodComparison.result.diff !== null ? (
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
                    periodComparison.result.diff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    <span className="material-symbols-outlined text-[16px]">
                      {periodComparison.result.diff >= 0 ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                    <span>
                      {periodComparison.result.diff >= 0 ? '+' : ''}{periodComparison.result.diff.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-on-surface-variant/50 bg-surface-container-low px-2.5 py-1.5 rounded-lg">
                    Sin Comparativa
                  </span>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Chart */}
        <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/5 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-xl font-bold text-on-background">Ingresos en el Tiempo</h3>
              <p className="text-sm text-on-surface-variant">Rendimiento de ventas ({period.toLowerCase()})</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-full"></div>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Ventas</span>
            </div>
          </div>
          <div className="h-[350px] w-full flex items-end justify-between gap-2 px-2">
            {dailyRevenue.map((d, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group min-w-0">
                <div className="w-full relative">
                  <div className="w-full bg-primary/10 rounded-t-lg group-hover:bg-primary/30 transition-all cursor-pointer relative"
                    style={{ height: `${Math.max((d.revenue / maxRev) * 280, 4)}px` }}>
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-on-background text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      ${formatCurrency(d.revenue)}
                    </div>
                  </div>
                </div>
                <span className={`font-bold text-on-surface-variant uppercase tracking-widest truncate w-full text-center ${dailyRevenue.length <= 7 ? 'text-[13px]' : 'text-[10px]'}`}
                  style={dailyRevenue.length > 7 ? { writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: '45px', lineHeight: '1.2', paddingTop: '4px' } : { height: '24px' }}>
                  {d.day}
                </span>
              </div>
            ))}
          </div>
          {dailyRevenue.every(d => d.revenue === 0) && (
            <p className="text-center text-on-surface-variant/50 text-sm mt-4">Sin ventas en este período</p>
          )}
        </div>

        {/* Category Share */}
        <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/5 shadow-sm">
          <h3 className="text-xl font-bold text-on-background mb-2">Ventas por Categoría</h3>
          <p className="text-sm text-on-surface-variant mb-8">Distribución de ingresos totales</p>
          {totalCatRevenue > 0 ? (
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                  {(() => {
                    let offset = 0;
                    return catData.map((cat, i) => {
                      const el = <path key={i} stroke={getCategoryColor(cat.category)} strokeWidth="4"
                        strokeDasharray={`${cat.percent}, 100`} strokeDashoffset={`${-offset}`} fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />;
                      offset += cat.percent;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold">${totalCatRevenue > 1000 ? formatCurrency(Math.round(totalCatRevenue / 1000), false) + 'k' : formatCurrency(totalCatRevenue)}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase">Total</p>
                </div>
              </div>
              <div className="flex-1 space-y-4 w-full">
                {catData.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(cat.category) }}></div>
                      <span className="text-sm font-bold text-on-surface-variant">{cat.category}</span>
                    </div>
                    <span className="text-sm font-bold">{cat.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant/50">
              <span className="material-symbols-outlined text-4xl mb-2">pie_chart</span>
              <p className="text-sm font-medium">Sin datos de categorías aún</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Methods Chart — Ingreso vs Egreso por método */}
      <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/5 shadow-sm">
        <div className="mb-5">
          <h3 className="text-xl font-bold text-on-background">Métodos de Pago</h3>
          <p className="text-sm text-on-surface-variant">Ingresos vs egresos por forma de pago ({period.toLowerCase()})</p>
        </div>
        {paymentMethodData.totalIn > 0 ? (
          <div className="flex flex-col xl:flex-row items-center gap-10">

            {/* Barras simples */}
            <div className="flex-1 w-full space-y-5">
              {[
                { key: 'cash',     label: 'Efectivo',       color: 'bg-green-500',  textColor: 'text-green-600',  bg: 'bg-green-50' },
                { key: 'card',     label: 'Tarjeta',        color: 'bg-blue-500',   textColor: 'text-blue-600',   bg: 'bg-blue-50' },
                { key: 'transfer', label: 'Transferencia',  color: 'bg-purple-500', textColor: 'text-purple-600', bg: 'bg-purple-50' },
                { key: 'cc',       label: 'Cta. Corriente', color: 'bg-orange-500', textColor: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ key, label, color, textColor, bg }) => {
                const d = paymentMethodData[key as 'cash' | 'card' | 'transfer' | 'cc'] as any;
                const totalInCard = key === 'cc' ? d.sales : (d.sales + d.collections);
                const pct = paymentMethodData.totalIn > 0 ? (totalInCard / paymentMethodData.totalIn) * 100 : 0;
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
                        <span className="font-bold text-on-background">{label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${bg} ${textColor}`}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-3 bg-surface-container-low rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tarjetas laterales en matriz 2x2 */}
            <div className="grid grid-cols-2 gap-4 w-full xl:w-[520px] shrink-0">
              {[
                { key: 'cash',     label: 'Efectivo',       icon: 'payments',         color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-100' },
                { key: 'card',     label: 'Tarjeta',        icon: 'credit_card',       color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-100' },
                { key: 'transfer', label: 'Transferencia',  icon: 'account_balance',   color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-100' },
              ].map(({ key, label, icon, color, bg, border }) => {
                const d = paymentMethodData[key as 'cash' | 'card' | 'transfer'] as any;
                return (
                  <div key={key} className={`rounded-2xl p-4 ${bg} border ${border} space-y-2.5 shadow-sm`}>
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
                      <p className={`text-[10px] font-black uppercase tracking-wider ${color}`}>{label}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-on-surface-variant uppercase">Ventas</span>
                        <span className={`text-sm font-black ${color}`}>${formatCurrency(d.sales)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-on-surface-variant uppercase">Cobros CC</span>
                        <span className={`text-sm font-black ${color}`}>${formatCurrency(d.collections)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-on-surface-variant uppercase">Egresos</span>
                        <span className="text-sm font-black text-rose-600">-${formatCurrency(d.expenses)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-current/10">
                        <span className="text-[9px] font-bold text-on-surface-variant uppercase">Neto</span>
                        <span className={`text-sm font-black ${d.net >= 0 ? color : 'text-rose-600'}`}>{d.net < 0 ? '-' : ''}${formatCurrency(Math.abs(d.net))}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Tarjeta especial para Cuenta Corriente */}
              <div className="rounded-2xl p-4 bg-orange-50 border border-orange-100 space-y-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-orange-700">menu_book</span>
                  <p className="text-[10px] font-black uppercase tracking-wider text-orange-700">Cta. Corriente</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Ventas CC</span>
                    <span className="text-sm font-black text-orange-700">${formatCurrency(paymentMethodData.cc.sales)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Compras CC</span>
                    <span className="text-sm font-black text-rose-600">${formatCurrency(paymentMethodData.cc.purchases)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-current/10">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Pend. Cobro</span>
                    <span className="text-sm font-black text-orange-700">${formatCurrency(paymentMethodData.cc.pendingCollections)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Pend. Pago</span>
                    <span className="text-sm font-black text-rose-600">${formatCurrency(paymentMethodData.cc.pendingPayments)}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant/50">
            <span className="material-symbols-outlined text-4xl mb-2">payments</span>
            <p className="text-sm font-medium">Sin datos en este período</p>
          </div>
        )}
      </div>

      {/* Top Selling Products */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-outline-variant/5 overflow-hidden">
        <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center">
          <h2 className="text-xl font-bold">Productos Más Vendidos</h2>
          <span className="text-xs font-bold text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">{period}</span>
        </div>
        {topProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="px-8 py-4 w-10">#</th>
                  <th className="px-8 py-4">Producto</th>
                  <th className="px-8 py-4">Categoría</th>
                  <th className="px-8 py-4 text-center">Unidades</th>
                  <th className="px-8 py-4 text-right">Ingresos</th>
                  <th className="px-8 py-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-sm">
                {topProducts.slice(0, 10).map((entry, idx) => (
                  <tr key={entry.product.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-8 py-4 font-bold text-on-surface-variant">{idx + 1}</td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-surface-container-low rounded-xl p-1 flex items-center justify-center">
                          <img src={entry.product.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                        </div>
                        <p className="font-bold text-on-background">{entry.product.name}</p>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-on-surface-variant font-medium capitalize">{entry.product.categoryId}</span>
                    </td>
                    <td className="px-8 py-4 text-center font-bold">{formatCurrency(entry.unitsSold, false)}</td>
                    <td className="px-8 py-4 text-right font-bold text-primary">${formatCurrency(entry.revenue)}</td>
                    <td className="px-8 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${entry.unitsSold >= 5 ? 'bg-green-50 text-green-600' : entry.unitsSold >= 2 ? 'bg-orange-50 text-orange-600' : 'bg-surface-container-low text-on-surface-variant'}`}>
                        {entry.unitsSold >= 5 ? 'Alta Demanda' : entry.unitsSold >= 2 ? 'Regular' : 'Baja'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">trending_up</span>
            <p className="text-on-surface-variant font-medium">Sin ventas en este período</p>
            <p className="text-on-surface-variant/60 text-sm mt-1">Los datos aparecerán cuando se registren pedidos.</p>
          </div>
        )}
      </div>

      {/* Offers Section */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-outline-variant/5 overflow-hidden">
        <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Ofertas Activas</h2>
            <p className="text-sm text-on-surface-variant mt-1">Vinculadas a la tienda — los clientes las ven en tiempo real</p>
          </div>
          <button onClick={() => setShowOfferModal(true)}
            className="bg-primary text-white font-bold px-6 py-3 rounded-2xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 text-sm">
            <span className="material-symbols-outlined text-[20px]">add</span> Nueva Oferta
          </button>
        </div>

        {activeOffers.length > 0 ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOffers.map(offer => {
              // Extract UI properties dynamically based on scope
              let title = offer.name;
              let subtitle = '';
              let icon = 'local_offer';
              let badgeColor = 'bg-primary/10 text-primary';
              let imageSrc = '';

              if (offer.scope === 'product') {
                const product = adminProducts.find(p => p.id === (offer.targetId || offer.productId));
                if (product) {
                  title = product.name;
                  subtitle = `Producto · ${product.brand || 'General'}`;
                  imageSrc = product.image;
                }
              } else if (offer.scope === 'category') {
                const category = adminCategories.find(c => c.id === offer.targetId);
                title = category ? `Sección ${category.title}` : `Categoría ${offer.targetId}`;
                subtitle = 'Aplica a toda la sección';
                icon = 'folder_open';
                badgeColor = 'bg-blue-100 text-blue-600';
              } else if (offer.scope === 'all') {
                title = 'Descuento General';
                subtitle = 'Aplica a todo el local';
                icon = 'store';
                badgeColor = 'bg-purple-100 text-purple-600';
              } else if (offer.scope === 'customer') {
                const cust = customers.find(c => c.dni === offer.targetId || c.phone === offer.targetId);
                title = cust ? cust.name : `Cliente (${offer.targetId})`;
                subtitle = `Especial · DNI ${offer.targetId}`;
                icon = 'person';
                badgeColor = 'bg-teal-100 text-teal-600';
              } else if (offer.scope === 'birthday') {
                title = 'Cumpleaños Feliz';
                subtitle = 'Automático en su cumpleaños';
                icon = 'cake';
                badgeColor = 'bg-pink-100 text-pink-600';
              }

              const formattedDiscount = offer.discountType === 'percent'
                ? `-${offer.discountValue}%`
                : `-$${formatCurrency(offer.discountValue)}`;

              return (
                <div key={offer.id} className="bg-surface-container-lowest rounded-3xl p-5 border border-outline-variant/10 flex gap-4 group hover:border-primary/20 hover:shadow-lg transition-all">
                  <div className="w-16 h-16 bg-white rounded-2xl p-1.5 shrink-0 flex items-center justify-center border border-outline-variant/5">
                    {imageSrc ? (
                      <img src={imageSrc} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                    ) : (
                      <div className={`w-full h-full rounded-xl flex items-center justify-center ${badgeColor}`}>
                        <span className="material-symbols-outlined text-[28px]">{icon}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="font-bold text-sm text-on-background line-clamp-1 truncate">{title}</p>
                      <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">{subtitle}</p>
                      {/* Quota Indicators */}
                      {(offer.daily_quantity_limit || offer.total_quantity_limit) && (
                        <div className="flex gap-2 mt-1.5">
                          {offer.daily_quantity_limit && (
                            <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                              Límite Diario: {(() => {
                                const todayStr = new Date().toISOString().split('T')[0];
                                const usedToday = offerRedemptions.filter(r => r.offer_id === offer.id && r.redemption_date === todayStr).reduce((sum, r) => sum + r.quantity, 0);
                                return `${usedToday} / ${offer.daily_quantity_limit}`;
                              })()}
                            </span>
                          )}
                          {offer.total_quantity_limit && (
                            <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                              Total: {(() => {
                                const usedTotal = offerRedemptions.filter(r => r.offer_id === offer.id).reduce((sum, r) => sum + r.quantity, 0);
                                return `${usedTotal} / ${offer.total_quantity_limit}`;
                              })()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-error/10 text-error text-[10px] font-black px-2 py-0.5 rounded-full">{formattedDiscount}</span>
                        <span className="text-[9px] text-on-surface-variant font-medium">Fin: {new Date(offer.endDate).toLocaleDateString('es-AR')}</span>
                      </div>
                      <button onClick={() => deleteOffer(offer.id)}
                        className="text-error/60 hover:text-error hover:bg-error/5 w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-16 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">local_offer</span>
            <p className="text-on-surface-variant font-medium">Todavía no hay ofertas activas</p>
            <p className="text-on-surface-variant/60 text-sm mt-1">Creá una oferta y se aplicará automáticamente en las ventas.</p>
            <button onClick={() => setShowOfferModal(true)}
              className="mt-4 bg-primary text-white font-bold px-6 py-3 rounded-2xl text-sm hover:bg-primary/90 transition-all inline-flex items-center gap-2 shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined text-[18px]">add</span> Crear Primera Oferta
            </button>
          </div>
        )}
      </div>

      {/* Cash Closes History */}
      {cashCloses.length > 0 && (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-outline-variant/5 overflow-hidden">
          <div className="p-8 border-b border-outline-variant/10">
            <h2 className="text-xl font-bold mb-1">Historial de Cierres de Caja</h2>
            <p className="text-sm text-on-surface-variant">Revisá los cierres de caja registrados</p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
              <div className="w-full md:w-auto ml-auto">
                <label className="text-[9px] font-black text-on-surface-variant uppercase mb-1.5 block ml-1">Ordenar por</label>
                <select 
                  value={closeSortOrder}
                  onChange={e => setCloseSortOrder(e.target.value as any)}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all min-w-[200px]"
                >
                  <option value="date-desc">Fecha (Más reciente)</option>
                  <option value="date-asc">Fecha (Más antiguo)</option>
                  <option value="revenue-desc">Ingresos (Mayor a menor)</option>
                  <option value="revenue-asc">Ingresos (Menor a mayor)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {cashCloses
                .filter(c => c.period === 'diario' || !c.period) // Show daily closes (legacy closes might not have period)
                .filter(c => c.totalSales > 0)
                .sort((a, b) => {
                  if (closeSortOrder.startsWith('revenue')) {
                    return closeSortOrder === 'revenue-desc' 
                      ? b.totalSales - a.totalSales 
                      : a.totalSales - b.totalSales;
                  }
                  const parseDate = (d: string) => {
                    const [date, time] = d.split(', ');
                    const [day, month, year] = date.split('/');
                    return new Date(`${year}-${month}-${day}T${time}`).getTime();
                  };
                  return closeSortOrder === 'date-desc' 
                    ? parseDate(b.date) - parseDate(a.date)
                    : parseDate(a.date) - parseDate(b.date);
                })
                .slice(0, 10)
                .map(c => (
                  <div key={c.id}
                    className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 hover:border-primary/40 hover:shadow-lg transition-all group cursor-pointer"
                    onClick={() => setShowCloseResult(c)}
                  >
                    {/* Left */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 flex-shrink-0 bg-blue-100 text-blue-600">
                        <span className="material-symbols-outlined text-[20px]">
                          today
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm capitalize">Cierre Diario</p>
                        <p className="text-[10px] text-on-surface-variant">{c.date} · {c.totalOrders} pedidos</p>
                      </div>
                    </div>

                    {/* Right */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-primary">${formatCurrency(c.totalSales)}</p>
                        <div className="flex gap-2 mt-1 flex-wrap justify-end">
                          {c.cashPayments > 0 && <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Ef: ${formatCurrency(c.cashPayments)}</span>}
                          {c.cardPayments > 0 && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Tar: ${formatCurrency(c.cardPayments)}</span>}
                          {c.transferPayments > 0 && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Tr: ${formatCurrency(c.transferPayments)}</span>}
                          {c.cuentaCorrientePayments !== undefined && c.cuentaCorrientePayments > 0 && <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Cc: ${formatCurrency(c.cuentaCorrientePayments)}</span>}
                        </div>
                      </div>

                      {/* Badge de estado de arqueo de apertura */}
                      {(() => {
                        const isChecked = Boolean(c.openingControlCheckedAt && c.openingControlCheckedAt.trim() !== '');
                        const diff = isChecked ? ((c.openingControlCounted ?? 0) - (c.openingControlExpected ?? 0)) : 0;
                        const badgeColor = isChecked
                          ? (diff === 0 ? 'bg-green-100 text-green-700' : Math.abs(diff) < 500 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')
                          : 'bg-gray-100 text-gray-500';
                        return (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>
                            {isChecked
                              ? (diff === 0 ? '✓ Arqueo OK' : diff > 0 ? `+${formatCurrency(diff)} Sobrante` : `-${formatCurrency(Math.abs(diff))} Faltante`)
                              : 'Sin arqueo'}
                          </span>
                        );
                      })()}

                      <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowOfferModal(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
              <div>
                <h3 className="text-xl font-bold">Crear Nueva Oferta</h3>
                <p className="text-xs text-on-surface-variant font-medium">Configurá promociones dinámicas por producto, categoría o cliente</p>
              </div>
              <button onClick={() => setShowOfferModal(false)} className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
              {/* Scope Selection */}
              <div>
                <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2.5 block ml-1 tracking-wider">¿A quién aplica la oferta?</label>
                <div className="grid grid-cols-5 gap-1.5 bg-surface-container-low p-1.5 rounded-2xl border border-outline-variant/10">
                  {([
                    { id: 'product', label: 'Producto', icon: 'package' },
                    { id: 'category', label: 'Categoría', icon: 'folder' },
                    { id: 'all', label: 'Todo', icon: 'store' },
                    { id: 'tier', label: 'Nivel', icon: 'military_tech' },
                    { id: 'birthday', label: 'Cumple', icon: 'cake' }
                  ] as const).map(sc => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setOfferForm({ ...offerForm, scope: sc.id, targetId: '' })}
                      className={`py-2.5 px-1 rounded-xl flex flex-col items-center gap-1 font-bold text-[9px] transition-all ${offerForm.scope === sc.id ? 'bg-primary text-white shadow' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{sc.icon}</span>
                      <span>{sc.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Details based on scope */}
              {offerForm.scope === 'product' && (
                <div className="animate-in slide-in-from-top duration-200">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Seleccionar Producto</label>
                  <select
                    value={offerForm.targetId}
                    onChange={e => setOfferForm({ ...offerForm, targetId: e.target.value })}
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-2xl px-4 py-3 font-bold outline-none transition-all"
                  >
                    <option value="">Seleccioná un producto...</option>
                    {adminProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — ${formatCurrency(p.price)}</option>
                    ))}
                  </select>
                </div>
              )}

              {offerForm.scope === 'category' && (
                <div className="animate-in slide-in-from-top duration-200">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Seleccionar Categoría</label>
                  <select
                    value={offerForm.targetId}
                    onChange={e => setOfferForm({ ...offerForm, targetId: e.target.value })}
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-2xl px-4 py-3 font-bold outline-none transition-all capitalize"
                  >
                    <option value="">Seleccioná una sección...</option>
                    {adminCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {offerForm.scope === 'tier' && (
                <div className="animate-in slide-in-from-top duration-200">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Seleccionar Nivel de Cliente</label>
                  <select
                    value={offerForm.targetId}
                    onChange={e => setOfferForm({ ...offerForm, targetId: e.target.value })}
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-2xl px-4 py-3 font-bold outline-none transition-all"
                  >
                    <option value="">Seleccioná un nivel...</option>
                    <option value="Gold">Oro (Más de $200.000 mensuales)</option>
                    <option value="Silver">Plata (Más de $100.000 mensuales)</option>
                    <option value="Bronze">Bronce (Más de $50.000 mensuales)</option>
                    <option value="Regular">Regular (Inicial)</option>
                  </select>
                </div>
              )}

              {/* Discount Type Selector & Discount Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Tipo de Descuento</label>
                  <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/10">
                    <button
                      type="button"
                      onClick={() => setOfferForm({ ...offerForm, discountType: 'percent' })}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${offerForm.discountType === 'percent' ? 'bg-white text-on-background shadow' : 'text-on-surface-variant'}`}
                    >
                      Porcentaje (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferForm({ ...offerForm, discountType: 'fixed' })}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${offerForm.discountType === 'fixed' ? 'bg-white text-on-background shadow' : 'text-on-surface-variant'}`}
                    >
                      Fijo ($)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">
                    {offerForm.discountType === 'percent' ? 'Descuento (%)' : 'Monto de Rebaja ($)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant">
                      {offerForm.discountType === 'percent' ? '%' : '$'}
                    </span>
                    <input
                      type="number"
                      value={offerForm.discountValue}
                      onChange={e => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                      placeholder={offerForm.discountType === 'percent' ? '15' : '100'}
                      className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl pl-9 pr-4 py-2.5 font-bold outline-none text-error"
                      min="1"
                    />
                  </div>
                </div>

                {offerForm.discountType === 'percent' && (
                  <div className="col-span-2 mt-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">
                      Tope de Descuento (Opcional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant">$</span>
                      <input
                        type="number"
                        value={offerForm.maxDiscountAmount || ''}
                        onChange={e => setOfferForm({ ...offerForm, maxDiscountAmount: e.target.value })}
                        placeholder="Sin límite"
                        className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl pl-9 pr-4 py-2.5 font-bold outline-none text-on-surface"
                        min="1"
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70 ml-1 mt-1 font-medium">Si dejás esto en blanco, el descuento en % no tendrá un límite máximo.</p>
                  </div>
                )}
              </div>

              {/* Label and EndDate */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Etiqueta POS (Opcional)</label>
                  <input
                    type="text"
                    value={offerForm.label}
                    onChange={e => setOfferForm({ ...offerForm, label: e.target.value })}
                    placeholder="Ej: Oferta, Cumple, VIP"
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl px-4 py-2.5 font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Válida hasta</label>
                  <input
                    type="date"
                    value={offerForm.endDate}
                    onChange={e => setOfferForm({ ...offerForm, endDate: e.target.value })}
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl px-4 py-2.5 font-bold outline-none"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              {/* Quotas / Limits */}
              <div className="grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-4 mt-2">
                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Límite Diario Global</label>
                  <input
                    type="number"
                    value={offerForm.daily_quantity_limit}
                    onChange={e => setOfferForm({ ...offerForm, daily_quantity_limit: e.target.value })}
                    placeholder="Ej: 50"
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl px-4 py-2.5 font-bold outline-none text-on-surface"
                    min="1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Límite Diario por Cliente</label>
                  <input
                    type="number"
                    value={offerForm.per_customer_daily_limit}
                    onChange={e => setOfferForm({ ...offerForm, per_customer_daily_limit: e.target.value })}
                    placeholder="Ej: 2"
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl px-4 py-2.5 font-bold outline-none text-on-surface"
                    min="1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-on-surface-variant uppercase mb-2 block ml-1">Límite Total Oferta</label>
                  <input
                    type="number"
                    value={offerForm.total_quantity_limit}
                    onChange={e => setOfferForm({ ...offerForm, total_quantity_limit: e.target.value })}
                    placeholder="Ej: 500"
                    className="w-full bg-surface-container-low border-2 border-outline-variant/10 focus:border-primary rounded-xl px-4 py-2.5 font-bold outline-none text-on-surface"
                    min="1"
                  />
                </div>
                <p className="col-span-3 text-[10px] text-on-surface-variant/70 ml-1 mt-1 font-medium text-amber-700">Dejá en blanco si no querés poner límite de cupos.</p>
              </div>
            </div>

            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowOfferModal(false)} className="px-6 py-3 rounded-xl hover:bg-black/5 font-bold text-sm">Cancelar</button>
              <button
                onClick={handleAddOffer}
                disabled={!offerForm.discountValue || !offerForm.endDate || (offerForm.scope !== 'all' && offerForm.scope !== 'birthday' && !offerForm.targetId)}
                className="bg-primary text-white font-black px-6 py-3.5 rounded-xl hover:scale-[1.02] transition-all shadow-lg shadow-primary/10 text-sm disabled:opacity-50 disabled:pointer-events-none"
              >
                Crear Oferta
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseResult && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 no-print-bg">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-md no-print" 
            onClick={() => { setShowCloseResult(null); setCloseExpandedRowId(null); setCloseActivityTab('todos'); }} 
          />
          <div className="bg-white w-full max-w-2xl sm:max-w-3xl max-h-[92vh] sm:max-h-[90vh] rounded-[1.75rem] sm:rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden printable-area my-auto">
            
            {/* Header (Sticky) */}
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex items-center gap-3 sm:gap-4 bg-surface-container-lowest flex-shrink-0 sticky top-0 z-20">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-blue-100 text-blue-600 flex-shrink-0">
                <span className="material-symbols-outlined text-[24px] sm:text-[28px]">receipt_long</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-black capitalize truncate">Cierre Diario</h3>
                <p className="text-xs text-on-surface-variant truncate">{showCloseResult.date}</p>
              </div>
              <button 
                onClick={() => { setShowCloseResult(null); setCloseExpandedRowId(null); setCloseActivityTab('todos'); }} 
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 no-print flex-shrink-0"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Body: UNICO SCROLL VERTICAL */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 no-scrollbar overscroll-contain">
              
              {/* Información del Cierre */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase block">Período de Cierre</span>
                  <span className="text-sm font-black capitalize text-on-background">{showCloseResult.period || 'Diario'}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase block">Fecha y Hora</span>
                  <span className="text-sm font-bold text-on-background">
                    {showCloseResult.closedAt ? new Date(showCloseResult.closedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : showCloseResult.date}
                  </span>
                </div>
                {showCloseResult.initialAmount !== undefined && showCloseResult.initialAmount > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase block">Monto Inicial en Caja</span>
                    <span className="text-sm font-black text-primary">${formatCurrency(showCloseResult.initialAmount)}</span>
                  </div>
                )}
              </div>

              {/* Resumen */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/10 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                  <span className="text-sm text-on-surface-variant font-medium">Total Ventas</span>
                  <span className="font-black text-xl text-primary">${formatCurrency(showCloseResult.totalSales)}</span>
                </div>

                {/* Desglose: Ventas de Local vs Pedidos vs Otros Movimientos (Responsive para celular, tablet y PC) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1">
                  {/* Ventas de Local */}
                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 sm:p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide truncate">Ventas de Local</span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-emerald-900 truncate">${formatCurrency(closePeriodData.totalLocalSales)}</p>
                    <span className="text-[10px] text-emerald-700 font-semibold">{closePeriodData.localOrders.length} {closePeriodData.localOrders.length === 1 ? 'venta' : 'ventas'}</span>
                  </div>

                  {/* Pedidos */}
                  <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 sm:p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide truncate">Pedidos (Web/Envíos)</span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-blue-900 truncate">${formatCurrency(closePeriodData.totalPedidoSales)}</p>
                    <span className="text-[10px] text-blue-700 font-semibold">{closePeriodData.pedidoOrders.length} {closePeriodData.pedidoOrders.length === 1 ? 'pedido' : 'pedidos'}</span>
                  </div>

                  {/* Otros Movimientos */}
                  <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-2.5 sm:p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide truncate">Otros Movimientos</span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-amber-900 truncate">
                      {closePeriodData.totalOtherMovements < 0 ? '-' : ''}${formatCurrency(Math.abs(closePeriodData.totalOtherMovements))}
                    </p>
                    <span className="text-[10px] text-amber-700 font-semibold">{closePeriodData.otherMovements.length} {closePeriodData.otherMovements.length === 1 ? 'movimiento' : 'movimientos'}</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2.5 border-t border-outline-variant/5">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Desglose por Método de Pago</p>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-xs text-on-surface-variant font-bold">Efectivo</span>
                    </div>
                    <span className="text-xs font-black">${formatCurrency(showCloseResult.cashPayments)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span className="text-xs text-on-surface-variant font-bold">Tarjeta</span>
                    </div>
                    <span className="text-xs font-black">${formatCurrency(showCloseResult.cardPayments)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      <span className="text-xs text-on-surface-variant font-bold">Transferencia</span>
                    </div>
                    <span className="text-xs font-black">${formatCurrency(showCloseResult.transferPayments)}</span>
                  </div>
                  {showCloseResult.cuentaCorrientePayments !== undefined && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                        <span className="text-xs text-on-surface-variant font-bold">Cuenta Corriente</span>
                      </div>
                      <span className="text-xs font-black">${formatCurrency(showCloseResult.cuentaCorrientePayments)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Retiros */}
              {showCloseResult.withdrawals && showCloseResult.withdrawals.length > 0 && (
                <div className="bg-orange-50 rounded-2xl p-4 sm:p-5 border border-orange-100 space-y-2">
                  <p className="text-xs font-black text-orange-700 uppercase tracking-wider">Retiros de Efectivo</p>
                  {showCloseResult.withdrawals.map((w: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-orange-800 font-medium">{w.reason} <span className="text-[10px] text-orange-500">({w.user})</span></span>
                      <span className="font-black text-orange-700">-${formatCurrency(w.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-orange-200 text-sm">
                    <span className="font-bold text-orange-800">Total Retiros</span>
                    <span className="font-black text-orange-700">${formatCurrency(showCloseResult.totalWithdrawals || 0)}</span>
                  </div>
                </div>
              )}

              {/* MOVIMIENTOS Y VENTAS DEL PERÍODO CON ACORDEÓN INLINE */}
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                {/* Header con tabs separados por Local, Pedidos y Otros */}
                <div className="p-3 sm:p-4 border-b border-outline-variant/10 bg-surface-container-low/40 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider">
                      Detalle de Actividad del Período
                    </p>
                    <span className="text-[10px] text-on-surface-variant/80 hidden sm:inline">Hacé clic para desplegar los productos y detalles</span>
                  </div>
                  
                  {/* Selector de pestañas: Separado en Todos, Ventas Local, Pedidos y Otros */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCloseActivityTab('todos')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        closeActivityTab === 'todos' 
                          ? 'bg-primary text-white shadow-sm' 
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-black/5'
                      }`}
                    >
                      <span>Todos</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${closeActivityTab === 'todos' ? 'bg-white/20 text-white' : 'bg-black/10'}`}>
                        {closePeriodData.allUnifiedItems.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCloseActivityTab('local')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        closeActivityTab === 'local' 
                          ? 'bg-emerald-600 text-white shadow-sm' 
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-black/5'
                      }`}
                    >
                      <span>Ventas Local</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${closeActivityTab === 'local' ? 'bg-white/20 text-white' : 'bg-black/10'}`}>
                        {closePeriodData.localOrders.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCloseActivityTab('pedidos')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        closeActivityTab === 'pedidos' 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-black/5'
                      }`}
                    >
                      <span>Pedidos</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${closeActivityTab === 'pedidos' ? 'bg-white/20 text-white' : 'bg-black/10'}`}>
                        {closePeriodData.pedidoOrders.length}
                      </span>
                    </button>

                    {closePeriodData.hasOtherMovements && (
                      <button
                        type="button"
                        onClick={() => setCloseActivityTab('otros')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          closeActivityTab === 'otros' 
                            ? 'bg-amber-600 text-white shadow-sm' 
                            : 'bg-surface-container-high text-on-surface-variant hover:bg-black/5'
                        }`}
                      >
                        <span>Otros Movimientos</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${closeActivityTab === 'otros' ? 'bg-white/20 text-white' : 'bg-black/10'}`}>
                          {closePeriodData.otherMovements.length}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Listado unificado según pestaña seleccionada */}
                {(() => {
                  const displayedItems = closeActivityTab === 'local'
                    ? closePeriodData.allUnifiedItems.filter(i => i.saleCategory === 'local')
                    : closeActivityTab === 'pedidos'
                      ? closePeriodData.allUnifiedItems.filter(i => i.saleCategory === 'pedido')
                      : closeActivityTab === 'otros'
                        ? closePeriodData.allUnifiedItems.filter(i => i.saleCategory === 'otro')
                        : closePeriodData.allUnifiedItems;

                  if (displayedItems.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-on-surface-variant">
                        No hay registros en esta categoría para este cierre.
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-outline-variant/5">
                      {displayedItems.map(item => {
                        const isExpanded = closeExpandedRowId === item.id;
                        const isIngreso = item.type === 'Ingreso';

                        return (
                          <div key={item.id} className="transition-all">
                            {/* Fila principal con badge distintivo */}
                            <div 
                              onClick={() => setCloseExpandedRowId(isExpanded ? null : item.id)}
                              className={`flex items-center justify-between px-4 py-3.5 transition-all cursor-pointer group ${
                                isExpanded ? 'bg-primary/5 border-l-4 border-primary' : 'hover:bg-surface-container-low'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase flex-shrink-0 ${item.badgeStyle}`}>
                                  {item.badgeText}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-on-background truncate">
                                    {item.title}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant">
                                    {item.timeStr} · {item.cashier}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-sm font-black ${isIngreso ? 'text-green-600' : 'text-error'}`}>
                                  {isIngreso ? '+' : '-'}${formatCurrency(item.amount)}
                                </span>
                                <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${isExpanded ? 'rotate-90 text-primary' : 'text-on-surface-variant opacity-60 group-hover:opacity-100'}`}>
                                  chevron_right
                                </span>
                              </div>
                            </div>

                            {/* ACORDEÓN DESPLEGABLE DIRECTAMENTE DEBAJO */}
                            {isExpanded && (
                              <div className="bg-surface-container-low/70 border-t border-b border-primary/20 p-3.5 sm:p-4 space-y-3 animate-in fade-in duration-150 text-xs">
                                
                                {/* Ficha de información homogénea */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white rounded-xl p-3 border border-outline-variant/10">
                                  <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Tipo</span>
                                    <span className="font-bold text-on-background">
                                      {item.saleCategory === 'local' ? 'Venta de Local' : item.saleCategory === 'pedido' ? 'Pedido (Web / Envío)' : item.type}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Responsable</span>
                                    <span className="font-bold text-on-background">{item.cashier}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Fecha y Hora</span>
                                    <span className="font-bold text-on-background">{item.dateStr}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Método de Pago</span>
                                    <span className="font-bold text-on-background uppercase">{item.paymentLabel}</span>
                                  </div>
                                  {item.orderId && (
                                    <div>
                                      <span className="text-[9px] font-bold text-on-surface-variant uppercase block">N° Ticket / Pedido</span>
                                      <span className="font-bold font-mono text-primary">#{item.orderId}</span>
                                    </div>
                                  )}
                                  {item.customer && item.customer !== 'Cliente Local' && (
                                    <div>
                                      <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Cliente</span>
                                      <span className="font-bold truncate block">{item.customer}</span>
                                    </div>
                                  )}
                                  {item.orderMethod && (
                                    <div>
                                      <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Modalidad</span>
                                      <span className="font-bold">{item.orderMethod}</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-[9px] font-bold text-on-surface-variant uppercase block">Monto</span>
                                    <span className={`font-black text-sm ${isIngreso ? 'text-green-600' : 'text-error'}`}>
                                      {isIngreso ? '+' : '-'}${formatCurrency(item.amount)}
                                    </span>
                                  </div>
                                </div>

                                {/* TABLA DE PRODUCTOS VENDIDOS */}
                                {item.items && item.items.length > 0 && (
                                  <div className="bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
                                    <div className="px-3.5 py-2 bg-surface-container-low/40 border-b border-outline-variant/10 flex justify-between items-center">
                                      <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                                        Productos Vendidos ({item.items.length})
                                      </p>
                                      <span className="text-[11px] font-black text-primary">Total: ${formatCurrency(item.amount)}</span>
                                    </div>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[9px] font-bold text-on-surface-variant uppercase bg-surface-container-low/20 border-b border-outline-variant/5">
                                          <th className="px-3 py-1.5 text-left">Producto</th>
                                          <th className="px-3 py-1.5 text-center">Cant.</th>
                                          <th className="px-3 py-1.5 text-right">P. Unit.</th>
                                          <th className="px-3 py-1.5 text-right">Subtotal</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-outline-variant/5">
                                        {item.items.map((prod, i) => (
                                          <tr key={i} className="hover:bg-surface-container-low/20">
                                            <td className="px-3 py-2 font-medium text-on-background">{prod.name}</td>
                                            <td className="px-3 py-2 text-center font-bold">
                                              {prod.saleType === 'weight' ? `${parseFloat(prod.quantity.toFixed(2))} kg` : prod.quantity}
                                            </td>
                                            <td className="px-3 py-2 text-right text-on-surface-variant">${formatCurrency(prod.price, true, true)}</td>
                                            <td className="px-3 py-2 text-right font-bold text-on-background">
                                              ${formatCurrency(prod.price * prod.quantity, true, true)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {/* Si no tiene items y no es venta */}
                                {(!item.items || item.items.length === 0) && !item.isVenta && (
                                  <div className="bg-white rounded-xl p-3 border border-outline-variant/10">
                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Detalle</span>
                                    <p className="text-on-background font-medium">{item.description}</p>
                                  </div>
                                )}

                                {/* Botón de reimpresión para pedidos */}
                                {item.isVenta && item.orderId && (
                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveCloseTicket({
                                          ticketNumber: item.orderId!,
                                          date: item.dateStr,
                                          items: (item.items || []).map(p => ({
                                            name: p.name,
                                            quantity: p.quantity,
                                            price: p.price,
                                            finalPrice: p.price,
                                            offerLabel: null,
                                            saleType: p.saleType
                                          })),
                                          subtotal: item.amount,
                                          globalDiscount: 0,
                                          globalDiscountAmount: 0,
                                          total: item.amount,
                                          paymentMethod: item.paymentMethod,
                                          customer: item.customer,
                                          cashier: item.cashier
                                        });
                                      }}
                                      className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-[11px] font-bold rounded-xl transition-all flex items-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                                      Reimprimir Ticket
                                    </button>
                                  </div>
                                )}

                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Información Adicional (Arqueo de apertura) */}
              {(showCloseResult.openingControlExpected !== undefined || showCloseResult.openingControlCounted != null) && (
                <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/10 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/5">
                    <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider">Control de Arqueo (Apertura)</p>
                    {(() => {
                      const isChecked = Boolean(
                        showCloseResult.openingControlCheckedAt && 
                        showCloseResult.openingControlCheckedAt.trim() !== ''
                      );
                      const diff = isChecked 
                        ? ((showCloseResult.openingControlCounted ?? 0) - (showCloseResult.openingControlExpected ?? 0)) 
                        : 0;
                      const badgeColor = isChecked
                        ? (diff === 0 ? 'bg-green-100 text-green-700' : Math.abs(diff) < 500 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')
                        : 'bg-gray-100 text-gray-500';
                      return (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>
                          {isChecked
                            ? (diff === 0 ? '✓ Arqueo OK' : diff > 0 ? `+${formatCurrency(diff)} Sobrante` : `-${formatCurrency(Math.abs(diff))} Faltante`)
                            : 'Sin arqueo'}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {showCloseResult.openingControlExpected !== undefined && (
                      <div>
                        <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Efectivo Esperado</span>
                        <span className="font-bold">${formatCurrency(showCloseResult.openingControlExpected)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Efectivo Contado</span>
                      <span className="font-bold">
                        {Boolean(showCloseResult.openingControlCheckedAt && showCloseResult.openingControlCheckedAt.trim() !== '')
                          ? `$${formatCurrency(showCloseResult.openingControlCounted ?? 0)}` 
                          : 'Pendiente de arqueo'}
                      </span>
                    </div>
                    {Boolean(showCloseResult.openingControlCheckedAt && showCloseResult.openingControlCheckedAt.trim() !== '') && (
                      <div>
                        <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Diferencia</span>
                        {(() => {
                          const diff = (showCloseResult.openingControlCounted ?? 0) - (showCloseResult.openingControlExpected ?? 0);
                          return (
                            <span className={`font-black ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-error'}`}>
                              {diff > 0 ? '+' : ''}${formatCurrency(diff)}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  {showCloseResult.openingControlNotes && (
                    <div className="pt-2 text-xs border-t border-outline-variant/5">
                      <span className="text-[10px] text-on-surface-variant font-bold block uppercase">Notas de arqueo</span>
                      <p className="text-on-background italic">"{showCloseResult.openingControlNotes}"</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer (Sticky) */}
            <div className="p-4 sm:p-6 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest flex-shrink-0 sticky bottom-0 z-20 no-print">
              <button 
                onClick={() => window.print()} 
                className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high text-on-surface font-bold py-3.5 sm:py-4 rounded-2xl hover:bg-surface-container-highest transition-colors text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                Imprimir
              </button>
              <button 
                onClick={() => { setShowCloseResult(null); setCloseExpandedRowId(null); setCloseActivityTab('todos'); }} 
                className="flex-[2] bg-primary text-white font-bold py-3.5 sm:py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Modal de impresión de ticket si se activa desde el detalle */}
      {activeCloseTicket && (
        <TicketPrinter ticket={activeCloseTicket} onClose={() => setActiveCloseTicket(null)} />
      )}
    </div>
  );
};
