import { localDB } from './db';
import { syncQueue } from './syncQueue';
import { connectionMonitor } from './connectionMonitor';
import { cajaManager } from './cajaManager';
import { saleRepository } from './repositories/saleRepository';
import { cashRepository } from './repositories/cashRepository';
import { productRepository } from './repositories/productRepository';
import { customerRepository } from './repositories/customerRepository';
import { supabase } from '../lib/supabase';
import { LocalProduct, LocalCustomer, SyncConflict, SyncQueueItem } from './types';
import { v4 as uuidv4 } from 'uuid';

type SyncListener = (syncing: boolean, pendingCount: number, error?: string) => void;

class SyncEngine {
  private isSyncing: boolean = false;
  private listeners: Set<SyncListener> = new Set();
  private autoSyncTimer: any = null;
  private isStarted: boolean = false;

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    // Iniciar monitor de conexión
    connectionMonitor.start(10000);

    // Escuchar cambios de conexión para sincronizar de inmediato
    connectionMonitor.subscribe((online, reachable) => {
      if (online && reachable) {
        this.syncNow().catch(err => console.error('Error in auto sync on reconnect:', err));
      }
    });

    // Bucle periódico cada 30 segundos
    this.autoSyncTimer = setInterval(() => {
      if (connectionMonitor.isHealthy() && !this.isSyncing) {
        this.syncNow().catch(err => console.error('Error in periodic sync:', err));
      }
    }, 30000);

