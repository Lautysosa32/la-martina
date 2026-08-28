import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { useNotificationStore } from '../stores/useNotificationStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useProductStore } from '../stores/useProductStore';

interface AppNotification {
  id: string; 
  section: string;
  icon: string;
  title: string;
  description: string;
  priority: 'CRÍTICA' | 'IMPORTANTE' | 'INFORMACIÓN' | 'NORMAL';
  actionPath: string;
  value: number;
  timestamp: string; 
  isRead?: boolean;
}

export const AdminNotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const { orders, customers, isCashRegisterOpen, cashRegister } = useAdmin();
  const { employeeProfile, hasPermission } = useAuthStore();
  const { lowStockDashboardTotal: lowStockCount, fetchLowStockDashboardProducts } = useProductStore();
  const { reads, fetchReads, markAsRead, markAllAsRead } = useNotificationStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch reads & low stock summary on mount
  useEffect(() => {
    if (employeeProfile?.id) {
      fetchReads(employeeProfile.id);
    }
    fetchLowStockDashboardProducts({ page: 1, limit: 100 });
  }, [employeeProfile?.id, fetchReads, fetchLowStockDashboardProducts]);

  // Click outside listener
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isSuperOrOwner = employeeProfile?.role === 'super_admin' || employeeProfile?.role === 'owner';
  const canViewProducts = isSuperOrOwner || hasPermission('products.view');
  const canViewOrders = isSuperOrOwner || hasPermission('orders.view');
  const canViewCustomers = isSuperOrOwner || (employeeProfile?.role !== 'employee' && hasPermission('customers.view'));
  const canViewCash = isSuperOrOwner || hasPermission('cash.view') || hasPermission('pos.access');

  const notifications = useMemo(() => {
    const list: AppNotification[] = [];

    // 1. Inventario (Stock Crítico)
    if (canViewProducts && lowStockCount > 0) {
      list.push({
        id: 'inventory_low_stock',
        section: 'INVENTARIO',
        icon: 'inventory_2',
        title: `${lowStockCount.toLocaleString('es-AR')} productos con stock bajo`,
        description: 'Hay productos que requieren reposición o tienen stock crítico.',
        priority: lowStockCount > 10 ? 'CRÍTICA' : 'IMPORTANTE',
        actionPath: '/admin/inventory', 
        value: lowStockCount,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Pedidos (Nuevos)
    const newOrdersCount = orders.filter(o => o.status === 'Nuevo').length;
    if (canViewOrders && newOrdersCount > 0) {
      list.push({
        id: 'orders_new',
        section: 'PEDIDOS',
        icon: 'shopping_bag',
        title: `${newOrdersCount.toLocaleString('es-AR')} pedidos nuevos`,
        description: 'Hay pedidos nuevos pendientes de revisión.',
        priority: 'INFORMACIÓN',
        actionPath: '/admin/orders',
        value: newOrdersCount,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Clientes (Cuentas excedidas)
    const overLimitCustomersCount = customers.filter(c => c.hasCurrentAccount && c.currentDebt > c.creditLimit).length;
    if (canViewCustomers && overLimitCustomersCount > 0) {
      list.push({
        id: 'customers_over_limit',
        section: 'CLIENTES',
        icon: 'group',
        title: `${overLimitCustomersCount} cuentas excedidas`,
        description: 'Hay clientes que superaron el límite de su cuenta corriente.',
        priority: 'IMPORTANTE',
        actionPath: '/admin/customers',
        value: overLimitCustomersCount,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Caja (Abierta de días anteriores)
    if (canViewCash && isCashRegisterOpen && cashRegister.openedAt) {
      const openedDate = new Date(cashRegister.openedAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (openedDate < today) {
        list.push({
          id: 'cash_pending_close',
          section: 'CAJA',
          icon: 'point_of_sale',
          title: 'Caja pendiente de cierre',
          description: 'La caja del día anterior no fue cerrada.',
          priority: 'CRÍTICA',
          actionPath: '/admin/pos',
          value: 1, 
          timestamp: cashRegister.openedAt,
        });
      }
    }

    return list;
  }, [lowStockCount, orders, customers, isCashRegisterOpen, cashRegister.openedAt]);

  // Determine unread status
  const notificationStates = useMemo(() => {
    return notifications.map(n => {
      const lastReadVal = reads[n.id] || 0;
      const isRead = lastReadVal >= n.value;
      return { ...n, isRead };
    });
  }, [notifications, reads]);

  const unreadCount = notificationStates.filter(n => !n.isRead).length;

  const handleNotificationClick = (n: AppNotification) => {
    if (employeeProfile?.id && !n.isRead) {
      markAsRead(employeeProfile.id, n.id, n.value);
    }
    setIsOpen(false);
    navigate(n.actionPath);
  };

  const handleMarkAllAsRead = () => {
    if (employeeProfile?.id) {
      markAllAsRead(
        employeeProfile.id, 
        notificationStates.filter(n => !n.isRead).map(n => ({ groupKey: n.id, value: n.value }))
      );
    }
  };

  // Sort: Unread first, then priority (CRÍTICA > IMPORTANTE > INFORMACIÓN)
  const sortedNotifications = [...notificationStates].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const priorityWeight = { 'CRÍTICA': 3, 'IMPORTANTE': 2, 'INFORMACIÓN': 1, 'NORMAL': 0 };
    return priorityWeight[b.priority] - priorityWeight[a.priority];
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-outline-variant/10 shadow-sm relative hover:bg-surface-container-lowest transition-colors"
      >
        <span className="material-symbols-outlined" aria-hidden="true" translate="no">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-5 h-5 bg-error rounded-full text-white text-[10px] font-bold flex items-center justify-center animate-in zoom-in">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-[-60px] md:right-0 top-14 w-[340px] md:w-96 bg-white rounded-[2rem] shadow-2xl border border-outline-variant/10 z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 md:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">notifications</span>
              Notificaciones
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-lg"
              >
                <span className="material-symbols-outlined text-[14px]">done_all</span>
                Marcar leídas
              </button>
            )}
          </div>

          <div className="flex-1 max-h-[60vh] overflow-y-auto custom-scrollbar bg-surface-container-lowest/50">
            {sortedNotifications.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-on-surface-variant/50 text-center">
                <span className="material-symbols-outlined text-5xl mb-4 text-green-400">check_circle</span>
                <p className="font-bold">Todo está al día</p>
                <p className="text-xs mt-1">No hay notificaciones pendientes.</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/5">
                {sortedNotifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left p-4 md:p-5 hover:bg-surface-container-low transition-colors flex gap-4 ${!n.isRead ? 'bg-primary/5' : ''}`}
                  >
                    <div className="mt-1 shrink-0 relative">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm ${
                        n.priority === 'CRÍTICA' ? 'bg-error/10 text-error' :
                        n.priority === 'IMPORTANTE' ? 'bg-orange-500/10 text-orange-600' :
                        'bg-blue-500/10 text-blue-600'
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">{n.icon}</span>
                      </div>
                      {!n.isRead && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-white shadow-sm"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest truncate ${
                          n.priority === 'CRÍTICA' ? 'text-error' :
                          n.priority === 'IMPORTANTE' ? 'text-orange-600' :
                          'text-primary'
                        }`}>
                          {n.section}
                        </span>
                      </div>
                      <p className={`font-bold text-[14px] leading-tight mb-1 truncate ${!n.isRead ? 'text-on-background' : 'text-on-surface-variant'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                        {n.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
