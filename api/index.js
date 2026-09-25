var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server/index.ts
import express from "express";
import dotenv3 from "dotenv";

// server/routes/arca.routes.ts
import { Router } from "express";
import crypto from "crypto";

// server/services/arca/arcaConfig.ts
import dotenv from "dotenv";
import path from "path";
import os2 from "os";
import fs from "fs";
dotenv.config();
var envVal = (process.env.ARCA_ENV || process.env.ARCA_ENVIRONMENT || "testing").toLowerCase();
var isProduction = envVal === "production";
var isVercel = Boolean(process.env.VERCEL);
var baseCertsDir = isVercel ? path.join(os2.tmpdir(), "certs") : path.resolve(process.cwd(), "certs");
var certFilename = isProduction ? "prod.crt" : "homo.crt";
var keyFilename = isProduction ? "prod.key" : "homo.key";
var defaultCertPath = process.env.ARCA_CERT_PATH || (fs.existsSync(path.resolve(process.cwd(), `certs/${certFilename}`)) ? path.resolve(process.cwd(), `certs/${certFilename}`) : path.join(baseCertsDir, certFilename));
var defaultKeyPath = process.env.ARCA_KEY_PATH || (fs.existsSync(path.resolve(process.cwd(), `certs/${keyFilename}`)) ? path.resolve(process.cwd(), `certs/${keyFilename}`) : path.join(baseCertsDir, keyFilename));
try {
  if (!fs.existsSync(defaultCertPath) && process.env.ARCA_CERT_CONTENT) {
    if (!fs.existsSync(baseCertsDir)) fs.mkdirSync(baseCertsDir, { recursive: true });
    fs.writeFileSync(defaultCertPath, process.env.ARCA_CERT_CONTENT, "utf8");
  }
  if (!fs.existsSync(defaultKeyPath) && process.env.ARCA_KEY_CONTENT) {
    if (!fs.existsSync(baseCertsDir)) fs.mkdirSync(baseCertsDir, { recursive: true });
    fs.writeFileSync(defaultKeyPath, process.env.ARCA_KEY_CONTENT, "utf8");
  }
} catch (e) {
}
var arcaConfig = {
  environment: isProduction ? "production" : "testing",
  cuit: (process.env.ARCA_CUIT || "20462370033").replace(/\D/g, ""),
  certPath: defaultCertPath,
  keyPath: defaultKeyPath,
  defaultPointOfSale: Number(process.env.ARCA_PV || process.env.ARCA_DEFAULT_POINT_OF_SALE || 1),
  endpoints: {
    wsaa: isProduction ? "https://wsaa.afip.gov.ar/ws/services/LoginCms" : "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsmtxca: isProduction ? "https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService" : "https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService",
    wsfe: isProduction ? "https://servicios1.afip.gob.ar/wsfev1/service.asmx" : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"
  }
};
function getSafeFiscalConfig() {
  return {
    environment: arcaConfig.environment,
    cuit: arcaConfig.cuit,
    defaultPointOfSale: arcaConfig.defaultPointOfSale
  };
}

// server/services/arca/arcaAuth.ts
import fs2 from "fs";
import path2 from "path";
import axios from "axios";
import forge from "node-forge";

