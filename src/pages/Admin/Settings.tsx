import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/AdminContext';
import type { AutoCashCloseConfig } from '../../context/AdminContext';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta Corriente',
};

export const Settings: React.FC = () => {
  const { ticketConfig, updateTicketConfig, currentAccountConfig, updateCurrentAccountConfig, storeStatus, updateStoreStatus, autoCashCloseConfig, updateAutoCashCloseConfig, generalConfig, updateGeneralConfig } = useAdmin();
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'ticket' | 'general'>('general');

  // Local state mirrors config for form editing
  const [form, setForm] = useState({ ...ticketConfig });
  const [accountForm, setAccountForm] = useState({ ...currentAccountConfig });
  const [storeForm, setStoreForm] = useState({ ...storeStatus });
  const [autoCloseForm, setAutoCloseForm] = useState<AutoCashCloseConfig>({ enabled: false, time: '22:00' });
  const [generalForm, setGeneralForm] = useState({ ...generalConfig });

  const [newBlockedPhone, setNewBlockedPhone] = useState('');
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});

  const togglePanel = (key: string) => {
    setOpenPanels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    setOpenPanels({
      tienda: true,
      cobertura: true,
      cuentas: true,
      seguridad: true,
      cierre: true,
      notificaciones: true
    });
  };

  const collapseAll = () => {
    setOpenPanels({});
  };

  // Sync local forms when context loads data from Supabase
  useEffect(() => {
    setForm(ticketConfig);
  }, [ticketConfig]);

  useEffect(() => {
    setAccountForm(currentAccountConfig);
  }, [currentAccountConfig]);

  useEffect(() => {
    setStoreForm(storeStatus);
  }, [storeStatus]);

  useEffect(() => {
    setAutoCloseForm(autoCashCloseConfig);
  }, [autoCashCloseConfig]);

  useEffect(() => {
    setGeneralForm(generalConfig);
  }, [generalConfig]);

  const handleSave = () => {
    if (activeSection === 'ticket') {
      updateTicketConfig(form);
    } else if (activeSection === 'general') {
      updateCurrentAccountConfig(accountForm);
      updateStoreStatus(storeForm);
      updateAutoCashCloseConfig(autoCloseForm);
      updateGeneralConfig(generalForm);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    if (activeSection === 'ticket') {
      const defaults = {
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
      setForm(defaults);
      updateTicketConfig(defaults);
    } else if (activeSection === 'general') {
      const defaultAccountConfig = {
        enabled: true,
        maxDebtAmount: 50000,
        maxDebtDays: 35,
        warnOnAmountLimit: true,
        warnOnTimeLimit: true,
        allowOverride: true,
      };
      setAccountForm(defaultAccountConfig);
      updateCurrentAccountConfig(defaultAccountConfig);

      const defaultStoreStatus = {
        onlineSalesPaused: false,
        pauseReason: '',
        pausedAt: null,
        pausedBy: null,
        resumeMessage: '',
        allowBrowsingWhilePaused: true
      };
      setStoreForm(defaultStoreStatus);
      updateStoreStatus(defaultStoreStatus);
      
      const defaultAutoClose = { enabled: false, time: '22:00' };
      setAutoCloseForm(defaultAutoClose);
      updateAutoCashCloseConfig(defaultAutoClose);

      const defaultGeneralConfig = {
        suspendEmployeeNotifications: false,
        deliveryRadiusKm: 5,
        storeLat: -33.459009,
        storeLng: -67.551826,
        blockedPhones: []
      };
      setGeneralForm(defaultGeneralConfig);
      updateGeneralConfig(defaultGeneralConfig);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Mock ticket for preview
  const mockItems = [
    { name: 'Aceite Oliva Extra Virgen 500ml', quantity: 1, price: 8500, finalPrice: 8500 },
    { name: 'Arroz Integral 1kg', quantity: 2, price: 2400, finalPrice: 2400 },
    { name: 'Gaseosa Cola 354ml', quantity: 3, price: 850, finalPrice: 720, offerLabel: '3x2' },
  ];
  const mockSubtotal = mockItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const mockTotal = mockItems.reduce((s, i) => s + i.finalPrice * i.quantity, 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-700 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {saved && (
          <div className="bg-green-100 border border-green-200 text-green-800 px-6 py-3 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top duration-300 shadow-sm">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            <p className="font-bold text-sm">Configuración guardada correctamente</p>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('general')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'general' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          General
        </button>
        <button
          onClick={() => setActiveSection('ticket')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'ticket' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          Personalizar Ticket
        </button>
      </div>

      {activeSection === 'ticket' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Column */}
          <div className="space-y-6">
            {/* Business Info */}
            <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-[20px]">store</span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg">Datos del Negocio</h3>
                    <p className="text-xs text-on-surface-variant">Información que aparece en el encabezado del ticket</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Nombre del Encabezado</label>
                  <input
                    type="text"
                    value={form.headerText}
                    onChange={e => setForm(p => ({ ...p, headerText: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="La Martina"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Descripción / Rubro</label>
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="Minimarket & Supermercado"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Dirección</label>
                    <input
                      type="text"
                      value={form.businessAddress}
                      onChange={e => setForm(p => ({ ...p, businessAddress: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="Calle 123, Ciudad"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Teléfono</label>
                    <input
                      type="text"
                      value={form.businessPhone}
                      onChange={e => setForm(p => ({ ...p, businessPhone: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="261-1234567"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">CUIT / RFC</label>
                  <input
                    type="text"
                    value={form.businessCuit}
                    onChange={e => setForm(p => ({ ...p, businessCuit: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="20-12345678-9"
                  />
                </div>
              </div>
            </div>

            {/* Footer & Blank Lines */}
            <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-yellow-700 text-[20px]">format_line_spacing</span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg">Formato del Ticket</h3>
                    <p className="text-xs text-on-surface-variant">Mensaje final y espaciado</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Mensaje Final</label>
                  <textarea
                    value={form.footerMessage}
                    onChange={e => setForm(p => ({ ...p, footerMessage: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all resize-none"
                    placeholder="¡Gracias por su compra!"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Líneas en blanco al inicio</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={form.blankLinesTop}
                        onChange={e => setForm(p => ({ ...p, blankLinesTop: parseInt(e.target.value) }))}
                        className="flex-1 accent-primary"
                      />
                      <span className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-1 rounded-lg font-black text-sm w-10 text-center">{form.blankLinesTop}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Líneas en blanco al final</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={form.blankLinesBottom}
                        onChange={e => setForm(p => ({ ...p, blankLinesBottom: parseInt(e.target.value) }))}
                        className="flex-1 accent-primary"
                      />
                      <span className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-1 rounded-lg font-black text-sm w-10 text-center">{form.blankLinesBottom}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar Configuración
              </button>
              <button
                onClick={handleReset}
                className="flex-1 bg-white border border-outline-variant/10 font-bold py-4 rounded-2xl text-on-surface-variant hover:bg-surface-container-lowest transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
            </div>
          </div>

          {/* Preview Column */}
          <div>
            <div className="sticky top-8">
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">preview</span>
                  <h3 className="font-black text-lg">Vista Previa del Ticket</h3>
                </div>
                <div className="p-6 flex justify-center">
                  <div className="bg-white border-2 border-dashed border-outline-variant/20 rounded-2xl p-6 w-[320px] font-mono text-xs shadow-inner">
                    {/* Blank lines top */}
                    {Array.from({ length: form.blankLinesTop }).map((_, i) => <br key={`top-${i}`} />)}

                    {/* Header */}
                    <div className="text-center border-b border-dashed border-black/30 pb-3 mb-3">
                      <div className="text-lg font-bold">{form.headerText || 'La Martina'}</div>
                      <div className="text-[10px] text-gray-500">{form.businessName}</div>
                      {form.businessAddress && <div className="text-[10px] text-gray-500">{form.businessAddress}</div>}
                      {form.businessPhone && <div className="text-[10px] text-gray-500">Tel: {form.businessPhone}</div>}
                      {form.businessCuit && <div className="text-[10px] text-gray-500">CUIT: {form.businessCuit}</div>}
                      <div className="text-[10px] mt-1">Ticket: #LOC-A1B2C</div>
                      <div className="text-[10px] text-gray-500">19/05/2026, 14:30</div>
                      <div className="text-[10px] text-gray-500">Atendido por: Admin</div>
                    </div>

                    {/* Items */}
                    <div className="border-b border-dashed border-black/30 pb-3 mb-3 space-y-2">
                      {mockItems.map((item, i) => (
                        <div key={i}>
                          <div className="font-bold text-[11px]">{item.name}</div>
                          <div className="flex justify-between text-[10px] text-gray-700">
                            <span>{item.quantity} x ${fmt(item.finalPrice)}</span>
                            <span>${fmt(item.finalPrice * item.quantity)}</span>
                          </div>
                          {item.offerLabel && (
                            <div className="text-[9px] text-gray-500 italic">▸ {item.offerLabel} (-${fmt((item.price - item.finalPrice) * item.quantity)})</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span>Subtotal</span>
                        <span>${fmt(mockSubtotal)}</span>
                      </div>
                      {mockSubtotal !== mockTotal && (
                        <div className="flex justify-between text-[11px] text-red-600">
                          <span>Descuento</span>
                          <span>-${fmt(mockSubtotal - mockTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[13px] font-bold border-t border-black pt-2 mt-2">
                        <span>TOTAL</span>
                        <span>${fmt(mockTotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Forma de pago</span>
                        <span>Efectivo</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center border-t border-dashed border-black/30 pt-3 mt-3 text-[10px] text-gray-500">
                      <div>{form.footerMessage || '¡Gracias por su compra!'}</div>
                      <div>{form.headerText} — {form.businessAddress}</div>
                    </div>

                    {/* Blank lines bottom */}
                    {Array.from({ length: form.blankLinesBottom }).map((_, i) => <br key={`bot-${i}`} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'general' && (
        <div className="space-y-6">
          {/* Barra superior de control de paneles */}
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">view_agenda</span>
              Hacé clic en cualquier panel para expandir su configuración
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-bold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
              >
                Expandir todos
              </button>
              <span className="text-on-surface-variant/40">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-bold text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Contraer todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Columna Izquierda: Operaciones & Delivery */}
            <div className="space-y-5">
              
              {/* 1. Tienda Online */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('tienda')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🏬
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Estado de la Tienda Online</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${
                          storeForm.onlineSalesPaused ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {storeForm.onlineSalesPaused ? 'Pausada' : 'Activa'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Control de compras al público general y motivo de pausa</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['tienda'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['tienda'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className={`flex flex-col gap-2 p-5 rounded-2xl border ${storeForm.onlineSalesPaused ? 'bg-red-50/50 border-red-200' : 'bg-green-50/50 border-green-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`font-bold text-base ${storeForm.onlineSalesPaused ? 'text-red-700' : 'text-green-700'}`}>
                            {storeForm.onlineSalesPaused ? 'Compras Pausadas' : 'Compras Activas'}
                          </h4>
                          <p className="text-xs text-on-surface-variant mt-1">
                            {storeForm.onlineSalesPaused 
                              ? 'Los clientes no pueden finalizar compras online. El POS sigue funcionando.'
                              : 'Los clientes pueden comprar normalmente en la tienda web.'}
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox" 
                            checked={!storeForm.onlineSalesPaused} 
                            onChange={e => {
                              const isPaused = !e.target.checked;
                              setStoreForm(p => ({ 
                                ...p, 
                                onlineSalesPaused: isPaused,
                                pausedAt: isPaused ? new Date().toISOString() : null
                              }));
                            }} 
                            className="sr-only peer" 
                          />
                          <div className="w-14 h-7 bg-red-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
                        </label>
                      </div>
                    </div>

                    {storeForm.onlineSalesPaused && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Motivo de la Pausa (Visible para clientes)</label>
                          <textarea
                            value={storeForm.pauseReason}
                            onChange={e => setStoreForm(p => ({ ...p, pauseReason: e.target.value }))}
                            rows={2}
                            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all resize-none"
                            placeholder="Ej: Estamos actualizando precios. Volvemos en 30 minutos."
                          />
                        </div>
                        <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                          <input 
                            type="checkbox" 
                            checked={storeForm.allowBrowsingWhilePaused} 
                            onChange={e => setStoreForm(p => ({ ...p, allowBrowsingWhilePaused: e.target.checked }))} 
                            className="w-5 h-5 accent-primary rounded" 
                          />
                          <div>
                            <div className="font-bold text-sm">Permitir navegación de catálogo</div>
                            <div className="text-xs text-on-surface-variant">Si está activo, los clientes pueden ver productos pero no finalizar checkout.</div>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Zona de Cobertura y Delivery */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cobertura')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      📍
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Zona de Cobertura y Delivery</h3>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                          {generalForm.deliveryRadiusKm || 5} km
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Radio máximo de entrega y coordenadas de la sucursal</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['cobertura'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cobertura'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider">Radio Máximo de Cobertura</label>
                        <span className="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-lg">{generalForm.deliveryRadiusKm || 5} km</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="0.5"
                        value={generalForm.deliveryRadiusKm || 5}
                        onChange={e => setGeneralForm(p => ({ ...p, deliveryRadiusKm: parseFloat(e.target.value) || 5 }))}
                        className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-on-surface-variant font-bold mt-1">
                        <span>1 km</span>
                        <span>15 km</span>
                        <span>30 km</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-2">Los pedidos fuera de esta distancia se bloquearán para entrega a domicilio.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/10">
                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Latitud del Local</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={generalForm.storeLat ?? -33.459009}
                          onChange={e => setGeneralForm(p => ({ ...p, storeLat: parseFloat(e.target.value) || -33.459009 }))}
                          className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Longitud del Local</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={generalForm.storeLng ?? -67.551826}
                          onChange={e => setGeneralForm(p => ({ ...p, storeLng: parseFloat(e.target.value) || -67.551826 }))}
                          className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Cuenta Corriente */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cuentas')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      💳
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Límites de Cuenta Corriente</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${
                          accountForm.enabled ? 'bg-blue-100 text-blue-800' : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          {accountForm.enabled ? 'Habilitado' : 'Desactivado'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Configuración global para ventas a cuenta y límites de crédito</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['cuentas'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cuentas'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                      <div>
                        <h4 className="font-bold text-sm">Habilitar Control de Límites</h4>
                        <p className="text-xs text-on-surface-variant">Activa o desactiva la validación de límites en la caja y checkout.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={accountForm.enabled} onChange={e => setAccountForm(p => ({ ...p, enabled: e.target.checked }))} className="sr-only peer" />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    {accountForm.enabled && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Límite Monetario ($)</label>
                            <input
                              type="number"
                              value={accountForm.maxDebtAmount}
                              onChange={e => setAccountForm(p => ({ ...p, maxDebtAmount: Number(e.target.value) }))}
                              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Límite Temporal (Días)</label>
                            <input
                              type="number"
                              value={accountForm.maxDebtDays}
                              onChange={e => setAccountForm(p => ({ ...p, maxDebtDays: Number(e.target.value) }))}
                              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.warnOnAmountLimit} onChange={e => setAccountForm(p => ({ ...p, warnOnAmountLimit: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Advertir por Límite Monetario</div>
                              <div className="text-xs text-on-surface-variant">Mostrar alerta si la compra supera el monto máximo permitido</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.warnOnTimeLimit} onChange={e => setAccountForm(p => ({ ...p, warnOnTimeLimit: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Advertir por Límite Temporal</div>
                              <div className="text-xs text-on-surface-variant">Mostrar alerta si el cliente tiene deudas previas vencidas</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.allowOverride} onChange={e => setAccountForm(p => ({ ...p, allowOverride: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Permitir Excepciones en Caja (Override)</div>
                              <div className="text-xs text-on-surface-variant">Permite al cajero continuar la venta bajo su responsabilidad</div>
                            </div>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Columna Derecha: Seguridad & Automatizaciones */}
            <div className="space-y-5">

              {/* 4. Teléfonos Bloqueados (Lista Negra) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('seguridad')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🚫
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Seguridad y Teléfonos Bloqueados</h3>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 shrink-0">
                          {generalForm.blockedPhones?.length || 0} bloqueados
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Lista negra de números que no pueden realizar pedidos</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['seguridad'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['seguridad'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Bloquear un nuevo teléfono</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ej: 2634877314"
                          value={newBlockedPhone}
                          onChange={e => setNewBlockedPhone(e.target.value)}
                          className="flex-1 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const clean = newBlockedPhone.replace(/\D/g, '');
                            if (!clean) return;
                            const current = generalForm.blockedPhones || [];
                            if (!current.includes(clean)) {
                              setGeneralForm(p => ({ ...p, blockedPhones: [...current, clean] }));
                            }
                            setNewBlockedPhone('');
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold px-5 py-3 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          Bloquear
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 block">
                        Números bloqueados actualmente ({generalForm.blockedPhones?.length || 0})
                      </label>
                      {(!generalForm.blockedPhones || generalForm.blockedPhones.length === 0) ? (
                        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10 text-center text-xs text-on-surface-variant">
                          No hay números en la lista negra.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {generalForm.blockedPhones.map(phone => (
                            <div key={phone} className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-200/40 text-xs font-bold">
                              <span className="flex items-center gap-2 text-red-900">
                                <span className="material-symbols-outlined text-[16px] text-red-500">phone_disabled</span>
                                {phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setGeneralForm(p => ({
                                    ...p,
                                    blockedPhones: (p.blockedPhones || []).filter(item => item !== phone)
                                  }));
                                }}
                                className="text-red-500 hover:text-red-700 bg-white hover:bg-red-100 px-3 py-1 rounded-lg border border-red-200 text-[10px] font-bold transition-all flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                Desbloquear
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Cierre Automático de Caja */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cierre')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-xl shrink-0">
                      ⏰
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Cierre Automático de Caja</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${
                          autoCloseForm.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          {autoCloseForm.enabled ? autoCloseForm.time : 'Inactivo'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Cierra la caja automáticamente todos los días a la hora configurada</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['cierre'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cierre'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-sm">Activar cierre automático</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">Si está activo, la caja se cerrará sola a la hora indicada</p>
                      </div>
                      <button
                        onClick={() => setAutoCloseForm(f => ({ ...f, enabled: !f.enabled }))}
                        className={`relative w-14 h-7 rounded-full transition-all duration-300 shrink-0 ${
                          autoCloseForm.enabled ? 'bg-primary' : 'bg-outline-variant/30'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-all duration-300 ${
                          autoCloseForm.enabled ? 'left-7' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Hora del Cierre</label>
                      <input
                        type="time"
                        value={autoCloseForm.time}
                        onChange={e => setAutoCloseForm(f => ({ ...f, time: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-lg outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Notificaciones a Empleados */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('notificaciones')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-orange-100 text-orange-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🔔
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Notificaciones a Empleados</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${
                          !generalForm.suspendEmployeeNotifications ? 'bg-orange-100 text-orange-800' : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          {!generalForm.suspendEmployeeNotifications ? 'Activas' : 'Pausadas'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Control general de notificaciones y alertas por WhatsApp</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${
                    openPanels['notificaciones'] ? 'rotate-180 text-primary' : ''
                  }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['notificaciones'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                      <div>
                        <h4 className="font-bold text-sm">Habilitar notificaciones a empleados</h4>
                        <p className="text-xs text-on-surface-variant">Si está activo, se enviarán alertas de pedidos y bajo stock por WhatsApp.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={!generalForm.suspendEmployeeNotifications} onChange={e => setGeneralForm(p => ({ ...p, suspendEmployeeNotifications: !e.target.checked }))} className="sr-only peer" />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Barra de Acciones Global */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
            <div className="flex-1">
              <h4 className="font-black text-base text-on-background">Guardar Cambios de Configuración</h4>
              <p className="text-xs text-on-surface-variant">Aplica todas las modificaciones realizadas en la configuración general.</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={handleReset} 
                className="flex-1 sm:flex-initial bg-surface-container-low border border-outline-variant/10 font-bold px-6 py-3.5 rounded-2xl text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
              <button 
                onClick={handleSave} 
                className="flex-1 sm:flex-initial bg-primary text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar Configuración
              </button>
            </div>
          </div>

          {/* Ayuda y Documentación */}
          <div className="bg-blue-50/50 rounded-[2rem] border border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-blue-600 text-3xl">lightbulb</span>
              <div>
                <h4 className="font-black text-blue-900 text-xl">Ayuda y Documentación</h4>
                <p className="text-sm text-blue-800/70">Todo lo que necesitas saber sobre cómo funcionan estas configuraciones</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Notificaciones Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Notificaciones de WhatsApp</h5>
                <p className="text-sm text-blue-800">Al desactivarlas, los empleados no recibirán mensajes de nuevos pedidos ni los administradores recibirán alertas de stock. Útil para hacer pruebas o para fuera del horario comercial.</p>
              </div>

              {/* Cuenta Corriente Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Límites de Cuenta Corriente</h5>
                <p className="text-sm text-blue-800">Se aplican de forma <strong>global</strong>. Si un cliente necesita un límite diferente, debes ajustarlo de forma personalizada desde la pestaña de <em>Clientes</em>. Las excepciones permiten ignorar la alerta bajo responsabilidad del cajero.</p>
              </div>

              {/* Tienda Online Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">store_mall_directory</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Pausa de Ventas Online</h5>
                <p className="text-sm text-blue-800">Ideal al momento de actualizar precios de manera masiva. Al pausar las ventas online, el POS para ventas presenciales seguirá funcionando normalmente sin ninguna interrupción.</p>
              </div>

              {/* Cierre Automático Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Cierre Automático</h5>
                <p className="text-sm text-blue-800">Requiere que el panel de administración esté abierto en el navegador a la hora configurada. El proceso utiliza la misma lógica que el cierre manual, y generará su reporte y ticket correspondiente.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
