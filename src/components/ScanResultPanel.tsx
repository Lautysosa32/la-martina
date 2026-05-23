import React, { useState, useEffect } from 'react';
import { PermissionGuard } from './auth/PermissionGuard';
import { Product } from '../types/product.types';

interface ScanResultPanelProps {
  open: boolean;
  onClose: () => void;
  scannedCode: string;
  product: Product | null;
  isSearching: boolean;
  onEditProduct: (product: Product) => void;
  onUpdateStock: (productId: string, newStock: number) => Promise<boolean>;
  onCreateProduct: (barcode: string, prefilledProduct?: Product) => void;
  onScanAgain: () => void;
}

export const ScanResultPanel: React.FC<ScanResultPanelProps> = ({
  open,
  onClose,
  scannedCode,
  product,
  isSearching,
  onEditProduct,
  onUpdateStock,
  onCreateProduct,
  onScanAgain,
}) => {
  const [stockInput, setStockInput] = useState<number>(0);
  const [isUpdatingStock, setIsUpdatingStock] = useState<boolean>(false);
  const [stockSuccess, setStockSuccess] = useState<boolean>(false);

  const isExternal = !!(product && !product.id);

  // Sync stock input when product changes
  useEffect(() => {
    if (product) {
      setStockInput(product.stock);
      setStockSuccess(false);
    }
  }, [product]);

  if (!open) return null;

  const handleStockAdjust = (amount: number) => {
    setStockInput((prev) => Math.max(0, prev + amount));
    setStockSuccess(false);
  };

  const handleSaveStock = async () => {
    if (!product) return;
    setIsUpdatingStock(true);
    const success = await onUpdateStock(product.id, stockInput);
    setIsUpdatingStock(false);
    if (success) {
      setStockSuccess(true);
      setTimeout(() => setStockSuccess(false), 2000);
    }
  };

  // Stock status helper
  const getStockBadge = (stock: number, minStock: number) => {
    if (stock <= 0) {
      return (
        <span className="text-[10px] font-bold text-error bg-error/10 px-3 py-1 rounded-full uppercase tracking-wider">
          Sin Stock
        </span>
      );
    }
    if (stock <= minStock) {
      return (
        <span className="text-[10px] font-bold text-warning bg-warning/10 px-3 py-1 rounded-full uppercase tracking-wider">
          Stock Bajo ({stock})
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase tracking-wider">
        Suficiente ({stock})
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] border border-outline-variant/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              barcode_scanner
            </span>
            <div>
              <h3 className="font-bold text-on-surface text-base">Resultado del escaneo</h3>
              <p className="text-[10px] text-on-surface-variant font-mono font-bold tracking-wider uppercase">
                Cód: {scannedCode}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high active:bg-surface-container-highest transition-colors cursor-pointer text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 flex flex-col justify-center">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <span className="material-symbols-outlined text-primary text-[42px] animate-spin">
                sync
              </span>
              <p className="text-sm font-semibold text-on-surface">Buscando producto...</p>
              <p className="text-xs text-on-surface-variant">
                Consultando bases de datos locales y globales.
              </p>
            </div>
          ) : product ? (
            // PRODUCT FOUND
            <div className="flex flex-col gap-6">
              {/* Product Info Card */}
              <div className="flex items-center gap-4 bg-surface-container-lowest p-4 rounded-3xl border border-outline-variant/10">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-20 h-20 rounded-2xl object-cover border border-outline-variant/5 bg-white shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-surface-container-low flex items-center justify-center border border-outline-variant/5 text-on-surface-variant/40 shrink-0">
                    <span className="material-symbols-outlined text-[36px]">image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-primary uppercase font-bold tracking-wider block mb-0.5">
                    {product.brand || 'Sin Marca'}
                  </span>
                  <h4 className="font-bold text-on-surface text-base truncate leading-tight mb-1">
                    {product.name}
                  </h4>
                  <div className="flex items-center gap-2 mb-2">
                    {isExternal ? (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
                        No encontrado
                      </span>
                    ) : (
                      getStockBadge(product.stock, product.minStock)
                    )}
                  </div>
                  {!isExternal && (
                    <p className="font-black text-on-surface text-lg">
                      ${product.price.toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
              </div>

              {/* Informative block for external product */}
              {isExternal && (
                <div className="flex gap-2 items-start bg-primary/5 p-3.5 rounded-2xl border border-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[18px] mt-0.5">info</span>
                  <p className="text-[11px] leading-normal font-medium text-left">
                    Este producto fue encontrado en la base de datos global pero no está registrado en tu tienda. Haz clic en <strong>Registrar y crear producto</strong> para darlo de alta en tu inventario.
                  </p>
                </div>
              )}

              {/* Quick Actions according to permissions */}
              <div className="flex flex-col gap-4">
                {/* Stock Modifier - Only if it's local (not external) */}
                {!isExternal && (
                  <PermissionGuard permission="products.change_stock">
                    <div className="bg-surface-container-low p-4 rounded-3xl border border-outline-variant/10">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-3 text-center">
                        Modificación rápida de stock
                      </span>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => handleStockAdjust(-5)}
                          className="w-10 h-10 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 flex items-center justify-center text-on-surface font-bold text-sm transition-all cursor-pointer select-none"
                        >
                          -5
                        </button>
                        <button
                          onClick={() => handleStockAdjust(-1)}
                          className="w-10 h-10 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 flex items-center justify-center text-on-surface font-bold text-lg transition-all cursor-pointer select-none"
                        >
                          -1
                        </button>
                        
                        <input
                          type="number"
                          value={stockInput}
                          onChange={(e) => setStockInput(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 h-10 bg-white border border-outline-variant/20 rounded-2xl text-center font-bold text-base outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <button
                          onClick={() => handleStockAdjust(1)}
                          className="w-10 h-10 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 flex items-center justify-center text-on-surface font-bold text-lg transition-all cursor-pointer select-none"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleStockAdjust(5)}
                          className="w-10 h-10 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 flex items-center justify-center text-on-surface font-bold text-sm transition-all cursor-pointer select-none"
                        >
                          +5
                        </button>
                      </div>

                      <div className="mt-4 flex justify-center">
                        <button
                          onClick={handleSaveStock}
                          disabled={isUpdatingStock || product.stock === stockInput}
                          className={`w-full max-w-[200px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-bold text-xs transition-all shadow-sm cursor-pointer select-none ${
                            stockSuccess
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : product.stock === stockInput
                              ? 'bg-surface-container-highest text-on-surface-variant/40 border border-outline-variant/10 cursor-not-allowed'
                              : 'bg-primary text-white hover:bg-primary-hover active:scale-95'
                          }`}
                        >
                          {isUpdatingStock ? (
                            <span className="material-symbols-outlined text-[16px] animate-spin">
                              sync
                            </span>
                          ) : stockSuccess ? (
                            <span className="material-symbols-outlined text-[16px]">check</span>
                          ) : (
                            <span className="material-symbols-outlined text-[16px]">save</span>
                          )}
                          {stockSuccess ? '¡Guardado!' : 'Guardar stock'}
                        </button>
                      </div>
                    </div>
                  </PermissionGuard>
                )}

                {/* Edit Button or Create Button */}
                {isExternal ? (
                  <PermissionGuard permission="products.create">
                    <button
                      onClick={() => {
                        onCreateProduct(scannedCode, product);
                        onClose();
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3.5 px-4 rounded-full text-xs hover:bg-primary-hover active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      Registrar y crear producto
                    </button>
                  </PermissionGuard>
                ) : (
                  <PermissionGuard permission="products.update">
                    <button
                      onClick={() => {
                        onEditProduct(product);
                        onClose();
                      }}
                      className="w-full flex items-center justify-center gap-2 border-2 border-primary/20 text-primary font-bold py-3 px-4 rounded-full text-xs hover:bg-primary/5 active:scale-98 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Editar datos del producto
                    </button>
                  </PermissionGuard>
                )}
              </div>
            </div>
          ) : (
            // PRODUCT NOT FOUND
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-[54px]">
                inventory_2
              </span>
              <div>
                <h4 className="font-bold text-on-surface text-base mb-1">Producto no registrado</h4>
                <p className="text-xs text-on-surface-variant max-w-xs leading-relaxed">
                  No encontramos ningún producto local o externo con el código{' '}
                  <span className="font-mono font-bold">{scannedCode}</span>.
                </p>
              </div>

              {/* Create product according to permissions */}
              <PermissionGuard permission="products.create">
                <button
                  onClick={() => {
                    onCreateProduct(scannedCode);
                    onClose();
                  }}
                  className="mt-2 w-full max-w-[260px] flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-5 rounded-full text-xs hover:bg-primary-hover active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Crear nuevo producto
                </button>
              </PermissionGuard>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/10 flex gap-3">
          <button
            onClick={onScanAgain}
            className="flex-1 flex items-center justify-center gap-2 bg-surface-container-highest hover:bg-surface-container-high active:scale-95 text-on-surface font-bold py-3 px-4 rounded-full text-xs transition-all border border-outline-variant/10 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
            Escanear otro
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 border border-outline-variant/20 hover:bg-surface-container-high active:scale-95 text-on-surface-variant font-bold py-3 px-4 rounded-full text-xs transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
