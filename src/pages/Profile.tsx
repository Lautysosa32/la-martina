import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAdmin } from '../context/AdminContext';
import { useNavigate } from 'react-router-dom';

export const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { addItem } = useCart();
  const { customers, orders, toggleCurrentAccount } = useAdmin();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showCCModal, setShowCCModal] = useState(false);
  const [selectedCCDate, setSelectedCCDate] = useState<string | null>(null);
  const [ccError, setCcError] = useState<string | null>(null);

  const currentCustomer = useMemo(() => {
    if (!user?.phone) return null;
    return customers.find(c => c.phone.replace(/\s+/g, '') === user.phone.replace(/\s+/g, ''));
  }, [customers, user?.phone]);

  const ccOrders = useMemo(() => {
    if (!user?.phone) return [];
    return orders.filter(o =>
      o.phone.replace(/\s+/g, '') === user.phone.replace(/\s+/g, '') &&
      o.paymentMethod === 'cuenta_corriente' &&
      o.status !== 'Cancelado'
    ).sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      return tsB - tsA;
    });
  }, [orders, user?.phone]);

  const ccByDate = useMemo(() => {
    const groups: Record<string, typeof ccOrders> = {};
    ccOrders.forEach(o => {
      const date = o.date.split(',')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(o);
    });
    return Object.entries(groups).map(([date, items]) => ({
      date,
      total: items.reduce((s, i) => s + i.total, 0),
      isPaid: items.every(i => i.paymentStatus === 'Pagado'),
      orders: items
    }));
  }, [ccOrders]);

  const handleRepeatOrder = (items: any[]) => {
    items.forEach(item => {
      addItem(item);
    });
    navigate('/cart');
  };
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || ''
  });

  const handleSave = () => {
    updateUser(formData);
    setIsEditing(false);
  };

  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
      <div className="mb-10">
        <h1 className="text-[25px] font-bold text-on-background mb-2">Mi Perfil</h1>
        <p className="text-on-surface-variant text-base">Gestioná tus datos y revisá tus pedidos anteriores.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Datos Personales */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Mis Datos</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-primary text-sm font-bold hover:underline"
              >
                {isEditing ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Nombre Completo</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2 outline-none focus:border-primary"
                  />
                ) : (
                  <p className="font-medium">{user?.name || 'No especificado'}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">WhatsApp / Teléfono</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2 outline-none focus:border-primary"
                  />
                ) : (
                  <p className="font-medium">{user?.phone || 'No especificado'}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Dirección Predeterminada</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2 outline-none focus:border-primary"
                  />
                ) : (
                  <p className="font-medium text-sm">{user?.address || 'No especificada'}</p>
                )}
              </div>

              {isEditing && (
                <button
                  onClick={handleSave}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl mt-4 hover:bg-primary/90 transition-all"
                >
                  Guardar Cambios
                </button>
              )}
            </div>
          </div>

          {/* Sección de Cuenta Corriente (si habilitada) */}
          {currentCustomer?.hasCurrentAccount && (
            <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm animate-in zoom-in-95 duration-500">
              <div className="flex items-center gap-3 mb-4 text-primary">
                <span className="material-symbols-outlined text-[28px]">menu_book</span>
                <h2 className="text-lg font-bold text-on-background">Cuenta Corriente</h2>
              </div>

              <div className="bg-surface-container-low rounded-2xl p-4 mb-5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Deuda Pendiente</p>
                <p className={`text-2xl font-black ${currentCustomer.currentDebt > 0 ? 'text-error' : 'text-green-600'}`}>
                  ${currentCustomer.currentDebt.toLocaleString('es-AR')}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setShowCCModal(true)}
                  className="w-full bg-primary/10 text-primary font-bold py-3 rounded-xl hover:bg-primary/20 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                  Revisar cuenta corriente
                </button>

                <button
                  onClick={() => {
                    const res = toggleCurrentAccount(currentCustomer.phone);
                    if (!res.success) setCcError(res.message || 'Error al modificar cuenta');
                  }}
                  className="w-full text-on-surface-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all text-[11px] uppercase tracking-widest"
                >
                  Deshabilitar cuenta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Historial de Pedidos */}
        <div className="md:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-on-background">Historial de Pedidos</h2>

          {user?.orders && user.orders.length > 0 ? (
            <div className="space-y-4">
              {user.orders.map((order) => {
                const isExpanded = expandedOrderId === order.id;

                return (
                  <div key={order.id} className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden transition-all duration-300">
                    {/* Header del Pedido */}
                    <div
                      className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-lowest transition-colors ${isExpanded ? 'bg-surface-container-lowest border-b border-outline-variant/10' : ''}`}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-primary-container/20 text-primary'}`}>
                          <span className="material-symbols-outlined">shopping_bag</span>
                        </div>
                        <div>
                          <p className="font-bold">Pedido #{order.id}</p>
                          <p className="text-on-surface-variant text-sm">{order.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 flex-1">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total</p>
                          <p className="font-bold text-primary">${order.total.toLocaleString('es-AR')}</p>
                        </div>
                        <div className={`px-3 py-1 text-[11px] font-bold rounded-full ${order.status === 'Entregado' ? 'bg-green-100 text-green-700' :
                            order.status === 'En Camino' ? 'bg-purple-100 text-purple-700' :
                              order.status === 'Preparando' ? 'bg-orange-100 text-orange-600' :
                                order.status === 'Cancelado' ? 'bg-red-100 text-red-600' :
                                  'bg-blue-100 text-blue-600'
                          }`}>
                          {order.status}
                        </div>
                        <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${isExpanded ? 'rotate-90 text-primary' : ''}`}>
                          chevron_right
                        </span>
                      </div>
                    </div>

                    {/* Detalle Expandido */}
                    {isExpanded && (
                      <div className="p-6 bg-surface-container-lowest/50 animate-in slide-in-from-top-2 duration-300">
                        <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4">Productos del pedido</h4>
                        <div className="space-y-4">
                          {order.items.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-lg p-1 border border-outline-variant/10">
                                  <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{item.name}</p>
                                  <p className="text-[11px] text-on-surface-variant">{item.quantity} x ${(item.price ?? 0).toLocaleString('es-AR')}</p>
                                </div>
                              </div>
                              <p className="text-sm font-bold">${(item.price * item.quantity).toLocaleString('es-AR')}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 pt-6 border-t border-outline-variant/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Entrega en</h4>
                            <div className="flex items-start gap-2">
                              <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
                              <p className="text-xs text-on-surface font-medium">{(order as any).address || 'No especificada'}</p>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Horario</h4>
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                              <p className="text-xs text-on-surface font-medium">{(order as any).deliveryTime || 'Lo antes posible'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-outline-variant/10 space-y-2">
                          <div className="flex justify-between items-center text-sm font-medium">
                            <span className="text-on-surface-variant">Subtotal</span>
                            <span className="text-on-background">${((order as any).total + ((order as any).discount || 0)).toLocaleString('es-AR')}</span>
                          </div>
                          {(order as any).discount !== undefined && (order as any).discount > 0 && (
                            <div className="flex justify-between items-center text-sm font-medium text-error">
                              <span>Descuento ({(order as any).discountLabel || 'Oferta'})</span>
                              <span>-${((order as any).discount).toLocaleString('es-AR')}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-outline-variant/5">
                            <span className="text-sm font-bold text-on-surface-variant">Total del Pedido</span>
                            <span className="text-lg font-bold text-primary">${order.total.toLocaleString('es-AR')}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRepeatOrder(order.items)}
                          className="w-full mt-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all text-sm shadow-md flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[20px]">refresh</span>
                          Repetir Pedido
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4">history</span>
              <p className="text-on-surface-variant">Todavía no has realizado ningún pedido.</p>
            </div>
          )}
        </div>
      </div>
      {/* Modals para Cuenta Corriente */}
      {showCCModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCCModal(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                <h3 className="text-xl font-bold">Detalle Cuenta Corriente</h3>
              </div>
              <button onClick={() => setShowCCModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Gasto Histórico (CC)</p>
                  <p className="text-lg font-black text-on-background">${ccOrders.reduce((s, o) => s + o.total, 0).toLocaleString('es-AR')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Deuda Pendiente</p>
                  <p className="text-lg font-black text-error">${(currentCustomer?.currentDebt ?? 0).toLocaleString('es-AR')}</p>
                </div>
              </div>

              <h4 className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-2">Movimientos por día</h4>
              <div className="space-y-3">
                {ccByDate.length > 0 ? ccByDate.map((group, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedCCDate(selectedCCDate === group.date ? null : group.date)}
                    className="bg-white border border-outline-variant/10 rounded-2xl p-4 cursor-pointer hover:border-primary/30 transition-all group"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">{group.date}</p>
                        <p className="text-[10px] text-on-surface-variant">{group.orders.length} {group.orders.length === 1 ? 'operación' : 'operaciones'}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className={`text-sm font-black ${group.isPaid ? 'text-green-600' : 'text-error'}`}>
                            ${group.total.toLocaleString('es-AR')}
                          </p>
                          <p className={`text-[9px] font-bold uppercase ${group.isPaid ? 'text-green-600' : 'text-error'}`}>
                            {group.isPaid ? 'Saldado' : 'Pendiente'}
                          </p>
                        </div>
                        <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${selectedCCDate === group.date ? 'rotate-90' : ''}`}>chevron_right</span>
                      </div>
                    </div>

                    {selectedCCDate === group.date && (
                      <div className="mt-4 pt-4 border-t border-outline-variant/5 space-y-3 animate-in slide-in-from-top-2 duration-300">
                        {group.orders.map(order => (
                          <div key={order.id} className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/10">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] font-black text-primary">#{order.id}</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${order.paymentStatus === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {order.paymentStatus === 'Pagado' ? 'SALDADO' : (order.paidAmount && order.paidAmount > 0 ? 'PAGO PARCIAL' : 'PENDIENTE')}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {order.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span className="text-on-surface-variant">{item.quantity}x {item.name}</span>
                                  <span className="font-bold">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 pt-2 border-t border-dashed border-outline-variant/20 flex flex-col items-end">
                              <div className="flex justify-between w-full">
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase">Total Pedido</span>
                                <span className="text-xs font-bold text-on-background">${order.total.toLocaleString('es-AR')}</span>
                              </div>
                              {order.paidAmount !== undefined && order.paidAmount > 0 && order.paymentStatus !== 'Pagado' && (
                                <>
                                  <div className="flex justify-between w-full mt-1">
                                    <span className="text-[10px] font-bold text-green-600 uppercase">Abonado</span>
                                    <span className="text-xs font-bold text-green-600">-${order.paidAmount.toLocaleString('es-AR')}</span>
                                  </div>
                                  <div className="flex justify-between w-full mt-1 pt-1 border-t border-outline-variant/5">
                                    <span className="text-[10px] font-black text-error uppercase">Resta Pagar</span>
                                    <span className="text-sm font-black text-error">${(order.total - order.paidAmount).toLocaleString('es-AR')}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-on-surface-variant">No hay movimientos en tu cuenta corriente.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-surface-container-low border-t border-outline-variant/10">
              <button
                onClick={() => setShowCCModal(false)}
                className="w-full bg-on-surface text-white font-bold py-3.5 rounded-2xl hover:bg-on-surface/90 transition-all shadow-md"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Error Cuenta Corriente */}
      {ccError && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
};
