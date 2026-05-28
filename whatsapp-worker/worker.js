require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// 1. Inicializar Cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('🚨 ERROR CRÍTICO: Faltan variables de entorno SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_KEY/VITE_SUPABASE_ANON_KEY en el archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Inicializar Cliente WhatsApp Web con autenticación persistente local
console.log('🤖 Inicializando cliente de WhatsApp Web con parámetros optimizados...');
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session' // Guarda la sesión para no tener que escanear el QR cada vez
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

console.log('⏳ Cargando navegador Chromium de fondo (esto puede tardar 20-30 segundos la primera vez)...');

// 3. Generar y mostrar el código QR en la consola
client.on('qr', (qr) => {
  console.clear();
  console.log('📱 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP COMERCIAL:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✨ ¡Cliente de WhatsApp listo y conectado!');
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
  if (cleaned.startsWith('54') && cleaned.length === 12) {
    cleaned = '549' + cleaned.substring(2);
  }
  return cleaned;
};

// 4. Lógica de Envío de Mensajes
let isProcessing = false;

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
      console.error('Error leyendo la tabla whatsapp_messages:', error.message);
      isProcessing = false;
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`📨 Procesando ${pendingMessages.length} mensaje(s) pendiente(s)...`);

    for (const msg of pendingMessages) {
      // Normalizar número telefónico
      const formattedPhone = formatArgentinePhone(msg.phone);
      console.log(`👉 Enviando mensaje a +${formattedPhone} (Cliente: ${msg.customer_name || 'Desconocido'})...`);

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

        console.log(`✅ ¡Mensaje enviado con éxito a +${formattedPhone}!`);

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
