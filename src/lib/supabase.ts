import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("🚨 CRITICAL ERROR: Faltan variables de entorno para Supabase. Revisa tu archivo .env");
}

// Asegurarse de que la URL no termine en /rest/v1/ si hay un error de configuración
const cleanUrl = supabaseUrl?.replace(/\/rest\/v1\/?$/, '');

export const supabase = createClient(
  cleanUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      storage: window.sessionStorage
    }
  }
)