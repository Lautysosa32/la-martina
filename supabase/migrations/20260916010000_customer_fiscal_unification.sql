-- Migración: Unificación de campos fiscales en customer_profiles
-- Permite que la tabla customer_profiles sea la fuente única de verdad para clientes del supermercado y clientes fiscales.

ALTER TABLE public.customer_profiles 
  ADD COLUMN IF NOT EXISTS cuit text,
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'DNI',
  ADD COLUMN IF NOT EXISTS tax_condition text DEFAULT 'Consumidor Final',
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS fiscal_address text;

-- Índices para búsqueda ágil en POS, Facturación y Clientes
CREATE INDEX IF NOT EXISTS idx_customer_profiles_cuit ON public.customer_profiles(cuit);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_dni ON public.customer_profiles(dni);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_tax_condition ON public.customer_profiles(tax_condition);

-- Comentarios explicativos
COMMENT ON COLUMN public.customer_profiles.cuit IS 'CUIT o CUIL fiscal para emisión de comprobantes (11 dígitos)';
COMMENT ON COLUMN public.customer_profiles.document_type IS 'Tipo de documento fiscal (DNI, CUIT, CUIL, PASAPORTE, SIN_IDENTIFICAR)';
COMMENT ON COLUMN public.customer_profiles.tax_condition IS 'Condición impositiva ante el IVA (Consumidor Final, Responsable Inscripto, Monotributista, Exento)';
COMMENT ON COLUMN public.customer_profiles.business_name IS 'Razón Social oficial para personas jurídicas / empresas';
COMMENT ON COLUMN public.customer_profiles.fiscal_address IS 'Domicilio fiscal registrado en ARCA si difiere de la dirección de entrega';
