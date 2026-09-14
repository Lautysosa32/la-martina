import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useConnectionStatus } from '../offline/hooks/useConnectionStatus';
import { useSyncStatus } from '../offline/hooks/useSyncStatus';
import { syncQueue } from '../offline/syncQueue';
import { localDB } from '../offline/db';
import { SyncQueueItem, SyncConflict } from '../offline/types';
import { CajaConfigModal } from './CajaConfigModal';

interface SyncStatusPanelProps {
  onClose: () => void;
}

export const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({ onClose }) => {
  const { isOnline, isSupabaseReachable, isHealthy, cajaId } = useConnectionStatus();
  const { isSyncing, pendingCount, syncNow, lastError } = useSyncStatus();

  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [showCajaConfig, setShowCajaConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'conflicts'>('queue');

  const loadData = async () => {
    const items = await syncQueue.getAllItems();
    setQueueItems(items);
    const confs = await localDB.sync_conflicts.toArray();
    setConflicts(confs);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncClick = async () => {
    await syncNow();
    await loadData();
  };

  const handleRetryFailed = async () => {
    await syncQueue.resetFailedItems();
    await syncNow();
    await loadData();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface text-on-surface w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <div>
              <h2 className="text-base font-bold text-on-surface">Panel de Sincronización y Estado Offline</h2>
              <p className="text-xs text-on-surface-variant font-mono">Terminal asignada: {cajaId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Status Summary Cards */}
        <div className="p-4 grid grid-cols-3 gap-3 bg-surface-container-lowest/50 border-b border-outline-variant/15 text-xs">
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-on-surface-variant">Conexión de Red:</span>
            <div className="mt-1 flex items-center gap-1.5 font-bold">
              <span className={`material-symbols-outlined text-sm ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isOnline ? 'wifi' : 'wifi_off'}
              </span>
              <span>{isOnline ? 'Conectado a Red' : 'Sin Red (Offline)'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
            <span className="text-on-surface-variant">Servidor Supabase:</span>
            <div className="mt-1 flex items-center gap-1.5 font-bold">
              <span className={`material-symbols-outlined text-sm ${isSupabaseReachable ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isSupabaseReachable ? 'cloud_done' : 'cloud_off'}
              </span>
              <span>{isSupabaseReachable ? 'Alcanzable' : 'No disponible'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant">Terminal / Caja:</span>
              <button
                onClick={() => setShowCajaConfig(true)}
                className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
              >
                Cambiar
              </button>
            </div>
            <div className="mt-1 font-mono font-bold text-sm text-primary">
              {cajaId}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-outline-variant/20 px-6 gap-6 text-sm font-semibold bg-surface">
          <button
            onClick={() => setActiveTab('queue')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'queue'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Cola de Operaciones</span>
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-surface-container-high font-mono">
              {queueItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('conflicts')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'conflicts'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Conflictos / Auditoría</span>
            {conflicts.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 font-mono font-bold">
                {conflicts.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'queue' ? (
            queueItems.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">check_circle</span>
                <p className="font-semibold text-sm">Todas las operaciones están sincronizadas</p>
                <p className="text-xs mt-1">No hay ventas ni movimientos pendientes en esta terminal.</p>
              </div>
            ) : (
              queueItems.map(item => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-outline-variant/25 bg-surface-container-lowest flex items-center justify-between text-xs gap-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-on-surface">{item.entity_id}</span>
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] bg-primary/10 text-primary">
                        {item.operation_type}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                        item.status === 'syncing' ? 'bg-amber-500/15 text-amber-600' :
                        item.status === 'failed' ? 'bg-rose-500/15 text-rose-600' :
                        'bg-surface-container-high text-on-surface-variant'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-on-surface-variant text-[11px]">
                      Fecha: {new Date(item.created_at).toLocaleTimeString('es-AR')} · Caja: {item.caja_id} · Reintentos: {item.retry_count}
                    </p>
                    {item.last_error && (
                      <p className="text-rose-600 dark:text-rose-400 text-[10px] font-mono">
                        Error: {item.last_error}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            conflicts.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">verified_user</span>
                <p className="font-semibold text-sm">Sin conflictos pendientes</p>
                <p className="text-xs mt-1">No se detectaron discrepancias de stock ni de cuenta corriente.</p>
              </div>
            ) : (
              conflicts.map(conf => (
                <div
                  key={conf.id}
                  className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-sm">warning</span>
                      <span className="font-bold text-on-surface font-mono">{conf.conflict_type}</span>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      {new Date(conf.created_at).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <p className="text-on-surface-variant">
                    Entidad: <strong>{conf.entity_type}</strong> (#{conf.entity_id}) en {conf.caja_id}
                  </p>
                  <pre className="p-2 bg-surface-container-high/40 rounded-lg text-[10px] font-mono overflow-x-auto text-on-surface">
                    {JSON.stringify(conf.details, null, 2)}
                  </pre>
                </div>
              ))
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between text-xs">
          <div className="text-on-surface-variant">
            {isSyncing ? (
              <span className="text-amber-600 font-semibold animate-pulse">Sincronizando operaciones...</span>
            ) : lastError ? (
              <span className="text-rose-600 font-medium">Aviso: {lastError}</span>
            ) : (
              <span>Modo seguro: cero pérdida de transacciones</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {queueItems.some(i => i.status === 'failed') && (
              <button
                onClick={handleRetryFailed}
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-700 dark:text-amber-400 font-bold hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                Reintentar Fallidos
              </button>
            )}
            <button
              onClick={handleSyncClick}
              disabled={isSyncing || !isHealthy}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary font-bold shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
            </button>
          </div>
        </div>
      </div>

      {showCajaConfig && (
        <CajaConfigModal onClose={() => setShowCajaConfig(false)} onSaved={() => loadData()} />
      )}
    </div>,
    document.body
  );
};
