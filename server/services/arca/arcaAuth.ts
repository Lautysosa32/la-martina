import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import forge from 'node-forge';
import { arcaConfig } from './arcaConfig';
import { FiscalRepository } from '../../db/fiscalRepository';

export interface WsaaTicket {
  token: string;
  sign: string;
  generationTime: string;
  expirationTime: string;
  service: string;
}

export interface CertificateInfo {
  isValid: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: Date;
  validTo?: Date;
  daysRemaining?: number;
  error?: string;
}

// 1. Caché en memoria de Tickets de Acceso (uno por cada servicio, ej. 'wsmtxca' y 'wsfe')
const ticketCache: Map<string, WsaaTicket> = new Map();

// 2. Control de concurrencia (Single-Flight / Shared Promise):
// Si llegan múltiples solicitudes simultáneas cuando el ticket está vencido,
// todas comparten la misma promesa de renovación en curso.
const inFlightAuthPromises: Map<string, Promise<WsaaTicket>> = new Map();

/**
 * Ruta del archivo de caché persistente en disco (dentro de certs/, ignorado por git).
 */
function getTicketFilePath(service: string): string {
  const dir = process.env.VERCEL
    ? path.join(os.tmpdir(), 'certs')
    : path.resolve(process.cwd(), 'certs');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, `.ta-${service}.json`);
}

/**
 * Determina si un ticket tiene token/sign y si su expirationTime está vigente,
 * restando un margen de seguridad (por defecto 10 minutos = 600.000 ms).
 */
export function isTicketValid(ticket: WsaaTicket | null | undefined, marginMs: number = 10 * 60 * 1000): boolean {
  if (!ticket || !ticket.token || !ticket.sign || !ticket.expirationTime) {
    return false;
  }
  const expTime = new Date(ticket.expirationTime).getTime();
  if (isNaN(expTime)) {
    return false;
  }
  return (expTime - Date.now()) > marginMs;
}

/**
 * Carga un ticket de acceso persistido desde archivo local o PostgreSQL/Supabase.
 */
async function loadPersistedTicket(service: string): Promise<WsaaTicket | null> {
  // 1. Intentar cargar desde el archivo local en disco
  try {
    const filePath = getTicketFilePath(service);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.token && parsed.sign && parsed.expirationTime) {
        return parsed as WsaaTicket;
      }
    }
  } catch (err: any) {
    console.warn(`[WSAA Cache] Error leyendo archivo de caché local para '${service}': ${err.message}`);
  }

  // 2. Intentar cargar desde la base de datos (PostgreSQL/Supabase)
  try {
    const repo = new FiscalRepository();
    const dbTicket = await repo.getAccessTicket(service);
    if (dbTicket && dbTicket.token && dbTicket.sign && dbTicket.expiration_time) {
      return {
        service: dbTicket.service,
        token: dbTicket.token,
        sign: dbTicket.sign,
        generationTime: dbTicket.generation_time,
        expirationTime: dbTicket.expiration_time
      };
    }
  } catch (err: any) {
    // Si la base de datos no está disponible o no tiene la tabla, no interrumpe el flujo
  }

  return null;
}

/**
 * Guarda el ticket de acceso en memoria, archivo local y base de datos.
 */
async function savePersistedTicket(ticket: WsaaTicket): Promise<void> {
  // 1. Guardar en memoria
  ticketCache.set(ticket.service, ticket);

  // 2. Guardar en archivo local
  try {
    const filePath = getTicketFilePath(ticket.service);
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2), 'utf8');
  } catch (err: any) {
    console.warn(`[WSAA Cache] Error guardando ticket local en '${ticket.service}': ${err.message}`);
  }

  // 3. Guardar en PostgreSQL / Supabase
  try {
    const repo = new FiscalRepository();
    await repo.saveAccessTicket({
      service: ticket.service,
      token: ticket.token,
      sign: ticket.sign,
      generation_time: ticket.generationTime,
      expiration_time: ticket.expirationTime
    });
  } catch (err: any) {
    // Falla no bloqueante si Supabase no está configurado
  }
}

/**
 * Determina si un error devuelto por WSAA corresponde a la existencia de un TA previo en ARCA.
 */
function isAlreadyAuthenticatedError(err: any): boolean {
  const msg = (err?.message || '') + ' ' + (typeof err === 'string' ? err : '');
  return msg.includes('El CEE ya posee un TA valido') || msg.includes('alreadyAuthenticated');
}

/**
 * Asegura que los certificados .crt y .key existan en disco (local o /tmp de Vercel).
 * Si no existen, los descarga automáticamente desde Supabase settings o variables de entorno.
 */
