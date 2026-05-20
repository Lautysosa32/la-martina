import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import type { Invoice, BillingCustomer, InvoiceItem } from '../../context/AdminContext';

type TabId = 'ventas' | 'compras' | 'globales' | 'clientes';

export const Billing: React.FC = () => {
  const {
    invoices,
    addInvoice,
    updateInvoice,
    orders,
    billingCustomers,
    addBillingCustomer,
    updateBillingCustomer,
    deleteBillingCustomer,
    formatCurrency
  } = useAdmin();

  const [headerPortal, setHeaderPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderPortal(document.getElementById('admin-header-portal'));
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>('ventas');
  const [searchQuery, setSearchQuery] = useState('');
  const [unbilledSearchQuery, setUnbilledSearchQuery] = useState('');
  const [showInvoiceDetail, setShowInvoiceDetail] = useState<Invoice | null>(null);
  const [showUnbilledModal, setShowUnbilledModal] = useState(false);
  
  // Clientes Fiscales state
  const [showNewBillingCustomer, setShowNewBillingCustomer] = useState(false);
  const [bcForm, setBcForm] = useState({ name: '', cuit: '', address: '', phone: '', email: '', taxCondition: 'Consumidor Final' });
  const [editingBc, setEditingBc] = useState<string | null>(null);

  // Multi-ticket billing and Detailed Creator states
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [showDetailedCreator, setShowDetailedCreator] = useState(false);
  const [detailedCreatorMode, setDetailedCreatorMode] = useState<'venta' | 'compra'>('venta');
  
  // Detailed creator form states
  const [creatorClientName, setCreatorClientName] = useState('');
  const [creatorClientCuit, setCreatorClientCuit] = useState('');
  const [creatorClientAddress, setCreatorClientAddress] = useState('');
  const [creatorClientPhone, setCreatorClientPhone] = useState('');
  const [creatorClientEmail, setCreatorClientEmail] = useState('');
  const [creatorClientTaxCondition, setCreatorClientTaxCondition] = useState('Consumidor Final');
  const [creatorDate, setCreatorDate] = useState('');
  const [creatorSerie, setCreatorSerie] = useState('0001');
  const [creatorFolio, setCreatorFolio] = useState('');
  const [creatorType, setCreatorType] = useState<'A' | 'B' | 'C'>('B');
  const [creatorItems, setCreatorItems] = useState<InvoiceItem[]>([]);
  const [creatorPricesIncludeTax, setCreatorPricesIncludeTax] = useState(true);
  const [selectedBillingCustomerId, setSelectedBillingCustomerId] = useState('');
  const [creatorError, setCreatorError] = useState('');

  // Filter unbilled POS sales with search filter by ID/Ticket or Customer
  const unbilledOrders = useMemo(() => {
    const saleOrders = orders.filter(o => o.status !== 'Cancelado' && !invoices.find(i => {
      if (!i.saleId) return false;
      const ids = i.saleId.split(',').map(s => s.trim());
      return ids.includes(o.id);
    }));
    if (!unbilledSearchQuery.trim()) return saleOrders;
    const q = unbilledSearchQuery.toLowerCase();
    return saleOrders.filter(o => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q));
  }, [orders, invoices, unbilledSearchQuery]);

  // Filter invoices for active tab and search query
  const filteredInvoices = useMemo(() => {
    const targetDirection = activeTab === 'compras' ? 'compra' : 'venta';
    const baseFiltered = invoices.filter(inv => {
      const dir = inv.direction || 'venta';
      return dir === targetDirection;
    });
    if (!searchQuery.trim()) return baseFiltered;
    const q = searchQuery.toLowerCase();
    return baseFiltered.filter(inv => 
      inv.folio.toLowerCase().includes(q) || 
      inv.clientName.toLowerCase().includes(q) || 
      (inv.clientCuit && inv.clientCuit.toLowerCase().includes(q)) ||
      (inv.saleId && inv.saleId.toLowerCase().includes(q))
    );
  }, [invoices, activeTab, searchQuery]);

  const openCreatorForSales = (saleIdsToBill: string[]) => {
    setDetailedCreatorMode('venta');
    setSelectedSaleIds(saleIdsToBill);
    setShowUnbilledModal(false);
    
    const selectedOrders = orders.filter(o => saleIdsToBill.includes(o.id));
    if (selectedOrders.length === 0) return;
    
    // Group and consolidate duplicate items by name/id
    const aggregatedItems: Record<string, InvoiceItem> = {};
    selectedOrders.forEach(order => {
      order.items.forEach(item => {
        const key = item.id || item.name;
        if (aggregatedItems[key]) {
          aggregatedItems[key].quantity += item.quantity;
          aggregatedItems[key].total = aggregatedItems[key].quantity * aggregatedItems[key].price;
        } else {
          aggregatedItems[key] = {
            description: item.name,
            quantity: item.quantity,
            price: item.price,
            taxRate: 21, // default 21%
            total: item.quantity * item.price
          };
        }
      });
    });
    
    setCreatorItems(Object.values(aggregatedItems));
    
    // Pre-populate client if all tickets have the same customer/DNI
    const uniqueCustomers = Array.from(new Set(selectedOrders.map(o => o.customer).filter(Boolean)));
    const uniqueDnis = Array.from(new Set(selectedOrders.map(o => o.dni).filter(Boolean)));
    
    let defaultClientName = uniqueCustomers.length === 1 ? uniqueCustomers[0] : 'Consumidor Final';
    let defaultClientCuit = uniqueDnis.length === 1 ? uniqueDnis[0] : '';
    let matchedCustomer = billingCustomers.find(c => 
      (defaultClientCuit && c.cuit === defaultClientCuit) || 
      (defaultClientName && c.name.toLowerCase() === defaultClientName.toLowerCase())
    );
    
    if (matchedCustomer) {
      setSelectedBillingCustomerId(matchedCustomer.id);
      setCreatorClientName(matchedCustomer.name);
      setCreatorClientCuit(matchedCustomer.cuit);
      setCreatorClientAddress(matchedCustomer.address);
      setCreatorClientPhone(matchedCustomer.phone);
      setCreatorClientEmail(matchedCustomer.email);
      setCreatorClientTaxCondition(matchedCustomer.taxCondition);
      setCreatorType(matchedCustomer.taxCondition === 'Responsable Inscripto' ? 'A' : 'B');
    } else {
      setSelectedBillingCustomerId('manual');
      setCreatorClientName(defaultClientName);
      setCreatorClientCuit(defaultClientCuit);
      setCreatorClientAddress('');
      setCreatorClientPhone('');
      setCreatorClientEmail('');
      setCreatorClientTaxCondition('Consumidor Final');
      setCreatorType('B');
    }
    
    const nextFolio = String(invoices.length + 1).padStart(6, '0');
    setCreatorFolio(nextFolio);
    setCreatorSerie('0001');
    setCreatorPricesIncludeTax(true);
    
    const todayStr = new Date().toISOString().split('T')[0];
    setCreatorDate(todayStr);
    
    setCreatorError('');
    setShowDetailedCreator(true);
  };

  const openCreatorForPurchases = () => {
    setDetailedCreatorMode('compra');
    setSelectedSaleIds([]);
    setCreatorItems([{ description: '', quantity: 1, price: 0, taxRate: 21, total: 0 }]);
    
    setSelectedBillingCustomerId('');
    setCreatorClientName('');
    setCreatorClientCuit('');
    setCreatorClientAddress('');
    setCreatorClientPhone('');
    setCreatorClientEmail('');
    setCreatorClientTaxCondition('Monotributista');
    setCreatorType('A');
    
    const nextFolio = String(invoices.length + 1).padStart(6, '0');
    setCreatorFolio(nextFolio);
    setCreatorSerie('0001');
    setCreatorPricesIncludeTax(true); // default to including tax, user can toggle
    
    const todayStr = new Date().toISOString().split('T')[0];
    setCreatorDate(todayStr);
    
    setCreatorError('');
    setShowDetailedCreator(true);
  };

  const creatorCalculations = useMemo(() => {
    let subtotalNet = 0;
    let totalTax = 0;
    let total = 0;
    const taxBreakdown: Record<number, { base: number; tax: number }> = {
      21: { base: 0, tax: 0 },
      10.5: { base: 0, tax: 0 },
      0: { base: 0, tax: 0 }
    };
    
    creatorItems.forEach(item => {
      const itemQty = item.quantity || 0;
      const itemPrice = item.price || 0;
      const taxRate = item.taxRate || 0;
      
      let itemTotal = 0;
      let itemNet = 0;
      let itemTax = 0;
      
      if (creatorPricesIncludeTax) {
        itemTotal = itemQty * itemPrice;
        itemNet = itemTotal / (1 + taxRate / 100);
        itemTax = itemTotal - itemNet;
      } else {
        itemNet = itemQty * itemPrice;
        itemTax = itemNet * (taxRate / 100);
        itemTotal = itemNet + itemTax;
      }
      
      subtotalNet += itemNet;
      totalTax += itemTax;
      total += itemTotal;
      
      if (taxBreakdown[taxRate] !== undefined) {
        taxBreakdown[taxRate].base += itemNet;
        taxBreakdown[taxRate].tax += itemTax;
      } else {
        taxBreakdown[taxRate] = { base: itemNet, tax: itemTax };
      }
    });
    
    return {
      subtotalNet,
      totalTax,
      total,
      taxBreakdown
    };
  }, [creatorItems, creatorPricesIncludeTax]);

  const handleSaveDetailedInvoice = () => {
    if (!creatorClientName.trim()) {
      setCreatorError('La razón social / nombre es obligatoria');
      return;
    }
    if (!creatorClientCuit.trim()) {
      setCreatorError('El CUIT / documento es obligatorio');
      return;
    }
    if (!creatorFolio.trim()) {
      setCreatorError('El número de factura (Folio) es obligatorio');
      return;
    }
    if (creatorItems.length === 0) {
      setCreatorError('Debe agregar al menos un ítem a la factura');
      return;
    }
    const hasInvalidItem = creatorItems.some(i => !i.description.trim() || i.quantity <= 0 || i.price < 0);
    if (hasInvalidItem) {
      setCreatorError('Todos los ítems deben tener descripción y valores válidos');
      return;
    }
    
    const { subtotalNet, totalTax, total } = creatorCalculations;
    
    addInvoice({
      date: creatorDate,
      serie: creatorSerie,
      clientName: creatorClientName,
      clientCuit: creatorClientCuit,
      subtotal: subtotalNet,
      taxes: totalTax,
      total: total,
      saleId: detailedCreatorMode === 'venta' 
        ? (selectedSaleIds.join(', ') || 'VENTA-MANUAL')
        : 'COMPRA-MANUAL',
      type: creatorType,
      status: 'Emitida',
      direction: detailedCreatorMode,
      items: creatorItems,
      saleIds: detailedCreatorMode === 'venta' ? selectedSaleIds : undefined
    });
    
    setShowDetailedCreator(false);
    setShowUnbilledModal(false);
    setSelectedSaleIds([]);
    setCreatorItems([]);
    setCreatorError('');
  };

  const handleExportCSV = () => {
    const targetDirection = activeTab === 'compras' ? 'compra' : 'venta';
    const headers = ['Folio', 'Fecha', 'Serie', 'Cliente/Proveedor', 'CUIT', 'Subtotal', 'Impuestos', 'Total', 'Venta/ID', 'Tipo', 'Estado'];
    const rows = filteredInvoices.map(inv => [
      inv.folio,
      inv.date,
      inv.serie,
      inv.clientName,
      inv.clientCuit,
      inv.subtotal,
      inv.taxes,
      inv.total,
      inv.saleId,
      inv.type,
      inv.status
    ]);
    const csv = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `facturas_${targetDirection === 'compra' ? 'compras' : 'ventas'}_la_martina_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveBc = () => {
    if (!bcForm.name.trim() || !bcForm.cuit.trim()) return;
    if (editingBc) {
      updateBillingCustomer(editingBc, bcForm);
      setEditingBc(null);
    } else {
      addBillingCustomer(bcForm);
    }
    setBcForm({ name: '', cuit: '', address: '', phone: '', email: '', taxCondition: 'Consumidor Final' });
    setShowNewBillingCustomer(false);
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'ventas', label: 'Ventas Facturadas', icon: 'receipt_long' },
    { id: 'compras', label: 'Compras Registradas', icon: 'shopping_bag' },
    { id: 'globales', label: 'Resumen Mensual', icon: 'summarize' },
    { id: 'clientes', label: 'Clientes Fiscales', icon: 'badge' },
  ];

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Monthly summary grouped by period
  const monthlySummary = useMemo(() => {
    const map: Record<string, { count: number; subtotal: number; taxes: number; total: number }> = {};
    invoices.forEach(inv => {
      const d = inv.date.split(',')[0] || inv.date;
      const parts = d.trim().split('/');
      const key = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
      if (!map[key]) map[key] = { count: 0, subtotal: 0, taxes: 0, total: 0 };
      map[key].count++;
      map[key].subtotal += inv.subtotal;
      map[key].taxes += inv.taxes;
      map[key].total += inv.total;
    });
    return Object.entries(map).map(([month, data]) => ({ month, ...data }));
  }, [invoices]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px]">
      {/* Header Portal for Buttons */}
      {headerPortal && createPortal(
        <div className="flex gap-3 items-center">
          {activeTab === 'compras' && (
            <button
              onClick={openCreatorForPurchases}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2 rounded-full transition-colors shadow-lg shadow-primary/20 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              Registrar Compra
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-full transition-colors shadow-sm text-xs"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Exportar CSV
          </button>
        </div>,
        headerPortal
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-outline-variant/10 shadow-sm w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-lowest'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Ventas Facturadas */}
      {activeTab === 'ventas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* VENTAS LIST TABLE */}
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between gap-4">
              <div className="relative flex-grow max-w-md">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  type="text"
                  placeholder="Buscar facturas de ventas por folio, cliente o venta..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10"
                />
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">{filteredInvoices.length} emitidas</span>
                <button
                  onClick={() => {
                    setUnbilledSearchQuery('');
                    setShowUnbilledModal(true);
                  }}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/95 text-white font-bold px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-primary/10 text-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  Buscar Ventas No Facturadas
                </button>
              </div>
            </div>

            {filteredInvoices.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                    <th className="px-6 py-4">Folio</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4">Venta</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4 font-black text-sm">#{inv.folio}</td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{inv.date.split(',')[0]}</td>
                      <td className="px-6 py-4 text-sm font-bold">{inv.clientName}</td>
                      <td className="px-6 py-4 text-sm font-black text-primary text-right">${fmt(inv.total)}</td>
                      <td className="px-6 py-4 text-[10px] font-bold text-on-surface-variant">#{inv.saleId}</td>
                      <td className="px-6 py-4">
                        <span className="bg-surface-container-low px-2 py-1 rounded-lg text-[10px] font-black uppercase">{inv.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          inv.status === 'Emitida'
                            ? 'bg-green-100 text-green-700'
                            : inv.status === 'Anulada'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setShowInvoiceDetail(inv)}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-primary hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                            title="Ver"
                          >
                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                          </button>
                          {inv.status === 'Emitida' && (
                            <button
                              onClick={() => updateInvoice(inv.id, { status: 'Anulada' })}
                              className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-error hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                              title="Anular"
                            >
                              <span className="material-symbols-outlined text-[16px]">block</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-16 text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">receipt_long</span>
                <p className="text-on-surface-variant font-medium">No hay facturas de ventas emitidas aún</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Compras Registradas */}
      {activeTab === 'compras' && (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                type="text"
                placeholder="Buscar facturas de compras por folio o proveedor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10"
              />
            </div>
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">{filteredInvoices.length} registradas</span>
          </div>

          {filteredInvoices.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                  <th className="px-6 py-4">Folio</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4">CUIT</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 w-32">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4 font-black text-sm">#{inv.folio}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{inv.date}</td>
                    <td className="px-6 py-4 text-sm font-bold">{inv.clientName}</td>
                    <td className="px-6 py-4 text-sm font-black text-primary text-right">${fmt(inv.total)}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant font-medium">{inv.clientCuit || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className="bg-surface-container-low px-2 py-1 rounded-lg text-[10px] font-black uppercase">{inv.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setShowInvoiceDetail(inv)}
                          className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-primary hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                          title="Ver"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                        </button>
                        {inv.status === 'Emitida' && (
                          <button
                            onClick={() => updateInvoice(inv.id, { status: 'Anulada' })}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-error hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                            title="Anular"
                          >
                            <span className="material-symbols-outlined text-[16px]">block</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">shopping_bag</span>
              <p className="text-on-surface-variant font-medium mb-2">No hay facturas de compras registradas aún</p>
              <p className="text-xs text-on-surface-variant">Hacé click en "Registrar Compra" para agregar una factura de compra manual</p>
            </div>
          )}
        </div>
      )}

      {/* TAB: Resumen Mensual */}
      {activeTab === 'globales' && (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 border-b border-outline-variant/10">
            <h3 className="font-black text-lg">Resumen Mensual de Facturación</h3>
            <p className="text-xs text-on-surface-variant mt-1">Agrupación por mes de todas las facturas registradas</p>
          </div>
          {monthlySummary.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                  <th className="px-6 py-4">Período</th>
                  <th className="px-6 py-4 text-center">Facturas</th>
                  <th className="px-6 py-4 text-right">Subtotal</th>
                  <th className="px-6 py-4 text-right">Impuestos</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {monthlySummary.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4 font-bold">{row.month}</td>
                    <td className="px-6 py-4 text-center font-black">{row.count}</td>
                    <td className="px-6 py-4 text-right font-bold text-on-surface-variant">${fmt(row.subtotal)}</td>
                    <td className="px-6 py-4 text-right font-bold text-on-surface-variant">${fmt(row.taxes)}</td>
                    <td className="px-6 py-4 text-right font-black text-primary">${fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">summarize</span>
              <p className="text-on-surface-variant font-medium">No hay datos de facturación aún</p>
            </div>
          )}
        </div>
      )}

      {/* TAB: Clientes Fiscales */}
      {activeTab === 'clientes' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewBillingCustomer(true);
                setEditingBc(null);
                setBcForm({ name: '', cuit: '', address: '', phone: '', email: '', taxCondition: 'Consumidor Final' });
              }}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-full flex items-center gap-2 shadow-lg shadow-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Nuevo Cliente Fiscal
            </button>
          </div>
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
            {billingCustomers.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                    <th className="px-6 py-4">Razón Social</th>
                    <th className="px-6 py-4">CUIT</th>
                    <th className="px-6 py-4">Condición</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4 w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {billingCustomers.map(bc => (
                    <tr key={bc.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4 font-bold text-sm">{bc.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{bc.cuit}</td>
                      <td className="px-6 py-4">
                        <span className="bg-surface-container-low px-2 py-1 rounded-lg text-[10px] font-bold">{bc.taxCondition}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{bc.email || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingBc(bc.id);
                              setBcForm({ name: bc.name, cuit: bc.cuit, address: bc.address, phone: bc.phone, email: bc.email, taxCondition: bc.taxCondition });
                              setShowNewBillingCustomer(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-primary hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            onClick={() => deleteBillingCustomer(bc.id)}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-error hover:text-white text-on-surface-variant flex items-center justify-center transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-16 text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">badge</span>
                <p className="text-on-surface-variant font-medium">No hay clientes de facturación registrados</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {showInvoiceDetail && (() => {
        const hasItems = showInvoiceDetail.items && showInvoiceDetail.items.length > 0;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInvoiceDetail(null)} />
            <div className={`bg-white w-full ${hasItems ? 'max-w-3xl' : 'max-w-lg'} rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]`}>
              
              {/* Header */}
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest shrink-0">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">receipt</span>
                  <h3 className="text-xl font-black">Comprobante #{showInvoiceDetail.folio}</h3>
                </div>
                <button onClick={() => setShowInvoiceDetail(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-grow">
                {/* Metadata cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { l: 'Fecha', v: showInvoiceDetail.date.split(',')[0] },
                    { l: 'Serie', v: showInvoiceDetail.serie },
                    { l: showInvoiceDetail.direction === 'compra' ? 'Proveedor' : 'Cliente', v: showInvoiceDetail.clientName },
                    { l: 'CUIT / DNI', v: showInvoiceDetail.clientCuit || 'N/A' },
                    { l: 'Tipo', v: `Factura ${showInvoiceDetail.type}` },
                    { l: 'Registro', v: showInvoiceDetail.direction === 'compra' ? 'Compra' : 'Venta' },
                  ].map((item, i) => (
                    <div key={i} className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/10">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase">{item.l}</p>
                      <p className="font-bold text-xs truncate" title={item.v}>{item.v}</p>
                    </div>
                  ))}
                </div>

                {/* Items table if exists */}
                {hasItems && (
                  <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/10 overflow-hidden">
                    <div className="p-4 bg-surface-container-low border-b border-outline-variant/10">
                      <h4 className="text-xs font-black uppercase text-primary tracking-wider">Detalle de Conceptos</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-lowest text-[10px] font-black uppercase text-on-surface-variant tracking-wider border-b border-outline-variant/10">
                            <th className="px-5 py-3">Descripción</th>
                            <th className="px-5 py-3 text-center w-16">Cant</th>
                            <th className="px-5 py-3 text-right w-24">Precio Unit.</th>
                            <th className="px-5 py-3 text-center w-16">IVA %</th>
                            <th className="px-5 py-3 text-right w-28">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10 text-xs">
                          {showInvoiceDetail.items?.map((item, idx) => (
                            <tr key={idx} className="hover:bg-surface-container-low/20">
                              <td className="px-5 py-3.5 font-bold text-on-background">{item.description}</td>
                              <td className="px-5 py-3.5 text-center font-black">{item.quantity}</td>
                              <td className="px-5 py-3.5 text-right font-semibold">${fmt(item.price)}</td>
                              <td className="px-5 py-3.5 text-center">
                                <span className="bg-surface-container-low px-1.5 py-0.5 rounded font-black text-[9px]">
                                  {item.taxRate}%
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right font-black text-on-background">${fmt(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Taxes and totals summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="text-[10px] text-on-surface-variant leading-relaxed bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
                    <p className="font-black text-xs uppercase text-primary tracking-wider mb-2">Comprobante Fiscal Digital</p>
                    <p>• ID Venta: #{showInvoiceDetail.saleId}</p>
                    <p>• Estado: {showInvoiceDetail.status}</p>
                    <p>• La Martina Minimarket •</p>
                  </div>
                  
                  <div className="bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10 space-y-3">
                    {hasItems ? (
                      <>
                        <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
                          <span>Subtotal Neto</span>
                          <span className="font-black">${fmt(showInvoiceDetail.subtotal)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
                          <span>Impuestos (IVA)</span>
                          <span className="font-black">${fmt(showInvoiceDetail.taxes)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
                        <span>Base Imponible / Subtotal</span>
                        <span className="font-black">${fmt(showInvoiceDetail.subtotal)}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t border-outline-variant/10 flex justify-between items-center bg-primary/5 -mx-6 px-6 -mb-6 pb-6 rounded-b-[2rem]">
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">TOTAL GENERAL</p>
                        <p className="text-2xl font-black text-primary">${fmt(showInvoiceDetail.total)}</p>
                      </div>
                      <span className="bg-primary/10 text-primary font-black uppercase text-[10px] tracking-wider px-3 py-1.5 rounded-xl">
                        Factura {showInvoiceDetail.type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3 shrink-0">
                <button onClick={() => setShowInvoiceDetail(null)} className="flex-1 py-3.5 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Detailed Invoice Creator Modal */}
      {showDetailedCreator && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDetailedCreator(false)} />
          <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">
                    {detailedCreatorMode === 'venta' ? 'Factura de Venta Detallada' : 'Registrar Factura de Compra'}
                  </h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {detailedCreatorMode === 'venta' 
                      ? 'Consolidá y configurá detalladamente la factura de ventas POS' 
                      : 'Cargá los ítems y desglose de IVA de una factura de proveedor'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDetailedCreator(false)} 
                className="w-10 h-10 rounded-full hover:bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-grow">
              {creatorError && (
                <p className="bg-red-50 text-red-700 text-xs font-bold p-3 rounded-xl border border-red-100">{creatorError}</p>
              )}

              {/* SECTION: Client/Supplier and Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10">
                
                {/* Fiscal Contact Search & Info */}
                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">
                      {detailedCreatorMode === 'venta' ? 'Datos del Cliente Fiscal' : 'Datos del Proveedor'}
                    </h4>
                    {/* Selector of existing billing customers */}
                    <select
                      value={selectedBillingCustomerId}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedBillingCustomerId(val);
                        if (val === 'manual' || val === '') {
                          setCreatorClientName('');
                          setCreatorClientCuit('');
                          setCreatorClientAddress('');
                          setCreatorClientPhone('');
                          setCreatorClientEmail('');
                          setCreatorClientTaxCondition('Consumidor Final');
                        } else {
                          const c = billingCustomers.find(bc => bc.id === val);
                          if (c) {
                            setCreatorClientName(c.name);
                            setCreatorClientCuit(c.cuit);
                            setCreatorClientAddress(c.address);
                            setCreatorClientPhone(c.phone);
                            setCreatorClientEmail(c.email);
                            setCreatorClientTaxCondition(c.taxCondition);
                            setCreatorType(c.taxCondition === 'Responsable Inscripto' ? 'A' : 'B');
                          }
                        }
                      }}
                      className="bg-surface-container-low text-xs border-none rounded-xl px-3 py-1.5 font-bold outline-none cursor-pointer text-on-surface"
                    >
                      <option value="manual">-- Cargar Manualmente --</option>
                      {billingCustomers.map(bc => (
                        <option key={bc.id} value={bc.id}>{bc.name} ({bc.taxCondition})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Razón Social / Nombre</label>
                      <input
                        type="text"
                        value={creatorClientName}
                        onChange={e => setCreatorClientName(e.target.value)}
                        placeholder="ej: Juan Pérez S.A."
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 ring-primary/10 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">CUIT / DNI</label>
                      <input
                        type="text"
                        value={creatorClientCuit}
                        onChange={e => setCreatorClientCuit(e.target.value)}
                        placeholder="20-12345678-9"
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 ring-primary/10 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Condición IVA</label>
                      <select
                        value={creatorClientTaxCondition}
                        onChange={e => {
                          setCreatorClientTaxCondition(e.target.value);
                          if (e.target.value === 'Responsable Inscripto') {
                            setCreatorType('A');
                          } else {
                            setCreatorType('B');
                          }
                        }}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold text-on-surface"
                      >
                        <option>Consumidor Final</option>
                        <option>Responsable Inscripto</option>
                        <option>Monotributista</option>
                        <option>Exento</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Domicilio Fiscal</label>
                      <input
                        type="text"
                        value={creatorClientAddress}
                        onChange={e => setCreatorClientAddress(e.target.value)}
                        placeholder="Calle Falsa 123"
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 ring-primary/10 font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Invoice Metadata */}
                <div className="space-y-4 border-l border-outline-variant/10 pl-6">
                  <h4 className="text-xs font-black uppercase text-primary tracking-wider">Metadatos Factura</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo</label>
                        <select
                          value={creatorType}
                          onChange={e => setCreatorType(e.target.value as 'A' | 'B' | 'C')}
                          className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs outline-none font-bold text-on-surface"
                        >
                          <option value="A">Factura A</option>
                          <option value="B">Factura B</option>
                          <option value="C">Factura C</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Fecha</label>
                        <input
                          type="date"
                          value={creatorDate}
                          onChange={e => setCreatorDate(e.target.value)}
                          className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs outline-none font-bold text-on-surface font-semibold"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Punto Venta</label>
                        <input
                          type="text"
                          value={creatorSerie}
                          onChange={e => setCreatorSerie(e.target.value)}
                          placeholder="0001"
                          className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 ring-primary/10 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Folio Nº</label>
                        <input
                          type="text"
                          value={creatorFolio}
                          onChange={e => setCreatorFolio(e.target.value)}
                          placeholder="000001"
                          className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 ring-primary/10 font-bold text-primary"
                        />
                      </div>
                    </div>
                    {/* Reverse Tax Toggle */}
                    <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">Precios incluyen IVA</span>
                        <span className="text-[9px] text-on-surface-variant font-medium">Toggle para cálculo inverso</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCreatorPricesIncludeTax(!creatorPricesIncludeTax)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 outline-none ${
                          creatorPricesIncludeTax ? 'bg-primary' : 'bg-surface-container-high'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${
                            creatorPricesIncludeTax ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Line Items Table */}
              <div className="bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-primary tracking-wider">Ítems / Líneas de Factura</h4>
                  <span className="text-[10px] font-black text-on-surface-variant uppercase bg-surface-container-low px-2.5 py-1 rounded-lg">
                    {creatorItems.length} {creatorItems.length === 1 ? 'concepto' : 'conceptos'}
                  </span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-outline-variant/10 text-[10px] font-black uppercase tracking-wider text-on-surface-variant">
                        <th className="py-2.5 pr-4">Descripción</th>
                        <th className="py-2.5 px-4 w-24">Cant.</th>
                        <th className="py-2.5 px-4 w-32">
                          Precio Unit. ({creatorPricesIncludeTax ? 'con IVA' : 'sin IVA'})
                        </th>
                        <th className="py-2.5 px-4 w-28">IVA %</th>
                        <th className="py-2.5 px-4 w-32 text-right">Total ($)</th>
                        <th className="py-2.5 pl-4 w-16 text-center">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {creatorItems.map((item, idx) => {
                        const itemQty = item.quantity || 0;
                        const itemPrice = item.price || 0;
                        const taxRate = item.taxRate || 0;
                        let itemTotal = 0;
                        if (creatorPricesIncludeTax) {
                          itemTotal = itemQty * itemPrice;
                        } else {
                          itemTotal = itemQty * itemPrice * (1 + taxRate / 100);
                        }
                        
                        return (
                          <tr key={idx} className="hover:bg-surface-container-low/30 transition-colors">
                            <td className="py-2 pr-4">
                              <input
                                type="text"
                                value={item.description}
                                onChange={e => {
                                  const val = e.target.value;
                                  setCreatorItems(prev => prev.map((it, i) => i === idx ? { ...it, description: val } : it));
                                }}
                                placeholder="Nombre o detalle del producto..."
                                className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 ring-primary/20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCreatorItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val, total: val * it.price } : it));
                                }}
                                className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs font-black text-center outline-none"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.price === 0 ? '' : item.price}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setCreatorItems(prev => prev.map((it, i) => i === idx ? { ...it, price: val, total: it.quantity * val } : it));
                                  }}
                                  className="w-full bg-surface-container-low border-none rounded-xl pl-6 pr-3 py-2 text-xs font-black outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <select
                                value={item.taxRate}
                                onChange={e => {
                                  const val = parseFloat(e.target.value);
                                  setCreatorItems(prev => prev.map((it, i) => i === idx ? { ...it, taxRate: val } : it));
                                }}
                                className="w-full bg-surface-container-low border-none rounded-xl px-2 py-2 text-xs font-black outline-none cursor-pointer text-on-surface"
                              >
                                <option value="21">21.0%</option>
                                <option value="10.5">10.5%</option>
                                <option value="0">0% (Exento)</option>
                              </select>
                            </td>
                            <td className="py-2 px-4 text-right font-black text-xs text-on-background">
                              ${itemTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 pl-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setCreatorItems(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="w-8 h-8 rounded-lg hover:bg-red-50 text-on-surface-variant hover:text-error flex items-center justify-center transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCreatorItems(prev => [...prev, { description: '', quantity: 1, price: 0, taxRate: 21, total: 0 }]);
                  }}
                  className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-black text-xs cursor-pointer select-none outline-none py-1 w-fit"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Agregar Línea
                </button>
              </div>

              {/* SECTION: Totals and Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Left side: Notes */}
                <div className="p-5 bg-surface-container-lowest border border-outline-variant/10 rounded-[2rem] text-[11px] text-on-surface-variant space-y-2">
                  <p className="font-bold uppercase text-primary tracking-wider">Aclaración Impositiva</p>
                  <p>
                    • Si el toggle <strong>Precios incluyen IVA</strong> está activo, el subtotal neto e IVA se calcularán retroactivamente del precio unitario provisto.
                  </p>
                  <p>
                    • Si está inactivo, el precio se tomará como el <strong>Neto Imponible</strong> y el IVA del 21% o 10.5% se sumará arriba del mismo para componer el Total.
                  </p>
                </div>
                
                {/* Right side: Calculations */}
                <div className="bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10 space-y-3.5">
                  <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
                    <span>Subtotal Neto (imponible)</span>
                    <span className="font-black text-on-background">${fmt(creatorCalculations.subtotalNet)}</span>
                  </div>
                  {/* IVA Breakdown list */}
                  <div className="space-y-1.5 pl-4 border-l-2 border-outline-variant/10">
                    {creatorCalculations.taxBreakdown[21].tax > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-medium">
                        <span>IVA 21% (Base: ${fmt(creatorCalculations.taxBreakdown[21].base)})</span>
                        <span className="font-bold text-on-background">${fmt(creatorCalculations.taxBreakdown[21].tax)}</span>
                      </div>
                    )}
                    {creatorCalculations.taxBreakdown[10.5].tax > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-medium">
                        <span>IVA 10.5% (Base: ${fmt(creatorCalculations.taxBreakdown[10.5].base)})</span>
                        <span className="font-bold text-on-background">${fmt(creatorCalculations.taxBreakdown[10.5].tax)}</span>
                      </div>
                    )}
                    {creatorCalculations.taxBreakdown[0].base > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-medium">
                        <span>Exento / IVA 0%</span>
                        <span className="font-bold text-on-background">${fmt(creatorCalculations.taxBreakdown[0].base)}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-3.5 border-t border-outline-variant/10 flex justify-between items-center bg-primary/5 -mx-6 px-6 -mb-6 pb-6 rounded-b-[2rem]">
                    <div>
                      <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">TOTAL GENERAL</p>
                      <p className="text-2xl font-black text-primary">${fmt(creatorCalculations.total)}</p>
                    </div>
                    <span className="bg-primary/10 text-primary font-black uppercase text-[10px] tracking-wider px-3 py-1.5 rounded-xl">
                      Factura {creatorType}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest shrink-0">
              <button 
                onClick={() => {
                  setShowDetailedCreator(false);
                  setSelectedSaleIds([]);
                }} 
                className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl transition-colors outline-none"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDetailedInvoice}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-2 transition-all active:scale-95 outline-none cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Emitir Comprobante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Billing Customer Modal */}
      {showNewBillingCustomer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewBillingCustomer(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
              <h3 className="text-xl font-black">{editingBc ? 'Editar' : 'Nuevo'} Cliente Fiscal</h3>
            </div>
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar">
              {[
                { key: 'name', label: 'Razón Social', ph: 'Empresa S.A.' },
                { key: 'cuit', label: 'CUIT', ph: '20-12345678-9' },
                { key: 'address', label: 'Domicilio Fiscal', ph: 'Calle 123' },
                { key: 'phone', label: 'Teléfono', ph: '261-1234567' },
                { key: 'email', label: 'Email', ph: 'email@empresa.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">{f.label}</label>
                  <input
                    type="text"
                    value={(bcForm as any)[f.key]}
                    onChange={e => setBcForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Condición Fiscal</label>
                <select
                  value={bcForm.taxCondition}
                  onChange={e => setBcForm(p => ({ ...p, taxCondition: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary"
                >
                  <option>Consumidor Final</option>
                  <option>Responsable Inscripto</option>
                  <option>Monotributista</option>
                  <option>Exento</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/10 flex gap-3">
              <button onClick={() => setShowNewBillingCustomer(false)} className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl">
                Cancelar
              </button>
              <button
                onClick={handleSaveBc}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Unbilled POS Sales Modal */}
      {showUnbilledModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowUnbilledModal(false); setSelectedSaleIds([]); }} />
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">find_in_page</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">Ventas No Facturadas</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Busca y factura ventas de caja</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowUnbilledModal(false); setSelectedSaleIds([]); }} 
                className="w-10 h-10 rounded-full hover:bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <div className="relative flex-grow">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  type="text"
                  placeholder="Buscar ticket por ID o Cliente..."
                  value={unbilledSearchQuery}
                  onChange={e => setUnbilledSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3.5 pl-11 text-sm outline-none focus:ring-2 ring-primary/10"
                />
              </div>
              {unbilledOrders.length > 0 && (
                <label className="flex items-center gap-2 px-4 py-2 hover:bg-surface-container-low rounded-xl cursor-pointer text-xs font-bold shrink-0 animate-in fade-in duration-300">
                  <input
                    type="checkbox"
                    checked={unbilledOrders.length > 0 && selectedSaleIds.length === unbilledOrders.length}
                    ref={el => {
                      if (el) {
                        el.indeterminate = selectedSaleIds.length > 0 && selectedSaleIds.length < unbilledOrders.length;
                      }
                    }}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedSaleIds(unbilledOrders.map(o => o.id));
                      } else {
                        setSelectedSaleIds([]);
                      }
                    }}
                    className="accent-primary w-4.5 h-4.5 rounded"
                  />
                  <span>Seleccionar Todos ({unbilledOrders.length})</span>
                </label>
              )}
            </div>

            <div className="p-8 flex-grow overflow-y-auto no-scrollbar space-y-4">
              {unbilledOrders.length > 0 ? (
                <div className="space-y-3">
                  {unbilledOrders.map(o => {
                    const isSelected = selectedSaleIds.includes(o.id);
                    return (
                      <div
                        key={o.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSaleIds(prev => prev.filter(id => id !== o.id));
                          } else {
                            setSelectedSaleIds(prev => [...prev, o.id]);
                          }
                        }}
                        className={`bg-surface-container-lowest border p-5 rounded-[1.5rem] flex items-center justify-between hover:border-primary/50 transition-all shadow-sm cursor-pointer ${
                          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-outline-variant/10'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) {
                                setSelectedSaleIds(prev => [...prev, o.id]);
                              } else {
                                setSelectedSaleIds(prev => prev.filter(id => id !== o.id));
                              }
                            }}
                            className="accent-primary w-4.5 h-4.5 rounded"
                          />
                          <div>
                            <span className="bg-surface-container-low text-on-surface-variant font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md mb-1 inline-block">Ticket #{o.id}</span>
                            <p className="text-sm font-black text-on-background">{o.customer}</p>
                            <p className="text-[11px] text-on-surface-variant font-semibold mt-0.5 font-medium">
                              {o.date} • {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-base font-black text-primary">${formatCurrency(o.total)}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreatorForSales([o.id]);
                              setShowUnbilledModal(false);
                            }}
                            className="bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl flex items-center gap-1 shrink-0 cursor-pointer shadow-md shadow-primary/10 transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            Facturar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-on-surface-variant/40 text-5xl mb-3">search_off</span>
                  <p className="text-sm text-on-surface-variant italic">No se encontraron ventas pendientes de facturar.</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              {selectedSaleIds.length > 0 ? (
                <div className="flex items-center justify-between w-full animate-in slide-in-from-bottom duration-300">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary font-black text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl">
                      {selectedSaleIds.length} {selectedSaleIds.length === 1 ? 'Seleccionada' : 'Seleccionadas'}
                    </span>
                    <p className="text-xs font-black text-on-background">
                      Total: <span className="text-primary font-black">${formatCurrency(
                        orders.filter(o => selectedSaleIds.includes(o.id)).reduce((acc, curr) => acc + curr.total, 0)
                      )}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedSaleIds([])} 
                      className="px-4 py-2.5 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-all"
                    >
                      Deseleccionar
                    </button>
                    <button
                      onClick={() => {
                        openCreatorForSales(selectedSaleIds);
                      }}
                      className="bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                      Facturar Seleccionadas
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end w-full">
                  <button 
                    onClick={() => setShowUnbilledModal(false)} 
                    className="px-6 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