// server/db/fiscalRepository.ts
import { createClient } from "@supabase/supabase-js";
import dotenv2 from "dotenv";
dotenv2.config();
var supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://oczxbflkvutumcflnwlx.supabase.co";
function getSupabaseAdminKey() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (key && (key.startsWith("sb_publishable_") || key === process.env.VITE_SUPABASE_ANON_KEY)) {
    return "";
  }
  return key.trim();
}
var FiscalRepository = class {
  /**
   * Inicializa el repositorio fiscal utilizando exclusivamente el cliente administrativo de backend.
   * NO recibe ni adjunta tokens JWT de usuario/sesión en las cabeceras globales para garantizar
   * que las operaciones fiscales administrativas se ejecuten con rol maestro (service_role) y no
   * sean bloqueadas por políticas de RLS de usuarios individuales.
   */
  constructor() {
    const adminKey = getSupabaseAdminKey();
    this.isServiceRoleConfigured = Boolean(adminKey);
    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    };
    if (!adminKey) {
      this.client = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_vGCWtTOQ5cPScfxggmOMwg_DyIX6lhO", options);
    } else {
      this.client = createClient(supabaseUrl, adminKey, options);
    }
  }
  getClient(userToken) {
    if (this.isServiceRoleConfigured || !userToken) {
      return this.client;
    }
    return createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_vGCWtTOQ5cPScfxggmOMwg_DyIX6lhO", {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });
  }
  /**
   * Obtiene una operación por su clave única de idempotencia.
   */
  async getOperationByIdempotencyKey(idempotencyKey) {
    const { data, error } = await this.client.from("fiscal_invoice_operations").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) {
      console.warn(`[FiscalRepository] Error al buscar operaci\xF3n por idempotencyKey: ${error.message}`);
      return null;
    }
    return data;
  }
  /**
   * Obtiene una operación por su ID primario.
   */
  async getOperationById(id) {
    const { data, error } = await this.client.from("fiscal_invoice_operations").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.warn(`[FiscalRepository] Error al buscar operaci\xF3n por ID: ${error.message}`);
      return null;
    }
    return data;
  }
  /**
   * Registra una nueva operación fiscal en PostgreSQL.
   * Si ya existe la clave de idempotencia, falla garantizando la restricción UNIQUE.
   */
  async createOperation(op) {
    const record = {
      ...op,
      created_at: op.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { data, error } = await this.client.from("fiscal_invoice_operations").insert(record).select().single();
    if (error) {
      return { success: false, error };
    }
    return { success: true, data };
  }
  /**
   * Actualiza el estado y datos de una operación fiscal.
   */
  async updateOperation(idempotencyKey, updates) {
    const updatePayload = {
      ...updates,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { error } = await this.client.from("fiscal_invoice_operations").update(updatePayload).eq("idempotency_key", idempotencyKey);
    if (error) {
      console.error(`[FiscalRepository] Error actualizando operaci\xF3n ${idempotencyKey}:`, error.message);
      return false;
    }
    return true;
  }
  /**
   * Comprueba en PostgreSQL si alguna de las ventas ya está asociada a una factura AUTORIZADA.
   * Utiliza el operador de superposición de arrays de PostgreSQL (.overlaps).
   */
  async findAuthorizedInvoicesForSales(saleIds) {
    if (!saleIds || saleIds.length === 0) return [];
    const { data, error } = await this.client.from("invoices").select("*").eq("status", "AUTORIZADA").overlaps("sale_ids", saleIds);
    if (error) {
      console.error(`[FiscalRepository] Error verificando ventas facturadas en PostgreSQL:`, error.message);
      return [];
    }
    return data || [];
  }
  /**
   * Guarda una factura fiscal autorizada con CAE real en la tabla `invoices`.
   */
  async saveInvoice(invoice) {
    const { error } = await this.client.from("invoices").insert({
      ...invoice,
      created_at: invoice.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (error) {
      console.error(`[FiscalRepository] Error persistiendo factura ${invoice.id}:`, error.message);
      return { success: false, error };
    }
    return { success: true };
  }
  /**
   * Obtiene una factura por su ID primario.
   */
  async getInvoiceById(id) {
    const { data, error } = await this.client.from("invoices").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error(`[FiscalRepository] Error consultando factura ${id}:`, error.message);
      return null;
    }
    return data;
  }
  /**
   * Obtiene una factura por su clave única de idempotencia.
   */
  async getInvoiceByIdempotencyKey(idempotencyKey) {
    const { data, error } = await this.client.from("invoices").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) {
      console.error(`[FiscalRepository] Error consultando factura por idempotencyKey:`, error.message);
      return null;
    }
    return data;
  }
  /**
   * Busca si ya existe un comprobante registrado por (punto de venta, tipo de comprobante, número).
   * Previene duplicados físicos y lógicos tanto para facturas locales como externas.
   */
  async findInvoiceByVoucher(pointOfSale, invoiceTypeCode, invoiceNumber) {
    const { data, error } = await this.client.from("invoices").select("*").eq("point_of_sale", pointOfSale).eq("invoice_type_code", invoiceTypeCode).eq("invoice_number", invoiceNumber).maybeSingle();
    if (error) {
      console.error(`[FiscalRepository] Error buscando comprobante PV ${pointOfSale}, Tipo ${invoiceTypeCode}, N\xBA ${invoiceNumber}:`, error.message);
      return null;
    }
    return data;
  }
  /**
   * Guarda una factura registrada manualmente/externamente.
   */
  async saveExternalInvoice(invoice) {
    const { error } = await this.client.from("invoices").insert({
      ...invoice,
      origin: "EXTERNA_MANUAL",
      status: invoice.status || "REGISTRADA_EXTERNAMENTE",
      created_at: invoice.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (error) {
      console.error(`[FiscalRepository] Error guardando factura externa ${invoice.id}:`, error.message);
      return { success: false, error };
    }
    return { success: true };
  }
  /**
   * Actualiza el estado de verificación oficial de una factura externa reconciliada con ARCA.
   */
  async updateExternalInvoiceVerification(id, updateData) {
    const { error } = await this.client.from("invoices").update({
      status: updateData.status,
      cae: updateData.cae,
      cae_expiration_date: updateData.caeExpirationDate,
      verified_at: updateData.verifiedAt,
      verified_by: updateData.verifiedBy,
      arca_observations: updateData.observations,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", id);
    if (error) {
      console.error(`[FiscalRepository] Error actualizando verificaci\xF3n de factura ${id}:`, error.message);
      return { success: false, error };
    }
    return { success: true };
  }
  /**
   * Lista facturas fiscales recientes.
   */
  async listInvoices(limit = 50) {
    const { data, error } = await this.client.from("invoices").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) {
      console.error(`[FiscalRepository] Error listando facturas:`, error.message);
      return [];
    }
    return data || [];
  }
  /**
   * Registra un log de auditoría fiscal en `fiscal_audit_logs`.
   */
  async logAudit(log) {
    try {
      await this.client.from("fiscal_audit_logs").insert({
        branch_id: log.branch_id || "main",
        action: log.action,
        voucher_info: log.voucher_info || "",
        result: log.result,
        user_id: log.user_id || "system",
        details: log.details || {},
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.warn(`[FiscalRepository] No se pudo guardar log de auditor\xEDa:`, err.message);
    }
  }
  /**
   * Obtiene los logs de auditoría fiscal recientes.
   */
  async listAuditLogs(limit = 50) {
    const { data, error } = await this.client.from("fiscal_audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) {
      console.warn(`[FiscalRepository] Error listando logs de auditor\xEDa:`, error.message);
      return [];
    }
    return data || [];
  }
  /**
   * Obtiene el Ticket de Acceso (WSAA) persistido para un servicio ('wsmtxca' | 'wsfe').
   */
  async getAccessTicket(service) {
    try {
      const { data, error } = await this.client.from("fiscal_access_tickets").select("*").eq("service", service).maybeSingle();
      if (error) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }
  /**
   * Guarda o actualiza el Ticket de Acceso (WSAA) en PostgreSQL/Supabase.
   */
  async saveAccessTicket(record) {
    try {
      await this.client.from("fiscal_access_tickets").upsert({
        service: record.service,
        token: record.token,
        sign: record.sign,
        generation_time: record.generation_time,
        expiration_time: record.expiration_time,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "service" });
    } catch (err) {
      console.warn(`[FiscalRepository] Advertencia al persistir TA en PostgreSQL: ${err.message}`);
    }
  }
  /**
   * Obtiene la configuración fiscal del comercio desde Supabase (tabla settings).
   * Si no existe o falla, retorna valores por defecto basados en variables de entorno.
   */
  async getFiscalConfig() {
    const defaults = {
      businessName: process.env.ARCA_BUSINESS_NAME || "MARTINA SUPERMERCADO S.R.L.",
      fantasyName: process.env.ARCA_FANTASY_NAME || "Supermercado La Martina",
      cuit: (process.env.ARCA_CUIT || "").replace(/\D/g, ""),
      taxCondition: process.env.ARCA_TAX_CONDITION || "Responsable Inscripto",
      grossIncome: process.env.ARCA_GROSS_INCOME || "901-123456-7",
      startDate: process.env.ARCA_START_DATE || "01/01/2024",
      fiscalAddress: process.env.ARCA_FISCAL_ADDRESS || "Av. Libertador 1234, San Luis, Argentina",
      postalCode: process.env.ARCA_POSTAL_CODE || "5700",
      phone: process.env.ARCA_PHONE || "(0266) 442-1234",
      defaultPointOfSale: Number(process.env.ARCA_PV || 1)
    };
    try {
      const { data, error } = await this.client.from("settings").select("value").eq("key", "fiscal_config").eq("branch_id", "main").maybeSingle();
      if (!error && data?.value && typeof data.value === "object") {
        return {
          ...defaults,
          ...data.value
        };
      }
    } catch (err) {
      console.warn(`[FiscalRepository] Error al obtener fiscal_config: ${err.message}`);
    }
    return defaults;
  }
  /**
   * Guarda o actualiza la configuración fiscal del comercio en Supabase.
   */
  async saveFiscalConfig(config) {
    const current = await this.getFiscalConfig();
    const updated = {
      ...current,
      ...config,
      cuit: config.cuit ? String(config.cuit).replace(/\D/g, "") : current.cuit,
      defaultPointOfSale: config.defaultPointOfSale !== void 0 ? Number(config.defaultPointOfSale) : current.defaultPointOfSale
    };
    const { error } = await this.client.from("settings").upsert(
      { key: "fiscal_config", branch_id: "main", value: updated },
      { onConflict: "key, branch_id" }
    );
    if (error) {
      console.error(`[FiscalRepository] Error guardando fiscal_config: ${error.message}`);
      throw error;
    }
    return updated;
  }
};

// server/services/arca/arcaAuth.ts
var ticketCache = /* @__PURE__ */ new Map();
var inFlightAuthPromises = /* @__PURE__ */ new Map();
function getTicketFilePath(service) {
  const dir = process.env.VERCEL ? path2.join(os.tmpdir(), "certs") : path2.resolve(process.cwd(), "certs");
  if (!fs2.existsSync(dir)) {
    try {
      fs2.mkdirSync(dir, { recursive: true });
    } catch {
    }
  }
  return path2.join(dir, `.ta-${service}.json`);
}
function isTicketValid(ticket, marginMs = 10 * 60 * 1e3) {
  if (!ticket || !ticket.token || !ticket.sign || !ticket.expirationTime) {
    return false;
  }
  const expTime = new Date(ticket.expirationTime).getTime();
  if (isNaN(expTime)) {
    return false;
  }
  return expTime - Date.now() > marginMs;
}
async function loadPersistedTicket(service) {
  try {
    const filePath = getTicketFilePath(service);
    if (fs2.existsSync(filePath)) {
      const raw = fs2.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.token && parsed.sign && parsed.expirationTime) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`[WSAA Cache] Error leyendo archivo de cach\xE9 local para '${service}': ${err.message}`);
  }
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
  } catch (err) {
  }
  return null;
}
async function savePersistedTicket(ticket) {
  ticketCache.set(ticket.service, ticket);
  try {
    const filePath = getTicketFilePath(ticket.service);
    fs2.writeFileSync(filePath, JSON.stringify(ticket, null, 2), "utf8");
  } catch (err) {
    console.warn(`[WSAA Cache] Error guardando ticket local en '${ticket.service}': ${err.message}`);
  }
  try {
    const repo = new FiscalRepository();
    await repo.saveAccessTicket({
      service: ticket.service,
      token: ticket.token,
      sign: ticket.sign,
      generation_time: ticket.generationTime,
      expiration_time: ticket.expirationTime
    });
  } catch (err) {
  }
}
function isAlreadyAuthenticatedError(err) {
  const msg = (err?.message || "") + " " + (typeof err === "string" ? err : "");
  return msg.includes("El CEE ya posee un TA valido") || msg.includes("alreadyAuthenticated");
}
async function ensureCertificatesOnDisk(userToken) {
  try {
    if (fs2.existsSync(arcaConfig.certPath) && fs2.existsSync(arcaConfig.keyPath)) {
      return true;
    }
    const certsDir = path2.dirname(arcaConfig.certPath);
    if (!fs2.existsSync(certsDir)) {
      fs2.mkdirSync(certsDir, { recursive: true });
    }
    if (process.env.ARCA_CERT_CONTENT && process.env.ARCA_KEY_CONTENT) {
      fs2.writeFileSync(arcaConfig.certPath, process.env.ARCA_CERT_CONTENT, "utf8");
      fs2.writeFileSync(arcaConfig.keyPath, process.env.ARCA_KEY_CONTENT, "utf8");
      return true;
    }
    const repo = new FiscalRepository();
    const client = repo.getClient(userToken);
    const envKey = `arca_certificates_${arcaConfig.environment}`;
    const { data, error } = await client.from("settings").select("value").eq("key", envKey).eq("branch_id", "main").maybeSingle();
    if (!error && data?.value && data.value.crt && data.value.key) {
      fs2.writeFileSync(arcaConfig.certPath, data.value.crt, "utf8");
      fs2.writeFileSync(arcaConfig.keyPath, data.value.key, "utf8");
      return true;
    }
  } catch (err) {
    console.warn("[ARCA Auth] Error asegurando certificados en disco:", err.message);
  }
  return false;
}
function getCertificateInfo() {
  try {
    if (!fs2.existsSync(arcaConfig.certPath)) {
      return {
        isValid: false,
        error: `No se encontr\xF3 el certificado en la ruta: ${arcaConfig.certPath}`
      };
    }
    const certPem = fs2.readFileSync(arcaConfig.certPath, "utf8");
    const cert = forge.pki.certificateFromPem(certPem);
    const now = /* @__PURE__ */ new Date();
    const validFrom = cert.validity.notBefore;
    const validTo = cert.validity.notAfter;
    const isValid = now >= validFrom && now <= validTo;
    const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24));
    return {
      isValid,
      subject: cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(", "),
      issuer: cert.issuer.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(", "),
      validFrom,
      validTo,
      daysRemaining,
      error: isValid ? void 0 : now > validTo ? "Certificado expirado" : "Certificado a\xFAn no v\xE1lido"
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Error al leer certificado X.509: ${err.message}`
    };
  }
}
function createLoginTicketRequestXml(service) {
  const now = /* @__PURE__ */ new Date();
  const genTime = new Date(now.getTime() - 10 * 60 * 1e3).toISOString();
  const expTime = new Date(now.getTime() + 12 * 60 * 60 * 1e3).toISOString();
  const uniqueId = Math.floor(now.getTime() / 1e3);
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
function signLoginTicketRequest(xml) {
  if (!fs2.existsSync(arcaConfig.certPath)) {
    throw new Error(`Archivo de certificado no encontrado en: ${arcaConfig.certPath}`);
  }
  if (!fs2.existsSync(arcaConfig.keyPath)) {
    throw new Error(`Archivo de clave privada no encontrado en: ${arcaConfig.keyPath}`);
  }
  const certPem = fs2.readFileSync(arcaConfig.certPath, "utf8");
  const keyPem = fs2.readFileSync(arcaConfig.keyPath, "utf8");
  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
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
function parseWsaaResponse(soapXml, service) {
  const returnMatch = soapXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/i);
  if (!returnMatch) {
    const faultMatch = soapXml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
    const fault = faultMatch ? faultMatch[1] : "Respuesta SOAP inv\xE1lida de WSAA";
    throw new Error(`Error de WSAA ARCA: ${fault}`);
  }
  let xmlContent = returnMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const tokenMatch = xmlContent.match(/<token>([\s\S]*?)<\/token>/i);
  const signMatch = xmlContent.match(/<sign>([\s\S]*?)<\/sign>/i);
  const genMatch = xmlContent.match(/<generationTime>([\s\S]*?)<\/generationTime>/i);
  const expMatch = xmlContent.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/i);
  if (!tokenMatch || !signMatch) {
    throw new Error("No se pudo extraer Token o Sign de la respuesta de WSAA.");
  }
  return {
    token: tokenMatch[1].trim(),
    sign: signMatch[1].trim(),
    generationTime: genMatch ? genMatch[1].trim() : (/* @__PURE__ */ new Date()).toISOString(),
    expirationTime: expMatch ? expMatch[1].trim() : new Date(Date.now() + 12 * 3600 * 1e3).toISOString(),
    service
  };
}
async function requestNewTicket(service) {
  const certExists = fs2.existsSync(arcaConfig.certPath);
  const keyExists = fs2.existsSync(arcaConfig.keyPath);
  if (!certExists) {
    throw new Error(`Certificado ARCA no configurado o archivo no encontrado en: ${arcaConfig.certPath}. Configure ARCA_CERT_PATH.`);
  }
  if (!keyExists) {
    throw new Error(`Clave privada ARCA no configurada o archivo no encontrado en: ${arcaConfig.keyPath}. Configure ARCA_KEY_PATH.`);
  }
  const xml = createLoginTicketRequestXml(service);
  const cmsBase64 = signLoginTicketRequest(xml);
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
   <soapenv:Header/>
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>${cmsBase64}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>`;
  let responseData;
  try {
    const response = await axios.post(arcaConfig.endpoints.wsaa, soapEnvelope, {
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": ""
      },
      timeout: 3e4
    });
    responseData = response.data;
  } catch (err) {
    if (err.response && err.response.data) {
      responseData = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
    } else {
      throw err;
    }
  }
  const ticket = parseWsaaResponse(responseData, service);
  return ticket;
}
async function getWsaaTicket(service = "wsmtxca", forceRenew = false) {
  if (!fs2.existsSync(arcaConfig.certPath)) {
    throw new Error(`Certificado ARCA no configurado o archivo no encontrado en: ${arcaConfig.certPath}. Configure ARCA_CERT_PATH.`);
  }
  if (!fs2.existsSync(arcaConfig.keyPath)) {
    throw new Error(`Clave privada ARCA no configurada o archivo no encontrado en: ${arcaConfig.keyPath}. Configure ARCA_KEY_PATH.`);
  }
  if (!forceRenew) {
    const memCached = ticketCache.get(service);
    if (isTicketValid(memCached)) {
      return memCached;
    }
    const persisted = await loadPersistedTicket(service);
    if (isTicketValid(persisted)) {
      ticketCache.set(service, persisted);
      return persisted;
    }
  }
  let existingPromise = inFlightAuthPromises.get(service);
  if (existingPromise) {
    return existingPromise;
  }
  const authPromise = (async () => {
    try {
      const newTicket = await requestNewTicket(service);
      await savePersistedTicket(newTicket);
      return newTicket;
    } catch (err) {
      if (isAlreadyAuthenticatedError(err)) {
        console.warn(`[WSAA Sync] ARCA informa que ya existe un TA activo para '${service}'. Recuperando desde almacenamiento persistente...`);
        const persisted = await loadPersistedTicket(service);
        if (persisted && isTicketValid(persisted, 0)) {
          console.log(`[WSAA Sync] TA para '${service}' recuperado exitosamente desde persistencia.`);
          ticketCache.set(service, persisted);
          return persisted;
        }
        throw new Error(
          `Error de sincronizaci\xF3n con ARCA WSAA: El CEE ya posee un TA v\xE1lido para el servicio '${service}' en ARCA pero el ticket no est\xE1 disponible localmente. Debe esperarse a la expiraci\xF3n de la sesi\xF3n en ARCA para solicitar uno nuevo.`
        );
      }
      throw err;
    } finally {
      inFlightAuthPromises.delete(service);
    }
  })();
  inFlightAuthPromises.set(service, authPromise);
  return authPromise;
}

// server/services/arca/services/WsMtxcaInvoiceService.ts
import axios2 from "axios";

// server/services/arca/arcaTypes.ts
var VOUCHER_CODES = {
  A: 1,
  ND_A: 2,
  NC_A: 3,
  B: 6,
  ND_B: 7,
  NC_B: 8,
  C: 11,
  ND_C: 12,
  NC_C: 13
};
var DOCUMENT_TYPE_CODES = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  PASAPORTE: 94,
  SIN_IDENTIFICAR: 99
};
var VAT_CODES = {
  0: 3,
  10.5: 4,
  21: 5,
  27: 6,
  5: 8,
  2.5: 9
};
var UNIT_CODES = {
  unidades: 7,
  unidad: 7,
  unit: 7,
  u: 7,
  kilos: 1,
  kilo: 1,
  kg: 1,
  gramos: 1,
  gr: 1,
  g: 1
};

// server/services/arca/services/WsMtxcaInvoiceService.ts
var WsMtxcaInvoiceService = class {
  constructor() {
    this.serviceName = "wsmtxca";
  }
  /**
   * Ejecuta una llamada SOAP directa contra el servicio WSMTXCA de ARCA.
   */
  async executeSoapRequest(operation, innerXml) {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://impl.service.wsmtxca.afip.gov.ar/service/">
  <soapenv:Header/>
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;
    try {
      const response = await axios2.post(arcaConfig.endpoints.wsmtxca, soapEnvelope, {
        headers: {
          "Content-Type": "text/xml; charset=UTF-8",
          "SOAPAction": `http://impl.service.wsmtxca.afip.gov.ar/service/${operation}`
        },
        timeout: 3e4
      });
      return response.data;
    } catch (err) {
      if (err.response && err.response.data) {
        const raw = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
        console.error("[ARCA WSMTXCA ERROR RAW RESPONSE]:", raw);
        const faultMatch = raw.match(/<faultstring>([^<]+)<\/faultstring>/i) || raw.match(/<descripcion>([^<]+)<\/descripcion>/i);
        if (faultMatch) {
          throw new Error(`ARCA WSMTXCA SOAP Fault (${operation}): ${faultMatch[1]}`);
        }
        throw new Error(`ARCA WSMTXCA HTTP ${err.response.status}: ${raw}`);
      }
      throw err;
    }
  }
  async getServerStatus() {
    try {
      const xml = `<ser:dummyRequest/>`;
      const responseXml = await this.executeSoapRequest("dummy", xml);
      const appServer = /<appserver>OK<\/appserver>/i.test(responseXml);
      const dbServer = /<dbserver>OK<\/dbserver>/i.test(responseXml);
      const authServer = /<authserver>OK<\/authserver>/i.test(responseXml);
      return {
        appServer,
        dbServer,
        authServer,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (err) {
      return {
        appServer: false,
        dbServer: false,
        authServer: false,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  }
  /**
   * Parsea la respuesta XML de consultarUltimoComprobanteAutorizado.
   * Maneja específicamente el código 1502 como 0 (sin comprobantes previos)
   * y propaga cualquier otro error fiscal como excepción real.
   */
  parseLastVoucherResponse(responseXml, pointOfSale, voucherType) {
    const errorMatches = Array.from(responseXml.matchAll(/<codigo>(\d+)<\/codigo>\s*<descripcion>([^<]+)<\/descripcion>/gi));
    if (errorMatches.length > 0) {
      const is1502 = errorMatches.some((m) => m[1] === "1502");
      if (is1502) {
        console.log(`[WSMTXCA] ARCA inform\xF3 c\xF3digo 1502 (sin comprobantes previos registrados para CUIT, PV ${pointOfSale}, Tipo ${voucherType}). Retornando \xFAltimo comprobante = 0.`);
        return 0;
      }
      const errorMsg = errorMatches.map((m) => `[${m[1]}] ${m[2].trim()}`).join(", ");
      throw new Error(`ARCA WSMTXCA: ${errorMsg}`);
    }
    const match = responseXml.match(/<numeroComprobante>(\d+)<\/numeroComprobante>/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }
  async getLastVoucher(pointOfSale, voucherType) {
    try {
      const ticket = await getWsaaTicket("wsmtxca");
      const xml = `<ser:consultarUltimoComprobanteAutorizadoRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <consultaUltimoComprobanteAutorizadoRequest>
          <codigoTipoComprobante>${voucherType}</codigoTipoComprobante>
          <numeroPuntoVenta>${pointOfSale}</numeroPuntoVenta>
        </consultaUltimoComprobanteAutorizadoRequest>
      </ser:consultarUltimoComprobanteAutorizadoRequest>`;
      const responseXml = await this.executeSoapRequest("consultarUltimoComprobanteAutorizado", xml);
      return this.parseLastVoucherResponse(responseXml, pointOfSale, voucherType);
    } catch (err) {
      throw new Error(`Error al consultar \xFAltimo comprobante en ARCA WSMTXCA (PV ${pointOfSale}, Tipo ${voucherType}): ${err.message}`);
    }
  }
  /**
   * Construye el cuerpo del XML de autorizarComprobanteRequest respetando estrictamente
   * la secuencia del esquema oficial WSMTXCA (ComprobanteType).
   * Valida además las sumas y consistencias fiscales requeridas antes de generar el XML.
   */
  buildAuthorizePayloadXml(request, ticket) {
    const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
    const importeGravado = round2(
      request.vatBreakdown && request.vatBreakdown.length > 0 ? request.vatBreakdown.filter((entry) => entry.vatRate > 0).reduce((sum, entry) => sum + entry.baseAmount, 0) : request.subtotalNet
    );
    const ivaTotal = round2(
      request.vatBreakdown && request.vatBreakdown.length > 0 ? request.vatBreakdown.reduce((sum, entry) => sum + entry.vatAmount, 0) : request.taxes
    );
    const sumItemsTotal = round2(request.items.reduce((sum, item) => sum + item.total, 0));
    if (Math.abs(sumItemsTotal - round2(request.total)) > 0.05) {
      throw new Error(`Inconsistencia fiscal: la suma de importeItem ($${sumItemsTotal}) no coincide con importeTotal ($${round2(request.total)}).`);
    }
    for (const item of request.items) {
      const net = round2(item.netAmount);
      const vat = round2(item.vatAmount);
      const bonus = round2(item.discountAmount || 0);
      const expectedItemTotal = round2(net + vat - bonus);
      if (Math.abs(expectedItemTotal - round2(item.total)) > 0.05) {
        throw new Error(`Inconsistencia fiscal en \xEDtem "${item.description}": neto ($${net}) + IVA ($${vat}) - bonificaci\xF3n ($${bonus}) no coincide con importeItem ($${item.total}).`);
      }
    }
    if (Math.abs(round2(request.subtotalNet + ivaTotal) - round2(request.total)) > 0.05) {
      throw new Error(`Inconsistencia fiscal: neto ($${request.subtotalNet}) + IVA ($${ivaTotal}) no coincide con total ($${request.total}).`);
    }
    if (request.vatBreakdown && request.vatBreakdown.length > 0) {
      const sumBasesGravadas = round2(
        request.vatBreakdown.filter((v) => v.vatRate > 0).reduce((sum, v) => sum + v.baseAmount, 0)
      );
      if (Math.abs(sumBasesGravadas - importeGravado) > 0.05) {
        throw new Error(`Inconsistencia fiscal: la suma de bases gravadas ($${sumBasesGravadas}) no coincide con importeGravado ($${importeGravado}).`);
      }
    }
    const isBType = [6, 7, 8, 206, 207, 208].includes(request.invoiceTypeCode);
    const itemsXml = request.items.map((item, idx) => {
      const uCode = UNIT_CODES[item.unit.toLowerCase()] || 7;
      const mtxCode = (item.codigoMtx || item.barcode || item.gtin || item.ean || "").trim();
      if (!mtxCode) {
        throw new Error(
          `Falta el dato fiscal del producto en el \xEDtem ${idx + 1} ("${item.description}"): se requiere 'codigoMtx' (o 'barcode' / 'gtin' / 'ean' del producto) para autorizar ante ARCA WSMTXCA.`
        );
      }
      const unitPriceValue = isBType ? item.price || (item.quantity > 0 ? (item.total + (item.discountAmount || 0)) / item.quantity : item.total) : item.unitPrice;
      const importeIvaXml = isBType ? "" : `
              <importeIVA>${item.vatAmount.toFixed(2)}</importeIVA>`;
      return `
            <item>
              <unidadesMtx>${item.unidadesMtx || 1}</unidadesMtx>
              <codigoMtx>${mtxCode}</codigoMtx>
              <codigo>${item.code || "GEN"}</codigo>
              <descripcion>${item.description.replace(/[<>&'"]/g, "")}</descripcion>
              <cantidad>${item.quantity.toFixed(2)}</cantidad>
              <codigoUnidadMedida>${uCode}</codigoUnidadMedida>
              <precioUnitario>${unitPriceValue.toFixed(2)}</precioUnitario>
              <importeBonificacion>${(item.discountAmount || 0).toFixed(2)}</importeBonificacion>
              <codigoCondicionIVA>${entryVatCode(item.vatRate)}</codigoCondicionIVA>${importeIvaXml}
              <importeItem>${item.total.toFixed(2)}</importeItem>
            </item>`;
    }).join("");
    const ivaXml = request.vatBreakdown.map((entry) => `
            <subtotalIVA>
              <codigo>${entry.vatCode}</codigo>
              <importe>${entry.vatAmount.toFixed(2)}</importe>
            </subtotalIVA>`).join("");
    const condicionIvaCode = getCondicionIvaReceptor(request.customer, request.invoiceTypeCode);
    const condicionIvaXml = `
          <condicionIVAReceptor>${condicionIvaCode}</condicionIVAReceptor>`;
    const importeNoGravadoXml = request.subtotalUntaxed && request.subtotalUntaxed > 0 ? `
          <importeNoGravado>${request.subtotalUntaxed.toFixed(2)}</importeNoGravado>` : "";
    const importeExentoXml = request.subtotalExempt && request.subtotalExempt > 0 ? `
          <importeExento>${request.subtotalExempt.toFixed(2)}</importeExento>` : "";
    const importeOtrosTributosXml = request.otherTaxes && request.otherTaxes > 0 ? `
          <importeOtrosTributos>${request.otherTaxes.toFixed(2)}</importeOtrosTributos>` : "";
    const observacionesXml = request.observations ? `
          <observaciones>${request.observations.replace(/[<>&'"]/g, "")}</observaciones>` : "";
    let serviceFieldsXml = "";
    if (request.concept !== 1) {
      if (request.serviceDateFrom) {
        serviceFieldsXml += `
          <fechaServicioDesde>${request.serviceDateFrom}</fechaServicioDesde>`;
      }
      if (request.serviceDateTo) {
        serviceFieldsXml += `
          <fechaServicioHasta>${request.serviceDateTo}</fechaServicioHasta>`;
      }
      if (request.paymentDueDate) {
        serviceFieldsXml += `
          <fechaVencimientoPago>${request.paymentDueDate}</fechaVencimientoPago>`;
      }
    }
    let comprobantesAsociadosXml = "";
    if (request.associatedVoucher) {
      comprobantesAsociadosXml = `
          <arrayComprobantesAsociados>
            <comprobanteAsociado>
              <codigoTipoComprobante>${request.associatedVoucher.invoiceTypeCode}</codigoTipoComprobante>
              <numeroPuntoVenta>${request.associatedVoucher.pointOfSale}</numeroPuntoVenta>
              <numeroComprobante>${request.associatedVoucher.invoiceNumber}</numeroComprobante>
            </comprobanteAsociado>
          </arrayComprobantesAsociados>`;
    }
    let arrayOtrosTributosXml = "";
    if (request.arrayOtrosTributosXml) {
      arrayOtrosTributosXml = `
          ${request.arrayOtrosTributosXml}`;
    }
    const safeDocTypeCode = request.customer.documentTypeCode === 99 || !request.customer.documentTypeCode ? 96 : request.customer.documentTypeCode;
    const safeDocNumber = !request.customer.documentNumber || request.customer.documentNumber === "0" || request.customer.documentTypeCode === 99 ? request.customer.documentNumber || "0" : request.customer.documentNumber;
    return `<ser:autorizarComprobanteRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <comprobanteCAERequest>
          <codigoTipoComprobante>${request.invoiceTypeCode}</codigoTipoComprobante>
          <numeroPuntoVenta>${request.pointOfSale}</numeroPuntoVenta>
          <numeroComprobante>${request.voucherNumber}</numeroComprobante>
          <fechaEmision>${request.date}</fechaEmision>
          <codigoTipoDocumento>${safeDocTypeCode}</codigoTipoDocumento>
          <numeroDocumento>${safeDocNumber}</numeroDocumento>${condicionIvaXml}
          <importeGravado>${importeGravado.toFixed(2)}</importeGravado>${importeNoGravadoXml}${importeExentoXml}
          <importeSubtotal>${request.subtotalNet.toFixed(2)}</importeSubtotal>${importeOtrosTributosXml}
          <importeTotal>${request.total.toFixed(2)}</importeTotal>
          <codigoMoneda>PES</codigoMoneda>
          <cotizacionMoneda>1</cotizacionMoneda>${observacionesXml}
          <codigoConcepto>${request.concept}</codigoConcepto>${serviceFieldsXml}${comprobantesAsociadosXml}${arrayOtrosTributosXml}
          <arrayItems>${itemsXml}
          </arrayItems>
          <arraySubtotalesIVA>${ivaXml}
          </arraySubtotalesIVA>
        </comprobanteCAERequest>
      </ser:autorizarComprobanteRequest>`;
  }
  parseAuthorizeResponse(responseXml, request) {
    const resMatch = responseXml.match(/<resultado>(A|O|R)<\/resultado>/i);
    const resultado = resMatch ? resMatch[1].toUpperCase() : "";
    const caeMatch = responseXml.match(/<(?:codigoAutorizacion|cae)>(\d+)<\/(?:codigoAutorizacion|cae)>/i);
    const vtoMatch = responseXml.match(/<(?:fechaVencimiento|fechaVencimientoCAE)>([^<]+)<\/(?:fechaVencimiento|fechaVencimientoCAE)>/i);
    const erroresXml = responseXml.match(/<arrayErrores>([\s\S]*?)<\/arrayErrores>/i)?.[1] || "";
    const errors = extractCodeDescriptions(erroresXml);
    const obsXml = responseXml.match(/<arrayObservaciones>([\s\S]*?)<\/arrayObservaciones>/i)?.[1] || "";
    const observations = extractCodeDescriptions(obsXml);
    const isApproved = Boolean(caeMatch && /^\d{14}$/.test(caeMatch[1].trim()) && errors.length === 0);
    if (isApproved && caeMatch) {
      return {
        success: true,
        serviceUsed: "WSMTXCA",
        voucherNumber: request.voucherNumber,
        pointOfSale: request.pointOfSale,
        invoiceType: request.invoiceType,
        invoiceTypeCode: request.invoiceTypeCode,
        cae: caeMatch[1].trim(),
        caeExpirationDate: vtoMatch ? vtoMatch[1].trim() : "",
        observations,
        rawResponse: responseXml
      };
    } else {
      return {
        success: false,
        serviceUsed: "WSMTXCA",
        voucherNumber: request.voucherNumber,
        pointOfSale: request.pointOfSale,
        invoiceType: request.invoiceType,
        invoiceTypeCode: request.invoiceTypeCode,
        errors: errors.length > 0 ? errors : [{ code: "ARCA_REJECTED", message: "Comprobante rechazado por ARCA." }],
        observations,
        rawResponse: responseXml
      };
    }
  }
  async authorizeInvoice(request) {
    try {
      const ticket = await getWsaaTicket("wsmtxca");
      const xml = this.buildAuthorizePayloadXml(request, ticket);
      const responseXml = await this.executeSoapRequest("autorizarComprobante", xml);
      return this.parseAuthorizeResponse(responseXml, request);
    } catch (err) {
      throw err;
    }
  }
  parseConsultarComprobanteResponse(responseXml, pointOfSale, voucherType, voucherNumber) {
    const caeMatch = responseXml.match(/<(?:codigoAutorizacion|cae)>(\d+)<\/(?:codigoAutorizacion|cae)>/i);
    if (!caeMatch) return null;
    const vtoMatch = responseXml.match(/<(?:fechaVencimiento|fechaVencimientoCAE)>([^<]+)<\/(?:fechaVencimiento|fechaVencimientoCAE)>/i);
    const fechaMatch = responseXml.match(/<fechaEmision>([^<]+)<\/fechaEmision>/i);
    const totalMatch = responseXml.match(/<importeTotal>([^<]+)<\/importeTotal>/i);
    const docTipoMatch = responseXml.match(/<codigoTipoDocumento>([^<]+)<\/codigoTipoDocumento>/i);
    const docNroMatch = responseXml.match(/<numeroDocumento>([^<]+)<\/numeroDocumento>/i);
    return {
      pointOfSale,
      voucherType,
      voucherNumber,
      date: fechaMatch ? fechaMatch[1] : "",
      total: totalMatch ? parseFloat(totalMatch[1]) : 0,
      cae: caeMatch[1].trim(),
      caeExpirationDate: vtoMatch ? vtoMatch[1].trim() : "",
      documentType: docTipoMatch ? parseInt(docTipoMatch[1], 10) : 99,
      documentNumber: docNroMatch ? docNroMatch[1] : "",
      result: "A"
    };
  }
  async getInvoice(pointOfSale, voucherType, voucherNumber) {
    try {
      const ticket = await getWsaaTicket("wsmtxca");
      const xml = `<ser:consultarComprobanteRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <consultaComprobanteRequest>
          <codigoTipoComprobante>${voucherType}</codigoTipoComprobante>
          <numeroPuntoVenta>${pointOfSale}</numeroPuntoVenta>
          <numeroComprobante>${voucherNumber}</numeroComprobante>
        </consultaComprobanteRequest>
      </ser:consultarComprobanteRequest>`;
      const responseXml = await this.executeSoapRequest("consultarComprobante", xml);
      return this.parseConsultarComprobanteResponse(responseXml, pointOfSale, voucherType, voucherNumber);
    } catch (err) {
      return null;
    }
  }
};
function extractCodeDescriptions(blockXml) {
  if (!blockXml) return [];
  const entries = [];
  const itemMatches = Array.from(blockXml.matchAll(/<codigoDescripcion>([\s\S]*?)<\/codigoDescripcion>/gi));
  for (const item of itemMatches) {
    const codeMatch = item[1].match(/<codigo>(\d+)<\/codigo>/i);
    const descMatch = item[1].match(/<descripcion>([^<]+)<\/descripcion>/i);
    if (codeMatch && descMatch) {
      entries.push({ code: codeMatch[1].trim(), message: descMatch[1].trim() });
    }
  }
  if (entries.length === 0) {
    const directMatches = Array.from(blockXml.matchAll(/<codigo>(\d+)<\/codigo>\s*<descripcion>([^<]+)<\/descripcion>/gi));
    for (const m of directMatches) {
      entries.push({ code: m[1].trim(), message: m[2].trim() });
    }
  }
  return entries;
}
function entryVatCode(rate) {
  if (rate === 10.5) return 4;
  if (rate === 0) return 3;
  if (rate === 27) return 6;
  return 5;
}
function getCondicionIvaReceptor(customer, invoiceTypeCode) {
  if (customer && customer.taxConditionCode) return customer.taxConditionCode;
  const tc = customer && customer.taxCondition ? customer.taxCondition.trim() : "";
  switch (tc) {
    case "Responsable Inscripto":
      return 1;
    case "Exento":
      return 4;
    case "Consumidor Final":
      return 5;
    case "Monotributista":
    case "Responsable Monotributo":
      return 6;
    case "No Categorizado":
    case "Sujeto No Categorizado":
      return 7;
    default:
      if (invoiceTypeCode === 6 || invoiceTypeCode === 7 || invoiceTypeCode === 8) {
        return 5;
      }
      return 5;
  }
}

// server/services/arca/services/WsFeV1InvoiceService.ts
import axios3 from "axios";
var WsFeV1InvoiceService = class {
  constructor() {
    this.serviceName = "wsfe";
  }
  async executeSoapRequest(operation, innerXml) {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;
    const response = await axios3.post(arcaConfig.endpoints.wsfe, soapEnvelope, {
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": `http://ar.gov.afip.dif.FEV1/${operation}`
      },
      timeout: 3e4
    });
    return response.data;
  }
  async getServerStatus() {
    try {
      const xml = `<ar:FEDummy/>`;
      const responseXml = await this.executeSoapRequest("FEDummy", xml);
      const appServer = /<AppServer>OK<\/AppServer>/i.test(responseXml);
      const dbServer = /<DbServer>OK<\/DbServer>/i.test(responseXml);
      const authServer = /<AuthServer>OK<\/AuthServer>/i.test(responseXml);
      return {
        appServer,
        dbServer,
        authServer,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (err) {
      return {
        appServer: false,
        dbServer: false,
        authServer: false,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  }
  async getLastVoucher(pointOfSale, voucherType) {
    try {
      const ticket = await getWsaaTicket("wsfe");
      const xml = `<ar:FECompUltimoAutorizado>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:PtoVta>${pointOfSale}</ar:PtoVta>
        <ar:CbteTipo>${voucherType}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>`;
      const responseXml = await this.executeSoapRequest("FECompUltimoAutorizado", xml);
      const match = responseXml.match(/<CbteNro>(\d+)<\/CbteNro>/i);
      if (match) {
        return parseInt(match[1], 10);
      }
      return 0;
    } catch (err) {
      throw new Error(`Error al consultar \xFAltimo comprobante en ARCA WSFEv1 (PV ${pointOfSale}, Tipo ${voucherType}): ${err.message}`);
    }
  }
  async authorizeInvoice(request) {
    try {
      const ticket = await getWsaaTicket("wsfe");
      const formattedDate = request.date.replace(/-/g, "");
      let ivaXml = "";
      if (request.vatBreakdown.length > 0 && request.taxes > 0) {
        const alics = request.vatBreakdown.map((entry) => `
          <ar:AlicIva>
            <ar:Id>${entry.vatCode}</ar:Id>
            <ar:BaseImp>${entry.baseAmount.toFixed(2)}</ar:BaseImp>
            <ar:Importe>${entry.vatAmount.toFixed(2)}</ar:Importe>
          </ar:AlicIva>
        `).join("");
        ivaXml = `<ar:Iva>${alics}</ar:Iva>`;
      }
      let asociadosXml = "";
      if (request.associatedVoucher) {
        asociadosXml = `
        <ar:CbtesAsoc>
          <ar:CbteAsoc>
            <ar:Tipo>${request.associatedVoucher.invoiceTypeCode}</ar:Tipo>
            <ar:PtoVta>${request.associatedVoucher.pointOfSale}</ar:PtoVta>
            <ar:Nro>${request.associatedVoucher.invoiceNumber}</ar:Nro>
          </ar:CbteAsoc>
        </ar:CbtesAsoc>`;
      }
      const xml = `<ar:FECAESolicitar>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${request.pointOfSale}</ar:PtoVta>
            <ar:CbteTipo>${request.invoiceTypeCode}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>${request.concept}</ar:Concepto>
              <ar:DocTipo>${request.customer.documentTypeCode}</ar:DocTipo>
              <ar:DocNro>${request.customer.documentNumber}</ar:DocNro>
              <ar:CbteDesde>${request.voucherNumber}</ar:CbteDesde>
              <ar:CbteHasta>${request.voucherNumber}</ar:CbteHasta>
              <ar:CbteFch>${formattedDate}</ar:CbteFch>
              <ar:ImpTotal>${request.total.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${request.subtotalNet.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:ImpIVA>${request.taxes.toFixed(2)}</ar:ImpIVA>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1</ar:MonCotiz>
              ${ivaXml}
              ${asociadosXml}
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>`;
      const responseXml = await this.executeSoapRequest("FECAESolicitar", xml);
      const resMatch = responseXml.match(/<Resultado>(A|R)<\/Resultado>/i);
      const resultado = resMatch ? resMatch[1].toUpperCase() : "R";
      if (resultado === "A") {
        const caeMatch = responseXml.match(/<CAE>(\d+)<\/CAE>/i);
        const vtoMatch = responseXml.match(/<CAEFchVto>(\d{8})<\/CAEFchVto>/i);
        let formattedVto = "";
        if (vtoMatch) {
          const raw = vtoMatch[1];
          formattedVto = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
        }
        return {
          success: true,
          serviceUsed: "WSFEv1",
          voucherNumber: request.voucherNumber,
          pointOfSale: request.pointOfSale,
          invoiceType: request.invoiceType,
          invoiceTypeCode: request.invoiceTypeCode,
          cae: caeMatch ? caeMatch[1] : "",
          caeExpirationDate: formattedVto,
          rawResponse: responseXml
        };
      } else {
        const errMatches = Array.from(responseXml.matchAll(/<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>([^<]+)<\/Msg>/gi));
        const errors = errMatches.map((m) => ({ code: m[1], message: m[2].trim() }));
        const obsMatches = Array.from(responseXml.matchAll(/<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>([^<]+)<\/Msg>/gi));
        const observations = obsMatches.map((m) => ({ code: m[1], message: m[2].trim() }));
        return {
          success: false,
          serviceUsed: "WSFEv1",
          voucherNumber: request.voucherNumber,
          pointOfSale: request.pointOfSale,
          invoiceType: request.invoiceType,
          invoiceTypeCode: request.invoiceTypeCode,
          errors: errors.length > 0 ? errors : [{ code: "ARCA_REJECTED", message: "Comprobante rechazado por ARCA." }],
          observations,
          rawResponse: responseXml
        };
      }
    } catch (err) {
      throw err;
    }
  }
  async getInvoice(pointOfSale, voucherType, voucherNumber) {
    try {
      const ticket = await getWsaaTicket("wsfe");
      const xml = `<ar:FECompConsultar>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCompConsReq>
          <ar:CbteTipo>${voucherType}</ar:CbteTipo>
          <ar:CbteNro>${voucherNumber}</ar:CbteNro>
          <ar:PtoVta>${pointOfSale}</ar:PtoVta>
        </ar:FeCompConsReq>
      </ar:FECompConsultar>`;
      const responseXml = await this.executeSoapRequest("FECompConsultar", xml);
      const caeMatch = responseXml.match(/<CodAutorizacion>(\d+)<\/CodAutorizacion>/i);
      if (!caeMatch) return null;
      const vtoMatch = responseXml.match(/<FchVto>(\d{8})<\/FchVto>/i);
      const fechaMatch = responseXml.match(/<CbteFch>(\d{8})<\/CbteFch>/i);
      const totalMatch = responseXml.match(/<ImpTotal>([^<]+)<\/ImpTotal>/i);
      const docTipoMatch = responseXml.match(/<DocTipo>([^<]+)<\/DocTipo>/i);
      const docNroMatch = responseXml.match(/<DocNro>([^<]+)<\/DocNro>/i);
      let formattedDate = "";
      if (fechaMatch) {
        const raw = fechaMatch[1];
        formattedDate = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
      }
      let formattedVto = "";
      if (vtoMatch) {
        const raw = vtoMatch[1];
        formattedVto = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
      }
      return {
        pointOfSale,
        voucherType,
        voucherNumber,
        date: formattedDate,
        total: totalMatch ? parseFloat(totalMatch[1]) : 0,
        cae: caeMatch[1],
        caeExpirationDate: formattedVto,
        documentType: docTipoMatch ? parseInt(docTipoMatch[1], 10) : 99,
        documentNumber: docNroMatch ? docNroMatch[1] : "",
        result: "A"
      };
    } catch (err) {
      return null;
    }
  }
};

// server/services/arca/services/ArcaInvoiceServiceFactory.ts
var ArcaInvoiceServiceFactory = class {
  static {
    this.wsMtxcaInstance = null;
  }
  static {
    this.wsFeInstance = null;
  }
  /**
   * Retorna el servicio de facturación adecuado según el tipo de comprobante.
   * Facturas A y B (con detalle de ítems de supermercado) -> WSMTXCA.
   * Facturas C (monotributo / sin discriminación de IVA) -> WSFEv1.
   */
  static getService(invoiceType, preferFeV1 = false) {
    if (preferFeV1) {
      if (!this.wsFeInstance) {
        this.wsFeInstance = new WsFeV1InvoiceService();
      }
      return this.wsFeInstance;
    }
    const mtxcaTypes = ["A", "B", "NC_A", "NC_B", "ND_A", "ND_B"];
    if (mtxcaTypes.includes(invoiceType)) {
      if (!this.wsMtxcaInstance) {
        this.wsMtxcaInstance = new WsMtxcaInvoiceService();
      }
      return this.wsMtxcaInstance;
    }
    if (!this.wsFeInstance) {
      this.wsFeInstance = new WsFeV1InvoiceService();
    }
    return this.wsFeInstance;
  }
  /**
   * Retorna el servicio adecuado a partir del código numérico oficial de comprobante de ARCA.
   */
  static getServiceByCode(voucherTypeCode) {
    const mtxcaCodes = [1, 2, 3, 6, 7, 8];
    if (mtxcaCodes.includes(voucherTypeCode)) {
      if (!this.wsMtxcaInstance) {
        this.wsMtxcaInstance = new WsMtxcaInvoiceService();
      }
      return this.wsMtxcaInstance;
    }
    if (!this.wsFeInstance) {
      this.wsFeInstance = new WsFeV1InvoiceService();
    }
    return this.wsFeInstance;
  }
};

// server/services/arca/arcaTaxRules.ts
function validateCuit(rawCuit) {
  if (!rawCuit) {
    return { valid: false, formatted: "", clean: "", error: "El CUIT no puede estar vac\xEDo." };
  }
  const clean = rawCuit.replace(/\D/g, "");
  if (clean.length !== 11) {
    return {
      valid: false,
      formatted: clean,
      clean,
      error: `El CUIT debe contener exactamente 11 d\xEDgitos (recibidos: ${clean.length}).`
    };
  }
  const validPrefixes = ["20", "23", "24", "27", "30", "33", "34"];
  const prefix = clean.substring(0, 2);
  if (!validPrefixes.includes(prefix)) {
    return {
      valid: false,
      formatted: clean,
      clean,
      error: `El prefijo del CUIT (${prefix}) no corresponde a un tipo v\xE1lido.`
    };
  }
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }
  const mod = sum % 11;
  let expectedCheckDigit = 11 - mod;
  if (expectedCheckDigit === 11) expectedCheckDigit = 0;
  if (expectedCheckDigit === 10) expectedCheckDigit = 9;
  const actualCheckDigit = parseInt(clean[10], 10);
  if (expectedCheckDigit !== actualCheckDigit) {
    return {
      valid: false,
      formatted: clean,
      clean,
      error: `D\xEDgito verificador inv\xE1lido (esperado: ${expectedCheckDigit}, ingresado: ${actualCheckDigit}).`
    };
  }
  const formatted = `${clean.substring(0, 2)}-${clean.substring(2, 10)}-${clean.substring(10)}`;
  return { valid: true, formatted, clean };
}
function determineInvoiceType(emitterTaxCondition, customerTaxCondition) {
  const normEmitter = (emitterTaxCondition || "").trim();
  if (normEmitter.toLowerCase().includes("monotribut")) {
    return {
      invoiceType: "C",
      invoiceTypeCode: VOUCHER_CODES.C,
      reason: "El emisor es Monotributista: emite Factura C a todos los destinatarios."
    };
  }
  if (normEmitter.toLowerCase().includes("exento")) {
    return {
      invoiceType: "C",
      invoiceTypeCode: VOUCHER_CODES.C,
      reason: "El emisor es Exento: emite Factura C."
    };
  }
  switch (customerTaxCondition) {
    case "Responsable Inscripto":
      return {
        invoiceType: "A",
        invoiceTypeCode: VOUCHER_CODES.A,
        reason: "Responsable Inscripto a Responsable Inscripto: corresponde Factura A con IVA discriminado."
      };
    case "Monotributista":
      return {
        invoiceType: "A",
        invoiceTypeCode: VOUCHER_CODES.A,
        reason: "Responsable Inscripto a Monotributista: corresponde Factura A (RG 5003/2021)."
      };
    case "Consumidor Final":
      return {
        invoiceType: "B",
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: "Responsable Inscripto a Consumidor Final: corresponde Factura B con IVA incluido."
      };
    case "Exento":
      return {
        invoiceType: "B",
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: "Responsable Inscripto a Sujeto Exento: corresponde Factura B."
      };
    case "No Categorizado":
    default:
      return {
        invoiceType: "B",
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: "Responsable Inscripto a No Categorizado: corresponde Factura B."
      };
  }
}
function recalculateFiscalInvoice(rawItems, pricesIncludeTax = true) {
  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
  let totalNet = 0;
  let totalTax = 0;
  let grandTotal = 0;
  const vatGroups = {};
  const normalizedItems = rawItems.map((raw) => {
    const qty = Math.max(0, Number(raw.quantity) || 0);
    const price = Math.max(0, Number(raw.price) || 0);
    const vatRate = Number(raw.taxRate ?? 21);
    let lineTotal = 0;
    let netAmount = 0;
    let vatAmount = 0;
    let unitPrice = 0;
    if (pricesIncludeTax) {
      lineTotal = round2(qty * price);
      netAmount = round2(lineTotal / (1 + vatRate / 100));
      vatAmount = round2(lineTotal - netAmount);
      unitPrice = round2(price / (1 + vatRate / 100));
    } else {
      netAmount = round2(qty * price);
      vatAmount = round2(netAmount * (vatRate / 100));
      lineTotal = round2(netAmount + vatAmount);
      unitPrice = round2(price);
    }
    totalNet += netAmount;
    totalTax += vatAmount;
    grandTotal += lineTotal;
    if (!vatGroups[vatRate]) {
      vatGroups[vatRate] = { base: 0, tax: 0 };
    }
    vatGroups[vatRate].base += netAmount;
    vatGroups[vatRate].tax += vatAmount;
    const mtxCode = (raw.codigoMtx || raw.barcode || raw.gtin || raw.ean || "").trim();
    return {
      productId: raw.productId,
      code: raw.code || raw.productId || "GEN",
      codigoMtx: mtxCode || void 0,
      barcode: raw.barcode || void 0,
      gtin: raw.gtin || void 0,
      ean: raw.ean || void 0,
      description: raw.description.trim(),
      quantity: qty,
      unit: raw.unit || "unidades",
      unitPrice,
      price: raw.price,
      taxRate: vatRate,
      netAmount,
      vatRate,
      vatAmount,
      discountAmount: raw.discountAmount || 0,
      total: lineTotal
    };
  });
  const vatBreakdown = Object.entries(vatGroups).map(([rateStr, group]) => {
    const rate = parseFloat(rateStr);
    const vatCode = VAT_CODES[rate] || 5;
    return {
      vatRate: rate,
      vatCode,
      baseAmount: round2(group.base),
      vatAmount: round2(group.tax)
    };
  });
  return {
    subtotalNet: round2(totalNet),
    taxes: round2(totalTax),
    total: round2(grandTotal),
    items: normalizedItems,
    vatBreakdown
  };
}
var CF_DNI_REQUIRED_LIMIT = 344488;

// server/services/arca/arcaErrors.ts
var ERROR_MAP = {
  "10016": {
    title: "N\xFAmero de comprobante inconsistente",
    reason: "El n\xFAmero de comprobante solicitado no coincide con el siguiente folio esperado por ARCA.",
    suggestedAction: "Consult\xE1 el \xFAltimo comprobante autorizado en el punto de venta para sincronizar la numeraci\xF3n.",
    isRetryable: true
  },
  "10015": {
    title: "Punto de venta no habilitado",
    reason: "El punto de venta especificado no est\xE1 dado de alta o no est\xE1 autorizado para facturaci\xF3n electr\xF3nica en ARCA.",
    suggestedAction: 'Revis\xE1 en la web de ARCA en "Administraci\xF3n de Puntos de Venta" que el punto de venta est\xE9 asignado a Facturaci\xF3n Electr\xF3nica.',
    isRetryable: false
  },
  "10004": {
    title: "CUIT del receptor inv\xE1lido o no activo",
    reason: "El CUIT del cliente receptor no est\xE1 registrado en el padr\xF3n de ARCA o se encuentra en estado inactivo.",
    suggestedAction: "Verific\xE1 el CUIT del cliente en la constancia de inscripci\xF3n de ARCA y corregilo en el formulario.",
    isRetryable: false
  },
  "10020": {
    title: "Inconsistencia impositiva",
    reason: "La suma de las bases imponibles netas e importes de IVA no coincide exactamente con el total del comprobante.",
    suggestedAction: "Verific\xE1 las cantidades y precios de los productos y sus al\xEDcuotas correspondientes.",
    isRetryable: false
  },
  "10061": {
    title: "Fecha de comprobante fuera de rango",
    reason: "La fecha del comprobante tiene m\xE1s de 10 d\xEDas de diferencia respecto de la fecha actual de ARCA.",
    suggestedAction: "Asegurate de emitir el comprobante con la fecha del d\xEDa de hoy.",
    isRetryable: false
  },
  "CERT_EXPIRED": {
    title: "Certificado digital vencido",
    reason: "El certificado X.509 de facturaci\xF3n electr\xF3nica configurado en el servidor ha caducado.",
    suggestedAction: "Gener\xE1 un nuevo CSR y descarg\xE1 el certificado actualizado desde la p\xE1gina de ARCA.",
    isRetryable: false
  },
  "AUTH_FAILED": {
    title: "Error de autenticaci\xF3n WSAA",
    reason: "No se pudo obtener el Ticket de Acceso ante ARCA. Verific\xE1 la clave privada y certificado.",
    suggestedAction: "Revis\xE1 que el certificado est\xE9 asociado al computador fiscal y con relaciones activas en ARCA.",
    isRetryable: false
  },
  "TIMEOUT": {
    title: "Tiempo de espera agotado con ARCA",
    reason: "El servidor de ARCA tard\xF3 demasiado en responder o la conexi\xF3n se interrumpi\xF3 durante el env\xEDo.",
    suggestedAction: 'La operaci\xF3n qued\xF3 en ESTADO_DESCONOCIDO. Utiliz\xE1 el bot\xF3n "Reconciliar Estado" para comprobar si ARCA lo autoriz\xF3 antes de intentar de nuevo.',
    isRetryable: false
  },
  "NETWORK_ERROR": {
    title: "Fallo de conectividad",
    reason: "No se pudo establecer comunicaci\xF3n de red con los servidores de ARCA.",
    suggestedAction: "Comprob\xE1 la conexi\xF3n a Internet y el estado de los servidores de ARCA.",
    isRetryable: true
  }
};
function translateArcaError(codeOrMessage, rawDetail) {
  const code = (codeOrMessage || "UNKNOWN").trim();
  if (ERROR_MAP[code]) {
    return {
      code,
      ...ERROR_MAP[code]
    };
  }
  const lower = (codeOrMessage + " " + (rawDetail || "")).toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return {
      code: "TIMEOUT",
      ...ERROR_MAP["TIMEOUT"]
    };
  }
  if (lower.includes("cert") && (lower.includes("expired") || lower.includes("vencido"))) {
    return {
      code: "CERT_EXPIRED",
      ...ERROR_MAP["CERT_EXPIRED"]
    };
  }
  if (lower.includes("auth") || lower.includes("token") || lower.includes("sign") || lower.includes("cms")) {
    return {
      code: "AUTH_FAILED",
      ...ERROR_MAP["AUTH_FAILED"]
    };
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("network") || lower.includes("socket")) {
    return {
      code: "NETWORK_ERROR",
      ...ERROR_MAP["NETWORK_ERROR"]
    };
  }
  return {
    code,
    title: "ARCA rechaz\xF3 el comprobante",
    reason: rawDetail || codeOrMessage || "Ocurri\xF3 un error al procesar el comprobante ante ARCA.",
    suggestedAction: "Verific\xE1 los datos fiscales de la venta e intent\xE1 nuevamente.",
    isRetryable: false
  };
}

// server/services/arca/arcaQr.ts
import QRCode from "qrcode";
var ARCA_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/?p=";
function buildArcaQrPayload(invoice) {
  if (invoice.status !== "AUTORIZADA" || !invoice.cae) {
    throw new Error("No se puede generar c\xF3digo QR fiscal para una factura que no ha sido autorizada con CAE.");
  }
  const cleanCuit = parseInt(invoice.emitterCuit.replace(/\D/g, ""), 10);
  const cleanCae = parseInt(invoice.cae.replace(/\D/g, ""), 10);
  let docRecNum;
  if (invoice.customerDocumentNumber) {
    const parsed = parseInt(invoice.customerDocumentNumber.replace(/\D/g, ""), 10);
    if (!isNaN(parsed) && parsed > 0) {
      docRecNum = parsed;
    }
  }
  const qrObj = {
    ver: 1,
    fecha: invoice.date.split("T")[0],
    cuit: cleanCuit,
    ptoVta: invoice.pointOfSale,
    tipoCmp: invoice.invoiceTypeCode,
    nroCmp: invoice.invoiceNumber,
    importe: Math.round((invoice.total + Number.EPSILON) * 100) / 100,
    moneda: invoice.currency || "PES",
    ctz: 1,
    tipoDocRec: invoice.customerDocumentTypeCode ?? (docRecNum ? 96 : 99),
    nroDocRec: docRecNum,
    tipoCodAut: "E",
    codAut: cleanCae
  };
  return JSON.stringify(qrObj);
}
function buildArcaQrUrl(payload) {
  const base64Payload = Buffer.from(payload, "utf8").toString("base64");
  return `${ARCA_QR_BASE_URL}${base64Payload}`;
}
async function generateQrDataUrl(qrUrl) {
  return QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 200,
    color: {
      dark: "#000000",
      light: "#ffffff"
    }
  });
}
async function generateQrBuffer(qrUrl) {
  return QRCode.toBuffer(qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 200,
    color: {
      dark: "#000000",
      light: "#ffffff"
    }
  });
}

// server/services/arca/arcaPdf.ts
import PDFDocument from "pdfkit";
async function generateFiscalInvoicePdf(data) {
  const qrPayload = buildArcaQrPayload({
    date: data.date,
    emitterCuit: data.emitter.cuit,
    pointOfSale: data.pointOfSale,
    invoiceTypeCode: data.invoiceTypeCode,
    invoiceNumber: data.invoiceNumber,
    total: data.total,
    currency: data.currency || "PES",
    customerDocumentTypeCode: data.customer.documentTypeCode,
    customerDocumentNumber: data.customer.documentNumber || data.customer.cuit,
    cae: data.cae,
    status: "AUTORIZADA"
  });
  const qrUrl = buildArcaQrUrl(qrPayload);
  const qrBuffer = await generateQrBuffer(qrUrl);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: {
          Title: `Factura_${data.invoiceType}_${String(data.pointOfSale).padStart(4, "0")}-${String(data.invoiceNumber).padStart(8, "0")}`,
          Author: data.emitter.businessName,
          Subject: "Factura Electr\xF3nica ARCA"
        }
      });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));
      const pvStr = String(data.pointOfSale).padStart(4, "0");
      const numStr = String(data.invoiceNumber).padStart(8, "0");
      const letter = data.invoiceType.replace("NC_", "").replace("ND_", "");
      const docTitle = data.invoiceType.startsWith("NC") ? "NOTA DE CR\xC9DITO" : "FACTURA";
      doc.rect(36, 36, 523, 770).lineWidth(1).stroke("#333333");
      doc.rect(275, 36, 45, 45).lineWidth(1).stroke("#333333");
      doc.fontSize(24).font("Helvetica-Bold").text(letter, 275, 42, { width: 45, align: "center" });
      doc.fontSize(7).font("Helvetica").text(`COD. ${String(data.invoiceTypeCode).padStart(2, "0")}`, 275, 70, { width: 45, align: "center" });
      doc.moveTo(297, 81).lineTo(297, 180).lineWidth(0.5).stroke("#cccccc");
      doc.fontSize(14).font("Helvetica-Bold").text(data.emitter.businessName, 46, 50, { width: 220 });
      doc.fontSize(8).font("Helvetica").text(`Raz\xF3n Social: ${data.emitter.businessName}`, 46, 85).text(`Domicilio Comercial: ${data.emitter.fiscalAddress}`, 46, 100, { width: 220 }).text(`Condici\xF3n frente al IVA: ${data.emitter.taxCondition}`, 46, 125);
      doc.fontSize(14).font("Helvetica-Bold").text(docTitle, 330, 50);
      doc.fontSize(10).font("Helvetica-Bold").text(`Punto de Venta: ${pvStr}   Comp. Nro: ${numStr}`, 330, 75);
      doc.fontSize(9).font("Helvetica").text(`Fecha de Emisi\xF3n: ${data.date}`, 330, 95).text(`CUIT: ${data.emitter.cuit}`, 330, 110).text(`Ingresos Brutos: ${data.emitter.grossIncome || "Exento"}`, 330, 125).text(`Inicio de Actividades: ${data.emitter.startDate || "01/01/2024"}`, 330, 140);
      doc.moveTo(36, 175).lineTo(559, 175).lineWidth(1).stroke("#333333");
      doc.fontSize(8).font("Helvetica-Bold").text(`CUIT / Documento: `, 46, 185, { continued: true }).font("Helvetica").text(`${data.customer.documentNumber || data.customer.cuit || "Consumidor Final"}`).font("Helvetica-Bold").text(`Apellido y Nombre / Raz\xF3n Social: `, 46, 200, { continued: true }).font("Helvetica").text(`${data.customer.name}`).font("Helvetica-Bold").text(`Condici\xF3n frente al IVA: `, 46, 215, { continued: true }).font("Helvetica").text(`${data.customer.taxCondition}`).font("Helvetica-Bold").text(`Domicilio: `, 330, 185, { continued: true }).font("Helvetica").text(`${data.customer.address || "San Luis"}`).font("Helvetica-Bold").text(`Condici\xF3n de Venta: `, 330, 200, { continued: true }).font("Helvetica").text(`Contado`);
      doc.moveTo(36, 235).lineTo(559, 235).lineWidth(1).stroke("#333333");
      const tableTop = 242;
      doc.rect(36, tableTop, 523, 18).fill("#f3f4f6");
      doc.fillColor("#000000");
      doc.fontSize(8).font("Helvetica-Bold").text("C\xF3digo", 46, tableTop + 5, { width: 60 }).text("Descripci\xF3n", 110, tableTop + 5, { width: 190 }).text("Cantidad", 305, tableTop + 5, { width: 45, align: "right" }).text("U.M.", 355, tableTop + 5, { width: 35, align: "center" }).text("Precio Unit.", 395, tableTop + 5, { width: 50, align: "right" }).text("% IVA", 450, tableTop + 5, { width: 35, align: "right" }).text("Subtotal", 490, tableTop + 5, { width: 60, align: "right" });
      let currentY = tableTop + 24;
      doc.font("Helvetica").fontSize(8);
      data.items.slice(0, 18).forEach((item, index) => {
        if (index % 2 === 1) {
          doc.rect(36, currentY - 2, 523, 14).fill("#fafafa");
          doc.fillColor("#000000");
        }
        doc.text(item.code || "GEN", 46, currentY, { width: 60 });
        doc.text(item.description, 110, currentY, { width: 190, ellipsis: true });
        doc.text(item.quantity.toFixed(2), 305, currentY, { width: 45, align: "right" });
        doc.text(item.unit || "un", 355, currentY, { width: 35, align: "center" });
        doc.text(`$${item.unitPrice.toFixed(2)}`, 395, currentY, { width: 50, align: "right" });
        doc.text(`${item.vatRate}%`, 450, currentY, { width: 35, align: "right" });
        doc.text(`$${item.total.toFixed(2)}`, 490, currentY, { width: 60, align: "right" });
        currentY += 14;
      });
      const totalsY = 660;
      doc.moveTo(36, totalsY).lineTo(559, totalsY).lineWidth(1).stroke("#333333");
      doc.fontSize(8).font("Helvetica").text(`Subtotal Neto Gravado: $${data.subtotalNet.toFixed(2)}`, 340, totalsY + 10, { width: 210, align: "right" }).text(`IVA Liquidado: $${data.taxes.toFixed(2)}`, 340, totalsY + 25, { width: 210, align: "right" });
      doc.fontSize(11).font("Helvetica-Bold").text(`TOTAL GENERAL: $${data.total.toFixed(2)}`, 340, totalsY + 45, { width: 210, align: "right" });
      const footerY = 720;
      doc.moveTo(36, footerY).lineTo(559, footerY).lineWidth(1).stroke("#333333");
      doc.image(qrBuffer, 46, footerY + 8, { width: 68, height: 68 });
      doc.fontSize(9).font("Helvetica-Bold").text(`CAE N\xB0: `, 130, footerY + 20, { continued: true }).font("Helvetica").text(data.cae).font("Helvetica-Bold").text(`Fecha de Vto. de CAE: `, 130, footerY + 38, { continued: true }).font("Helvetica").text(data.caeExpirationDate);
      doc.fontSize(7).font("Helvetica-Oblique").fillColor("#666666").text("Comprobante Autorizado por ARCA (ex-AFIP). La autenticidad de este documento puede verificarse escaneando el c\xF3digo QR con cualquier dispositivo m\xF3vil.", 130, footerY + 58, { width: 410 });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// server/middleware/auth.middleware.ts
var fiscalRepo = new FiscalRepository();
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token.trim();
  }
  if (!token) {
    if (req.path.includes("/pdf") && req.method === "GET") {
      return next();
    }
    res.status(401).json({
      success: false,
      error: "Acceso no autorizado: Se requiere token de autenticaci\xF3n Bearer."
    });
    return;
  }
  try {
    const supabase = fiscalRepo.getClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({
        success: false,
        error: "Sesi\xF3n inv\xE1lida, expirada o revocada. Inicie sesi\xF3n nuevamente."
      });
      return;
    }
    const { data: employee, error: empError } = await supabase.from("employees").select("id, user_id, role, active, name").eq("user_id", user.id).eq("active", true).maybeSingle();
    if (empError || !employee) {
      res.status(403).json({
        success: false,
        error: "Acceso denegado: Se requieren credenciales de empleado activo del comercio."
      });
      return;
    }
    req.user = {
      id: user.id,
      email: user.email
    };
    req.employee = {
      id: employee.id,
      user_id: employee.user_id,
      role: employee.role,
      active: employee.active,
      name: employee.name
    };
    next();
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Error interno de validaci\xF3n de credenciales: ${err.message}`
    });
  }
}
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const emp = req.employee;
    if (!emp) {
      res.status(401).json({
        success: false,
        error: "Autenticaci\xF3n requerida antes de verificar roles."
      });
      return;
    }
    const isPrivileged = emp.role === "owner" || emp.role === "super_admin" || emp.role === "admin";
    const roleAliases = {
      admin: ["admin", "owner", "super_admin"],
      cajero: ["cajero", "cashier", "admin", "owner", "super_admin"],
      cashier: ["cajero", "cashier", "admin", "owner", "super_admin"],
      repositor: ["repositor", "employee", "cajero", "admin", "owner", "super_admin"],
      employee: ["repositor", "employee", "cajero", "admin", "owner", "super_admin"]
    };
    const hasPermission = allowedRoles.some((allowed) => {
      if (emp.role === allowed) return true;
      const aliases = roleAliases[allowed];
      return aliases ? aliases.includes(emp.role) : false;
    });
    if (isPrivileged || hasPermission) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: `Acceso denegado: El rol '${emp.role}' no cuenta con permisos suficientes para esta operaci\xF3n fiscal.`
    });
  };
}

// server/middleware/validation.middleware.ts
function validateAuthorizePayload(req, res, next) {
  const { saleIds, pointOfSale, invoiceType, customer, items } = req.body;
  const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey;
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 6) {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: Se requiere una clave de idempotencia v\xE1lida (m\xEDnimo 6 caracteres)."
    });
    return;
  }
  if (!pointOfSale || typeof pointOfSale !== "number" || pointOfSale <= 0 || !Number.isInteger(pointOfSale)) {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: El punto de venta debe ser un n\xFAmero entero positivo."
    });
    return;
  }
  if (!invoiceType || !["A", "B", "C"].includes(invoiceType)) {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: El tipo de comprobante debe ser A, B o C."
    });
    return;
  }
  if (!customer || typeof customer !== "object") {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: Los datos del cliente receptor son obligatorios."
    });
    return;
  }
  if (!customer.name || typeof customer.name !== "string" || customer.name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: El nombre o raz\xF3n social del cliente es obligatorio."
    });
    return;
  }
  if (!customer.taxCondition || typeof customer.taxCondition !== "string") {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: La condici\xF3n frente al IVA del cliente es obligatoria."
    });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      success: false,
      error: "Validaci\xF3n fiscal: Debe incluir al menos un \xEDtem en el comprobante."
    });
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") {
      res.status(400).json({
        success: false,
        error: `Validaci\xF3n fiscal: El \xEDtem en la posici\xF3n ${i + 1} no es v\xE1lido.`
      });
      return;
    }
    if (!it.description || typeof it.description !== "string" || it.description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: `Validaci\xF3n fiscal: La descripci\xF3n del \xEDtem #${i + 1} es obligatoria.`
      });
      return;
    }
    if (typeof it.quantity !== "number" || it.quantity <= 0 || isNaN(it.quantity)) {
      res.status(400).json({
        success: false,
        error: `Validaci\xF3n fiscal: La cantidad del \xEDtem "${it.description}" debe ser un n\xFAmero mayor a cero.`
      });
      return;
    }
    if (typeof it.price !== "number" || it.price < 0 || isNaN(it.price)) {
      res.status(400).json({
        success: false,
        error: `Validaci\xF3n fiscal: El precio del \xEDtem "${it.description}" no puede ser negativo.`
      });
      return;
    }
  }
  next();
}
function validateExternalInvoicePayload(req, res, next) {
  const {
    pointOfSale,
    invoiceType,
    invoiceNumber,
    cae,
    caeExpirationDate,
    totalAmount,
    customerName,
    customerDocumentNumber,
    date
  } = req.body;
  if (!pointOfSale || typeof pointOfSale !== "number" || pointOfSale <= 0) {
    res.status(400).json({ success: false, error: "Punto de venta inv\xE1lido." });
    return;
  }
  if (!invoiceNumber || typeof invoiceNumber !== "number" || invoiceNumber <= 0) {
    res.status(400).json({ success: false, error: "N\xFAmero de comprobante inv\xE1lido." });
    return;
  }
  if (!cae || typeof cae !== "string" || !/^\d{14}$/.test(cae.trim())) {
    res.status(400).json({ success: false, error: "El CAE debe contener exactamente 14 d\xEDgitos num\xE9ricos." });
    return;
  }
  if (!caeExpirationDate || typeof caeExpirationDate !== "string") {
    res.status(400).json({ success: false, error: "Fecha de vencimiento de CAE obligatoria." });
    return;
  }
  if (typeof totalAmount !== "number" || totalAmount <= 0 || isNaN(totalAmount)) {
    res.status(400).json({ success: false, error: "Importe total debe ser un n\xFAmero positivo." });
    return;
  }
  if (!customerName || typeof customerName !== "string" || customerName.trim().length === 0) {
    res.status(400).json({ success: false, error: "Nombre de cliente obligatorio." });
    return;
  }
  next();
}

