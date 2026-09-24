# Guía de Activación y Despliegue: Reposición Inteligente de Inventario

Este documento detalla el procedimiento técnico para validar, desplegar y operar el nuevo motor de reposición dinámica basado en el RPC `get_product_weekly_sales_stats` (JSONB).

---

## 1. Requisitos Previos en Entorno Local (Docker)

Antes de aplicar cualquier cambio a la base de datos remota de producción, se debe validar la migración y su rendimiento en un entorno local aislado.

### 1.1 Iniciar Supabase Local
Asegurarse de que Docker Desktop esté en ejecución y levantar los servicios locales de Supabase:
```powershell
npx supabase start
```

### 1.2 Aplicar Migración 000002 en Local (Sin tocar remoto)
Copiar o ejecutar la migración exclusivamente contra el contenedor local de PostgreSQL:
```powershell
npx supabase db reset
# O aplicar directamente la migración al puerto local (54322 por defecto):
Get-Content supabase/migrations/20260923000002_replenishment_rpc_jsonb.sql | psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

### 1.3 Pruebas de Carga Sintética (> 1.000 filas y EXPLAIN ANALYZE)
Ejecutar un script SQL local para poblar datos sintéticos (1.000 productos y 10.000 ítems de pedido) y evaluar los búferes y tiempos de ejecución:
```sql
-- Carga sintética local de prueba
DO $$
DECLARE
    v_prod_id uuid;
    v_order_id uuid;
BEGIN
    FOR i IN 1..1000 LOOP
        INSERT INTO products (id, name, stock, min_stock, price, is_paused, category_id)
        VALUES (gen_random_uuid(), 'Prod Sintetico ' || i, 5, 10, 100, false, (SELECT id FROM categories LIMIT 1))
        RETURNING id INTO v_prod_id;

        FOR j IN 1..10 LOOP
            INSERT INTO orders (id, status, created_at, total)
            VALUES (gen_random_uuid(), 'Entregado', now() - (j || ' weeks')::interval, 1000)
            RETURNING id INTO v_order_id;

            INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
            VALUES (gen_random_uuid(), v_order_id, v_prod_id, 2, 100);
        END LOOP;
    END LOOP;
END$$;

-- Medición de performance con EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_product_weekly_sales_stats(16);
```

### 1.4 Verificación del Test T12 (Pedidos Cancelados) en Local
Comprobar que un pedido marcado con `status = 'Cancelado'` es estrictamente ignorado por las estadísticas del RPC:
```sql
-- Insertar pedido cancelado
INSERT INTO orders (id, status, created_at, total) 
VALUES ('c0000000-0000-0000-0000-000000000001', 'Cancelado', now() - interval '2 weeks', 500);

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
VALUES ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'PROD_TEST_UUID', 10, 50);

-- Validar que units para PROD_TEST_UUID sea 0 en la semana correspondiente
SELECT jsonb_path_query(public.get_product_weekly_sales_stats(16), '$[*] ? (@.product_id == "PROD_TEST_UUID")');
```

---

## 2. Verificación de Permisos por Rol en PostgreSQL

Para garantizar que ningún usuario anónimo o cliente sin perfil de empleado pueda ejecutar la función, se debe verificar mediante la simulación de claims JWT en una sesión PostgreSQL:

```sql
BEGIN;

-- 1. Probar como usuario 'anon' (Debe fallar por permisos de función o por IF NOT is_active_employee())
SET LOCAL ROLE anon;
SELECT public.get_product_weekly_sales_stats(16);
-- Esperado: ERROR: permission denied for function get_product_weekly_sales_stats

-- 2. Probar como usuario autenticado pero rol 'cliente' (sin employee_profile activo)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
SELECT public.get_product_weekly_sales_stats(16);
-- Esperado: ERROR: Access denied

-- 3. Probar como empleado activo (admin / employee)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '29417f58-d5d9-4f65-b9d2-b69d8f298e18', true);
SELECT set_config('request.jwt.claims', '{"sub": "29417f58-d5d9-4f65-b9d2-b69d8f298e18", "role": "authenticated"}', true);
SELECT public.get_product_weekly_sales_stats(16);
-- Esperado: Retorno JSONB con array de productos

ROLLBACK;
```

---

## 3. Despliegue a Producción (Remoto)

> **IMPORTANTE:** No ejecutar estos comandos hasta contar con la aprobación explícita del usuario.

### 3.1 Listado previo de migraciones
```powershell
npx supabase migration list --linked
```
Verificar que la última migración registrada sea `20260923000000`.

### 3.2 Aplicar la migración 000002
```powershell
npx supabase db push
```

### 3.3 Listado posterior de confirmación
```powershell
npx supabase migration list --linked
```
Confirmar que `20260923000002_replenishment_rpc_jsonb.sql` figure como aplicada (`applied: true`).

### 3.4 Procedimiento de Rollback Inmediato
En caso de cualquier anomalía tras el push, ejecutar la sección DOWN de la migración:
```sql
DROP FUNCTION IF EXISTS public.get_product_weekly_sales_stats(integer);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_weekly_sales_stat') THEN
        CREATE TYPE public.product_weekly_sales_stat AS (
            product_id uuid,
            week_start date,
            units numeric,
            first_sale_at timestamp with time zone
        );
    END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_product_weekly_sales_stats(h_weeks integer DEFAULT 16)
