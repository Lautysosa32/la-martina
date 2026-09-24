-- Migración para arreglar la inserción del ID (TEXT) en orders
CREATE OR REPLACE FUNCTION public.insert_secure_order(
  p_order JSONB,
  p_items JSONB,
  p_checkout_token UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_record RECORD;
  v_order_id TEXT;
  v_item JSONB;
BEGIN
  -- 1. Validar el token atómicamente (FOR UPDATE)
  IF p_checkout_token IS NULL THEN
    RAISE EXCEPTION 'Checkout token is required';
  END IF;

  SELECT * INTO v_token_record
  FROM public.checkout_tokens
  WHERE token = p_checkout_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid checkout token';
  END IF;

  IF v_token_record.is_used THEN
    RAISE EXCEPTION 'Checkout token already used';
  END IF;

  IF v_token_record.expires_at < NOW() THEN
    RAISE EXCEPTION 'Checkout token expired';
  END IF;

  -- 2. Generar un ID seguro en el servidor para evitar nulos y colisiones
  v_order_id := 'WEB-' || (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  -- 3. Insertar Order (Los valores críticos fueron validados por la Edge Function)
  INSERT INTO public.orders (
    id,
    total, discount, discount_label, paid_amount,
    customer, phone, dni, status, payment_method,
    payment_status, address, delivery_time,
    delivery_lat, delivery_lng, method, 
    source, timestamp, date
  ) VALUES (
    v_order_id,
    COALESCE((p_order->>'total')::numeric, 0),
    COALESCE((p_order->>'discount')::numeric, 0),
    p_order->>'discountLabel',
    COALESCE((p_order->>'paid_amount')::numeric, 0),
    p_order->>'customer',
    v_token_record.phone, -- FORZAMOS EL TELÉFONO VERIFICADO
    p_order->>'dni',
    COALESCE(p_order->>'status', 'Pendiente'),
    COALESCE(p_order->>'payment_method', 'efectivo'),
    COALESCE(p_order->>'payment_status', 'Pendiente'),
    p_order->>'address',
    p_order->>'delivery_time',
    (p_order->>'delivery_lat')::numeric,
    (p_order->>'delivery_lng')::numeric,
    COALESCE(p_order->>'method', 'delivery'),
    'web',
    (EXTRACT(EPOCH FROM NOW()) * 1000)::numeric,
    TO_CHAR(NOW(), 'DD/MM/YYYY, HH24:MI')
  );

  -- 4. Insertar Items e impactar stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Descontar stock atómicamente asegurando disponibilidad
    UPDATE public.products
    SET stock = stock - (v_item->>'quantity')::numeric
    WHERE id = (v_item->>'id')::uuid
      AND stock >= (v_item->>'quantity')::numeric;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_item->>'id';
    END IF;

    -- Insertar el item asegurado
    INSERT INTO public.order_items (
      order_id, product_id, name, quantity, price
    ) VALUES (
      v_order_id,
      (v_item->>'id')::uuid,
      v_item->>'name',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric
    );
  END LOOP;

  -- 5. Marcar token como usado
  UPDATE public.checkout_tokens
  SET is_used = true
  WHERE token = p_checkout_token;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_secure_order(JSONB, JSONB, UUID) FROM PUBLIC;
-- Grant solo a service_role (Edge function)
GRANT EXECUTE ON FUNCTION public.insert_secure_order(JSONB, JSONB, UUID) TO service_role;