// server/routes/arca.routes.ts
var router = Router();
router.use(requireAuth);
var numberingLocks = /* @__PURE__ */ new Map();
async function acquireNumberingLock(key, fn) {
  while (numberingLocks.has(key)) {
    await numberingLocks.get(key);
  }
  let resolveLock;
  const lockPromise = new Promise((res) => {
    resolveLock = res;
  });
  numberingLocks.set(key, lockPromise);
  try {
    return await fn();
  } finally {
    numberingLocks.delete(key);
    resolveLock();
  }
}
var adminFiscalRepo = new FiscalRepository();
function getRepository() {
  return adminFiscalRepo;
}
router.get("/status", requireRole(["employee", "cashier", "admin", "owner"]), async (req, res) => {
  try {
    const userToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : void 0;
    await ensureCertificatesOnDisk(userToken);
    const service = ArcaInvoiceServiceFactory.getService("B");
    const serverStatus = await service.getServerStatus();
    const certInfo = getCertificateInfo();
    res.json({
      success: true,
      connected: Boolean(serverStatus.appServer && serverStatus.authServer),
      serverStatus,
      certificate: certInfo,
      config: getSafeFiscalConfig()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      connected: false,
      error: err.message,
      config: getSafeFiscalConfig()
    });
  }
});
router.get("/config", requireRole(["employee", "cashier", "admin", "owner"]), async (_req, res) => {
  try {
    const fiscalRepo2 = getRepository();
    const fiscalConfig = await fiscalRepo2.getFiscalConfig();
    res.json({
      success: true,
      config: {
        ...getSafeFiscalConfig(),
        ...fiscalConfig
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
router.put("/config", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const fiscalRepo2 = getRepository();
    const updated = await fiscalRepo2.saveFiscalConfig(req.body);
    await fiscalRepo2.logAudit({
      action: "UPDATE_FISCAL_CONFIG",
      result: "SUCCESS",
      user_id: req.user?.id || "admin",
      details: { updatedFields: Object.keys(req.body) }
    });
    res.json({
      success: true,
      config: {
        ...getSafeFiscalConfig(),
        ...updated
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
router.post("/certificates", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const { crtContent, keyContent, isProduction: isProduction2 } = req.body;
    if (!crtContent || !keyContent) {
      return res.status(400).json({ success: false, error: "Se requieren los contenidos del certificado (.crt) y la clave privada (.key)" });
    }
    const fs4 = __require("fs");
    const path4 = __require("path");
    const os4 = __require("os");
    const certsDir = process.env.VERCEL ? path4.join(os4.tmpdir(), "certs") : path4.join(process.cwd(), "certs");
    if (!fs4.existsSync(certsDir)) {
      fs4.mkdirSync(certsDir, { recursive: true });
    }
    const prefix = isProduction2 ? "prod" : "homo";
    fs4.writeFileSync(path4.join(certsDir, `${prefix}.crt`), crtContent, "utf-8");
    fs4.writeFileSync(path4.join(certsDir, `${prefix}.key`), keyContent, "utf-8");
    const fiscalRepo2 = getRepository();
    const userToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : void 0;
    const envKey = `arca_certificates_${isProduction2 ? "production" : "testing"}`;
    await fiscalRepo2.getClient(userToken).from("settings").upsert({
      key: envKey,
      branch_id: "main",
      value: {
        crt: crtContent,
        key: keyContent,
        uploaded_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    }, { onConflict: "key, branch_id" });
    await fiscalRepo2.logAudit({
      action: "UPDATE_CERTIFICATES",
      result: "SUCCESS",
      user_id: req.user?.id || "admin",
      details: { environment: isProduction2 ? "production" : "testing" }
    });
    res.json({
      success: true,
      message: `Certificados de ${isProduction2 ? "producci\xF3n" : "homologaci\xF3n"} guardados correctamente.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: `Error al guardar certificados: ${err.message}` });
  }
});
router.get("/points-of-sale", requireRole(["employee", "cashier", "admin", "owner"]), async (_req, res) => {
  const fiscalRepo2 = getRepository();
  const fiscalConfig = await fiscalRepo2.getFiscalConfig();
  const pvNumber = fiscalConfig.defaultPointOfSale || arcaConfig.defaultPointOfSale;
  res.json({
    success: true,
    pointsOfSale: [
      {
        number: pvNumber,
        description: "Caja Principal - Facturaci\xF3n Electr\xF3nica",
        mode: "ELECTRONIC",
        environment: arcaConfig.environment,
        isActive: true
      }
    ]
  });
});
router.get("/last-voucher", requireRole(["employee", "cashier", "admin", "owner"]), async (req, res) => {
  try {
    const pv = parseInt(req.query.pointOfSale, 10) || arcaConfig.defaultPointOfSale;
    const tipo = req.query.invoiceType || "B";
    const tipoCode = VOUCHER_CODES[tipo] || 6;
    const service = ArcaInvoiceServiceFactory.getService(tipo);
    const lastNumber = await service.getLastVoucher(pv, tipoCode);
    res.json({
      success: true,
      pointOfSale: pv,
      invoiceType: tipo,
      invoiceTypeCode: tipoCode,
      lastNumber,
      nextNumber: lastNumber + 1
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `No se pudo obtener el \xFAltimo comprobante desde ARCA: ${err.message}`
    });
  }
});
router.post("/authorize", requireRole(["employee", "cashier", "admin", "owner"]), validateAuthorizePayload, async (req, res) => {
  const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey;
  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: "Se requiere una clave de idempotencia (X-Idempotency-Key / UUID v4)."
    });
  }
  const fiscalRepo2 = getRepository();
  const {
    saleIds = [],
    pointOfSale = arcaConfig.defaultPointOfSale,
    invoiceType = "B",
    customer,
    items = [],
    pricesIncludeTax = true
  } = req.body;
  const authReq = req;
  const requestedBy = authReq.employee?.name || authReq.user?.email || "Admin";
  const existingOp = await fiscalRepo2.getOperationByIdempotencyKey(idempotencyKey);
  if (existingOp) {
    if (existingOp.status === "AUTORIZADA" && existingOp.invoice_id) {
      const existingInv = await fiscalRepo2.getInvoiceById(existingOp.invoice_id);
      return res.json({
        success: true,
        status: "AUTORIZADA",
        message: "Esta operaci\xF3n ya fue autorizada previamente.",
        invoice: existingInv
      });
    }
    if (existingOp.status === "EN_PROCESO") {
      return res.status(409).json({
        success: false,
        status: "EN_PROCESO",
        message: "La operaci\xF3n est\xE1 siendo procesada actualmente. Por favor espere."
      });
    }
    if (existingOp.status === "ESTADO_DESCONOCIDO") {
      return res.status(409).json({
        success: false,
        status: "ESTADO_DESCONOCIDO",
        operationId: existingOp.id,
        message: "La operaci\xF3n previa tuvo un timeout con ARCA. Debe reconciliarse antes de reintentar."
      });
    }
  }
  if (saleIds.length > 0) {
    const alreadyBilled = await fiscalRepo2.findAuthorizedInvoicesForSales(saleIds);
    if (alreadyBilled.length > 0) {
      const first = alreadyBilled[0];
      return res.status(400).json({
        success: false,
        error: `La venta ya cuenta con una factura fiscal autorizada (#${first.point_of_sale}-${first.invoice_number}, Tipo ${first.invoice_type}).`
      });
    }
  }
  if (!customer || !customer.name || !customer.taxCondition) {
    return res.status(400).json({
      success: false,
      error: "Los datos del cliente receptor (nombre y condici\xF3n IVA) son obligatorios."
    });
  }
  const typeDetermination = determineInvoiceType("Responsable Inscripto", customer.taxCondition);
  if (typeDetermination.invoiceType !== invoiceType) {
    return res.status(400).json({
      success: false,
      error: `Incompatibilidad fiscal: ${typeDetermination.reason}`
    });
  }
  if (invoiceType === "A") {
    const cuitValidation = validateCuit(customer.cuit || customer.documentNumber);
    if (!cuitValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Para emitir Factura A se exige un CUIT v\xE1lido: ${cuitValidation.error}`
      });
    }
  }
  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Debe incluir al menos un producto en el comprobante."
    });
  }
  const calc = recalculateFiscalInvoice(items, pricesIncludeTax);
  if (invoiceType === "B" && customer.taxCondition === "Consumidor Final") {
    if (calc.total >= CF_DNI_REQUIRED_LIMIT) {
      const docNum = (customer.documentNumber || "").trim();
      const docType = customer.documentType;
      if (!docNum || docNum === "0" || docType === "SIN_IDENTIFICAR") {
        return res.status(400).json({
          success: false,
          error: `Para comprobantes a Consumidor Final que alcancen o superen $${CF_DNI_REQUIRED_LIMIT.toLocaleString("es-AR")}, la normativa de ARCA exige identificar obligatoriamente al comprador con DNI o CUIT.`
        });
      }
    }
  }
  const opId = `FIO-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ saleIds, pointOfSale, invoiceType, total: calc.total })).digest("hex");
  const newOp = {
    id: opId,
    idempotency_key: idempotencyKey,
    operation_type: "AUTHORIZE_INVOICE",
    sale_ids: saleIds,
    point_of_sale: pointOfSale,
    invoice_type: invoiceType,
    invoice_type_code: VOUCHER_CODES[invoiceType] || 6,
    status: "EN_PROCESO",
    request_hash: requestHash,
    requested_by: requestedBy,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const createOpResult = await fiscalRepo2.createOperation(newOp);
  if (!createOpResult.success && createOpResult.error?.code === "23505") {
    return res.status(409).json({
      success: false,
      status: "EN_PROCESO",
      message: "Solicitud concurrente duplicada detectada en base de datos. Espere la resoluci\xF3n de la operaci\xF3n previa."
    });
  }
  const lockKey = `${pointOfSale}_${newOp.invoice_type_code}`;
  try {
    const result = await acquireNumberingLock(lockKey, async () => {
      if (saleIds.length > 0) {
        const lockedCheckBilled = await fiscalRepo2.findAuthorizedInvoicesForSales(saleIds);
        if (lockedCheckBilled.length > 0) {
          const firstBilled = lockedCheckBilled[0];
          await fiscalRepo2.updateOperation(idempotencyKey, {
            status: "RECHAZADA",
            error_code: "SALE_ALREADY_BILLED",
            error_message: `Conflicto de concurrencia: la venta ya fue facturada en comprobante #${firstBilled.point_of_sale}-${firstBilled.invoice_number}`
          });
          const conflictErr = new Error(`La venta ya cuenta con una factura fiscal autorizada (#${firstBilled.point_of_sale}-${firstBilled.invoice_number}, Tipo ${firstBilled.invoice_type}).`);
          conflictErr.isSaleConflict = true;
          conflictErr.existingInvoice = firstBilled;
          throw conflictErr;
        }
      }
      const service = ArcaInvoiceServiceFactory.getService(invoiceType);
      let lastNumber;
      try {
        lastNumber = await service.getLastVoucher(pointOfSale, newOp.invoice_type_code);
      } catch (err) {
        await fiscalRepo2.updateOperation(idempotencyKey, {
          status: "ERROR_TECNICO",
          error_message: `Fallo al consultar \xFAltimo comprobante a ARCA: ${err.message}`
        });
        throw new Error(`No se pudo obtener la numeraci\xF3n correlativa desde ARCA: ${err.message}. Emisi\xF3n abortada.`);
      }
      const nextNumber2 = lastNumber + 1;
      let docTypeCode = DOCUMENT_TYPE_CODES[customer.documentType || (customer.cuit ? "CUIT" : "DNI")] || 96;
      if (invoiceType === "A" || invoiceType === "B" || [1, 2, 3, 6, 7, 8].includes(newOp.invoice_type_code)) {
        if (docTypeCode === 99 || customer.documentType === "SIN_IDENTIFICAR") {
          docTypeCode = 96;
        }
      }
      const cleanDocNumber = (customer.documentNumber || customer.cuit || "0").replace(/\D/g, "") || "0";
      const voucherRequest2 = {
        idempotencyKey,
        saleIds,
        pointOfSale,
        invoiceType,
        invoiceTypeCode: newOp.invoice_type_code,
        voucherNumber: nextNumber2,
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        concept: 1,
        // 1: Productos
        customer: {
          name: customer.name,
          documentType: docTypeCode === 96 && cleanDocNumber === "0" ? "DNI" : customer.documentType || (customer.cuit ? "CUIT" : "DNI"),
          documentTypeCode: docTypeCode,
          documentNumber: cleanDocNumber,
          cuit: customer.cuit ? customer.cuit.replace(/\D/g, "") : void 0,
          taxCondition: customer.taxCondition,
          taxConditionCode: customer.taxConditionCode || (customer.taxCondition === "Consumidor Final" ? 5 : void 0),
          address: customer.address,
          email: customer.email,
          phone: customer.phone
        },
        subtotalNet: calc.subtotalNet,
        taxes: calc.taxes,
        total: calc.total,
        items: calc.items,
        vatBreakdown: calc.vatBreakdown
      };
      await fiscalRepo2.updateOperation(idempotencyKey, {
        raw_response: {
          proposedVoucherNumber: nextNumber2,
          requestPayload: voucherRequest2
        }
      });
      const arcaResponse2 = await service.authorizeInvoice(voucherRequest2);
      return { arcaResponse: arcaResponse2, voucherRequest: voucherRequest2, nextNumber: nextNumber2 };
    });
    const { arcaResponse, voucherRequest, nextNumber } = result;
    const isCaeValid = Boolean(
      arcaResponse.success && arcaResponse.cae && /^\d{14}$/.test(arcaResponse.cae.trim())
    );
    if (isCaeValid && arcaResponse.cae) {
      const invId = `INV-${Date.now()}-${String(nextNumber).padStart(8, "0")}`;
      const qrPayload = buildArcaQrPayload({
        date: voucherRequest.date,
        emitterCuit: arcaConfig.cuit,
        pointOfSale: newOp.point_of_sale,
        invoiceTypeCode: newOp.invoice_type_code,
        invoiceNumber: nextNumber,
        total: voucherRequest.total,
        currency: "PES",
        customerDocumentTypeCode: voucherRequest.customer.documentTypeCode,
        customerDocumentNumber: voucherRequest.customer.documentNumber,
        cae: arcaResponse.cae,
        status: "AUTORIZADA"
      });
      const qrUrl = buildArcaQrUrl(qrPayload);
      const qrDataUrl = await generateQrDataUrl(qrUrl);
      const emitterConfig = await fiscalRepo2.getFiscalConfig();
      const pdfBuffer = await generateFiscalInvoicePdf({
        invoiceType: newOp.invoice_type,
        invoiceTypeCode: newOp.invoice_type_code,
        pointOfSale: newOp.point_of_sale,
        invoiceNumber: nextNumber,
        date: voucherRequest.date,
        emitter: {
          businessName: emitterConfig.businessName,
          cuit: emitterConfig.cuit || arcaConfig.cuit,
          taxCondition: emitterConfig.taxCondition,
          grossIncome: emitterConfig.grossIncome,
          startDate: emitterConfig.startDate,
          fiscalAddress: emitterConfig.fiscalAddress
        },
        customer: voucherRequest.customer,
        items: voucherRequest.items,
        subtotalNet: voucherRequest.subtotalNet,
        taxes: voucherRequest.taxes,
        total: voucherRequest.total,
        cae: arcaResponse.cae,
        caeExpirationDate: arcaResponse.caeExpirationDate || ""
      });
      const fiscalInvoice = {
        id: invId,
        branch_id: "main",
        idempotency_key: idempotencyKey,
        sale_ids: saleIds,
        direction: "venta",
        invoice_type: newOp.invoice_type,
        invoice_type_code: newOp.invoice_type_code,
        point_of_sale: newOp.point_of_sale,
        invoice_number: nextNumber,
        date: (/* @__PURE__ */ new Date()).toISOString(),
        customer_name: voucherRequest.customer.name,
        customer_document_type: voucherRequest.customer.documentType,
        customer_document_number: voucherRequest.customer.documentNumber,
        customer_cuit: voucherRequest.customer.cuit || null,
        customer_tax_condition: voucherRequest.customer.taxCondition,
        customer_address: voucherRequest.customer.address || null,
        customer_email: voucherRequest.customer.email || null,
        customer_phone: voucherRequest.customer.phone || null,
        subtotal_net: voucherRequest.subtotalNet,
        taxes: voucherRequest.taxes,
        total: voucherRequest.total,
        currency: "PES",
        status: "AUTORIZADA",
        service_used: arcaResponse.serviceUsed,
        cae: arcaResponse.cae,
        cae_expiration_date: arcaResponse.caeExpirationDate || "",
        arca_observations: arcaResponse.observations || [],
        items: voucherRequest.items,
        vat_breakdown: voucherRequest.vatBreakdown,
        qr_payload: qrPayload,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_by: requestedBy
      };
      await fiscalRepo2.saveInvoice(fiscalInvoice);
      if (saleIds && saleIds.length > 0) {
        try {
          const supabase = fiscalRepo2.getClient();
          await supabase.from("orders").update({
            is_billed: true,
            invoice_id: invId,
            billing_status: "FACTURADO_AFIP",
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }).in("id", saleIds);
        } catch (orderErr) {
          console.warn("[ArcaRoutes] Advertencia vinculando \xF3rdenes en authorize:", orderErr.message);
        }
      }
      await fiscalRepo2.updateOperation(idempotencyKey, {
        status: "AUTORIZADA",
        invoice_id: invId,
        raw_response: { cae: arcaResponse.cae, vto: arcaResponse.caeExpirationDate }
      });
      await fiscalRepo2.logAudit({
        action: "AUTORIZADO",
        voucher_info: `${newOp.invoice_type} ${String(newOp.point_of_sale).padStart(4, "0")}-${String(nextNumber).padStart(8, "0")}`,
        result: "EXITO",
        user_id: requestedBy,
        details: { cae: arcaResponse.cae, total: voucherRequest.total, sales: saleIds }
      });
      return res.json({
        success: true,
        status: "AUTORIZADA",
        invoice: {
          ...fiscalInvoice,
          pointOfSale: newOp.point_of_sale,
          invoiceNumber: nextNumber,
          point_of_sale: newOp.point_of_sale,
          invoice_number: nextNumber,
          folio: `${String(newOp.point_of_sale).padStart(4, "0")}-${String(nextNumber).padStart(8, "0")}`,
          type: newOp.invoice_type,
          invoiceType: newOp.invoice_type,
          invoice_type: newOp.invoice_type,
          clientName: voucherRequest.customer.name,
          clientCuit: voucherRequest.customer.cuit || voucherRequest.customer.documentNumber || "",
          subtotal: voucherRequest.subtotalNet,
          subtotalNet: voucherRequest.subtotalNet
        },
        qrDataUrl,
        pdfDownloadUrl: `/api/arca/invoices/${invId}/pdf`
      });
    } else {
      const primaryErr = arcaResponse.errors?.[0] || { code: "ARCA_REJECTED", message: "Comprobante rechazado por ARCA." };
      const friendlyErr = translateArcaError(primaryErr.code, primaryErr.message);
      await fiscalRepo2.updateOperation(idempotencyKey, {
        status: "RECHAZADA",
        error_code: primaryErr.code,
        error_message: primaryErr.message,
        raw_response: { errors: arcaResponse.errors, observations: arcaResponse.observations }
      });
      await fiscalRepo2.logAudit({
        action: "RECHAZADO",
        voucher_info: `${newOp.invoice_type} PV ${newOp.point_of_sale}`,
        result: "RECHAZO",
        user_id: requestedBy,
        details: { errors: arcaResponse.errors, observations: arcaResponse.observations }
      });
      return res.status(422).json({
        success: false,
        status: "RECHAZADA",
        error: friendlyErr,
        rawErrors: arcaResponse.errors,
        observations: arcaResponse.observations
      });
    }
  } catch (err) {
    if (err.isSaleConflict) {
      return res.status(409).json({
        success: false,
        status: "RECHAZADA",
        error: err.message,
        existingInvoice: err.existingInvoice
      });
    }
    const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout") || err.message?.includes("ETIMEDOUT") || err.code === "ECONNRESET" || err.code === "ESOCKETTIMEDOUT" || err.message?.includes("socket hang up");
    if (isTimeout) {
      await fiscalRepo2.updateOperation(idempotencyKey, {
        status: "ESTADO_DESCONOCIDO",
        error_message: err.message
      });
      await fiscalRepo2.logAudit({
        action: "ESTADO_DESCONOCIDO",
        voucher_info: `${newOp.invoice_type} PV ${newOp.point_of_sale}`,
        result: "TIMEOUT",
        user_id: requestedBy,
        details: { error: err.message }
      });
      return res.status(504).json({
        success: false,
        status: "ESTADO_DESCONOCIDO",
        operationId: newOp.id,
        error: translateArcaError("TIMEOUT", err.message),
        message: "No se recibi\xF3 respuesta a tiempo de ARCA. No vuelva a presionar facturar; ejecute la reconciliaci\xF3n."
      });
    }
    await fiscalRepo2.updateOperation(idempotencyKey, {
      status: "ERROR_TECNICO",
      error_message: err.message
    });
    return res.status(502).json({
      success: false,
      status: "ERROR_TECNICO",
      error: translateArcaError("NETWORK_ERROR", err.message)
    });
  }
});
async function reconcileFiscalOperation(opId, res) {
  const fiscalRepo2 = getRepository();
  const op = await fiscalRepo2.getOperationById(opId);
  if (!op) {
    return res.status(404).json({
      success: false,
      error: "Operaci\xF3n no encontrada en base de datos."
    });
  }
  const existingInv = await fiscalRepo2.getInvoiceByIdempotencyKey(op.idempotency_key);
  if (existingInv && existingInv.status === "AUTORIZADA") {
    if (op.status !== "AUTORIZADA") {
      await fiscalRepo2.updateOperation(op.idempotency_key, {
        status: "AUTORIZADA",
        invoice_id: existingInv.id
      });
    }
    return res.json({
      success: true,
      status: "AUTORIZADA",
      message: "El comprobante ya fue reconciliado previamente y se encuentra disponible.",
      invoice: existingInv
    });
  }
  if (op.status !== "ESTADO_DESCONOCIDO" && op.status !== "EN_PROCESO") {
    return res.json({
      success: true,
      status: op.status,
      message: `La operaci\xF3n no requiere reconciliaci\xF3n (estado actual: ${op.status}).`
    });
  }
  try {
    const service = ArcaInvoiceServiceFactory.getService(op.invoice_type);
    const rawData = op.raw_response || {};
    const proposedNumber = rawData.proposedVoucherNumber;
    const requestPayload = rawData.requestPayload;
    const lastNumberInArca = await service.getLastVoucher(op.point_of_sale, op.invoice_type_code);
    if (proposedNumber && lastNumberInArca < proposedNumber) {
      await fiscalRepo2.updateOperation(op.idempotency_key, {
        status: "ERROR_TECNICO",
        error_message: `Comprobante no registrado en ARCA (\xDAltimo en ARCA: ${lastNumberInArca}, intentado: ${proposedNumber}). Ventas liberadas de forma segura.`
      });
      return res.json({
        success: true,
        status: "ERROR_TECNICO",
        message: "Se confirm\xF3 que el comprobante no fue registrado en ARCA. Las ventas han sido liberadas para reintento."
      });
    }
    if (!proposedNumber) {
      return res.status(400).json({
        success: false,
        status: "ESTADO_DESCONOCIDO",
        error: "No se dispone de proposedVoucherNumber registrado para esta operaci\xF3n. No es seguro asumir qu\xE9 comprobante corresponde a esta venta sin intervenci\xF3n t\xE9cnica."
      });
    }
    let voucherData = null;
    try {
      voucherData = await service.getInvoice(op.point_of_sale, op.invoice_type_code, proposedNumber);
    } catch (consultErr) {
      return res.status(502).json({
        success: false,
        status: "ESTADO_DESCONOCIDO",
        error: `No fue posible verificar el comprobante #${proposedNumber} en ARCA: ${consultErr.message}. La operaci\xF3n permanece en ESTADO_DESCONOCIDO para evitar duplicaciones.`
      });
    }
    if (!voucherData || !voucherData.cae || !/^\d{14}$/.test(voucherData.cae.trim())) {
      return res.status(409).json({
        success: false,
        status: "ESTADO_DESCONOCIDO",
        error: `ARCA no retorn\xF3 CAE v\xE1lido para el comprobante #${proposedNumber}. No es posible asociarlo autom\xE1ticamente.`
      });
    }
    if (requestPayload && requestPayload.total !== void 0) {
      const expectedTotal = Number(requestPayload.total);
      const actualTotal = Number(voucherData.total);
      if (Math.abs(expectedTotal - actualTotal) > 0.05) {
        return res.status(409).json({
          success: false,
          status: "ESTADO_DESCONOCIDO",
          error: `Discrepancia en el importe total: Esperado $${expectedTotal}, en ARCA figura $${actualTotal}. Operaci\xF3n bloqueada preventivamente.`
        });
      }
    }
    if (requestPayload && requestPayload.customer?.documentNumber && requestPayload.customer?.documentNumber !== "0") {
      const cleanReqDoc = String(requestPayload.customer.documentNumber).replace(/\D/g, "");
      const cleanArcaDoc = String(voucherData.documentNumber || "").replace(/\D/g, "");
      if (cleanReqDoc && cleanArcaDoc && cleanReqDoc !== cleanArcaDoc) {
        return res.status(409).json({
          success: false,
          status: "ESTADO_DESCONOCIDO",
          error: `Discrepancia en receptor: CUIT/DNI esperado ${cleanReqDoc}, en ARCA figura ${cleanArcaDoc}. Operaci\xF3n bloqueada preventivamente.`
        });
      }
    }
    const invId = `INV-${Date.now()}-${String(proposedNumber).padStart(8, "0")}`;
    const qrPayload = buildArcaQrPayload({
      date: voucherData.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      emitterCuit: arcaConfig.cuit,
      pointOfSale: op.point_of_sale,
      invoiceTypeCode: op.invoice_type_code,
      invoiceNumber: proposedNumber,
      total: voucherData.total,
      currency: "PES",
      customerDocumentTypeCode: requestPayload?.customer?.documentTypeCode || 96,
      customerDocumentNumber: voucherData.documentNumber || requestPayload?.customer?.documentNumber || "0",
      cae: voucherData.cae,
      status: "AUTORIZADA"
    });
    const calculatedSubtotal = Number(requestPayload?.subtotalNet ?? voucherData.total / 1.21);
    const calculatedTaxes = Number(requestPayload?.taxes ?? voucherData.total - calculatedSubtotal);
    const invoiceRecord = {
      id: invId,
      branch_id: "main",
      idempotency_key: op.idempotency_key,
      sale_ids: op.sale_ids || [],
      direction: "venta",
      invoice_type: op.invoice_type,
      invoice_type_code: op.invoice_type_code,
      point_of_sale: op.point_of_sale,
      invoice_number: proposedNumber,
      date: voucherData.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      customer_id: requestPayload?.customer?.id || null,
      customer_name: requestPayload?.customer?.name || "Consumidor Final",
      customer_document_type: requestPayload?.customer?.documentType || "DNI",
      customer_document_number: voucherData.documentNumber || requestPayload?.customer?.documentNumber || "0",
      customer_cuit: requestPayload?.customer?.cuit || null,
      customer_tax_condition: requestPayload?.customer?.taxCondition || "Consumidor Final",
      customer_address: requestPayload?.customer?.address || null,
      subtotal_net: calculatedSubtotal,
      taxes: calculatedTaxes,
      total: Number(voucherData.total),
      currency: "PES",
      service_used: op.invoice_type === "C" ? "WSFEv1" : "WSMTXCA",
      cae: voucherData.cae,
      cae_expiration_date: voucherData.caeExpirationDate,
      status: "AUTORIZADA",
      qr_payload: qrPayload,
      items: requestPayload?.items || [],
      vat_breakdown: requestPayload?.vatBreakdown || [],
      created_by: op.requested_by || "Sistema (Reconciliaci\xF3n)"
    };
    await fiscalRepo2.saveInvoice(invoiceRecord);
    await fiscalRepo2.updateOperation(op.idempotency_key, {
      status: "AUTORIZADA",
      invoice_id: invId,
      raw_response: voucherData
    });
    if (op.sale_ids && op.sale_ids.length > 0) {
      try {
        const supabase = fiscalRepo2.getClient();
        await supabase.from("orders").update({
          is_billed: true,
          invoice_id: invId,
          billing_status: "FACTURADO_AFIP",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).in("id", op.sale_ids);
      } catch (errLock) {
        console.warn("[ArcaRoutes] Advertencia marcando \xF3rdenes como facturadas:", errLock.message);
      }
    }
    return res.json({
      success: true,
      status: "AUTORIZADA",
      message: "El comprobante fue verificado, recuperado de ARCA y registrado exitosamente en el sistema.",
      invoice: invoiceRecord
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `Error durante la reconciliaci\xF3n con ARCA: ${err.message}`
    });
  }
}
router.post("/operations/:id/reconcile", requireRole(["admin", "owner", "super_admin"]), async (req, res) => {
  return reconcileFiscalOperation(req.params.id, res);
});
router.post("/reconcile-unknown", requireRole(["admin", "owner", "super_admin"]), async (req, res) => {
  const opId = req.body.operationId || req.body.id || req.body.operation_id;
  if (!opId || typeof opId !== "string") {
    return res.status(400).json({ success: false, error: 'Se requiere "operationId" en el cuerpo de la petici\xF3n.' });
  }
  return reconcileFiscalOperation(opId, res);
});
router.get("/invoices/:id/pdf", async (req, res) => {
  const fiscalRepo2 = getRepository();
  const inv = await fiscalRepo2.getInvoiceById(req.params.id);
  if (!inv) {
    return res.status(404).send("Factura no encontrada.");
  }
  if (inv.status !== "AUTORIZADA" || !inv.cae) {
    return res.status(400).send("No se puede generar PDF fiscal para un comprobante no autorizado.");
  }
  try {
    const emitterConfig = await fiscalRepo2.getFiscalConfig();
    const pdfBuffer = await generateFiscalInvoicePdf({
      invoiceType: inv.invoice_type,
      invoiceTypeCode: inv.invoice_type_code,
      pointOfSale: inv.point_of_sale,
      invoiceNumber: inv.invoice_number,
      date: inv.date.split("T")[0],
      emitter: {
        businessName: emitterConfig.businessName,
        cuit: emitterConfig.cuit || arcaConfig.cuit,
        taxCondition: emitterConfig.taxCondition,
        grossIncome: emitterConfig.grossIncome,
        startDate: emitterConfig.startDate,
        fiscalAddress: emitterConfig.fiscalAddress
      },
      customer: {
        name: inv.customer_name,
        documentType: inv.customer_document_type,
        documentTypeCode: 96,
        documentNumber: inv.customer_document_number,
        cuit: inv.customer_cuit || void 0,
        taxCondition: inv.customer_tax_condition,
        address: inv.customer_address || void 0
      },
      items: inv.items || [],
      subtotalNet: Number(inv.subtotal_net),
      taxes: Number(inv.taxes),
      total: Number(inv.total),
      cae: inv.cae,
      caeExpirationDate: inv.cae_expiration_date
    });
    const filename = `Factura_${inv.invoice_type}_${String(inv.point_of_sale).padStart(4, "0")}-${String(inv.invoice_number).padStart(8, "0")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send(`Error generando PDF fiscal: ${err.message}`);
  }
});
router.get("/invoices", requireRole(["employee", "cashier", "admin", "owner"]), async (req, res) => {
  const fiscalRepo2 = getRepository();
  const invoices = await fiscalRepo2.listInvoices();
  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      let qrDataUrl = inv.qrDataUrl;
      if (!qrDataUrl && inv.status === "AUTORIZADA" && inv.cae && inv.qr_payload) {
        try {
          const qrUrl = buildArcaQrUrl(inv.qr_payload);
          qrDataUrl = await generateQrDataUrl(qrUrl);
        } catch (err) {
          console.error("Error generando QR de ARCA:", err);
        }
      }
      return {
        ...inv,
        pointOfSale: inv.point_of_sale,
        invoiceNumber: inv.invoice_number,
        point_of_sale: inv.point_of_sale,
        invoice_number: inv.invoice_number,
        folio: `${String(inv.point_of_sale || 1).padStart(4, "0")}-${String(inv.invoice_number || 1).padStart(8, "0")}`,
        type: inv.invoice_type,
        invoiceType: inv.invoice_type,
        invoice_type: inv.invoice_type,
        clientName: inv.customer_name || "Consumidor Final",
        clientCuit: inv.customer_cuit || inv.customer_document_number || "CF",
        subtotal: inv.subtotal_net,
        subtotalNet: inv.subtotal_net,
        qrDataUrl
      };
    })
  );
  res.json({ success: true, invoices: enriched });
});
router.get("/audit-logs", requireRole(["admin", "owner"]), async (req, res) => {
  const fiscalRepo2 = getRepository();
  const logs = await fiscalRepo2.listAuditLogs();
  res.json({ success: true, logs });
});
router.get("/voucher-info", requireRole(["employee", "cashier", "admin", "owner"]), async (req, res) => {
  try {
    const pv = parseInt(req.query.pointOfSale, 10) || arcaConfig.defaultPointOfSale;
    const tipo = req.query.invoiceType || "B";
    const tipoCode = parseInt(req.query.invoiceTypeCode, 10) || VOUCHER_CODES[tipo] || 6;
    const number = parseInt(req.query.voucherNumber, 10);
    if (!number || isNaN(number) || number <= 0) {
      return res.status(400).json({ success: false, error: "N\xFAmero de comprobante obligatorio y mayor a cero." });
    }
    const service = ArcaInvoiceServiceFactory.getService(tipo);
    const voucherData = await service.getInvoice(pv, tipoCode, number);
    if (!voucherData) {
      return res.json({
        success: true,
        exists: false,
        pointOfSale: pv,
        invoiceType: tipo,
        invoiceTypeCode: tipoCode,
        voucherNumber: number,
        message: "Comprobante no encontrado en ARCA."
      });
    }
    res.json({
      success: true,
      exists: true,
      pointOfSale: pv,
      invoiceType: tipo,
      invoiceTypeCode: tipoCode,
      voucherNumber: number,
      voucherData
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
async function handleRegisterExternalInvoice(req, res) {
  try {
    const body = req.body;
    const pv = body.pointOfSale || arcaConfig.defaultPointOfSale;
    const tipo = body.invoiceType || "B";
    const tipoCode = VOUCHER_CODES[tipo] || 6;
    const number = body.invoiceNumber;
    if (!number || isNaN(number) || number <= 0) {
      return res.status(400).json({ success: false, error: "N\xFAmero de comprobante obligatorio y mayor a cero." });
    }
    if (!body.customer || !body.customer.name) {
      return res.status(400).json({ success: false, error: "Datos del cliente/receptor obligatorios." });
    }
    if (body.total === void 0 || body.total === null || isNaN(body.total)) {
      return res.status(400).json({ success: false, error: "Importe total obligatorio." });
    }
    const fiscalRepo2 = getRepository();
    const existing = await fiscalRepo2.findInvoiceByVoucher(pv, tipoCode, number);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Ya existe un comprobante registrado para este Punto de Venta, Tipo y N\xFAmero.",
        existingInvoice: {
          id: existing.id,
          pointOfSale: existing.point_of_sale,
          invoiceType: existing.invoice_type,
          invoiceNumber: existing.invoice_number,
          cae: existing.cae,
          date: existing.date,
          total: existing.total,
          status: existing.status
        }
      });
    }
    let warningMessage;
    try {
      const service = ArcaInvoiceServiceFactory.getService(tipo);
      const lastOfficialNumber = await service.getLastVoucher(pv, tipoCode);
      if (lastOfficialNumber > 0 && number > lastOfficialNumber + 1) {
        warningMessage = `ADVERTENCIA: ARCA informa que el \xFAltimo comprobante registrado es el N\xBA ${lastOfficialNumber}. Est\xE1 registrando externamente el N\xBA ${number}, lo que generar\xE1 un salto de correlatividad si no existen los comprobantes intermedios.`;
      }
    } catch {
    }
    const invoiceId = `INV-EXT-${Date.now()}-${String(number).padStart(8, "0")}`;
    const dateStr = body.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const qrPayload = body.cae ? buildArcaQrPayload({
      date: dateStr,
      emitterCuit: arcaConfig.cuit,
      pointOfSale: pv,
      invoiceTypeCode: tipoCode,
      invoiceNumber: number,
      total: body.total,
      currency: "PES",
      customerDocumentTypeCode: body.customer.documentTypeCode || 99,
      customerDocumentNumber: body.customer.documentNumber || "0",
      cae: body.cae,
      status: "REGISTRADA_EXTERNAMENTE"
    }) : null;
    const externalRecord = {
      id: invoiceId,
      branch_id: "main",
      idempotency_key: `ext-${pv}-${tipoCode}-${number}-${Date.now()}`,
      sale_ids: body.saleIds || [],
      direction: "venta",
      invoice_type: tipo,
      invoice_type_code: tipoCode,
      point_of_sale: pv,
      invoice_number: number,
      date: dateStr,
      customer_id: body.customer.id || null,
      customer_name: body.customer.name,
      customer_document_type: body.customer.documentType || "DNI",
      customer_document_number: body.customer.documentNumber || "0",
      customer_cuit: body.customer.cuit || null,
      customer_tax_condition: body.customer.taxCondition || "Consumidor Final",
      customer_address: body.customer.address || null,
      subtotal_net: body.subtotalNet || body.total / 1.21,
      taxes: body.taxes || body.total - body.total / 1.21,
      total: body.total,
      currency: "PES",
      origin: body.origin || "EXTERNA_MANUAL",
      status: "REGISTRADA_EXTERNAMENTE",
      service_used: "WSMTXCA",
      cae: body.cae || null,
      cae_expiration_date: body.caeExpirationDate || null,
      arca_observations: body.notes ? { notes: body.notes } : null,
      items: body.items || [],
      vat_breakdown: body.vatBreakdown || [],
      qr_payload: qrPayload,
      created_by: body.requestedBy || "Admin"
    };
    const saveResult = await fiscalRepo2.saveInvoice(externalRecord);
    if (!saveResult.success) {
      return res.status(500).json({ success: false, error: saveResult.error });
    }
    if (body.saleIds && body.saleIds.length > 0) {
      try {
        const supabase = fiscalRepo2.getClient();
        await supabase.from("orders").update({
          is_billed: true,
          invoice_id: invoiceId,
          billing_status: "FACTURADO_EXTERNO",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).in("id", body.saleIds);
      } catch (orderErr) {
        console.warn(`[ARCA External] Advertencia vinculando \xF3rdenes:`, orderErr.message);
      }
    }
    await fiscalRepo2.logAudit({
      action: "EXTERNAL_INVOICE_REGISTERED",
      voucher_info: `Factura ${tipo} ${String(pv).padStart(4, "0")}-${String(number).padStart(8, "0")}`,
      result: "REGISTRADA_EXTERNAMENTE",
      user_id: body.requestedBy || "Admin",
      details: {
        invoiceId,
        pointOfSale: pv,
        invoiceType: tipo,
        invoiceNumber: number,
        total: body.total,
        caeInformado: body.cae || null,
        saleIds: body.saleIds || [],
        warning: warningMessage
      }
    });
    res.json({
      success: true,
      invoice: externalRecord,
      warning: warningMessage,
      message: "Factura externa registrada exitosamente. No se emiti\xF3 ning\xFAn comprobante ante ARCA."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
router.post("/external-invoices", requireRole(["admin", "owner"]), validateExternalInvoicePayload, handleRegisterExternalInvoice);
router.post("/external-invoice", requireRole(["admin", "owner"]), validateExternalInvoicePayload, handleRegisterExternalInvoice);
router.post("/invoices/:id/verify-external", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const fiscalRepo2 = getRepository();
    const inv = await fiscalRepo2.getInvoiceById(req.params.id);
    if (!inv) {
      return res.status(404).json({ success: false, error: "Comprobante no encontrado." });
    }
    const tipo = inv.invoice_type || "B";
    const service = ArcaInvoiceServiceFactory.getService(tipo);
    const arcaData = await service.getInvoice(inv.point_of_sale, inv.invoice_type_code, inv.invoice_number);
    const verifiedBy = req.body.verifiedBy || "Admin";
    if (!arcaData || !arcaData.cae) {
      await fiscalRepo2.logAudit({
        action: "EXTERNAL_INVOICE_VERIFY_ATTEMPT",
        voucher_info: `Factura ${inv.invoice_type} ${String(inv.point_of_sale).padStart(4, "0")}-${String(inv.invoice_number).padStart(8, "0")}`,
        result: "NO_ENCONTRADA_EN_ARCA",
        user_id: verifiedBy,
        details: { invoiceId: inv.id }
      });
      return res.json({
        success: true,
        verified: false,
        currentStatus: inv.status,
        message: "El comprobante no pudo ser verificado en ARCA (no encontrado en el servidor fiscal)."
      });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updateResult = await fiscalRepo2.updateExternalInvoiceVerification(inv.id, {
      status: "VERIFICADA_EN_ARCA",
      cae: arcaData.cae,
      caeExpirationDate: arcaData.caeExpirationDate,
      verifiedAt: now,
      verifiedBy,
      observations: [{ verified: true, arcaResult: arcaData.result, date: arcaData.date, total: arcaData.total }]
    });
    if (!updateResult.success) {
      return res.status(500).json({ success: false, error: updateResult.error?.message || "Error actualizando comprobante." });
    }
    await fiscalRepo2.logAudit({
      action: "EXTERNAL_INVOICE_VERIFIED",
      voucher_info: `Factura ${inv.invoice_type} ${String(inv.point_of_sale).padStart(4, "0")}-${String(inv.invoice_number).padStart(8, "0")}`,
      result: "VERIFICADA_EN_ARCA",
      user_id: verifiedBy,
      details: {
        invoiceId: inv.id,
        cae: arcaData.cae,
        caeExpirationDate: arcaData.caeExpirationDate,
        total: arcaData.total
      }
    });
    res.json({
      success: true,
      verified: true,
      status: "VERIFICADA_EN_ARCA",
      cae: arcaData.cae,
      caeExpirationDate: arcaData.caeExpirationDate,
      verifiedAt: now,
      message: "\u2713 Comprobante verificado y confirmado exitosamente en ARCA."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
router.get("/verify-range", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const pv = parseInt(req.query.pointOfSale, 10) || arcaConfig.defaultPointOfSale;
    const tipo = req.query.invoiceType || "B";
    const tipoCode = VOUCHER_CODES[tipo] || 6;
    const from = parseInt(req.query.from, 10);
    const to = parseInt(req.query.to, 10);
    if (isNaN(from) || isNaN(to) || from <= 0 || to < from) {
      return res.status(400).json({ success: false, error: "Rango num\xE9rico inv\xE1lido (desde debe ser <= hasta y > 0)." });
    }
    if (to - from > 50) {
      return res.status(400).json({ success: false, error: "El rango m\xE1ximo de consulta simult\xE1nea es de 50 comprobantes." });
    }
    const fiscalRepo2 = getRepository();
    const service = ArcaInvoiceServiceFactory.getService(tipo);
    const report = [];
    for (let num = from; num <= to; num++) {
      const local = await fiscalRepo2.findInvoiceByVoucher(pv, tipoCode, num);
      let arcaData = null;
      try {
        arcaData = await service.getInvoice(pv, tipoCode, num);
      } catch {
        arcaData = null;
      }
      const arcaExists = Boolean(arcaData && arcaData.cae);
      const localExists = Boolean(local);
      let obs = "OK";
      if (arcaExists && !localExists) {
        obs = "FALTANTE_LOCAL";
      } else if (!arcaExists && localExists) {
        obs = "SOLO_LOCAL";
      } else if (arcaExists && localExists) {
        if (local?.cae && local.cae !== arcaData?.cae) {
          obs = "DIFERENCIA_DATOS";
        }
      }
      report.push({
        number: num,
        voucherNumber: num,
        arcaExists,
        existsInArca: arcaExists,
        arcaCae: arcaData?.cae,
        arcaVencimiento: arcaData?.caeExpirationDate,
        arcaTotal: arcaData?.total,
        localExists,
        existsInDb: localExists,
        localId: local?.id,
        localOrigin: local?.origin,
        origin: local?.origin,
        localStatus: local?.status,
        status: local?.status,
        localTotal: local ? Number(local.total) : void 0,
        localCae: local?.cae || void 0,
        observation: obs
      });
    }
    res.json({
      success: true,
      pointOfSale: pv,
      invoiceType: tipo,
      from,
      to,
      count: report.length,
      report
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
var arca_routes_default = router;

// server/routes/printer.routes.ts
import { Router as Router2 } from "express";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import fs3 from "fs";
import path3 from "path";
import os3 from "os";
var execAsync = promisify(exec);
var execFileAsync = promisify(execFile);
var router2 = Router2();
router2.get("/printers", async (_req, res) => {
  try {
    if (process.platform === "win32") {
      const psScript = `Get-Printer | Select-Object Name, Type, DriverName, PortName | ConvertTo-Json -Compress`;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript}"`);
      let printers = [];
      if (stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          printers = list.map((p) => ({
            name: p.Name || "",
            type: p.Type || "",
            driverName: p.DriverName || "",
            portName: p.PortName || ""
          }));
        } catch {
          const lines = stdout.split(/\r?\n/).filter(Boolean);
          printers = lines.map((name) => ({ name: name.trim() }));
        }
      }
      return res.json({ success: true, platform: "win32", printers });
    } else {
      const { stdout } = await execAsync("lpstat -p");
      const lines = stdout.split("\n");
      const printers = [];
      for (const line of lines) {
        const match = line.match(/^printer (\S+)/);
        if (match) printers.push({ name: match[1] });
      }
      return res.json({ success: true, platform: process.platform, printers });
    }
  } catch (err) {
    console.error("[PrinterRoutes] Error consultando impresoras:", err.message);
    return res.status(500).json({
      success: false,
      error: `Error al consultar impresoras locales: ${err.message}`,
      printers: []
    });
  }
});
router2.post("/print", async (req, res) => {
  const { printerName, data, format = "text", cut = true } = req.body;
  if (!data) {
    return res.status(400).json({ success: false, error: "Se requieren datos de impresi\xF3n (data)." });
  }
  const tmpDir = os3.tmpdir();
  const filename = `pos_ticket_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`;
  const filePath = path3.join(tmpDir, filename);
  try {
    let buffer;
    if (format === "base64") {
      buffer = Buffer.from(data, "base64");
    } else {
      buffer = Buffer.from(data, "utf-8");
    }
    if (cut && format !== "base64") {
      const cutCmd = Buffer.from("VB\0", "binary");
      buffer = Buffer.concat([buffer, Buffer.from("\n\n\n\n"), cutCmd]);
    }
    await fs3.promises.writeFile(filePath, buffer);
    if (printerName && printerName.trim()) {
      if (!/^[^\x00-\x1F\x7F]{1,200}$/.test(printerName)) {
        throw new Error("Nombre de impresora inv\xE1lido. Formato no soportado.");
      }
    }
    if (process.platform === "win32") {
      const scriptPath = path3.join(__dirname, "../scripts/print.ps1");
      if (printerName && printerName.trim()) {
        await execFileAsync("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-FilePath",
          filePath,
          "-PrinterName",
          printerName
        ]);
      } else {
        await execFileAsync("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-FilePath",
          filePath
        ]);
      }
    } else {
      const args = printerName && printerName.trim() ? ["-d", printerName, filePath] : [filePath];
      await execFileAsync("lp", args);
    }
    setTimeout(() => {
      fs3.unlink(filePath, () => {
      });
    }, 5e3);
    return res.json({
      success: true,
      message: "Trabajo de impresi\xF3n enviado directamente a la impresora.",
      printer: printerName || "Default"
    });
  } catch (err) {
    console.error("[PrinterRoutes] Error enviando trabajo de impresi\xF3n:", err.message);
    try {
      fs3.unlinkSync(filePath);
    } catch {
    }
    return res.status(502).json({
      success: false,
      error: `Error de comunicaci\xF3n con la impresora: ${err.message}`
    });
  }
});
var printer_routes_default = router2;

// server/index.ts
dotenv3.config();
var app = express();
var PORT = process.env.PORT || 5e3;
app.use((req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_URL || "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Idempotency-Key");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/api/arca", arca_routes_default);
app.use("/arca", arca_routes_default);
app.use("/api/printer", requireAuth, requireRole(["admin", "owner", "cashier"]), printer_routes_default);
app.use("/printer", requireAuth, requireRole(["admin", "owner", "cashier"]), printer_routes_default);
app.get(["/api/health", "/health"], (_req, res) => {
  res.json({ status: "ok", service: "Martina Supermercado ARCA Backend", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var isDirectRun = Boolean(
  process.argv[1] && (process.argv[1].endsWith("server/index.ts") || process.argv[1].endsWith("server\\index.ts"))
);
if (isDirectRun && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\u{1F680} Martina Supermercado Backend Fiscal ARCA corriendo en http://localhost:${PORT}`);
  });
}
var index_default = app;
export {
  index_default as default
};
