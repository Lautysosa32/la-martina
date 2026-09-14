# PLAN DE ARQUITECTURA OFFLINE-FIRST: Martina Supermercado
**Documento Oficial de Especificación Técnica y Arquitectura de Datos**  
**Versión:** 2.0.0 (Actualizado con Decisiones de Negocio y Arquitectura Multi-Caja)  
**Fecha:** Septiembre 2026  
**Autor:** Senior Software & POS Systems Architect  

---

## 1. RESUMEN EJECUTIVO Y OBJETIVOS

Martina Supermercado requiere que su **Punto de Venta (POS / Caja)** funcione con disponibilidad ininterrumpida (**100% de operatividad**), garantizando que ante caídas totales de conectividad a Internet, micro-cortes, o indisponibilidad temporal de Supabase:
1. La caja continúe escaneando productos, calculando precios, aplicando promociones y cerrando ventas sin ninguna degradación de velocidad.
2. Las ventas y movimientos se persistan localmente en el dispositivo de forma duradera (resistente a cierres del navegador, reinicios del sistema operativo y cortes de energía).
3. Al restaurarse la conexión, todas las transacciones locales se sincronicen de manera automática, ordenada, transaccional e idempotente con Supabase.
4. Las ventas a Cuenta Corriente (fiados) y los cierres de caja locales se admitan durante el modo offline bajo estrictos protocolos de seguridad y auditoría.
5. El sistema soporte múltiples cajas físicas independientes desde el día uno (`CAJA-01`, `CAJA-02`, etc.) sin conflictos de concurrencia ni sobreescrituras de estado.
6. Ninguna funcionalidad existente del POS ni de la tienda web sufra regresiones.

---

## 2. LAS 5 DECISIONES ARQUITECTÓNICAS INCORPORADAS

### Decisión 1: Cuenta Corriente Offline (Venta a Crédito / Fiado)

* **Política**: **PERMITIDA** cuando la caja está offline, bajo controles de seguridad locales y auditoría posterior.
* **Condición de Venta Local**:
  - El cliente debe existir previamente en el catálogo local (`customers_cache` en IndexedDB).
  - La base local almacena el límite de crédito (`creditLimit` o `customDebtLimit`) y la deuda acumulada (`currentDebt`).
  - Si el cliente no existe en la base local, la venta a Cuenta Corriente offline se bloquea y se solicita medio de pago alternativo (efectivo, tarjeta o transferencia).
* **Advertencia Visual Obligatoria**:
  - Al seleccionar "Cuenta Corriente" en modo offline, la interfaz del POS despliega de forma prominente un banner de alerta contextual:
    > ⚠️ **Modo offline: el límite de crédito podría no estar actualizado.**
* **Registro Local**:
  - La venta se confirma y graba localmente con su identificador definitivo (`sale_id`), método `cuenta_corriente` y estado `sync_status = 'pending_sync'`.
  - La deuda local del cliente se incrementa optimísticamente en IndexedDB para que si el mismo cliente realiza una segunda compra en la misma sesión offline, se aplique el control con la deuda actualizada.
* **Reconciliación y Resolución de Conflictos al Reconectar**:
  - Al volver Internet, el SyncEngine envía la venta a Supabase.
  - El servidor valida la situación crediticia actual del cliente en Supabase.
  - **REGLA CRÍTICA**: Si el límite de crédito fue superado mientras la caja estaba offline o el cliente fue bloqueado administrativamente en el servidor:
    - **NUNCA se elimina ni se modifica silenciosamente la venta** (la mercadería ya fue retirada físicamente por el cliente y el ticket impreso es un comprobante legal).
    - La venta se registra con `sync_status = 'synced'` y se genera automáticamente una entrada en la tabla `sync_conflicts` con tipo `CREDIT_LIMIT_EXCEEDED` o `CUSTOMER_BLOCKED_OFFLINE_SALE`.
    - Esta entrada queda marcada para revisión y resolución formal por un usuario autorizado (administrador/supervisor) en el panel de auditoría.

---

### Decisión 2: Catálogo de Productos Completo y Sincronización Incremental

* **Política de Descarga**: Descargar **TODOS** los productos necesarios para operar.
  - **NO limitar a `stock > 0`**: Un producto con stock 0 puede recibir mercadería de reposición mientras la caja está offline, o un cajero puede necesitar registrar la venta física real existiendo mercadería en góndola.
