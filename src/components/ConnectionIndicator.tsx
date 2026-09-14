import React, { useState } from 'react';
import { useConnectionStatus } from '../offline/hooks/useConnectionStatus';
import { useSyncStatus } from '../offline/hooks/useSyncStatus';
import { SyncStatusPanel } from './SyncStatusPanel';

export const ConnectionIndicator: React.FC = () => {
  const { isHealthy, cajaId } = useConnectionStatus();
  const { isSyncing, pendingCount, conflictCount } = useSyncStatus();
  const [showPanel, setShowPanel] = useState(false);

  // Determinar variante y texto
  let statusText = `${cajaId}`;
  let badgeColor = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
  let dotColor = 'bg-emerald-500 animate-pulse';

  if (!isHealthy) {
    statusText = `OFFLINE · ${cajaId} (${pendingCount})`;
    badgeColor = 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
    dotColor = 'bg-rose-500';
  } else if (isSyncing) {
    statusText = `Sincronizando (${pendingCount}) · ${cajaId}`;
    badgeColor = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    dotColor = 'bg-amber-500 animate-ping';
  } else if (conflictCount > 0) {
    statusText = `Atención (${conflictCount}) · ${cajaId}`;
    badgeColor = 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 shadow-amber-500/10';
    dotColor = 'bg-amber-500 animate-bounce';
  } else if (pendingCount > 0) {
    statusText = `${pendingCount} pend. · ${cajaId}`;
    badgeColor = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    dotColor = 'bg-amber-500';
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPanel(true)}
        aria-label="Estado de conexión y sincronización de caja"
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer hover:opacity-85 shadow-sm select-none ${badgeColor}`}
        title="Clic para ver detalles de sincronización y estado de caja"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="truncate max-w-[170px]">{statusText}</span>
      </button>

      {showPanel && <SyncStatusPanel onClose={() => setShowPanel(false)} />}
    </>
  );
};
