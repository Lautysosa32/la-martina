require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { createClient } = require('@supabase/supabase-js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ==============================================================================
// 1. SISTEMA DE LOGS DUAL (Consola + worker.log)
// ==============================================================================
const LOG_FILE = path.join(__dirname, 'worker.log');
const STATUS_FILE = path.join(__dirname, 'status.json');

function logMessage(level, ...args) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  const line = `[${timestamp}] [${level}] ${text}\n`;

  // Imprimir en consola
  if (level === 'ERROR') {
    console.error(`[${level}]`, ...args);
  } else if (level === 'WARN') {
    console.warn(`[${level}]`, ...args);
  } else {
    console.log(...args);
  }

  // Escribir en archivo (rotación si supera 5 MB)
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, path.join(__dirname, 'worker.log.old'));
    }
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    // Silencioso si falla escritura de log
  }
}

const logger = {
  info: (...args) => logMessage('INFO', ...args),
  warn: (...args) => logMessage('WARN', ...args),
  error: (...args) => logMessage('ERROR', ...args),
};

function updateStatus(state) {
  try {
    const current = fs.existsSync(STATUS_FILE) 
      ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) 
      : {};
    const updated = {
      ...current,
      ...state,
      last_update: new Date().toISOString()
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    // Silencioso
  }
}

// Manejo global de excepciones para evitar cierres inesperados
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  if (msg.includes('Execution context was destroyed') || msg.includes('Target closed') || msg.includes('Session closed')) {
    logger.warn('⏳ Evento transitorio de navegación en WhatsApp Web ignorado:', msg);
    return;
  }
  logger.error('Unhandled Rejection capturado:', msg);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception capturada:', err.message, err.stack);
});

// ==============================================================================
// 2. VERIFICACIÓN DE CONEXIÓN A INTERNET AL INICIAR LA COMPUTADORA
// ==============================================================================
async function waitForInternet(maxAttempts = 40, delayMs = 3000) {
  logger.info('🌐 Verificando conexión a Internet antes de abrir WhatsApp...');
  updateStatus({ status: 'waiting_internet', message: 'Esperando conexión a Internet...' });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await dns.lookup('web.whatsapp.com');
      logger.info('✅ Conexión a Internet detectada exitosamente.');
      return true;
    } catch (e) {
      try {
        await dns.lookup('google.com');
        logger.info('✅ Conexión a Internet detectada exitosamente.');
        return true;
      } catch (err2) {
        if (attempt === 1 || attempt % 5 === 0) {
          logger.warn(`⏳ Esperando conexión a Internet... Intento ${attempt}/${maxAttempts}`);
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  logger.warn('⚠️ Se agotó el tiempo esperando DNS de WhatsApp. Se intentará iniciar de todos modos.');
  return false;
}

// ==============================================================================
// 3. LIMPIEZA DE BLOQUEOS RESIDUALES DE CHROMIUM (SingletonLock)
// ==============================================================================
function cleanStaleSessionLocks() {
  const sessionDir = path.join(__dirname, 'session', 'session');
  if (!fs.existsSync(sessionDir)) return;

  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const lockFile of lockFiles) {
    const fullPath = path.join(sessionDir, lockFile);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.info(`🧹 Eliminado bloqueo residual de Chromium: ${lockFile}`);
      }
    } catch (e) {
      logger.warn(`No se pudo eliminar ${lockFile} (puede estar en uso): ${e.message}`);
    }
  }
}

// ==============================================================================
// 4. CLIENTE SUPABASE
// ==============================================================================
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_KEY || 
                    process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('🚨 ERROR CRÍTICO: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY en whatsapp-worker/.env');
  process.exit(1);
}

const isServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY);
logger.info(`🔗 Conectando con Supabase: ${supabaseUrl}`);
logger.info(`🔑 Modo de clave: ${isServiceRole ? 'Service Role (Bypass RLS habilitado)' : 'Pública / Anon'}`);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

async function ensureAuthenticated() {
  if (process.env.WORKER_EMAIL && process.env.WORKER_PASSWORD) {
    try {
      logger.info(`👤 Autenticando worker como empleado (${process.env.WORKER_EMAIL})...`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: process.env.WORKER_EMAIL,
        password: process.env.WORKER_PASSWORD
      });
      if (error) {
        logger.error('⚠️ Error autenticando worker en Supabase:', error.message);
      } else {
        logger.info('✅ Worker autenticado como empleado:', data.user.email);
      }
    } catch (authErr) {
      logger.error('⚠️ Excepción autenticando worker:', authErr.message);
    }
  }
}