* **Campos Mínimos Requeridos en Base Local**:
  - Búsqueda textual: `name`, `brand`, `format`.
  - Escaneo de códigos de barra: `barcode` (EAN-13, EAN-8 y códigos de balanza de peso).
  - Cálculo de precios y tipos de venta: `price`, `original_price`, `sale_type` (`'unit'` o `'weight'`).
  - Promociones y ofertas: `discount`, `badge`.
  - Clasificación: `category_id`, `subcategory_id`.
  - Estado: `active` / `is_active` y `deleted_at`.
* **Mecanismo de Sincronización**:
  1. **Sincronización Inicial (Bootstrap)**: Descarga el catálogo completo de productos mediante paginación eficiente de PostgREST y lo indexa en IndexedDB (Dexie.js).
  2. **Sincronización Incremental (Delta Sync)**: En cada reconexión o ciclo periódico posterior, consulta únicamente registros donde `updated_at > last_sync_timestamp`.
* **Análisis Real del Tamaño de la Tabla `products` e Impacto Operativo**:
  - **Métricas Reales Obtenidas Directamente de la Base de Datos**:
    * Cantidad actual de productos en catálogo: **100 productos**.
    * Peso del payload JSON completo de los 100 productos: **21.389 bytes (~20.9 KB)**.
    * Promedio por producto: **~210 bytes** (con proyección de columnas necesarias para POS).
  - **Proyección de Crecimiento y Escalabilidad**:
    * **1.000 productos**: ~210 KB de payload (tiempo de descarga en banda ancha: < 150 ms).
    * **5.000 productos**: ~1.05 MB de payload (tiempo de descarga en banda ancha: ~400 ms; en 4G: ~1.2 s).
    * **10.000 productos**: ~2.1 MB de payload (tiempo de descarga en banda ancha: ~800 ms).
  - **Impacto en Almacenamiento Local (IndexedDB)**:
    * El límite de almacenamiento de IndexedDB en navegadores modernos (Chromium / Edge / Chrome) es de **hasta el 60% del espacio libre en disco** (decenas de Gigabytes).
    * Ocupar 1 MB a 5 MB representa menos del **0.001%** del almacenamiento disponible en la PC del supermercado.
  - **Impacto en Memoria RAM**:
    * Mantener 5.000 productos indexados en IndexedDB consume prácticamente 0 MB de memoria principal, ya que IndexedDB utiliza lectura sobre disco (B-Tree). La memoria RAM de la aplicación solo cargará los productos que el cajero consulte o los índices en memoria de Dexie (< 8 MB).
  - **Impacto en Red y Egress de Supabase**:
    * La sincronización inicial consume solo **~21 KB** hoy y ~1 MB con 5.000 productos.
    * Con sincronización incremental mediante `updated_at`, cada chequeo rutinario transfiere **menos de 1 KB** si no hubo modificaciones en góndola.

---

### Decisión 3: Identificación de Caja y Arquitectura Multi-Caja

* **Soporte Multi-Terminal**: Diseñado desde el inicio para operar con 1, 2, 5 o más terminales físicas simultáneas sin colisiones.
* **Identificador Persistente de Caja**:
  - Cada terminal física posee un código unívoco e inmutable asignado en su instalación (ej: `CAJA-01`, `CAJA-02`, `CAJA-03`).
  - **Persistencia**: Se almacena en la tabla local `caja_config` de IndexedDB, complementado con una copia de respaldo en `localStorage` (`la_martina_caja_id`).
  - No cambia por reinicios de la aplicación, actualizaciones de software, cortes de energía o reinicios de Windows.
  - Si una terminal nueva abre el POS por primera vez y no tiene caja configurada, se presenta un asistente administrativo para seleccionar/asignar el identificador correspondiente.
* **Trazabilidad de Operaciones**:
  - Toda operación relevante incluye obligatoriamente:
    * `caja_id`: Identificador de la caja física (`'CAJA-01'`).
    * `employee_id`: ID del cajero/operador autenticado.
    * `employee_name`: Nombre visible del operador para auditoría rápida.
  - Operaciones etiquetadas:
    * Ventas (`orders.caja_id`)
    * Movimientos de dinero (`cash_movements.caja_id`)
    * Apertura y Cierre de caja (`cash_closes.caja_id`)
    * Elementos de la cola de sincronización (`sync_queue.caja_id`)
    * Conflictos de sincronización (`sync_conflicts.caja_id`)
