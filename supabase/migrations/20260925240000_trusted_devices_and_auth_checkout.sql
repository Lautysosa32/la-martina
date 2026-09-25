-- Migration: Trusted Devices and Authenticated Checkout Tokens
-- Permite que los clientes autenticados o dispositivos previamente verificados obtengan checkout tokens sin solicitar OTP reiteradamente.

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  device_token uuid UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_phone ON public.trusted_devices(phone);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON public.trusted_devices(device_token);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trusted_devices FROM PUBLIC;

-- 1. Obtener checkout token para usuarios autenticados (con sesión activa en Supabase)
CREATE OR REPLACE FUNCTION public.get_authenticated_checkout_token()
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

  -- Buscar teléfono en perfiles de cliente
  SELECT phone INTO v_phone
  FROM public.customer_profiles
  WHERE user_id = v_user_id AND active = true
  LIMIT 1;

  IF v_phone IS NULL THEN
    -- Fallback: teléfono en auth.users
    SELECT phone INTO v_phone
    FROM auth.users
    WHERE id = v_user_id;
  END IF;

  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'El perfil de cliente no posee un teléfono válido registrado';
  END IF;

  v_phone := regexp_replace(v_phone, '\D', '', 'g');

  -- Generar checkout token seguro
  v_token := gen_random_uuid();
  INSERT INTO public.checkout_tokens (token, phone, expires_at)
  VALUES (v_token, v_phone, now() + interval '60 minutes');

  RETURN v_token;
END;
$$;

-- 2. Obtener checkout token para un dispositivo de confianza previamente validado con OTP
CREATE OR REPLACE FUNCTION public.get_trusted_checkout_token(p_phone text, p_device_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
  v_token uuid;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) < 8 OR p_device_token IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trusted_devices
    WHERE phone = v_clean_phone AND device_token = p_device_token
  ) THEN
    UPDATE public.trusted_devices
    SET last_used_at = now()
    WHERE phone = v_clean_phone AND device_token = p_device_token;

    v_token := gen_random_uuid();
    INSERT INTO public.checkout_tokens (token, phone, expires_at)
    VALUES (v_token, v_clean_phone, now() + interval '60 minutes');

    RETURN v_token;
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Registrar un dispositivo como confiable tras una verificación exitosa de OTP
CREATE OR REPLACE FUNCTION public.register_trusted_device(p_phone text, p_device_token uuid, p_checkout_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) < 8 OR p_device_token IS NULL OR p_checkout_token IS NULL THEN
    RETURN false;
  END IF;

  -- Comprobar que el checkout_token pertenece efectivamente a este teléfono
  IF NOT EXISTS (
    SELECT 1 FROM public.checkout_tokens
    WHERE token = p_checkout_token AND phone = v_clean_phone
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.trusted_devices (phone, device_token, last_used_at)
  VALUES (v_clean_phone, p_device_token, now())
  ON CONFLICT (device_token) DO UPDATE
  SET phone = v_clean_phone, last_used_at = now();

  RETURN true;
END;
$$;

-- Permisos
REVOKE EXECUTE ON FUNCTION public.get_authenticated_checkout_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_authenticated_checkout_token() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_trusted_checkout_token(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trusted_checkout_token(text, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.register_trusted_device(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_trusted_device(text, uuid, uuid) TO anon, authenticated;
