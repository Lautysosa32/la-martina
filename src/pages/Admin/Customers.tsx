import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import type { AdminCustomer, AdminOrder } from '../../context/AdminContext';

export const Customers: React.FC = () => {
  const { customers, orders, toggleCurrentAccount, updateCustomerProfile, settleCurrentAccount, formatCurrency, addManualCustomer, deleteCustomer } = useAdmin();
  const [headerPortal, setHeaderPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderPortal(document.getElementById('admin-header-portal'));
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('All');
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomer | null>(null);
  const [ccError, setCcError] = useState<string | null>(null);
  const [settleModalData, setSettleModalData] = useState<{ phone: string, name: string, debt: number } | null>(null);
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleType, setSettleType] = useState<'total' | 'parcial'>('total');
  const [partialAmount, setPartialAmount] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editBirthday, setEditBirthday] = useState('');

  // New Customer Modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ nombre: '', apellido: '', telefono: '', direccion: '', dni: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ phone: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Map simulated selector states
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedMapLocation, setSelectedMapLocation] = useState<string | null>(null);

  const landmarks = [
    { name: "Av. San Martín 1230, Ciudad", desc: "Cerca de Plaza Independencia", coords: { x: 45, y: 30 } },
    { name: "Calle Belgrano 450, Godoy Cruz", desc: "Frente al Municipio", coords: { x: 60, y: 55 } },
    { name: "Las Heras 780, Mendoza", desc: "Zona comercial", coords: { x: 30, y: 70 } },
    { name: "B° Las Rosas, Manzana A Casa 12", desc: "Barrio residencial", coords: { x: 75, y: 25 } },
    { name: "Av. Emilio Civit 240, Mendoza", desc: "Zona Quinta Sección", coords: { x: 20, y: 40 } },
  ];



  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Gold': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Silver': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Bronze': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-surface-container-low text-on-surface-variant border-outline-variant/10';
    }
  };

  // Stats Calculations
  const stats = useMemo(() => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    const total = customers.length;
    const prevTotal = customers.filter(c => {
      const ts = orders.find(o => o.phone === c.phone)?.timestamp || 0;
      return ts < startOfThisMonth;
    }).length || 1;
    const totalGrowth = ((total - prevTotal) / prevTotal * 100).toFixed(1);

    const active = customers.filter(c => c.totalOrders > 0).length;
    const prevActive = customers.filter(c => {
      return orders.some(o => o.phone === c.phone && (o.timestamp || 0) < startOfThisMonth);
    }).length || 1;
    const activeGrowth = ((active - prevActive) / prevActive * 100).toFixed(1);

    const isNewThisMonth = (c: AdminCustomer) => {
      const customerOrders = orders.filter(o => o.phone === c.phone).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return customerOrders.length > 0 && (customerOrders[0].timestamp || 0) >= startOfThisMonth;
    };
    const newCount = customers.filter(isNewThisMonth).length;

    const isNewLastMonth = (c: AdminCustomer) => {
      const customerOrders = orders.filter(o => o.phone === c.phone).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return customerOrders.length > 0 && (customerOrders[0].timestamp || 0) >= startOfLastMonth && (customerOrders[0].timestamp || 0) < startOfThisMonth;
    };
    const prevNewCount = customers.filter(isNewLastMonth).length || 1;
    const newGrowth = ((newCount - prevNewCount) / prevNewCount * 100).toFixed(1);

    return { total, totalGrowth, active, activeGrowth, newCount, newGrowth };
  }, [customers, orders]);

  const [sortConfigs, setSortConfigs] = useState<{ key: string, direction: 'asc' | 'desc' }[]>([]);

  const handleSort = (key: string, isMulti: boolean) => {
    setSortConfigs(prev => {
      const existing = prev.find(c => c.key === key);
      let nextDirection: 'asc' | 'desc' | null = 'asc';
      if (existing) {
        if (existing.direction === 'asc') nextDirection = 'desc';
        else nextDirection = null;
      }
      const newConfig = { key, direction: nextDirection || 'asc' };
      if (isMulti) {
        const filtered = prev.filter(c => c.key !== key);
        return nextDirection ? [...filtered, newConfig] : filtered;
      }
      return nextDirection ? [newConfig] : [];
    });
  };

  const sortedCustomers = useMemo(() => {
    const result = customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery);
      const matchesTier = tierFilter === 'All' || c.tier === tierFilter;
      return matchesSearch && matchesTier;
    });

    if (sortConfigs.length > 0) {
      result.sort((a, b) => {
        for (const config of sortConfigs) {
          let valA: any = a[config.key as keyof AdminCustomer] ?? '';
          let valB: any = b[config.key as keyof AdminCustomer] ?? '';

          if (config.key === 'tier') {
            valA = a.spent30;
            valB = b.spent30;
          }

          if (config.key === 'lastOrder') {
            const parseDate = (d: string) => {
              const [date, time] = d.split(', ');
              const [day, month, year] = date.split('/');
              return new Date(`${year}-${month}-${day}T${time}`).getTime();
            };
            valA = parseDate(a.lastOrder);
            valB = parseDate(b.lastOrder);
          }

          if (valA < valB) return config.direction === 'asc' ? -1 : 1;
          if (valA > valB) return config.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return result;
  }, [customers, orders, searchQuery, tierFilter, sortConfigs]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleExportCSV = () => {
    const headers = ['Nombre', 'Telefono', 'Direccion', 'Pedidos Totales', 'Total Gastado', 'Ultimo Pedido', 'Nivel'];
    const rows = sortedCustomers.map(c => [
      c.name,
      c.phone,
      `"${c.address}"`,
      c.totalOrders,
      c.totalSpent,
      c.lastOrder,
      c.tier
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clientes_la_martina_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px]">
      {/* Header Portal for Buttons */}
      {headerPortal && createPortal(
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setShowNewCustomerModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2 rounded-full transition-colors shadow-lg shadow-primary/20 text-xs"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            Nuevo Cliente
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-6 py-2 rounded-full transition-colors shadow-sm text-xs"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Exportar CSV
          </button>
        </div>,
        headerPortal
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'TOTAL CLIENTES', val: stats.total, growth: stats.totalGrowth, icon: 'group', color: 'red' },
          { label: 'MIEMBROS ACTIVOS', val: stats.active, growth: stats.activeGrowth, icon: 'verified', color: 'yellow' },
          { label: 'NUEVOS ESTE MES', val: stats.newCount, growth: stats.newGrowth, icon: 'person_add', color: 'gray' }
        ].map((s, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 bg-${s.color}-50 text-${s.color === 'gray' ? 'gray-500' : s.color === 'red' ? 'red-500' : 'yellow-600'} rounded-2xl flex items-center justify-center`}>
                <span className="material-symbols-outlined">{s.icon}</span>
              </div>
              <span className={`${parseFloat(s.growth) >= 0 ? 'text-green-500' : 'text-red-500'} text-xs font-bold flex items-center gap-0.5`}>
                {parseFloat(s.growth) >= 0 ? '+' : ''}{formatCurrency(parseFloat(s.growth), false)}%
                <span className="material-symbols-outlined text-[14px]">
                  {parseFloat(s.growth) >= 0 ? 'trending_up' : 'trending_down'}
                </span>
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-4xl font-black text-on-background">{formatCurrency(s.val, false)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Table Area */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-outline-variant/5 overflow-hidden">
        {/* Filters */}
        <div className="p-6 border-b border-outline-variant/10 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">filter_list</span>
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o DNI..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10 transition-all"
            />
          </div>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="bg-surface-container-low border-none rounded-2xl px-5 py-3 text-sm font-bold outline-none cursor-pointer focus:ring-2 ring-primary/10 transition-all"
          >
            <option value="All">Membership Tier: All</option>
            <option value="Gold">Gold (+200k/mes)</option>
            <option value="Silver">Silver (100k-150k/mes)</option>
            <option value="Bronze">Bronze (50k-100k/mes)</option>
            <option value="Regular">Regular</option>
          </select>

          <button
            onClick={() => { setSearchQuery(''); setTierFilter('All'); setSortConfigs([]); }}
            className="text-error font-bold text-sm px-2 hover:underline"
          >
            Limpiar Filtros
          </button>
        </div>

        {/* Counter Info - Centered between filters and table */}
        <div className="py-4 text-center border-b border-outline-variant/5 bg-surface-container-lowest">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">
            Mostrando <span className="text-primary">{sortedCustomers.length}</span> {sortedCustomers.length === 1 ? 'cliente' : 'clientes'} en total
          </p>
        </div>

        {/* Natural Table - Optimized to fit without scroll */}
        <div className="w-full">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                {([
                  { key: 'name', label: 'Nombre', width: '500px' },
                  { key: 'phone', label: 'Teléfono', width: '140px' },
                  { key: 'tier', label: 'Categoría', width: '130px' },
                  { key: 'totalOrders', label: 'Órdenes', width: '90px' },
                  { key: 'totalSpent', label: 'Total gastado', width: '130px' },
                  { key: 'lastOrder', label: 'Última actividad', width: '150px' }
                ] as const).map(col => {
                  const sort = sortConfigs.find(c => c.key === col.key);
                  return (
                    <th
                      key={col.key}
                      onClick={(e) => handleSort(col.key, e.shiftKey)}
                      className="px-5 py-5 font-bold cursor-pointer select-none group"
                      style={col.width ? { width: col.width } : {}}
                    >
                      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl group-hover:bg-surface-container-low transition-all duration-200">
                        <span className="group-hover:text-primary transition-colors whitespace-nowrap">{col.label}</span>
                        <span className={`material-symbols-outlined text-[16px] transition-all ${sort ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sort?.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-5 py-5 font-bold w-[80px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {sortedCustomers.map((c, i) => {
                const tier = c.tier;
                return (
                  <tr key={i} className="hover:bg-surface-container-lowest transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center font-bold text-on-surface-variant border border-outline-variant/10 shadow-sm shrink-0">
                          {getInitials(c.name)}
                        </div>
                        <span className="font-bold text-on-background text-[14px] line-clamp-1">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-7 py-4 text-on-surface-variant font-medium whitespace-nowrap">{c.phone}</td>
                    <td className="px-10 py-4">
                      <span className="bg-surface-container-low px-2 py-1 rounded-lg text-[10px] font-black text-on-surface-variant uppercase tracking-wider whitespace-nowrap border border-outline-variant/10">
                        {tier}
                      </span>
                    </td>
                    <td className="px-15 py-4 text-on-surface-variant font-black text-sm">{c.totalOrders}</td>
                    <td className="px-13 py-4 font-black text-primary text-[15px] whitespace-nowrap tracking-tight">
                      ${formatCurrency(c.totalSpent)}
                    </td>
                    <td className="px-14 py-4 text-on-surface-variant font-medium whitespace-nowrap text-[13px]">
                      {c.lastOrder.split(',')[0]}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-outline-variant/10 text-on-surface-variant hover:bg-primary hover:text-white transition-all shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">person_search</span>
                    <p className="text-on-surface-variant font-medium">No se encontraron clientes matching los filtros.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && (() => {
        const currentCustomer = customers.find(c => c.phone === selectedCustomer.phone) || selectedCustomer;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedCustomer(null)} />
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[98vh]">
              <div className="p-8 bg-surface-container-low flex items-center gap-6 shrink-0">
                <div className="w-20 h-20 rounded-3xl bg-primary text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-primary/20">
                  {getInitials(currentCustomer.name)}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-on-background">{currentCustomer.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTierColor(currentCustomer.tier)}`}>
                      TIER {currentCustomer.tier.toUpperCase()}
                    </span>
                    <span className="text-xs text-on-surface-variant font-bold">{currentCustomer.phone}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="ml-auto w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Total Gastado</p>
                    <p className="text-xl font-black text-primary">${formatCurrency(currentCustomer.totalSpent)}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Pedidos Totales</p>
                    <p className="text-xl font-black">{currentCustomer.totalOrders}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-3">Información de Contacto</h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px]">phone</span>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase mb-1 block">Celular</label>
                        <input
                          type="text"
                          value={editPhone || currentCustomer.phone || ''}
                          onFocus={() => setEditPhone(currentCustomer.phone)}
                          onChange={(e) => setEditPhone(e.target.value)}
                          onBlur={() => {
                            if (editPhone && editPhone !== currentCustomer.phone) {
                              updateCustomerProfile(currentCustomer.phone, { phone: editPhone });
                              setSelectedCustomer(prev => prev ? { ...prev, phone: editPhone } : null);
                            }
                            setEditPhone('');
                          }}
                          placeholder="Sin teléfono"
                          className="w-full bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-primary transition-colors"
                        />
                        <p className="text-[9px] text-on-surface-variant mt-1 italic">Se guardará automáticamente con +54</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase mb-1 block">DNI</label>
                        <input
                          type="text"
                          value={editDni || currentCustomer.dni || ''}
                          onFocus={() => setEditDni(currentCustomer.dni)}
                          onChange={(e) => setEditDni(e.target.value)}
                          onBlur={() => {
                            if (editDni !== currentCustomer.dni) {
                              updateCustomerProfile(currentCustomer.phone, { dni: editDni });
                            }
                            setEditDni('');
                          }}
                          placeholder="Sin DNI"
                          className="w-full bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px]">cake</span>
                      <div className="flex-1">
                        <label className="text-[10px] font-black text-on-surface-variant uppercase mb-1 block">Fecha de Nacimiento</label>
                        <input
                          type="date"
                          value={editBirthday || currentCustomer.birthday || ''}
                          onFocus={() => setEditBirthday(currentCustomer.birthday || '')}
                          onChange={(e) => setEditBirthday(e.target.value)}
                          onBlur={() => {
                            if (editBirthday !== currentCustomer.birthday) {
                              updateCustomerProfile(currentCustomer.phone, { birthday: editBirthday });
                            }
                            setEditBirthday('');
                          }}
                          className="w-full bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                      <p className="text-sm font-medium">{currentCustomer.address || 'Dirección no registrada'}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                      <p className="text-sm font-medium">Última actividad: {currentCustomer.lastOrder}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-3">Actividad Reciente (30 días)</h4>
                  <div className="p-4 rounded-2xl bg-green-50 border border-green-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-green-800">Gasto este mes</span>
                    <span className="text-lg font-black text-green-700">${formatCurrency(currentCustomer.spent30)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant/10">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider">Cuenta Corriente</h4>
                    <button
                      onClick={() => {
                        const res = toggleCurrentAccount(currentCustomer.phone);
                        if (!res.success) setCcError(res.message || 'Error al modificar cuenta');
                      }}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${currentCustomer.hasCurrentAccount ? 'bg-green-100 text-green-700' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}
                    >
                      {currentCustomer.hasCurrentAccount ? 'Habilitada' : 'Habilitar'}
                    </button>
                  </div>

                  {currentCustomer.hasCurrentAccount && (
                    <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <p className="text-sm font-medium text-on-surface-variant">Deuda Actual</p>
                        <p className={`text-2xl font-black ${currentCustomer.currentDebt > 0 ? 'text-error' : 'text-green-600'}`}>
                          ${formatCurrency(currentCustomer.currentDebt)}
                        </p>
                      </div>
                      {currentCustomer.currentDebt > 0 ? (
                        <button
                          onClick={() => setSettleModalData({ phone: currentCustomer.phone, name: currentCustomer.name, debt: currentCustomer.currentDebt })}
                          className="w-full bg-surface-container-high hover:bg-green-100 hover:text-green-700 text-on-surface font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">payments</span>
                          Saldar Cuenta (${formatCurrency(currentCustomer.currentDebt)})
                        </button>
                      ) : (
                        <p className="text-xs text-center text-on-surface-variant font-bold bg-surface-container-low py-3 rounded-xl">Al día</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 pt-0 flex gap-3 shrink-0 bg-white">
                <button
                  onClick={() => window.open(`https://wa.me/${currentCustomer.phone.replace(/\s+/g, '')}`, '_blank')}
                  className="flex-1 bg-[#25D366] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                >
                  <span className="material-symbols-outlined">chat</span>
                  WhatsApp
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm({ phone: currentCustomer.phone, name: currentCustomer.name });
                  }}
                  className="bg-error/10 text-error font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-error/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="flex-1 bg-surface-container-high font-bold py-4 rounded-2xl"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Error Cuenta Corriente */}
      {ccError && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCcError(null)} />
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative z-10 p-8 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[32px]">warning</span>
            </div>
            <h3 className="text-xl font-black text-on-background mb-2">Acción Denegada</h3>
            <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">{ccError}</p>
            <button
              onClick={() => setCcError(null)}
              className="w-full bg-on-surface text-white font-bold py-4 rounded-2xl shadow-lg shadow-black/10 transition-transform active:scale-[0.98]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Saldar Cuenta */}
      {settleModalData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setSettleModalData(null); setPartialAmount(''); setSettleType('total'); }} />
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 p-8 animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-black text-on-background mb-2 text-center">Saldar Cuenta</h3>

            <div className="flex bg-surface-container-low p-1 rounded-2xl mb-6">
              <button
                onClick={() => setSettleType('total')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${settleType === 'total' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                Total
              </button>
              <button
                onClick={() => setSettleType('parcial')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${settleType === 'parcial' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
              >
                Parcial
              </button>
            </div>

            {settleType === 'total' ? (
              <p className="text-sm text-on-surface-variant mb-6 text-center leading-relaxed">
                ¿Confirmás que <span className="font-bold text-on-background">{settleModalData.name}</span> saldó su deuda de <span className="font-bold text-primary">${formatCurrency(settleModalData.debt)}</span>?
              </p>
            ) : (
              <div className="mb-6 space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block text-center">Monto a entregar</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant">$</span>
                  <input
                    type="number"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface-container-low border-2 border-transparent focus:border-primary rounded-2xl py-3 pl-8 pr-4 outline-none font-black text-lg transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-center text-on-surface-variant italic">Deuda total: ${formatCurrency(settleModalData.debt)}</p>
              </div>
            )}

            <div className="space-y-4 mb-8">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Elegir método de pago real</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Efectivo', icon: 'payments' },
                  { id: 'card', label: 'Tarjeta', icon: 'credit_card' },
                  { id: 'transfer', label: 'Transf.', icon: 'account_balance' }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSettleMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${settleMethod === m.id ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-low'}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                    <span className="text-[10px] font-bold">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  if (!settleModalData) return;
                  const amount = settleType === 'parcial' ? parseFloat(partialAmount) : undefined;
                  if (settleType === 'parcial' && (!amount || amount <= 0)) {
                    setCcError('Por favor ingresá un monto válido.');
                    return;
                  }

                  // Send WhatsApp notification
                  const finalPaid = amount || settleModalData.debt;
                  const remaining = settleModalData.debt - finalPaid;
                  const message = `*Hola ${settleModalData.name}!* 👋\n\nConfirmamos que recibimos tu pago de *$${formatCurrency(finalPaid, true, true)}*.\n${remaining > 0 ? `Tu saldo restante es de *$${formatCurrency(remaining, true, true)}*.\n` : 'Tu cuenta ha sido saldada por completo! ✅\n'}\n¡Muchas gracias por tu pago! 🏪`;
                  const encoded = encodeURIComponent(message);
                  window.open(`https://wa.me/${settleModalData.phone.replace(/\D/g, '')}?text=${encoded}`, '_blank');

                  settleCurrentAccount(settleModalData.phone, settleMethod, amount);
                  setSettleModalData(null);
                  setPartialAmount('');
                  setSettleType('total');
                }}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
              >
                Confirmar Pago
              </button>
              <button
                onClick={() => { setSettleModalData(null); setPartialAmount(''); setSettleType('total'); }}
                className="w-full text-on-surface-variant font-bold py-4 rounded-2xl hover:bg-surface-container-low transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowNewCustomerModal(false); setNewCustomerError(''); }} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">person_add</span>
              </div>
              <div>
                <h3 className="text-xl font-black">Nuevo Cliente</h3>
                <p className="text-xs text-on-surface-variant">Agregá un cliente manualmente</p>
              </div>
            </div>
            <div className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Nombre</label>
                  <input
                    type="text"
                    value={newCustomer.nombre}
                    onChange={e => setNewCustomer(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Juan"
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Apellido</label>
                  <input
                    type="text"
                    value={newCustomer.apellido}
                    onChange={e => setNewCustomer(p => ({ ...p, apellido: e.target.value }))}
                    placeholder="Pérez"
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Número de Documento (DNI)</label>
                <input
                  type="text"
                  value={newCustomer.dni}
                  onChange={e => setNewCustomer(p => ({ ...p, dni: e.target.value }))}
                  placeholder="Ej: 35123456"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Teléfono</label>
                <input
                  type="text"
                  value={newCustomer.telefono}
                  onChange={e => setNewCustomer(p => ({ ...p, telefono: e.target.value }))}
                  placeholder="2611234567"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary transition-colors"
                />
                <p className="text-[9px] text-on-surface-variant mt-1 italic">Se guardará automáticamente con +54</p>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">Dirección</label>
                  <button onClick={() => setShowMapModal(true)} className="text-[10px] text-primary font-bold hover:underline flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">map</span>
                    Seleccionar en mapa
                  </button>
                </div>
                <input
                  type="text"
                  value={newCustomer.direccion}
                  onChange={e => setNewCustomer(p => ({ ...p, direccion: e.target.value }))}
                  placeholder="Calle 123, Ciudad (o elegí del mapa)"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              {newCustomerError && (
                <p className="text-error text-xs font-bold bg-error/5 px-4 py-2 rounded-xl">{newCustomerError}</p>
              )}
            </div>
            <div className="p-6 border-t border-outline-variant/10 flex gap-3">
              <button
                onClick={() => { setShowNewCustomerModal(false); setNewCustomer({ nombre: '', apellido: '', telefono: '', direccion: '', dni: '' }); setNewCustomerError(''); }}
                className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newCustomer.nombre.trim()) { setNewCustomerError('El nombre es obligatorio'); return; }
                  if (!newCustomer.telefono.trim()) { setNewCustomerError('El teléfono es obligatorio'); return; }
                  addManualCustomer(newCustomer);
                  setShowNewCustomerModal(false);
                  setNewCustomer({ nombre: '', apellido: '', telefono: '', direccion: '', dni: '' });
                  setNewCustomerError('');
                }}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulated premium Map selector popup */}
      {showMapModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMapModal(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-lowest">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">explore</span>
              </div>
              <div>
                <h3 className="text-xl font-black">Seleccionar Ubicación</h3>
                <p className="text-xs text-on-surface-variant">Hacé click en los marcadores del mapa para elegir</p>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Stylized Mockup Map Container */}
              <div className="relative w-full h-[280px] bg-[#E8ECEF] rounded-3xl overflow-hidden border border-outline-variant/10 shadow-inner flex items-center justify-center">
                {/* Simulated streets / grid using CSS */}
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#9e9e9e_1px,transparent_1px)] [background-size:16px_16px]"></div>
                {/* Custom simulated streets */}
                <div className="absolute w-full h-4 bg-white/60 top-1/4 animate-pulse"></div>
                <div className="absolute w-full h-4 bg-white/60 top-2/3"></div>
                <div className="absolute h-full w-4 bg-white/60 left-1/3"></div>
                <div className="absolute h-full w-4 bg-white/60 left-3/4 animate-pulse"></div>
                {/* Landmarks pins */}
                {landmarks.map((lm, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedMapLocation(lm.name);
                    }}
                    style={{ left: `${lm.coords.x}%`, top: `${lm.coords.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group transition-transform hover:scale-110 active:scale-95 z-20"
                  >
                    <span className={`material-symbols-outlined text-[32px] ${selectedMapLocation === lm.name ? 'text-primary animate-bounce font-black scale-125' : 'text-on-surface-variant/70 hover:text-primary'} filter drop-shadow-md`}>
                      location_on
                    </span>
                    <span className="absolute left-1/2 -translate-x-1/2 top-8 bg-black/80 text-white text-[9px] px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-30">
                      {lm.name}
                    </span>
                  </button>
                ))}
                {/* Visual feedback of selection */}
                {selectedMapLocation && (
                  <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm border border-outline-variant/10 px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between text-left animate-in slide-in-from-bottom duration-300 z-30">
                    <div>
                      <p className="text-[9px] font-black text-on-surface-variant uppercase">Seleccionado</p>
                      <p className="text-xs font-bold text-on-background line-clamp-1">{selectedMapLocation}</p>
                    </div>
                    <button
                      onClick={() => {
                        setNewCustomer(p => ({ ...p, direccion: selectedMapLocation || '' }));
                        setShowMapModal(false);
                      }}
                      className="bg-primary text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-primary/95 transition-all shadow-md shrink-0 ml-3"
                    >
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
              {/* List of Landmarks for keyboard-friendly or easy click access */}
              <div className="space-y-2 max-h-[140px] overflow-y-auto no-scrollbar">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-2">Puntos Frecuentes</p>
                {landmarks.map((lm, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedMapLocation(lm.name)}
                    className={`w-full p-3 rounded-2xl text-left border flex items-center justify-between transition-all ${selectedMapLocation === lm.name ? 'bg-primary/5 border-primary' : 'bg-surface-container-lowest border-outline-variant/10 hover:bg-surface-container-low'}`}
                  >
                    <div>
                      <p className="text-xs font-black text-on-background">{lm.name.split(',')[0]}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium">{lm.desc}</p>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-primary">location_searching</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-end">
              <button onClick={() => setShowMapModal(false)} className="px-6 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowDeleteConfirm(null); setDeleteError(null); }} />
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative z-10 p-8 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[32px]">delete_forever</span>
            </div>
            <h3 className="text-xl font-black text-on-background mb-2">¿Eliminar cliente?</h3>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              ¿Estás seguro de eliminar a <span className="font-bold text-on-background">{showDeleteConfirm.name}</span>? Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <p className="text-error text-xs font-bold bg-error/5 px-4 py-2 rounded-xl mb-4">{deleteError}</p>
            )}
            <div className="space-y-3">
              <button
                onClick={() => {
                  const result = deleteCustomer(showDeleteConfirm.phone);
                  if (result.success) {
                    setShowDeleteConfirm(null);
                    setSelectedCustomer(null);
                    setDeleteError(null);
                  } else {
                    setDeleteError(result.message || 'Error al eliminar');
                  }
                }}
                className="w-full bg-error text-white font-bold py-4 rounded-2xl shadow-lg shadow-error/20 transition-transform active:scale-[0.98]"
              >
                Eliminar
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(null); setDeleteError(null); }}
                className="w-full py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
