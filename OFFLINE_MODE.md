# MANUAL OPERATIVO: MODO OFFLINE-FIRST (POS MARTINA SUPERMERCADO)

Este documento detalla el funcionamiento, la operación diaria y los procedimientos técnicos del sistema de **Punto de Venta Offline-First** de **Martina Supermercado**.

---

## 1. PRINCIPIOS DE FUNCIONAMIENTO

El sistema opera bajo la premisa de que **la caja física siempre debe poder cobrar, imprimir tickets y cerrar turno**, independientemente de la estabilidad de la conexión a Internet o del servidor de Supabase.

1. **La venta existe desde la confirmación en el POS**: Toda venta confirmada por el cajero genera de inmediato un `sale_id` canónico e inmutable (ej: `POS-CAJA01-1725750000-8A3F`). Este código es el comprobante legal impreso en el ticket.
2. **Persistencia Dura Local (IndexedDB)**: Las transacciones se guardan en el disco duro de la computadora mediante IndexedDB (vía Dexie.js). Los datos no se pierden al cerrar el navegador, apagar o reiniciar la computadora.
3. **Sincronización Automática e Idempotente**: Al detectar conexión a Internet, el motor `SyncEngine` procesa la cola de transacciones en orden cronológico estricto (`FIFO`), enviando cada venta al servidor sin riesgo de duplicaciones.
4. **Catálogo Completo en Local**: La base local contiene el catálogo completo de productos (incluyendo productos con stock 0 y códigos de barras), permitiendo escaneo rápido y cálculo de ofertas aun sin red.

---

## 2. GUÍA OPERATIVA PARA EL CAJERO

### Indicador de Estado de Conexión
En la parte superior de la pantalla del POS y del menú de administración se encuentra una píldora visual que indica el estado en vivo:

* 🟢 **EN LÍNEA · CAJA-01**: Operación normal. Internet disponible y Supabase respondiendo. Las ventas se sincronizan de inmediato.
* 🟡 **SINCRONIZANDO (3) · CAJA-01**: La conexión se restableció y el sistema está subiendo operaciones pendientes en segundo plano.
* 🔴 **MODO OFFLINE · CAJA-01 (5)**: La computadora no tiene acceso a Internet o el servidor no responde. **La caja continúa funcionando normalmente**.

### Venta a Cuenta Corriente (Fiado) en Modo Offline
* Si un cliente solicita pagar con **Cuenta Corriente** y la caja se encuentra offline:
  1. El cliente debe haber sido registrado previamente en el sistema (sus datos deben estar en la base local).
  2. Al seleccionar Cuenta Corriente, el sistema mostrará un banner de advertencia:
     > ⚠️ **Modo offline: el límite de crédito podría no estar actualizado.**
  3. El cajero puede confirmar la venta normalmente.
  4. La deuda local del cliente se actualiza de inmediato para controlar compras sucesivas en el mismo turno.
  5. Al volver Internet, el servidor validará la situación. Si el cliente superó su límite durante el corte, **la venta no se anula** (la mercadería ya fue entregada); se genera un aviso en el panel de auditoría para supervisión administrativa.

### Cierre de Turno / Arqueo de Caja Offline
* Si termina el turno y no hay Internet:
  1. El cajero realiza el conteo de efectivo y retiros habituales.
  2. Presiona "Cerrar Caja".
  3. El sistema calcula los totales con el 100% de las ventas locales de ese turno y emite el comprobante de cierre indicando la cantidad de operaciones pendientes de sincronizar.
  4. Cuando vuelva Internet, el cierre se reconciliará automáticamente con el servidor sin alterar los totales históricos calculados.

---

## 3. IDENTIFICACIÓN Y CONFIGURACIÓN MULTI-CAJA

Cada computadora física del supermercado debe tener asignado su propio identificador (ej: `CAJA-01`, `CAJA-02`, `CAJA-03`):

1. Hacer clic en el indicador de conexión (arriba a la derecha).
2. Se abrirá el **Panel de Sincronización y Estado Offline**.
3. En la tarjeta de **Terminal / Caja**, hacer clic en **"Cambiar"**.
4. Ingresar el nombre de la caja (ej: `CAJA-02`) y hacer clic en **"Guardar Identificador"**.
5. Esta configuración queda grabada de forma permanente en el almacenamiento local de esa máquina.

---

## 4. INSTALACIÓN DE LA MIGRACIÓN EN SUPABASE

Para habilitar la compatibilidad total del servidor con la arquitectura multi-caja y la auditoría de conflictos:

1. Abrir el **Dashboard de Supabase** de Martina Supermercado(`https://supabase.com/dashboard/project/xgwzjsjgqgsmzenvuuyc`).
2. Ir a la pestaña **SQL Editor**.
3. Abrir o copiar el contenido del archivo [`supabase_offline_patch.sql`](file:///c:/Users/lauty/Programacion/La%20Martina/supabase_offline_patch.sql).
4. Presionar **Run** (Ejecutar).
5. El script agregará:
   * Columna `caja_id` a las tablas `orders`, `cash_movements` y `cash_closes`.
   * Columna `deleted_at` e índices de búsqueda a la tabla `products`.
   * Tabla `sync_conflicts` para auditoría de sobregiros y stock negativo.
   * Función PostgreSQL `process_pos_sale_v2` con guard de idempotencia.

---

## 5. RESOLUCIÓN DE DUDAS Y PREGUNTAS FRECUENTES

**¿Qué pasa si se corta la luz o se apaga la PC con ventas pendientes?**  
Al encender la computadora y abrir el sistema, las ventas pendientes continúan guardadas en IndexedDB. Al detectar Internet, el `SyncEngine` las subirá automáticamente.

**¿Qué pasa si la misma venta intenta subirse dos veces por un corte de red a mitad de camino?**  
La función en Supabase cuenta con una comprobación de idempotencia estricta (`IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id)`). Si la venta ya fue procesada, el servidor responde con confirmación de éxito y no duplica la orden ni descuenta stock dos veces.

**¿Cómo consultar las ventas que aún no se sincronizaron?**  
Hacer clic en el indicador de conexión en la barra superior. La pestaña "Cola de Operaciones" muestra la lista detallada de cada transacción pendiente, su fecha, hora, monto y estado.
