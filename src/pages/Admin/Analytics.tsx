import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import type { Offer, CashClose, CashMovement } from '../../context/AdminContext';
import { MovementDetailModal } from '../../components/MovementDetailModal';
import { AdminPeriodSelector, PERIOD_DAYS } from '../../components/AdminPeriodSelector';
import { useAuthStore } from '../../stores/useAuthStore';
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
    formatCurrency, customers, cashMovements
  } = useAdmin();

  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  const [period, setPeriod] = useState('Últimos 7 días');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById('admin-header-portal'));
  }, []);

  // Enforce 7 days period for common employees
  useEffect(() => {
    if (employeeProfile?.role === 'employee' && period !== 'Últimos 7 días') {
      setPeriod('Últimos 7 días');
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
    endDate: ''
  });
  const [closePeriodFilter, setClosePeriodFilter] = useState('todos');
  const [closeSortOrder, setCloseSortOrder] = useState<'date-desc' | 'date-asc' | 'revenue-desc' | 'revenue-asc'>('date-desc');

  // Movement detail within cash close
  const [selectedCloseMovement, setSelectedCloseMovement] = useState<CashMovement | null>(null);

  const analyticsParams = useMemo(() => {
    if (period === 'Personalizado' && customRange.from && customRange.to) {
      return { from: new Date(customRange.from).getTime(), to: new Date(customRange.to).getTime() + 86400000 };
    }
    return PERIOD_DAYS[period] || 7;
  }, [period, customRange]);

  const topProducts = getTopSellingProducts(analyticsParams);
  const dailyRevenue = getRevenueByDay(analyticsParams);
  const maxRev = Math.max(...dailyRevenue.map(d => d.revenue), 1);

  // Filter orders by the selected period (applying the time filter perfectly)
  const filteredOrdersForPeriod = useMemo(() => {
    return orders.filter(o => {
      const t = getOrderTimestamp(o);
      if (typeof analyticsParams === 'object') {
        return t >= analyticsParams.from && t <= analyticsParams.to;
      }
      return t >= Date.now() - (analyticsParams as number) * 86400000;
    }).filter(o => o.status !== 'Cancelado');
  }, [orders, analyticsParams, getOrderTimestamp]);

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
        const catId = prod?.categoryId || '';
        if (Object.hasOwnProperty.call(revenueMap, catId)) {
          revenueMap[catId] += item.price * item.quantity;
        }
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

  // Payment methods breakdown from ORDERS in the selected period (Real-time)
  const paymentMethodData = useMemo(() => {
    const filteredOrders = orders.filter(o => {
      const t = getOrderTimestamp(o);
      if (typeof analyticsParams === 'object') {
        return t >= analyticsParams.from && t <= analyticsParams.to;
      }
      return t >= Date.now() - (analyticsParams as number) * 86400000;
    }).filter(o => o.status !== 'Cancelado');

    const cash = filteredOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0);
    const card = filteredOrders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + o.total, 0);
    const transfer = filteredOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + o.total, 0);
    const cc = filteredOrders.filter(o => o.paymentMethod === 'cuenta_corriente').reduce((s, o) => s + o.total, 0);
    
    return { cash, card, transfer, cc, total: cash + card + transfer + cc };
  }, [orders, analyticsParams, getOrderTimestamp]);

  // Period comparison: current vs previous equivalent period
  const periodComparison = useMemo(() => {
    let currentFrom: number, currentTo: number, prevFrom: number, prevTo: number;

    if (typeof analyticsParams === 'object') {
      currentFrom = analyticsParams.from;
      currentTo = analyticsParams.to;
      const duration = currentTo - currentFrom;
      prevFrom = currentFrom - duration;
      prevTo = currentFrom;
    } else {
      const days = analyticsParams as number;
      const ms = days * 86400000;
      currentTo = Date.now();
      currentFrom = currentTo - ms;
      prevFrom = currentFrom - ms;
      prevTo = currentFrom;
    }

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

    // 2. Expenses (cashMovements of type 'Egreso' or 'Retiro')
    const currentExpenses = cashMovements.filter(m => {
      return m.timestamp >= currentFrom && m.timestamp <= currentTo && (m.type === 'Egreso' || m.type === 'Retiro');
    }).reduce((s, m) => s + m.amount, 0);

    const previousExpenses = cashMovements.filter(m => {
      return m.timestamp >= prevFrom && m.timestamp <= prevTo && (m.type === 'Egreso' || m.type === 'Retiro');
    }).reduce((s, m) => s + m.amount, 0);

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
      label: offerForm.label || calculatedName
    };
    addOffer(offer);
    setOfferForm({
      scope: 'product',
      targetId: '',
      discountType: 'percent',
      discountValue: '',
      maxDiscountAmount: '',
      label: 'Oferta',
      endDate: ''
    });
    setShowOfferModal(false);
  };

  const handleCashClose = (p: 'diario' | 'semanal' | 'mensual') => {
    const result = performCashClose(p);
    setShowCloseResult(result);
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

      {/* Payment Methods Chart */}
      <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/5 shadow-sm">
        <div className="mb-8">
          <h3 className="text-xl font-bold text-on-background">Métodos de Pago</h3>
          <p className="text-sm text-on-surface-variant">Distribución por forma de cobro ({period.toLowerCase()})</p>
        </div>
        {paymentMethodData.total > 0 ? (
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 w-full space-y-5">
              {[
                { label: 'Efectivo', value: paymentMethodData.cash, color: 'bg-green-500', textColor: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Tarjeta', value: paymentMethodData.card, color: 'bg-blue-500', textColor: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Transferencia', value: paymentMethodData.transfer, color: 'bg-purple-500', textColor: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Cta. Corriente', value: paymentMethodData.cc, color: 'bg-orange-500', textColor: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ label, value, color, textColor, bg }) => {
                const pct = paymentMethodData.total > 0 ? (value / paymentMethodData.total) * 100 : 0;
                return (
                  <div key={label} className="space-y-2">
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
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:w-48 w-full">
              {[
                { label: 'Efectivo', value: paymentMethodData.cash, icon: 'payments', color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Tarjeta', value: paymentMethodData.card, icon: 'credit_card', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Transferencia', value: paymentMethodData.transfer, icon: 'account_balance', color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Cta. Corriente', value: paymentMethodData.cc, icon: 'menu_book', color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ label, value, icon, color, bg }) => (
                <div key={label} className={`rounded-2xl p-3 ${bg} flex items-center gap-3 md:flex-col md:items-start md:gap-1`}>
                  <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
                  <div>
                    <p className={`text-base font-black leading-none ${color}`}>${formatCurrency(value)}</p>
                    <p className="text-[9px] font-bold text-on-surface-variant uppercase">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant/50">
            <span className="material-symbols-outlined text-4xl mb-2">payments</span>
            <p className="text-sm font-medium">Sin pagos registrados en este período</p>
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
                {topProducts.map((entry, idx) => (
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

      {/* Cash Register Close */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-outline-variant/5 overflow-hidden">
        <div className="p-8 border-b border-outline-variant/10">
          <h2 className="text-xl font-bold mb-1">Cierre de Caja</h2>
          <p className="text-sm text-on-surface-variant">Genera un resumen de ventas por período</p>
        </div>
        
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            {(['diario', 'semanal', 'mensual'] as const).map(p => (
              <button key={p} onClick={() => handleCashClose(p)}
                className="p-6 rounded-2xl border-2 border-dashed border-outline-variant/20 hover:border-primary/40 hover:bg-primary/[0.02] transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <span className="material-symbols-outlined text-[28px]">
                    {p === 'diario' ? 'today' : p === 'semanal' ? 'date_range' : 'calendar_month'}
                  </span>
                </div>
                <span className="font-bold text-sm capitalize">Cierre {p}</span>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                  {p === 'diario' ? 'Hoy' : p === 'semanal' ? 'Últimos 7 días' : 'Este mes'}
                </span>
              </button>
            ))}
          </div>

          {/* Recent Closes with Filters */}
          {cashCloses.length > 0 && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                  <h3 className="text-sm font-black text-on-surface-variant uppercase tracking-[0.2em] mb-1">Historial de Cierres</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Gestioná y revisá tus cierres anteriores</p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                  <div className="flex-1 md:w-48">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase mb-1.5 block ml-1">Período</label>
                    <select 
                      value={closePeriodFilter}
                      onChange={e => setClosePeriodFilter(e.target.value)}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all"
                    >
                      <option value="todos">Todos los Períodos</option>
                      <option value="diario">Diarios</option>
                      <option value="semanal">Semanales</option>
                      <option value="mensual">Mensuales</option>
                    </select>
                  </div>
                  
                  <div className="flex-1 md:w-48">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase mb-1.5 block ml-1">Ordenar por</label>
                    <select 
                      value={closeSortOrder}
                      onChange={e => setCloseSortOrder(e.target.value as any)}
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all"
                    >
                      <option value="date-desc">Fecha (Más reciente)</option>
                      <option value="date-asc">Fecha (Más antiguo)</option>
                      <option value="revenue-desc">Ingresos (Mayor a menor)</option>
                      <option value="revenue-asc">Ingresos (Menor a mayor)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {cashCloses
                  .filter(c => closePeriodFilter === 'todos' || c.period === closePeriodFilter)
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
                      onClick={() => setShowCloseResult(c)}
                      className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${c.period === 'diario' ? 'bg-blue-100 text-blue-600' : c.period === 'semanal' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                          <span className="material-symbols-outlined text-[20px]">
                            {c.period === 'diario' ? 'today' : c.period === 'semanal' ? 'date_range' : 'calendar_month'}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-sm capitalize">Cierre {c.period}</p>
                          <p className="text-[10px] text-on-surface-variant">{c.date} · {c.totalOrders} pedidos</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-primary">${formatCurrency(c.totalSales)}</p>
                          <div className="flex gap-2 mt-1">
                            {c.cashPayments > 0 && <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Ef: ${formatCurrency(c.cashPayments)}</span>}
                            {c.cardPayments > 0 && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Tar: ${formatCurrency(c.cardPayments)}</span>}
                            {c.transferPayments > 0 && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Tr: ${formatCurrency(c.transferPayments)}</span>}
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 no-print-bg">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md no-print" onClick={() => setShowCloseResult(null)} />
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 overflow-hidden printable-area">
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${showCloseResult.period === 'diario' ? 'bg-blue-100 text-blue-600' : showCloseResult.period === 'semanal' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                <span className="material-symbols-outlined text-[28px]">{showCloseResult.period === 'diario' ? 'receipt_long' : 'analytics'}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black capitalize">Cierre {showCloseResult.period}</h3>
                <p className="text-xs text-on-surface-variant">{showCloseResult.date}</p>
              </div>
              <button onClick={() => setShowCloseResult(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 no-print"><span className="material-symbols-outlined">close</span></button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto max-h-[65vh] no-scrollbar space-y-4">
              {/* Summary */}
              <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/5">
                  <span className="text-sm text-on-surface-variant font-medium">Total Ventas</span>
                  <span className="font-black text-xl text-primary">${formatCurrency(showCloseResult.totalSales)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-on-surface-variant">Pedidos</span>
                  <span className="font-bold">{showCloseResult.totalOrders}</span>
                </div>
                <div className="pt-3 space-y-2.5">
                  <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="text-xs text-on-surface-variant font-bold">Efectivo</span></div><span className="text-xs font-black">${formatCurrency(showCloseResult.cashPayments)}</span></div>
                  <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span><span className="text-xs text-on-surface-variant font-bold">Tarjeta</span></div><span className="text-xs font-black">${formatCurrency(showCloseResult.cardPayments)}</span></div>
                  <div className="flex justify-between items-center"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span><span className="text-xs text-on-surface-variant font-bold">Transferencia</span></div><span className="text-xs font-black">${formatCurrency(showCloseResult.transferPayments)}</span></div>
                </div>
              </div>

              {/* Withdrawals */}
              {showCloseResult.withdrawals && showCloseResult.withdrawals.length > 0 && (
                <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 space-y-2">
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

              {/* Movements list */}
              {(() => {
                const closeMovements = getCashCloseMovements(showCloseResult.id);
                if (closeMovements.length === 0) return null;
                return (
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-outline-variant/10">
                      <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider">Movimientos del Período ({closeMovements.length})</p>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto no-scrollbar">
                      {closeMovements.sort((a, b) => b.timestamp - a.timestamp).map(m => (
                        <div key={m.id} onClick={() => setSelectedCloseMovement(m)}
                          className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${m.type === 'Ingreso' ? 'bg-green-100 text-green-700' : m.type === 'Retiro' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{m.type}</span>
                            <div>
                              <p className="text-xs font-bold text-on-background line-clamp-1">{m.description}</p>
                              <p className="text-[10px] text-on-surface-variant">{new Date(m.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {m.cashier}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black ${m.type === 'Ingreso' ? 'text-green-600' : 'text-error'}`}>{m.type === 'Ingreso' ? '+' : '-'}${formatCurrency(m.amount)}</span>
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant/10 flex gap-3 no-print">
              <button 
                onClick={() => window.print()} 
                className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high text-on-surface font-bold py-4 rounded-2xl hover:bg-surface-container-highest transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                Imprimir
              </button>
              <button 
                onClick={() => setShowCloseResult(null)} 
                className="flex-[2] bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Movement Detail within Cash Close */}
      {selectedCloseMovement && (
        <MovementDetailModal
          movement={selectedCloseMovement}
          relatedOrder={orders.find(o => o.id === selectedCloseMovement.orderId) || null}
          formatCurrency={formatCurrency}
          onClose={() => setSelectedCloseMovement(null)}
        />
      )}
    </div>
  );
};
