import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("🚨 CRITICAL ERROR: Faltan variables de entorno para Supabase. Revisa tu archivo .env");
}

// Asegurarse de que la URL no termine en /rest/v1/
const cleanUrl = supabaseUrl?.replace(/\/rest\/v1\/?$/, '');

export const supabase = createClient(
  cleanUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      // Usar localStorage para que la sesión persista al recargar la página y entre pestañas
      storage: localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  }
)