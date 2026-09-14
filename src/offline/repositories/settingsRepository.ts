import { localDB } from '../db';

export const settingsRepository = {
  /**
   * Obtiene una configuración localmente
   */
  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const record = await localDB.settings_cache.get(key);
      if (record && record.value !== undefined) {
        return record.value as T;
      }
      return defaultValue;
    } catch (err) {
      console.warn(`Error reading setting "${key}" from local cache:`, err);
      return defaultValue;
    }
  },

  /**
   * Guarda una configuración localmente
   */
  async setSetting<T>(key: string, value: T): Promise<void> {
    try {
      await localDB.settings_cache.put({
        key,
        value,
        updated_at: Date.now()
      });
    } catch (err) {
      console.error(`Error saving setting "${key}" to local cache:`, err);
    }
  },

  /**
   * Guarda múltiples configuraciones en un solo lote
   */
  async saveSettingsMap(settingsMap: Record<string, any>): Promise<void> {
    try {
      const entries = Object.entries(settingsMap).map(([key, value]) => ({
        key,
        value,
        updated_at: Date.now()
      }));
      await localDB.settings_cache.bulkPut(entries);
    } catch (err) {
      console.error('Error bulk saving settings to local cache:', err);
    }
  }
};
