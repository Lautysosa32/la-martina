-- ==============================================================================
-- Martina Supermercado - REPOSICIÓN INTELIGENTE EVENT-DRIVEN (Paso 1)
-- ==============================================================================

-- 1. TABLA: replenishment_queue (Cola de evaluación por eventos de stock)
CREATE TABLE IF NOT EXISTS public.replenishment_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INT NOT NULL DEFAULT 1, -- 1: Normal, 2: Alta (ej: llegó a stock 0)
    reason TEXT NOT NULL DEFAULT 'stock_change',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT
);

-- Índice único condicional: garantiza que un producto solo tenga 1 trabajo activo (pending o processing)
CREATE UNIQUE INDEX IF NOT EXISTS idx_replenishment_queue_active_product
ON public.replenishment_queue (product_id)
WHERE status IN ('pending', 'processing');

-- Índice para reclamo rápido por prioridad y antigüedad
CREATE INDEX IF NOT EXISTS idx_replenishment_queue_pending_fetch
ON public.replenishment_queue (status, priority DESC, created_at ASC)
WHERE status = 'pending';

-- Índice para el rate limiter de 15 minutos (evaluaciones completadas)
CREATE INDEX IF NOT EXISTS idx_replenishment_queue_rate_limit
ON public.replenishment_queue (processed_at)
WHERE status = 'completed';

-- 2. TABLA: product_replenishment_state (Estado persistente de la última evaluación)
CREATE TABLE IF NOT EXISTS public.product_replenishment_state (
    product_id TEXT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'OK' CHECK (status IN ('OK', 'REPOSICION', 'SIN_STOCK', 'SIN_HISTORIAL')),
    previous_status TEXT,
    stock_at_evaluation NUMERIC NOT NULL DEFAULT 0,
    punto_reposicion NUMERIC,
    stock_objetivo NUMERIC,
    cantidad_recomendada NUMERIC,
    dias_cobertura NUMERIC,
    etiqueta_margen TEXT,
    alert_sent_at TIMESTAMPTZ,
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_replenishment_state_status
ON public.product_replenishment_state (status, dias_cobertura ASC);

-- 3. POLÍTICAS RLS (Seguridad)
ALTER TABLE public.replenishment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_replenishment_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "replenishment_queue_employee_access" ON public.replenishment_queue;
    CREATE POLICY "replenishment_queue_employee_access"
    ON public.replenishment_queue FOR ALL
    TO authenticated
    USING (public.is_active_employee())
    WITH CHECK (public.is_active_employee());

    DROP POLICY IF EXISTS "replenishment_state_employee_access" ON public.product_replenishment_state;
    CREATE POLICY "replenishment_state_employee_access"
    ON public.product_replenishment_state FOR ALL
    TO authenticated
    USING (public.is_active_employee())
    WITH CHECK (public.is_active_employee());
END$$;

-- 4. TRIGGER FUNCTION: Encolar producto cuando cambia su stock
CREATE OR REPLACE FUNCTION public.fn_enqueue_stock_change_replenishment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_priority INT := 1;
    v_reason TEXT := 'stock_change';
BEGIN
    -- Si el stock baja a 0, elevamos la prioridad
    IF NEW.stock <= 0 THEN
        v_priority := 2;
        v_reason := 'stock_zero';
    END IF;

    -- Insertar en cola; si ya está pendiente o en proceso para este producto, no duplicar
    INSERT INTO public.replenishment_queue (product_id, priority, reason)
    VALUES (NEW.id, v_priority, v_reason)
    ON CONFLICT (product_id) WHERE status IN ('pending', 'processing')
    DO NOTHING;

    RETURN NEW;
END;
$$;

-- Trigger sobre la tabla products
DROP TRIGGER IF EXISTS trg_product_stock_replenishment_queue ON public.products;
CREATE TRIGGER trg_product_stock_replenishment_queue
AFTER UPDATE OF stock ON public.products
FOR EACH ROW
WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION public.fn_enqueue_stock_change_replenishment();

-- 5. RPC ATÓMICO: Reclamar lote de productos con límite global de 1000 cada 15 min y lease recovery
CREATE OR REPLACE FUNCTION public.claim_replenishment_queue_batch(p_max_batch INT DEFAULT 100)
RETURNS TABLE (
    queue_id UUID,
    product_id TEXT,
    attempts INT
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
    RETURNING u.id AS queue_id, u.product_id, u.attempts;
END;
$$;

-- 6. RPC ATÓMICO: Guardar evaluación completada, actualizar estado y detectar transición de alerta
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
