-- Migración para establecer la Integridad Económica y cerrar inserciones públicas

-- 1. Asegurar order_items y orders para evitar manipulación de precios desde el cliente
DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
CREATE POLICY "order_items_insert_policy"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

-- 2. Eliminar el RPC inseguro anterior
DROP FUNCTION IF EXISTS public.create_guest_order(JSONB, UUID);

-- 3. Crear RPC seguro para invitados, que valida y crea todo atómicamente
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
  v_order_id UUID;
  v_item JSONB;
  v_prod RECORD;
  v_total_stock NUMERIC;
BEGIN
  -- 1. Validar el token atómicamente (FOR UPDATE)
  IF p_checkout_token IS NULL THEN
    RAISE EXCEPTION 'Checkout token is required';
  END IF;

  SELECT * INTO v_token_record
  FROM public.checkout_tokens
  WHERE id = p_checkout_token
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

  -- 2. Insertar Order (Los valores críticos fueron validados por la Edge Function)
  INSERT INTO public.orders (
    total, discount, discount_label, paid_amount,
    customer, phone, dni, status, payment_method,
    payment_status, address, delivery_time,
    delivery_lat, delivery_lng, delivery_address_label,
    delivery_house_number, delivery_reference, delivery_notes,
    delivery_method, source, timestamp, date
  ) VALUES (
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
    p_order->>'delivery_address_label',
    p_order->>'delivery_house_number',
    p_order->>'delivery_reference',
    p_order->>'delivery_notes',
    COALESCE(p_order->>'delivery_method', 'delivery'),
    'web',
    (EXTRACT(EPOCH FROM NOW()) * 1000)::numeric,
    TO_CHAR(NOW(), 'DD/MM/YYYY, HH24:MI')
  ) RETURNING id INTO v_order_id;

  -- 3. Insertar Items e impactar stock
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
      order_id, product_id, quantity, price, original_price, offer_id
    ) VALUES (
      v_order_id,
      (v_item->>'id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'originalPrice')::numeric,
      (v_item->>'offerId')::uuid
    );
  END LOOP;

  -- 4. Marcar token como usado
  UPDATE public.checkout_tokens
  SET is_used = true
  WHERE id = p_checkout_token;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_secure_order(JSONB, JSONB, UUID) FROM PUBLIC;
-- Grant solo a service_role (Edge function)
GRANT EXECUTE ON FUNCTION public.insert_secure_order(JSONB, JSONB, UUID) TO service_role;
