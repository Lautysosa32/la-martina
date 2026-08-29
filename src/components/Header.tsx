import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NavigationDrawer } from './NavigationDrawer';
import { DeliveryZonesModal } from './DeliveryZonesModal';
import { useCart } from '../context/CartContext';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../stores/useAuthStore';
import { useFavorites } from '../context/FavoritesContext';
import { categories } from '../data/mockData';
import logo from '../logo.png';

export const Header: React.FC = () => {
  const { adminProducts } = useAdmin();
  const { user, isAuthenticated } = useAuth();
  const { favorites } = useFavorites();
  const { totalItems, totalPrice } = useCart();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isZonesModalOpen, setIsZonesModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const isSearchActive = isSearchFocused || searchQuery.trim().length > 0;
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const deliveryMethod = (localStorage.getItem('la-martina-delivery-method') as 'retiro' | 'envio') || 'envio';
  const isPickup = deliveryMethod === 'retiro';

  const filteredProducts = searchQuery.trim() === ''
    ? []
    : adminProducts.filter(product =>
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.categoryId && product.categoryId.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 6);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setIsSearchFocused(false);
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
      setIsSearchFocused(false);
      inputRef.current?.blur();
      setSearchQuery('');
    }
  };

  const handleResultClick = (productName: string) => {
    navigate(`/search?q=${encodeURIComponent(productName)}`);
    setSearchQuery('');
    setIsSearchOpen(false);
    setIsSearchFocused(false);
    inputRef.current?.blur();
  };

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 transition-all duration-300 ease-in-out bg-primary shadow-md">
        
        {/* Barra superior de información (Solo Desktop) */}
        <div className="hidden lg:block bg-[#99000d] text-white/90 text-[11px] py-1 border-b border-white/10 font-medium">
          <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 xl:px-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-secondary-container">local_shipping</span>
                Envíos a domicilio en 24-48hs
              </span>
              <span className="opacity-40">•</span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-secondary-container">schedule</span>
                Lun a Sáb 9:00 - 15:00 y 17:30 - 21:30 | Dom 10:00 - 14:00
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://wa.me/5492617139129"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors text-secondary-container font-bold"
              >
                <span className="material-symbols-outlined text-[14px]">chat</span>
                Pedidos WhatsApp: 261 713-9129
              </a>
              <span className="opacity-40">•</span>
              <Link to="/about" className="hover:text-white transition-colors">Sobre Nosotros</Link>
              <span className="opacity-40">•</span>
              <Link to="/faq" className="hover:text-white transition-colors">Preguntas Frecuentes</Link>
            </div>
          </div>
        </div>

        {/* Barra Principal (Main Header) */}
        <div className="h-16 flex items-center justify-between px-3 sm:px-4 lg:px-8 xl:px-10 w-full max-w-7xl lg:max-w-[1920px] mx-auto">
          
          {/* Izquierda: Menú Hamburguesa + Logo + Selector de Entrega Desktop */}
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-5 shrink-0">
            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="hover:opacity-90 transition-opacity flex items-center justify-center text-white p-1 cursor-pointer"
              aria-label="Abrir menú de navegación"
            >
              <span className="material-symbols-outlined text-[26px]" aria-hidden="true" translate="no">menu</span>
            </button>

            <Link
              to="/"
              className={`transition-all duration-300 ease-in-out overflow-hidden flex items-center shrink-0 ${
                isSearchActive ? 'max-w-0 opacity-0 pointer-events-none ml-0 md:max-w-[160px] md:opacity-100' : 'max-w-[160px] opacity-100'
              } hover:opacity-90`}
            >
              <img src={logo} alt="La Martina" className="h-9 sm:h-10 w-auto object-contain" />
            </Link>

            {/* Píldora de Método de Entrega (Desktop) */}
            <Link
              to="/delivery"
              className="hidden lg:flex items-center gap-2 bg-black/15 hover:bg-black/25 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all border border-white/10 text-white shadow-xs ml-1 group"
              title="Cambiar método de entrega"
            >
              <span className="material-symbols-outlined text-[17px] text-secondary-container">
                {isPickup ? 'storefront' : 'location_on'}
              </span>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-[9px] text-white/70 font-normal">Entregar por:</span>
                <span className="font-bold text-[11px] truncate max-w-[130px]">
                  {isPickup ? 'Retiro en Sucursal' : 'Envío a Domicilio'}
                </span>
              </div>
              <span className="material-symbols-outlined text-[14px] opacity-70 group-hover:translate-y-0.5 transition-transform">
                expand_more
              </span>
            </Link>
          </div>

          {/* Centro: Buscador Inteligente */}
          <div className="flex-1 max-w-xl lg:max-w-2xl xl:max-w-3xl mx-2 sm:mx-6 lg:mx-8 relative" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => {
                  setIsSearchFocused(true);
                  setIsSearchOpen(true);
                }}
                placeholder="¿Qué estás buscando hoy? Ej: Leche, Carne, Bebidas..."
                className={`w-full h-10 bg-white text-[#1c1b1b] placeholder-gray-400 border-none rounded-full pl-4 ${
                  searchQuery.length > 0 ? 'pr-16' : 'pr-10'
                } outline-none text-xs sm:text-sm shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-all duration-300 focus:ring-2 focus:ring-secondary-container/80`}
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-9 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">close</span>
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-primary hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="material-symbols-outlined font-bold text-[22px]" aria-hidden="true" translate="no">search</span>
              </button>
            </form>

            {/* Resultados de Búsqueda Dropdown */}
            {isSearchOpen && searchQuery.trim() !== '' && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[calc(100vw-24px)] sm:w-full bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                {filteredProducts.length > 0 ? (
                  <div className="flex flex-col">
                    <div className="px-4 py-2.5 bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                      Sugerencias de productos
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {filteredProducts.map(product => (
                        <button
                          key={product.id}
                          onClick={() => handleResultClick(product.name)}
                          className="flex items-center gap-3 p-3 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/5 last:border-none group w-full cursor-pointer"
                        >
                          <div className="w-12 h-12 bg-white rounded-xl p-1 shrink-0 border border-outline-variant/10 group-hover:border-primary/20 transition-colors">
                            <img src={product.image} alt="" aria-hidden="true" className="w-full h-full object-contain" />
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <p className="text-on-surface font-bold text-[13px] sm:text-sm line-clamp-1 leading-tight">{product.name}</p>
                            <p className="text-on-surface-variant text-[10px] sm:text-[11px] truncate mt-0.5">{product.brand}</p>
                          </div>
                          <div className="text-primary font-bold text-[15px] sm:text-sm shrink-0 whitespace-nowrap pl-2">
                            ${(product.price ?? 0).toLocaleString('es-AR')}
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleSearchSubmit}
                      className="p-3.5 text-center text-primary text-xs sm:text-sm font-bold hover:bg-primary/5 transition-colors border-t border-outline-variant/10 w-full flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Ver todos los resultados para "{searchQuery}"
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">arrow_forward</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-2" aria-hidden="true" translate="no">search_off</span>
                    <p className="text-on-surface-variant text-sm font-medium">No encontramos resultados para "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Derecha: Acciones (Favoritos, Mi Cuenta, Carrito) */}
          <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 shrink-0">
            
            {/* Favoritos */}
            <Link
              to="/favorites"
              className={`hover:bg-white/10 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-2 text-white relative ${
                isSearchActive ? 'hidden md:flex' : 'flex'
              }`}
              title="Mis Favoritos"
            >
              <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">favorite</span>
                {favorites.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-secondary-container text-on-secondary-container text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-primary">
                    {favorites.length}
                  </span>
                )}
              </div>
              <span className="hidden xl:inline text-xs font-semibold">Favoritos</span>
            </Link>

            {/* Mi Cuenta */}
            <Link
              to="/profile"
              className={`hover:bg-white/10 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-2 text-white ${
                isSearchActive ? 'hidden md:flex' : 'flex'
              }`}
              title="Mi Cuenta"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">person</span>
              <div className="hidden xl:flex flex-col text-left leading-tight">
                <span className="text-[9px] text-white/70 font-normal">
                  {isAuthenticated ? 'Bienvenido' : 'Ingresar'}
                </span>
                <span className="text-xs font-semibold truncate max-w-[90px]">
                  {user?.name ? user.name.split(' ')[0] : 'Mi Cuenta'}
                </span>
              </div>
            </Link>

            {/* Carrito */}
            <Link
              to="/cart"
              className="bg-secondary-container text-on-secondary-container hover:brightness-95 transition-all px-3 py-1.5 rounded-full flex items-center gap-2 shadow-xs ml-1"
              title="Ver Carrito de Compras"
            >
              <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true" translate="no">shopping_cart</span>
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {totalItems}
                  </span>
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-none pr-0.5">
                <span className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Carrito</span>
                <span className="text-xs font-black">
                  ${totalPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Sub-barra de Categorías (Desktop lg:block) */}
        <nav className="hidden lg:block bg-white text-on-surface border-t border-b border-outline-variant/15 shadow-[0_2px_6px_rgba(0,0,0,0.03)]">
          <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-1 xl:gap-2">
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-primary hover:bg-primary/5 transition-colors font-bold mr-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">grid_view</span>
                <span>Todas las categorías</span>
              </button>

              <div className="h-4 w-px bg-outline-variant/30 mx-1" />

              {categories.map(cat => (
                <Link
                  key={cat.id}
                  to={`/category/${cat.id}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-on-surface/90 hover:text-primary hover:bg-surface-container-low transition-colors font-medium whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/70">
                    {getCategoryIcon(cat.id)}
                  </span>
                  <span>{cat.title}</span>
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsZonesModalOpen(true)}
                className="flex items-center gap-1 text-on-surface-variant hover:text-primary px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer"
                title="Ver radio de cobertura de delivery"
              >
                <span className="material-symbols-outlined text-[16px]">share_location</span>
                <span>Zonas de Envío</span>
              </button>
            </div>
          </div>
        </nav>
      </header>

      <NavigationDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        onOpenZones={() => {
          setIsDrawerOpen(false);
          setIsZonesModalOpen(true);
        }}
      />
      <DeliveryZonesModal isOpen={isZonesModalOpen} onClose={() => setIsZonesModalOpen(false)} />
    </>
  );
};

function getCategoryIcon(id: string) {
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


