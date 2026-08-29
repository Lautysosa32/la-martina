import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { categories } from '../data/mockData';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenZones?: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({ isOpen, onClose, onOpenZones }) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 transition-opacity backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'flex flex-col w-[85%] sm:w-80 max-w-sm z-50 bg-white shadow-2xl fixed left-0 top-0 bottom-0 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer Header */}
        <div className="bg-primary text-white p-4 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px]">grid_view</span>
            <span className="font-bold text-base tracking-tight">Categorías & Menú</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 className="text-[11px] font-black text-on-surface-variant/70 uppercase tracking-wider px-3 mb-2">
              Categorías
            </h2>
            <ul className="space-y-1">
              {categories.map((cat) => (
                <li key={cat.id}>
                  <NavLink
                    to={`/category/${cat.id}`}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'cursor-pointer group flex items-center justify-between w-full px-3 py-2.5 transition-all duration-200 rounded-xl font-medium text-sm',
                        isActive
                          ? 'text-primary font-bold bg-primary/10'
                          : 'text-on-surface hover:bg-surface-container-high'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'material-symbols-outlined text-[20px] shrink-0',
                              isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary transition-colors'
                            )}
                          >
                            {getIconForCategory(cat.id)}
                          </span>
                          <span className="truncate">{cat.title}</span>
                        </div>
                        <span
                          className={cn(
                            'material-symbols-outlined text-[18px] transition-colors shrink-0',
                            isActive ? 'text-primary' : 'text-on-surface-variant/40 group-hover:text-primary'
                          )}
                        >
                          chevron_right
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-outline-variant/15 pt-3">
            <h3 className="text-[11px] font-black text-on-surface-variant/70 uppercase tracking-wider px-3 mb-2">
              Accesos Rápidos
            </h3>
            <ul className="space-y-1">
              {onOpenZones && (
                <li>
                  <button
                    type="button"
                    onClick={() => { onOpenZones(); onClose(); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-xs font-semibold text-on-surface hover:bg-surface-container-high text-left cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px] text-primary shrink-0">
                      share_location
                    </span>
                    <span className="truncate">Zonas de Cobertura de Envíos</span>
                  </button>
                </li>
              )}
              {[
                { label: 'Calculadora en el Local', icon: 'calculate', path: '/calculadora-compras' },
                { label: 'Métodos de Entrega', icon: 'local_shipping', path: '/delivery' },
                { label: 'Sobre Nosotros', icon: 'storefront', path: '/about' },
                { label: 'Preguntas Frecuentes', icon: 'help', path: '/faq' },
              ].map((item, idx) => (
                <li key={idx}>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-xs font-semibold',
                        isActive
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-on-surface hover:bg-surface-container-high'
                      )
                    }
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Drawer Footer */}
        <div className="p-3 border-t border-outline-variant/15 bg-surface-container-low/50 text-xs text-on-surface-variant/70 text-center">
          <p className="font-semibold text-on-surface">La Martina Supermercado</p>
          <p className="text-[10px] mt-0.5">Calidad y frescura garantizada</p>
        </div>
      </aside>
    </>
  );
};

function getIconForCategory(id: string) {
  switch (id) {
    case 'almacen': return 'inventory_2';
    case 'bebidas': return 'local_drink';
    case 'carnes': return 'restaurant';
    case 'lacteos': return 'egg_alt';
    case 'limpieza': return 'cleaning_services';
    case 'perfumeria': return 'medication';
    default: return 'category';
  }
}

