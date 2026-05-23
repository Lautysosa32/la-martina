import React, { useState, useEffect, useRef } from 'react';
import { Scanner, IScannerError } from '@yudiel/react-qr-scanner';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedHistory, setScannedHistory] = useState<string[]>([]);
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  // Reset errors and history when open state changes
  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      setScannedHistory([]);
      lastScannedRef.current = null;
      lastScannedTimeRef.current = 0;
    }
  }, [open]);

  if (!open) return null;

  const handleScan = (detectedCodes: any[]) => {
    if (!detectedCodes || detectedCodes.length === 0) return;
    
    // We get the first detected code
    const rawCode = detectedCodes[0]?.rawValue;
    if (!rawCode) return;
    
    const code = rawCode.trim();
    const now = Date.now();

    // Debounce: prevent same code scanning within 2 seconds
    if (lastScannedRef.current === code && now - lastScannedTimeRef.current < 2000) {
      return;
    }

    lastScannedRef.current = code;
    lastScannedTimeRef.current = now;

    // Add to history for visual feedback inside modal
    setScannedHistory((prev) => [code, ...prev.slice(0, 4)]);

    // Haptic feedback (vibration) if supported
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(100);
      }
    } catch (e) {
      console.warn('Haptic feedback not supported or blocked:', e);
    }

    // Call callback
    onDetected(code);
  };

  const handleError = (error: IScannerError) => {
    console.error('Camera Scanner Error:', error);
    
    switch (error.kind) {
      case 'permission-denied':
        setErrorMsg('Acceso denegado a la cámara. Habilitalo en la configuración del sitio en tu navegador.');
        break;
      case 'no-camera':
        setErrorMsg('No se detectó ninguna cámara en este dispositivo.');
        break;
      case 'insecure-context':
        setErrorMsg('El escaneo de cámara requiere una conexión segura (HTTPS o localhost).');
        break;
      case 'unsupported':
        setErrorMsg('El escaneo no es soportado por tu navegador o sistema.');
        break;
      default:
        setErrorMsg(`Error al iniciar la cámara: ${error.message || 'Cámara en uso o no disponible.'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      {/* Outer Modal Container */}
      <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-[2.5rem] border border-outline-variant/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/10 bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px] animate-pulse">
              photo_camera
            </span>
            <div>
              <h3 className="font-bold text-on-surface text-base">Escanear código</h3>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Cámara activa
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

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
          {errorMsg ? (
            <div className="flex flex-col items-center gap-4 py-8 px-4 text-center">
              <span className="material-symbols-outlined text-error text-[54px] animate-bounce">
                no_photography
              </span>
              <p className="text-sm font-semibold text-on-surface">{errorMsg}</p>
              <p className="text-xs text-on-surface-variant max-w-sm">
                Si es un celular, asegurate de dar permisos de cámara al navegador y de estar navegando mediante HTTPS.
              </p>
              <button
                onClick={() => setErrorMsg(null)}
                className="mt-2 bg-primary text-on-primary font-bold px-6 py-2.5 rounded-full text-xs hover:bg-primary-hover active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-6">
              {/* Instructions */}
              <p className="text-sm text-on-surface font-medium leading-relaxed">
                Apuntá el código de barras del producto hacia el visor de la cámara.
              </p>

              {/* Scanner Container with Framed Viewport */}
              <div className="relative w-full aspect-[4/3] max-w-sm rounded-[2rem] overflow-hidden border-2 border-outline-variant/10 shadow-inner bg-black flex items-center justify-center">
                {/* Camera Feed Component */}
                <div className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full">
                  <Scanner
                    onScan={handleScan}
                    onError={handleError}
                    paused={false}
                    allowMultiple={true}
                    scanDelay={500}
                    startTimeoutMs={10000}
                    constraints={{
                      facingMode: 'environment'
                    }}
                    formats={[
                      'ean_13',
                      'ean_8',
                      'upc_a',
                      'upc_e',
                      'code_128',
                      'code_39'
                    ]}
                  />
                </div>

                {/* Laser scan line animation */}
                <div className="absolute inset-x-0 h-0.5 bg-primary/80 shadow-[0_0_12px_rgba(227,0,27,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>

                {/* VISOR FRAMING OVERLAY */}
                <div className="absolute inset-0 pointer-events-none border-[24px] border-black/40 flex items-center justify-center">
                  <div className="relative w-full h-full border border-primary/45 rounded-xl">
                    {/* Camera corners */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-md"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-md"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-md"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-md"></div>
                  </div>
                </div>
              </div>

              {/* Scanned code feedback inside modal */}
              {scannedHistory.length > 0 && (
                <div className="w-full max-w-sm text-left">
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest block mb-2 px-1">
                    Últimas lecturas
                  </span>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {scannedHistory.map((code, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-3 py-1.5 rounded-full font-mono font-bold tracking-wider ${
                          idx === 0
                            ? 'bg-primary/10 text-primary border border-primary/20 scale-105 animate-pulse'
                            : 'bg-surface-container-high text-on-surface-variant/70 border border-outline-variant/5'
                        }`}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/10 text-center">
          <p className="text-[10px] text-on-surface-variant font-medium">
            ¿No escanea? Asegurate de tener buena iluminación y que el código no esté dañado.
          </p>
        </div>
      </div>

      {/* SCANNER LINE ANIMATION CSS */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
      `}</style>
    </div>
  );
};
