-- ==============================================================================
-- Martina Supermercado - MIGRACIÓN DE SEGURIDAD INTEGRAL Y RLS
-- Archivo: 20260902000001_security_hardening_rls.sql
-- ==============================================================================

-- 1. FUNCIONES AUXILIARES DE SEGURIDAD (SECURITY DEFINER para prevenir recursión)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_employee()
RETURNS TABLE (
  id text,
  user_id uuid,
  email text,
  name text,
  role text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.id, e.user_id, e.email, e.name, e.role, e.active
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = auth.uid() AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = auth.uid() 
      AND active = true 
      AND role IN ('super_admin', 'owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_phone()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT phone FROM public.customer_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. ACTIVAR ROW LEVEL SECURITY EN TODAS LAS TABLAS
-- ------------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.offer_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- 3. LIMPIEZA DE POLÍTICAS EXISTENTES PARA EVITAR DUPLICADOS O POLÍTICAS PERMISIVAS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN (
        'products', 'categories', 'subcategories', 'orders', 'order_items',
        'customer_profiles', 'cash_movements', 'cash_closes', 'expenses',
        'employees', 'settings', 'whatsapp_messages', 'favorites', 'offers',
        'offer_redemptions', 'daily_delivery_assignments', 'admin_notification_reads'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 4. POLÍTICAS RLS: PRODUCTOS, CATEGORÍAS Y SUBCATEGORÍAS
-- ------------------------------------------------------------------------------

-- Productos: Lectura pública; Escritura restringida estrictamente a empleados
CREATE POLICY "products_select_public"
  ON public.products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "products_insert_employee"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "products_update_employee"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

CREATE POLICY "products_delete_employee"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_active_employee());

-- Categorías: Lectura pública; Escritura restringida a empleados
CREATE POLICY "categories_select_public"
  ON public.categories FOR SELECT
  TO public
  USING (true);

CREATE POLICY "categories_insert_employee"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "categories_update_employee"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

CREATE POLICY "categories_delete_employee"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_active_employee());

-- Subcategorías: Lectura pública; Escritura restringida a empleados
CREATE POLICY "subcategories_select_public"
  ON public.subcategories FOR SELECT
  TO public
  USING (true);

CREATE POLICY "subcategories_insert_employee"
  ON public.subcategories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "subcategories_update_employee"
  ON public.subcategories FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

CREATE POLICY "subcategories_delete_employee"
  ON public.subcategories FOR DELETE
  TO authenticated
  USING (public.is_active_employee());

-- 5. POLÍTICAS RLS: PEDIDOS Y DETALLES DE PEDIDO (ORDERS & ORDER_ITEMS)
-- ------------------------------------------------------------------------------

-- Órdenes:
-- - Empleados pueden ver todas las órdenes.
-- - Clientes autenticados solo pueden ver órdenes que coincidan con su teléfono registrado o su ID.
-- - Usuarios anónimos NO pueden ver órdenes del historial.
CREATE POLICY "orders_select_policy"
  ON public.orders FOR SELECT
  TO public
  USING (
    public.is_active_employee()
    OR (
      auth.role() = 'authenticated'
      AND phone IS NOT NULL
      AND phone = public.current_user_phone()
    )
  );

-- Inserción de pedidos:
-- - Empleados pueden insertar cualquier pedido (POS / Caja).
-- - Clientes públicos pueden insertar pedidos con estado 'Pendiente'.
CREATE POLICY "orders_insert_policy"
  ON public.orders FOR INSERT
  TO public
  WITH CHECK (
    public.is_active_employee()
    OR (
      status IN ('Pendiente', 'Por preparar')
      AND (payment_status IS NULL OR payment_status IN ('Pendiente'))
    )
  );

-- Modificación de pedidos: Exclusivo de empleados (cambiar estado, cancelar, etc.)
CREATE POLICY "orders_update_employee"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

-- Borrado de pedidos: Exclusivo de dueños/administradores
CREATE POLICY "orders_delete_admin"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());

-- Items de pedidos: Siguen la misma lógica de la orden asociada
CREATE POLICY "order_items_select_policy"
  ON public.order_items FOR SELECT
  TO public
  USING (
    public.is_active_employee()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.phone = public.current_user_phone()
    )
  );

