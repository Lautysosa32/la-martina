


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."current_user_phone"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT phone FROM public.customer_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."current_user_phone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_employee"() RETURNS TABLE("id" "text", "user_id" "uuid", "email" "text", "name" "text", "role" "text", "active" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.id, e.user_id, e.email, e.name, e.role, e.active
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_current_employee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_employee"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = auth.uid() AND active = true
  );
$$;


ALTER FUNCTION "public"."is_active_employee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = auth.uid() 
      AND active = true 
      AND role IN ('super_admin', 'owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pos_sale"("p_sale" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."process_pos_sale"("p_sale" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_web_order"("p_order" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."process_web_order"("p_order" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_notification_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "group_key" "text" NOT NULL,
    "last_read_value" numeric NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "cuit" "text" DEFAULT ''::"text",
    "address" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "tax_condition" "text" DEFAULT 'Consumidor Final'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."billing_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "is_main" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closes" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "date" "text" NOT NULL,
    "period" "text" NOT NULL,
    "total_sales" numeric(12,2) DEFAULT 0,
    "total_orders" integer DEFAULT 0,
    "cash_payments" numeric(12,2) DEFAULT 0,
    "card_payments" numeric(12,2) DEFAULT 0,
    "transfer_payments" numeric(12,2) DEFAULT 0,
    "closed_at" "text",
    "total_withdrawals" numeric(12,2) DEFAULT 0,
    "initial_amount" numeric(12,2),
    "movement_ids" "text"[] DEFAULT '{}'::"text"[],
    "withdrawals" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "opening_control_expected" numeric DEFAULT 0,
    "opening_control_counted" numeric DEFAULT 0,
    "opening_control_difference" numeric DEFAULT 0,
    "opening_control_notes" "text" DEFAULT ''::"text",
    "opening_control_checked_by" "text" DEFAULT ''::"text",
    "opening_control_checked_at" "text" DEFAULT ''::"text",
    "cuenta_corriente_payments" numeric DEFAULT 0,
    CONSTRAINT "cash_closes_period_check" CHECK (("period" = ANY (ARRAY['diario'::"text", 'semanal'::"text", 'mensual'::"text"])))
);


ALTER TABLE "public"."cash_closes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_movements" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "cashier" "text" DEFAULT ''::"text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "timestamp" bigint DEFAULT ((EXTRACT(epoch FROM "now"()) * (1000)::numeric))::bigint NOT NULL,
    "order_id" "text",
    "session_id" "text",
    "created_by" "text",
    CONSTRAINT "cash_movements_type_check" CHECK (("type" = ANY (ARRAY['Ingreso'::"text", 'Egreso'::"text", 'Retiro'::"text"])))
);


ALTER TABLE "public"."cash_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_sessions" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text",
    "cashier_id" "uuid",
    "cashier_name" "text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text",
    "opening_amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "expected_cash_amount" numeric(12,2) DEFAULT 0.00,
    "counted_cash_amount" numeric(12,2),
    "difference_amount" numeric(12,2) DEFAULT 0.00,
    "total_cash_sales" numeric(12,2) DEFAULT 0.00,
    "total_transfer_sales" numeric(12,2) DEFAULT 0.00,
    "total_card_sales" numeric(12,2) DEFAULT 0.00,
    "total_withdrawals" numeric(12,2) DEFAULT 0.00,
    "total_expenses" numeric(12,2) DEFAULT 0.00,
    "total_manual_incomes" numeric(12,2) DEFAULT 0.00,
    "notes" "text",
    "opened_by" "text",
    "closed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cash_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."cash_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "label" "text" DEFAULT 'Casa'::"text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "address_label" "text" NOT NULL,
    "house_number" "text" NOT NULL,
    "reference" "text" NOT NULL,
    "notes" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "product_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."customer_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "phone" "text" NOT NULL,
    "name" "text" NOT NULL,
    "last_name" "text",
    "email" "text",
    "address" "text",
    "branch_id" "text" DEFAULT 'main'::"text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "address_lat" double precision,
    "address_lng" double precision,
    "nombre" "text",
    "apellido" "text",
    "direccion" "text",
    "dni" "text",
    "birthday" "text",
    "hasCurrentAccount" boolean DEFAULT false,
    "creditLimit" numeric DEFAULT 50000,
    "isManual" boolean DEFAULT false,
    "useCustomAccountLimits" boolean DEFAULT false,
    "customDebtLimit" numeric,
    "customDebtDays" integer,
    "accountLimitNotes" "text"
);


