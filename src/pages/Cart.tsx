import React from 'react';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';

export const Cart: React.FC = () => {
  const { items, updateQuantity, removeItem, totalPrice, totalItems, originalPriceSum, discountApplied, getStock, stockWarnings } = useCart();
  const deliveryMethod = localStorage.getItem('la-martina-delivery-method') || 'envio';
  const isPickup = deliveryMethod === 'retiro';
  const shippingCost = isPickup ? 0 : (totalItems > 0 ? 1500 : 0);
  const finalTotal = totalPrice + shippingCost;

  const hasStockIssues = stockWarnings.length > 0;

  if (items.length === 0) {
    return (
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-20 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-on-surface-variant text-5xl">shopping_cart_off</span>
        </div>
        <h1 className="font-display-xl font-bold text-on-surface mb-2">Tu carrito está vacío</h1>
        <p className="text-on-surface-variant mb-8 max-w-sm">¡Parece que aún no has agregado nada! Explorá nuestras categorías y encontrá lo que necesitás.</p>
        <Link to="/" className="bg-primary text-white font-label-sm px-8 py-3 rounded-full hover:bg-primary/90 transition-colors">
          Ir a comprar
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 flex flex-col md:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex-1 w-full">
        <div className="mb-10">
          <h1 className="text-[25px] font-bold text-on-background mb-2">Mi Carrito</h1>
          <p className="text-on-surface-variant text-base">Productos seleccionados con calidad garantizada.</p>
        </div>

        {/* Stock warning banner */}
        {hasStockIssues && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px] mt-0.5">warning</span>
            <div>
              <p className="text-sm font-bold text-amber-800">Algunos productos exceden el stock disponible</p>
              {stockWarnings.map(w => (
                <p key={w.productId} className="text-xs text-amber-700 mt-1">
                  • {w.name}: pediste {w.requested}, solo {w.available === 0 ? 'no hay stock' : `quedan ${w.available}`}
                </p>
              ))}
              <p className="text-xs text-amber-600 mt-2 font-medium">Ajustá las cantidades para poder continuar.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {items.map(item => {
            const stock = getStock(item.id);
            const isOverStock = item.quantity > stock;
            const canAddMore = item.quantity < stock;

            return (
              <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm flex gap-4 items-center border ${isOverStock ? 'border-red-300 bg-red-50/30' : 'border-outline-variant/10'}`}>
                <div className="w-20 h-20 bg-[#fcf9f8] flex-shrink-0 rounded-lg overflow-hidden p-2">
                  <img src={item.image} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant/60">{item.brand}</span>
                  <h3 className="font-body-md text-on-surface font-semibold line-clamp-2 md:line-clamp-1 flex flex-col gap-0.5">
                    <span>{item.name}</span>
                    {item.offerLabel && (
                      <span className="text-[10px] text-error font-extrabold flex items-center gap-0.5 bg-error/5 self-start px-2 py-0.5 rounded-full mt-1 w-fit">
                        <span className="material-symbols-outlined text-[12px]">local_offer</span>
                        {item.offerLabel}
                      </span>
                    )}
                  </h3>
                  <div className="font-price-display mt-2 flex items-center gap-2">
                    {item.finalPrice && item.finalPrice < item.price ? (
                      <>
                        <span className="text-xs text-on-surface-variant/50 line-through">${item.price.toLocaleString('es-AR')}</span>
                        <span className="text-primary font-bold">${item.finalPrice.toLocaleString('es-AR')}</span>
                      </>
                    ) : (
                      <span className="text-primary font-bold">${item.price.toLocaleString('es-AR')}</span>
                    )}
                  </div>
                  {/* Stock info per line */}
                  <div className="mt-1">
                    {isOverStock ? (
                      <span className="text-[10px] font-bold text-red-600">
                        ⚠ Solo {stock === 0 ? 'sin stock' : `${stock} disponible${stock > 1 ? 's' : ''}`}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-green-600">
                        {stock <= 5 ? `${stock} disponible${stock > 1 ? 's' : ''}` : '+5 disponibles'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                  <div className="flex items-center gap-3 border border-outline-variant/30 rounded-full px-2 py-1 bg-[#fcf9f8]">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="text-on-surface-variant w-6 h-6 flex items-center justify-center hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>
                    <span className={`font-body-md font-bold w-4 text-center ${isOverStock ? 'text-red-600' : ''}`}>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={!canAddMore}
                      className={`w-6 h-6 flex items-center justify-center transition-colors ${canAddMore ? 'text-on-surface-variant hover:text-primary' : 'text-gray-300 cursor-not-allowed'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full md:w-[380px] bg-white p-6 rounded-xl shadow-md border border-outline-variant/10 h-fit sticky top-24">
        <h2 className="text-[25px] font-bold text-on-background mb-6">Resumen de Compra</h2>

        <div className="mb-6">
          <label className="font-label-sm text-on-surface-variant block mb-2">Código de Descuento</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ingresá tu código"
              className="flex-1 bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-lg px-3 py-2 font-body-md text-on-surface outline-none"
            />
            <button className="bg-secondary-container text-on-secondary-container px-4 rounded-lg font-label-sm font-bold hover:opacity-80 transition-colors">
              Aplicar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 font-body-md border-b border-outline-variant/30 pb-4 mb-4">
          <div className="flex justify-between text-on-surface-variant">
            <span>Subtotal ({totalItems} {totalItems === 1 ? 'artículo' : 'artículos'})</span>
            <span>$ {originalPriceSum.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between text-on-surface-variant">
            <span>{isPickup ? 'Retiro en sucursal' : 'Costo de Envío'}</span>
            <span>{isPickup ? <span className="text-green-600 font-bold">Gratis</span> : `$ ${shippingCost.toLocaleString('es-AR')}`}</span>
          </div>
          {discountApplied > 0 && (
            <div className="flex justify-between text-error font-bold">
              <span>Descuento aplicado</span>
              <span>-$ {discountApplied.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mb-8">
          <span className="font-headline-md font-bold text-on-surface">Total</span>
          <span className="font-display-xl text-[28px] text-primary">$ {finalTotal.toLocaleString('es-AR')}</span>
        </div>

        {hasStockIssues ? (
          <div className="w-full bg-gray-300 text-gray-500 font-label-sm py-4 rounded-full flex justify-center items-center gap-2 cursor-not-allowed">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <span className="text-[16px]">Ajustá las cantidades</span>
          </div>
        ) : (
          <Link 
            to="/checkout"
            className="w-full bg-primary text-white font-label-sm py-4 rounded-full flex justify-center items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg"
          >
            <span className="text-[16px]">Finalizar Compra</span>
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        )}
      </div>
    </div>
  );
};
