import { useState, useEffect } from 'react';
import { connectionMonitor } from '../connectionMonitor';
import { cajaManager } from '../cajaManager';

export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(connectionMonitor.isNavigatorOnline());
  const [isSupabaseReachable, setIsSupabaseReachable] = useState(connectionMonitor.isServerReachable());
  const [cajaId, setCajaId] = useState(cajaManager.getCajaIdSync());

  useEffect(() => {
    // Inicializar cajaId asíncrono
    cajaManager.getCajaId().then(id => setCajaId(id));

    // Suscribirse a cambios de conexión
    const unsubscribe = connectionMonitor.subscribe((online, reachable) => {
      setIsOnline(online);
      setIsSupabaseReachable(reachable);
    });

    const handleCajaChanged = (e: any) => {
      if (e?.detail) setCajaId(e.detail);
      else cajaManager.getCajaId().then(id => setCajaId(id));
    };

    window.addEventListener('caja-id-changed', handleCajaChanged);
    window.addEventListener('storage', handleCajaChanged);

    return () => {
      unsubscribe();
      window.removeEventListener('caja-id-changed', handleCajaChanged);
      window.removeEventListener('storage', handleCajaChanged);
    };
  }, []);

  return {
    isOnline,
    isSupabaseReachable,
    isHealthy: isOnline && isSupabaseReachable,
    cajaId
  };
}