* **Extensibilidad**: Agregar una segunda o tercera caja a futuro consiste únicamente en abrir el sistema en la nueva PC y nombrar la caja como `CAJA-02`. No se requiere ninguna modificación de base de datos ni migración adicional.

---

### Decisión 4: Cierre de Caja Offline y Reconciliación Auditada

* **Autonomía del Cierre Local**:
  - El cajero puede realizar el arqueo y cierre formal de su turno **aunque no haya conexión a Internet**.
  - No se bloquea ni se pospone el cierre físico de la caja.
* **Cálculo del Cierre Local**:
  - Se calcula a partir de **todas** las operaciones registradas localmente en esa terminal durante el turno:
    * Ventas totales
    * Desglose por medio de pago: Efectivo (`cash`), Tarjeta (`card`), Transferencia (`transfer`), Cuenta Corriente (`cuenta_corriente`)
    * Retiros y egresos de caja física
    * Fondo inicial de caja
    * Saldo esperado en efectivo
  - El cierre se genera con metadatos específicos:
    * `caja_id`: Identificador de la caja (ej: `CAJA-01`).
    * `pending_sync_count`: Cantidad de operaciones que estaban offline al momento de cerrar.
    * `sync_status`: `'PENDING_SYNC'`.
  - Se imprime el comprobante físico de cierre en la impresora térmica conteniendo estos datos exactos.
* **Protocolo de Reconciliación al Volver Conexión**:
  1. El SyncEngine sube primero todas las ventas y movimientos individuales pendientes de esa caja.
  2. Una vez confirmadas las transacciones individuales, se envía el registro del cierre (`cash_closes`) a Supabase.
  3. El servidor verifica que las ventas y movimientos asociados correspondan a la caja y turno.
  4. El estado del cierre en Supabase se actualiza a `'SYNCED'` con fecha de reconciliación (`reconciled_at`).
  5. **Garantía Histórica**: **NUNCA se modifican silenciosamente los números del cierre local**. El cierre representa la verdad histórica de lo que ocurrió en la caja física en ese momento exacto. Si el recálculo en servidor difiere por cualquier motivo externo, se levanta un registro en `sync_conflicts` para auditoría administrativa.

---

### Decisión 5: Separación Conceptual entre `sale_id` y `sync_status`

* **Principio Ontológico**:
  > **La venta EXISTE y es VÁLIDA desde el instante en que el cajero la confirma en el POS.**  
  > El hecho de que la transacción todavía no haya viajado por Internet hacia Supabase no le resta existencia, validez jurídica ni contable.
* **`sale_id` (Identidad Inmutable de la Venta)**:
  - Generado localmente en el instante de confirmación mediante un identificador criptográfico único con prefijo de trazabilidad:
    `POS-{CAJA_ID}-{TIMESTAMP_EPOCH}-{RANDOM_HEX}` (o UUID v4).
    *Ejemplo: `POS-CAJA01-1725750000-8A3F`*.
  - Este `sale_id` es el que se imprime en el ticket físico entregado al cliente.
  - Es el identificador que se guarda en IndexedDB como clave primaria local.
  - Es el valor exacto que se inserta en Supabase en la columna `orders.id` (evitando cualquier generación posterior de IDs o remapeos).
* **`sync_status` (Estado del Ciclo de Vida de Red)**:
  - Es un campo de estado estrictamente desacoplado de la venta:
    * `local_confirmed`: Venta completada en caja, almacenada de forma segura en disco local.
    * `pending_sync`: Lista en cola para ser enviada al servidor en cuanto haya conexión.
    * `syncing`: En tránsito HTTP hacia Supabase (con bloqueo de doble envío).
    * `synced`: Recibida y confirmada por la base de datos central de Supabase.
    * `conflict`: Confirmada en servidor pero con observación auditable (ej: límite CC excedido).
    * `failed`: Error permanente de estructura o validación que requiere revisión manual.
* **Ventajas**:
  - Ni el cajero, ni el cliente, ni la impresora de tickets dependen del servidor para tener un comprobante definitivo.
  - Se eliminan por completo los riesgos de pedidos "fantasma" o ventas con doble numeración.

---

## 3. CONFLICTOS TÉCNICOS CON LA ARQUITECTURA ACTUAL Y SOLUCIONES

