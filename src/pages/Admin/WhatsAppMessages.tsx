import React, { useEffect, useState } from 'react';
import { whatsappMessageService, WhatsAppMessage } from '../../services/whatsapp-message.service';
import { useAdmin } from '../../context/AdminContext';

export const WhatsAppMessages: React.FC = () => {
  const { formatCurrency } = useAdmin();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const data = await whatsappMessageService.getAllMessages();
      setMessages(data || []);
    } catch (err: any) {
      setError('Error al obtener mensajes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleCancel = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas cancelar este mensaje pendiente?')) {
      const ok = await whatsappMessageService.cancelMessage(id);
      if (ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'cancelled' } : m));
      } else {
        alert('No se pudo cancelar el mensaje.');
      }
    }
  };

  const handleRetry = async (id: string) => {
    const ok = await whatsappMessageService.retryMessage(id);
    if (ok) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'pending', attempts: 0, error_message: null } : m));
    } else {
      alert('No se pudo programar el reintento del mensaje.');
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'sending':
        return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
      case 'sent':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-surface-container-low text-on-surface border-outline-variant/10';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'sending': return 'Enviando';
      case 'sent': return 'Enviado';
      case 'failed': return 'Fallido';
      case 'cancelled': return 'Cancelado';
      default: return status || 'Desconocido';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'order_created': return 'Pedido Creado';
      case 'order_status_changed': return 'Estado de Pedido';
      case 'sale_confirmed': return 'Venta POS';
      case 'current_account_debt_added': return 'Compra Cta. Cte.';
      case 'current_account_payment_received': return 'Pago Cta. Cte.';
      case 'current_account_limit_exceeded': return 'Límite Superado';
      case 'current_account_debt_due': return 'Deuda Vencida';
      default: return type;
    }
  };

  // Filtrado de mensajes
  const filteredMessages = messages.filter(m => {
    const matchesSearch =
      (m.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.phone || '').includes(searchQuery) ||
      (m.message || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;
    const matchesType = typeFilter === 'All' || m.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-on-background">Cola de Mensajes WhatsApp</h2>
          <p className="text-sm text-on-surface-variant font-medium mt-1">Monitorea y administra la cola de envíos para el worker de WhatsApp Web.</p>
        </div>
        <button
          onClick={fetchMessages}
          className="flex items-center justify-center gap-2 bg-surface-container-low hover:bg-surface-container-highest border border-outline-variant/10 text-on-surface font-bold px-5 py-2.5 rounded-full transition-all text-xs shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px] animate-spin-hover">sync</span>
          Actualizar Cola
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-error p-4 rounded-2xl border border-red-100 flex items-center gap-3">
          <span className="material-symbols-outlined">error</span>
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Contadores Estadísticos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-5 rounded-[1.8rem] bg-white border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Pendientes</p>
          <p className="text-2xl font-black text-yellow-600">{messages.filter(m => m.status === 'pending').length}</p>
        </div>
        <div className="p-5 rounded-[1.8rem] bg-white border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Enviando</p>
          <p className="text-2xl font-black text-blue-600 animate-pulse">{messages.filter(m => m.status === 'sending').length}</p>
        </div>
        <div className="p-5 rounded-[1.8rem] bg-white border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Enviados</p>
          <p className="text-2xl font-black text-green-600">{messages.filter(m => m.status === 'sent').length}</p>
        </div>
        <div className="p-5 rounded-[1.8rem] bg-white border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Fallidos</p>
          <p className="text-2xl font-black text-error">{messages.filter(m => m.status === 'failed').length}</p>
        </div>
        <div className="p-5 rounded-[1.8rem] bg-white border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Cancelados</p>
          <p className="text-2xl font-black text-on-surface-variant/60">{messages.filter(m => m.status === 'cancelled').length}</p>
        </div>
      </div>

      {/* Controles de Filtros */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/10 p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <span className="material-symbols-outlined absolute left-4 top-3 text-on-surface-variant/50">search</span>
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono o mensaje..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10 transition-all"
          />
        </div>

        <div className="flex flex-wrap w-full md:w-auto gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-surface-container-low border-none rounded-2xl px-5 py-3 text-sm font-bold outline-none cursor-pointer focus:ring-2 ring-primary/10 transition-all flex-1 md:flex-none"
          >
            <option value="All">Estado: Todos</option>
            <option value="pending">Pendiente</option>
            <option value="sending">Enviando</option>
            <option value="sent">Enviado</option>
            <option value="failed">Fallido</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-surface-container-low border-none rounded-2xl px-5 py-3 text-sm font-bold outline-none cursor-pointer focus:ring-2 ring-primary/10 transition-all flex-1 md:flex-none"
          >
            <option value="All">Tipo Alerta: Todos</option>
            <option value="order_status_changed">Estado Pedido</option>
            <option value="current_account_debt_added">Compra Cta. Cte.</option>
            <option value="current_account_payment_received">Pago Cta. Cte.</option>
            <option value="current_account_limit_exceeded">Límite Superado</option>
          </select>
        </div>
      </div>

      {/* Tabla de Mensajes */}
      {loading ? (
        <div className="flex justify-center p-12 bg-white rounded-[2rem] border border-outline-variant/10">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest text-[11px] font-black text-on-surface-variant uppercase tracking-wider">
                  <th className="px-4 py-4">Fecha</th>
                  <th className="px-4 py-4">Cliente / Teléfono</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4">Mensaje</th>
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4 text-center">Intentos</th>
                  <th className="px-4 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-sm">
                {filteredMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-surface-container-lowest transition-colors group">
                    <td className="px-4 py-4 text-xs text-on-surface-variant font-medium whitespace-nowrap">
                      {msg.created_at ? new Date(msg.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-on-background">{msg.customer_name || 'Cliente'}</div>
                      <div className="text-xs text-on-surface-variant font-medium flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">call</span>
                        +{msg.phone}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2.5 py-1 bg-surface-container-low text-on-surface-variant text-xs font-bold rounded-lg whitespace-nowrap border border-outline-variant/5">
                        {getTypeLabel(msg.type)}
                      </span>
                    </td>
                    <td className="px-4 py-4 max-w-[240px] xl:max-w-[320px]">
                      <p className="text-xs text-on-background whitespace-pre-wrap font-medium line-clamp-3 bg-surface-container-low/50 p-2 rounded-xl border border-outline-variant/5">
                        {msg.message}
                      </p>
                      {msg.error_message && (
                        <div className="text-[10px] text-error font-bold flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined text-[12px]">warning</span>
                          Error: {msg.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${getStatusBadge(msg.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${msg.status === 'sent' ? 'bg-green-500' : msg.status === 'failed' ? 'bg-error' : msg.status === 'pending' ? 'bg-yellow-500' : msg.status === 'sending' ? 'bg-blue-500' : 'bg-gray-400'}`}></span>
                        {getStatusLabel(msg.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-black text-center text-on-surface-variant">
                      {msg.attempts}
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      {msg.status === 'pending' && (
                        <button
                          onClick={() => msg.id && handleCancel(msg.id)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-error font-bold text-xs rounded-xl border border-red-200 transition-colors"
                          title="Cancelar mensaje"
                        >
                          Cancelar
                        </button>
                      )}
                      {msg.status === 'failed' && (
                        <button
                          onClick={() => msg.id && handleRetry(msg.id)}
                          className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl border border-green-200 transition-colors"
                          title="Reintentar mensaje"
                        >
                          Reintentar
                        </button>
                      )}
                      {msg.status === 'cancelled' && (
                        <button
                          onClick={() => msg.id && handleRetry(msg.id)}
                          className="px-3 py-1.5 bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant font-bold text-xs rounded-xl border border-outline-variant/10 transition-colors"
                          title="Activar de nuevo"
                        >
                          Re-activar
                        </button>
                      )}
                      {msg.status === 'sent' && (
                        <span className="material-symbols-outlined text-green-600 text-[20px]" title="Mensaje enviado con éxito">task_alt</span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredMessages.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[48px] opacity-20 mb-4 block">forum</span>
                      <p className="text-sm font-bold">No se encontraron mensajes en la cola</p>
                      <p className="text-xs mt-1">Los mensajes transaccionales de cuenta corriente y pedidos se listarán aquí.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
