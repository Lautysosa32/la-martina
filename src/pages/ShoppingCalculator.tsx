import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

interface CalculatorItem {
  id: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  isManual?: boolean;
}

export const ShoppingCalculator: React.FC = () => {
  const { adminProducts, formatCurrency } = useAdmin();
  const [isCalculatorActive, setIsCalculatorActive] = useState(false);
  const [items, setItems] = useState<CalculatorItem[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  
  // Manual product addition form state
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItemsCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleBarcodeDetected = (code: string) => {
    // Search in DB by barcode or ID
    const product = adminProducts.find(
      p => (p.barcode && p.barcode.trim() === code.trim()) || p.id === code
    );

    if (product) {
      setItems(prev => {
        const existing = prev.find(item => item.id === product.id);
        if (existing) {
          return prev.map(item =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        } else {
          return [...prev, {
            id: product.id,
            name: product.name,
            image: product.image,
            price: product.price,
            quantity: 1
          }];
        }
      });
      setScannerOpen(false);
      setScanError(null);
    } else {
      // Trigger a brief scan error feedback, but don't crash
      setScanError(`Código "${code}" no encontrado en góndola. Podés agregarlo manualmente.`);
    }
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(manualPrice);
    if (!manualName.trim() || isNaN(price) || price <= 0) return;

    const newItem: CalculatorItem = {
      id: `manual-${Date.now()}`,
      name: manualName.trim(),
      image: '',
      price: price,
      quantity: 1,
      isManual: true
    };

    setItems(prev => [...prev, newItem]);
    setManualName('');
    setManualPrice('');
    setShowManualForm(false);
  };

  const updateQuantity = (id: string, amount: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const nextQty = Math.max(1, item.quantity + amount);
          return { ...item, quantity: nextQty };
        }
        return item;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const clearList = () => {
    if (window.confirm('¿Querés vaciar tu calculadora de compras?')) {
      setItems([]);
    }
  };

  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-3 flex flex-col min-h-[calc(100vh-140px)]">
      
      {/* 1. ONBOARDING VIEW */}
      {!isCalculatorActive ? (
        <div className="flex-grow flex flex-col items-center justify-center max-w-lg mx-auto w-full text-center animate-in fade-in duration-500">
          {/* Header row with back Link */}
          <div className="w-full flex items-center justify-between mb-8">
            <Link to="/" className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <h2 className="font-bold text-on-surface-variant text-sm uppercase tracking-wider">La Martina</h2>
            <div className="w-10"></div> {/* Spacer */}
          </div>

          {/* Calculator Hero Icon */}
          <div className="relative w-40 h-40 flex items-center justify-center mb-8">
            {/* Soft decorative pulsing circles */}
            <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse"></div>
            <div className="absolute inset-4 rounded-full bg-primary/10"></div>
            <div className="relative w-28 h-28 bg-white border border-primary/20 rounded-[2rem] shadow-lg flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[64px] font-light">calculate</span>
            </div>
            {/* Corner floating scanning element */}
            <div className="absolute -bottom-2 -right-2 bg-secondary-container text-on-secondary-container p-2.5 rounded-2xl shadow border border-outline-variant/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] font-bold">barcode_scanner</span>
            </div>
          </div>

          {/* Texts */}
          <h1 className="font-display-xl text-[30px] font-black tracking-tight text-on-surface mb-3 leading-tight">
            ¡Calculá tu compra!
          </h1>
          <p className="font-body-lg text-on-surface-variant mb-6 text-sm sm:text-base leading-relaxed px-4">
            Escaneá los productos con la cámara de tu celular a medida que los vas sumando al carrito en el local.
            Conocé el total aproximado de tu gasto antes de pasar por la caja.
          </p>

          {/* Attention Banner */}
          <div className="w-full bg-white p-4.5 rounded-2xl shadow-sm border-l-4 border-primary border-t border-r border-b border-outline-variant/10 text-left mb-8 flex gap-3.5 items-start">
            <span className="material-symbols-outlined text-primary text-[22px] mt-0.5 shrink-0">info</span>
            <div>
              <p className="text-xs font-bold text-on-surface uppercase tracking-wider mb-1">Aviso Importante</p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Esta calculadora es de carácter informativo para control de gastos dentro del local. Los precios y disponibilidad final pueden variar según la sucursal o promociones del día de facturación.
              </p>
            </div>
          </div>

          {/* Bottom CTA Button */}
          <button
            onClick={() => setIsCalculatorActive(true)}
            className="w-full bg-primary text-white font-label-sm py-4 rounded-full hover:bg-primary/95 transition-all shadow-lg shadow-primary/10 active:scale-[0.99] cursor-pointer mt-auto flex items-center justify-center gap-2"
          >
            <span>Comenzar</span>
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          </button>
        </div>
      ) : (
        
        // 2. ACTIVE CALCULATOR VIEW
        <div className="flex-grow flex flex-col w-full animate-in fade-in slide-in-from-bottom duration-500">
          
          {/* Header Row */}
          <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCalculatorActive(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white shadow-sm border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              </button>
              <div>
                <h1 className="font-bold text-on-surface text-base">Calculadora</h1>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                  {totalItemsCount} {totalItemsCount === 1 ? 'producto' : 'productos'} en total
                </p>
              </div>
            </div>

            {items.length > 0 && (
              <button
                onClick={clearList}
                className="text-error text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                Vaciar
              </button>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-grow flex flex-col">
            
            {scanError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{scanError}</span>
                </div>
                <button onClick={() => setScanError(null)} className="material-symbols-outlined text-[14px]">close</button>
              </div>
            )}

            {items.length === 0 ? (
              // Empty State
              <div className="flex-grow flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center mb-6 text-on-surface-variant/40">
                  <span className="material-symbols-outlined text-4xl">barcode_reader</span>
                </div>
                <h3 className="font-bold text-on-surface text-base mb-1">Tu lista está vacía</h3>
                <p className="text-xs text-on-surface-variant max-w-xs mb-8">
                  Escaneá los productos que agregues a tu carro físico para llevar la cuenta.
                </p>
                
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={() => { setScanError(null); setScannerOpen(true); }}
                    className="w-full bg-primary text-white font-bold py-3.5 rounded-full flex items-center justify-center gap-2 shadow hover:bg-primary/95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                    <span>Escanear Producto</span>
                  </button>
                  <button
                    onClick={() => setShowManualForm(true)}
                    className="w-full bg-white text-on-surface border border-outline-variant/30 font-bold py-3 rounded-full flex items-center justify-center gap-2 hover:bg-surface-container-low transition-all cursor-pointer text-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    <span>Agregar por precio</span>
                  </button>
                </div>
              </div>
            ) : (
              // Scanned Items List
              <div className="flex-grow flex flex-col">
                <div className="space-y-3 flex-grow overflow-y-auto max-h-[50vh] pr-1">
                  {items.map(item => (
                    <div key={item.id} className="bg-white p-3 rounded-xl border border-outline-variant/10 shadow-sm flex items-center gap-3">
                      {/* Image container */}
                      <div className="w-12 h-12 bg-surface-container-lowest border border-outline-variant/10 rounded-lg flex-shrink-0 flex items-center justify-center p-1">
                        {item.isManual || !item.image ? (
                          <span className="material-symbols-outlined text-on-surface-variant/40 text-[20px]">shopping_bag</span>
                        ) : (
                          <img src={item.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                        )}
                      </div>
                      
                      {/* Name & price detail */}
                      <div className="flex-grow min-w-0">
                        <h4 className="text-xs font-bold text-on-surface truncate leading-tight">{item.name}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs font-bold text-primary">${formatCurrency(item.price)}</span>
                          <span className="text-[10px] text-on-surface-variant/60 font-semibold uppercase">c/u</span>
                        </div>
                      </div>

                      {/* Quantity adjustments */}
                      <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/30 rounded-full px-2 py-0.5 flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-5 h-5 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                        <span className="text-xs font-bold text-on-surface w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-5 h-5 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                        </button>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-on-surface-variant/40 hover:text-error transition-colors p-1 flex-shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Sticky Action and Total Summary Bar */}
                <div className="bg-white p-4.5 rounded-2xl border border-outline-variant/20 shadow-md mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block">Total Estimado</span>
                      <span className="text-2xl font-black text-primary">${formatCurrency(totalPrice)}</span>
                    </div>
                    
                    {/* Secondary Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowManualForm(true)}
                        className="w-10 h-10 bg-surface-container-low border border-outline-variant/20 text-on-surface-variant rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors cursor-pointer"
                        title="Agregar producto manualmente"
                      >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                      </button>

                      <button
                        onClick={() => { setScanError(null); setScannerOpen(true); }}
                        className="bg-primary text-white font-bold px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-primary/95 shadow-md shadow-primary/10 transition-all cursor-pointer text-xs"
                      >
                        <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                        <span>Escanear más</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Addition Form Modal */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
              <h3 className="font-bold text-on-surface text-base">Agregar Producto</h3>
              <button
                onClick={() => setShowManualForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleAddManualItem} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block mb-1">Nombre o Descripción</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pan, Leche Entera, etc."
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  className="w-full bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block mb-1">Precio Unitario ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ej: 1450"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value)}
                  className="w-full bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="flex-1 bg-surface-container-low text-on-surface-variant font-bold py-3 rounded-full hover:bg-surface-container-high text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-full hover:bg-primary/95 text-xs shadow transition-colors cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal Integration */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </div>
  );
};
