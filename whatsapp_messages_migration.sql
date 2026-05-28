-- ==========================================
-- MIGRACIÓN SUPABASE: COLA DE MENSAJES WHATSAPP
-- ==========================================

-- 1. Crear la tabla de mensajes
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    branch_id TEXT DEFAULT 'main',
    phone TEXT NOT NULL,
    customer_name TEXT,
    type TEXT NOT NULL,
    title TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
    order_id TEXT NULL,
    customer_phone TEXT NULL,
    account_movement_id TEXT NULL,
    attempts INTEGER DEFAULT 0,
    error_message TEXT NULL,
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar seguridad de nivel de fila (RLS)
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas para lectura y escritura desde la aplicación cliente (anon)
CREATE POLICY "Permitir lectura pública en whatsapp_messages" 
ON public.whatsapp_messages 
FOR SELECT 
TO anon, authenticated
USING (true);

CREATE POLICY "Permitir inserción pública en whatsapp_messages" 
ON public.whatsapp_messages 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Permitir actualización pública en whatsapp_messages" 
ON public.whatsapp_messages 
FOR UPDATE 
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. Crear índices de rendimiento optimizados para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order_id ON public.whatsapp_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_branch_id ON public.whatsapp_messages(branch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at);
