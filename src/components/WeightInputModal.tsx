import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { parseScaleBarcode } from '../utils/scale-barcode';

interface WeightInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: number) => void;
  initialValue?: number;
  requestedWeight?: number;
  productName?: string;
  pricePerKg?: number;
  subtitle?: string;
}

export const WeightInputModal: React.FC<WeightInputModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialValue = 0,
  requestedWeight,
  productName = 'Producto',
  pricePerKg = 0,
  subtitle
}) => {
  const [value, setValue] = useState<string>(initialValue > 0 ? initialValue.toString() : '');
  const [barcodeBuffer, setBarcodeBuffer] = useState<string>('');
  const [lastScannedFeedback, setLastScannedFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialValue > 0) {
        setValue(parseFloat(initialValue.toFixed(3)).toString());
      } else {
        setValue('');
      }
      setBarcodeBuffer('');
      setLastScannedFeedback(null);
      setTimeout(() => containerRef.current?.focus(), 50);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleKeyPress = (key: string) => {
    setLastScannedFeedback(null);
    if (key === 'C') {
      setValue('');
      return;
    }
    
    if (key === '⌫') {
      setValue(prev => prev.slice(0, -1));
      return;
    }

    if (key === '.') {
      if (value.includes('.')) return;
      if (value === '') {
        setValue('0.');
        return;
      }
    }

    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts[1].length >= 3) return; // Permite hasta 3 decimales para gramos exactos
    }

    // Limite de dígitos enteros
    if (!value.includes('.') && value.length >= 4 && key !== '.') return;

    if (value === '0' && key !== '.') {
      setValue(key);
      return;
    }

    setValue(prev => prev + key);
  };

  const handleConfirm = () => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      onConfirm(parseFloat(num.toFixed(3)));
    } else {
      onClose();
    }
  };

  const subtotal = (parseFloat(value) || 0) * pricePerKg;

  const keypad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '⌫']
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= 12 && (barcodeBuffer.startsWith('20') || barcodeBuffer.startsWith('21') || barcodeBuffer.startsWith('22'))) {
        const res = parseScaleBarcode(barcodeBuffer, []);
        if (res.weightKg && res.weightKg > 0) {
          setValue(res.weightKg.toString());
          setLastScannedFeedback(`Código balanza detectado: ${res.weightKg} kg`);
          setBarcodeBuffer('');
          return;
        }
      }
      setBarcodeBuffer('');
      if (parseFloat(value) > 0) {
        handleConfirm();
      }
      return;
    }

    if (e.key === 'Backspace') { 
      setBarcodeBuffer(prev => prev.slice(0, -1));
      setValue(prev => prev.slice(0, -1)); 
      return; 
    }
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === '.' || e.key === ',') { handleKeyPress('.'); return; }
    if (/^\d$/.test(e.key)) {
      setBarcodeBuffer(prev => prev + e.key);
      handleKeyPress(e.key);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white w-full sm:w-[420px] rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-300 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-outline-variant/10">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xl font-black text-on-background line-clamp-1">{productName}</h3>
              {subtitle && <p className="text-xs font-semibold text-on-surface-variant">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors shrink-0">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {requestedWeight !== undefined && requestedWeight > 0 && (
            <div className="mb-3 flex items-center justify-between bg-primary/5 px-3 py-2 rounded-xl border border-primary/15 text-xs">
              <span className="font-semibold text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">shopping_bag</span>
                Pedido original:
              </span>
              <strong className="text-primary font-bold">{requestedWeight} kg</strong>
            </div>
          )}
          
          <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 text-center relative overflow-hidden"
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">scale</span>
              Peso real pesado en balanza
            </div>
            <div className="flex items-end justify-center gap-2">
              <span className="text-5xl font-black text-primary tracking-tighter select-none">
                {value || '0'}
              </span>
              <span className="text-xl font-bold text-on-surface-variant/50 mb-2">kg</span>
            </div>

            {lastScannedFeedback && (
              <div className="mt-1 text-[11px] font-bold text-green-600 animate-in fade-in">
                {lastScannedFeedback}
              </div>
            )}
            
            {pricePerKg > 0 && (
              <div className="mt-3 text-sm font-bold text-on-surface-variant pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                <span>Subtotal ({parseFloat(value || '0')} kg × ${pricePerKg.toLocaleString('es-AR')}):</span>
                <span className="text-on-background font-black text-base">${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-surface-container-lowest">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {keypad.map((row, i) => (
              <React.Fragment key={i}>
                {row.map(key => (
                  <button
                    key={key}
                    onClick={() => handleKeyPress(key)}
                    className={`h-14 sm:h-16 rounded-2xl text-2xl font-black flex items-center justify-center transition-all shadow-sm active:scale-95
                      ${key === '⌫' 
                        ? 'bg-red-50 text-error border border-red-100 hover:bg-red-100' 
                        : 'bg-white text-on-background border border-outline-variant/10 hover:bg-surface-container-low hover:border-primary/20'
                      }`}
                  >
                    {key === '⌫' ? <span className="material-symbols-outlined text-[24px]">backspace</span> : key}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleKeyPress('C')}
              className="h-14 bg-surface-container-low hover:bg-surface-container-highest text-on-surface font-bold rounded-2xl transition-colors text-sm"
            >
              Borrar todo
            </button>
            <button
              onClick={handleConfirm}
              disabled={parseFloat(value) <= 0 || isNaN(parseFloat(value))}
              className="h-14 bg-primary text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none hover:bg-primary/90 text-sm flex items-center justify-center gap-2"
            >
              Confirmar
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
