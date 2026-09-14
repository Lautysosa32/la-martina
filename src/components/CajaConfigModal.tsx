import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cajaManager } from '../offline/cajaManager';

interface CajaConfigModalProps {
  onClose: () => void;
  onSaved?: (newCajaId: string) => void;
}

export const CajaConfigModal: React.FC<CajaConfigModalProps> = ({ onClose, onSaved }) => {
  const [cajaIdInput, setCajaIdInput] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    cajaManager.getCajaId().then(id => {
      setCurrentId(id);
      setCajaIdInput(id);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cajaIdInput.trim().toUpperCase();
    if (!clean) return;

    await cajaManager.setCajaId(clean);
    setCurrentId(clean);
    setSavedSuccess(true);
    if (onSaved) onSaved(clean);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface text-on-surface w-full max-w-md rounded-2xl shadow-2xl border border-outline-variant/30 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">point_of_sale</span>
            <h3 className="text-base font-bold text-on-surface">Configuración de Terminal / Caja</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Identificador Único de Esta Caja
            </label>
            <input
              type="text"
              value={cajaIdInput}
              onChange={e => setCajaIdInput(e.target.value.toUpperCase())}
              placeholder="Ej: CAJA-01, CAJA-02"
              className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
            />
            <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
              Este identificador se asocia de forma inmutable a cada ticket emitido, venta registrada y cierre de turno realizado en esta computadora.
            </p>
          </div>

          <div className="p-3 bg-surface-container-high/40 rounded-xl text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Caja actual configurada:</span>
              <span className="font-mono font-bold text-primary">{currentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Persistencia:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">IndexedDB + LocalStorage</span>
            </div>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>¡Caja actualizada correctamente a {currentId}!</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-all shadow-md cursor-pointer"
            >
              Guardar Identificador
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
