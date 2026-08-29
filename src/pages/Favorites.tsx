import React from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { ProductCard } from '../components/ProductCard';
import { Link } from 'react-router-dom';
import { useAuth } from '../stores/useAuthStore';

export const Favorites: React.FC = () => {
  const { favorites } = useFavorites();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-on-background tracking-tight mb-1">Mis Favoritos</h1>
          <p className="text-on-surface-variant text-sm">Tus productos guardados de primera calidad.</p>
        </div>
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-outline-variant/30 max-w-xl mx-auto p-8 shadow-xs">
          <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">lock</span>
          </div>
          <p className="text-on-surface font-bold text-lg">Iniciá sesión para ver tus favoritos</p>
          <p className="text-on-surface-variant text-xs mt-1 mb-6">Unite a La Martina Club gratis para guardar y acceder a tus productos preferidos desde cualquier dispositivo.</p>
          <Link 
            to="/profile" 
            className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-primary/90 transition-all inline-flex items-center gap-2 text-xs sm:text-sm shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
            Iniciar Sesión / Registrarse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-outline-variant/15 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-on-background tracking-tight mb-1">Mis Favoritos</h1>
          <p className="text-on-surface-variant text-sm">Tus productos guardados de primera calidad.</p>
        </div>
        <span className="text-xs font-bold text-on-surface-variant/80 bg-surface-container-high px-3 py-1.5 rounded-full w-fit">
          {favorites.length} {favorites.length === 1 ? 'guardado' : 'guardados'}
        </span>
      </div>

      {favorites.length > 0 ? (
        <div className="product-grid">
          {favorites.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-outline-variant/30 max-w-xl mx-auto p-8 shadow-xs">
          <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">favorite</span>
          </div>
          <p className="text-on-surface font-bold text-lg">Todavía no tenés productos favoritos.</p>
          <p className="text-on-surface-variant text-xs mt-1 mb-6">¡Hacé clic en el corazón de cualquier producto para guardarlo acá!</p>
          <Link 
            to="/" 
            className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-primary/90 transition-all inline-flex items-center gap-2 text-xs sm:text-sm shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">storefront</span>
            Explorar Catálogo
          </Link>
        </div>
      )}
    </div>
  );
};

