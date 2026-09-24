-- ==============================================================================
-- MIGRACIÓN FISCAL ARCA (EX-AFIP): MARTINA SUPERMERCADO
-- Versión: 20260914000000
-- ==============================================================================

-- 1. TABLA: Operaciones Fiscales (Garantía de Idempotencia y Estado)
CREATE TABLE IF NOT EXISTS public.fiscal_invoice_operations (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    operation_type TEXT NOT NULL DEFAULT 'AUTHORIZE_INVOICE', -- 'AUTHORIZE_INVOICE' | 'CREDIT_NOTE'
    sale_ids TEXT[] NOT NULL DEFAULT '{}',
    point_of_sale INTEGER NOT NULL,
    invoice_type TEXT NOT NULL, -- 'A', 'B', 'C', 'NC_A', 'NC_B', 'NC_C'
    invoice_type_code INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'EN_PROCESO', 
    -- 'EN_PROCESO' | 'AUTORIZADA' | 'RECHAZADA' | 'ESTADO_DESCONOCIDO' | 'ERROR_TECNICO'
    invoice_id TEXT,
    request_hash TEXT NOT NULL,
    requested_by TEXT,
    error_code TEXT,
    error_message TEXT,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fio_idempotency_key ON public.fiscal_invoice_operations(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_fio_status ON public.fiscal_invoice_operations(status);
CREATE INDEX IF NOT EXISTS idx_fio_sale_ids ON public.fiscal_invoice_operations USING GIN(sale_ids);

-- 2. TABLA: Facturas y Comprobantes Fiscales Emitidos
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'main',
    idempotency_key TEXT UNIQUE NOT NULL,
    sale_ids TEXT[] NOT NULL DEFAULT '{}',
    direction TEXT NOT NULL DEFAULT 'venta', -- 'venta' | 'compra'
    invoice_type TEXT NOT NULL, -- 'A', 'B', 'C', 'NC_A', 'NC_B', 'NC_C', 'ND_A', 'ND_B', 'ND_C'
    invoice_type_code INTEGER NOT NULL, -- 1, 6, 11, 3, 8, 13, etc.
    point_of_sale INTEGER NOT NULL,
    invoice_number INTEGER NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Datos del Receptor
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_document_type TEXT NOT NULL, -- 'CUIT', 'DNI', 'CUIL', 'PASAPORTE', 'SIN_IDENTIFICAR'
    customer_document_number TEXT NOT NULL,
    customer_cuit TEXT,
    customer_tax_condition TEXT NOT NULL,
    customer_address TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    
    -- Totales y Moneda
    subtotal_net NUMERIC(15,2) NOT NULL DEFAULT 0,
    taxes NUMERIC(15,2) NOT NULL DEFAULT 0,
    total NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PES',
    
    -- Estado y Servicio ARCA
    status TEXT NOT NULL DEFAULT 'AUTORIZADA', -- 'AUTORIZADA' | 'ANULADA'
    service_used TEXT NOT NULL DEFAULT 'WSMTXCA', -- 'WSMTXCA' | 'WSFEv1'
    cae TEXT NOT NULL,
    cae_expiration_date TEXT NOT NULL,
    arca_observations JSONB DEFAULT '[]'::jsonb,
    
    -- Detalle y Desglose Impositivo
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    vat_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- PDF y QR Oficial
    pdf_path TEXT,
    qr_payload TEXT,
    
    -- Referencia a Comprobante Asociado (para Notas de Crédito / Débito)
    original_point_of_sale INTEGER,
    original_invoice_number INTEGER,
    original_invoice_type TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    
    -- Restricción Única Fiscal: un mismo punto de venta y tipo no puede duplicar número
    CONSTRAINT uq_invoice_pv_type_number UNIQUE (point_of_sale, invoice_type_code, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_sale_ids ON public.invoices USING GIN(sale_ids);
CREATE INDEX IF NOT EXISTS idx_invoices_cae ON public.invoices(cae);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- 3. TABLA: Puntos de Venta Fiscales
CREATE TABLE IF NOT EXISTS public.fiscal_points_of_sale (
    id SERIAL PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'main',
    number INTEGER NOT NULL UNIQUE,
    description TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ELECTRONIC', -- 'ELECTRONIC' | 'MANUAL'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    environment TEXT NOT NULL DEFAULT 'testing', -- 'testing' | 'production'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar Punto de Venta por defecto (PV 0001)
INSERT INTO public.fiscal_points_of_sale (number, description, mode, is_active, environment)
VALUES (1, 'Caja Principal - Facturación Electrónica', 'ELECTRONIC', TRUE, 'testing')
ON CONFLICT (number) DO NOTHING;

-- 4. TABLA: Parámetros Fiscales del Comercio
CREATE TABLE IF NOT EXISTS public.fiscal_config (
    id TEXT PRIMARY KEY DEFAULT 'main',
    cuit TEXT NOT NULL DEFAULT '30712345678',
    business_name TEXT NOT NULL DEFAULT 'MARTINA SUPERMERCADO S.R.L.',
    tax_condition TEXT NOT NULL DEFAULT 'Responsable Inscripto',
    gross_income TEXT DEFAULT '901-123456-7',
    start_date TEXT DEFAULT '01/01/2024',
    fiscal_address TEXT NOT NULL DEFAULT 'Av. Libertador 1234, San Luis, Argentina',
    environment TEXT NOT NULL DEFAULT 'testing', -- 'testing' | 'production'
    default_point_of_sale INTEGER NOT NULL DEFAULT 1,
    cert_path TEXT DEFAULT '',
    key_path TEXT DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.fiscal_config (id, cuit, business_name, tax_condition, fiscal_address, environment, default_point_of_sale)
VALUES ('main', '30712345678', 'MARTINA SUPERMERCADO S.R.L.', 'Responsable Inscripto', 'Av. Libertador 1234, San Luis, Argentina', 'testing', 1)
ON CONFLICT (id) DO NOTHING;

-- 5. TABLA: Registro de Auditoría Fiscal
CREATE TABLE IF NOT EXISTS public.fiscal_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL DEFAULT 'main',
    action TEXT NOT NULL, -- 'INTENTO_EMISION', 'AUTORIZADO', 'RECHAZADO', 'ESTADO_DESCONOCIDO', 'RECONCILIACION', 'NOTA_CREDITO', 'CAMBIO_CONFIG'
    voucher_info TEXT,
    result TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fal_created_at ON public.fiscal_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fal_action ON public.fiscal_audit_logs(action);

-- 6. Habilitar RLS (Row Level Security) y permisos seguros
ALTER TABLE public.fiscal_invoice_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_points_of_sale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura para usuarios autenticados / empleados
CREATE POLICY "Allow read fiscal_config for authenticated" ON public.fiscal_config
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read fiscal_points_of_sale for authenticated" ON public.fiscal_points_of_sale
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read invoices for authenticated" ON public.invoices
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow anon read authorized invoices" ON public.invoices
    FOR SELECT TO anon USING (status = 'AUTORIZADA');

CREATE POLICY "Allow read fiscal_invoice_operations for authenticated" ON public.fiscal_invoice_operations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read fiscal_audit_logs for authenticated" ON public.fiscal_audit_logs
    FOR SELECT TO authenticated USING (true);

-- Políticas de inserción y modificación restringidas al Service Role o administradores
CREATE POLICY "Allow service_role full access to fiscal tables" ON public.invoices
    FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service_role full access to operations" ON public.fiscal_invoice_operations
    FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service_role full access to audit" ON public.fiscal_audit_logs
    FOR ALL TO service_role USING (true);