Tras la auditoría exhaustiva del código fuente (`POS.tsx`, `AdminContext.tsx`, `products.service.ts`, `esqueleto_lamartina.sql`), detectamos los siguientes conflictos técnicos que deben subsanarse:

### Conflicto 1: Ausencia de `caja_id` en las Tablas Principales de Supabase
* **Diagnóstico**:
  - Las tablas `orders`, `cash_movements` y `cash_closes` en `esqueleto_lamartina.sql` poseen `branch_id` y `employee_id`, pero **no poseen la columna `caja_id`**.
  - Además, el estado de caja abierta/cerrada se almacena en la tabla global `settings` bajo la clave `'cash_register'`. Si hubiera dos cajas físicas abiertas al mismo tiempo, una sobreescribiría el estado de la otra.
* **Solución Arquitectónica**:
  1. Ejecutar migración SQL agregando la columna `caja_id text NOT NULL DEFAULT 'CAJA-01'` en `orders`, `cash_movements` y `cash_closes`.
  2. Modificar la gestión de sesiones de caja para que el estado se mantenga por caja (`cash_register_CAJA-01`, `cash_register_CAJA-02`, etc.) o en la tabla `cash_sessions` ya provista en el esquema SQL.

### Conflicto 2: El RPC `process_pos_sale` Actual no es Idempotente y Asume Estado Global Online
* **Diagnóstico**:
  - En `esqueleto_lamartina.sql` (línea 118), la función `process_pos_sale(p_sale jsonb)` valida que la caja esté abierta en `settings.cash_register` del servidor. Si una venta offline se envía cuando en el servidor la caja figura cerrada (o desfasada), la transacción falla por excepción.
  - Además, si la llamada sufre un corte de red durante la respuesta HTTP, el SyncEngine reintentará el envío. Sin un guard de idempotencia, la base de datos podría lanzar error de clave primaria duplicada (`duplicate key value violates unique constraint "orders_pkey"`).
* **Solución Arquitectónica**:
  - Crear una nueva función de base de datos `process_pos_sale_v2` (o actualizar `process_pos_sale`) que:
    1. Compruebe al inicio:
       ```sql
       IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
           RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'already_exists', true);
       END IF;
       ```
    2. Reciba `caja_id` explícitamente en el payload y valide la sesión de esa caja específica.
    3. Para ventas offline a Cuenta Corriente: si la deuda supera el límite en el servidor, no rechaza la venta; la procesa y registra una fila en `sync_conflicts`.

### Conflicto 3: La Tabla `products` Carece de `deleted_at` (Imposibilidad de Soft Delete Incremental)
* **Diagnóstico**:
  - La tabla `products` en Supabase posee `updated_at`, pero **no tiene columna de borrado lógico** (`deleted_at`).
  - Si un administrador elimina físicamente un producto en Supabase (`DELETE FROM products WHERE id = 'xyz'`), la sincronización incremental (`WHERE updated_at > last_sync`) **nunca se enterará** de que ese producto fue borrado, manteniendo el producto fantasma en la caja offline para siempre.
* **Solución Arquitectónica**:
  1. Agregar la columna `deleted_at timestamp with time zone DEFAULT NULL` a la tabla `products`.
  2. En el servicio de productos y en la base local, los productos con `deleted_at IS NOT NULL` se consideran inactivos/eliminados y se purgan o marcan en IndexedDB.
  3. Adicionalmente, crear una tabla ligera de eventos de eliminación `product_deletions (product_id text PRIMARY KEY, deleted_at timestamptz DEFAULT now())` con un trigger ante `AFTER DELETE ON products` como mecanismo de seguridad ante borrados directos.

### Conflicto 4: La Consulta de Catálogo Actual Ignora la Columna `barcode`
* **Diagnóstico**:
  - En `src/services/products.service.ts` (línea 6), la constante:
    `PRODUCT_CATALOG_SELECT = 'id,name,brand,category_id,subcategory_id,price,original_price,image,format,is_new,discount,badge,stock,sale_type';`
    **no incluye la columna `barcode`**.
  - Aunque `products` en PostgreSQL sí tiene `barcode`, el frontend no lo estaba trayendo en las cargas masivas. La búsqueda por código de barras en POS dependía de llamar a `getProductByBarcode` individualmente o fallaba al buscar localmente.
