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
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
        <div className="mb-10">
          <h1 className="text-[25px] font-bold text-on-background mb-2">Mis Favoritos</h1>
          <p className="text-on-surface-variant text-base">Tus productos guardados de primera calidad.</p>
        </div>
        <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/30">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4">lock</span>
          <p className="text-on-surface-variant text-lg">Iniciá sesión para ver tus favoritos</p>
          <p className="text-on-surface-variant/60 text-sm mt-2 mb-8">Unite a La Martina Club gratis para guardar tus productos preferidos.</p>
          <Link 
            to="/profile" 
            className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-primary/90 transition-all inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
            Iniciar Sesión / Registrarse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
      <div className="mb-10">
        <h1 className="text-[25px] font-bold text-on-background mb-2">Mis Favoritos</h1>
        <p className="text-on-surface-variant text-base">Tus productos guardados de primera calidad.</p>
      </div>

      {favorites.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
          {favorites.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/30">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4">favorite</span>
          <p className="text-on-surface-variant text-lg">Todavía no tenés productos favoritos.</p>
          <p className="text-on-surface-variant/60 text-sm mt-2 mb-8">¡Explorá nuestra tienda y guardá lo que más te guste!</p>
          <Link 
            to="/" 
            className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-primary/90 transition-all inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">store</span>
            Volver a la tienda
          </Link>
        </div>
      )}
    </div>
  );
};
