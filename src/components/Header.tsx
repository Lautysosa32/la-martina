import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NavigationDrawer } from './NavigationDrawer';
import { useCart } from '../context/CartContext';
import { useAdmin } from '../context/AdminContext';

export const Header: React.FC = () => {
  const { adminProducts } = useAdmin();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { totalItems } = useCart();

  const filteredProducts = searchQuery.trim() === ''
    ? []
    : adminProducts.filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.categoryId && product.categoryId.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 5);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim() !== '') {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleResultClick = (productName: string) => {
    navigate(`/search?q=${encodeURIComponent(productName)}`);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  return (
    <>
      <header className="bg-primary text-white font-headline-md text-headline-md docked full-width top-0 shadow-md flex items-center justify-between pl-2 pr-margin-mobile h-16 w-full fixed z-50">
        <div className="flex items-center gap-2 sm:gap-2 shrink-0">
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="hover:opacity-90 transition-opacity flex items-center justify-center text-white"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <Link to="/" className="text-base sm:text-lg font-bold text-white hover:opacity-90 whitespace-nowrap tracking-tight">
            La Martina
          </Link>
        </div>

        {/* Barra de Búsqueda (Diseño Píldora) */}
        <div className="flex-1 max-w-lg mx-2 sm:mx-4 relative" ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="¡Hola! ¿Qué estás buscando?"
              className="w-full h-10 bg-white text-[#1c1b1b] placeholder-gray-500 border-none rounded-full pl-4 pr-10 outline-none text-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            />
            <button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-primary hover:opacity-80 transition-opacity">
              <span className="material-symbols-outlined font-bold text-[22px]">search</span>
            </button>
          </form>

          {/* Resultados de Búsqueda Dropdown */}
          {isSearchOpen && searchQuery.trim() !== '' && (
            <div className="absolute top-12 left-1/2 -translate-x-10/19 sm:left-0 sm:translate-x-0 w-[calc(100vw-24px)] sm:w-full bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              {filteredProducts.length > 0 ? (
                <div className="flex flex-col">
                  <div className="px-4 py-3 bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                    Sugerencias de productos
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleResultClick(product.name)}
                        className="flex items-center gap-3 p-3 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/5 last:border-none group"
                      >
                        <div className="w-12 h-12 bg-white rounded-xl p-1 shrink-0 border border-outline-variant/10 group-hover:border-primary/20 transition-colors">
                          <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-on-surface font-bold text-[13px] sm:text-sm line-clamp-1 leading-tight">{product.name}</p>
                          <p className="text-on-surface-variant text-[10px] sm:text-[11px] truncate mt-0.5">{product.brand}</p>
                        </div>
                        <div className="text-primary font-bold text-[15px] sm:text-sm shrink-0 whitespace-nowrap pl-20">
                          ${(product.price ?? 0).toLocaleString('es-AR')}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleSearchSubmit}
                    className="p-4 text-center text-primary text-sm font-bold hover:bg-primary/5 transition-colors border-t border-outline-variant/10 w-full flex items-center justify-center gap-2"
                  >
                    Ver todos los resultados
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-2">search_off</span>
                  <p className="text-on-surface-variant text-sm">No encontramos resultados para "{searchQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <Link to="/favorites" className="hover:opacity-90 transition-opacity flex items-center justify-center text-white relative">
            <span className="material-symbols-outlined">favorite</span>
          </Link>
          <Link to="/profile" className="hover:opacity-90 transition-opacity flex items-center justify-center text-white">
            <span className="material-symbols-outlined">person</span>
          </Link>
          <Link to="/cart" className="hover:opacity-90 transition-opacity flex items-center justify-center relative text-white">
            <span className="material-symbols-outlined">shopping_cart</span>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </header>

      <NavigationDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
};

