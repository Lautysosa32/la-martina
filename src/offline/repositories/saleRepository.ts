import { localDB } from '../db';
import { OfflineSale, OfflineSaleItem, SyncQueueItem } from '../types';
import { cajaManager } from '../cajaManager';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSaleInput {
  employee_id?: string;
  employee_name?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_dni?: string;
  payment_method: 'cash' | 'card' | 'transfer' | 'cuenta_corriente';
  payment_status?: 'Pagado' | 'Pendiente';
  items: OfflineSaleItem[];
  subtotal: number;
  discount_amount: number;
  discount_label?: string;
  total: number;
  ticket_number?: string;
  is_offline: boolean;
}

export const saleRepository = {
  /**
   * Registra una venta atómica en la base de datos local.
   * Genera el sale_id inmutable y canonical (POS-CAJA01-...).
   * Descuenta stock en Dexie y encola la operación para Supabase.
   */
  async createSale(input: CreateSaleInput): Promise<OfflineSale> {
    const cajaId = cajaManager.getCajaIdSync();
    const saleId = cajaManager.generateSaleId();
    const now = new Date();
    const timestamp = now.getTime();
    const createdAtIso = now.toISOString();

    const sale: OfflineSale = {
      sale_id: saleId,
      caja_id: cajaId,
      sync_status: 'pending_sync',
      created_at: createdAtIso,
      timestamp,
      employee_id: input.employee_id,
      employee_name: input.employee_name,
      customer_id: input.customer_id,
      customer_name: input.customer_name || 'Cliente Local',
      customer_phone: input.customer_phone || '',
      customer_dni: input.customer_dni,
      payment_method: input.payment_method,
      payment_status: input.payment_status || (input.payment_method === 'cuenta_corriente' ? 'Pendiente' : 'Pagado'),
      items: input.items,
      subtotal: input.subtotal,
      discount_amount: input.discount_amount,
      discount_label: input.discount_label,
      total: input.total,
      ticket_number: input.ticket_number || saleId,
      is_offline: input.is_offline
    };

    const queueItem: SyncQueueItem = {
      id: `SYNC-${uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      caja_id: cajaId,
      operation_type: 'SALE',
      entity_id: saleId,
      payload: sale,
      status: 'pending_sync',
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    };

    // Transacción atómica en IndexedDB
    await localDB.transaction('rw', [localDB.offline_sales, localDB.products, localDB.customers_cache, localDB.sync_queue], async () => {
      // 1. Guardar la venta definitiva
      await localDB.offline_sales.put(sale);

      // 2. Descontar stock local para cada ítem
      for (const item of sale.items) {
        if (item.productId && item.productId !== 'PRODUCTO_COMUN' && item.productId !== 'COMUN') {
          const prod = await localDB.products.get(item.productId);
          if (prod) {
            prod.stock = (prod.stock ?? 0) - item.quantity;
            prod.updated_at = createdAtIso;
            await localDB.products.put(prod);
          }
        }
      }

      // 3. Si es Cuenta Corriente, actualizar la deuda local del cliente
      if (sale.payment_method === 'cuenta_corriente' && sale.customer_phone) {
        const customer = await localDB.customers_cache.where('phone').equals(sale.customer_phone).first();
        if (customer) {
          customer.currentDebt = (customer.currentDebt || 0) + sale.total;
          customer.updated_at = createdAtIso;
          await localDB.customers_cache.put(customer);
        }
      }

      // 4. Encolar en la cola de sincronización
      await localDB.sync_queue.put(queueItem);
    });

    return sale;
  },

  /**
   * Obtiene todas las ventas pendientes de sincronizar
   */
  async getPendingSales(): Promise<OfflineSale[]> {
    try {
      return await localDB.offline_sales.where('sync_status').equals('pending_sync').toArray();
    } catch (err) {
      console.error('Error fetching pending sales:', err);
      return [];
    }
  },

  /**
   * Obtiene una venta local por su sale_id
   */
  async getSaleById(saleId: string): Promise<OfflineSale | undefined> {
    try {
      return await localDB.offline_sales.get(saleId);
    } catch (err) {
      console.error('Error fetching sale by id:', err);
      return undefined;
    }
  },

  /**
   * Marca una venta como sincronizada
   */
  async markSaleAsSynced(saleId: string): Promise<void> {
    try {
      await localDB.offline_sales.update(saleId, {
        sync_status: 'synced',
        synced_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error marking sale as synced:', err);
    }
  },

  /**
   * Marca una venta con conflicto o error
   */
  async markSaleAsConflict(saleId: string, errorMsg: string): Promise<void> {
    try {
      await localDB.offline_sales.update(saleId, {
        sync_status: 'conflict',
        error_message: errorMsg
      });
    } catch (err) {
      console.error('Error marking sale as conflict:', err);
    }
  },

  /**
   * Obtiene las ventas locales realizadas a partir de un timestamp
   * (usado para computar el cierre de caja local de esa sesión)
   */
  async getSalesSince(timestamp: number, cajaId?: string): Promise<OfflineSale[]> {
    try {
      const activeCaja = cajaId || cajaManager.getCajaIdSync();
      const all = await localDB.offline_sales
        .where('caja_id')
        .equals(activeCaja)
        .toArray();
      
      return all.filter(s => s.timestamp >= timestamp);
    } catch (err) {
      console.error('Error fetching sales since timestamp:', err);
      return [];
    }
  }
};
