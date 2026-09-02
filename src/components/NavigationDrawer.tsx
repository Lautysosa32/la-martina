import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { categories as mockCategories } from '../data/mockData';
import { useAdmin } from '../context/AdminContext';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenZones?: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({ isOpen, onClose, onOpenZones }) => {
  const { adminCategories, adminSubcategories } = useAdmin();
  const categoriesList = adminCategories.length > 0 ? adminCategories : mockCategories;
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);

  const toggleExpand = (catId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCatId(prev => prev === catId ? null : catId);
  };

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
              {categoriesList.map((cat) => {
                const catSubs = adminSubcategories.filter(s => s.categoryId === cat.id);
                const hasSubs = catSubs.length > 0;
                const isExpanded = expandedCatId === cat.id;

                return (
                  <li key={cat.id} className="rounded-xl overflow-hidden transition-all">
                    <div className="flex items-center justify-between group rounded-xl hover:bg-surface-container-high transition-colors">
                      <NavLink
                        to={`/category/${cat.id}`}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'cursor-pointer flex-1 flex items-center gap-3 px-3 py-2.5 transition-all duration-200 font-medium text-sm',
                            isActive
                              ? 'text-primary font-bold bg-primary/10 rounded-xl'
                              : 'text-on-surface'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'material-symbols-outlined text-[20px] shrink-0',
                                isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary transition-colors'
                              )}
                            >
                              {getIconForCategory(cat.id)}
                            </span>
                            <span className="truncate">{cat.title}</span>
                          </>
                        )}
                      </NavLink>

                      {hasSubs && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(cat.id, e)}
                          className="p-2.5 text-on-surface-variant/70 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors cursor-pointer"
                          aria-label={isExpanded ? 'Contraer subcategorías' : 'Expandir subcategorías'}
                        >
                          <span
                            className={cn(
                              'material-symbols-outlined text-[18px] transition-transform duration-200 block',
                              isExpanded ? 'rotate-180 text-primary' : ''
                            )}
                          >
                            expand_more
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Acordeón de Subcategorías */}
                    {hasSubs && isExpanded && (
                      <ul className="pl-9 pr-2 py-1 space-y-1 bg-surface-container-lowest/70 rounded-b-xl border-l-2 border-primary/20 ml-4 my-1 animate-in fade-in slide-in-from-top-1 duration-200">
                        <li>
                          <NavLink
                            to={`/category/${cat.id}`}
                            onClick={onClose}
                            className="block px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/5 transition-colors"
                          >
                            Ver todo en {cat.title}
                          </NavLink>
                        </li>
                        {catSubs.map(sub => (
                          <li key={sub.id}>
                            <NavLink
                              to={`/category/${cat.id}/${sub.id}`}
                              onClick={onClose}
                              className={({ isActive }) =>
                                cn(
                                  'block px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                                  isActive
                                    ? 'bg-primary/10 text-primary font-bold'
                                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                )
                              }
                            >
                              {sub.title}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
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

