-- ==============================================================================
-- OPTIMIZACIÓN DE EGRESS SUPABASE: TRIGGER DE UPDATED_AT Y DELTA SYNC
-- ==============================================================================

-- 1. Asegurar que la columna updated_at exista con valor por defecto
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Asignar fecha actual a registros que tengan updated_at en NULL
UPDATE products 
SET updated_at = NOW() 
WHERE updated_at IS NULL;

-- 3. Crear índice optimizado en updated_at para que las consultas diferenciales
-- (.gt('updated_at', lastSyncAt)) no hagan un Table Scan sobre los 10,400+ registros.
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at);

-- 4. Función Trigger que asigna NOW() cada vez que se actualiza una fila
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Vincular el Trigger a la tabla products (BEFORE UPDATE)
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- Comprobación: verificar que el trigger esté activo
-- ==============================================================================
-- SELECT trigger_name, event_manipulation, event_object_table, action_statement 
-- FROM information_schema.triggers 
-- WHERE event_object_table = 'products';
