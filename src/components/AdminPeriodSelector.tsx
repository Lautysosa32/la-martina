import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export const PERIOD_DAYS: Record<string, number> = { 'Últimos 7 días': 7, 'Este Mes': 30, 'Este Año': 365 };

interface PeriodSelectorProps {
  period: string;
  setPeriod: (p: string) => void;
  customRange: { from: string; to: string };
  setCustomRange: (range: { from: string; to: string }) => void;
}

export const AdminPeriodSelector: React.FC<PeriodSelectorProps> = ({ 
  period, setPeriod, customRange, setCustomRange 
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const headerPortal = document.getElementById('admin-header-portal');

  if (!headerPortal) return null;

  return createPortal(
    <div className="flex items-center gap-1.5 overflow-x-auto max-w-full hide-scrollbar whitespace-nowrap shrink-0 pb-1.5 py-1 w-full scroll-smooth">
      {Object.keys(PERIOD_DAYS).map(p => (
        <button key={p} onClick={() => { setPeriod(p); setShowDatePicker(false); }}
          className={`px-3 py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${p === period ? 'bg-primary text-white shadow-md' : 'bg-white text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'}`}
        >{p}</button>
      ))}
      <div className="relative shrink-0">
        <button 
          onClick={() => { setPeriod('Personalizado'); setShowDatePicker(!showDatePicker); }}
          className={`px-3 py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${period === 'Personalizado' ? 'bg-primary text-white shadow-md' : 'bg-white text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'}`}
        >
          <span className="material-symbols-outlined text-[15px] md:text-[18px]">calendar_today</span>
          {period === 'Personalizado' && customRange.from ? `${customRange.from.split('-').reverse().slice(0,2).join('/')} - ${customRange.to.split('-').reverse().slice(0,2).join('/')}` : 'Personalizado'}
        </button>

        {showDatePicker && (
          <div className="absolute top-full mt-2 right-0 bg-white p-6 rounded-[2rem] shadow-2xl border border-outline-variant/10 z-[110] w-[280px] md:w-[320px] animate-in fade-in zoom-in-95 duration-200">
            <h4 className="text-sm font-bold mb-4">Rango de Fechas</h4>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1.5 block ml-1">Desde</label>
                <input 
                  type="date" 
                  value={customRange.from}
                  onChange={e => setCustomRange({ ...customRange, from: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1.5 block ml-1">Hasta</label>
                <input 
                  type="date" 
                  value={customRange.to}
                  onChange={e => setCustomRange({ ...customRange, to: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all" 
                />
              </div>
              <button 
                onClick={() => setShowDatePicker(false)}
                disabled={!customRange.from || !customRange.to}
                className="w-full bg-primary text-white font-bold py-3 rounded-xl text-xs shadow-lg shadow-primary/20 mt-2 disabled:opacity-50"
              >
                Aplicar Rango
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>,
    headerPortal
  );
};
