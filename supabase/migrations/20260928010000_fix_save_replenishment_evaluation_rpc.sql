-- Fix y compatibilidad para RPC save_replenishment_evaluation
-- Permite invocar con la firma estándar y maneja parámetros con valores por defecto para evitar 404 en PostgREST

CREATE OR REPLACE FUNCTION public.save_replenishment_evaluation(
    p_queue_id UUID DEFAULT NULL,
    p_product_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'OK',
    p_stock_at_evaluation NUMERIC DEFAULT 0,
    p_punto_reposicion NUMERIC DEFAULT 0,
    p_stock_objetivo NUMERIC DEFAULT 0,
    p_cantidad_recomendada NUMERIC DEFAULT 0,
    p_dias_cobertura NUMERIC DEFAULT 999,
    p_etiqueta_margen TEXT DEFAULT NULL
)
RETURNS TABLE (
    should_notify_whatsapp BOOLEAN,
    previous_status TEXT,
    new_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prev_status TEXT := 'OK';
    v_should_notify BOOLEAN := FALSE;
BEGIN
    -- Validamos permisos: service_role o empleados activos
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_active_employee() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF p_product_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'OK'::TEXT, 'OK'::TEXT;
        RETURN;
    END IF;

    -- Obtener estado previo si existe
    SELECT status INTO v_prev_status
    FROM public.product_replenishment_state
    WHERE product_id = p_product_id;

    IF v_prev_status IS NULL THEN
        v_prev_status := 'OK';
    END IF;

    -- Transición: Solo notificar si antes NO requería reposición y ahora SÍ entra en REPOSICION o SIN_STOCK
    IF v_prev_status NOT IN ('REPOSICION', 'SIN_STOCK') AND p_status IN ('REPOSICION', 'SIN_STOCK') THEN
        v_should_notify := TRUE;
    ELSE
        v_should_notify := FALSE;
    END IF;

    -- Upsert en product_replenishment_state
    INSERT INTO public.product_replenishment_state (
        product_id,
        status,
        previous_status,
        stock_at_evaluation,
        punto_reposicion,
        stock_objetivo,
        cantidad_recomendada,
        dias_cobertura,
        etiqueta_margen,
        alert_sent_at,
        last_evaluated_at
    ) VALUES (
        p_product_id,
        p_status,
        v_prev_status,
        COALESCE(p_stock_at_evaluation, 0),
        COALESCE(p_punto_reposicion, 0),
        COALESCE(p_stock_objetivo, 0),
        COALESCE(p_cantidad_recomendada, 0),
        COALESCE(p_dias_cobertura, 999),
        p_etiqueta_margen,
        CASE WHEN v_should_notify THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (product_id) DO UPDATE SET
        previous_status = EXCLUDED.previous_status,
        status = EXCLUDED.status,
        stock_at_evaluation = EXCLUDED.stock_at_evaluation,
        punto_reposicion = EXCLUDED.punto_reposicion,
        stock_objetivo = EXCLUDED.stock_objetivo,
        cantidad_recomendada = EXCLUDED.cantidad_recomendada,
        dias_cobertura = EXCLUDED.dias_cobertura,
        etiqueta_margen = EXCLUDED.etiqueta_margen,
        alert_sent_at = CASE WHEN v_should_notify THEN NOW() ELSE product_replenishment_state.alert_sent_at END,
        last_evaluated_at = NOW();

    -- Marcar la cola como completada con su processed_at definitivo
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.replenishment_queue
        SET status = 'completed',
            processed_at = NOW(),
            last_error = NULL
        WHERE id = p_queue_id;
    END IF;

    RETURN QUERY SELECT v_should_notify, v_prev_status, p_status;
END;
$$;
