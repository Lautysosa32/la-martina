-- ==============================================================================
-- Actualización de funciones RPC para resolver ambigüedad de attempts
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
