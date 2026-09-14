-- ==============================================================================
-- Migración: Habilitar Cola de Mensajes de WhatsApp para el Worker Local
-- ==============================================================================
-- Ejecutar en Supabase SQL Editor.
--
-- MOTIVO:
-- La tabla "whatsapp_messages" tenía políticas RLS que solo permitían a usuarios
-- autenticados como empleados (is_active_employee) leer o modificar registros.
-- El worker local de Node.js (whatsapp-worker) consulta la API con la clave
-- anónima (o servicio), por lo que Supabase devolvía 0 filas (data: []) y el bot
-- no podía ver los mensajes en estado 'pending'.
--
-- SOLUCIÓN:
-- 1. Permitir que el worker consulte y actualice la cola de mensajes.
-- 2. Permitir que el checkout y las alertas puedan insertar mensajes en la cola.

-- 1. Eliminar políticas restrictivas previas
DROP POLICY IF EXISTS "whatsapp_messages_select_employee" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_select_worker" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_update_employee" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_update_worker" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_insert_employee" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_insert_all" ON public.whatsapp_messages;

-- 2. Política de LECTURA: Empleados, service_role y el worker local
CREATE POLICY "whatsapp_messages_select_worker"
  ON public.whatsapp_messages
  FOR SELECT
  TO anon, authenticated, service_role
  USING (true);

-- 3. Política de ACTUALIZACIÓN: Permite al worker cambiar estado a 'sending', 'sent', 'failed'
CREATE POLICY "whatsapp_messages_update_worker"
  ON public.whatsapp_messages
  FOR UPDATE
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 4. Política de INSERCIÓN: Permite a la app web (alertas, checkout, POS) encolar mensajes
CREATE POLICY "whatsapp_messages_insert_all"
  ON public.whatsapp_messages
  FOR INSERT
  TO anon, authenticated, service_role
  WITH CHECK (true);