export async function ensureCertificatesOnDisk(userToken?: string): Promise<boolean> {
  try {
    if (fs.existsSync(arcaConfig.certPath) && fs.existsSync(arcaConfig.keyPath)) {
      return true;
    }

    const certsDir = path.dirname(arcaConfig.certPath);
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    // 1. Intentar desde variables de entorno
    if (process.env.ARCA_CERT_CONTENT && process.env.ARCA_KEY_CONTENT) {
      fs.writeFileSync(arcaConfig.certPath, process.env.ARCA_CERT_CONTENT, 'utf8');
      fs.writeFileSync(arcaConfig.keyPath, process.env.ARCA_KEY_CONTENT, 'utf8');
      return true;
    }

    // 2. Intentar cargar desde Supabase settings
    const repo = new FiscalRepository();
    const client = repo.getClient(userToken);
    const envKey = `arca_certificates_${arcaConfig.environment}`;
    const { data, error } = await client
      .from('settings')
      .select('value')
      .eq('key', envKey)
      .eq('branch_id', 'main')
      .maybeSingle();

    if (!error && data?.value && data.value.crt && data.value.key) {
      fs.writeFileSync(arcaConfig.certPath, data.value.crt, 'utf8');
      fs.writeFileSync(arcaConfig.keyPath, data.value.key, 'utf8');
      return true;
    }
  } catch (err: any) {
    console.warn('[ARCA Auth] Error asegurando certificados en disco:', err.message);
  }
  return false;
}

/**
 * Lee y analiza la vigencia y datos del certificado digital X.509 configurado.
 */
export function getCertificateInfo(): CertificateInfo {
  try {
    if (!fs.existsSync(arcaConfig.certPath)) {
      return {
        isValid: false,
        error: `No se encontró el certificado en la ruta: ${arcaConfig.certPath}`
      };
    }

    const certPem = fs.readFileSync(arcaConfig.certPath, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);

    const now = new Date();
    const validFrom = cert.validity.notBefore;
    const validTo = cert.validity.notAfter;
    const isValid = now >= validFrom && now <= validTo;
    const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      isValid,
      subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
      issuer: cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
      validFrom,
      validTo,
      daysRemaining,
      error: isValid ? undefined : (now > validTo ? 'Certificado expirado' : 'Certificado aún no válido')
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Error al leer certificado X.509: ${err.message}`
    };
  }
}

/**
 * Genera el XML de solicitud de ticket (loginTicketRequest) para WSAA.
 */
function createLoginTicketRequestXml(service: string): string {
  const now = new Date();
  // Margen de 10 minutos hacia el pasado para evitar problemas de desfase horario con los servidores de ARCA
  const genTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  // Vencimiento a 12 horas
  const expTime = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const uniqueId = Math.floor(now.getTime() / 1000);

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`.trim();
}

/**
 * Firma el XML de requerimiento en formato CMS / PKCS#7 utilizando node-forge.
 */
function signLoginTicketRequest(xml: string): string {
  if (!fs.existsSync(arcaConfig.certPath)) {
    throw new Error(`Archivo de certificado no encontrado en: ${arcaConfig.certPath}`);
  }
  if (!fs.existsSync(arcaConfig.keyPath)) {
    throw new Error(`Archivo de clave privada no encontrado en: ${arcaConfig.keyPath}`);
  }

  const certPem = fs.readFileSync(arcaConfig.certPath, 'utf8');
  const keyPem = fs.readFileSync(arcaConfig.keyPath, 'utf8');

  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);

  // Crear estructura PKCS#7 signedData
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data
      },
      {
        type: forge.pki.oids.messageDigest
      },
      {
        type: forge.pki.oids.signingTime
      }
    ]
  });

  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

/**
 * Parsea la respuesta SOAP de LoginCms de WSAA.
 */
function parseWsaaResponse(soapXml: string, service: string): WsaaTicket {
  // Extraer el contenido de loginCmsReturn (puede estar escapado como XML entity)
  const returnMatch = soapXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/i);
  if (!returnMatch) {
    const faultMatch = soapXml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
    const fault = faultMatch ? faultMatch[1] : 'Respuesta SOAP inválida de WSAA';
    throw new Error(`Error de WSAA ARCA: ${fault}`);
  }

  let xmlContent = returnMatch[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const tokenMatch = xmlContent.match(/<token>([\s\S]*?)<\/token>/i);
  const signMatch = xmlContent.match(/<sign>([\s\S]*?)<\/sign>/i);
  const genMatch = xmlContent.match(/<generationTime>([\s\S]*?)<\/generationTime>/i);
  const expMatch = xmlContent.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/i);

  if (!tokenMatch || !signMatch) {
    throw new Error('No se pudo extraer Token o Sign de la respuesta de WSAA.');
  }

  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim(),
    generationTime: genMatch ? genMatch[1].trim() : new Date().toISOString(),
    expirationTime: expMatch ? expMatch[1].trim() : new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    service
  };
}

/**
 * Solicita un nuevo Ticket de Acceso a WSAA de ARCA.
 */
