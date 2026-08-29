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

      const defaultGeneralConfig = { suspendEmployeeNotifications: false };
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
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              
              {/* Cierre Automático (Moved Up) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Cierre Automático de Caja</h3>
                      <p className="text-xs text-on-surface-variant">Cierra la caja automáticamente todos los días a la hora configurada</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
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
              </div>

              {/* Notificaciones (Modified Logic) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-orange-700 text-[20px]">notifications_active</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Notificaciones a Empleados</h3>
                      <p className="text-xs text-on-surface-variant">Control general de notificaciones por WhatsApp</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
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
              </div>

              <div className="flex gap-3 pb-8 lg:pb-0">
                <button onClick={handleSave} className="flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">save</span>
                  Guardar Configuración
                </button>
                <button onClick={handleReset} className="flex-1 bg-white border border-outline-variant/10 font-bold py-4 rounded-2xl text-on-surface-variant hover:bg-surface-container-lowest transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                  Restaurar
                </button>
              </div>

            </div>

            <div className="space-y-6">
              {/* Tienda Online */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-purple-700 text-[20px]">store_mall_directory</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Estado de la Tienda Online</h3>
                      <p className="text-xs text-on-surface-variant">Control de ventas al público general</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className={`flex flex-col gap-2 p-5 rounded-2xl border ${storeForm.onlineSalesPaused ? 'bg-red-50/50 border-red-200' : 'bg-green-50/50 border-green-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className={`font-bold text-lg ${storeForm.onlineSalesPaused ? 'text-red-700' : 'text-green-700'}`}>
                          {storeForm.onlineSalesPaused ? 'Compras Pausadas' : 'Compras Activas'}
                        </h4>
                        <p className="text-sm text-on-surface-variant mt-1">
                          {storeForm.onlineSalesPaused 
                            ? 'Los clientes no pueden finalizar compras. El POS sigue funcionando.'
                            : 'Los clientes pueden comprar normalmente en la tienda.'}
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
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
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
                          <div className="font-bold text-sm">Permitir navegación</div>
                          <div className="text-xs text-on-surface-variant">Si está activo, los clientes pueden ver el catálogo pero no pueden hacer checkout. Si se desactiva, se bloquea toda la tienda.</div>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Cuenta Corriente */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-blue-700 text-[20px]">account_balance_wallet</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Límites de Cuenta Corriente</h3>
                      <p className="text-xs text-on-surface-variant">Configuración global para ventas a cuenta</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                    <div>
                      <h4 className="font-bold text-sm">Habilitar Control de Límites</h4>
                      <p className="text-xs text-on-surface-variant">Activa o desactiva la validación de límites en la caja.</p>
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
                            <div className="font-bold text-sm">Permitir Excepciones (Override)</div>
                            <div className="text-xs text-on-surface-variant">Permite al cajero continuar la venta "de todas formas" bajo su responsabilidad</div>
                          </div>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
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
