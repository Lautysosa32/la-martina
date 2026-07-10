import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const PERIOD_OPTIONS = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Últimos 30 días'];

export const getPeriodRange = (
  period: string, 
  customRange?: { from: string; to: string }
): { from: number; to: number } => {
  const now = new Date();
  
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

  switch (period) {
    case 'Hoy': {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    case 'Ayer': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case 'Esta semana': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(new Date().setDate(diff));
      return { from: startOfDay(monday), to: endOfDay(new Date()) };
    }
    case 'Este mes': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(firstDay), to: endOfDay(new Date()) };
    }
    case 'Últimos 30 días': {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return { from: startOfDay(thirtyDaysAgo), to: endOfDay(new Date()) };
    }
    case 'Personalizado': {
      if (customRange && customRange.from && customRange.to) {
        const fromDate = new Date(`${customRange.from}T00:00:00`);
        const toDate = new Date(`${customRange.to}T00:00:00`);
        return { from: startOfDay(fromDate), to: endOfDay(toDate) };
      }
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return { from: startOfDay(thirtyDaysAgo), to: endOfDay(new Date()) };
    }
    default: {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return { from: startOfDay(thirtyDaysAgo), to: endOfDay(new Date()) };
    }
  }
};

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
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalNode(document.getElementById('admin-header-portal'));
  }, []);

  if (!portalNode) return null;

  return createPortal(
    <div className="relative flex items-center justify-start">
      <div className="flex items-center gap-1 overflow-x-auto max-w-full hide-scrollbar whitespace-nowrap shrink-0 pb-1 py-0.5 scroll-smooth">
        {PERIOD_OPTIONS.map(p => (
          <button key={p} onClick={() => { setPeriod(p); setShowDatePicker(false); }}
            className={`px-3 py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${p === period ? 'bg-primary text-white shadow-md' : 'bg-white text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'}`}
          >{p}</button>
        ))}
        <button 
          onClick={() => { setPeriod('Personalizado'); setShowDatePicker(!showDatePicker); }}
          className={`px-3 py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${period === 'Personalizado' ? 'bg-primary text-white shadow-md' : 'bg-white text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'}`}
        >
          <span className="material-symbols-outlined text-[15px] md:text-[18px]">calendar_today</span>
          {period === 'Personalizado' && customRange.from ? `${customRange.from.split('-').reverse().slice(0,2).join('/')} - ${customRange.to.split('-').reverse().slice(0,2).join('/')}` : 'Personalizado'}
        </button>
      </div>

      {showDatePicker && (
        <div className="absolute top-full mt-2 right-0 bg-white p-6 rounded-4xl shadow-2xl border border-outline-variant/10 z-[110] w-70 md:w-[320px] animate-in fade-in zoom-in-95 duration-200">
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

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>,
    portalNode
  );
};
