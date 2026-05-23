
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin, AdminOrder } from '../../context/AdminContext';
import { AdminPeriodSelector, PERIOD_DAYS } from '../../components/AdminPeriodSelector';
import { PermissionGuard } from '../../components/auth/PermissionGuard';
import { useAuthStore } from '../../stores/useAuthStore';

export const AdminOrders: React.FC = () => {
  const { orders, updateOrderStatus, updateOrderMethod, updateOrderPaymentMethod, getOrderTimestamp , formatCurrency} = useAdmin();
  const [activeStatus, setActiveStatus] = useState('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelModalData, setCancelModalData] = useState<AdminOrder | null>(null);

  const { hasPermission, employeeProfile } = useAuthStore();
  const canViewRevenue = employeeProfile?.role === 'super_admin' || employeeProfile?.role === 'owner' || hasPermission('orders.view_revenue');

  const [period, setPeriod] = useState('Últimos 7 días');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById('admin-header-portal'));
  }, []);

  // Enforce 7 days period for common employees
  React.useEffect(() => {
    if (employeeProfile?.role === 'employee' && period !== 'Últimos 7 días') {
      setPeriod('Últimos 7 días');
    }
  }, [employeeProfile, period]);

  const [sortField, setSortField] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const analyticsParams = useMemo(() => {
    if (period === 'Personalizado' && customRange.from && customRange.to) {
      return { from: new Date(customRange.from).getTime(), to: new Date(customRange.to).getTime() + 86400000 };
    }
    return PERIOD_DAYS[period] || 7;
  }, [period, customRange]);

  const filteredByPeriod = useMemo(() => {
    let from: number;
    let to: number = Date.now();
    if (typeof analyticsParams === 'number') {
      from = to - analyticsParams * 24 * 60 * 60 * 1000;
    } else {
      from = analyticsParams.from;
      to = analyticsParams.to;
    }
    return orders.filter(o => {
      const ts = getOrderTimestamp(o);
      return ts >= from && ts <= to && o.source !== 'pos';
    });
  }, [orders, analyticsParams]);

  const sortedAndFilteredOrders = useMemo(() => {
    let result = activeStatus === 'todos' ? filteredByPeriod : filteredByPeriod.filter(o => o.status === activeStatus);

    return [...result].sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (sortField === 'date') {
        valA = getOrderTimestamp(a);
        valB = getOrderTimestamp(b);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredByPeriod, activeStatus, sortField, sortOrder]);

  const statusTabs = [
    { key: 'todos', label: 'Todos', count: filteredByPeriod.length },
    { key: 'Nuevo', label: 'Nuevos', count: filteredByPeriod.filter(o => o.status === 'Nuevo').length },
    { key: 'Preparando', label: 'Preparando', count: filteredByPeriod.filter(o => o.status === 'Preparando').length },
    { key: 'En Camino', label: 'En Camino', count: filteredByPeriod.filter(o => o.status === 'En Camino').length },
    { key: 'Entregado', label: 'Entregados', count: filteredByPeriod.filter(o => o.status === 'Entregado').length },
  ];

  const periodRevenue = filteredByPeriod.filter(o => o.status !== 'Cancelado').reduce((sum, o) => sum + o.total, 0);
  const activeCount = filteredByPeriod.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado').length;
  const preparingCount = filteredByPeriod.filter(o => o.status === 'Preparando').length;

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };

  const nextStatus = (current: AdminOrder['status']): AdminOrder['status'] => {
    const flow: Record<string, AdminOrder['status']> = { 'Nuevo': 'Preparando', 'Preparando': 'En Camino', 'En Camino': 'Entregado' };
    return flow[current] || current;
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-4 md:p-6 rounded-3xl md:rounded-[2.5rem] border border-outline-variant/10 shadow-sm">
          <p className="text-[9px] md:text-[11px] font-black text-on-surface-variant uppercase tracking-[0.15em] mb-2 md:mb-3">Pedidos Activos</p>
          <p className="text-2xl md:text-4xl font-bold text-on-background">{activeCount}</p>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-3xl md:rounded-[2.5rem] border border-outline-variant/10 shadow-sm">
          <p className="text-[9px] md:text-[11px] font-black text-on-surface-variant uppercase tracking-[0.15em] mb-2 md:mb-3">En Preparación</p>
          <p className="text-2xl md:text-4xl font-bold text-on-background">{preparingCount}</p>
        </div>
        <PermissionGuard permission="orders.view_revenue">
          <div className="bg-white p-4 md:p-6 rounded-3xl md:rounded-[2.5rem] border border-outline-variant/10 shadow-sm col-span-2 md:col-span-1">
            <p className="text-[9px] md:text-[11px] font-black text-on-surface-variant uppercase tracking-[0.15em] mb-2 md:mb-3">Ingresos Período</p>
            <p className="text-2xl md:text-4xl font-bold text-primary">${formatCurrency(periodRevenue)}</p>
          </div>
        </PermissionGuard>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-outline-variant/5 overflow-hidden">
        <div className="p-4 md:p-8 border-b border-outline-variant/10">
          {/* Desktop Filter Tabs */}
          <div className="hidden md:flex bg-surface-container-low p-1 rounded-2xl w-full overflow-x-auto">
            {statusTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeStatus === tab.key ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Mobile Filter Tabs (2 rows, no horizontal scrolling) */}
          <div className="flex md:hidden flex-col gap-1.5 bg-surface-container-low p-1.5 rounded-2xl w-full">
            {/* Row 1: First 2 tabs (Todos, Nuevos) */}
            <div className="grid grid-cols-2 gap-1.5">
              {statusTabs.slice(0, 2).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeStatus === tab.key ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            {/* Row 2: Remaining 3 tabs (Preparando, En Camino, Entregados) */}
            <div className="grid grid-cols-3 gap-1">
              {statusTabs.slice(2).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`px-1 py-2 rounded-xl text-[10px] font-bold transition-all whitespace-nowrap text-center ${activeStatus === tab.key ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        {sortedAndFilteredOrders.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                    <th className="px-6 py-5 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('id')}>
                      <div className="flex items-center gap-2">ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('date')}>
                      <div className="flex items-center gap-2">Fecha {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('customer')}>
                      <div className="flex items-center gap-2">Cliente {sortField === 'customer' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 text-center cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('method')}>
                      <div className="flex items-center justify-center gap-2">Método {sortField === 'method' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('paymentStatus')}>
                      <div className="flex items-center gap-2">Pago {sortField === 'paymentStatus' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-2">Estado {sortField === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('total')}>
                      <div className="flex items-center justify-end gap-2">Total {sortField === 'total' && (sortOrder === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 text-sm">
                  {sortedAndFilteredOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr className="hover:bg-surface-container-lowest transition-colors border-b border-outline-variant/5">
                        <td className="px-6 py-5 font-black text-on-background">#{order.id}</td>
                        <td className="px-6 py-5 text-on-surface-variant text-xs leading-tight font-medium">{order.date}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-surface-container-low rounded-xl flex items-center justify-center text-primary border border-outline-variant/10">
                              <span className="material-symbols-outlined text-[20px]">person</span>
                            </div>
                            <div>
                              <span className="font-bold text-on-background text-sm">{order.customer}</span>
                              <p className="text-[10px] text-on-surface-variant font-medium">{order.phone || 'Sin teléfono'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wider ${order.method === 'Retiro' ? 'bg-green-50 text-green-600 border border-green-200/50' : 'bg-orange-50 text-orange-600 border border-orange-200/50'}`}>
                            <span className="material-symbols-outlined text-[14px]">{order.method === 'Retiro' ? 'storefront' : 'local_shipping'}</span>
                            {order.method === 'Retiro' ? 'Retiro' : 'Envío'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${order.paymentStatus === 'Pagado' ? 'bg-green-500 shadow-green-200' : 'bg-orange-400 shadow-orange-200'}`}></div>
                            <span className="font-bold text-xs text-on-surface-variant">{order.paymentStatus}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-black text-primary text-base">
                              {canViewRevenue ? `$${formatCurrency(order.total)}` : '***'}
                            </span>
                            {canViewRevenue && order.paidAmount !== undefined && order.paidAmount > 0 && order.paymentStatus !== 'Pagado' && (
                              <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1">
                                Saldado: ${formatCurrency(order.paidAmount || 0)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                              className="w-8 h-8 rounded-xl bg-surface-container-low text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                              title="Ver detalles"
                            >
                              <span className="material-symbols-outlined text-[18px]">{expandedId === order.id ? 'expand_less' : 'visibility'}</span>
                            </button>
                            {order.phone && (
                              <button
                                onClick={() => {
                                   const msg = `*Hola ${order.customer}!* 👋 Te hablamos de *La Martina*.\n\nTu pedido *#${order.id}* por *$${formatCurrency(order.total, true, true)}* se registró con éxito. ¡Ya lo estamos preparando! 🏪`;
                                   window.open(`https://wa.me/${order.phone.replace(/\s+/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                                }}
                                className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-all shadow-sm"
                                title="Notificar por WhatsApp"
                              >
                                <span className="material-symbols-outlined text-[18px]">chat</span>
                              </button>
                            )}
                            {order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                              <>
                                <PermissionGuard permission="orders.update_status">
                                  <button
                                    onClick={() => updateOrderStatus(order.id, nextStatus(order.status))}
                                    className="w-8 h-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                                    title={`Avanzar a: ${nextStatus(order.status)}`}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">fast_forward</span>
                                  </button>
                                </PermissionGuard>
                                <PermissionGuard permission="orders.cancel">
                                  <button
                                    onClick={() => setCancelModalData(order)}
                                    className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                    title="Cancelar Pedido"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                  </button>
                                </PermissionGuard>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === order.id && (
                        <tr>
                          <td colSpan={8} className="bg-surface-container-lowest/50 px-8 py-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Productos</h4>
                                <div className="space-y-3">
                                  {order.items.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between border-b border-outline-variant/5 pb-2 last:border-0">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-surface-container-low rounded-xl overflow-hidden p-1">
                                          <img src={item.image} alt="" className="w-full h-full object-contain" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-bold leading-tight">{item.name}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">
                                            {item.quantity}x ${formatCurrency(item.price)}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="text-xs font-bold">${formatCurrency(item.price * item.quantity)}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Entrega</h4>
                                    <p className="text-xs flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-primary">location_on</span>{order.address || 'No especificada'}</p>
                                    <p className="text-xs flex items-center gap-2 mt-1"><span className="material-symbols-outlined text-[16px] text-primary">schedule</span>{order.deliveryTime}</p>
                                  </div>
                                  <div>
                                    <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Pago</h4>
                                    {!hasPermission('orders.update_status') ? (
                                      <p className="text-xs flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-[16px] text-primary">
                                          {order.paymentMethod === 'cash' ? 'payments' : order.paymentMethod === 'card' ? 'credit_card' : order.paymentMethod === 'cuenta_corriente' ? 'menu_book' : 'account_balance'}
                                        </span>
                                        <span className="capitalize font-medium">
                                          {order.paymentMethod === 'cash' ? 'Efectivo' : order.paymentMethod === 'card' ? 'Tarjeta' : order.paymentMethod === 'cuenta_corriente' ? 'Cta. Corriente' : 'Transferencia'}
                                        </span>
                                      </p>
                                    ) : (
                                      <div className="relative inline-block mt-0.5">
                                        <select
                                          value={order.paymentMethod}
                                          onChange={(e) => updateOrderPaymentMethod(order.id, e.target.value)}
                                          className="pl-9 pr-7 py-1 rounded-lg text-xs font-bold bg-white text-on-surface border border-outline-variant/20 appearance-none focus:outline-none cursor-pointer hover:border-primary/50 transition-all"
                                        >
                                          <option value="cash">Efectivo</option>
                                          <option value="card">Tarjeta</option>
                                          <option value="transfer">Transferencia</option>
                                          <option value="cuenta_corriente">Cta. Corriente</option>
                                        </select>
                                        <span className="material-symbols-outlined text-[14px] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                                          {order.paymentMethod === 'cash' ? 'payments' : order.paymentMethod === 'card' ? 'credit_card' : order.paymentMethod === 'cuenta_corriente' ? 'menu_book' : 'account_balance'}
                                        </span>
                                        <span className="material-symbols-outlined text-[14px] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                                          arrow_drop_down
                                        </span>
                                      </div>
                                    )}
                                    <div className="mt-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant/10 text-xs">
                                      <div className="flex justify-between mb-1 font-bold">
                                        <span className="text-on-surface-variant">Subtotal</span>
                                        <span className="text-on-background">${formatCurrency(order.total + (order.discount || 0))}</span>
                                      </div>
                                      {order.discount !== undefined && order.discount > 0 && (
                                        <div className="flex justify-between mb-1 font-bold text-error">
                                          <span>Descuento ({order.discountLabel || 'Oferta'})</span>
                                          <span>-${formatCurrency(order.discount)}</span>
                                        </div>
                                      )}
                                      <div className="border-t border-outline-variant/20 my-1 pt-1 flex justify-between font-black text-primary">
                                        <span>Total</span>
                                        <span>${formatCurrency(order.total)}</span>
                                      </div>
                                    </div>

                                    {order.paidAmount !== undefined && order.paidAmount > 0 && (
                                      <div className="mt-2 p-3 bg-green-50/50 rounded-xl border border-green-200/30 text-xs">
                                        <div className="flex justify-between mb-1 font-bold text-green-600">
                                          <span className="uppercase tracking-tighter">Monto Pagado</span>
                                          <span>-${formatCurrency(order.paidAmount || 0)}</span>
                                        </div>
                                        <div className="border-t border-green-200/50 my-1 pt-1 flex justify-between font-black text-primary">
                                          <span className="uppercase tracking-tighter">Pendiente</span>
                                          <span>${formatCurrency(order.total - (order.paidAmount || 0))}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Cambiar Estado</h4>
                                  <div className="flex gap-2 flex-wrap">
                                    {(['Nuevo', 'Preparando', 'En Camino', 'Entregado'] as const).map(s => (
                                      <PermissionGuard permission="orders.update_status" key={s}>
                                        <button
                                          onClick={() => updateOrderStatus(order.id, s)}
                                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${order.status === s
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white border-outline-variant/20 text-on-surface-variant hover:border-primary/50'
                                            }`}
                                        >
                                          {s}
                                        </button>
                                      </PermissionGuard>
                                    ))}
                                  </div>
                                </div>
                                {order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                                  <PermissionGuard permission="orders.cancel">
                                    <div className="pt-2 border-t border-outline-variant/10">
                                      <button
                                        onClick={() => setCancelModalData(order)}
                                        className="w-full py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-all border border-red-200/30 flex items-center justify-center gap-1.5"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                                        Cancelar Pedido
                                      </button>
                                    </div>
                                  </PermissionGuard>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-outline-variant/10">
              {sortedAndFilteredOrders.map((order) => {
                const isExpanded = expandedId === order.id;
                return (
                  <div key={order.id} className="p-4 space-y-3.5 hover:bg-surface-container-lowest transition-colors">
                    {/* Header: ID, Date, Status */}
                    <div className="flex items-center justify-between">
                      <span className="font-black text-on-background text-base">#{order.id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-on-surface-variant font-medium leading-none">{order.date}</span>
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>

                    {/* Customer & Total row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 bg-surface-container-low rounded-lg flex items-center justify-center text-primary border border-outline-variant/10 flex-shrink-0">
                          <span className="material-symbols-outlined text-[18px]">person</span>
                        </div>
                        <div className="leading-tight min-w-0">
                          <p className="font-bold text-on-background text-sm truncate">{order.customer}</p>
                          <p className="text-[10px] text-on-surface-variant font-medium truncate">{order.phone || 'Sin teléfono'}</p>
                        </div>
                      </div>
                      
                      {/* Total */}
                      <div className="text-right leading-tight flex-shrink-0">
                        <p className="font-black text-primary text-base">
                          {canViewRevenue ? `$${formatCurrency(order.total)}` : '***'}
                        </p>
                        {canViewRevenue && order.paidAmount !== undefined && order.paidAmount > 0 && order.paymentStatus !== 'Pagado' && (
                          <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                            Saldado: ${formatCurrency(order.paidAmount || 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Badges: Method, Payment Status, Payment Method */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {/* Delivery Method */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider ${order.method === 'Retiro' ? 'bg-green-50 text-green-600 border border-green-200/30' : 'bg-orange-50 text-orange-600 border border-orange-200/30'}`}>
                        <span className="material-symbols-outlined text-[12px]">{order.method === 'Retiro' ? 'storefront' : 'local_shipping'}</span>
                        {order.method === 'Retiro' ? 'Retiro' : 'Envío'}
                      </span>

                      {/* Payment Status Light */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold border ${order.paymentStatus === 'Pagado' ? 'bg-green-50/50 text-green-600 border-green-200/30' : 'bg-orange-50/50 text-orange-600 border-orange-200/30'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${order.paymentStatus === 'Pagado' ? 'bg-green-500 shadow-[0_0_6px] shadow-green-400' : 'bg-orange-400 shadow-[0_0_6px] shadow-orange-300'}`}></div>
                        {order.paymentStatus}
                      </span>

                      {/* Payment Method Selector */}
                      {!hasPermission('orders.update_status') ? (
                        <span className="inline-flex items-center gap-2.5 px-2.5 py-1 rounded-lg text-[9px] font-bold bg-surface-container-low text-on-surface-variant border border-outline-variant/10">
                          <span className="material-symbols-outlined text-[12px]">
                            {order.paymentMethod === 'cash' ? 'payments' : order.paymentMethod === 'card' ? 'credit_card' : order.paymentMethod === 'cuenta_corriente' ? 'menu_book' : 'account_balance'}
                          </span>
                          <span className="capitalize">
                            {order.paymentMethod === 'cash' ? 'Efectivo' : order.paymentMethod === 'card' ? 'Tarjeta' : order.paymentMethod === 'cuenta_corriente' ? 'Cta. Corriente' : 'Transferencia'}
                          </span>
                        </span>
                      ) : (
                        <div className="relative inline-block">
                          <select
                            value={order.paymentMethod}
                            onChange={(e) => updateOrderPaymentMethod(order.id, e.target.value)}
                            className="pl-9 pr-6 py-1 rounded-lg text-[9px] font-bold bg-surface-container-low text-on-surface-variant border border-outline-variant/10 appearance-none focus:outline-none cursor-pointer hover:bg-surface-container-medium transition-all"
                          >
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta</option>
                            <option value="transfer">Transferencia</option>
                            <option value="cuenta_corriente">Cta. Corriente</option>
                          </select>
                          <span className="material-symbols-outlined text-[12px] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                            {order.paymentMethod === 'cash' ? 'payments' : order.paymentMethod === 'card' ? 'credit_card' : order.paymentMethod === 'cuenta_corriente' ? 'menu_book' : 'account_balance'}
                          </span>
                          <span className="material-symbols-outlined text-[12px] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                            arrow_drop_down
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Touch Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/5">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${isExpanded ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' : 'bg-surface-container-low text-primary hover:bg-surface-container-medium'}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">{isExpanded ? 'expand_less' : 'visibility'}</span>
                        {isExpanded ? 'Ocultar' : 'Ver productos'}
                      </button>

                      {order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                        <PermissionGuard permission="orders.update_status">
                          <button
                            onClick={() => updateOrderStatus(order.id, nextStatus(order.status))}
                            className="flex-1 h-9 rounded-xl text-xs font-bold bg-primary text-white flex items-center justify-center gap-1 transition-all hover:bg-primary-dark shadow-sm"
                            title={`Avanzar a: ${nextStatus(order.status)}`}
                          >
                            <span className="material-symbols-outlined text-[16px]">fast_forward</span>
                            {order.status === 'Nuevo' ? 'Preparar' : order.status === 'Preparando' ? 'Enviar' : 'Entregar'}
                          </button>
                        </PermissionGuard>
                      )}


                      {order.phone && (
                        <button
                          onClick={() => {
                            const msg = `*Hola ${order.customer}!* 👋 Te hablamos de *La Martina*.\n\nTu pedido *#${order.id}* por *$${formatCurrency(order.total, true, true)}* se registró con éxito. ¡Ya lo estamos preparando! 🏪`;
                            window.open(`https://wa.me/${order.phone.replace(/\s+/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                          }}
                          className="w-10 h-9 rounded-xl bg-green-50 text-green-600 flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-all border border-green-200/30 flex-shrink-0"
                          title="Notificar por WhatsApp"
                        >
                          <span className="material-symbols-outlined text-[16px]">chat</span>
                        </button>
                      )}
                    </div>

                    {/* Accordion/Expanded panel */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-outline-variant/10 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* Products List */}
                        <div>
                          <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider mb-2">Productos</h4>
                          <div className="space-y-2.5">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between border-b border-outline-variant/5 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-9 h-9 bg-surface-container-low rounded-lg overflow-hidden p-0.5 border border-outline-variant/10 flex-shrink-0 flex items-center justify-center">
                                    <img src={item.image} alt="" className="w-full h-full object-contain" />
                                  </div>
                                  <div className="leading-tight min-w-0">
                                    <p className="text-xs font-bold text-on-background truncate">{item.name}</p>
                                    <p className="text-[9px] text-on-surface-variant font-semibold">
                                      {item.quantity}x ${formatCurrency(item.price)}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs font-bold text-on-background flex-shrink-0">${formatCurrency(item.price * item.quantity)}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Delivery address & times */}
                        <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/10 space-y-1.5 text-xs">
                          <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider mb-1">Información de Entrega</h4>
                          <p className="flex items-center gap-2 text-on-surface font-medium">
                            <span className="material-symbols-outlined text-[15px] text-primary">location_on</span>
                            {order.address || 'No especificada'}
                          </p>
                          <p className="flex items-center gap-2 text-on-surface font-medium">
                            <span className="material-symbols-outlined text-[15px] text-primary">schedule</span>
                            {order.deliveryTime}
                          </p>
                        </div>

                        {/* Price Breakdown */}
                        <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/10 text-xs space-y-1.5">
                          <div className="flex justify-between font-bold">
                            <span className="text-on-surface-variant">Subtotal</span>
                            <span className="text-on-background">${formatCurrency(order.total + (order.discount || 0))}</span>
                          </div>
                          {order.discount !== undefined && order.discount > 0 && (
                            <div className="flex justify-between font-bold text-error">
                              <span>Descuento ({order.discountLabel || 'Oferta'})</span>
                              <span>-${formatCurrency(order.discount)}</span>
                            </div>
                          )}
                          <div className="border-t border-outline-variant/20 my-1 pt-1 flex justify-between font-black text-primary">
                            <span>Total</span>
                            <span>${formatCurrency(order.total)}</span>
                          </div>

                          {order.paidAmount !== undefined && order.paidAmount > 0 && (
                            <div className="mt-2 pt-2 border-t border-outline-variant/15 space-y-1">
                              <div className="flex justify-between font-bold text-green-600 text-[10px]">
                                <span className="uppercase tracking-tighter">Monto Pagado</span>
                                <span>-${formatCurrency(order.paidAmount || 0)}</span>
                              </div>
                              <div className="flex justify-between font-black text-primary text-[10px]">
                                <span className="uppercase tracking-tighter">Pendiente</span>
                                <span>${formatCurrency(order.total - (order.paidAmount || 0))}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status Transition buttons inside card */}
                        <div className="space-y-2">
                          <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider">Cambiar Estado</h4>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(['Nuevo', 'Preparando', 'En Camino', 'Entregado'] as const).map(s => (
                              <PermissionGuard permission="orders.update_status" key={s}>
                                <button
                                  onClick={() => updateOrderStatus(order.id, s)}
                                  className={`w-full py-2 rounded-xl text-[10px] font-bold border transition-all text-center ${order.status === s
                                    ? 'bg-primary text-white border-primary shadow-sm'
                                    : 'bg-white border-outline-variant/20 text-on-surface-variant hover:border-primary/50'
                                    }`}
                                >
                                  {s}
                                </button>
                              </PermissionGuard>
                            ))}
                          </div>
                          
                          {order.status !== 'Entregado' && order.status !== 'Cancelado' && (
                            <PermissionGuard permission="orders.cancel">
                              <div className="pt-2 border-t border-outline-variant/10">
                                <button
                                  onClick={() => setCancelModalData(order)}
                                  className="w-full py-2 rounded-xl text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-all border border-red-200/30 flex items-center justify-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                                  Cancelar Pedido
                                </button>
                              </div>
                            </PermissionGuard>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-16 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4">receipt_long</span>
            <p className="text-on-surface-variant font-medium">No hay pedidos en esta categoría.</p>
          </div>
        )}
      </div>
      {/* Modal de Confirmación de Cancelación */}
      {cancelModalData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCancelModalData(null)} />
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 p-8 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[40px]">order_approve</span>
            </div>
            <h3 className="text-xl font-black text-on-background mb-2">¿Cancelar Pedido?</h3>
            <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
              ¿Estás seguro de cancelar el pedido <span className="font-bold text-on-background">#{cancelModalData.id}</span> de <span className="font-bold text-on-background">{cancelModalData.customer}</span>?
              <br /><br />
              <span className="text-[10px] uppercase font-black text-red-500">Se enviará aviso por WhatsApp</span>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  updateOrderStatus(cancelModalData.id, 'Cancelado');
                  const msg = `*Hola ${cancelModalData.customer}!* 👋 Te hablamos de *La Martina*.\n\nTu pedido *#${cancelModalData.id}* por *$${formatCurrency(cancelModalData.total, true, true)}* ha sido cancelado. ¡Lo lamentamos! 🏪`;
                  window.open(`https://wa.me/${cancelModalData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                  setCancelModalData(null);
                }}
                className="w-full bg-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/20 transition-transform active:scale-[0.98]"
              >
                Sí, Cancelar y Notificar
              </button>
              <button
                onClick={() => setCancelModalData(null)}
                className="w-full text-on-surface-variant font-bold py-4 rounded-2xl hover:bg-surface-container-low transition-colors"
              >
                Volver atrás
              </button>
            </div>
          </div>
        </div>
      )}
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














