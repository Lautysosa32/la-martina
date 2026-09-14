import { localDB } from './db';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'la_martina_caja_id';
const DEFAULT_CAJA_ID = 'CAJA-01';

class CajaManager {
  private currentCajaId: string = DEFAULT_CAJA_ID;
  private initialized: boolean = false;

  async init(): Promise<string> {
    if (this.initialized) return this.currentCajaId;

    try {
      // 1. Try IndexedDB
      const record = await localDB.caja_config.get('caja_id');
      if (record && record.value) {
        this.currentCajaId = String(record.value).trim().toUpperCase();
        localStorage.setItem(STORAGE_KEY, this.currentCajaId);
        this.initialized = true;
        return this.currentCajaId;
      }

      // 2. Try localStorage fallback
      const lsValue = localStorage.getItem(STORAGE_KEY);
      if (lsValue) {
        this.currentCajaId = lsValue.trim().toUpperCase();
        await localDB.caja_config.put({ key: 'caja_id', value: this.currentCajaId, updated_at: Date.now() });
        this.initialized = true;
        return this.currentCajaId;
      }

      // 3. Default to CAJA-01
      this.currentCajaId = DEFAULT_CAJA_ID;
      await this.setCajaId(DEFAULT_CAJA_ID);
      this.initialized = true;
      return this.currentCajaId;
    } catch (err) {
      console.warn('Error reading caja_config from IndexedDB, using localStorage or default:', err);
      const lsValue = localStorage.getItem(STORAGE_KEY) || DEFAULT_CAJA_ID;
      this.currentCajaId = lsValue.trim().toUpperCase();
      this.initialized = true;
      return this.currentCajaId;
    }
  }

  getCajaIdSync(): string {
    if (!this.initialized) {
      const lsValue = localStorage.getItem(STORAGE_KEY);
      if (lsValue) return lsValue.trim().toUpperCase();
    }
    return this.currentCajaId;
  }

  async getCajaId(): Promise<string> {
    await this.init();
    return this.currentCajaId;
  }

  async setCajaId(newId: string): Promise<void> {
    const cleanId = newId.trim().toUpperCase() || DEFAULT_CAJA_ID;
    this.currentCajaId = cleanId;
    localStorage.setItem(STORAGE_KEY, cleanId);
    try {
      await localDB.caja_config.put({
        key: 'caja_id',
        value: cleanId,
        updated_at: Date.now()
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('caja-id-changed', { detail: cleanId }));
      }
    } catch (e) {
      console.error('Error saving caja_id to IndexedDB:', e);
    }
  }

  /**
   * Generates canonical, collision-free sale ID:
   * Format: POS-{CAJA_ID}-{TIMESTAMP_SECONDS}-{SHORT_UUID}
   * Example: POS-CAJA01-1725750000-A8F9
   */
  generateSaleId(): string {
    const cajaId = this.getCajaIdSync().replace(/[^A-Z0-9]/g, '');
    const timestampSec = Math.floor(Date.now() / 1000);
    const shortRandom = uuidv4().replace(/-/g, '').substring(0, 4).toUpperCase();
    return `POS-${cajaId}-${timestampSec}-${shortRandom}`;
  }

  /**
   * Generates canonical cash movement ID
   */
  generateMovementId(): string {
    const cajaId = this.getCajaIdSync().replace(/[^A-Z0-9]/g, '');
    const timestampSec = Math.floor(Date.now() / 1000);
    const shortRandom = uuidv4().replace(/-/g, '').substring(0, 4).toUpperCase();
    return `MOV-${cajaId}-${timestampSec}-${shortRandom}`;
  }

  /**
   * Generates canonical cash close ID
   */
  generateCloseId(): string {
    const cajaId = this.getCajaIdSync().replace(/[^A-Z0-9]/g, '');
    const timestampSec = Math.floor(Date.now() / 1000);
    const shortRandom = uuidv4().replace(/-/g, '').substring(0, 4).toUpperCase();
    return `CLOSE-${cajaId}-${timestampSec}-${shortRandom}`;
  }
}

export const cajaManager = new CajaManager();
