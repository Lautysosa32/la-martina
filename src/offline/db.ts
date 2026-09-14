import Dexie, { Table } from 'dexie';
import {
  LocalProduct,
  OfflineSale,
  OfflineCashMovement,
  OfflineCashClose,
  LocalCustomer,
  LocalOffer,
  SyncQueueItem,
  SyncConflict,
  CajaConfig
} from './types';

export class LaMartinaDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  offline_sales!: Table<OfflineSale, string>;
  offline_cash_movements!: Table<OfflineCashMovement, string>;
  offline_cash_closes!: Table<OfflineCashClose, string>;
  customers_cache!: Table<LocalCustomer, string>;
  offers_cache!: Table<LocalOffer, string>;
  settings_cache!: Table<{ key: string; value: any; updated_at: number }, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  sync_conflicts!: Table<SyncConflict, string>;
  caja_config!: Table<CajaConfig, string>;

  constructor() {
    super('LaMartinaPOS_DB');

    // Schema version 1
    this.version(1).stores({
      products: 'id, barcode, name, category_id, subcategory_id, updated_at, deleted_at, active',
      offline_sales: 'sale_id, caja_id, created_at, customer_phone, customer_dni, payment_method, sync_status',
      offline_cash_movements: 'id, caja_id, timestamp, type, sync_status',
      offline_cash_closes: 'id, caja_id, date, sync_status',
      customers_cache: 'id, phone, dni, name',
      offers_cache: 'id, active',
      settings_cache: 'key, updated_at',
      sync_queue: 'id, caja_id, status, operation_type, entity_id, created_at',
      sync_conflicts: 'id, caja_id, entity_type, entity_id, resolved, created_at',
      caja_config: 'key'
    });
  }
}

export const localDB = new LaMartinaDatabase();
