-- ==============================================================================
-- Martina Supermercado - MIGRACIÓN DE REPOSICIÓN DE INVENTARIO
-- ==============================================================================

-- Instrucción de rollback (para deshacer manualmente si es necesario):
-- DROP FUNCTION IF EXISTS public.get_product_weekly_sales_stats(integer);
-- DROP TYPE IF EXISTS public.product_weekly_sales_stat;

-- Creamos el tipo de retorno si no existe
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
RETURNS SETOF public.product_weekly_sales_stat
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_tz text := 'America/Argentina/Buenos_Aires';
    current_week_start timestamp;
    window_start timestamp;
BEGIN
    -- Validamos permisos (el usuario debe ser admin, owner o super_admin para ver stats globales de ventas)
    IF NOT public.is_admin_or_owner() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Inicio de la semana en curso (lunes a las 00:00:00 en la zona local)
    current_week_start := date_trunc('week', timezone(current_tz, now())) AT TIME ZONE current_tz;
    
    -- Inicio de la ventana de H semanas completas
    window_start := current_week_start - (h_weeks || ' weeks')::interval;

    RETURN QUERY
    WITH valid_orders AS (
        SELECT 
            id, 
            created_at,
            date_trunc('week', timezone(current_tz, created_at))::date AS week_start
        FROM orders
        WHERE status != 'Cancelado'
    ),
    first_sales AS (
        SELECT 
            oi.product_id,
            MIN(vo.created_at) AS first_sale_at
        FROM order_items oi
        JOIN valid_orders vo ON oi.order_id = vo.id
        GROUP BY oi.product_id
    ),
    weekly_sales AS (
        SELECT 
            oi.product_id,
            vo.week_start,
            SUM(oi.quantity) AS units
        FROM order_items oi
        JOIN valid_orders vo ON oi.order_id = vo.id
        WHERE vo.created_at >= window_start AND vo.created_at < current_week_start
        GROUP BY oi.product_id, vo.week_start
    )
    SELECT 
        fs.product_id,
        ws.week_start,
        COALESCE(ws.units, 0),
        fs.first_sale_at
    FROM first_sales fs
    LEFT JOIN weekly_sales ws ON fs.product_id = ws.product_id;
END;
$$;