// ==============================================================================
// 5. FORMATEO DE TELÉFONOS ARGENTINOS
// ==============================================================================
const formatArgentinePhone = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return '';

  // 1. Quitar 0 inicial si existe (ej. 02614567890 -> 2614567890)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // 2. Si ya empieza con 549, está listo
  if (cleaned.startsWith('549')) {
    return cleaned;
  }

  // 3. Si empieza con 54 pero no con 9 (ej. 542614567890)
  if (cleaned.startsWith('54')) {
    const withoutCountry = cleaned.substring(2);
    // Quitar 0 o 15 si quedaron pegados
    let rest = withoutCountry;
    if (rest.startsWith('0')) rest = rest.substring(1);
    return '549' + rest;
  }

  // 4. Si tiene 10 dígitos (ej. 2614567890 o 1145678901)
  if (cleaned.length === 10) {
    return '549' + cleaned;
  }

  // 5. Manejar prefijo móvil "15" dentro del número nacional
  // Ej: 261 15 4567890 (12 dígitos -> quitar 15)
  if (cleaned.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (cleaned.substring(areaLen, areaLen + 2) === '15') {
        cleaned = cleaned.substring(0, areaLen) + cleaned.substring(areaLen + 2);
        break;
      }
    }
    if (cleaned.length === 10) {
      return '549' + cleaned;
    }
  }

  // 6. Por defecto anteponer 549 si parece número nacional
  if (cleaned.length >= 8 && cleaned.length <= 11) {
    return '549' + cleaned;
  }

  return cleaned;
};

