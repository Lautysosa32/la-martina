import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface WeightInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: number) => void;
  initialValue?: number;
  productName?: string;
  pricePerKg?: number;
}

export const WeightInputModal: React.FC<WeightInputModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialValue = 0,
  productName = 'Producto',
  pricePerKg = 0
}) => {
  const [value, setValue] = useState<string>(initialValue > 0 ? initialValue.toString() : '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Strip trailing zeros: 2.000 -> '2', 3.500 -> '3.5'
      if (initialValue > 0) {
        setValue(parseFloat(initialValue.toFixed(2)).toString());
      } else {
        setValue('');
      }
      // Auto-focus so physical keyboard works immediately
      setTimeout(() => containerRef.current?.focus(), 50);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleKeyPress = (key: string) => {
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
      if (parts[1].length >= 2) return; // Max 2 decimals
    }

    // Limit integer part length to something reasonable, e.g. 5 digits max for kg
    if (!value.includes('.') && value.length >= 5 && key !== '.') return;

    if (value === '0' && key !== '.') {
      setValue(key);
      return;
    }

    setValue(prev => prev + key);
  };

  const handleConfirm = () => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      onConfirm(num);
    } else {
      // Si está en cero, podemos cerrar sin hacer nada o dar error
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white w-full sm:w-[400px] rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 duration-300 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black text-on-background line-clamp-1">{productName}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          
          <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10 text-center relative overflow-hidden"
            ref={containerRef}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && parseFloat(value) > 0) { handleConfirm(); return; }
              if (e.key === 'Backspace') { setValue(prev => prev.slice(0, -1)); return; }
              if (e.key === 'Escape') { onClose(); return; }
              if (e.key === '.' || e.key === ',') { handleKeyPress('.'); return; }
              if (/^\d$/.test(e.key)) { handleKeyPress(e.key); }
            }}
          >
            <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Cantidad a ingresar</div>
            <div className="flex items-end justify-center gap-2">
              {/* Display only - no device keyboard */}
              <span className="text-5xl font-black text-primary tracking-tighter select-none">
                {value || '0'}
              </span>
              <span className="text-xl font-bold text-on-surface-variant/50 mb-2">kg</span>
            </div>
            
            {pricePerKg > 0 && (
              <div className="mt-3 text-sm font-bold text-on-surface-variant pt-3 border-t border-outline-variant/10">
                Subtotal: <span className="text-on-background">${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
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
