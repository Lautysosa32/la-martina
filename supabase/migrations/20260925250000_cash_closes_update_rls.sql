-- Permite a cualquier empleado activo registrar o actualizar el arqueo de caja (opening control)
DROP POLICY IF EXISTS "cash_closes_update_admin" ON public.cash_closes;
DROP POLICY IF EXISTS "cash_closes_update_employee" ON public.cash_closes;

CREATE POLICY "cash_closes_update_employee"
  ON public.cash_closes FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());
