-- Actualizar get_authenticated_checkout_token para soportar fallback de teléfono provisto por el usuario
-- y evitar bloquear a usuarios autenticados que no tengan teléfono en su perfil aún.

DROP FUNCTION IF EXISTS public.get_authenticated_checkout_token();
DROP FUNCTION IF EXISTS public.get_authenticated_checkout_token(text);

CREATE OR REPLACE FUNCTION public.get_authenticated_checkout_token(p_phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_phone text;
  v_token uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 1. Buscar teléfono en perfiles de cliente asociados al user_id
  SELECT phone INTO v_phone
  FROM public.customer_profiles
  WHERE user_id = v_user_id AND active = true
  LIMIT 1;

  -- 2. Fallback: buscar en perfiles de cliente por email de auth.users si no tenía user_id asignado
  IF v_phone IS NULL THEN
    SELECT cp.phone INTO v_phone
    FROM public.customer_profiles cp
    JOIN auth.users u ON lower(u.email) = lower(cp.email)
    WHERE u.id = v_user_id AND cp.active = true
    LIMIT 1;
  END IF;

  -- 3. Fallback: teléfono en auth.users
  IF v_phone IS NULL THEN
    SELECT phone INTO v_phone
    FROM auth.users
    WHERE id = v_user_id;
  END IF;

  -- 4. Fallback: teléfono provisto por el usuario en el formulario de checkout
  IF (v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 8) AND p_phone IS NOT NULL THEN
    v_phone := p_phone;
  END IF;

  -- 5. Si sigue sin teléfono, fallback genérico para que no falle la sesión autenticada
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 8 THEN
    v_phone := '0000000000';
  END IF;

  v_phone := regexp_replace(v_phone, '\D', '', 'g');

  -- Generar checkout token seguro
  v_token := gen_random_uuid();
  INSERT INTO public.checkout_tokens (token, phone, expires_at)
  VALUES (v_token, v_phone, now() + interval '60 minutes');

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authenticated_checkout_token(text) TO authenticated, anon;