CREATE POLICY "order_items_insert_policy"
  ON public.order_items FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "order_items_update_employee"
  ON public.order_items FOR UPDATE
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "order_items_delete_employee"
  ON public.order_items FOR DELETE
  TO authenticated
  USING (public.is_active_employee());

-- 6. POLÍTICAS RLS: PERFILES DE CLIENTES (CUSTOMER_PROFILES)
-- ------------------------------------------------------------------------------

-- Lectura:
-- - Empleados ven todos los clientes.
-- - Clientes autenticados solo ven su propio perfil (user_id = auth.uid()).
CREATE POLICY "customer_profiles_select"
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING (
    public.is_active_employee()
    OR user_id = auth.uid()
  );

-- Inserción:
-- - Empleados pueden crear perfiles de clientes desde el panel o POS.
-- - Clientes autenticados pueden registrar su perfil vinculado a su cuenta (user_id = auth.uid()).
-- - Clientes invitados pueden registrar su perfil durante el checkout web (user_id LIKE 'guest_%').
CREATE POLICY "customer_profiles_insert"
  ON public.customer_profiles FOR INSERT
  TO public
  WITH CHECK (
    public.is_active_employee()
    OR user_id = auth.uid()
    OR user_id IS NULL
    OR user_id::text LIKE 'guest_%'
  );

-- Modificación:
-- - Empleados pueden actualizar perfiles de clientes.
-- - Clientes solo pueden actualizar su propio perfil.
CREATE POLICY "customer_profiles_update"
  ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING (
    public.is_active_employee()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_active_employee()
    OR user_id = auth.uid()
  );

CREATE POLICY "customer_profiles_delete_admin"
  ON public.customer_profiles FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());

-- 7. POLÍTICAS RLS: CAJA Y MOVIMIENTOS FINANCIEROS (CASH_MOVEMENTS & CASH_CLOSES)
-- ------------------------------------------------------------------------------
-- CRÍTICO: Bloqueo absoluto para clientes y anónimos. Solo empleados activos.

CREATE POLICY "cash_movements_select_employee"
  ON public.cash_movements FOR SELECT
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "cash_movements_insert_employee"
  ON public.cash_movements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "cash_movements_update_employee"
  ON public.cash_movements FOR UPDATE
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

CREATE POLICY "cash_movements_delete_admin"
  ON public.cash_movements FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());

-- Cierres de caja:
CREATE POLICY "cash_closes_select_employee"
  ON public.cash_closes FOR SELECT
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "cash_closes_insert_employee"
  ON public.cash_closes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "cash_closes_update_admin"
  ON public.cash_closes FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner());

-- 8. POLÍTICAS RLS: GASTOS (EXPENSES)
-- ------------------------------------------------------------------------------
CREATE POLICY "expenses_select_employee"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "expenses_insert_employee"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "expenses_update_employee"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "expenses_delete_admin"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());

-- 9. POLÍTICAS RLS: EMPLEADOS (EMPLOYEES)
-- ------------------------------------------------------------------------------
-- Lectura: Solo empleados activos.
-- Escritura: Únicamente Owner y Super Admin (o Edge Functions mediante Service Role).
CREATE POLICY "employees_select_employee"
  ON public.employees FOR SELECT
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "employees_insert_admin"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner());

CREATE POLICY "employees_update_admin"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());

CREATE POLICY "employees_delete_admin"
  ON public.employees FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner());

-- 10. POLÍTICAS RLS: CONFIGURACIONES (SETTINGS)
-- ------------------------------------------------------------------------------
-- Lectura:
-- - Públicas: 'store_status', 'hero_banners', 'general_config', 'admin_tags'.
-- - Sensibles (caja, cuenta corriente, facturación): Solo empleados.
CREATE POLICY "settings_select_policy"
  ON public.settings FOR SELECT
  TO public
  USING (
    key IN ('store_status', 'hero_banners', 'general_config', 'admin_tags')
    OR public.is_active_employee()
  );

CREATE POLICY "settings_insert_admin"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner());

CREATE POLICY "settings_update_admin"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());

-- 11. POLÍTICAS RLS: MENSAJES DE WHATSAPP (WHATSAPP_MESSAGES)
-- ------------------------------------------------------------------------------
CREATE POLICY "whatsapp_messages_select_employee"
  ON public.whatsapp_messages FOR SELECT
  TO authenticated
  USING (public.is_active_employee());

