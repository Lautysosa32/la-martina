require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Ignorar error transitorio de navegación inicial en whatsapp-web.js
process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('Execution context was destroyed')) {
    console.log('⏳ Esperando carga completa de navegación en WhatsApp Web...');
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

// 1. Inicializar Cliente Supabase (soporta service_role key, anon key o credenciales de empleado)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_KEY || 
                    process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('🚨 ERROR CRÍTICO: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY en whatsapp-worker/.env');
  process.exit(1);
}

const isServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY);
console.log(`🔗 Conectando con Supabase: ${supabaseUrl}`);
console.log(`🔑 Modo de clave: ${isServiceRole ? 'Service Role (Bypass RLS habilitado)' : 'Pública / Anon'}`);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// Autenticar como empleado si se proporcionaron credenciales en .env
async function ensureAuthenticated() {
  if (process.env.WORKER_EMAIL && process.env.WORKER_PASSWORD) {
    try {
      console.log(`👤 Autenticando worker como empleado (${process.env.WORKER_EMAIL})...`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: process.env.WORKER_EMAIL,
        password: process.env.WORKER_PASSWORD
      });
      if (error) {
        console.error('⚠️ Error autenticando worker en Supabase:', error.message);
      } else {
        console.log('✅ Worker autenticado como empleado:', data.user.email);
      }
    } catch (authErr) {
      console.error('⚠️ Excepción autenticando worker:', authErr.message);
    }
  }
}

// 2. Inicializar Cliente WhatsApp Web con autenticación persistente local
console.log('🤖 Inicializando cliente de WhatsApp Web con parámetros optimizados...');
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session' // Guarda la sesión para no tener que escanear el QR cada vez
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    headless: true,
    bypassCSP: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--log-level=3'
    ]
  }
});

console.log('⏳ Cargando navegador Chromium de fondo (esto puede tardar 20-30 segundos la primera vez)...');

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Cargando sesión de WhatsApp... ${percent}% (${message})`);
});

// 3. Generar y mostrar el código QR en la consola
client.on('qr', (qr) => {
  console.log('📱 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP COMERCIAL:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('✨ ¡Cliente de WhatsApp listo y conectado!');
  
  await ensureAuthenticated();

  // Test de conectividad y permisos con la tabla whatsapp_messages
  try {
    const { data: testRows, error: testError } = await supabase
      .from('whatsapp_messages')
      .select('id, status')
      .limit(1);

    if (testError) {
      console.error('🚨 ADVERTENCIA: Error al consultar whatsapp_messages en Supabase:', testError.message);
      console.error('👉 Ejecutá el script "supabase_fix_whatsapp_worker.sql" en el SQL Editor de Supabase.');
    } else {
      console.log('✅ Conexión con tabla whatsapp_messages verificada correctamente.');
    }
  } catch (tErr) {
    console.warn('Advertencia en test inicial:', tErr.message);
  }

  // Limpiar cualquier mensaje que haya quedado colgado en 'sending' en ejecuciones anteriores
  try {
    const { error } = await supabase
      .from('whatsapp_messages')
      .update({ status: 'pending' })
      .eq('status', 'sending');
    if (!error) {
      console.log('🧹 Se resetearon mensajes colgados en "sending".');
    }
  } catch (err) {
    console.error('Error limpiando mensajes colgados:', err);
  }

  // Iniciar ciclo de chequeo infinito cada 10 segundos
  startWorkerLoop();
});

client.on('auth_failure', (msg) => {
  console.error('❌ Error de autenticación en WhatsApp Web:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ Se perdió la conexión con WhatsApp Web. Motivo:', reason);
});

// Inicializar WhatsApp
client.initialize();

const formatArgentinePhone = (phone) => {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('549')) {
    return cleaned;
  } else if (cleaned.startsWith('54') && cleaned.length === 12) {
    return '549' + cleaned.substring(2);
  } else if (cleaned.length === 10 && !cleaned.startsWith('54')) {
    return '549' + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith('9')) {
    return '54' + cleaned;
  } else if (!cleaned.startsWith('54') && cleaned.length < 12) {
    return '549' + cleaned;
  }
  return cleaned;
};

// 4. Lógica de Envío de Mensajes
let isProcessing = false;
let idleTicks = 0;

async function processPendingMessages() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Buscar mensajes pendientes
    const { data: pendingMessages, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5); // Procesamos de a 5 para no saturar

    if (error) {
      console.error('❌ Error leyendo la tabla whatsapp_messages:', error.message);
      if (error.code === '42501' || error.message.includes('permission')) {
        console.error('👉 Tip: Ejecutá "supabase_fix_whatsapp_worker.sql" en Supabase para otorgar permisos.');
      }
      isProcessing = false;
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      idleTicks++;
      // Mostrar mensaje de liveness cada 6 ciclos (1 minuto aprox)
      if (idleTicks >= 6) {
        idleTicks = 0;
        const nowStr = new Date().toLocaleTimeString();
        console.log(`[${nowStr}] ⏳ Escuchando cola... (0 mensajes pendientes)`);
      }
      isProcessing = false;
      return;
    }

    idleTicks = 0;
    console.log(`\n📨 [${new Date().toLocaleTimeString()}] Procesando ${pendingMessages.length} mensaje(s) pendiente(s)...`);

    for (const msg of pendingMessages) {
      // Normalizar número telefónico
      const formattedPhone = formatArgentinePhone(msg.phone);
      console.log(`👉 Enviando mensaje #${msg.id} a +${formattedPhone} (Cliente: ${msg.customer_name || 'Desconocido'})...`);

      // A) Actualizar estado a "sending" e incrementar intentos para bloquear el mensaje
      const nextAttempt = (msg.attempts || 0) + 1;
      const { error: lockError } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'sending', attempts: nextAttempt })
        .eq('id', msg.id);

      if (lockError) {
        console.error(`Error bloqueando mensaje #${msg.id}:`, lockError.message);
        continue;
      }

      try {
        // B) Enviar a través de whatsapp-web.js
        console.log(`🔍 Resolviendo registro oficial de WhatsApp para: +${formattedPhone}...`);
        const numberId = await client.getNumberId(formattedPhone);
        const chatId = numberId ? numberId._serialized : `${formattedPhone}@c.us`;

        await client.sendMessage(chatId, msg.message);

        console.log(`✅ ¡Mensaje #${msg.id} enviado con éxito a +${formattedPhone}!`);

        // C) Marcar como "sent"
        await supabase
          .from('whatsapp_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', msg.id);

      } catch (sendError) {
        console.error(`❌ Falló el envío del mensaje #${msg.id} a +${msg.phone}:`, sendError.message || sendError);

        // D) Registrar el error y marcar como "failed" o "pending" según los intentos
        const isFinalFailure = nextAttempt >= 3;
        await supabase
          .from('whatsapp_messages')
          .update({
            status: isFinalFailure ? 'failed' : 'pending',
            error_message: sendError.message || String(sendError)
          })
          .eq('id', msg.id);
      }

      // Pequeño delay de 2 segundos entre envíos para no ser marcado como SPAM
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error('Excepción global en el worker loop:', err);
  } finally {
    isProcessing = false;
  }
}

function startWorkerLoop() {
  console.log('🔄 Worker escuchando cola de Supabase cada 10 segundos...');
  setInterval(processPendingMessages, 10000);
  // Ejecutar primera consulta inmediatamente
  processPendingMessages();
}
