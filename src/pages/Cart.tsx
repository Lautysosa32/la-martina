import React from 'react';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import { WeightInputModal } from '../components/WeightInputModal';

export const Cart: React.FC = () => {
  const { items, updateQuantity, removeItem, totalPrice, totalItems, originalPriceSum, discountApplied, getStock, stockWarnings } = useCart();
  const [activeWeightItem, setActiveWeightItem] = React.useState<any>(null);
  const deliveryMethod = localStorage.getItem('la-martina-delivery-method') || 'envio';
  const isPickup = deliveryMethod === 'retiro';
  const shippingCost = isPickup ? 0 : (totalItems > 0 ? 1500 : 0);
  const finalTotal = totalPrice + shippingCost;

  const hasStockIssues = stockWarnings.length > 0;

  if (items.length === 0) {
    return (
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-20 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-on-surface-variant text-5xl" aria-hidden="true" translate="no">shopping_cart_off</span>
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
    <>
      {/* Layout principal */}
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 pb-28 md:pb-8 flex flex-col md:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex-1 w-full">
        <div className="mb-8">
          <h1 className="text-[25px] font-bold text-on-background mb-2">Mi Carrito</h1>
          <p className="text-on-surface-variant text-base">Productos seleccionados con calidad garantizada.</p>
          <div className="mt-4">
            <Link to="/delivery" className="flex items-center space-x-3 bg-surface-container-lowest p-3.5 rounded-xl shadow-sm border border-outline-variant/20 hover:bg-surface-bright transition-colors">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-white shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true" translate="no">location_on</span>
              </div>
              <div className="flex-1 text-left">
                <p className="font-label-sm text-[13px] text-on-surface font-bold tracking-tight uppercase flex items-center">
                  ELEGÍ TU MÉTODO DE ENTREGA <span className="text-primary ml-1 material-symbols-outlined text-[16px]" aria-hidden="true" translate="no">chevron_right</span>
                </p>
                <p className="text-xs text-on-surface-variant mt-1 font-medium leading-none">
                  Método seleccionado: <span className="font-bold text-primary uppercase">{deliveryMethod === 'retiro' ? 'Retiro en sucursal' : 'Envío a domicilio'}</span>
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Stock warning banner */}
        {hasStockIssues && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px] mt-0.5" aria-hidden="true" translate="no">warning</span>
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
              <div key={item.id} className={`bg-white p-3 sm:p-4 rounded-xl shadow-sm flex gap-4 items-center border relative ${isOverStock ? 'border-red-300 bg-red-50/30' : 'border-outline-variant/10'}`}>
                {/* Trash button absolutely positioned at top right */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute top-3 right-3 text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]" aria-hidden="true" translate="no">delete</span>
                </button>

                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#fcf9f8] flex-shrink-0 rounded-lg overflow-hidden p-1.5 sm:p-2">
                  <img src={item.image} alt="" aria-hidden="true" className="w-full h-full object-contain mix-blend-multiply" />
                </div>

                <div className="flex-1 min-w-0 pr-6 sm:pr-8">
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold text-on-surface-variant/60">{item.brand}</span>
                  <h3 className="font-body-md text-on-surface font-semibold line-clamp-2 md:line-clamp-1 flex flex-col gap-0.5 text-sm sm:text-base">
                    <span>{item.name}</span>
                    {item.offerLabel && (
                      <span className="text-[9px] sm:text-[10px] text-error font-extrabold flex items-center gap-0.5 bg-error/5 self-start px-2 py-0.5 rounded-full mt-1 w-fit">
                        <span className="material-symbols-outlined text-[10px] sm:text-[12px]">local_offer</span>
                        {item.offerLabel}
                        {item.discountedQuantity && item.discountedQuantity < item.quantity && ` (Cupo: ${item.discountedQuantity} u)`}
                      </span>
                    )}
                  </h3>

                  {/* Stock info per line */}
                  <div className="mt-1">
                    {isOverStock ? (
                      <span className="text-[9px] sm:text-[10px] font-bold text-red-600">
                        ⚠ Solo {stock === 0 ? 'sin stock' : `${stock} disponible${stock > 1 ? 's' : ''}`}
                      </span>
                    ) : (
                      <span className="text-[9px] sm:text-[10px] font-bold text-green-600">
                        {stock <= 5 ? `${stock} disponible${stock > 1 ? 's' : ''}` : '+5 disponibles'}
                      </span>
                    )}
                  </div>

                  {/* Price and selector row */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/5 w-full">
                    <div className="font-price-display flex items-center gap-1.5">
                      {item.finalPrice && item.finalPrice < item.price ? (
                        <>
                          <span className="text-[11px] sm:text-xs text-on-surface-variant/50 line-through">${item.price.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                          <span className="text-primary font-bold text-sm sm:text-base">${item.finalPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                        </>
                      ) : (
                        <span className="text-primary font-bold text-sm sm:text-base">${item.price.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      )}
                    </div>

                    {/* Compact Quantity selector */}
                    <div className="flex items-center gap-2 border border-outline-variant/30 rounded-full p-0.5 bg-[#fcf9f8] shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="text-on-surface-variant w-6 h-6 flex items-center justify-center hover:text-primary transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px] sm:text-[16px]" aria-hidden="true" translate="no">remove</span>
                      </button>
                      
                      {item.saleType === 'weight' ? (
                        <button
                          onClick={() => setActiveWeightItem(item)}
                          className={`font-body-md text-xs font-bold min-w-[28px] sm:min-w-[32px] flex-shrink-0 text-center px-0.5 text-primary underline decoration-primary/30 hover:decoration-primary transition-colors cursor-pointer ${isOverStock ? 'text-red-600 decoration-red-300 hover:decoration-red-600' : ''}`}
                        >
                          {parseFloat(item.quantity.toFixed(2)).toString()}
                        </button>
                      ) : (
                        <input
                          type="number"
                          min="1"
                          max={stock > 0 ? stock : undefined}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1) {
                              updateQuantity(item.id, val);
                            }
                          }}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (isNaN(val) || val < 1) {
                              updateQuantity(item.id, 1);
                            }
                          }}
                          className={`font-body-md text-xs sm:text-sm font-bold w-8 sm:w-10 text-center bg-transparent border-b border-transparent focus:border-primary focus:bg-white rounded px-0.5 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isOverStock ? 'text-red-600' : 'text-on-surface'}`}
                        />
                      )}

                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={!canAddMore}
                        className={`w-6 h-6 flex items-center justify-center transition-colors shrink-0 ${canAddMore ? 'text-on-surface-variant hover:text-primary' : 'text-gray-300 cursor-not-allowed'}`}
                      >
                        <span className="material-symbols-outlined text-[14px] sm:text-[16px]" aria-hidden="true" translate="no">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel resumen lateral — solo visible en desktop */}
      <div className="hidden md:block w-full md:w-[380px] bg-white p-5 sm:p-6 rounded-xl shadow-md border border-outline-variant/10 h-fit sticky top-24">
        <h2 className="text-[22px] sm:text-[25px] font-bold text-on-background mb-6">Resumen de Compra</h2>

        <div className="mb-6">
          <label className="font-label-sm text-on-surface-variant block mb-2 text-xs sm:text-sm">Código de Descuento</label>
          <div className="flex gap-2 w-full min-w-0">
            <input
              type="text"
              placeholder="Ingresá tu código"
              className="flex-1 min-w-0 bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-lg px-3 py-2 font-body-md text-on-surface text-sm sm:text-base outline-none"
            />
            <button className="bg-secondary-container text-on-secondary-container px-4 rounded-lg font-label-sm font-bold hover:opacity-80 transition-colors shrink-0 text-sm sm:text-base">
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
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">warning</span>
            <span className="text-[16px]">Ajustá las cantidades</span>
          </div>
        ) : (
          <Link 
            to="/checkout"
            className="w-full bg-primary text-white font-label-sm py-4 rounded-full flex justify-center items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg"
          >
            <span className="text-[16px]">Finalizar Compra</span>
            <span className="material-symbols-outlined" aria-hidden="true" translate="no">arrow_forward</span>
          </Link>
        )}
      </div>

      <WeightInputModal
        isOpen={!!activeWeightItem}
        onClose={() => setActiveWeightItem(null)}
        initialValue={activeWeightItem?.quantity || 1}
        productName={activeWeightItem?.name || ''}
        pricePerKg={activeWeightItem?.price || 0}
        onConfirm={(val) => {
          if (activeWeightItem) {
            updateQuantity(activeWeightItem.id, val);
          }
          setActiveWeightItem(null);
        }}
      />
    </div>

    {/* Sticky bottom bar — solo visible en mobile */}
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-outline-variant/20 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 z-40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
            {totalItems} {totalItems === 1 ? 'artículo' : 'artículos'}
          </span>
          <span className="text-[22px] font-bold text-primary leading-tight">
            $ {finalTotal.toLocaleString('es-AR')}
          </span>
        </div>
        {hasStockIssues ? (
          <div className="flex-1 bg-gray-300 text-gray-500 font-label-sm py-3 rounded-full flex justify-center items-center gap-2 cursor-not-allowed">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true" translate="no">warning</span>
            <span className="text-sm">Ajustá cantidades</span>
          </div>
        ) : (
          <Link
            to="/checkout"
            className="flex-1 bg-primary text-white font-label-sm py-3 rounded-full flex justify-center items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg"
          >
            <span className="text-sm font-bold">Finalizar Compra</span>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">arrow_forward</span>
          </Link>
        )}
      </div>
    </div>
  </>
  );
};
