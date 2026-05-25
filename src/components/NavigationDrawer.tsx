import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { categories } from '../data/mockData';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-inverse-surface/50 z-40 transition-opacity"
          style={{ top: '8%', height: '92%' }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <nav
        className={cn(
          'flex flex-col w-[80%] sm:w-80 z-50 bg-white shadow-2xl fixed left-0 transition-transform duration-300 ease-in-out overflow-hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ top: '8%', height: '92%' }}
      >
        {/* Top Section: Categories */}
        <div className="flex flex-col overflow-hidden" style={{ height: '70%', paddingTop: '4%' }}>
          <div className="px-[6%] pb-[2%] shrink-0" style={{ height: '12%', display: 'flex', alignItems: 'center' }}>
            <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider px-2">
              Categorías
            </h2>
          </div>
          <ul className="flex flex-col justify-around px-[3%] overflow-hidden" style={{ height: '88%' }}>
            {categories.map((cat) => (
              <li key={cat.id} style={{ height: '14%' }} className="flex items-center">
                <NavLink
                  to={`/category/${cat.id}`}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'cursor-pointer group flex items-center justify-between w-full h-full px-[5%] transition-all duration-200 rounded-lg',
                      isActive
                        ? 'text-primary font-bold bg-primary-container/10 hover:bg-surface-container-high'
                        : 'text-on-surface hover:bg-surface-container-high'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-4 w-full">
                        <span
                          className={cn(
                            'material-symbols-outlined shrink-0',
                            isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary transition-colors'
                          )}
                          data-icon={getIconForCategory(cat.id)}
                        >
                          {getIconForCategory(cat.id)}
                        </span>
                        <span className="font-body-md text-sm sm:text-base truncate">{cat.title}</span>
                      </div>
                      <span
                        className={cn(
                          'material-symbols-outlined transition-colors shrink-0',
                          isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'
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

        {/* Bottom Section: Información (Anclado al fondo relativo) */}
        <div
          className="border-t border-outline-variant/10 bg-surface-container-lowest flex flex-col justify-between overflow-hidden"
          style={{ height: '30%', padding: '5%', paddingBottom: '8%' }}
        >
          <div className="px-2" style={{ height: '22%', display: 'flex', alignItems: 'center' }}>
            <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              Información
            </h3>
          </div>
          <ul className="flex flex-col justify-around" style={{ height: '78%' }}>
            {[
              { label: 'Más información', icon: 'info', path: '/about' },
              { label: 'Preguntas Frecuentes', icon: 'help', path: '/faq' },
            ].map((item, idx) => (
              <li key={idx} style={{ height: '42%' }} className="flex items-center">
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-4 w-full h-full px-[5%] rounded-lg transition-all text-xs font-semibold',
                      isActive
                        ? 'bg-primary/10 text-primary font-bold'
                        : 'text-on-surface hover:bg-surface-container-high'
                    )
                  }
                >
                  <span className="material-symbols-outlined text-on-surface-variant shrink-0">
                    {item.icon}
                  </span>
                  <span className="font-body-md text-xs sm:text-sm font-semibold truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
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