CREATE POLICY "whatsapp_messages_insert_employee"
  ON public.whatsapp_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_employee());

CREATE POLICY "whatsapp_messages_update_employee"
  ON public.whatsapp_messages FOR UPDATE
  TO authenticated
  USING (public.is_active_employee());

-- 12. POLÍTICAS RLS: FAVORITOS (FAVORITES)
-- ------------------------------------------------------------------------------
CREATE POLICY "favorites_all_user"
  ON public.favorites FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 13. POLÍTICAS RLS: OFERTAS Y REDENCIONES (OFFERS & OFFER_REDEMPTIONS)
-- ------------------------------------------------------------------------------
CREATE POLICY "offers_select_public"
  ON public.offers FOR SELECT
  TO public
  USING (true);

CREATE POLICY "offers_modify_admin"
  ON public.offers FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());

CREATE POLICY "offer_redemptions_select"
  ON public.offer_redemptions FOR SELECT
  TO public
  USING (public.is_active_employee());

CREATE POLICY "offer_redemptions_insert"
  ON public.offer_redemptions FOR INSERT
  TO public
  WITH CHECK (true);

-- 14. OTRAS TABLAS AUXILIARES
-- ------------------------------------------------------------------------------
CREATE POLICY "delivery_assignments_employee"
  ON public.daily_delivery_assignments FOR ALL
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

CREATE POLICY "notification_reads_employee"
  ON public.admin_notification_reads FOR ALL
  TO authenticated
  USING (public.is_active_employee())
  WITH CHECK (public.is_active_employee());

-- ==============================================================================
-- 15. PROCEDIMIENTO ALMACENADO SEGURO: PROCESAMIENTO TRANSACCIONAL DE POS
-- ==============================================================================
-- Valida servidor-side precios, stock, caja, descuenta stock con FOR UPDATE
-- y genera la orden y el movimiento de caja de forma atómica.

