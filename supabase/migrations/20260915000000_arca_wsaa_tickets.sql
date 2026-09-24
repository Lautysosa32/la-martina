-- ==============================================================================
-- MIGRACIÓN FISCAL ARCA: TABLA DE TICKETS DE ACCESO WSAA
-- Versión: 20260915000000
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_access_tickets (
    service TEXT PRIMARY KEY, -- 'wsmtxca' | 'wsfe'
    token TEXT NOT NULL,
    sign TEXT NOT NULL,
    generation_time TIMESTAMPTZ NOT NULL,
    expiration_time TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fat_service ON public.fiscal_access_tickets(service);

ALTER TABLE public.fiscal_access_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to fiscal_access_tickets" ON public.fiscal_access_tickets
    FOR ALL TO service_role USING (true);

CREATE POLICY "Allow select fiscal_access_tickets for authenticated" ON public.fiscal_access_tickets
    FOR SELECT TO authenticated USING (true);
