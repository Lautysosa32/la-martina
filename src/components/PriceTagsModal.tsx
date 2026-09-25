import React, { useState, useEffect } from 'react';
import { Product } from '../types/product.types';
import { PriceTagConfig, defaultPriceTagConfig, printPriceTags, generateBarcodeSvg, formatTagPrice } from '../utils/priceTagUtils';
import { fetchSetting } from '../services/admin.service';

interface PriceTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onOpenSettings?: () => void;
}

export const PriceTagsModal: React.FC<PriceTagsModalProps> = ({
  isOpen,
  onClose,
  products,
  onOpenSettings
}) => {
  const [config, setConfig] = useState<PriceTagConfig>(defaultPriceTagConfig);
  const [copiesMap, setCopiesMap] = useState<Record<string, number>>({});
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Cargar configuración guardada de etiquetas
      fetchSetting<PriceTagConfig>('price_tags_config', defaultPriceTagConfig)
        .then(savedCfg => {
          if (savedCfg) setConfig(savedCfg);
        })
        .catch(err => console.error('Error cargando price_tags_config:', err));

      // Iniciar con 1 copia para cada producto
      const initialCopies: Record<string, number> = {};
      products.forEach(p => {
        initialCopies[p.id] = 1;
      });
      setCopiesMap(initialCopies);
    }
  }, [isOpen, products]);

  if (!isOpen || products.length === 0) return null;

  const totalTickets = products.reduce((acc, p) => acc + (copiesMap[p.id] || 1), 0);

  const handleCopyChange = (id: string, delta: number) => {
    setCopiesMap(prev => {
      const current = prev[id] || 1;
      const next = Math.max(1, Math.min(99, current + delta));
      return { ...prev, [id]: next };
    });
  };

  const handlePrint = () => {
    setIsPrinting(true);
    try {
      printPriceTags(products, config, copiesMap);
    } finally {
      setTimeout(() => setIsPrinting(false), 800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-outline-variant/15 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[24px]">label</span>
            </div>
            <div>
              <h3 className="font-black text-lg text-neutral-900 leading-tight">
                Imprimir Etiquetas de Precios y Góndola
              </h3>
              <p className="text-xs text-neutral-500 font-medium">
                {products.length} productos seleccionados &bull; {totalTickets} etiquetas a imprimir
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/20 hover:bg-neutral-100 font-bold text-xs text-neutral-700 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Configuración de medidas y formato"
              >
                <span className="material-symbols-outlined text-[16px]">settings</span>
                <span className="hidden sm:inline">Ajustes</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-neutral-100 flex items-center justify-center text-neutral-500 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        {/* Content Body: Quick settings + Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-neutral-50/50">
          
          {/* Left / Top Controls Panel */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Formato de Papel Rápido */}
            <div className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-xs space-y-3">
              <label className="text-[11px] font-black uppercase text-neutral-400 tracking-wider block">
                Formato de Papel / Impresora
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, paperFormat: '80mm', widthMm: 72 }))}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    config.paperFormat === '80mm'
                      ? 'border-primary bg-primary/10 text-primary shadow-xs'
                      : 'border-outline-variant/20 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto mb-0.5">receipt</span>
                  Rollo 80mm
                </button>

                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, paperFormat: '58mm', widthMm: 48 }))}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    config.paperFormat === '58mm'
                      ? 'border-primary bg-primary/10 text-primary shadow-xs'
                      : 'border-outline-variant/20 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto mb-0.5">receipt_long</span>
                  Rollo 58mm
                </button>

                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, paperFormat: 'a4_grid' }))}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    config.paperFormat === 'a4_grid'
                      ? 'border-primary bg-primary/10 text-primary shadow-xs'
                      : 'border-outline-variant/20 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto mb-0.5">grid_view</span>
                  Hoja A4
                </button>
              </div>

              {/* Opciones visuales rápidas */}
              <div className="pt-2 border-t border-neutral-100 space-y-2 text-xs">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="font-semibold text-neutral-700">Líneas de corte con tijera</span>
                  <input
                    type="checkbox"
                    checked={config.showCuttingLine}
                    onChange={e => setConfig(prev => ({ ...prev, showCuttingLine: e.target.checked }))}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="font-semibold text-neutral-700">Código de barras 1D</span>
                  <input
                    type="checkbox"
                    checked={config.showBarcode}
                    onChange={e => setConfig(prev => ({ ...prev, showBarcode: e.target.checked }))}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <span className="font-semibold text-neutral-700">Marca en negrita arriba</span>
                  <input
                    type="checkbox"
                    checked={config.showBrand}
                    onChange={e => setConfig(prev => ({ ...prev, showBrand: e.target.checked }))}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Lista de productos seleccionados y copias */}
            <div className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[11px] font-black uppercase text-neutral-400 tracking-wider">
                  Cantidades por Producto
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const allOne: Record<string, number> = {};
                    products.forEach(p => { allOne[p.id] = 1; });
                    setCopiesMap(allOne);
                  }}
                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Restablecer a 1
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {products.map(p => {
                  const copies = copiesMap[p.id] || 1;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200/60 text-xs">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-neutral-900 truncate">
                          {p.brand ? `${p.brand.toUpperCase()} - ` : ''}{p.name}
                        </p>
                        <p className="text-[11px] text-neutral-500 font-semibold">
                          {formatTagPrice(p.price)} &bull; {p.barcode ? `CB: ${p.barcode}` : 'Sin código'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyChange(p.id, -1)}
                          className="w-7 h-7 rounded-lg bg-white border border-neutral-300 font-bold hover:bg-neutral-100 flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black text-xs text-neutral-800">
                          {copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyChange(p.id, 1)}
                          className="w-7 h-7 rounded-lg bg-white border border-neutral-300 font-bold hover:bg-neutral-100 flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right / Live Visual Preview */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-white p-4 rounded-2xl border border-outline-variant/10 shadow-xs flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
                <span className="text-[11px] font-black uppercase text-neutral-400 tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-primary">visibility</span>
                  Vista Previa Real ({config.paperFormat === 'a4_grid' ? 'Hoja A4' : `Rollo ${config.paperFormat}`})
                </span>
                <span className="text-[10px] text-neutral-400 font-semibold">
                  Se imprimirá en escala 1:1
                </span>
              </div>

              {/* Contenedor simulador de papel */}
              <div className="flex-1 overflow-y-auto bg-neutral-200/70 p-4 rounded-xl flex justify-center max-h-[500px]">
                <div
                  className={`bg-white shadow-md p-4 transition-all duration-300 ${
                    config.paperFormat === '58mm'
                      ? 'w-[220px]'
                      : config.paperFormat === '80mm'
                        ? 'w-[310px]'
                        : 'w-full max-w-[500px]'
                  }`}
                  style={{ minHeight: '300px' }}
                >
                  <div
                    className={
                      config.paperFormat === 'a4_grid'
                        ? 'grid grid-cols-2 gap-3'
                        : 'flex flex-col gap-1'
                    }
                  >
                    {products.map(product => {
                      const copies = copiesMap[product.id] || 1;
                      const barcode = (product.barcode || product.id || '').trim();
                      const barcodeSvg = config.showBarcode && barcode
                        ? generateBarcodeSvg(barcode, {
                            height: 30,
                            width: config.paperFormat === '58mm' ? 1.2 : 1.5,
                            displayValue: config.showBarcodeText,
                            fontSize: 10,
                          })
                        : '';

                      const brand = (product.brand || '').trim();
                      const name = (product.name || '').trim();
                      const format = (product.format || '').trim();
                      const priceFormatted = formatTagPrice(product.price);

                      return Array.from({ length: copies }).map((_, copyIndex) => (
                        <div key={`${product.id}-${copyIndex}`} className="w-full">
                          {/* Caja del Ticket idéntica a la imagen */}
                          <div className="border-[1.5px] border-black rounded-sm p-2 bg-white text-center flex flex-col justify-between select-none">
                            {/* Marca / Nombre / Formato */}
                            <div className="relative mb-1">
                              {config.showFormat && format && (
                                <span className="absolute right-0 top-0 text-[8.5px] font-black text-neutral-700 uppercase tracking-tighter">
                                  {format}
                                </span>
                              )}

                              {config.showBrand && brand ? (
                                <>
                                  <div className="text-[12px] font-black text-black uppercase tracking-wide leading-tight px-3 break-words">
                                    {brand}
                                  </div>
                                  {config.showName && name && name.toLowerCase() !== brand.toLowerCase() && (
                                    <div className="text-[10px] font-bold text-neutral-800 uppercase leading-tight mt-0.5 break-words">
                                      {name}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-[12px] font-black text-black uppercase leading-tight px-3 break-words">
                                  {name || brand}
                                </div>
                              )}
                            </div>

                            {/* Precio Gigante */}
                            <div className="my-1">
                              <span className="text-2xl font-black text-black tracking-tight font-sans">
                                {priceFormatted}
                              </span>
                            </div>

                            {/* Código de Barras */}
                            <div className="flex flex-col items-center justify-center mt-1">
                              {barcodeSvg ? (
                                <div
                                  className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
                                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                                />
                              ) : (
                                <span className="text-[9px] font-mono text-neutral-400">
                                  {barcode || 'SIN CÓDIGO'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Línea de corte con tijera */}
                          {config.showCuttingLine && (
                            <div className="flex items-center justify-center my-2 text-neutral-400 select-none">
                              <div className="flex-1 border-t border-dashed border-neutral-400"></div>
                              <span className="px-2 text-xs leading-none">✂</span>
                              <div className="flex-1 border-t border-dashed border-neutral-400"></div>
                            </div>
                          )}
                        </div>
                      ));
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/20 hover:bg-neutral-100 font-bold text-xs text-neutral-700 transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting || totalTickets === 0}
            className="px-8 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-sm shadow-lg shadow-primary/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isPrinting ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">print</span>
            )}
            <span>{isPrinting ? 'Enviando a impresora...' : `Imprimir ${totalTickets} ${totalTickets === 1 ? 'Etiqueta' : 'Etiquetas'}`}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
