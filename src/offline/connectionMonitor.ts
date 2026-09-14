type ConnectionListener = (isOnline: boolean, isSupabaseReachable: boolean) => void;

class ConnectionMonitor {
  private online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private supabaseReachable: boolean = true;
  private listeners: Set<ConnectionListener> = new Set();
  private checkIntervalId: any = null;
  private isChecking: boolean = false;
  private supabaseUrl: string = '';
  private supabaseKey: string = '';

  constructor() {
    this.initCredentials();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnlineEvent);
      window.addEventListener('offline', this.handleOfflineEvent);
    }
  }

  private initCredentials() {
    try {
      this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      this.supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    } catch (e) {
      console.warn('Could not read Vite env in ConnectionMonitor:', e);
    }
  }

  start(intervalMs: number = 10000) {
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    // Check immediately
    this.checkConnection();
    this.checkIntervalId = setInterval(() => {
      this.checkConnection();
    }, intervalMs);
  }

  stop() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnlineEvent);
      window.removeEventListener('offline', this.handleOfflineEvent);
    }
  }

  private handleOnlineEvent = () => {
    this.online = true;
    this.checkConnection();
  };

  private handleOfflineEvent = () => {
    this.online = false;
    this.supabaseReachable = false;
    this.notify();
  };

  /**
   * Realiza un ping ligero a Supabase para verificar si la red tiene salida real a Internet
   * y Supabase está respondiendo.
   */
  async checkConnection(): Promise<boolean> {
    if (this.isChecking) return this.isHealthy();
    this.isChecking = true;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online = false;
      this.supabaseReachable = false;
      this.isChecking = false;
      this.notify();
      return false;
    }

    this.online = true;

    if (!this.supabaseUrl) {
      this.initCredentials();
    }

    if (!this.supabaseUrl || !this.supabaseKey) {
      // Fallback simple si no hay URL configurada
      this.supabaseReachable = this.online;
      this.isChecking = false;
      this.notify();
      return this.isHealthy();
    }

    try {
      // Petición HEAD ultra-rápida y de 0 bytes de egress a endpoint público
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.supabaseUrl}/rest/v1/products?limit=0`, {
        method: 'HEAD',
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const prevReachable = this.supabaseReachable;
      // Cualquier código 2xx o 3xx significa que el servidor responde correctamente
      this.supabaseReachable = res.ok || res.status < 500;

      if (prevReachable !== this.supabaseReachable) {
        this.notify();
      }
    } catch (err) {
      const prevReachable = this.supabaseReachable;
      this.supabaseReachable = false;
      if (prevReachable !== false) {
        this.notify();
      }
    } finally {
      this.isChecking = false;
    }

    return this.isHealthy();
  }

  isHealthy(): boolean {
    return this.online && this.supabaseReachable;
  }

  isNavigatorOnline(): boolean {
    return this.online;
  }

  isServerReachable(): boolean {
    return this.supabaseReachable;
  }

  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    // Notificar de inmediato el estado actual
    listener(this.online, this.supabaseReachable);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn(this.online, this.supabaseReachable);
      } catch (err) {
        console.error('Error in connection listener:', err);
      }
    });
  }
}

export const connectionMonitor = new ConnectionMonitor();
