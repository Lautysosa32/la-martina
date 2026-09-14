-- ==============================================================================
-- PATCH DE BASE DE DATOS PARA CAJA OFFLINE-FIRST — Martina Supermercado
-- ==============================================================================
-- Este script realiza las siguientes modificaciones requeridas:
-- 1. Agrega 'caja_id' a orders, cash_movements y cash_closes para trazabilidad multi-caja.
-- 2. Agrega 'deleted_at' e índices en products para sincronización incremental.
-- 3. Crea la tabla 'sync_conflicts' para auditoría de límites de crédito y stock negativo.
-- 4. Crea la tabla y trigger 'product_deletions' para detectar borrados físicos.
-- 5. Crea el RPC 'process_pos_sale_v2' con idempotencia estricta y soporte offline.
-- ==============================================================================

-- 1. IDENTIFICACIÓN DE CAJA MULTI-TERMINAL
ALTER TABLE IF EXISTS "public"."orders" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01';

ALTER TABLE IF EXISTS "public"."cash_movements" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01';

ALTER TABLE IF EXISTS "public"."cash_closes" 
ADD COLUMN IF NOT EXISTS "caja_id" text NOT NULL DEFAULT 'CAJA-01',
ADD COLUMN IF NOT EXISTS "pending_sync_count" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reconciled_at" timestamp with time zone;

-- 2. SOPORTE DE SOFT DELETE E ÍNDICES EN PRODUCTS
ALTER TABLE IF EXISTS "public"."products" 
ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone DEFAULT NULL;

CREATE INDEX IF NOT EXISTS "idx_products_updated_at" ON "public"."products" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_products_deleted_at" ON "public"."products" ("deleted_at");
CREATE INDEX IF NOT EXISTS "idx_products_barcode" ON "public"."products" ("barcode");
CREATE INDEX IF NOT EXISTS "idx_orders_caja_id" ON "public"."orders" ("caja_id");
CREATE INDEX IF NOT EXISTS "idx_cash_movements_caja_id" ON "public"."cash_movements" ("caja_id");
CREATE INDEX IF NOT EXISTS "idx_cash_closes_caja_id" ON "public"."cash_closes" ("caja_id");

