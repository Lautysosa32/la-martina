-- ==============================================================================
-- Actualización de funciones RPC para permitir service_role y evitar ambigüedad
-- ==============================================================================

DROP FUNCTION IF EXISTS public.claim_replenishment_queue_batch(INT);

CREATE OR REPLACE FUNCTION public.claim_replenishment_queue_batch(p_max_batch INT DEFAULT 100)
RETURNS TABLE (
    queue_id UUID,
    product_id TEXT,
    job_attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recent_completed INT := 0;
    v_available_quota INT := 0;
    v_batch_limit INT := 0;
BEGIN
    -- Validamos permisos: service_role o empleados activos
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_active_employee() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Bloqueo consultivo transaccional global (evita carreras entre múltiples pestañas/workers)
    PERFORM pg_advisory_xact_lock(hashtext('replenishment_rate_limiter_global_lock'));

    -- A. LEASE RECOVERY: Recuperar trabajos que quedaron en 'processing' por más de 5 minutos
    UPDATE public.replenishment_queue
    SET status = 'pending',
        claimed_at = NULL,
        last_error = 'Lease timeout expirado: reseteado a pending'
    WHERE status = 'processing'
      AND claimed_at < NOW() - INTERVAL '5 minutes'
      AND attempts < 5;

    -- B. CONTADOR GLOBAL: Cuántas evaluaciones se han COMPLETADO en los últimos 15 minutos
    SELECT COUNT(*) INTO v_recent_completed
    FROM public.replenishment_queue
    WHERE status = 'completed'
      AND processed_at >= NOW() - INTERVAL '15 minutes';

    -- Límite estricto de 1.000 cada 15 minutos
    v_available_quota := GREATEST(0, 1000 - v_recent_completed);

    IF v_available_quota <= 0 THEN
        -- Sin cupo disponible dentro de la ventana actual de 15 minutos
        RETURN;
    END IF;

    -- Si hay cupo, tomar solo hasta el mínimo entre: cupo disponible y p_max_batch solicitado
    v_batch_limit := LEAST(v_available_quota, GREATEST(1, p_max_batch));

    -- C. RECLAMO ATÓMICO: FOR UPDATE SKIP LOCKED
    RETURN QUERY
    WITH selected_items AS (
        SELECT q.id
        FROM public.replenishment_queue q
        WHERE q.status = 'pending'
        ORDER BY q.priority DESC, q.created_at ASC
        LIMIT v_batch_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.replenishment_queue u
    SET status = 'processing',
        claimed_at = NOW(),
        processed_at = NULL,
        attempts = u.attempts + 1
    FROM selected_items s
    WHERE u.id = s.id
    RETURNING u.id, u.product_id, u.attempts;
END;
$$;

DROP FUNCTION IF EXISTS public.save_replenishment_evaluation(UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.save_replenishment_evaluation(
    p_queue_id UUID,
    p_product_id TEXT,
    p_status TEXT,
    p_stock_at_evaluation NUMERIC,
    p_punto_reposicion NUMERIC,
    p_stock_objetivo NUMERIC,
    p_cantidad_recomendada NUMERIC,
    p_dias_cobertura NUMERIC,
    p_etiqueta_margen TEXT
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
        p_stock_at_evaluation,
        p_punto_reposicion,
        p_stock_objetivo,
        p_cantidad_recomendada,
        p_dias_cobertura,
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