    // Ejecutar una primera sincronización inicial tras 2 segundos de arranque
    setTimeout(() => {
      if (connectionMonitor.isHealthy()) {
        this.syncNow().catch(err => console.error('Initial sync error:', err));
      }
    }, 2000);
  }

  stop() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    connectionMonitor.stop();
    this.isStarted = false;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(syncing: boolean, pendingCount: number, error?: string) {
    this.listeners.forEach(fn => {
      try {
        fn(syncing, pendingCount, error);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }

  /**
   * Ejecuta un ciclo completo de sincronización:
   * 1. Push: Envía operaciones locales pendientes a Supabase.
   * 2. Pull: Descarga deltas de productos, ofertas y clientes.
   */
  async syncNow(): Promise<void> {
    if (this.isSyncing) return;
    if (!connectionMonitor.isHealthy()) return;

    this.isSyncing = true;
    let pendingCount = await syncQueue.getPendingCount();
    this.notify(true, pendingCount);

    try {
      // 1. PUSH: Procesar cola de operaciones locales hacia Supabase
      await this.processPushQueue();

      // 2. PULL: Descargar actualizaciones desde Supabase hacia IndexedDB
      await this.pullUpdatesFromSupabase();

      pendingCount = await syncQueue.getPendingCount();
      this.notify(false, pendingCount);
    } catch (err: any) {
      console.error('Error during synchronization cycle:', err);
      pendingCount = await syncQueue.getPendingCount();
      this.notify(false, pendingCount, err.message || 'Error de sincronización');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Procesa la cola de operaciones locales en orden FIFO estricto
   */
  private async processPushQueue(): Promise<void> {
    let hasMore = true;
    let maxBatch = 50; // Seguridad para no quedar en loop infinito

    while (hasMore && maxBatch > 0) {
      maxBatch--;
      const item = await syncQueue.getNextPendingItem();
      if (!item) {
        hasMore = false;
        break;
      }

      // Si tiene más de 10 reintentos, marcar como failed
      if (item.retry_count >= 10) {
        await syncQueue.markStatus(item.id, 'failed', 'Límite de 10 reintentos superado.');
        continue;
      }

      await syncQueue.markStatus(item.id, 'syncing');

      try {
        if (item.operation_type === 'SALE') {
          await this.syncSaleItem(item);
        } else if (item.operation_type === 'CASH_MOVEMENT') {
          await this.syncMovementItem(item);
        } else if (item.operation_type === 'CASH_CLOSE') {
          await this.syncCloseItem(item);
        }

        // Si tuvo éxito, eliminar de la cola
        await syncQueue.removeItem(item.id);
      } catch (err: any) {
        console.error(`Error syncing item ${item.id} (${item.operation_type}):`, err);
        const errMsg = err.message || JSON.stringify(err);
        await syncQueue.markStatus(item.id, 'pending_sync', errMsg);
        // Si falló por desconexión repentina, interrumpir el lote
        if (!connectionMonitor.isHealthy()) {
          hasMore = false;
        }
      }
    }
  }

  /**
   * Sincroniza una venta local hacia Supabase
   */
  private async syncSaleItem(item: SyncQueueItem): Promise<void> {
    const sale = item.payload;
    const cajaId = item.caja_id || cajaManager.getCajaIdSync();

    // Estructura para el RPC de Supabase
    const payload = {
      id: sale.sale_id,
      caja_id: cajaId,
      user_id: null,
      customer_name: sale.customer_name,
      customer_email: null,
      customer_phone: sale.customer_phone,
      total: sale.total,
      payment_method: sale.payment_method,
      items: sale.items.map((it: any) => ({
        product_id: it.productId,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        sale_type: it.saleType,
        barcode: it.productCode
      })),
      branch_id: 'main',
      employee_id: sale.employee_id,
      cashier: sale.employee_name || 'Cajero',
      timestamp: sale.timestamp,
      created_at: sale.created_at,
      is_offline: true
    };

    // 1. Intentar con RPC v2 (idempotente y con soporte de caja_id)
    let rpcRes = await supabase.rpc('process_pos_sale_v2', { p_sale: payload });

    // 2. Si el RPC v2 no está desplegado, intentar con el RPC anterior
    if (rpcRes.error && rpcRes.error.message?.includes('function process_pos_sale_v2')) {
      console.warn('process_pos_sale_v2 not found, falling back to process_pos_sale');
      rpcRes = await supabase.rpc('process_pos_sale', { p_sale: payload });
    }

    // 3. Si ambos RPCs fallan, usar inserción directa en tablas (idempotente verificando si existe)
    if (rpcRes.error) {
      console.warn('RPC failed, falling back to direct Supabase insert:', rpcRes.error);
      await this.syncSaleDirectInsert(sale, payload);
    }

    // Marcar la venta local como sincronizada
    await saleRepository.markSaleAsSynced(sale.sale_id);
  }

  /**
   * Fallback de inserción directa a Supabase
   */
  private async syncSaleDirectInsert(sale: any, payload: any): Promise<void> {
    // A. Comprobar si la orden ya existe (idempotencia)
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('id', sale.sale_id)
      .maybeSingle();

    if (existing) {
      // Ya existe en servidor, no duplicar
      return;
    }

    // B. Insertar en orders
    const { error: orderErr } = await supabase.from('orders').insert({
      id: sale.sale_id,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      total: sale.total,
      status: 'Entregado',
      payment_status: sale.payment_method === 'cuenta_corriente' ? 'Pendiente' : 'Pagado',
      payment_method: sale.payment_method,
      items: payload.items,
      created_at: sale.created_at,
      origin: 'caja',
      branch_id: 'main',
      employee_id: sale.employee_id,
      shipping_address: 'Compra en local'
    });

    if (orderErr) throw orderErr;

    // C. Si fue efectivo, insertar en cash_movements
    if (sale.payment_method === 'cash') {
      await supabase.from('cash_movements').insert({
        branch_id: 'main',
        type: 'Ingreso',
        description: `Venta Local #${sale.sale_id}`,
        cashier: sale.employee_name || 'Cajero',
        amount: sale.total,
        order_id: sale.sale_id,
        timestamp: sale.timestamp
      });
    }

    // D. Descontar stock en Supabase
    for (const item of sale.items) {
      if (item.productId && item.productId !== 'PRODUCTO_COMUN' && item.productId !== 'COMUN') {
        const { data: currentProd } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.productId)
          .maybeSingle();

        if (currentProd) {
          const newStock = (currentProd.stock ?? 0) - item.quantity;
          await supabase.from('products').update({ stock: newStock }).eq('id', item.productId);
        }
      }
    }
  }

  /**
   * Sincroniza un movimiento manual de caja hacia Supabase
   */
  private async syncMovementItem(item: SyncQueueItem): Promise<void> {
    const mov = item.payload;

    // Chequear si ya existe por ID
    const { data: existing } = await supabase
      .from('cash_movements')
      .select('id')
      .eq('id', mov.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('cash_movements').insert({
        id: mov.id,
        branch_id: 'main',
        type: mov.type,
        description: mov.description,
        cashier: mov.cashier,
        amount: mov.amount,
        timestamp: mov.timestamp,
        order_id: mov.order_id
      });
      if (error) throw error;
    }

    await cashRepository.markMovementAsSynced(mov.id);
  }

  /**
   * Sincroniza un cierre de caja hacia Supabase
   */
  private async syncCloseItem(item: SyncQueueItem): Promise<void> {
    const close = item.payload;

    const { data: existing } = await supabase
      .from('cash_closes')
      .select('id')
      .eq('id', close.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('cash_closes').insert({
        id: close.id,
        branch_id: 'main',
        date: close.date,
        period: close.period,
        total_sales: close.total_sales,
        total_orders: close.total_orders,
        cash_payments: close.cash_payments,
        card_payments: close.card_payments,
        transfer_payments: close.transfer_payments,
        cuenta_corriente_payments: close.cuenta_corriente_payments,
        initial_amount: close.initial_amount,
        total_withdrawals: close.total_withdrawals,
        closed_at: close.closed_at,
        withdrawals: close.withdrawals
      });
      if (error) throw error;
    }

    await cashRepository.markCloseAsSynced(close.id);
  }

  /**
   * Descarga actualizaciones incrementales desde Supabase hacia IndexedDB
   */
  private async pullUpdatesFromSupabase(): Promise<void> {
    await Promise.allSettled([
      this.pullProductsIncremental(),
      this.pullCustomers(),
      this.pullOffers()
    ]);
  }

  /**
   * Columnas estrictas e indispensables para la operación offline del POS
   * Evita transferir campos pesados innecesarios y reduce drásticamente el Egress
   */
  static readonly POS_PRODUCT_COLUMNS = 'id, branch_id, barcode, name, brand, category_id, subcategory_id, price, original_price, stock, min_stock, format, sale_type, is_paused, discount, badge, is_new, updated_at, deleted_at';

  /**
   * Sincronización diferencial (Delta Sync) del catálogo para el POS
   * - Si existe last_sync_at: pide ÚNICAMENTE los modificados (.gt('updated_at', lastSync))
   * - Si no existe (primer inicio): descarga en bloques de 1,000 con .range() para soportar 10,400+ registros
   * - Aplica Selección Estricta de columnas para minimizar el consumo de datos
   */
  async pullProductsIncremental(forceFull: boolean = false): Promise<void> {
    const syncStartTime = new Date().toISOString();
    try {
      const lastSync = await productRepository.getLastSyncTimestamp();
      const isDelta = !forceFull && Boolean(lastSync);

      if (isDelta) {
        // --- DELTA SYNC: Solo registros modificados desde la última sincronización ---
        const { data: remoteProducts, error } = await supabase
          .from('products')
          .select(SyncEngine.POS_PRODUCT_COLUMNS)
          .gt('updated_at', lastSync!);

        if (error) {
          console.error('❌ Error en Delta Sync de productos desde Supabase:', error);
          return;
        }

        if (remoteProducts && remoteProducts.length > 0) {
          const localItems: LocalProduct[] = remoteProducts.map(this.mapRemoteToLocalProduct);
          await productRepository.saveProducts(localItems);
          console.log(`⚡ [Delta Sync] ${localItems.length} productos actualizados en IndexedDB.`);
        } else {
          console.log('⚡ [Delta Sync] Catálogo local al día (0 productos modificados).');
        }
      } else {
        // --- FULL SYNC: Sincronización completa por bloques de 1,000 con .range() ---
        console.log('📦 [Full Sync] Descargando catálogo completo por bloques con selección estricta...');
        const BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;
        let totalCount = 0;

        while (hasMore) {
          const { data: batch, error } = await supabase
            .from('products')
            .select(SyncEngine.POS_PRODUCT_COLUMNS)
            .range(offset, offset + BATCH_SIZE - 1)
            .order('id', { ascending: true });

          if (error) {
            console.error(`❌ Error al descargar bloque de catálogo en offset ${offset}:`, error);
            break;
          }

          if (batch && batch.length > 0) {
            const localItems: LocalProduct[] = batch.map(this.mapRemoteToLocalProduct);
            await productRepository.saveProducts(localItems);
            totalCount += localItems.length;
            offset += BATCH_SIZE;
            if (batch.length < BATCH_SIZE) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
        console.log(`✅ [Full Sync] Catálogo sincronizado: ${totalCount} productos guardados en IndexedDB.`);
      }

      // Guardar marca de tiempo de sincronización exitosa
      await productRepository.setLastSyncTimestamp(syncStartTime);
    } catch (err) {
      console.error('Error en pullProductsIncremental:', err);
    }
  }

  private mapRemoteToLocalProduct(p: any): LocalProduct {
    return {
      id: p.id,
      branch_id: p.branch_id,
      name: p.name || '',
      brand: p.brand || '',
      category_id: p.category_id || '',
      subcategory_id: p.subcategory_id || null,
      price: Number(p.price || 0),
      original_price: p.original_price ? Number(p.original_price) : null,
      barcode: p.barcode ? String(p.barcode).trim() : null,
      image: p.image || '',
      format: p.format || null,
      stock: Number(p.stock ?? 0),
      min_stock: Number(p.min_stock ?? 0),
      sale_type: p.sale_type === 'weight' || p.saleType === 'weight' ? 'weight' : 'unit',
      discount: p.discount ? String(p.discount) : null,
      badge: p.badge || null,
      is_new: Boolean(p.is_new),
      active: p.deleted_at ? false : true,
      is_paused: Boolean(p.is_paused),
      updated_at: p.updated_at || new Date().toISOString(),
      deleted_at: p.deleted_at || null
    };
  }

  /**
   * Sincronización de clientes
   */
  private async pullCustomers(): Promise<void> {
    try {
      const { data, error } = await supabase.from('customer_profiles').select('*');
      if (error || !data) return;

      const customers: LocalCustomer[] = data.map((c: any) => ({
        id: c.id,
        name: c.name || '',
        phone: c.phone || '',
        dni: c.dni || '',
        email: c.email || '',
        address: c.address || '',
        hasCurrentAccount: Boolean(c.hasCurrentAccount),
        creditLimit: Number(c.creditLimit || 50000),
        customDebtLimit: c.customDebtLimit ? Number(c.customDebtLimit) : null,
        customDebtDays: c.customDebtDays ? Number(c.customDebtDays) : null,
        useCustomAccountLimits: Boolean(c.useCustomAccountLimits),
        currentDebt: 0, // Se complementa con las órdenes pendientes
        active: c.active !== false,
        updated_at: c.updated_at || new Date().toISOString()
      }));

      // Calcular deuda actual de cada cliente en base a órdenes impagas en Supabase
      const { data: unpaidOrders } = await supabase
        .from('orders')
        .select('phone, total, paid_amount')
        .eq('payment_method', 'cuenta_corriente')
        .neq('payment_status', 'Pagado')
        .neq('status', 'Cancelado');

      if (unpaidOrders) {
        const debtMap: Record<string, number> = {};
        unpaidOrders.forEach((o: any) => {
          const clientPhone = o.phone || o.customer_phone;
          if (clientPhone) {
            const debt = Number(o.total || 0) - Number(o.paid_amount || 0);
            debtMap[clientPhone] = (debtMap[clientPhone] || 0) + debt;
          }
        });
        customers.forEach(c => {
          if (debtMap[c.phone]) {
            c.currentDebt = debtMap[c.phone];
          }
        });
      }

      await customerRepository.saveCustomers(customers);
    } catch (err) {
      console.error('Error pulling customers from Supabase:', err);
    }
  }

  /**
   * Sincronización de ofertas activas
   */
  private async pullOffers(): Promise<void> {
    try {
      const { data, error } = await supabase.from('offers').select('*').eq('active', true);
      if (error || !data) return;

      const offers = data.map((o: any) => ({
        id: o.id,
        title: o.title || '',
        description: o.description || '',
        discount_percentage: Number(o.discount_percentage || 0),
        active: Boolean(o.active),
        valid_until: o.valid_until,
        updated_at: o.updated_at || new Date().toISOString()
      }));

      await localDB.offers_cache.clear();
      await localDB.offers_cache.bulkPut(offers);
    } catch (err) {
      console.error('Error pulling offers from Supabase:', err);
    }
  }

  /**
   * Registra un conflicto en la base local y en Supabase
   */
  async recordConflict(conflict: Omit<SyncConflict, 'id' | 'created_at'>): Promise<void> {
    const id = `CONF-${uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const fullConflict: SyncConflict = {
      id,
      created_at: createdAt,
      ...conflict
    };

    try {
      await localDB.sync_conflicts.put(fullConflict);
      if (connectionMonitor.isHealthy()) {
        await supabase.from('sync_conflicts').insert({
          id: fullConflict.id,
          caja_id: fullConflict.caja_id,
          entity_type: fullConflict.entity_type,
          entity_id: fullConflict.entity_id,
          conflict_type: fullConflict.conflict_type,
          details: fullConflict.details,
          resolved: fullConflict.resolved,
          created_at: fullConflict.created_at
        });
      }
    } catch (err) {
      console.error('Error recording sync conflict:', err);
    }
  }
}

export const syncEngine = new SyncEngine();
