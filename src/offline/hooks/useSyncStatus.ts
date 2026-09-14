import { useState, useEffect, useCallback } from 'react';
import { syncEngine } from '../syncEngine';
import { syncQueue } from '../syncQueue';
import { localDB } from '../db';

export function useSyncStatus() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>();

  const refreshCounts = useCallback(async () => {
    try {
      const [pCount, allConflicts] = await Promise.all([
        syncQueue.getPendingCount(),
        localDB.sync_conflicts.toArray()
      ]);
      setPendingCount(pCount);
      setConflictCount(allConflicts.filter(c => !c.resolved).length);
    } catch (e) {
      console.warn('Error refreshing sync counts:', e);
    }
  }, []);

  useEffect(() => {
    // Iniciar el SyncEngine si no está iniciado
    syncEngine.start();

    // Obtener conteo inicial
    refreshCounts();

    // 1. Suscribirse a cambios del SyncEngine
    const unsubscribe = syncEngine.subscribe((syncing, count, error) => {
      setIsSyncing(syncing);
      setPendingCount(count);
      if (error) setLastError(error);
      refreshCounts();
    });

    // 2. Escuchar evento en vivo de cambios en la cola (0ms de latencia ante ventas offline)
    const handleQueueChanged = () => {
      refreshCounts();
    };
    window.addEventListener('offline-queue-changed', handleQueueChanged);

    // 3. Polling defensivo cada 2.5 segundos para reflejar cambios externos
    const interval = setInterval(refreshCounts, 2500);

    return () => {
      unsubscribe();
      window.removeEventListener('offline-queue-changed', handleQueueChanged);
      clearInterval(interval);
    };
  }, [refreshCounts]);

  const syncNow = useCallback(async () => {
    await syncEngine.syncNow();
    await refreshCounts();
  }, [refreshCounts]);

  return {
    isSyncing,
    pendingCount,
    conflictCount,
    lastError,
    syncNow
  };
}
