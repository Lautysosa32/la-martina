import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Usamos las variables que configuraste en Supabase Secrets
    // Nota: SUPABASE_ANON_KEY sí es inyectada automáticamente por el entorno de Supabase
    const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    console.log("Edge Function Iniciada. URL configurada:", supabaseUrl ? "Sí" : "No");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Faltan variables de entorno");
      throw new Error('Servidor mal configurado: Faltan variables de entorno.')
    }

    // Cliente que hace la petición (con token del usuario actual)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error("Falta header Authorization o no tiene formato Bearer");
      throw new Error('No se envió token de autorización válido.')
    }

    console.log("Header de Autorización recibido.");
    const token = authHeader.replace('Bearer ', '')

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // 1. Validar al usuario que está haciendo la petición
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      console.error("Error al obtener usuario del token:", userError);
      throw new Error('No autorizado: Token inválido.')
    }
    
    console.log(`Usuario autenticado (Admin/Owner): ${user.id}`);

    // 2. Verificar rol del usuario en la tabla employees
    const { data: requestingEmployee, error: profileError } = await supabaseClient
      .from('employees')
      .select('role, active')
      .eq('user_id', user.id)
      .single()

    if (profileError || !requestingEmployee) {
      console.error("No se encontró el perfil de empleado para el ID:", user.id);
      throw new Error('No se encontró tu perfil de empleado. Debes estar registrado en la tabla employees.')
    }

    if (!requestingEmployee.active) {
      console.error("El perfil del empleado está inactivo.");
      throw new Error('Tu cuenta está inactiva.')
    }

    console.log(`Rol del usuario solicitante: ${requestingEmployee.role}`);

    const validRoles = ['super_admin', 'owner', 'admin']
    if (!validRoles.includes(requestingEmployee.role)) {
      console.error(`Rol insuficiente: ${requestingEmployee.role}`);
      throw new Error('No tienes permisos suficientes para crear empleados.')
    }

    // 3. Recibir los datos del nuevo empleado
    const body = await req.json()
    const { email, password, name, role, branch_id, permissions_override, active } = body
    console.log(`Intentando crear empleado: ${email} con rol: ${role}`);

    if (!email || !password || !name || !role) {
      throw new Error('Faltan campos obligatorios (email, password, name, role).')
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
      // Intento de rollback en Auth si falla la DB (opcional pero buena práctica)
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
