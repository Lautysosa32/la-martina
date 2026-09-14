-- ==============================================================================
-- Migración: Corrección de Estados y Política RLS para la tabla "orders"
-- ==============================================================================
-- Ejecutar este script en el SQL Editor de Supabase.
--
-- MOTIVO:
-- 1. El constraint "orders_status_check" no admitía 'Pendiente' ni 'Listo', causando:
--    violates check constraint "orders_status_check"
-- 2. La política RLS "orders_insert_policy" exigía para clientes no-empleados
--    que el estado fuera exclusivamente 'Pendiente' o 'Por preparar', lo que
--    entraba en contradicción directa con el check constraint.
--
-- SOLUCIÓN:
-- 1. Actualizar el CHECK constraint para permitir todos los estados válidos del sistema.
-- 2. Actualizar la política RLS para permitir insertar pedidos nuevos ('Nuevo' o 'Pendiente').

-- 1. Actualizar CHECK constraint en tabla orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status = ANY (ARRAY[
    'Nuevo'::text, 
    'Pendiente'::text, 
    'Preparando'::text, 
    'Listo'::text, 
    'En Camino'::text, 
    'Entregado'::text, 
    'Cancelado'::text
  ]));

-- 2. Asegurar que orders_payment_status_check permita 'Pendiente', 'Pagado' y 'Fallido'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
  CHECK (payment_status = ANY (ARRAY[
    'Pendiente'::text, 
    'Pagado'::text, 
    'Fallido'::text
  ]));

-- 3. Actualizar política RLS para inserción de pedidos (permite tanto empleados como clientes web)
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;

CREATE POLICY "orders_insert_policy" ON public.orders 
  FOR INSERT 
  WITH CHECK (
    public.is_active_employee() OR 
    (
      (status = ANY (ARRAY['Nuevo'::text, 'Pendiente'::text, 'Por preparar'::text])) AND
      (payment_status IS NULL OR payment_status = ANY (ARRAY['Pendiente'::text, 'Pagado'::text]))
    )
  );
