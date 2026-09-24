-- ==============================================================================
-- MIGRACIÓN FISCAL ARCA: FACTURAS EXTERNAS / MANUALES Y TRAZABILIDAD
-- Supermercado La Martina
-- ==============================================================================

-- 1. Agregar columnas a 'invoices' para soportar facturación externa y auditoría
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'ARCA_LOCAL',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

-- 2. Permitir NULL en campos de CAE para comprobantes externos que aún no poseen CAE validado
ALTER TABLE public.invoices 
  ALTER COLUMN cae DROP NOT NULL,
  ALTER COLUMN cae_expiration_date DROP NOT NULL;

-- 3. Índices adicionales para búsquedas eficientes por origen y estado de verificación
CREATE INDEX IF NOT EXISTS idx_invoices_origin ON public.invoices(origin);
CREATE INDEX IF NOT EXISTS idx_invoices_pv_type_number ON public.invoices(point_of_sale, invoice_type_code, invoice_number);
