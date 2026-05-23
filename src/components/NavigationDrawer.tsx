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
          className="fixed inset-0 bg-inverse-surface/50 z-40 transition-opacity top-16"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <nav
        className={cn(
          'flex flex-col h-full py-unit-2 overflow-y-auto w-80 z-50 bg-white shadow-2xl fixed left-0 top-16 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ height: 'calc(100vh - 64px)' }}
      >
        <div className="px-margin-mobile pt-4">
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold py-unit-2">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider px-2">
              Categorías
            </span>
          </h2>
        </div>

        <ul className="flex-1 overflow-y-auto px-unit-2 pb-margin-mobile space-y-1">
          {categories.map((cat) => (
            <li key={cat.id}>
              <NavLink
                to={`/category/${cat.id}`}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'cursor-pointer group flex items-center justify-between p-4 transition-all duration-200 rounded-lg',
                    isActive
                      ? 'text-primary font-bold bg-primary-container/10 hover:bg-surface-container-high'
                      : 'text-on-surface hover:bg-surface-container-high'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-4">
                      <span
                        className={cn(
                          'material-symbols-outlined',
                          isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary transition-colors'
                        )}
                        data-icon={getIconForCategory(cat.id)}
                      >
                        {getIconForCategory(cat.id)}
                      </span>
                      <span className="font-body-md text-body-md">{cat.title}</span>
                    </div>
                    <span
                      className={cn(
                        'material-symbols-outlined transition-colors',
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

          <li className="pt-40 px-5">
            <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider px-2 py-2">
              Información
            </h3>
          </li>
          {[
            { label: 'Más información', icon: 'info', path: '/about' },
            { label: 'Preguntas Frecuentes', icon: 'help', path: '/faq' },
          ].map((item, idx) => (
            <li key={idx}>
              <NavLink
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-4 p-4 rounded-lg transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-on-surface hover:bg-surface-container-high'
                  )
                }
              >
                <span className="material-symbols-outlined text-on-surface-variant">
                  {item.icon}
                </span>
                <span className="font-body-md">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>


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