* **Solución Arquitectónica**:
  - Incorporar de forma inmediata `barcode` en `PRODUCT_CATALOG_SELECT` y en el esquema de sincronización de IndexedDB.

### Conflicto 5: La Inicialización del Estado en `AdminContext` Depende de la Red
* **Diagnóstico**:
  - Si el cajero abre el navegador o recarga la página sin Internet, `fetchProducts()` en `useProductStore` y `loadAdminData()` en `AdminContext` lanzan error y dejan la memoria de la aplicación en blanco, impidiendo que el POS muestre productos.
* **Solución Arquitectónica**:
  - Implementar la capa **Repository Pattern** (`ProductRepository`, `SaleRepository`, `CashRepository`, `CustomerRepository`).
  - Al iniciar el POS, la aplicación se alimenta de inmediato desde IndexedDB (0 ms de espera, disponible 100% offline).
  - En segundo plano, si hay Internet, el `SyncEngine` actualiza los datos silenciosamente.

---

## 4. ESQUEMA DE BASE DE DATOS LOCAL (IndexedDB vía Dexie.js)

Utilizaremos **Dexie.js** para gestionar la base de datos IndexedDB local llamada `LaMartinaPOS_DB`.

### Tablas Locales Definidas

```typescript
// src/offline/db.ts
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
    
    this.version(1).stores({
      products: 'id, barcode, name, category_id, subcategory_id, updated_at, deleted_at, active',
      offline_sales: 'sale_id, caja_id, created_at, customer_dni, payment_method, sync_status',
      offline_cash_movements: 'id, caja_id, timestamp, type, sync_status',
      offline_cash_closes: 'id, caja_id, date, status, sync_status',
      customers_cache: 'id, dni, phone, name',
      offers_cache: 'id, active',
      settings_cache: 'key, updated_at',
      sync_queue: 'id, operation_type, entity_id, caja_id, status, created_at, retry_count',
      sync_conflicts: 'id, caja_id, entity_type, entity_id, resolved, created_at',
      caja_config: 'key'
    });
  }
}

export const localDB = new LaMartinaDatabase();
```

---

## 5. MODIFICACIONES EN SUPABASE (SQL DDL Y RPCs)

### Script SQL de Modificación de Esquema (a ejecutar en Supabase)

