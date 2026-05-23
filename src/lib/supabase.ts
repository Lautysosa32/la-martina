import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("🚨 CRITICAL ERROR: Faltan variables de entorno para Supabase. Revisa tu archivo .env");
}

if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
  console.error(
    "🚨 ERROR CRÍTICO DE CONFIGURACIÓN: La variable VITE_SUPABASE_ANON_KEY configurada en tu archivo .env NO parece ser una clave válida de Supabase. " +
    "Debe comenzar con 'eyJ' (formato JWT). Por favor, verifica que no hayas colocado accidentalmente la clave de otro servicio (como Clerk o Stripe)."
  );
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