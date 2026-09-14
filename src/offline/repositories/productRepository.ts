import { localDB } from '../db';
import { LocalProduct } from '../types';

export const productRepository = {
  /**
   * Obtiene todos los productos locales activos (excluye eliminados lógicos)
   */
  async getAllProducts(): Promise<LocalProduct[]> {
    try {
      const all = await localDB.products.toArray();
      return all.filter(p => !p.deleted_at && p.active !== false);
    } catch (err) {
      console.error('Error in getAllProducts from IndexedDB:', err);
      return [];
    }
  },

  /**
   * Obtiene un producto por su ID
   */
  async getProductById(id: string): Promise<LocalProduct | undefined> {
    try {
      return await localDB.products.get(id);
    } catch (err) {
      console.error('Error in getProductById:', err);
      return undefined;
    }
  },

  /**
   * Obtiene un producto por código de barras exacto
   */
  async getProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
    const clean = barcode.trim();
    if (!clean) return undefined;
    try {
      return await localDB.products.where('barcode').equals(clean).first();
    } catch (err) {
      console.error('Error in getProductByBarcode:', err);
      return undefined;
    }
  },

  /**
   * Búsqueda ponderada rápida en memoria/local (para autocompletado del POS)
   */
  async searchProducts(query: string, limit: number = 8): Promise<LocalProduct[]> {
    const clean = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!clean) return [];

    try {
      const products = await this.getAllProducts();
      const scored: { product: LocalProduct; score: number }[] = [];

      for (const p of products) {
        const barcode = (p.barcode || '').trim().toLowerCase();
        const name = (p.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const brand = (p.brand || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        let score = -1;
        if (barcode === clean) {
          score = 100; // Coincidencia exacta de código de barras
        } else if (barcode.startsWith(clean)) {
          score = 90;  // Prefijo de código de barras
        } else if (name.startsWith(clean)) {
          score = 80;  // Empieza con la búsqueda
        } else {
          const words = name.split(/\s+/);
          if (words.some(w => w.startsWith(clean))) {
            score = 70; // Alguna palabra interna empieza con la búsqueda
          } else if (name.includes(clean)) {
            score = 50; // Contiene la búsqueda
          } else if (brand.startsWith(clean)) {
            score = 40; // Marca empieza con la búsqueda
          } else if (brand.includes(clean)) {
            score = 30; // Marca contiene la búsqueda
          } else if (barcode.includes(clean)) {
            score = 20; // Código contiene los dígitos
          }
        }

        if (score > 0) {
          scored.push({ product: p, score });
        }
      }

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.product);
    } catch (err) {
      console.error('Error searching products locally:', err);
      return [];
    }
  },

  /**
   * Descuenta stock localmente de forma atómica
   */
  async updateLocalStock(productId: string, quantityToDeduct: number): Promise<void> {
    try {
      await localDB.transaction('rw', localDB.products, async () => {
        const prod = await localDB.products.get(productId);
        if (prod) {
          prod.stock = (prod.stock ?? 0) - quantityToDeduct;
          prod.updated_at = new Date().toISOString();
          await localDB.products.put(prod);
        }
      });
    } catch (err) {
      console.error(`Error updating local stock for ${productId}:`, err);
    }
  },

  /**
   * Guarda o actualiza un lote de productos en IndexedDB
   */
  async saveProducts(products: LocalProduct[]): Promise<void> {
    if (!products || products.length === 0) return;
    try {
      await localDB.products.bulkPut(products);
    } catch (err) {
      console.error('Error bulk saving products:', err);
    }
  },

  /**
   * Marca productos eliminados lógicamente
   */
  async markDeleted(productIds: string[]): Promise<void> {
    if (!productIds || productIds.length === 0) return;
    try {
      await localDB.transaction('rw', localDB.products, async () => {
        for (const id of productIds) {
          const prod = await localDB.products.get(id);
          if (prod) {
            prod.deleted_at = new Date().toISOString();
            prod.active = false;
            await localDB.products.put(prod);
          }
        }
      });
    } catch (err) {
      console.error('Error marking deleted products:', err);
    }
  },

  /**
   * Obtiene la marca de tiempo de la última sincronización de catálogo
   */
  async getLastSyncTimestamp(): Promise<string | null> {
    try {
      const rec = await localDB.settings_cache.get('last_catalog_sync');
      return rec ? String(rec.value) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Guarda la marca de tiempo de la última sincronización
   */
  async setLastSyncTimestamp(isoTimestamp: string): Promise<void> {
    try {
      await localDB.settings_cache.put({
        key: 'last_catalog_sync',
        value: isoTimestamp,
        updated_at: Date.now()
      });
    } catch (e) {
      console.error('Error saving last_catalog_sync:', e);
    }
  }
};
