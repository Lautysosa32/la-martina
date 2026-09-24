-- ==============================================================================
-- Migración: Corrección de RLS y Seguridad en product_deletions
-- Fecha: 2026-09-17
-- ==============================================================================

-- 1. Asegurar la tabla product_deletions
CREATE TABLE IF NOT EXISTS public.product_deletions (
    product_id text PRIMARY KEY,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. Habilitar RLS
ALTER TABLE public.product_deletions ENABLE ROW LEVEL SECURITY;

-- 3. Definir la función trigger con SECURITY DEFINER para que se ejecute con privilegios del creador
-- y no falle ante las políticas RLS del usuario que ejecuta el DELETE en products.
CREATE OR REPLACE FUNCTION public.trg_record_product_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.product_deletions (product_id, deleted_at)
    VALUES (OLD.id, now())
    ON CONFLICT (product_id) DO UPDATE SET deleted_at = now();
    RETURN OLD;
END;
$$;

-- 4. Recrear el trigger en products
DROP TRIGGER IF EXISTS product_hard_delete_audit ON public.products;
CREATE TRIGGER product_hard_delete_audit
AFTER DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_record_product_deletion();

-- 5. Políticas RLS explícitas para product_deletions por si se accede directamente
DROP POLICY IF EXISTS "product_deletions_insert_system" ON public.product_deletions;
CREATE POLICY "product_deletions_insert_system"
  ON public.product_deletions FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "product_deletions_select_all" ON public.product_deletions;
CREATE POLICY "product_deletions_select_all"
  ON public.product_deletions FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "product_deletions_update_system" ON public.product_deletions;
CREATE POLICY "product_deletions_update_system"
  ON public.product_deletions FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
