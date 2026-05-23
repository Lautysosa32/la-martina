import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useShoppingCalculatorStore } from '../stores/useShoppingCalculatorStore';
import { useAdmin } from '../context/AdminContext';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';

export const ShoppingCalculator: React.FC = () => {
  const { formatCurrency } = useAdmin();
  
  // Zustand Store Integration
  const {
    items,
    subtotal,
    totalItems,
    scannerOpen,
    loading,
    error,
    generatedSession,
    setScannerOpen,
    clearError,
    addProductByBarcode,
    addManualProduct,
    incrementItem,
    decrementItem,
    removeItem,
    clearCalculator,
    finalizeCalculator,
    resetGeneratedSession
  } = useShoppingCalculatorStore();

  const [isCalculatorActive, setIsCalculatorActive] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  
  // User info modal to prompt name/phone before finalize
  const [showUserInfoForm, setShowUserInfoForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Copy success indicator
  const [copiedCode, setCopiedCode] = useState(false);

  const handleBarcodeDetected = async (code: string) => {
    await addProductByBarcode(code);
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(manualPrice);
    if (!manualName.trim() || isNaN(price) || price <= 0) return;

    addManualProduct(manualName.trim(), price);
    setManualName('');
    setManualPrice('');
    setShowManualForm(false);
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowUserInfoForm(false);
    
    const success = await finalizeCalculator(customerName.trim(), customerPhone.trim());
    if (success) {
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClear = () => {
    if (window.confirm('¿Querés vaciar tu calculadora de compras?')) {
      clearCalculator();
    }
  };

  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-4 flex flex-col min-h-[calc(100vh-140px)]">
      
      {/* ────────────────────────────────────────────────────────
          ESTADO 1: PRE-COMPRA GENERADA CON ÉXITO
          ──────────────────────────────────────────────────────── */}
      {generatedSession ? (
        <div className="flex-grow flex flex-col items-center justify-center max-w-xl mx-auto w-full text-center animate-in zoom-in-95 duration-500 py-6">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-md shadow-green-100 animate-bounce">
            <span className="material-symbols-outlined text-4xl font-bold">check</span>
          </div>

          <h1 className="font-display-xl text-[28px] font-black text-on-surface mb-2 tracking-tight">
            ¡Pre-compra registrada!
          </h1>
          <p className="text-on-surface-variant text-sm px-6 mb-8 font-medium">
            Presentá el siguiente código en la caja cuando vayas a abonar. La cajera cargará tu pedido al instante.
          </p>

          {/* CODE CARD */}
          <div className="w-full bg-surface-container-lowest border-2 border-primary/20 rounded-[2rem] p-6.5 shadow-xl relative overflow-hidden mb-8 max-w-md">
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-primary/80 to-primary"></div>
            
            <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider block mb-1">
              CÓDIGO DE PRE-COMPRA
            </span>
            <div className="flex items-center justify-center gap-3 py-3">
              <span className="font-mono text-3xl font-black text-primary tracking-widest select-all">
                {generatedSession.session.code}
              </span>
              <button
                onClick={() => handleCopyCode(generatedSession.session.code)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  copiedCode ? 'bg-green-100 text-green-600' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                }`}
                title="Copiar código al portapapeles"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copiedCode ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
            
            <div className="border-t border-outline-variant/15 mt-3.5 pt-3.5 flex justify-between items-center text-xs">
              <div className="text-left">
                <span className="text-[9px] font-extrabold text-on-surface-variant/60 uppercase block">Subtotal Estimado</span>
                <span className="font-black text-on-surface text-sm">${formatCurrency(generatedSession.session.subtotal)}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-extrabold text-on-surface-variant/60 uppercase block">Cant. Productos</span>
                <span className="font-black text-on-surface text-sm">{generatedSession.session.totalItems}</span>
              </div>
            </div>
          </div>

          {/* INSTRUCTIONS */}
          <div className="w-full bg-primary/5 rounded-2xl p-5 border border-primary/10 text-left mb-8 max-w-md">
            <h4 className="text-xs font-black uppercase text-primary tracking-wider mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              ¿Cómo funciona el cobro?
            </h4>
            <ul className="text-xs text-on-surface-variant leading-relaxed space-y-2 list-disc list-inside">
              <li>Mencioná el código <strong className="font-bold text-on-surface">{generatedSession.session.code}</strong> a la cajera.</li>
              <li>El sistema cargará automáticamente todos los productos que escaneaste.</li>
              <li>La cajera verificará la mercadería físicamente antes de cobrarte.</li>
              <li>El total se confirmará al emitir tu ticket fiscal.</li>
            </ul>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-col gap-3.5 w-full max-w-md mt-auto">
            <button
              onClick={() => {
                resetGeneratedSession();
                setIsCalculatorActive(false);
              }}
              className="w-full bg-primary text-white font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all active:scale-[0.99] cursor-pointer text-sm"
            >
              Nueva Calculadora de Compras
            </button>
            <Link
              to="/"
              className="w-full bg-white text-on-surface border border-outline-variant/30 font-bold py-3.5 rounded-full hover:bg-surface-container-high transition-all text-xs text-center flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">storefront</span>
              Volver a la Tienda
            </Link>
          </div>
        </div>
      ) : (

        /* ────────────────────────────────────────────────────────
            ESTADO 2: ONBOARDING / INTRO DE CALCULADORA
            ──────────────────────────────────────────────────────── */
        !isCalculatorActive ? (
          <div className="flex-grow flex flex-col items-center justify-center max-w-lg mx-auto w-full text-center animate-in fade-in duration-500">
            {/* Header Back Button */}
            <div className="w-full flex items-center justify-between mb-8">
              <Link to="/" className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </Link>
              <h2 className="font-bold text-on-surface-variant text-sm uppercase tracking-wider">La Martina</h2>
              <div className="w-10"></div> {/* Spacer */}
            </div>

            {/* Calculator Hero Icon */}
            <div className="relative w-40 h-40 flex items-center justify-center mb-8">
              <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse"></div>
              <div className="absolute inset-4 rounded-full bg-primary/10"></div>
              <div className="relative w-28 h-28 bg-white border border-primary/20 rounded-[2rem] shadow-lg flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[64px] font-light">calculate</span>
              </div>
              <div className="absolute -bottom-2 -right-2 bg-secondary-container text-on-secondary-container p-2.5 rounded-2xl shadow border border-outline-variant/30 flex items-center justify-center animate-bounce">
                <span className="material-symbols-outlined text-[20px] font-bold">barcode_scanner</span>
              </div>
            </div>

            {/* Texts */}
            <h1 className="font-display-xl text-[30px] font-black tracking-tight text-on-surface mb-3 leading-tight">
              ¡Calculá tu compra!
            </h1>
            <p className="font-body-lg text-on-surface-variant mb-6 text-sm sm:text-base leading-relaxed px-4">
              Escaneá los productos con la cámara de tu celular a medida que los vas sumando al carrito en el local.
              Conocé el total aproximado de tu gasto y presentá el código generado en la caja.
            </p>

            {/* Attention Banner */}
            <div className="w-full bg-white p-4.5 rounded-2xl shadow-sm border-l-4 border-primary border-t border-r border-b border-outline-variant/10 text-left mb-8 flex gap-3.5 items-start">
              <span className="material-symbols-outlined text-primary text-[22px] mt-0.5 shrink-0">info</span>
              <div>
                <p className="text-xs font-bold text-on-surface uppercase tracking-wider mb-1">Aviso Importante</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Esta calculadora es de carácter informativo. Los precios finales y el stock se ratifican y descuentan únicamente en caja al momento de procesar el pago físico.
                </p>
              </div>
            </div>

            {/* Bottom CTA Button */}
            <button
              onClick={() => {
                // If there were saved items in store from a previous session, restore calculator directly
                setIsCalculatorActive(true);
              }}
              className="w-full bg-primary text-white font-bold py-4 rounded-full hover:bg-primary/95 transition-all shadow-lg shadow-primary/10 active:scale-[0.99] cursor-pointer mt-auto flex items-center justify-center gap-2"
            >
              <span>Comenzar</span>
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            </button>
          </div>
        ) : (
          
          /* ────────────────────────────────────────────────────────
              ESTADO 3: CALCULADORA ACTIVA (CARRITO LOCAL)
              ──────────────────────────────────────────────────────── */
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
                    {totalItems} {totalItems === 1 ? 'producto' : 'productos'} en total
                  </p>
                </div>
              </div>

              {items.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-error text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                  Vaciar
                </button>
              )}
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col">
              
              {/* Error messages feedback */}
              {error && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center justify-between animate-in slide-in-from-top duration-300">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{error}</span>
                  </div>
                  <button onClick={clearError} className="material-symbols-outlined text-[14px]">close</button>
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
                    Escaneá los productos que agregues a tu carro físico para llevar la cuenta impositiva y de gasto.
                  </p>
                  
                  <div className="flex flex-col gap-3.5 w-full max-w-xs">
                    <button
                      onClick={() => { clearError(); setScannerOpen(true); }}
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
                      <span>Cargar por precio</span>
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
                            onClick={() => decrementItem(item.id)}
                            className="w-5 h-5 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer text-sm"
                          >
                            <span className="material-symbols-outlined text-[14px]">remove</span>
                          </button>
                          <span className="text-xs font-bold text-on-surface w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => incrementItem(item.id)}
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

                  {/* Totals Summary and Finalize Bar */}
                  <div className="bg-white p-4.5 rounded-2xl border border-outline-variant/20 shadow-md mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block">Total Estimado</span>
                        <span className="text-2xl font-black text-primary">${formatCurrency(subtotal)}</span>
                      </div>
                      
                      {/* Secondary Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowManualForm(true)}
                          className="w-10 h-10 bg-surface-container-low border border-outline-variant/20 text-on-surface-variant rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors cursor-pointer"
                          title="Cargar producto manualmente"
                        >
                          <span className="material-symbols-outlined text-[20px]">add</span>
                        </button>

                        <button
                          onClick={() => { clearError(); setScannerOpen(true); }}
                          className="bg-primary text-white font-bold px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-primary/95 shadow-md shadow-primary/10 transition-all cursor-pointer text-xs"
                        >
                          <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                          <span>Escanear más</span>
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowUserInfoForm(true)}
                      disabled={loading}
                      className="w-full bg-green-600 text-white font-bold py-4 rounded-full flex justify-center items-center gap-2 shadow-lg shadow-green-600/10 hover:bg-green-700 transition-all active:scale-[0.99] cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          <span>Procesando...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">assignment_turned_in</span>
                          <span>Confirmar Pre-compra</span>
                        </>
                      )}
                    </button>

                    <p className="text-[10px] text-center text-on-surface-variant/70 leading-relaxed max-w-sm mx-auto font-medium">
                      * El total es aproximado y se ratifica en caja. No descuenta stock ni constituye una venta hasta ser cobrado físicamente.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ────────────────────────────────────────────────────────
          MODAL 1: CARGAR MANUALMENTE POR PRECIO
          ──────────────────────────────────────────────────────── */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
              <h3 className="font-bold text-on-surface text-base">Cargar Producto</h3>
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
                  placeholder="Ej: Pan, Leche, Azúcar, etc."
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

      {/* ────────────────────────────────────────────────────────
          MODAL 2: IDENTIFICACIÓN DEL CLIENTE (NOMBRE Y CELULAR)
          ──────────────────────────────────────────────────────── */}
      {showUserInfoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden border border-outline-variant/10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
              <h3 className="font-bold text-on-surface text-base">Identificación</h3>
              <button
                onClick={() => setShowUserInfoForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleFinalize} className="p-6 space-y-4">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Ingresá tu nombre y celular opcional para que la cajera asocie la pre-compra en el POS más fácilmente.
              </p>

              <div>
                <label className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block mb-1">Tu Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold block mb-1">WhatsApp / Teléfono (Opcional)</label>
                <input
                  type="tel"
                  placeholder="Ej: 261 455 6677"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full bg-[#fcf9f8] border border-outline-variant/30 focus:border-primary rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUserInfoForm(false)}
                  className="flex-1 bg-surface-container-low text-on-surface-variant font-bold py-3 rounded-full hover:bg-surface-container-high text-xs transition-colors cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white font-bold py-3 rounded-full hover:bg-green-700 text-xs shadow transition-colors cursor-pointer"
                >
                  Confirmar y Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          INTEGRACIÓN: MODAL VISOR SCANNER
          ──────────────────────────────────────────────────────── */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </div>
  );
};
