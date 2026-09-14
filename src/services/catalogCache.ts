/**
 * Servicio de Caché para Catálogo y Metadatos (Optimización de Egress de Supabase).
 * Combina almacenamiento en memoria (RAM) para acceso instantáneo
 * con sessionStorage para persistir datos durante la navegación sin consumir red.
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const MEMORY_CACHE = new Map<string, CacheEntry<any>>();
const PREFIX = 'lm_cache_';

export const TTL = {
  CATEGORIES: 30 * 60 * 1000,    // 30 minutos (categorías y subcategorías)
  TAGS: 30 * 60 * 1000,          // 30 minutos (etiquetas)
  CATALOG_PAGE: 5 * 60 * 1000,   // 5 minutos (páginas de productos)
  SEARCH_AUTOCOMPLETE: 3 * 60 * 1000, // 3 minutos (búsqueda rápida)
  OFFERS: 10 * 60 * 1000,        // 10 minutos (ofertas y destacados de Home)
};

export const catalogCache = {
  /**
   * Obtiene un valor de la caché (Memoria -> sessionStorage).
   * Si ha expirado, lo elimina y devuelve null.
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Revisar caché en memoria (más rápido)
    const memEntry = MEMORY_CACHE.get(key);
    if (memEntry) {
      if (memEntry.expiry > now) {
        return memEntry.data as T;
      }
      MEMORY_CACHE.delete(key);
    }

    // 2. Revisar sessionStorage
    try {
      const stored = sessionStorage.getItem(PREFIX + key);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        if (entry.expiry > now) {
          // Rehidratar memoria para el siguiente acceso
          MEMORY_CACHE.set(key, entry);
          return entry.data;
        }
        sessionStorage.removeItem(PREFIX + key);
      }
    } catch {
      // Si sessionStorage no está disponible o falla el parseo
    }

    return null;
  },

  /**
   * Guarda un valor en la caché con tiempo de vida (TTL) en milisegundos.
   */
  set<T>(key: string, data: T, ttlMs: number = TTL.CATALOG_PAGE): void {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + ttlMs,
    };

    MEMORY_CACHE.set(key, entry);

    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      // Si excede cuota de sessionStorage, simplemente queda en memoria
    }
  },

  /**
   * Invalida una clave específica o un patrón de claves.
   */
  remove(key: string): void {
    MEMORY_CACHE.delete(key);
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch {}
  },

  /**
   * Invalida todas las claves de categorías y subcategorías.
   */
  invalidateCategories(): void {
    this.remove('categories_tree');
    this.remove('subcategories_all');
    this.remove('admin_tags');
  },

  /**
   * Invalida todas las páginas cacheadas del catálogo de productos.
   */
  invalidateCatalog(): void {
    MEMORY_CACHE.forEach((_, k) => {
      if (k.startsWith('catalog_') || k.startsWith('search_') || k.startsWith('home_')) {
        MEMORY_CACHE.delete(k);
      }
    });

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith(PREFIX + 'catalog_') || k.startsWith(PREFIX + 'search_') || k.startsWith(PREFIX + 'home_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {}
  },

  /**
   * Limpia toda la caché
   */
  clearAll(): void {
    MEMORY_CACHE.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch {}
  }
};
