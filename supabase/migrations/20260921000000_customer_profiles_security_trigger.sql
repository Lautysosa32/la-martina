-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD FISCAL Y CONTABLE: BLINDAJE DE CUSTOMER_PROFILES Y PRODUCTS
-- Fecha: 21 de Septiembre de 2026
-- ==============================================================================

-- 1. FUNCIÓN Y TRIGGER: PROTECCIÓN DE SALDO Y LÍMITES EN CUSTOMER_PROFILES
-- Impide de forma absoluta que un cliente (o usuario autenticado no empleado)
-- pueda modificar campos financieros o de control contable mediante PostgREST / Supabase.
CREATE OR REPLACE FUNCTION public.check_customer_profile_financial_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Si quien ejecuta NO es un empleado activo ni service_role:
  IF NOT (
    public.is_active_employee() 
    OR current_user = 'service_role' 
    OR auth.role() = 'service_role'
  ) THEN
    -- A) Impedir manipulación de deuda / balance
    IF NEW.current_account_balance IS DISTINCT FROM OLD.current_account_balance THEN
      RAISE EXCEPTION 'Acceso denegado: No cuenta con autorización para modificar el saldo contable de la cuenta corriente.';
    END IF;

    -- B) Impedir manipulación de límites de crédito
    IF NEW.current_account_limit IS DISTINCT FROM OLD.current_account_limit THEN
      RAISE EXCEPTION 'Acceso denegado: No cuenta con autorización para modificar el límite de crédito de la cuenta corriente.';
    END IF;

    -- C) Impedir auto-habilitación de cuenta corriente
    IF NEW.has_current_account IS DISTINCT FROM OLD.has_current_account THEN
      RAISE EXCEPTION 'Acceso denegado: No cuenta con autorización para habilitar o deshabilitar la cuenta corriente.';
    END IF;

    -- D) Impedir auto-desbloqueo de cuentas morosas
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      RAISE EXCEPTION 'Acceso denegado: No cuenta con autorización para alterar el estado de bloqueo.';
    END IF;

    -- E) Impedir secuestro o reasignación de user_id
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Acceso denegado: No está permitido transferir el identificador de usuario asociado al perfil.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_customer_profile_financial_security ON public.customer_profiles;
CREATE TRIGGER trg_customer_profile_financial_security
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_customer_profile_financial_fields();

-- 2. REVISIÓN DE PERMISOS: PRODUCTS DELETE
-- Solo los roles autorizados (admin, owner, super_admin) pueden eliminar productos del catálogo.
DROP POLICY IF EXISTS "products_delete_employee" ON public.products;
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;

CREATE POLICY "products_delete_admin"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());