ALTER TABLE "public"."customer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_delivery_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "employee_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "daily_delivery_assignments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."daily_delivery_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "branch_id" "text",
    "active" boolean DEFAULT true NOT NULL,
    "permissions_override" "jsonb" DEFAULT '{"deny": [], "allow": []}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "phone" "text"
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "supplier_name" "text",
    "amount" numeric NOT NULL,
    "payment_method" "text" NOT NULL,
    "description" "text",
    "observations" "text",
    "receipt_url" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expense_date" "text",
    "payment_status" character varying DEFAULT 'paid'::character varying,
    "cancellation_date" timestamp with time zone,
    "cancellation_method" character varying,
    "last_activity_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" integer NOT NULL,
    "invoice_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(10,3) DEFAULT 1 NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 21 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoice_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."invoice_items_id_seq" OWNED BY "public"."invoice_items"."id";



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "date" "text" NOT NULL,
    "serie" "text" DEFAULT '0001'::"text",
    "folio" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_cuit" "text" DEFAULT ''::"text",
    "subtotal" numeric(12,2) DEFAULT 0,
    "taxes" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) DEFAULT 0,
    "sale_id" "text" DEFAULT ''::"text",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'Emitida'::"text",
    "direction" "text" DEFAULT 'venta'::"text",
    "sale_ids" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_direction_check" CHECK (("direction" = ANY (ARRAY['venta'::"text", 'compra'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['Emitida'::"text", 'Anulada'::"text", 'Pendiente'::"text"]))),
    CONSTRAINT "invoices_type_check" CHECK (("type" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offer_redemptions" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "offer_id" "text" NOT NULL,
    "product_id" "text",
    "order_id" "text",
    "customer_phone" "text",
    "customer_user_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0,
    "redemption_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "branch_id" "text" DEFAULT 'main'::"text"
);


ALTER TABLE "public"."offer_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "scope" "text" NOT NULL,
    "target_id" "text",
    "product_id" "text",
    "discount_type" "text" NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0,
    "discount_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "max_discount_amount" numeric(12,2),
    "start_date" "text",
    "end_date" "text",
    "active" boolean DEFAULT true,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "daily_quantity_limit" integer,
    "per_customer_daily_limit" integer,
    "total_quantity_limit" integer,
    "limit_strategy" "text" DEFAULT 'discount_only'::"text",
    CONSTRAINT "offers_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "offers_scope_check" CHECK (("scope" = ANY (ARRAY['product'::"text", 'category'::"text", 'all'::"text", 'customer'::"text", 'birthday'::"text", 'tier'::"text"])))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" integer NOT NULL,
    "order_id" "text" NOT NULL,
    "product_id" "text" DEFAULT ''::"text",
    "name" "text" NOT NULL,
    "image" "text" DEFAULT ''::"text",
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."order_items_id_seq" OWNED BY "public"."order_items"."id";



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "date" "text" NOT NULL,
    "timestamp" bigint DEFAULT ((EXTRACT(epoch FROM "now"()) * (1000)::numeric))::bigint,
    "customer" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text",
    "dni" "text" DEFAULT ''::"text",
    "address" "text" DEFAULT ''::"text",
    "delivery_time" "text" DEFAULT ''::"text",
    "method" "text" DEFAULT ''::"text",
    "payment_method" "text" DEFAULT ''::"text",
    "payment_status" "text" DEFAULT 'Pendiente'::"text",
    "status" "text" DEFAULT 'Nuevo'::"text",
    "total" numeric(12,2) DEFAULT 0,
    "paid_amount" numeric(12,2),
    "source" "text" DEFAULT 'web'::"text",
    "discount" numeric(12,2),
    "discount_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "delivery_lat" numeric,
    "delivery_lng" numeric,
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['Pagado'::"text", 'Pendiente'::"text", 'Fallido'::"text"]))),
    CONSTRAINT "orders_source_check" CHECK (("source" = ANY (ARRAY['pos'::"text", 'whatsapp'::"text", 'web'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['Nuevo'::"text", 'Preparando'::"text", 'En Camino'::"text", 'Entregado'::"text", 'Cancelado'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text" DEFAULT ''::"text",
    "category_id" "text",
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "original_price" numeric(12,2),
    "image" "text" DEFAULT ''::"text",
    "format" "text" DEFAULT ''::"text",
    "is_new" boolean DEFAULT false,
    "discount" "text",
    "badge" "text" DEFAULT ''::"text",
    "min_stock" integer DEFAULT 15,
    "barcode" "text",
    "stock" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "saleType" "text" DEFAULT 'unit'::"text",
    "sale_type" "text" DEFAULT 'unit'::"text",
    "subcategory_id" "text",
    CONSTRAINT "products_saletype_check" CHECK (("saleType" = ANY (ARRAY['unit'::"text", 'weight'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "key" "text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_session_items" (
    "id" bigint NOT NULL,
    "session_id" "text",
    "product_id" "text",
    "barcode" "text",
    "name" "text" NOT NULL,
    "image" "text" DEFAULT ''::"text",
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."shopping_session_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shopping_session_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shopping_session_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shopping_session_items_id_seq" OWNED BY "public"."shopping_session_items"."id";



CREATE TABLE IF NOT EXISTS "public"."shopping_sessions" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "code" "text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "customer_name" "text" DEFAULT ''::"text",
    "customer_phone" "text" DEFAULT ''::"text",
    "subtotal" numeric(12,2) DEFAULT 0,
    "total_items" integer DEFAULT 0,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "text"
);


ALTER TABLE "public"."shopping_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subcategories" (
    "id" "text" NOT NULL,
    "category_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tags_id_seq" OWNED BY "public"."tags"."id";



CREATE TABLE IF NOT EXISTS "public"."web_carts" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."web_carts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."web_carts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."web_carts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."web_carts_id_seq" OWNED BY "public"."web_carts"."id";



CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "branch_id" "text" DEFAULT 'main'::"text",
    "phone" "text" NOT NULL,
    "customer_name" "text",
    "type" "text" NOT NULL,
    "title" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "order_id" "text",
    "customer_phone" "text",
    "account_movement_id" "text",
    "attempts" integer DEFAULT 0,
    "error_message" "text",
    "scheduled_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "whatsapp_messages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."invoice_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."invoice_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."order_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."order_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shopping_session_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shopping_session_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."web_carts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."web_carts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admin_notification_reads"
    ADD CONSTRAINT "admin_notification_reads_employee_id_group_key_key" UNIQUE ("employee_id", "group_key");



ALTER TABLE ONLY "public"."admin_notification_reads"
    ADD CONSTRAINT "admin_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closes"
    ADD CONSTRAINT "cash_closes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_movements"
    ADD CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_user_id_product_id_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_phone_branch_id_key" UNIQUE ("phone", "branch_id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."daily_delivery_assignments"
    ADD CONSTRAINT "daily_delivery_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_product_id_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offer_redemptions"
    ADD CONSTRAINT "offer_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key", "branch_id");



ALTER TABLE ONLY "public"."shopping_session_items"
    ADD CONSTRAINT "shopping_session_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_sessions"
    ADD CONSTRAINT "shopping_sessions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."shopping_sessions"
    ADD CONSTRAINT "shopping_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."web_carts"
    ADD CONSTRAINT "web_carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."web_carts"
    ADD CONSTRAINT "web_carts_user_id_product_id_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_employees_email" ON "public"."employees" USING "btree" ("email");



CREATE INDEX "idx_employees_role" ON "public"."employees" USING "btree" ("role");



CREATE INDEX "idx_employees_user_id" ON "public"."employees" USING "btree" ("user_id");



CREATE INDEX "idx_expenses_branch_id" ON "public"."expenses" USING "btree" ("branch_id");



CREATE INDEX "idx_expenses_created_at" ON "public"."expenses" USING "btree" ("created_at");



CREATE INDEX "idx_expenses_status" ON "public"."expenses" USING "btree" ("status");



CREATE INDEX "idx_expenses_type" ON "public"."expenses" USING "btree" ("type");



CREATE INDEX "idx_offer_redemptions_branch" ON "public"."offer_redemptions" USING "btree" ("branch_id");



CREATE INDEX "idx_offer_redemptions_customer" ON "public"."offer_redemptions" USING "btree" ("customer_phone");



CREATE INDEX "idx_offer_redemptions_date" ON "public"."offer_redemptions" USING "btree" ("redemption_date");



CREATE INDEX "idx_offer_redemptions_offer_id" ON "public"."offer_redemptions" USING "btree" ("offer_id");



CREATE INDEX "idx_orders_branch" ON "public"."orders" USING "btree" ("branch_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_timestamp" ON "public"."orders" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_products_branch" ON "public"."products" USING "btree" ("branch_id");



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_products_subcategory" ON "public"."products" USING "btree" ("subcategory_id");



CREATE INDEX "idx_shopping_session_items_session_id" ON "public"."shopping_session_items" USING "btree" ("session_id");



CREATE INDEX "idx_shopping_sessions_code" ON "public"."shopping_sessions" USING "btree" ("code");



CREATE INDEX "idx_subcategories_category" ON "public"."subcategories" USING "btree" ("category_id");



CREATE INDEX "idx_web_carts_user" ON "public"."web_carts" USING "btree" ("user_id");



CREATE INDEX "idx_whatsapp_messages_branch_id" ON "public"."whatsapp_messages" USING "btree" ("branch_id");



CREATE INDEX "idx_whatsapp_messages_created_at" ON "public"."whatsapp_messages" USING "btree" ("created_at");



CREATE INDEX "idx_whatsapp_messages_order_id" ON "public"."whatsapp_messages" USING "btree" ("order_id");



CREATE INDEX "idx_whatsapp_messages_phone" ON "public"."whatsapp_messages" USING "btree" ("phone");



CREATE INDEX "idx_whatsapp_messages_status" ON "public"."whatsapp_messages" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "trg_employees_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_cash_sessions_updated_at" BEFORE UPDATE ON "public"."cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."admin_notification_reads"
    ADD CONSTRAINT "admin_notification_reads_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."cash_closes"
    ADD CONSTRAINT "cash_closes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."cash_movements"
    ADD CONSTRAINT "cash_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."cash_movements"
    ADD CONSTRAINT "cash_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_movements"
    ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "cash_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_delivery_assignments"
    ADD CONSTRAINT "daily_delivery_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."shopping_session_items"
    ADD CONSTRAINT "shopping_session_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_session_items"
    ADD CONSTRAINT "shopping_session_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."shopping_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."web_carts"
    ADD CONSTRAINT "web_carts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."web_carts"
    ADD CONSTRAINT "web_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Clientes pueden manejar sus direcciones" ON "public"."customer_addresses" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Clientes pueden manejar sus favoritos" ON "public"."customer_favorites" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permitir actualización a empleados autenticados" ON "public"."cash_sessions" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir actualización libre de sesiones" ON "public"."shopping_sessions" FOR UPDATE USING (true);



CREATE POLICY "Permitir inserción a empleados autenticados" ON "public"."cash_sessions" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserción libre de sesiones" ON "public"."shopping_sessions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir inserción libre de ítems" ON "public"."shopping_session_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir lectura completa a empleados autenticados" ON "public"."cash_sessions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir lectura libre de sesiones" ON "public"."shopping_sessions" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura libre de ítems" ON "public"."shopping_session_items" FOR SELECT USING (true);



CREATE POLICY "Permitir todo temporalmente a customer_addresses" ON "public"."customer_addresses" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir todo temporalmente a customer_favorites" ON "public"."customer_favorites" USING (true) WITH CHECK (true);



ALTER TABLE "public"."admin_notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_closes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_closes_insert_employee" ON "public"."cash_closes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "cash_closes_select_employee" ON "public"."cash_closes" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "cash_closes_update_admin" ON "public"."cash_closes" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_owner"());



ALTER TABLE "public"."cash_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_movements_delete_admin" ON "public"."cash_movements" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_owner"());



CREATE POLICY "cash_movements_insert_employee" ON "public"."cash_movements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "cash_movements_select_employee" ON "public"."cash_movements" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "cash_movements_update_employee" ON "public"."cash_movements" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."cash_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete_employee" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "categories_insert_employee" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "categories_select_public" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "categories_update_employee" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_profiles_delete_admin" ON "public"."customer_profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_owner"());



CREATE POLICY "customer_profiles_insert" ON "public"."customer_profiles" FOR INSERT WITH CHECK (("public"."is_active_employee"() OR ("user_id" = "auth"."uid"()) OR ("user_id" IS NULL) OR (("user_id")::"text" ~~ 'guest_%'::"text")));



CREATE POLICY "customer_profiles_select" ON "public"."customer_profiles" FOR SELECT TO "authenticated" USING (("public"."is_active_employee"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "customer_profiles_update" ON "public"."customer_profiles" FOR UPDATE TO "authenticated" USING (("public"."is_active_employee"() OR ("user_id" = "auth"."uid"()))) WITH CHECK (("public"."is_active_employee"() OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."daily_delivery_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_assignments_employee" ON "public"."daily_delivery_assignments" TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_delete_admin" ON "public"."employees" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_owner"());



CREATE POLICY "employees_insert_admin" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_owner"());



CREATE POLICY "employees_select_employee" ON "public"."employees" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "employees_update_admin" ON "public"."employees" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_owner"()) WITH CHECK ("public"."is_admin_or_owner"());



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete_admin" ON "public"."expenses" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_owner"());



CREATE POLICY "expenses_insert_employee" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "expenses_select_employee" ON "public"."expenses" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "expenses_update_employee" ON "public"."expenses" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"());



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "favorites_all_user" ON "public"."favorites" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_reads_employee" ON "public"."admin_notification_reads" TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."offer_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offer_redemptions_insert" ON "public"."offer_redemptions" FOR INSERT WITH CHECK (true);



CREATE POLICY "offer_redemptions_select" ON "public"."offer_redemptions" FOR SELECT USING ("public"."is_active_employee"());



ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "offers_modify_admin" ON "public"."offers" TO "authenticated" USING ("public"."is_admin_or_owner"()) WITH CHECK ("public"."is_admin_or_owner"());



CREATE POLICY "offers_select_public" ON "public"."offers" FOR SELECT USING (true);



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_delete_employee" ON "public"."order_items" FOR DELETE TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "order_items_insert_policy" ON "public"."order_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "order_items_select_policy" ON "public"."order_items" FOR SELECT USING (("public"."is_active_employee"() OR (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."phone" = "public"."current_user_phone"()))))));



CREATE POLICY "order_items_update_employee" ON "public"."order_items" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"());



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_admin" ON "public"."orders" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_owner"());



CREATE POLICY "orders_insert_policy" ON "public"."orders" FOR INSERT WITH CHECK (("public"."is_active_employee"() OR (("status" = ANY (ARRAY['Pendiente'::"text", 'Por preparar'::"text"])) AND (("payment_status" IS NULL) OR ("payment_status" = 'Pendiente'::"text")))));



CREATE POLICY "orders_select_policy" ON "public"."orders" FOR SELECT USING (("public"."is_active_employee"() OR (("auth"."role"() = 'authenticated'::"text") AND ("phone" IS NOT NULL) AND ("phone" = "public"."current_user_phone"()))));



CREATE POLICY "orders_update_employee" ON "public"."orders" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_employee" ON "public"."products" FOR DELETE TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "products_insert_employee" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "products_select_public" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "products_update_employee" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settings_insert_admin" ON "public"."settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_owner"());



CREATE POLICY "settings_select_policy" ON "public"."settings" FOR SELECT USING ((("key" = ANY (ARRAY['store_status'::"text", 'hero_banners'::"text", 'general_config'::"text", 'admin_tags'::"text"])) OR "public"."is_active_employee"()));



CREATE POLICY "settings_update_admin" ON "public"."settings" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_owner"()) WITH CHECK ("public"."is_admin_or_owner"());



ALTER TABLE "public"."shopping_session_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subcategories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subcategories_delete_employee" ON "public"."subcategories" FOR DELETE TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "subcategories_insert_employee" ON "public"."subcategories" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "subcategories_select_public" ON "public"."subcategories" FOR SELECT USING (true);



CREATE POLICY "subcategories_update_employee" ON "public"."subcategories" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"()) WITH CHECK ("public"."is_active_employee"());



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_carts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "web_carts_own" ON "public"."web_carts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_messages_insert_employee" ON "public"."whatsapp_messages" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_employee"());



CREATE POLICY "whatsapp_messages_select_employee" ON "public"."whatsapp_messages" FOR SELECT TO "authenticated" USING ("public"."is_active_employee"());



CREATE POLICY "whatsapp_messages_update_employee" ON "public"."whatsapp_messages" FOR UPDATE TO "authenticated" USING ("public"."is_active_employee"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_closes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_movements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."categories";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."customer_profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."favorites";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."invoices";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."offer_redemptions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."offers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."products";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."shopping_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."web_carts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_messages";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."current_user_phone"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_phone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_employee"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_employee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_employee"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_employee"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_employee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_employee"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pos_sale"("p_sale" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_pos_sale"("p_sale" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pos_sale"("p_sale" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_web_order"("p_order" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_web_order"("p_order" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_web_order"("p_order" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."billing_customers" TO "anon";
GRANT ALL ON TABLE "public"."billing_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closes" TO "anon";
GRANT ALL ON TABLE "public"."cash_closes" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closes" TO "service_role";



GRANT ALL ON TABLE "public"."cash_movements" TO "anon";
GRANT ALL ON TABLE "public"."cash_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_movements" TO "service_role";



GRANT ALL ON TABLE "public"."cash_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cash_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customer_favorites" TO "anon";
GRANT ALL ON TABLE "public"."customer_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."customer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."customer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."daily_delivery_assignments" TO "anon";
GRANT ALL ON TABLE "public"."daily_delivery_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_delivery_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoice_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."offer_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."offer_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."offer_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_session_items" TO "anon";
GRANT ALL ON TABLE "public"."shopping_session_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_session_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shopping_session_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shopping_session_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shopping_session_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_sessions" TO "anon";
GRANT ALL ON TABLE "public"."shopping_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."subcategories" TO "anon";
GRANT ALL ON TABLE "public"."subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."web_carts" TO "anon";
GRANT ALL ON TABLE "public"."web_carts" TO "authenticated";
GRANT ALL ON TABLE "public"."web_carts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."web_carts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."web_carts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."web_carts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