```sql
-- 1. Agregar identificación de caja en orders, cash_movements y cash_closes
ALTER TABLE "public"."orders" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01';

ALTER TABLE "public"."cash_movements" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01';

ALTER TABLE "public"."cash_closes" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01',
ADD COLUMN IF NOT EXISTS "pending_sync_count" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reconciled_at" timestamp with time zone;

-- 2. Agregar soporte de Soft Delete en products
ALTER TABLE "public"."products" 
ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone DEFAULT NULL;

CREATE INDEX IF NOT EXISTS "idx_products_updated_at" ON "public"."products" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_products_deleted_at" ON "public"."products" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_orders_caja_id" ON "public"."orders" ("caja_id");

-- 3. Tabla de Auditoría de Conflictos de Sincronización
CREATE TABLE IF NOT EXISTS "public"."sync_conflicts" (
    "id" text DEFAULT ('CONF-' || gen_random_uuid()::text) PRIMARY KEY,
    "caja_id" text NOT NULL,
    "entity_type" text NOT NULL, -- 'SALE', 'PAYMENT', 'STOCK', 'CLOSE'
    "entity_id" text NOT NULL,
    "conflict_type" text NOT NULL, -- 'CREDIT_LIMIT_EXCEEDED', 'CUSTOMER_BLOCKED', 'STOCK_NEGATIVE', 'CLOSE_DISCREPANCY'
    "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_by" text,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Tabla de Auditoría de Productos Físicamente Eliminados (Backup ante hard delete)
CREATE TABLE IF NOT EXISTS "public"."product_deletions" (
    "product_id" text PRIMARY KEY,
    "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE OR REPLACE FUNCTION "public"."trg_record_product_deletion"()
RETURNS trigger AS $$
BEGIN
    INSERT INTO "public"."product_deletions" ("product_id", "deleted_at")
    VALUES (OLD.id, now())
    ON CONFLICT ("product_id") DO UPDATE SET "deleted_at" = now();
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "product_hard_delete_audit" ON "public"."products";
CREATE TRIGGER "product_hard_delete_audit"
AFTER DELETE ON "public"."products"
FOR EACH ROW EXECUTE FUNCTION "public"."trg_record_product_deletion"();

-- 5. RPC de Procesamiento de Ventas POS Idempotente y Seguro (process_pos_sale_v2)
CREATE OR REPLACE FUNCTION "public"."process_pos_sale_v2"("p_sale" jsonb) 
RETURNS jsonb AS $$
DECLARE
  v_order_id text;
  v_caja_id text;
  v_customer_phone text;
  v_payment_method text;
  v_total numeric;
  v_items jsonb;
  v_item jsonb;
  v_prod_id text;
  v_qty numeric;
  v_is_offline boolean;
  v_customer record;
  v_current_debt numeric;
  v_effective_limit numeric;
BEGIN
  v_order_id := p_sale->>'id';
  v_caja_id := COALESCE(p_sale->>'caja_id', 'CAJA-01');
  v_customer_phone := p_sale->>'customer_phone';
  v_payment_method := p_sale->>'payment_method';
  v_total := (p_sale->>'total')::numeric;
  v_items := p_sale->'items';
  v_is_offline := COALESCE((p_sale->>'is_offline')::boolean, false);

  -- A. IDEMPOTENCIA ESTRICTA: Si la venta ya existe, retornar éxito sin duplicar
  IF EXISTS (SELECT 1 FROM "public"."orders" WHERE id = v_order_id) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'order_id', v_order_id, 
      'already_exists', true,
      'message', 'Venta previamente procesada (Idempotencia garantizada)'
    );
  END IF;

  -- B. CONTROL DE CUENTA CORRIENTE POST-OFFLINE
  IF v_payment_method = 'cuenta_corriente' THEN
    SELECT * INTO v_customer FROM "public"."customer_profiles" 
    WHERE phone = v_customer_phone LIMIT 1;

    IF FOUND THEN
      -- Calcular deuda actual en servidor
      SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) INTO v_current_debt
      FROM "public"."orders"
      WHERE customer_phone = v_customer_phone 
        AND payment_method = 'cuenta_corriente' 
        AND payment_status != 'Pagado'
        AND status != 'Cancelado';

      v_effective_limit := CASE 
        WHEN v_customer."useCustomAccountLimits" THEN COALESCE(v_customer."customDebtLimit", 50000)
        ELSE COALESCE(v_customer."creditLimit", 50000)
      END;

      -- Si superó el límite, NO se cancela la venta; se levanta un conflicto auditable
      IF (v_current_debt + v_total) > v_effective_limit THEN
        INSERT INTO "public"."sync_conflicts" (
          "caja_id", "entity_type", "entity_id", "conflict_type", "details"
        ) VALUES (
          v_caja_id, 'SALE', v_order_id, 'CREDIT_LIMIT_EXCEEDED',
          jsonb_build_object(
            'customer_phone', v_customer_phone,
            'customer_name', v_customer.name,
            'credit_limit', v_effective_limit,
            'prior_debt', v_current_debt,
            'sale_total', v_total,
            'new_total_debt', (v_current_debt + v_total)
          )
        );
      END IF;
    END IF;
  END IF;

  -- C. INSERTAR LA ORDEN
  INSERT INTO "public"."orders" (
    "id", "user_id", "customer_name", "customer_email", "customer_phone",
    "items", "total", "status", "payment_status", "payment_method",
    "shipping_address", "created_at", "updated_at", "origin", "branch_id",
    "employee_id", "caja_id"
  ) VALUES (
    v_order_id,
    (p_sale->>'user_id')::uuid,
    COALESCE(p_sale->>'customer_name', 'Cliente Local'),
    p_sale->>'customer_email',
    v_customer_phone,
    v_items,
    v_total,
    'Entregado',
    CASE WHEN v_payment_method = 'cuenta_corriente' THEN 'Pendiente' ELSE 'Pagado' END,
    v_payment_method,
    'Compra en local',
    COALESCE((p_sale->>'created_at')::timestamptz, now()),
    now(),
    'caja',
    COALESCE(p_sale->>'branch_id', 'main'),
    p_sale->>'employee_id',
    v_caja_id
  );

  -- D. ACTUALIZAR STOCK CON RECONCILIACIÓN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_prod_id := v_item->>'product_id';
    v_qty := (v_item->>'quantity')::numeric;

    IF v_prod_id IS NOT NULL AND v_prod_id NOT IN ('PRODUCTO_COMUN', 'COMUN') THEN
      UPDATE "public"."products"
      SET "stock" = "stock" - v_qty,
          "updated_at" = now()
      WHERE "id" = v_prod_id;

      -- Verificar si el stock quedó negativo por ventas offline concurrentes
      IF (SELECT stock FROM "public"."products" WHERE id = v_prod_id) < 0 THEN
        INSERT INTO "public"."sync_conflicts" (
          "caja_id", "entity_type", "entity_id", "conflict_type", "details"
        ) VALUES (
          v_caja_id, 'STOCK', v_prod_id, 'STOCK_NEGATIVE',
          jsonb_build_object(
            'order_id', v_order_id,
            'product_id', v_prod_id,
            'product_name', v_item->>'name',
            'quantity_sold', v_qty
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- E. REGISTRAR MOVIMIENTO DE CAJA SI CORRESPONDE
  IF v_payment_method = 'cash' THEN
    INSERT INTO "public"."cash_movements" (
      "id", "branch_id", "caja_id", "type", "description", 
      "cashier", "amount", "timestamp", "order_id"
    ) VALUES (
      'MOV-' || gen_random_uuid()::text,
      COALESCE(p_sale->>'branch_id', 'main'),
      v_caja_id,
      'Ingreso',
      'Venta Local #' || v_order_id,
      COALESCE(p_sale->>'cashier', 'Cajero'),
      v_total,
      COALESCE((p_sale->>'timestamp')::bigint, (EXTRACT(epoch FROM now()) * 1000)::bigint),
      v_order_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 6. ARQUITECTURA DE SOFTWARE: MOTOR DE SINCRONIZACIÓN Y REPOSITORIOS

### Capa de Repositorios (Repository Pattern)

Para aislar a `POS.tsx` y a `AdminContext.tsx` de la infraestructura de red, se implementan cinco repositorios:

1. **`ProductRepository`**:
   - `searchProducts(term)`: Busca localmente en IndexedDB mediante índice por `barcode`, `name` y `brand`. Latencia < 5 ms.
   - `syncCatalog(isInitial)`: Ejecuta bootstrap inicial (100% de productos) o delta incremental basado en `updated_at > lastSync`.
   - `updateLocalStock(productId, delta)`: Descuenta stock en IndexedDB de forma atómica.
2. **`SaleRepository`**:
   - `createSale(saleData)`:
     1. Genera el `sale_id` definitivo (`POS-CAJA01-...`).
     2. Asigna `sync_status = 'pending_sync'`.
     3. Descuenta stock localmente mediante transacción Dexie.
     4. Si es Cuenta Corriente, incrementa la deuda local del cliente.
     5. Encola la operación en `sync_queue`.
     6. Notifica al `SyncEngine` si hay conexión.
     7. Retorna éxito inmediato para imprimir ticket.
3. **`CashRepository`**:
   - `openRegister(cajaId, amount, employee)`: Registra apertura local y encola.
   - `addMovement(movementData)`: Registra movimiento de efectivo local y encola.
   - `createCashClose(closeData)`: Computa el cierre con los datos locales, emite ticket y encola para reconciliación.
4. **`CustomerRepository`**:
   - `searchCustomers(query)`: Búsqueda local instantánea por DNI o Teléfono.
   - `updateLocalDebt(dni, additionalDebt)`: Mantiene la consistencia de saldo offline.
   - `syncCustomers()`: Descarga clientes y sus límites de crédito desde Supabase.
5. **`SettingsRepository`**:
   - Mantiene la configuración de caja, tickets y Cuenta Corriente disponible localmente.

---

### SyncEngine (Motor de Sincronización)

* **Detector de Conectividad (`ConnectionMonitor`)**:
  - Escucha eventos `window.addEventListener('online')` y `'offline'`.
  - Implementa un **Heartbeat activo** cada 10 segundos consultando `/rest/v1/` de Supabase con `HEAD` request (para detectar Wi-Fi conectado pero sin salida real a Internet o caídas de Supabase).
* **Procesamiento de Cola (`SyncQueue`)**:
  - Procesa en orden cronológico estricto (`FIFO`).
  - Ejecuta reintentos automáticos con **Backoff Exponencial + Jitter**:
    - Intento 1: 1.5s
    - Intento 2: 3s
    - Intento 3: 6s
    - Intento 4: 12s
    - Intento 5: 24s ... hasta 10 intentos.
  - Al completar un ítem con éxito, actualiza su estado a `synced` y lo remueve de la cola activa.

---

## 7. EXPERIENCIA DE USUARIO E INTERFAZ (UI/UX)

### 1. Indicador de Conexión en el Header del POS
En la barra superior del POS y del AdminLayout:
* 🟢 **EN LÍNEA · CAJA-01** (Conexión normal)
* 🟡 **SINCRONIZANDO (3 pendientes) · CAJA-01** (Subiendo datos)
* 🔴 **MODO OFFLINE · CAJA-01 (14 pendientes)** (Operando sin red)
* ⚠️ **CONFLICTO / ATENCIÓN (1) · CAJA-01** (Alerta para supervisor)

### 2. Cartel Informativo de Venta Offline
Cuando el cajero confirma una venta sin conexión:
* El modal de éxito indica:
  > **✅ Venta #POS-CAJA01-1725... registrada localmente.**  
  > *Guardada en esta terminal. Se sincronizará automáticamente al restablecerse la conexión.*

### 3. Advertencia de Cuenta Corriente Offline
Al seleccionar Cuenta Corriente en modo offline:
* Banner amarillo/ámbar de advertencia:
  > **⚠️ Advertencia de Cuenta Corriente Offline**  
  > *Modo offline: el límite de crédito podría no estar actualizado. La venta se registrará localmente y se auditará al reconectar.*

---

## 8. MATRIZ DE PRUEBAS Y VERIFICACIÓN (CASOS CRÍTICOS)

| ID | Escenario de Prueba | Comportamiento Esperado | Criterio de Aprobación |
|:--:|:--------------------|:------------------------|:-----------------------|
| **TC-01** | Venta normal con Internet | Venta se guarda local y viaja a Supabase de inmediato | Ticket impreso con `sale_id`, estado `synced` en Supabase |
| **TC-02** | Venta normal SIN Internet (Cable desconectado) | Venta se guarda en IndexedDB, stock local se descuenta, ticket se imprime | POS no se tilda ni muestra error de red. Queda en cola |
| **TC-03** | Venta offline -> Cerrar navegador -> Reiniciar PC -> Abrir POS | Los datos persisten intactos en IndexedDB | Las operaciones pendientes siguen en la cola local |
| **TC-04** | Reconexión a Internet | SyncEngine detecta conexión y vacía la cola | Todas las ventas offline aparecen en `orders` en Supabase |
| **TC-05** | Simulación de corte a mitad de sincronización | Reintenta mediante backoff, no duplica ventas | Cero duplicaciones gracias a idempotencia de `process_pos_sale_v2` |
| **TC-06** | Venta Cuenta Corriente offline con cliente al límite | Permite la venta con advertencia visual. Al reconectar registra conflicto | Venta confirmada y registrada en `sync_conflicts` |
| **TC-07** | Cierre de caja offline | Emite comprobante de cierre local con conteo de pendientes | Al volver internet, concilia cierre sin alterar totales |

---

## 9. PLAN DE IMPLEMENTACIÓN POR FASES

* **Fase 1**: ✅ Auditoría del código y base de datos (Completada).
* **Fase 2**: ✅ Plan y Especificación Técnica Oficial (Este documento).
* **Fase 3**: Instalación de dependencias (`dexie`, `uuid`, `@types/uuid`), creación de `src/offline/db.ts` y `src/offline/types.ts`.
* **Fase 4**: Implementación de Repositorios (`ProductRepository`, `SaleRepository`, `CashRepository`, `CustomerRepository`, `SettingsRepository`).
* **Fase 5**: Implementación del `ConnectionMonitor`, `SyncQueue` y `SyncEngine`.
* **Fase 6**: Creación de componentes visuales (`ConnectionIndicator.tsx`, `SyncStatusPanel.tsx`, banners de advertencia CC).
* **Fase 7**: Adaptación de `POS.tsx` y `AdminContext.tsx` para operar contra los repositorios.
* **Fase 8**: Generación de scripts SQL de migración en Supabase (`esqueleto_offline_patch.sql`).
* **Fase 9**: Validación integral de compilación (`tsc`), pruebas funcionales y documentación operativa (`OFFLINE_MODE.md`).