CREATE OR REPLACE FUNCTION public.process_pos_sale(p_sale jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee record;
  v_item jsonb;
  v_prod record;
  v_item_price numeric;
  v_item_qty numeric;
  v_item_subtotal numeric;
  v_subtotal numeric := 0;
  v_global_discount_percent numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric := 0;
  v_order_id text;
  v_payment_method text;
  v_cash_register_open boolean := false;
  v_customer_name text;
  v_customer_phone text;
  v_customer_dni text;
BEGIN
  -- 1. Validar que quien ejecuta la venta sea un empleado activo
  SELECT * INTO v_employee
  FROM public.employees
  WHERE user_id = auth.uid() AND active = true
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren credenciales de empleado activo para operar en el Punto de Venta.';
  END IF;

  -- 2. Validar parámetros básicos de la venta
  v_order_id := p_sale->>'id';
  IF v_order_id IS NULL OR length(trim(v_order_id)) = 0 THEN
    v_order_id := 'LOC-' || upper(substr(md5(random()::text), 1, 6));
  END IF;

  v_payment_method := coalesce(p_sale->>'paymentMethod', 'cash');

  -- 3. Verificar estado de caja registradora en settings
  SELECT coalesce((value->>'isOpen')::boolean, false) INTO v_cash_register_open
  FROM public.settings
  WHERE key = 'cash_register';

  IF v_payment_method = 'cash' AND NOT v_cash_register_open THEN
    RAISE EXCEPTION 'La caja registradora se encuentra cerrada. Debe abrir la caja antes de registrar ventas en efectivo.';
  END IF;

  -- 4. Validar que vengan ítems
  IF jsonb_array_length(p_sale->'items') = 0 THEN
    RAISE EXCEPTION 'No se pueden registrar ventas sin ítems.';
  END IF;

  -- 5. Procesar ítems con bloqueo FOR UPDATE, validar stock y recalcular precios reales desde la BD
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale->'items')
  LOOP
    v_item_qty := coalesce((v_item->>'quantity')::numeric, 1);
    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad de producto inválida (%): debe ser mayor a 0.', v_item->>'name';
    END IF;

    -- Bloqueo pesimista del producto para evitar condiciones de carrera en inventario
    SELECT id, name, price, stock, sale_type INTO v_prod
    FROM public.products
    WHERE id = (v_item->>'id')
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'El producto % (ID: %) no existe en la base de datos.', v_item->>'name', v_item->>'id';
    END IF;

    -- Comprobar stock
    IF v_prod.stock < v_item_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto "%". Stock disponible: %, Solicitado: %', 
        v_prod.name, v_prod.stock, v_item_qty;
    END IF;

    -- Descontar stock atómicamente
    UPDATE public.products
    SET stock = stock - v_item_qty,
        updated_at = now()
    WHERE id = v_prod.id;

    -- El precio utilizado es el precio REAL de la base de datos
    v_item_price := v_prod.price;
    v_item_subtotal := v_item_price * v_item_qty;
    v_subtotal := v_subtotal + v_item_subtotal;
  END LOOP;

  -- 6. Calcular descuento global si aplica (validado entre 0% y 100%)
  v_global_discount_percent := coalesce((p_sale->>'globalDiscount')::numeric, 0);
  IF v_global_discount_percent < 0 OR v_global_discount_percent > 100 THEN
    RAISE EXCEPTION 'Porcentaje de descuento inválido: %', v_global_discount_percent;
  END IF;

  IF v_global_discount_percent > 0 THEN
    v_discount_amount := round((v_subtotal * (v_global_discount_percent / 100.0)), 2);
  END IF;

  v_total := v_subtotal - v_discount_amount;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'El total calculado de la venta no puede ser negativo.';
  END IF;

  v_customer_name := coalesce(p_sale->>'customer', 'Cliente Local');
  v_customer_phone := p_sale->>'phone';
  v_customer_dni := p_sale->>'dni';

  -- 7. Insertar orden en la tabla orders
  INSERT INTO public.orders (
    id,
    branch_id,
    date,
    timestamp,
    customer,
    phone,
    dni,
    address,
    delivery_time,
    method,
    payment_method,
    payment_status,
    status,
    total,
    paid_amount,
    discount,
    discount_label
  ) VALUES (
    v_order_id,
    coalesce(p_sale->>'branch_id', 'main'),
    to_char(now(), 'DD/MM/YYYY HH24:MI'),
    extract(epoch from now()) * 1000,
    v_customer_name,
    v_customer_phone,
    v_customer_dni,
    'Compra en local',
    'Inmediato',
    'Caja Fija',
    v_payment_method,
    CASE WHEN v_payment_method = 'cuenta_corriente' THEN 'Pendiente' ELSE 'Pagado' END,
    'Entregado',
    v_total,
    CASE WHEN v_payment_method = 'cuenta_corriente' THEN 0 ELSE v_total END,
    v_discount_amount,
    CASE WHEN v_global_discount_percent > 0 THEN ('Descuento ' || v_global_discount_percent || '%') ELSE NULL END
  );

  -- 8. Insertar ítems en order_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale->'items')
  LOOP
    SELECT price, name INTO v_prod FROM public.products WHERE id = (v_item->>'id');
    v_item_qty := coalesce((v_item->>'quantity')::numeric, 1);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      name,
      price,
      quantity,
      image
    ) VALUES (
      v_order_id,
      v_item->>'id',
      coalesce(v_prod.name, v_item->>'name'),
      v_prod.price,
      v_item_qty,
      v_item->>'image'
    );
  END LOOP;

  -- 9. Registrar movimiento de caja si el método de pago es efectivo
  IF v_payment_method = 'cash' THEN
    INSERT INTO public.cash_movements (
      id,
      branch_id,
      type,
      amount,
      description,
      timestamp,
      cashier,
      order_id
    ) VALUES (
      'mov_' || v_order_id,
      coalesce(p_sale->>'branch_id', 'main'),
      'Ingreso',
      v_total,
      'Venta Local (Efectivo) - ' || jsonb_array_length(p_sale->'items') || ' ítems',
      extract(epoch from now()) * 1000,
      v_employee.name,
      v_order_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount_amount,
    'total', v_total,
    'cashier', v_employee.name
  );
END;
$$;

-- Otorgar ejecución de la función a usuarios autenticados (la función valida internamente si es empleado)
GRANT EXECUTE ON FUNCTION public.process_pos_sale(jsonb) TO authenticated;

