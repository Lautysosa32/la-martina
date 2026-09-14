import { localDB } from './db';
import { SyncQueueItem, SyncStatus } from './types';

export const notifyQueueChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  }
};

export const syncQueue = {
  /**
   * Encola una operación en la cola persistente
   */
  async enqueue(item: SyncQueueItem): Promise<void> {
    try {
      await localDB.sync_queue.put(item);
      notifyQueueChanged();
    } catch (err) {
      console.error('Error enqueuing item:', err);
    }
  },

  /**
   * Obtiene el elemento pendiente más antiguo para procesar (FIFO)
   */
  async getNextPendingItem(cajaId?: string): Promise<SyncQueueItem | undefined> {
    try {
      let query = localDB.sync_queue.where('status').equals('pending_sync');
      if (cajaId) {
        query = localDB.sync_queue
          .where('caja_id')
          .equals(cajaId)
          .filter(item => item.status === 'pending_sync');
      }
      return await query.sortBy('created_at').then(items => items[0]);
    } catch (err) {
      console.error('Error getting next pending item:', err);
      return undefined;
    }
  },

  /**
   * Cuenta los elementos pendientes de sincronizar
   */
  async getPendingCount(cajaId?: string): Promise<number> {
    try {
      if (cajaId) {
        return await localDB.sync_queue
          .where('caja_id')
          .equals(cajaId)
          .filter(item => item.status === 'pending_sync' || item.status === 'syncing')
          .count();
      }
      return await localDB.sync_queue
        .where('status')
        .equals('pending_sync')
        .or('status')
        .equals('syncing')
        .count();
    } catch (err) {
      console.error('Error getting pending count:', err);
      return 0;
    }
  },

  /**
   * Actualiza el estado de un elemento en la cola
   */
  async markStatus(id: string, status: SyncStatus, error?: string): Promise<void> {
    try {
      const item = await localDB.sync_queue.get(id);
      if (item) {
        item.status = status;
        item.updated_at = Date.now();
        if (error) {
          item.last_error = error;
          item.retry_count = (item.retry_count || 0) + 1;
        }
        await localDB.sync_queue.put(item);
        notifyQueueChanged();
      }
    } catch (err) {
      console.error(`Error updating status for queue item ${id}:`, err);
    }
  },

  /**
   * Elimina un elemento de la cola activa una vez que fue confirmado por el servidor
   */
  async removeItem(id: string): Promise<void> {
    try {
      await localDB.sync_queue.delete(id);
      notifyQueueChanged();
    } catch (err) {
      console.error(`Error removing queue item ${id}:`, err);
    }
  },

  /**
   * Obtiene todos los elementos en cola (para inspección y panel de estado)
   */
  async getAllItems(): Promise<SyncQueueItem[]> {
    try {
      return await localDB.sync_queue.toArray();
    } catch (err) {
      console.error('Error fetching all queue items:', err);
      return [];
    }
  },

  /**
   * Reinicia elementos fallidos para permitir reintento manual
   */
  async resetFailedItems(): Promise<void> {
    try {
      const failed = await localDB.sync_queue.where('status').equals('failed').toArray();
      for (const item of failed) {
        item.status = 'pending_sync';
        item.retry_count = 0;
        item.updated_at = Date.now();
        await localDB.sync_queue.put(item);
      }
      notifyQueueChanged();
    } catch (err) {
      console.error('Error resetting failed items:', err);
    }
  }
};
