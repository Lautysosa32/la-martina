import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { products } from '../../data/mockData';
import { useAuthStore } from '../../stores/useAuthStore';

import { PermissionKey } from '../../types/permissions.types';

type NavItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  requiredPermission?: PermissionKey;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/admin', requiredPermission: 'dashboard.view_operations' },
  { id: 'inventory', label: 'Inventario', icon: 'inventory_2', path: '/admin/inventory', requiredPermission: 'products.view' },
  { id: 'orders', label: 'Pedidos', icon: 'shopping_bag', path: '/admin/orders', requiredPermission: 'orders.view' },
  { id: 'pos', label: 'Caja', icon: 'point_of_sale', path: '/admin/pos', requiredPermission: 'pos.access' },
  { id: 'analytics', label: 'Analíticas', icon: 'analytics', path: '/admin/analytics', requiredPermission: 'dashboard.view_financial' },
  { id: 'customers', label: 'Clientes', icon: 'group', path: '/admin/customers', requiredPermission: 'customers.view' },
  { id: 'employees', label: 'Empleados', icon: 'badge', path: '/admin/employees', requiredPermission: 'employees.view' },
  { id: 'billing', label: 'Facturación', icon: 'receipt_long', path: '/admin/billing', requiredPermission: 'billing.view' },
  { id: 'settings', label: 'Configuración', icon: 'settings', path: '/admin/settings', requiredPermission: 'settings.access' },
];

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { orders, lowStockCount, privacyMode, togglePrivacyMode, formatCurrency } = useAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const session = useAuthStore((state) => state.session);
  const initialized = useAuthStore((state) => state.initialized);
  const loading = useAuthStore((state) => state.loading);
  const signOut = useAuthStore((state) => state.signOut);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  // Guard: while auth is not ready, don't filter nav items
  // (prevents sidebar going blank when employeeProfile is momentarily null)
  const authReady = initialized && !loading;

  const visibleNavItems = navItems.filter(item => {
    if (!authReady) return true; // show all while loading, skeleton will cover it
    if (!item.requiredPermission) return true;
    if (employeeProfile?.role === 'super_admin' || employeeProfile?.role === 'owner') return true;
    if (employeeProfile?.role === 'employee' && item.requiredPermission.startsWith('customers.')) return false;
    return hasPermission(item.requiredPermission);
  });

  const activeNavItem = visibleNavItems.find(item => {
    if (item.path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(item.path);
  });
  const pageTitle = activeNavItem ? activeNavItem.label : 'Admin';

  // Bottom nav: show first 4 accessible items (most important)
  const bottomNavItems = visibleNavItems.slice(0, 4);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/admin/login', { replace: true });
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  // Close search dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const q = searchQuery.toLowerCase().trim();

  const matchedProducts = q.length >= 2
    ? products.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).slice(0, 4)
    : [];

  const matchedOrders = q.length >= 2
    ? orders.filter(o => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q)).slice(0, 4)
    : [];

  const hasResults = matchedProducts.length > 0 || matchedOrders.length > 0;

  const currentPageLabel = visibleNavItems.find(n => n.path === location.pathname)?.label || 'Admin';
  const newOrdersCount = orders.filter(o => o.status === 'Nuevo').length;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-body-md overflow-x-hidden w-full">

      {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
      <aside className="hidden lg:flex w-[260px] bg-white border-r border-outline-variant/10 flex-col fixed h-full z-30">
        <div className="p-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex flex-col">
              <span className="text-[22px] font-bold text-primary leading-tight">La Martina</span>
              <span className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Admin Suite</span>
            </Link>
            <button
              onClick={togglePrivacyMode}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${privacyMode ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
              title={privacyMode ? "Ocultar números activado" : "Ocultar números desactivado"}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">
                {privacyMode ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {/* Skeleton mientras el auth se inicializa */}
          {!authReady ? (
            <div className="space-y-1 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-11 bg-surface-container-low rounded-2xl" />
              ))}
            </div>
          ) : (
            visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm relative ${
                    isActive
                      ? (item.id === 'pos' ? 'bg-[#e3001b] text-white shadow-lg shadow-red-500/20' : 'bg-primary text-white shadow-lg shadow-primary/20')
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">{item.icon}</span>
                  {item.label}
                  {item.id === 'orders' && newOrdersCount > 0 && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-error text-white'}`}>
                      {newOrdersCount}
                    </span>
                  )}
                  {item.id === 'inventory' && lowStockCount > 0 && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'}`}>
                      {lowStockCount}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </nav>

        <div className="p-4 border-t border-outline-variant/10 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-on-surface-variant font-bold text-sm hover:bg-surface-container-low transition-all"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">storefront</span>
            Ir a la Tienda
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-error font-bold text-sm hover:bg-red-50 hover:text-error transition-all"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">logout</span>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER PANEL ── */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-[280px] bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex flex-col" onClick={() => setIsMobileMenuOpen(false)}>
              <span className="text-[20px] font-bold text-primary leading-tight">La Martina</span>
              <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Admin Suite</span>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true" translate="no">close</span>
            </button>
          </div>
          {/* Profile mini in drawer */}
          <div className="flex items-center gap-3 mt-5 p-3 bg-surface-container-lowest rounded-2xl">
            <div className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-sm shrink-0">
              {employeeProfile?.name ? employeeProfile.name.substring(0, 2).toUpperCase() : 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold leading-none truncate">{employeeProfile?.name || 'Administrador'}</p>
              <p className="text-[10px] text-on-surface-variant font-medium capitalize mt-0.5">
                {employeeProfile?.role === 'super_admin' ? 'Super Admin' :
                 employeeProfile?.role === 'owner' ? 'Dueño' :
                 employeeProfile?.role === 'admin' ? 'Administrador' : 'Empleado'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all font-bold text-sm relative ${
                  isActive
                    ? (item.id === 'pos' ? 'bg-[#e3001b] text-white shadow-lg shadow-red-500/20' : 'bg-primary text-white shadow-lg shadow-primary/20')
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                {item.label}
                {item.id === 'orders' && newOrdersCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-error text-white'}`}>
                    {newOrdersCount}
                  </span>
                )}
                {item.id === 'inventory' && lowStockCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'}`}>
                    {lowStockCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-outline-variant/10 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-on-surface-variant font-bold text-sm hover:bg-surface-container-low transition-all"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">storefront</span>
            Ir a la Tienda
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-error font-bold text-sm hover:bg-red-50 transition-all"
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">logout</span>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 lg:ml-[260px] min-w-0 overflow-x-hidden flex flex-col">

        {/* ── MOBILE TOP HEADER (hidden on desktop) ── */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-outline-variant/10 flex items-center justify-between px-4 h-14 shrink-0">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-surface-container-low transition-all"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true" translate="no">menu</span>
          </button>
          <span className="text-base font-black text-[#e3001b] tracking-wider">La Martina</span>
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-xl flex items-center justify-center relative hover:bg-surface-container-low transition-all">
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">notifications</span>
              {newOrdersCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-error rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {newOrdersCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── DESKTOP HEADER ── */}
        <header className="hidden lg:flex justify-between items-center mb-10 gap-4 min-w-0 p-8 pb-0">
          <h1 className="text-[28px] font-black text-on-background tracking-tight capitalize shrink-0">
            {pageTitle}
          </h1>

          {!isMobile && (
            <div id="admin-header-portal" className="flex-grow flex items-center justify-start px-4"></div>
          )}

          <div className="flex items-center gap-4 min-w-0 shrink">
            {/* Search */}
            <div className="relative" ref={searchRef}>
              <input
                type="text"
                placeholder="Buscar pedidos, productos..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
                onFocus={() => setIsSearchOpen(true)}
                className="bg-surface-container-low border-none rounded-2xl px-6 py-3 pl-12 w-[220px] lg:w-[280px] text-sm outline-none focus:ring-2 ring-primary/20 transition-all"
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" translate="no">search</span>

              {isSearchOpen && q.length >= 2 && (
                <div className="absolute top-full mt-2 left-0 w-full bg-white rounded-2xl shadow-2xl border border-outline-variant/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {hasResults ? (
                    <>
                      {matchedProducts.length > 0 && (
                        <div>
                          <p className="px-4 pt-4 pb-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Productos</p>
                          {matchedProducts.map(p => (
                            <button
                              key={p.id}
                              onClick={() => { navigate('/admin/inventory'); setSearchQuery(''); setIsSearchOpen(false); }}
                              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface-container-lowest transition-colors text-left"
                            >
                              <img src={p.image} alt="" className="w-8 h-8 object-contain rounded-lg bg-surface-container-low p-0.5" />
                              <div>
                                <p className="text-sm font-bold line-clamp-1">{p.name}</p>
                                <p className="text-[11px] text-on-surface-variant">${formatCurrency(p.price)}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {matchedOrders.length > 0 && (
                        <div className="border-t border-outline-variant/10">
                          <p className="px-4 pt-4 pb-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Pedidos</p>
                          {matchedOrders.map(o => (
                            <button
                              key={o.id}
                              onClick={() => { navigate('/admin/orders'); setSearchQuery(''); setIsSearchOpen(false); }}
                              className="flex items-center justify-between w-full px-4 py-3 hover:bg-surface-container-lowest transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-on-surface-variant text-[20px]" aria-hidden="true" translate="no">receipt_long</span>
                                <div className="text-left">
                                  <p className="text-sm font-bold">#{o.id}</p>
                                  <p className="text-[11px] text-on-surface-variant">{o.customer}</p>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-primary">${formatCurrency(o.total)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-sm text-on-surface-variant">No se encontraron resultados para "{q}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <button className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-outline-variant/10 shadow-sm relative">
              <span className="material-symbols-outlined" aria-hidden="true" translate="no">notifications</span>
              {newOrdersCount > 0 && (
                <span className="absolute top-2 right-2 w-5 h-5 bg-error rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {newOrdersCount}
                </span>
              )}
            </button>

            {/* Profile */}
            <div className="flex items-center gap-3 ml-4 bg-white p-1.5 pr-4 rounded-2xl border border-outline-variant/10 shadow-sm">
              <div className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center font-bold text-sm">
                {employeeProfile?.name ? employeeProfile.name.substring(0, 2).toUpperCase() : 'A'}
              </div>
              <div>
                <p className="text-xs font-bold leading-none">{employeeProfile?.name || 'Administrador'}</p>
                <p className="text-[10px] text-on-surface-variant font-medium capitalize">
                  {employeeProfile?.role === 'super_admin' ? 'Super Admin' :
                   employeeProfile?.role === 'owner' ? 'Dueño' :
                   employeeProfile?.role === 'admin' ? 'Administrador' : 'Empleado'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <div className="flex-1 p-4 md:p-6 lg:p-8 lg:pt-8 pb-24 lg:pb-8">
          {isMobile && (
            <div id="admin-header-portal" className="w-full lg:hidden mb-4 min-h-0"></div>
          )}
          <Outlet />
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-outline-variant/10 flex items-center justify-around px-2 h-16 safe-area-pb">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const badgeCount = item.id === 'orders' ? newOrdersCount : item.id === 'inventory' ? lowStockCount : 0;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl transition-all relative ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <span className={`material-symbols-outlined text-[24px] transition-all ${isActive ? 'text-primary' : ''}`} aria-hidden="true" translate="no">
                {item.icon}
              </span>
              <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-primary' : 'text-on-surface-variant/70'}`}>
                {item.label}
              </span>
              {badgeCount > 0 && (
                <span className="absolute top-1 right-3 w-4 h-4 bg-error rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
        {/* "Más" button if there are more than 4 nav items */}
        {visibleNavItems.length > 4 && (
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl text-on-surface-variant transition-all"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true" translate="no">more_horiz</span>
            <span className="text-[10px] font-bold leading-none text-on-surface-variant/70">Más</span>
          </button>
        )}
      </nav>
    </div>
  );
};
