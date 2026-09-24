-- Migration: Secure OTP Checkout

CREATE TABLE IF NOT EXISTS public.otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts int DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_invalidated boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON public.otp_requests(phone);

CREATE TABLE IF NOT EXISTS public.checkout_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  is_used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkout_tokens_token ON public.checkout_tokens(token);
CREATE INDEX IF NOT EXISTS idx_checkout_tokens_phone ON public.checkout_tokens(phone);

-- Habilitar RLS
ALTER TABLE public.otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_tokens ENABLE ROW LEVEL SECURITY;
-- Al no haber políticas, nadie (ni siquiera anon o authenticated) puede hacer SELECT/INSERT/UPDATE directo.
-- Solo pueden acceder los RPC definidos con SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.request_otp(p_phone text, p_customer_name text DEFAULT 'Cliente')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
  v_last_request timestamp with time zone;
  v_code text;
  v_hash text;
BEGIN
  -- 1. Normalizar el teléfono (quitar no-dígitos)
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) < 8 THEN
    RAISE EXCEPTION 'Teléfono inválido';
  END IF;

  -- 2. Rate limiting: verificar última solicitud
  SELECT created_at INTO v_last_request
  FROM public.otp_requests
  WHERE phone = v_clean_phone
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_request IS NOT NULL AND (now() - v_last_request) < interval '60 seconds' THEN
    RAISE EXCEPTION 'Debes esperar 60 segundos antes de solicitar otro código';
  END IF;

  -- 3. Invalidar códigos anteriores del mismo número
  UPDATE public.otp_requests
  SET is_invalidated = true
  WHERE phone = v_clean_phone AND is_invalidated = false;

  -- 4. Generar código de 4 dígitos
  v_code := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  
  -- 5. Hashear el código
  v_hash := crypt(v_code, gen_salt('bf', 8));

  -- 6. Insertar solicitud de OTP con 5 minutos de expiración
  INSERT INTO public.otp_requests (phone, code_hash, expires_at)
  VALUES (v_clean_phone, v_hash, now() + interval '5 minutes');

  -- 7. Encolar el mensaje de WhatsApp para que el worker lo envíe
  INSERT INTO public.whatsapp_messages (phone, customer_name, type, title, message, customer_phone, status)
  VALUES (
    v_clean_phone,
    COALESCE(p_customer_name, 'Cliente'),
    'otp_verification',
    'OTP: ' || v_code,
    '🔐 *Martina Supermercado* - Código de Verificación:' || E'\n\n' || 'Tu código es: *' || v_code || '*' || E'\n\n' || 'Ingresalo en la pantalla para confirmar tu pedido. No compartas este código con nadie.',
    v_clean_phone,
    'pending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_otp(p_phone text, p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone text;
  v_req record;
  v_token uuid;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- 1. Buscar el OTP vigente más reciente
  SELECT * INTO v_req
  FROM public.otp_requests
  WHERE phone = v_clean_phone AND is_invalidated = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay un código pendiente para este número';
  END IF;

  -- 2. Comprobar expiración
  IF v_req.expires_at < now() THEN
    UPDATE public.otp_requests SET is_invalidated = true WHERE id = v_req.id;
    RAISE EXCEPTION 'El código ha expirado';
  END IF;

  -- 3. Comprobar intentos máximos
  IF v_req.attempts >= 3 THEN
    UPDATE public.otp_requests SET is_invalidated = true WHERE id = v_req.id;
    RAISE EXCEPTION 'Demasiados intentos fallidos. Solicita un nuevo código.';
  END IF;

  -- 4. Verificar hash
  IF v_req.code_hash = crypt(p_code, v_req.code_hash) THEN
    -- Éxito: Invalidar OTP
    UPDATE public.otp_requests SET is_invalidated = true WHERE id = v_req.id;

    -- Generar checkout token seguro
    v_token := gen_random_uuid();
    INSERT INTO public.checkout_tokens (token, phone, expires_at)
    VALUES (v_token, v_clean_phone, now() + interval '60 minutes');

    RETURN v_token;
  ELSE
    -- Fallo: incrementar intentos
    UPDATE public.otp_requests SET attempts = attempts + 1 WHERE id = v_req.id;
    RAISE EXCEPTION 'Código incorrecto';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_order(p_order jsonb, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout record;
  v_order_phone text;
  v_clean_order_phone text;
BEGIN
  -- 1. Buscar token
  SELECT * INTO v_checkout
  FROM public.checkout_tokens
  WHERE token = p_token AND is_used = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de autorización inválido o ya utilizado';
  END IF;

  -- 2. Comprobar expiración del token
  IF v_checkout.expires_at < now() THEN
    RAISE EXCEPTION 'El token de autorización ha expirado';
  END IF;

  -- 3. Extraer el teléfono del payload de la orden
  v_order_phone := p_order->>'phone';
  IF v_order_phone IS NULL THEN
    RAISE EXCEPTION 'El pedido no tiene un número de teléfono';
  END IF;

  v_clean_order_phone := regexp_replace(v_order_phone, '\D', '', 'g');

  -- 4. Validar que el token pertenece al mismo teléfono
  IF v_clean_order_phone != v_checkout.phone THEN
    RAISE EXCEPTION 'El número de teléfono del pedido no coincide con el autorizado';
  END IF;

  -- 5. Insertar el pedido en la base de datos (seguro porque el teléfono está validado)
  INSERT INTO public.orders (
    id, branch_id, date, timestamp, customer, phone, address, 
    delivery_time, method, payment_method, payment_status, status, 
    total, paid_amount, discount, discount_label, source, dni,
    delivery_lat, delivery_lng, delivery_address_label, delivery_house_number, 
    delivery_reference, delivery_notes, delivery_method
  ) VALUES (
    p_order->>'id',
    COALESCE(p_order->>'branch_id', 'main'),
    p_order->>'date',
    COALESCE((p_order->>'timestamp')::bigint, (extract(epoch from now()) * 1000)::bigint),
    p_order->>'customer',
    p_order->>'phone',
    p_order->>'address',
    p_order->>'delivery_time',
    p_order->>'method',
    p_order->>'payment_method',
    COALESCE(p_order->>'payment_status', 'Pendiente'),
    COALESCE(p_order->>'status', 'Nuevo'),
    (p_order->>'total')::numeric,
    COALESCE((p_order->>'paid_amount')::numeric, 0),
    (p_order->>'discount')::numeric,
    p_order->>'discount_label',
    COALESCE(p_order->>'source', 'web'),
    p_order->>'dni',
    (p_order->>'delivery_lat')::numeric,
    (p_order->>'delivery_lng')::numeric,
    p_order->>'delivery_address_label',
    p_order->>'delivery_house_number',
    p_order->>'delivery_reference',
    p_order->>'delivery_notes',
    p_order->>'delivery_method'
  );

  -- 6. Marcar token como utilizado atómicamente
  UPDATE public.checkout_tokens SET is_used = true WHERE id = v_checkout.id;
END;
$$;

-- Restringir acceso público no autorizado a estas funciones auxiliares si se desea, 
-- pero necesitamos que anon las ejecute desde el frontend de React.
REVOKE EXECUTE ON FUNCTION public.create_guest_order(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.request_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_otp(text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_otp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_otp(text, text) TO anon, authenticated;

-- ELIMINAR LA POLÍTICA ANTERIOR QUE PERMITÍA INSERTS PÚBLICOS
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;

-- CREAR LA NUEVA POLÍTICA EXCLUSIVA PARA EMPLEADOS (El POS sigue funcionando, pero anon no)
CREATE POLICY "orders_insert_employee_only"
  ON public.orders FOR INSERT
  TO public
  WITH CHECK (
    public.is_active_employee()
  );
