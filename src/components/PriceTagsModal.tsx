import React, { useState, useEffect } from 'react';
import { Product } from '../types/product.types';
import { PriceTagConfig, defaultPriceTagConfig, printPriceTags, generateBarcodeSvg, formatTagPrice, getFontSizeStyles } from '../utils/priceTagUtils';
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
      // Cargar configuración guardada de etiquetas desde Supabase
      fetchSetting<PriceTagConfig>('price_tags_config', defaultPriceTagConfig)
        .then(savedCfg => {
          if (savedCfg) setConfig(savedCfg);
        })
        .catch(err => console.error('Error cargando price_tags_config:', err));

      // Iniciar con 1 copia para cada producto seleccionado
      const initialCopies: Record<string, number> = {};
      products.forEach(p => {
        initialCopies[p.id] = 1;
      });
      setCopiesMap(initialCopies);
    }
  }, [isOpen, products]);

  if (!isOpen || products.length === 0) return null;

  const totalTickets = products.reduce((acc, p) => acc + (copiesMap[p.id] || 1), 0);
  const fStyles = getFontSizeStyles(config.fontSize);

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
                className="px-3.5 py-2 rounded-xl border border-outline-variant/20 hover:bg-neutral-100 font-bold text-xs text-neutral-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Ir a Configuración de Inventario para ajustar medidas y formato"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">settings</span>
                <span>Ajustes</span>
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-neutral-50/50">
          
          {/* Left Panel: Selected Products List & Quantities */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Lista de productos seleccionados y copias */}
            <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <div>
                  <h4 className="text-xs font-black uppercase text-neutral-800 tracking-wider">
                    Cantidades por Producto
                  </h4>
                  <p className="text-[11px] text-neutral-400 font-medium">
                    Ajustá cuántas copias imprimir de cada uno
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const allOne: Record<string, number> = {};
                    products.forEach(p => { allOne[p.id] = 1; });
                    setCopiesMap(allOne);
                  }}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Todas en 1
                </button>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {products.map(p => {
                  const copies = copiesMap[p.id] || 1;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200/60 text-xs hover:border-primary/20 transition-all">
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-bold text-neutral-900 truncate">
                          {p.brand ? <span className="text-primary font-black">{p.brand.toUpperCase()} - </span> : ''}
                          {p.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500 font-semibold">
                          <span className="text-neutral-900 font-black">{formatTagPrice(p.price)}</span>
                          {p.format && <span>&bull; {p.format}</span>}
                          {p.barcode && <span className="font-mono text-neutral-400">#{p.barcode}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 rounded-xl border border-neutral-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleCopyChange(p.id, -1)}
                          className="w-7 h-7 rounded-lg bg-neutral-50 hover:bg-neutral-200/80 font-bold flex items-center justify-center cursor-pointer transition-all active:scale-95"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black text-xs text-neutral-900">
                          {copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyChange(p.id, 1)}
                          className="w-7 h-7 rounded-lg bg-neutral-50 hover:bg-neutral-200/80 font-bold flex items-center justify-center cursor-pointer transition-all active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Info de Configuración Activa */}
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/15 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-[22px]">info</span>
              <div className="text-xs">
                <p className="font-bold text-neutral-800">
                  Formato activo: <span className="text-primary font-black uppercase">{config.paperFormat === 'a4_grid' ? 'Hoja A4 (Cuadrícula)' : `Rollo ${config.paperFormat}`}</span>
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Las medidas, escala de letra y código de barras se configuran desde el botón <strong className="text-neutral-700">Ajustes</strong>.
                </p>
              </div>
            </div>

          </div>

          {/* Right Panel: Live Visual Preview */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-outline-variant/10 shadow-xs flex-1 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
                <span className="text-[11px] font-black uppercase text-neutral-500 tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
                  Vista Previa ({config.paperFormat === 'a4_grid' ? 'Hoja A4' : `Rollo ${config.paperFormat}`})
                </span>
                <span className="text-[10px] text-neutral-400 font-semibold">
                  Escala tipográfica: {config.fontSize === 'compact' ? 'Compacta' : config.fontSize === 'large' ? 'Grande' : 'Estándar'}
                </span>
              </div>

              {/* Contenedor simulador de papel */}
              <div className="flex-1 overflow-y-auto bg-neutral-200/70 p-4 rounded-xl max-h-[500px]">
                <div className="flex justify-center min-h-full items-start pb-6">
                  <div
                    className={`bg-white shadow-md p-4 h-fit rounded-xs transition-all duration-300 ${
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
                            height: fStyles.barcodeHeight,
                            width: config.paperFormat === '58mm' ? 1.2 : fStyles.barcodeWidth,
                            displayValue: config.showBarcodeText,
                            fontSize: fStyles.barcodeFontSize,
                          })
                        : '';

                      const brand = (product.brand || '').trim();
                      const name = (product.name || '').trim();
                      const format = (product.format || '').trim();
                      const priceFormatted = formatTagPrice(product.price);

                      return Array.from({ length: copies }).map((_, copyIndex) => (
                        <div key={`${product.id}-${copyIndex}`} className="w-full">
                          {/* Caja del Ticket */}
                          <div
                            className="border-[1.5px] border-black rounded-xs bg-white text-center flex flex-col justify-between select-none"
                            style={{ padding: fStyles.boxPadding, minHeight: config.heightMm ? `${config.heightMm}mm` : fStyles.minHeight }}
                          >
                            {/* Marca / Nombre / Formato */}
                            <div className="relative mb-1">
                              {config.showFormat && format && (
                                <span
                                  className="absolute right-0 top-0 font-black text-neutral-700 uppercase tracking-tighter"
                                  style={{ fontSize: fStyles.formatSize }}
                                >
                                  {format}
                                </span>
                              )}

                              {config.showBrand && brand ? (
                                <>
                                  <div
                                    className={`font-black text-black uppercase tracking-wide px-3 break-words ${fStyles.brandClass}`}
                                    style={{ fontSize: fStyles.brandSize }}
                                  >
                                    {brand}
                                  </div>
                                  {config.showName && name && name.toLowerCase() !== brand.toLowerCase() && (
                                    <div
                                      className={`font-bold text-neutral-800 uppercase mt-0.5 break-words ${fStyles.nameClass}`}
                                      style={{ fontSize: fStyles.nameSize }}
                                    >
                                      {name}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div
                                  className={`font-black text-black uppercase px-3 break-words ${fStyles.brandClass}`}
                                  style={{ fontSize: fStyles.brandSize }}
                                >
                                  {name || brand}
                                </div>
                              )}
                            </div>

                            {/* Precio Gigante */}
                            <div className="my-1">
                              <span
                                className={`font-black text-black font-sans ${fStyles.priceClass}`}
                                style={{ fontSize: fStyles.priceSize }}
                              >
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
                              {config.showDate && (
                                <span className="text-[7.5px] text-neutral-500 font-semibold mt-1">
                                  Act. {new Date().toLocaleDateString('es-AR')}
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
