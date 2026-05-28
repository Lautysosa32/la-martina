import React from 'react';
import { Product } from '../data/mockData';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';

export const ProductCard: React.FC<{ product: Product, showQuantity?: boolean }> = ({ product, showQuantity = false }) => {
  const { items, addItem, updateQuantity, getStock } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const cartItem = items.find(item => item.id === product.id);
  const quantity = cartItem ? cartItem.quantity : 0;
  const isFav = isFavorite(product.id);
  const stock = getStock(product.id);
  const isOutOfStock = stock <= 0;
  const canAddMore = quantity < stock;

  const stockLabel = isOutOfStock
    ? 'Sin stock'
    : stock <= 5
      ? `${stock} ${stock === 1 ? ' disponible' : ' disponibles'}`
      : '+5 disponibles';

  const handleAdd = () => {
    if (isOutOfStock || !canAddMore) return;
    addItem(product);
  };

  return (
    <article className={`bg-white rounded-xl p-3 flex flex-col shadow-[0_4px_20px_0_rgba(26,26,26,0.03)] border border-outline-variant/10 hover:border-primary/20 transition-all h-full ${isOutOfStock ? 'opacity-60' : ''}`}>
      <div className="w-full aspect-square mb-3 bg-[#fcf9f8] rounded-lg p-2 flex items-center justify-center relative group overflow-hidden">

        {product.discount && (
          <div className="absolute top-2 left-2 bg-error text-on-error text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase z-10">
            {product.discount}
          </div>
        )}

        {!product.discount && product.badge && (
          <div className="absolute top-2 left-2 bg-secondary-container text-on-secondary-container text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider z-10">
            {product.badge}
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/60 rounded-lg flex items-center justify-center z-10">
            <span className="bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">Sin stock</span>
          </div>
        )}

        <img
          src={product.image}
          alt=""
          aria-hidden="true"
          className={`object-contain max-h-full max-w-full mix-blend-multiply group-hover:scale-105 transition-transform duration-300 ${isOutOfStock ? 'grayscale' : ''}`}
        />
        <button
          onClick={(e) => {
            e.preventDefault();
            if (!isAuthenticated) {
              navigate('/profile');
              return;
            }
            toggleFavorite(product);
          }}
          className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all z-20 ${isFav
            ? 'bg-error/10 text-error shadow-sm'
            : 'bg-white/40 backdrop-blur-[2px] text-error border border-error/20 hover:bg-white/60'
            }`}
        >
          <span
            className="material-symbols-outlined text-[18px] transition-all duration-300"
            style={{ fontVariationSettings: `'FILL' ${isFav ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
            aria-hidden="true"
            translate="no"
          >
            favorite
          </span>
        </button>
      </div>

      <span className="font-label-sm text-label-sm text-on-surface-variant mb-1 line-clamp-1">
        {product.brand}
      </span>
      <h3 className="font-body-md text-body-md text-on-surface font-semibold mb-1 line-clamp-2 flex-grow">
        {product.name}
      </h3>

      <div className="flex items-center justify-between mt-auto pt-2">
        <div className="flex flex-col">
          <div className="font-price-display text-[18px] text-on-surface font-bold">
            ${(product.price ?? 0).toLocaleString('es-AR')}
          </div>
          {product.originalPrice && (
            <div className="text-[12px] text-on-surface-variant line-through">
              ${product.originalPrice.toLocaleString('es-AR')}
            </div>
          )}
        </div>

        {isOutOfStock ? (
          <button
            disabled
            className="w-10 h-10 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center cursor-not-allowed shrink-0"
          >
            <span className="material-symbols-outlined" aria-hidden="true" translate="no">block</span>
          </button>
        ) : quantity > 0 || showQuantity ? (
          <div className="flex items-center justify-between bg-surface-container-high rounded-full p-1 min-w-[90px]">
            <button
              onClick={() => updateQuantity(product.id, quantity - 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">remove</span>
            </button>
            <span className="font-body-md text-sm font-bold w-6 text-center">{quantity || 1}</span>
            <button
              onClick={handleAdd}
              disabled={!canAddMore}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${canAddMore ? 'bg-primary-container text-on-primary-container hover:bg-primary' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">add</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center hover:bg-primary transition-colors shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined" aria-hidden="true" translate="no">add</span>
          </button>
        )}
      </div>

      {/* Stock indicator - Now at the very bottom in premium grey */}
      <div className="mt-2 pt-1.5 border-t border-outline-variant/5">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 block">
          {stockLabel}
        </span>
      </div>
    </article>
  );
};
