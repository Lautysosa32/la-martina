// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigins = [
    'https://lamartinasupermercado.com',
    'https://la-martina.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ]
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')
  const allowedOrigin = isAllowed ? origin : (allowedOrigins[0])

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Manejo de preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Configuración incompleta de variables de servidor.");
      throw new Error('Servidor mal configurado: Faltan variables de entorno.')
    }

    // Cliente que hace la petición (con token del usuario actual)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No se envió token de autorización válido.')
    }

    const token = authHeader.replace('Bearer ', '')

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // 1. Validar al usuario que está haciendo la petición
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      throw new Error('No autorizado: Token inválido.')
    }

    // 2. Verificar rol del usuario en la tabla employees
    const { data: requestingEmployee, error: profileError } = await supabaseClient
      .from('employees')
      .select('role, active')
      .eq('user_id', user.id)
      .single()

    if (profileError || !requestingEmployee) {
      throw new Error('No se encontró tu perfil de empleado. Debes estar registrado en la tabla employees.')
    }

    if (!requestingEmployee.active) {
      throw new Error('Tu cuenta está inactiva.')
    }

    const validRoles = ['super_admin', 'owner', 'admin']
    if (!validRoles.includes(requestingEmployee.role)) {
      throw new Error('No tienes permisos suficientes para crear empleados.')
    }

    // 3. Recibir los datos del nuevo empleado
    const body = await req.json()
    const { email, password, name, role, phone, branch_id, permissions_override, active } = body

    if (!email || !password || !name || !role) {
      throw new Error('Faltan campos obligatorios (email, password, name, role).')
    }

    // Prevención de escalamiento de privilegios: Solo owner o super_admin pueden crear otros owners o super_admins
    if (requestingEmployee.role === 'admin' && (role === 'owner' || role === 'super_admin')) {
      throw new Error('Un administrador no tiene autorización para asignar roles de Dueño o Super Admin.')
    }

    // Validación de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('El formato del correo electrónico es inválido.')
    }

    // Validación de complejidad de contraseña en servidor
    if (typeof password !== 'string' || password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      throw new Error('La contraseña debe tener al menos 8 caracteres y contener al menos una letra y un número.')
    }

    // Cliente con privilegios administrativos (usa service_role key pura)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 4. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { name }
    })

    if (authError) {
      throw new Error(`Error creando usuario en Auth: ${authError.message}`)
    }

    const newUserId = authData.user.id

    // 5. Insertar en tabla employees
    const newEmployeeData = {
      user_id: newUserId,
      email,
      name,
      role,
      phone: phone || null,
      branch_id: branch_id || null,
      permissions_override: permissions_override || {},
      active: active !== undefined ? active : true
    }

    const { data: employeeData, error: dbError } = await supabaseAdmin
      .from('employees')
      .insert(newEmployeeData)
      .select()
      .single()

    if (dbError) {
      // Rollback en Auth si falla la DB
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      throw new Error(`Error creando perfil en base de datos: ${dbError.message}`)
    }

    // 6. Responder éxito
    return new Response(JSON.stringify(employeeData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
