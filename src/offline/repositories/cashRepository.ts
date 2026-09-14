import { localDB } from '../db';
import { OfflineCashMovement, OfflineCashClose, SyncQueueItem } from '../types';
import { cajaManager } from '../cajaManager';
import { v4 as uuidv4 } from 'uuid';

export interface CreateMovementInput {
  type: 'Ingreso' | 'Egreso' | 'Retiro';
  description: string;
  cashier: string;
  amount: number;
  order_id?: string;
  timestamp?: number;
}

export interface CreateCashCloseInput {
  date: string;
  period: 'diario' | 'semanal' | 'mensual';
  total_sales: number;
  total_orders: number;
  cash_payments: number;
  card_payments: number;
  transfer_payments: number;
  cuenta_corriente_payments: number;
  initial_amount: number;
  total_withdrawals: number;
  closed_at: string;
  closed_by: string;
  pending_sync_count: number;
  withdrawals: Array<{ amount: number; reason: string; timestamp: number }>;
}

export const cashRepository = {
  /**
   * Registra un movimiento de caja local y lo encola para sincronizar
   */
  async addCashMovement(input: CreateMovementInput): Promise<OfflineCashMovement> {
    const cajaId = cajaManager.getCajaIdSync();
    const movementId = cajaManager.generateMovementId();
    const now = new Date();
    const timestamp = input.timestamp || now.getTime();

    const movement: OfflineCashMovement = {
      id: movementId,
      caja_id: cajaId,
      type: input.type,
      description: input.description,
      cashier: input.cashier || 'Cajero',
      amount: input.amount,
      timestamp,
      order_id: input.order_id,
      sync_status: 'pending_sync',
      created_at: now.toISOString()
    };

    const queueItem: SyncQueueItem = {
      id: `SYNC-${uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      caja_id: cajaId,
      operation_type: 'CASH_MOVEMENT',
      entity_id: movementId,
      payload: movement,
      status: 'pending_sync',
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    };

    await localDB.transaction('rw', [localDB.offline_cash_movements, localDB.sync_queue], async () => {
      await localDB.offline_cash_movements.put(movement);
      await localDB.sync_queue.put(queueItem);
    });

    return movement;
  },

  /**
   * Registra un cierre de caja local y lo encola para reconciliación
   */
  async createCashClose(input: CreateCashCloseInput): Promise<OfflineCashClose> {
    const cajaId = cajaManager.getCajaIdSync();
    const closeId = cajaManager.generateCloseId();
    const now = new Date();

    const close: OfflineCashClose = {
      id: closeId,
      caja_id: cajaId,
      date: input.date,
      period: input.period,
      total_sales: input.total_sales,
      total_orders: input.total_orders,
      cash_payments: input.cash_payments,
      card_payments: input.card_payments,
      transfer_payments: input.transfer_payments,
      cuenta_corriente_payments: input.cuenta_corriente_payments,
      initial_amount: input.initial_amount,
      total_withdrawals: input.total_withdrawals,
      closed_at: input.closed_at || now.toISOString(),
      closed_by: input.closed_by || 'Cajero',
      pending_sync_count: input.pending_sync_count,
      withdrawals: input.withdrawals,
      sync_status: 'pending_sync'
    };

    const queueItem: SyncQueueItem = {
      id: `SYNC-${uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      caja_id: cajaId,
      operation_type: 'CASH_CLOSE',
      entity_id: closeId,
      payload: close,
      status: 'pending_sync',
      retry_count: 0,
      created_at: now.getTime(),
      updated_at: now.getTime()
    };

    await localDB.transaction('rw', [localDB.offline_cash_closes, localDB.sync_queue], async () => {
      await localDB.offline_cash_closes.put(close);
      await localDB.sync_queue.put(queueItem);
    });

    return close;
  },

  /**
   * Obtiene movimientos locales registrados desde un timestamp
   */
  async getMovementsSince(timestamp: number, cajaId?: string): Promise<OfflineCashMovement[]> {
    try {
      const activeCaja = cajaId || cajaManager.getCajaIdSync();
      const all = await localDB.offline_cash_movements
        .where('caja_id')
        .equals(activeCaja)
        .toArray();

      return all.filter(m => m.timestamp >= timestamp);
    } catch (err) {
      console.error('Error fetching cash movements since timestamp:', err);
      return [];
    }
  },

  /**
   * Obtiene todos los movimientos pendientes de sincronizar
   */
  async getPendingMovements(): Promise<OfflineCashMovement[]> {
    try {
      return await localDB.offline_cash_movements.where('sync_status').equals('pending_sync').toArray();
    } catch (err) {
      console.error('Error fetching pending movements:', err);
      return [];
    }
  },

  /**
   * Marca un movimiento como sincronizado
   */
  async markMovementAsSynced(movementId: string): Promise<void> {
    try {
      await localDB.offline_cash_movements.update(movementId, {
        sync_status: 'synced',
        synced_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error marking movement as synced:', err);
    }
  },

  /**
   * Marca un cierre como reconciliado y sincronizado
   */
  async markCloseAsSynced(closeId: string): Promise<void> {
    try {
      await localDB.offline_cash_closes.update(closeId, {
        sync_status: 'synced',
        reconciled_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error marking close as synced:', err);
    }
  }
};
