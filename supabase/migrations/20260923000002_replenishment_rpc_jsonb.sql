-- ==============================================================================
-- Martina Supermercado - MIGRACIÓN DE REPOSICIÓN DE INVENTARIO (JSONB & TEXT ID)
-- ==============================================================================

-- DOWN MIGRATION (ROLLBACK):
-- DROP FUNCTION IF EXISTS public.get_product_weekly_sales_stats(integer);
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_weekly_sales_stat') THEN
--         CREATE TYPE public.product_weekly_sales_stat AS (
--             product_id uuid,
--             week_start date,
--             units numeric,
--             first_sale_at timestamp with time zone
--         );
--     END IF;
-- END$$;

-- UP MIGRATION:
DROP FUNCTION IF EXISTS public.get_product_weekly_sales_stats(integer);
DROP TYPE IF EXISTS public.product_weekly_sales_stat;

CREATE OR REPLACE FUNCTION public.get_product_weekly_sales_stats(h_weeks integer DEFAULT 16)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_tz text := 'America/Argentina/Buenos_Aires';
    current_week_start timestamptz;
    window_start timestamptz;
    result jsonb;
BEGIN
    -- Validamos permisos: solo empleados activos (incluyendo admin y owner)
    IF NOT public.is_active_employee() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Parámetro de semanas limitado a 1..52
    IF h_weeks IS NULL OR h_weeks < 1 OR h_weeks > 52 THEN
        RAISE EXCEPTION 'El parámetro h_weeks debe estar entre 1 y 52';
    END IF;

    -- Inicio de la semana en curso (lunes a las 00:00:00 en zona local)
    current_week_start := date_trunc('week', timezone(current_tz, now())) AT TIME ZONE current_tz;
    
    -- Inicio de la ventana de H semanas completas
    window_start := current_week_start - (h_weeks || ' weeks')::interval;

    WITH valid_orders_all AS (
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
        JOIN valid_orders_all vo ON oi.order_id = vo.id
        GROUP BY oi.product_id
    ),
    weekly_sales AS (
        SELECT 
            oi.product_id,
            vo.week_start,
            SUM(oi.quantity)::numeric AS units
        FROM order_items oi
        JOIN valid_orders_all vo ON oi.order_id = vo.id
        WHERE vo.created_at >= window_start AND vo.created_at < current_week_start
        GROUP BY oi.product_id, vo.week_start
    ),
    product_weeks AS (
        SELECT 
            ws.product_id,
            jsonb_agg(
                jsonb_build_object(
                    'week_start', ws.week_start,
                    'units', ws.units
                ) ORDER BY ws.week_start ASC
            ) AS weeks
        FROM weekly_sales ws
        GROUP BY ws.product_id
    )
    SELECT 
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', pw.product_id,
                    'first_sale_at', fs.first_sale_at,
                    'weeks', pw.weeks
                ) ORDER BY pw.product_id
            ),
            '[]'::jsonb
        )
    INTO result
    FROM product_weeks pw
    JOIN first_sales fs ON pw.product_id = fs.product_id;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_weekly_sales_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_weekly_sales_stats(integer) TO authenticated;