RETURNS SETOF product_weekly_sales_stat
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    current_tz text := 'America/Argentina/Buenos_Aires';
    current_week_start timestamp;
    window_start timestamp;
BEGIN
    IF NOT public.is_active_employee() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    current_week_start := date_trunc('week', timezone(current_tz, now())) AT TIME ZONE current_tz;
    window_start := current_week_start - (h_weeks || ' weeks')::interval;

    RETURN QUERY
    WITH valid_orders AS (
        SELECT id, created_at, date_trunc('week', timezone(current_tz, created_at))::date AS week_start
        FROM orders WHERE status != 'Cancelado'
    ),
    first_sales AS (
        SELECT oi.product_id, MIN(vo.created_at) AS first_sale_at
        FROM order_items oi JOIN valid_orders vo ON oi.order_id = vo.id
        GROUP BY oi.product_id
    ),
    weekly_sales AS (
        SELECT oi.product_id, vo.week_start, SUM(oi.quantity) AS units
        FROM order_items oi JOIN valid_orders vo ON oi.order_id = vo.id
        WHERE vo.created_at >= window_start AND vo.created_at < current_week_start
        GROUP BY oi.product_id, vo.week_start
    )
    SELECT fs.product_id, ws.week_start, COALESCE(ws.units, 0), fs.first_sale_at
    FROM first_sales fs LEFT JOIN weekly_sales ws ON fs.product_id = ws.product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_product_weekly_sales_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_weekly_sales_stats(integer) TO authenticated;
```

---

## 4. Activación del Feature Flag y Operación

### 4.1 Encender el Flag desde la Interfaz
1. Ingresar al panel administrativo en `/admin/settings`.
2. Dirigirse a la sección **Reposición de Inventario**.
3. Activar el toggle **"Habilitar reposición predictiva"**.
4. Ajustar los parámetros si se desea (por defecto: Historial 16 semanas, Cobertura 15 días, Anticipación 3 días, Márgenes 15% / 25% / 35%).
5. Presionar **Guardar Configuración**.

### 4.2 Comportamiento Esperado en el Dashboard
- **Tarjetas de métricas:**
  - *Sin stock:* Cantidad de productos activos con stock $\le 0$ en vivo.
  - *Stock bajo / Reposición:* Cantidad de productos con alerta activa calculada ($S \le PR$).
- **Tabla de alertas de bajo stock:**
  - Muestra columnas de reposición: *Venta semanal prom.*, *Días de cobertura*, *Punto de reposición (PR)*, *Stock objetivo*, *Comprar*.
  - Los productos están ordenados por días de cobertura ascendente (los más críticos primero).
  - Paginación local de 10 en 10.
- **Reporte PDF ("Imprimir / Guardar PDF"):**
  - Encabezado con fecha/hora de generación y parámetros activos ($H, C, W$).
  - Agrupación por categoría con fila cabecera por cada una.
  - Orden interno dentro de cada categoría: días de cobertura ascendente, luego nombre.
  - Columna de cobertura con 1 decimal.
  - Sección adicional al final: *"Productos sin ventas registradas en el período (Stock 0)"*.

### 4.3 Comportamiento ante Fallo del RPC (Cadena de Fallback)
Si el RPC falla por problemas de red, timeout o permisos:
1. El store captura el error e intenta leer la última estadística válida almacenada en caché local (`catalogCache` / `localStorage`).
2. Si no hay caché previo, recurre inmediatamente al **fallback transparente**: invoca `productsService.getLowStockProductsPaginated(params)` (filtrando productos con stock $\le 15$ o $\le \text{min\_stock}$).
3. En la consola del desarrollador (DevTools) se emitirá un `console.error` descriptivo:
   ```text
   ❌ Error fetching replenishment stats: ... Fallback a lógica estática
   ```
4. La interfaz del Dashboard **nunca queda en blanco ni vacía**, continuando operativa con el catálogo tradicional.

---

## 5. Condiciones Mínimas de Datos para Encender el Flag

Para que los cálculos de cobertura y puntos de reposición representen la demanda real del negocio:
1. **Historial mínimo:** El negocio debe contar con al menos **4 semanas completas** de órdenes registradas con `status != 'Cancelado'`.
2. **Productos vinculados:** Los ítems de pedido deben apuntar a productos existentes en la tabla `products` (minimizar huérfanos).
3. **Validación previa de diferencias:** Ejecutar en terminal el script de análisis comparativo:
   ```powershell
   npx tsx scripts/informe-diferencias.ts
   ```
   Revisar que la lista de sugerencias de compra sea coherente con la realidad comercial antes de encender el flag en la tienda.

---

## 6. Lista de Pruebas Pendientes

1. **T12 (Base de Datos):** Verificación con tests de integración de que pedidos cancelados no aportan volumen de ventas al RPC. (Requiere Docker local con Supabase).
2. **T15 (Frontend / Egress):** Medición de requests HTTP concurrentes durante la navegación del Dashboard y generación de PDF mediante inspección de red del navegador.
3. **Pruebas a, b, c, d (PostgreSQL en Local):**
   - Inserción de 1.000 productos y 10.000 ítems de pedido.
   - Medición de tiempo de ejecución del RPC (< 50 ms).
   - Análisis de uso de búferes y escaneos secuenciales mediante `EXPLAIN (ANALYZE, BUFFERS)`.