-- 3. TABLA DE AUDITORÍA DE CONFLICTOS DE SINCRONIZACIÓN
CREATE TABLE IF NOT EXISTS "public"."sync_conflicts" (
    "id" text DEFAULT ('CONF-' || gen_random_uuid()::text) PRIMARY KEY,
    "caja_id" text NOT NULL DEFAULT 'CAJA-01',
    "entity_type" text NOT NULL, -- 'SALE', 'PAYMENT', 'STOCK', 'CLOSE'
    "entity_id" text NOT NULL,
    "conflict_type" text NOT NULL, -- 'CREDIT_LIMIT_EXCEEDED', 'CUSTOMER_BLOCKED', 'STOCK_NEGATIVE', 'CLOSE_DISCREPANCY'
    "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_by" text,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_resolved" ON "public"."sync_conflicts" ("resolved");
CREATE INDEX IF NOT EXISTS "idx_sync_conflicts_caja" ON "public"."sync_conflicts" ("caja_id");

-- RLS para sync_conflicts
ALTER TABLE "public"."sync_conflicts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura y escritura autenticada en sync_conflicts" ON "public"."sync_conflicts";
CREATE POLICY "Permitir lectura y escritura autenticada en sync_conflicts" 
ON "public"."sync_conflicts" 
FOR ALL 
TO authenticated, anon 
USING (true) 
WITH CHECK (true);

-- 4. REGISTRO DE ELIMINACIONES FÍSICAS (AUDITORÍA DE BORRADO)
CREATE TABLE IF NOT EXISTS "public"."product_deletions" (
    "product_id" text PRIMARY KEY,
    "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE OR REPLACE FUNCTION "public"."trg_record_product_deletion"()
RETURNS trigger AS $$
BEGIN
    INSERT INTO "public"."product_deletions" ("product_id", "deleted_at")
    VALUES (OLD.id, now())
    ON CONFLICT ("product_id") DO UPDATE SET "deleted_at" = now();
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "product_hard_delete_audit" ON "public"."products";
CREATE TRIGGER "product_hard_delete_audit"
AFTER DELETE ON "public"."products"
FOR EACH ROW EXECUTE FUNCTION "public"."trg_record_product_deletion"();

-- 5. RPC IDEMPOTENTE process_pos_sale_v2
CREATE OR REPLACE FUNCTION "public"."process_pos_sale_v2"("p_sale" jsonb) 
RETURNS jsonb AS $$
DECLARE
  v_order_id text;
  v_caja_id text;
  v_customer_phone text;
  v_payment_method text;
  v_total numeric;
  v_items jsonb;
  v_item jsonb;
  v_prod_id text;
  v_qty numeric;
  v_is_offline boolean;
  v_customer record;
  v_current_debt numeric;
  v_effective_limit numeric;
BEGIN
  v_order_id := p_sale->>'id';
  v_caja_id := COALESCE(p_sale->>'caja_id', 'CAJA-01');
  v_customer_phone := p_sale->>'customer_phone';
  v_payment_method := p_sale->>'payment_method';
  v_total := (p_sale->>'total')::numeric;
  v_items := p_sale->'items';
  v_is_offline := COALESCE((p_sale->>'is_offline')::boolean, false);

  -- A. IDEMPOTENCIA ESTRICTA
  IF EXISTS (SELECT 1 FROM "public"."orders" WHERE id = v_order_id) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'order_id', v_order_id, 
      'already_exists', true,
      'message', 'Venta previamente procesada (Idempotencia garantizada)'
    );
  END IF;

  -- B. CONTROL DE CUENTA CORRIENTE POST-OFFLINE
  IF v_payment_method = 'cuenta_corriente' AND v_customer_phone IS NOT NULL THEN
    SELECT * INTO v_customer FROM "public"."customer_profiles" 
    WHERE phone = v_customer_phone LIMIT 1;

    IF FOUND THEN
      -- Calcular deuda actual en servidor
      SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) INTO v_current_debt
      FROM "public"."orders"
      WHERE customer_phone = v_customer_phone 
        AND payment_method = 'cuenta_corriente' 
        AND payment_status != 'Pagado'
        AND status != 'Cancelado';

      v_effective_limit := CASE 
        WHEN v_customer."useCustomAccountLimits" THEN COALESCE(v_customer."customDebtLimit", 50000)
        ELSE COALESCE(v_customer."creditLimit", 50000)
      END;

      -- Si superó el límite, NO se cancela la venta; se levanta un conflicto auditable
      IF (v_current_debt + v_total) > v_effective_limit THEN
        INSERT INTO "public"."sync_conflicts" (
          "caja_id", "entity_type", "entity_id", "conflict_type", "details"
        ) VALUES (
          v_caja_id, 'SALE', v_order_id, 'CREDIT_LIMIT_EXCEEDED',
          jsonb_build_object(
            'customer_phone', v_customer_phone,
            'customer_name', v_customer.name,
            'credit_limit', v_effective_limit,
            'prior_debt', v_current_debt,
            'sale_total', v_total,
            'new_total_debt', (v_current_debt + v_total)
          )
        );
      END IF;
    END IF;
  END IF;

  -- C. INSERTAR LA ORDEN
  INSERT INTO "public"."orders" (
    "id", "user_id", "customer_name", "customer_email", "customer_phone",
    "items", "total", "status", "payment_status", "payment_method",
    "shipping_address", "created_at", "updated_at", "origin", "branch_id",
    "employee_id", "caja_id"
  ) VALUES (
    v_order_id,
    (p_sale->>'user_id')::uuid,
    COALESCE(p_sale->>'customer_name', 'Cliente Local'),
    p_sale->>'customer_email',
    v_customer_phone,
    v_items,
    v_total,
    'Entregado',
    CASE WHEN v_payment_method = 'cuenta_corriente' THEN 'Pendiente' ELSE 'Pagado' END,
    v_payment_method,
    'Compra en local',
    COALESCE((p_sale->>'created_at')::timestamptz, now()),
    now(),
    'caja',
    COALESCE(p_sale->>'branch_id', 'main'),
    p_sale->>'employee_id',
    v_caja_id
  );

  -- D. ACTUALIZAR STOCK CON AUDITORÍA
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_prod_id := v_item->>'product_id';
    v_qty := (v_item->>'quantity')::numeric;

    IF v_prod_id IS NOT NULL AND v_prod_id NOT IN ('PRODUCTO_COMUN', 'COMUN') THEN
      UPDATE "public"."products"
      SET "stock" = "stock" - v_qty,
          "updated_at" = now()
      WHERE "id" = v_prod_id;

      -- Verificar si el stock quedó negativo por ventas offline
      IF (SELECT stock FROM "public"."products" WHERE id = v_prod_id) < 0 THEN
        INSERT INTO "public"."sync_conflicts" (
          "caja_id", "entity_type", "entity_id", "conflict_type", "details"
        ) VALUES (
          v_caja_id, 'STOCK', v_prod_id, 'STOCK_NEGATIVE',
          jsonb_build_object(
            'order_id', v_order_id,
            'product_id', v_prod_id,
            'product_name', v_item->>'name',
            'quantity_sold', v_qty
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- E. REGISTRAR MOVIMIENTO DE CAJA SI CORRESPONDE
  IF v_payment_method = 'cash' THEN
    INSERT INTO "public"."cash_movements" (
      "id", "branch_id", "caja_id", "type", "description", 
      "cashier", "amount", "timestamp", "order_id"
    ) VALUES (
      'MOV-' || gen_random_uuid()::text,
      COALESCE(p_sale->>'branch_id', 'main'),
      v_caja_id,
      'Ingreso',
      'Venta Local #' || v_order_id,
      COALESCE(p_sale->>'cashier', 'Cajero'),
      v_total,
      COALESCE((p_sale->>'timestamp')::bigint, (EXTRACT(epoch FROM now()) * 1000)::bigint),
      v_order_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