-- ==============================================================================
-- 16. PROCEDIMIENTO ALMACENADO SEGURO: PROCESAMIENTO TRANSACCIONAL DE PEDIDOS WEB
-- ==============================================================================
-- Valida stock, precios reales desde BD, descuenta stock y registra la orden y sus ítems.

CREATE OR REPLACE FUNCTION public.process_web_order(p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_prod record;
  v_item_qty numeric;
  v_item_price numeric;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric := 0;
  v_order_id text;
  v_customer_phone text;
BEGIN
  v_order_id := p_order->>'id';
  IF v_order_id IS NULL OR length(trim(v_order_id)) = 0 THEN
    v_order_id := 'WEB-' || upper(substr(md5(random()::text), 1, 6));
  END IF;

  IF jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  v_customer_phone := p_order->>'phone';
  IF v_customer_phone IS NULL OR length(trim(v_customer_phone)) = 0 THEN
    RAISE EXCEPTION 'Se requiere un número de teléfono de contacto válido.';
  END IF;

  -- 1. Validar y descontar stock de cada ítem con bloqueo pesimista
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
  LOOP
    v_item_qty := coalesce((v_item->>'quantity')::numeric, 1);
    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el ítem.';
    END IF;

    SELECT id, name, price, stock INTO v_prod
    FROM public.products
    WHERE id = (v_item->>'id')
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item->>'name';
    END IF;

    IF v_prod.stock < v_item_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para "%". Disponible: %, Solicitado: %',
        v_prod.name, v_prod.stock, v_item_qty;
    END IF;

    UPDATE public.products
    SET stock = stock - v_item_qty,
        updated_at = now()
    WHERE id = v_prod.id;

    v_item_price := v_prod.price;
    v_subtotal := v_subtotal + (v_item_price * v_item_qty);
  END LOOP;

  v_discount_amount := coalesce((p_order->>'discount')::numeric, 0);
  IF v_discount_amount < 0 THEN
    v_discount_amount := 0;
  END IF;

  v_total := v_subtotal - v_discount_amount;
  IF v_total < 0 THEN
    v_total := 0;
  END IF;

  -- 2. Insertar orden con estado 'Pendiente'
  INSERT INTO public.orders (
    id,
    branch_id,
    date,
    timestamp,
    customer,
    phone,
    dni,
    address,
    delivery_time,
    method,
    payment_method,
    payment_status,
    status,
    total,
    paid_amount,
    discount,
    discount_label,
    delivery_lat,
    delivery_lng,
    delivery_address_label,
    delivery_house_number,
    delivery_reference,
    delivery_notes,
    delivery_method
  ) VALUES (
    v_order_id,
    coalesce(p_order->>'branch_id', 'main'),
    coalesce(p_order->>'date', to_char(now(), 'DD/MM/YYYY HH24:MI')),
    coalesce((p_order->>'timestamp')::numeric, extract(epoch from now()) * 1000),
    coalesce(p_order->>'customer', 'Cliente Web'),
    v_customer_phone,
    p_order->>'dni',
    coalesce(p_order->>'address', 'Sin dirección'),
    p_order->>'delivery_time',
    coalesce(p_order->>'method', 'Envío'),
    coalesce(p_order->>'payment_method', 'efectivo'),
    'Pendiente',
    'Pendiente',
    v_total,
    0,
    v_discount_amount,
    p_order->>'discount_label',
    (p_order->>'delivery_lat')::numeric,
    (p_order->>'delivery_lng')::numeric,
    p_order->>'delivery_address_label',
    p_order->>'delivery_house_number',
    p_order->>'delivery_reference',
    p_order->>'delivery_notes',
    p_order->>'delivery_method'
  );

  -- 3. Insertar order_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items')
  LOOP
    SELECT price, name INTO v_prod FROM public.products WHERE id = (v_item->>'id');
    v_item_qty := coalesce((v_item->>'quantity')::numeric, 1);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      name,
      price,
      quantity,
      image
    ) VALUES (
      v_order_id,
      v_item->>'id',
      coalesce(v_prod.name, v_item->>'name'),
      v_prod.price,
      v_item_qty,
      v_item->>'image'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount_amount,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_web_order(jsonb) TO public;