// ==============================================================================
// 6. HELPER DE TIMEOUT
// ==============================================================================
function withTimeout(promise, ms, errorMsg) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg || `Operación agotó tiempo de espera (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// ==============================================================================
// 7. INICIALIZACIÓN DE WHATSAPP WEB
// ==============================================================================
let client = null;
let isProcessing = false;
let workerLoopInterval = null;
let isReady = false;

function saveQrHtml(qrString) {
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}`;
    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Vincular WhatsApp - Martina Supermercado</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; max-width: 440px; border: 1px solid rgba(255,255,255,0.1); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #22c55e; }
    p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5; }
    .qr-container { background: white; padding: 1.25rem; border-radius: 1rem; display: inline-block; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
    img { display: block; border-radius: 0.5rem; }
    .instructions { margin-top: 1.5rem; text-align: left; background: #0f172a; padding: 1rem; border-radius: 0.75rem; font-size: 0.85rem; color: #cbd5e1; }
    .instructions ol { margin: 0; padding-left: 1.25rem; }
    .instructions li { margin-bottom: 0.25rem; }
    .tag { display: inline-block; background: #22c55e20; color: #4ade80; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📱 Vincular WhatsApp Comercial</h1>
    <p>Escaneá este código QR con tu WhatsApp para activar el envío automático de notificaciones.</p>
    <div class="qr-container">
      <img src="${qrUrl}" width="300" height="300" alt="Código QR WhatsApp" />
    </div>
    <div class="instructions">
      <ol>
        <li>Abrí WhatsApp en tu teléfono</li>
        <li>Tocá los 3 puntos (o Ajustes) &gt; <b>Dispositivos vinculados</b></li>
        <li>Tocá <b>Vincular un dispositivo</b> y apuntá la cámara</li>
      </ol>
    </div>
    <div class="tag">⚡ Conexión Automática Activa</div>
  </div>
</body>
</html>`;
    fs.writeFileSync(path.join(__dirname, 'qr.html'), htmlContent, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'qr.txt'), qrString, 'utf8');
    logger.info('📄 Archivo qr.html generado. Si es necesario, abrilo en tu navegador para escanear.');
  } catch (err) {
    logger.error('Error guardando qr.html:', err.message);
  }
}

async function createWhatsAppClient() {
  logger.info('🤖 Configurando cliente de WhatsApp Web...');
  cleanStaleSessionLocks();

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, 'session')
    }),
    webVersionCache: {
      type: 'remotePath',
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

  client.on('loading_screen', (percent, message) => {
    logger.info(`⏳ Cargando WhatsApp Web... ${percent}% (${message})`);
    updateStatus({ status: 'loading', percent, message });
  });

  client.on('qr', (qr) => {
    logger.warn('📱 SE REQUIERE ESCANEAR CÓDIGO QR PARA VINCULAR WHATSAPP.');
    qrcode.generate(qr, { small: true });
    saveQrHtml(qr);
    updateStatus({ status: 'qr_needed', message: 'Se requiere escanear QR' });
  });

  client.on('authenticated', () => {
    logger.info('🔑 Sesión de WhatsApp autenticada correctamente.');
    updateStatus({ status: 'authenticated' });
    // Limpiar qr.html una vez autenticado
    try {
      if (fs.existsSync(path.join(__dirname, 'qr.html'))) {
        fs.unlinkSync(path.join(__dirname, 'qr.html'));
      }
    } catch {}
  });

  client.on('auth_failure', (msg) => {
    logger.error('❌ Error de autenticación en WhatsApp Web:', msg);
    updateStatus({ status: 'auth_failure', error: msg });
  });

  client.on('disconnected', async (reason) => {
    logger.warn('⚠️ Se perdió la conexión con WhatsApp Web. Motivo:', reason);
    isReady = false;
    updateStatus({ status: 'disconnected', reason });

    if (workerLoopInterval) {
      clearInterval(workerLoopInterval);
      workerLoopInterval = null;
    }

    logger.info('🔄 Reintentando reconectar en 15 segundos...');
    await new Promise(r => setTimeout(r, 15000));
    try {
      await client.destroy();
    } catch {}
    await start();
  });

  client.on('ready', async () => {
    isReady = true;
    logger.info('✨ ¡Cliente de WhatsApp listo y conectado al servicio!');
    updateStatus({ status: 'connected', ready_at: new Date().toISOString() });

    await ensureAuthenticated();

    // Test de conexión con tabla
    try {
      const { data: testRows, error: testError } = await supabase
        .from('whatsapp_messages')
        .select('id, status')
        .limit(1);

      if (testError) {
        logger.error('🚨 ADVERTENCIA: Error al consultar whatsapp_messages:', testError.message);
      } else {
        logger.info('✅ Conexión con tabla whatsapp_messages verificada correctamente.');
      }
    } catch (tErr) {
      logger.warn('Advertencia en test inicial:', tErr.message);
    }

    // Resetear mensajes colgados en "sending"
    try {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'pending' })
        .eq('status', 'sending');
      if (!error) {
        logger.info('🧹 Se resetearon mensajes colgados en "sending" a "pending".');
      }
    } catch (err) {
      logger.error('Error limpiando mensajes colgados:', err.message);
    }

    startWorkerLoop();
  });

  try {
    logger.info('⏳ Iniciando navegador Chromium de fondo...');
    await client.initialize();
  } catch (initErr) {
    logger.error('❌ Error al inicializar cliente de WhatsApp:', initErr.message);
    logger.info('🔄 Reintentando inicialización completa en 20 segundos...');
    setTimeout(start, 20000);
  }
}

// ==============================================================================
// 8. PROCESAMIENTO DE MENSAJES PENDIENTES
// ==============================================================================
let idleTicks = 0;

async function processPendingMessages() {
  if (isProcessing || !isReady) return;
  isProcessing = true;

  try {
    const { data: pendingMessages, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      logger.error('❌ Error leyendo whatsapp_messages:', error.message);
      isProcessing = false;
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      idleTicks++;
      if (idleTicks >= 6) { // ~1 minuto
        idleTicks = 0;
        logger.info(`[${new Date().toLocaleTimeString()}] ⏳ Escuchando cola... (0 mensajes pendientes)`);
        updateStatus({ status: 'connected', pending_count: 0 });
      }
      isProcessing = false;
      return;
    }

    idleTicks = 0;
    logger.info(`📨 [${new Date().toLocaleTimeString()}] Procesando ${pendingMessages.length} mensaje(s) pendiente(s)...`);
    updateStatus({ status: 'connected', pending_count: pendingMessages.length });

    for (const msg of pendingMessages) {
      const formattedPhone = formatArgentinePhone(msg.phone);
      logger.info(`👉 Enviando mensaje #${msg.id} a +${formattedPhone} (Cliente: ${msg.customer_name || 'Desconocido'})...`);

      const nextAttempt = (msg.attempts || 0) + 1;
      const { error: lockError } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'sending', attempts: nextAttempt })
        .eq('id', msg.id);

      if (lockError) {
        logger.error(`Error bloqueando mensaje #${msg.id}:`, lockError.message);
        continue;
      }

      try {
        // Resolver ID con timeout de 20 segundos
        const numberId = await withTimeout(
          client.getNumberId(formattedPhone),
          20000,
          `Timeout resolviendo número WhatsApp +${formattedPhone}`
        );

        const chatId = numberId ? numberId._serialized : `${formattedPhone}@c.us`;

        // Enviar con timeout de 25 segundos
        await withTimeout(
          client.sendMessage(chatId, msg.message),
          25000,
          `Timeout enviando mensaje a ${chatId}`
        );

        logger.info(`✅ ¡Mensaje #${msg.id} enviado con éxito a +${formattedPhone}!`);

        await supabase
          .from('whatsapp_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', msg.id);

      } catch (sendError) {
        const errorMsg = sendError.message || String(sendError);
        logger.error(`❌ Falló el envío del mensaje #${msg.id} a +${msg.phone}:`, errorMsg);

        const isFinalFailure = nextAttempt >= 3;
        await supabase
          .from('whatsapp_messages')
          .update({
            status: isFinalFailure ? 'failed' : 'pending',
            error_message: errorMsg
          })
          .eq('id', msg.id);
      }

      // Pequeña pausa entre envíos para prevenir spam y sobrecalentamiento
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

  } catch (err) {
    logger.error('Excepción global en el worker loop:', err.message);
  } finally {
    isProcessing = false;
  }
}

function startWorkerLoop() {
  if (workerLoopInterval) clearInterval(workerLoopInterval);
  logger.info('🔄 Worker escuchando cola de Supabase cada 10 segundos...');
  workerLoopInterval = setInterval(processPendingMessages, 10000);
  processPendingMessages();
}

// ==============================================================================
// 9. PUNTO DE ENTRADA PRINCIPAL
// ==============================================================================
async function start() {
  logger.info('===================================================');
  logger.info('  🤖 ROBOT DE WHATSAPP - Martina Supermercado');
  logger.info('===================================================');

  // 1. Esperar que Windows termine de conectar el Internet
  await waitForInternet();

  // 2. Inicializar cliente
  await createWhatsAppClient();
}

start();