async function requestNewTicket(service: string): Promise<WsaaTicket> {
  // 1. Verificar si existen certificados físicos reales en disco
  const certExists = fs.existsSync(arcaConfig.certPath);
  const keyExists = fs.existsSync(arcaConfig.keyPath);

  if (!certExists) {
    throw new Error(`Certificado ARCA no configurado o archivo no encontrado en: ${arcaConfig.certPath}. Configure ARCA_CERT_PATH.`);
  }
  if (!keyExists) {
    throw new Error(`Clave privada ARCA no configurada o archivo no encontrado en: ${arcaConfig.keyPath}. Configure ARCA_KEY_PATH.`);
  }

  // 2. Generar y firmar CMS
  const xml = createLoginTicketRequestXml(service);
  const cmsBase64 = signLoginTicketRequest(xml);

  // 3. Enviar solicitud SOAP a WSAA
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
   <soapenv:Header/>
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>${cmsBase64}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>`;

  let responseData: string;
  try {
    const response = await axios.post(arcaConfig.endpoints.wsaa, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': ''
      },
      timeout: 30000
    });
    responseData = response.data;
  } catch (err: any) {
    if (err.response && err.response.data) {
      responseData = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
    } else {
      throw err;
    }
  }

  const ticket = parseWsaaResponse(responseData, service);
  return ticket;
}

/**
 * Obtiene un Ticket de Acceso (WSAA) vigente para el servicio solicitado ('wsmtxca' | 'wsfe').
 * 
 * Flujo:
 * 1. Verifica vigencia en memoria (ticketCache).
 * 2. Si no existe o se reinició el servidor, lee el TA persistido (disco / PostgreSQL) y valida expirationTime.
 * 3. Si sigue vigente (con margen de 10 min), lo reutiliza inmediatamente sin consultar a WSAA.
 * 4. Si no está vigente o se solicita forzar renovación, utiliza Single-Flight para que sólo una
 *    petición llame a WSAA y las concurrentes esperen.
 * 5. Si WSAA devuelve "El CEE ya posee un TA valido", recupera el TA válido persistido sin fallar
 *    ni inventar credenciales.
 */
export async function getWsaaTicket(service: string = 'wsmtxca', forceRenew: boolean = false): Promise<WsaaTicket> {
  // Validación estricta: los certificados deben existir físicamente en disco
  if (!fs.existsSync(arcaConfig.certPath)) {
    throw new Error(`Certificado ARCA no configurado o archivo no encontrado en: ${arcaConfig.certPath}. Configure ARCA_CERT_PATH.`);
  }
  if (!fs.existsSync(arcaConfig.keyPath)) {
    throw new Error(`Clave privada ARCA no configurada o archivo no encontrado en: ${arcaConfig.keyPath}. Configure ARCA_KEY_PATH.`);
  }

  // 1. Verificar si está en memoria y es válido con margen de 10 minutos
  if (!forceRenew) {
    const memCached = ticketCache.get(service);
    if (isTicketValid(memCached)) {
      return memCached!;
    }

    // 2. Si no está en memoria (ej. reinicio de Node.js), cargar desde persistencia
    const persisted = await loadPersistedTicket(service);
    if (isTicketValid(persisted)) {
      ticketCache.set(service, persisted!);
      return persisted!;
    }
  }

  // 3. Control de concurrencia (Single-Flight / Shared Promise):
  // Si ya hay una solicitud a WSAA en curso para este servicio, las demás esperan esa misma promesa.
  let existingPromise = inFlightAuthPromises.get(service);
  if (existingPromise) {
    return existingPromise;
  }

  const authPromise = (async () => {
    try {
      const newTicket = await requestNewTicket(service);
      await savePersistedTicket(newTicket);
      return newTicket;
    } catch (err: any) {
      // 4. Manejo del caso de desincronización: ARCA informa que ya existe un TA válido
      if (isAlreadyAuthenticatedError(err)) {
        console.warn(`[WSAA Sync] ARCA informa que ya existe un TA activo para '${service}'. Recuperando desde almacenamiento persistente...`);
        const persisted = await loadPersistedTicket(service);
        // Si el ticket persistido aún no ha superado su fecha de expiración real, reutilizarlo
        if (persisted && isTicketValid(persisted, 0)) {
          console.log(`[WSAA Sync] TA para '${service}' recuperado exitosamente desde persistencia.`);
          ticketCache.set(service, persisted);
          return persisted;
        }

        throw new Error(
          `Error de sincronización con ARCA WSAA: El CEE ya posee un TA válido para el servicio '${service}' en ARCA pero el ticket no está disponible localmente. Debe esperarse a la expiración de la sesión en ARCA para solicitar uno nuevo.`
        );
      }
      throw err;
    } finally {
      // Limpiar promesa activa al terminar
      inFlightAuthPromises.delete(service);
    }
  })();

  inFlightAuthPromises.set(service, authPromise);
  return authPromise;
}

/**
 * Limpia el caché de tickets de acceso (en memoria y opcionalmente en disco).
 */
export function clearTicketCache(clearPersisted: boolean = false): void {
  ticketCache.clear();
  inFlightAuthPromises.clear();
  if (clearPersisted) {
    for (const s of ['wsmtxca', 'wsfe']) {
      try {
        const fp = getTicketFilePath(s);
        if (fs.existsSync(fp)) {
          fs.unlinkSync(fp);
        }
      } catch {}
    }
  }
}
