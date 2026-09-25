import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import { useNavigate } from 'react-router-dom';
import { AdminPeriodSelector, getPeriodRange } from '../../components/AdminPeriodSelector';
import { useAuthStore } from '../../stores/useAuthStore';
import { useProductStore, ProductWithReplenishment } from '../../stores/useProductStore';
import { productsService } from '../../services/products.service';
import { fetchSetting } from '../../services/admin.service';

export const Dashboard: React.FC = () => {
  const {
    totalRevenue, ordersRevenue, posRevenue, totalDebtInStreet, activeOrdersCount, totalCustomers,
    orders, adminCategories, getOrderTimestamp,
    privacyMode, formatCurrency
  } = useAdmin();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  const canViewFinancial = employeeProfile?.role === 'super_admin' || employeeProfile?.role === 'owner' || hasPermission('dashboard.view_financial');

  const [replenishAmounts, setReplenishAmounts] = useState<Record<string, string>>({});
  const [selectedForReport, setSelectedForReport] = useState<Set<string>>(new Set());
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [period, setPeriod] = useState('Últimos 30 días');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const {
    lowStockDashboardProducts: lowStockProducts,
    lowStockDashboardTotal: lowStockCount,
    lowStockDashboardLoading,
    fetchLowStockDashboardProducts,
    updateStock,
  } = useProductStore();

  const [page, setPage] = useState(1);
  const limit = 100;

  useEffect(() => {
    fetchLowStockDashboardProducts({ page, limit });
  }, [fetchLowStockDashboardProducts, page, limit]);

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

  const analyticsParams = useMemo(() => {
    return getPeriodRange(period, customRange);
  }, [period, customRange]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= analyticsParams.from && ts <= analyticsParams.to;
    });
  }, [orders, analyticsParams]);

  const stats = useMemo(() => {
    const ordersRev = filteredOrders
      .filter(o => o.status !== 'Cancelado' && o.source !== 'pos')
      .reduce((s, o) => s + o.total, 0);

    const posRev = filteredOrders
      .filter(o => o.status !== 'Cancelado' && o.source === 'pos')
      .reduce((s, o) => s + o.total, 0);

    const revenue = ordersRev + posRev;
    const active = filteredOrders.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado').length;

    const baseStats = [];

    if (canViewFinancial) {
      baseStats.push(
        {
          label: 'Ventas por Caja (POS)',
          value: `$${formatCurrency(posRev)}`,
          change: 'Ventas local',
          icon: 'point_of_sale',
          color: 'bg-orange-100 text-orange-600'
        },
        {
          label: 'Ventas por Pedidos',
          value: `$${formatCurrency(ordersRev)}`,
          change: 'Ventas web',
          icon: 'local_shipping',
          color: 'bg-indigo-100 text-indigo-600'
        }
      );
    }

    baseStats.push(
      {
        label: 'Pedidos Activos',
        value: formatCurrency(active, false),
        change: filteredOrders.length > 0 ? `${formatCurrency(filteredOrders.length, false)} totales` : 'Sin pedidos',
        icon: 'shopping_cart',
        color: 'bg-blue-100 text-blue-600'
      },
      {
        label: 'Alertas de Stock',
        value: formatCurrency(lowStockCount, false),
        change: lowStockCount > 5 ? 'Crítico' : lowStockCount > 0 ? 'Moderado' : 'OK',
        icon: 'warning',
        color: lowStockCount > 5 ? 'bg-error/10 text-error' : 'bg-orange-100 text-orange-600'
      }
    );

    if (canViewFinancial) {
      baseStats.push({
        label: 'Deuda en la Calle',
        value: `$${formatCurrency(totalDebtInStreet)}`,
        change: 'Total Cta. Corr.',
        icon: 'menu_book',
        color: 'bg-red-50 text-red-600'
      });
    }

    return baseStats;
  }, [filteredOrders, lowStockCount, privacyMode, canViewFinancial]);

  // Sync selection with low stock products (default to all selected)
  useEffect(() => {
    if (lowStockProducts.length > 0 && selectedForReport.size === 0) {
      setSelectedForReport(new Set(lowStockProducts.map(p => p.id)));
    }
  }, [lowStockProducts.length]);

  const toggleSelectForReport = (id: string) => {
    const next = new Set(selectedForReport);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedForReport(next);
  };

  // Últimos 5 pedidos reales (excluyendo ventas de caja/POS)
  const recentOrders = useMemo(() => {
    return orders.filter(o => o.source !== 'pos').slice(0, 5);
  }, [orders]);

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const handleGenerateStockReport = async () => {
    setIsGeneratingReport(true);
    try {
      const storeState = useProductStore.getState();
      const isDynamic = storeState.isReplenishmentEnabled;

      if (!isDynamic) {
        let productsToReport: { name: string; categoryId: string; stock: number }[] = [];
        // If all items on current page are selected (or default state), fetch complete list from DB
        if (selectedForReport.size === lowStockProducts.length) {
          const allFetched = await productsService.getAllLowStockProducts();
          productsToReport = allFetched.filter(p => (p as any).is_paused !== true && (p as any).isPaused !== true);
        } else {
          // Only report the selected items from the page
          productsToReport = lowStockProducts
            .filter(p => selectedForReport.has(p.id) && !p.isPaused)
            .map(p => ({
              name: p.name,
              categoryId: p.categoryId,
              stock: p.stock
            }));
        }

        if (productsToReport.length === 0) {
          setDashboardError("Seleccioná al menos un producto para la lista.");
          setTimeout(() => setDashboardError(null), 3000);
          setIsGeneratingReport(false);
          return;
        }

        const sortedProducts = [...productsToReport].sort((a, b) => {
          const catA = adminCategories.find(c => c.id === a.categoryId)?.title || '';
          const catB = adminCategories.find(c => c.id === b.categoryId)?.title || '';
          return catA.localeCompare(catB);
        });

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          setIsGeneratingReport(false);
          return;
        }

        const rows = sortedProducts.map(p => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; font-weight: bold;">${p.name}</td>
            <td style="padding: 12px;">${adminCategories.find(c => c.id === p.categoryId)?.title || p.categoryId}</td>
            <td style="padding: 12px; font-weight: bold; color: #ff5252;">${p.stock}</td>
          </tr>
        `).join('');

        printWindow.document.write(`
          <html><head><title>Reporte de Stock</title>
          <style>body { font-family: system-ui; padding: 40px; color: #1a1a1a; } table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; } th { background: #f8f9fa; padding: 12px; font-weight: bold; border-bottom: 2px solid #ddd; } @media print { .no-print { display: none; } body { padding: 0; } }</style>
          </head><body>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                <div>
                  <h1 style="margin: 0 0 8px 0; color: #e62e05;">Reporte de Stock Crítico (${sortedProducts.length} productos)</h1>
                  <p style="margin: 0; color: #666; font-weight: bold;">Martina Supermercado- Generado el ${new Date().toLocaleDateString('es-AR')}</p>
                </div>
                <button onclick="window.print()" class="no-print" style="background: #e62e05; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer;">Imprimir / Guardar PDF</button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Stock Actual</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        // isDynamic === true
        const { defaultReplenishmentConfig, validateReplenishmentConfig } = await import('../../utils/replenishment');
        let config = defaultReplenishmentConfig;
        try {
          const rawConfig = await fetchSetting<any>('inventory_replenishment_config', defaultReplenishmentConfig);
          const configError = validateReplenishmentConfig(rawConfig);
          config = configError ? defaultReplenishmentConfig : rawConfig;
        } catch {
          config = defaultReplenishmentConfig;
        }

        await storeState.fetchAllReplenishmentAlerts();

        // Respeta selectedForReport con la misma lógica que la rama del flag apagado
        let productsToReport: ProductWithReplenishment[] = [];
        let noHistoryToReport: ProductWithReplenishment[] = [];

        if (selectedForReport.size === lowStockProducts.length) {
          productsToReport = storeState.allReplenishmentAlerts.filter(p => !p.isPaused);
        } else {
          productsToReport = storeState.allReplenishmentAlerts.filter(p => selectedForReport.has(p.id) && !p.isPaused);
        }
        noHistoryToReport = storeState.allReplenishmentNoHistory.filter(p => !p.isPaused);

        if (productsToReport.length === 0 && noHistoryToReport.length === 0) {
          setDashboardError("No hay productos con alertas de stock para reportar.");
          setTimeout(() => setDashboardError(null), 3000);
          setIsGeneratingReport(false);
          return;
        }

        // Agrupar por categoría
        const categoriesMap = new Map<string, ProductWithReplenishment[]>();
        for (const p of productsToReport) {
          const catTitle = adminCategories.find(c => c.id === p.categoryId)?.title || 'Otras Categorías';
          if (!categoriesMap.has(catTitle)) {
            categoriesMap.set(catTitle, []);
          }
          categoriesMap.get(catTitle)!.push(p);
        }

        // Ordenar categorías y productos dentro de cada categoría: días de cobertura ASC, luego nombre
        const sortedCategoryNames = Array.from(categoriesMap.keys()).sort((a, b) => a.localeCompare(b));
        let tableRowsHtml = '';

        for (const catName of sortedCategoryNames) {
          const prods = categoriesMap.get(catName)!;
          prods.sort((a, b) => {
            const covA = a.replenishmentResult?.diasCobertura ?? Infinity;
            const covB = b.replenishmentResult?.diasCobertura ?? Infinity;
            if (covA !== covB) return covA - covB;
            return (a.name || '').localeCompare(b.name || '');
          });

          tableRowsHtml += `
            <tr style="background: #f1f5f9; font-weight: bold;">
              <td colspan="9" style="padding: 10px 12px; font-size: 13px; color: #1e293b; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                CATEGORÍA: ${catName.toUpperCase()}
              </td>
            </tr>
          `;

          for (const p of prods) {
            const diasCobStr = p.replenishmentResult?.diasCobertura != null ? p.replenishmentResult.diasCobertura.toFixed(1) : '—';
            tableRowsHtml += `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px; font-weight: bold;">${p.name}</td>
                <td style="padding: 12px; font-size: 12px; color: #666;">${p.sku || p.id.slice(0, 8)}</td>
                <td style="padding: 12px; font-weight: bold; color: #ff5252;">${p.stock}</td>
                <td style="padding: 12px;">${p.replenishmentResult?.promedioSemanal != null ? p.replenishmentResult.promedioSemanal.toFixed(1) : '—'}</td>
                <td style="padding: 12px;">${diasCobStr}</td>
                <td style="padding: 12px;">${p.replenishmentResult?.puntoReposicion != null ? p.replenishmentResult.puntoReposicion : '—'}</td>
                <td style="padding: 12px; font-weight: bold; color: #10b981;">${p.replenishmentResult?.stockObjetivo != null ? p.replenishmentResult.stockObjetivo : '—'}</td>
                <td style="padding: 12px; font-weight: bold; color: #3b82f6;">${p.replenishmentResult?.cantidadRecomendada != null ? p.replenishmentResult.cantidadRecomendada : '—'}</td>
                <td style="padding: 12px; font-size: 12px; color: #666;">${p.replenishmentResult?.etiquetaMargen ?? '—'}</td>
              </tr>
            `;
          }
        }

        // Productos sin ventas registradas en el período
        const sortedNoHistory = [...noHistoryToReport].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const noHistoryRows = sortedNoHistory.map(p => `
          <tr style="border-bottom: 1px solid #eee; background: #fffcf5;">
            <td style="padding: 12px; font-weight: bold;">${p.name}</td>
            <td style="padding: 12px; font-size: 12px; color: #666;">${p.sku || p.id.slice(0, 8)}</td>
            <td style="padding: 12px; font-weight: bold; color: #ff5252;">${p.stock}</td>
            <td style="padding: 12px;">—</td>
            <td style="padding: 12px;">—</td>
            <td style="padding: 12px;">—</td>
            <td style="padding: 12px;">—</td>
            <td style="padding: 12px;">—</td>
            <td style="padding: 12px; font-size: 12px; color: #666;">SIN_HISTORIAL</td>
          </tr>
        `).join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          setIsGeneratingReport(false);
          return;
        }

        printWindow.document.write(`
          <html><head><title>Reporte de Stock</title>
          <style>body { font-family: system-ui; padding: 40px; color: #1a1a1a; } table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; font-size: 13px; } th { background: #f8f9fa; padding: 12px; font-weight: bold; border-bottom: 2px solid #ddd; font-size: 12px; } @media print { .no-print { display: none; } body { padding: 0; } }</style>
          </head><body>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                <div>
                  <h1 style="margin: 0 0 8px 0; color: #e62e05;">Reporte de Stock Crítico (${productsToReport.length} productos)</h1>
                  <p style="margin: 0; color: #666; font-weight: bold;">Martina Supermercado - Generado el ${new Date().toLocaleString('es-AR')} | Parámetros: Historial ${config.historyWeeks} sem, Cobertura ${config.coverageDays} días, Anticipación ${config.anticipationDays} días</p>
                </div>
                <button onclick="window.print()" class="no-print" style="background: #e62e05; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer;">Imprimir / Guardar PDF</button>
              </div>

              ${productsToReport.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Stock actual</th>
                    <th>Venta semanal prom.</th>
                    <th>Días de cobertura</th>
                    <th>Punto de reposición</th>
                    <th>Stock objetivo</th>
                    <th>Comprar</th>
                    <th>Margen / historial</th>
                  </tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
              </table>
              ` : '<p>No hay alertas de reposición inminente.</p>'}

              ${noHistoryToReport.length > 0 ? `
              <div style="margin-top: 60px;">
                <h2 style="color: #d97706; margin-bottom: 8px;">Productos sin ventas registradas en el período (Stock 0)</h2>
                <p style="color: #666; font-size: 14px; margin-top: 0;">Estos productos se quedaron sin stock y no registran ventas en el período evaluado (${config.historyWeeks} semanas), por lo que no es posible proyectar la demanda de reposición.</p>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>SKU</th>
                      <th>Stock actual</th>
                      <th>Venta semanal prom.</th>
                      <th>Días de cobertura</th>
                      <th>Punto de reposición</th>
                      <th>Stock objetivo</th>
                      <th>Comprar</th>
                      <th>Margen / historial</th>
                    </tr>
                  </thead>
                  <tbody>${noHistoryRows}</tbody>
                </table>
              </div>
              ` : ''}
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (err) {
      console.error("Error generating stock report:", err);
      setDashboardError("Error al generar el reporte de stock.");
      setTimeout(() => setDashboardError(null), 3000);
    } finally {
      setIsGeneratingReport(false);
    }
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
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm border border-outline-variant/5 flex flex-col gap-3 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className={`w-10 h-10 md:w-12 md:h-12 ${stat.color} rounded-xl md:rounded-2xl flex items-center justify-center`}>
                <span className="material-symbols-outlined text-[22px] md:text-[28px]">{stat.icon}</span>
              </div>
              <span className={`text-[10px] md:text-xs font-bold padding-0 px-2 py-0.5 md:py-1 rounded-lg ${stat.change === 'Crítico' ? 'bg-error/10 text-error' : 'bg-surface-container-low text-on-surface-variant'
                }`}>
                {stat.change}
              </span>
            </div>
            <div>
              <p className="text-[10px] md:text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 leading-tight">{stat.label}</p>
              <p className="text-xl md:text-2xl font-bold text-on-background">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-outline-variant/5 overflow-hidden">
          <div className="px-5 py-4 md:p-8 border-b border-outline-variant/10 flex justify-between items-center">
            <h2 className="text-base md:text-xl font-bold">Pedidos Recientes</h2>
            <button
              onClick={() => navigate('/admin/orders')}
              className="text-primary text-sm font-bold hover:underline"
            >
              Ver Todo
            </button>
          </div>

          {recentOrders.length > 0 ? (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden divide-y divide-outline-variant/10">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-container-lowest transition-colors">
                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-sm font-bold text-on-background">#{order.id} <span className="font-normal text-on-surface-variant">— {order.customer}</span></p>
                      <span className={`self-start px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-primary shrink-0 ml-3">
                      {canViewFinancial ? `$${formatCurrency(order.total)}` : '***'}
                    </p>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <th className="px-8 py-4">ID Pedido</th>
                      <th className="px-8 py-4">Cliente</th>
                      <th className="px-8 py-4">Estado</th>
                      <th className="px-8 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-sm">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-8 py-4 font-bold">#{order.id}</td>
                        <td className="px-8 py-4 text-on-surface-variant">{order.customer}</td>
                        <td className="px-8 py-4">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-right font-bold text-primary">
                          {canViewFinancial ? `$${formatCurrency(order.total)}` : '***'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-10 md:p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">receipt_long</span>
              <p className="text-on-surface-variant font-medium">Aún no hay pedidos.</p>
              <p className="text-on-surface-variant/60 text-sm mt-1">Los pedidos de clientes aparecerán acá en tiempo real.</p>
            </div>
          )}
        </div>

        {/* Inventory Alerts */}
        <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-outline-variant/5 flex flex-col h-full md:max-h-[640px]">
          <div className="px-5 py-4 md:p-8 border-b border-outline-variant/10 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (selectedForReport.size === lowStockProducts.length) setSelectedForReport(new Set());
                  else setSelectedForReport(new Set(lowStockProducts.map(p => p.id)));
                }}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedForReport.size === lowStockProducts.length ? 'bg-primary border-primary text-white' : 'border-outline-variant/30 text-transparent'}`}
              >
                <span className="material-symbols-outlined text-[14px] font-bold">check</span>
              </button>
              <h2 className="text-xl font-bold">Alertas de Stock</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLowStockDashboardProducts({ page, limit })}
                title="Actualizar análisis de reposición"
                className="p-1.5 rounded-xl hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-on-surface"
              >
                <span className={`material-symbols-outlined text-[18px] ${lowStockDashboardLoading ? 'animate-spin text-primary' : ''}`}>
                  refresh
                </span>
              </button>
              <button
                onClick={() => navigate('/admin/inventory')}
                className="text-primary text-sm font-bold hover:underline"
              >
                Inventario
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {lowStockProducts.length > 0 ? (
              <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                {lowStockProducts.map((product) => {
                  const amount = replenishAmounts[product.id] ?? '50';
                  const isSelected = selectedForReport.has(product.id);
                  return (
                    <div key={product.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isSelected ? 'bg-surface-container-low border-outline-variant/10' : 'bg-white border-transparent opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSelectForReport(product.id)}
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary text-white shadow-sm' : 'border-outline-variant/30 text-transparent'}`}
                        >
                          <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                        </button>
                        <div className="w-10 h-10 bg-white rounded-xl p-1 flex items-center justify-center shadow-sm">
                          <img src={product.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                        </div>
                        <div>
                          <p className="text-xs font-bold leading-tight line-clamp-1">{product.name}</p>
                          <p className={`text-[10px] font-bold mt-1 ${product.stock === 0 ? 'text-error' : 'text-orange-500'}`}>
                            {product.stock === 0 ? 'SIN STOCK' : `${product.stock} unidades`}
                          </p>
                          {(product as ProductWithReplenishment).replenishmentResult?.etiquetaMargen && (
                            <p className="text-[9px] text-on-surface-variant/70 font-semibold mt-0.5 leading-tight">
                              {(product as ProductWithReplenishment).replenishmentResult!.etiquetaMargen}
                            </p>
                          )}
                          {(product as ProductWithReplenishment).replenishmentResult?.diasCobertura != null && (
                            <p className="text-[9px] font-bold mt-0.5">
                              <span className="text-on-surface-variant/60">Cobertura: </span>
                              <span className={`${
                                ((product as ProductWithReplenishment).replenishmentResult!.diasCobertura ?? Infinity) <= 3
                                  ? 'text-error'
                                  : ((product as ProductWithReplenishment).replenishmentResult!.diasCobertura ?? Infinity) <= 7
                                    ? 'text-orange-500'
                                    : 'text-emerald-600'
                              }`}>
                                {(product as ProductWithReplenishment).replenishmentResult!.diasCobertura!.toFixed(1)} días
                              </span>
                              {(product as ProductWithReplenishment).replenishmentResult?.cantidadRecomendada != null && (
                                <span className="text-blue-600 ml-1">· Comprar {(product as ProductWithReplenishment).replenishmentResult!.cantidadRecomendada}</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant/40">+</span>
                          <input
                            type="number"
                            value={amount}
                            onChange={e => setReplenishAmounts({ ...replenishAmounts, [product.id]: e.target.value })}
                            className="w-14 h-8 pl-4 pr-1 bg-white border border-outline-variant/10 rounded-lg text-xs font-bold focus:ring-2 ring-primary/10 outline-none text-center"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const toAdd = parseInt(amount) || 0;
                            if (toAdd > 0) {
                              updateStock(product.id, product.stock + toAdd);
                              setReplenishAmounts({ ...replenishAmounts, [product.id]: '50' });
                            }
                          }}
                          className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-primary/90 transition-all shadow-sm shrink-0"
                          title="Guardar reposición"
                        >
                          <span className="material-symbols-outlined text-[18px]">done</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center flex-1 flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-5xl text-green-300 mb-4">check_circle</span>
                <p className="text-on-surface-variant font-medium">Todo en orden.</p>
                <p className="text-on-surface-variant/60 text-sm mt-1">No hay productos con stock bajo.</p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {lowStockProducts.length > 0 && (
            <div className="p-4 border-t border-outline-variant/5 flex items-center justify-between bg-surface-container-lowest">
              <p className="text-xs text-on-surface-variant font-bold">
                Mostrando {(page - 1) * limit + 1}-{Math.min(page * limit, lowStockCount)} de {lowStockCount}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-surface-container-low disabled:opacity-50 text-xs font-bold rounded-xl hover:bg-surface-container transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * limit >= lowStockCount}
                  className="px-3 py-1.5 bg-surface-container-low disabled:opacity-50 text-xs font-bold rounded-xl hover:bg-surface-container transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          <div className="p-6 pt-0 mt-auto border-t border-outline-variant/5">
            <button
              onClick={handleGenerateStockReport}
              className="w-full mt-6 bg-primary text-white font-bold py-4 rounded-2xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={lowStockProducts.length === 0 || isGeneratingReport}
            >
              {isGeneratingReport ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Generando Lista Completa...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                  Generar Lista de Compra
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function getStatusColor(status: string): string {
  switch (status) {
    case 'Nuevo': return 'bg-blue-100 text-blue-700';
    case 'Preparando': return 'bg-orange-100 text-orange-600';
    case 'En Camino': return 'bg-purple-100 text-purple-600';
    case 'Entregado': return 'bg-green-100 text-green-600';
    case 'Cancelado': return 'bg-error/10 text-error';
    default: return 'bg-surface-container-low text-on-surface-variant';
  }
}
