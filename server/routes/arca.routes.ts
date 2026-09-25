import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { arcaConfig, getSafeFiscalConfig } from '../services/arca/arcaConfig';
import { getCertificateInfo, ensureCertificatesOnDisk } from '../services/arca/arcaAuth';
import { ArcaInvoiceServiceFactory } from '../services/arca/services/ArcaInvoiceServiceFactory';
import {
  VOUCHER_CODES,
  DOCUMENT_TYPE_CODES,
  InvoiceType,
  NormalizedVoucherRequest,
  NormalizedVoucherData,
  RegisterExternalInvoiceRequest,
  VerifyRangeReportItem
} from '../services/arca/arcaTypes';
import {
  determineInvoiceType,
  validateCuit,
  recalculateFiscalInvoice,
  CF_DNI_REQUIRED_LIMIT
} from '../services/arca/arcaTaxRules';
import { translateArcaError } from '../services/arca/arcaErrors';
import { buildArcaQrPayload, buildArcaQrUrl, generateQrDataUrl } from '../services/arca/arcaQr';
import { generateFiscalInvoicePdf } from '../services/arca/arcaPdf';
import { FiscalRepository, FiscalOperationRecord, FiscalInvoiceRecord } from '../db/fiscalRepository';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateAuthorizePayload, validateExternalInvoicePayload } from '../middleware/validation.middleware';

const router = Router();

// SEGURIDAD: Todos los endpoints fiscales de /api/arca requieren token JWT válido y empleado activo
router.use(requireAuth);

// Lock de concurrencia en memoria para numeración correlativa por (Punto de Venta + Tipo de Comprobante)
const numberingLocks = new Map<string, Promise<any>>();

async function acquireNumberingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (numberingLocks.has(key)) {
    await numberingLocks.get(key);
  }
  let resolveLock: () => void;
  const lockPromise = new Promise<void>(res => { resolveLock = res; });
  numberingLocks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    numberingLocks.delete(key);
    resolveLock!();
  }
}

// Repositorio fiscal administrativo exclusivo para backend
const adminFiscalRepo = new FiscalRepository();

function getRepository(): FiscalRepository {
  return adminFiscalRepo;
}

// ─── 1. ESTADO DE CONEXIÓN Y CERTIFICADOS ─────────────────────────
router.get('/status', requireRole(['employee', 'cashier', 'admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const userToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : undefined;
    await ensureCertificatesOnDisk(userToken);

    const service = ArcaInvoiceServiceFactory.getService('B');
    const serverStatus = await service.getServerStatus();
    const certInfo = getCertificateInfo();

    res.json({
      success: true,
      connected: Boolean(serverStatus.appServer && serverStatus.authServer),
      serverStatus,
      certificate: certInfo,
      config: getSafeFiscalConfig()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      connected: false,
      error: err.message,
      config: getSafeFiscalConfig()
    });
  }
});

// ─── 2. CONFIGURACIÓN FISCAL SEGURA ───────────────────────────────
router.get('/config', requireRole(['employee', 'cashier', 'admin', 'owner']), async (_req: Request, res: Response) => {
  try {
    const fiscalRepo = getRepository();
    const fiscalConfig = await fiscalRepo.getFiscalConfig();
    res.json({
      success: true,
      config: {
        ...getSafeFiscalConfig(),
        ...fiscalConfig
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/config', requireRole(['admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const fiscalRepo = getRepository();
    const updated = await fiscalRepo.saveFiscalConfig(req.body);
    await fiscalRepo.logAudit({
      action: 'UPDATE_FISCAL_CONFIG',
      result: 'SUCCESS',
      user_id: (req as any).user?.id || 'admin',
      details: { updatedFields: Object.keys(req.body) }
    });
    res.json({
      success: true,
      config: {
        ...getSafeFiscalConfig(),
        ...updated
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 2.5 UPLOAD DE CERTIFICADOS ───────────────────────────────
router.post('/certificates', requireRole(['admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const { crtContent, keyContent, isProduction } = req.body;

    if (!crtContent || !keyContent) {
      return res.status(400).json({ success: false, error: 'Se requieren los contenidos del certificado (.crt) y la clave privada (.key)' });
    }

    const fs = require('fs');
    const path = require('path');

    const os = require('os');
    const certsDir = process.env.VERCEL
      ? path.join(os.tmpdir(), 'certs')
      : path.join(process.cwd(), 'certs');
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    const prefix = isProduction ? 'prod' : 'homo';

    fs.writeFileSync(path.join(certsDir, `${prefix}.crt`), crtContent, 'utf-8');
    fs.writeFileSync(path.join(certsDir, `${prefix}.key`), keyContent, 'utf-8');

    // Guardar en Supabase settings para persistencia automática entre instancias serverless
    const fiscalRepo = getRepository();
    const userToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : undefined;
    const envKey = `arca_certificates_${isProduction ? 'production' : 'testing'}`;
    await fiscalRepo.getClient(userToken).from('settings').upsert({
      key: envKey,
      branch_id: 'main',
      value: {
        crt: crtContent,
        key: keyContent,
        uploaded_at: new Date().toISOString()
      }
    }, { onConflict: 'key, branch_id' });

    // Registrar auditoría
    await fiscalRepo.logAudit({
      action: 'UPDATE_CERTIFICATES',
      result: 'SUCCESS',
      user_id: (req as any).user?.id || 'admin',
      details: { environment: isProduction ? 'production' : 'testing' }
    });

    res.json({
      success: true,
      message: `Certificados de ${isProduction ? 'producción' : 'homologación'} guardados correctamente.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Error al guardar certificados: ${err.message}` });
  }
});

// ─── 3. PUNTOS DE VENTA ACTIVOS ───────────────────────────────────
router.get('/points-of-sale', requireRole(['employee', 'cashier', 'admin', 'owner']), async (_req: Request, res: Response) => {
  const fiscalRepo = getRepository();
  const fiscalConfig = await fiscalRepo.getFiscalConfig();
  const pvNumber = fiscalConfig.defaultPointOfSale || arcaConfig.defaultPointOfSale;
  res.json({
    success: true,
    pointsOfSale: [
      {
        number: pvNumber,
        description: 'Caja Principal - Facturación Electrónica',
        mode: 'ELECTRONIC',
        environment: arcaConfig.environment,
        isActive: true
      }
    ]
  });
});

// ─── 4. CONSULTA DEL PRÓXIMO NÚMERO DE COMPROBANTE ───────────────
router.get('/last-voucher', requireRole(['employee', 'cashier', 'admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const pv = parseInt(req.query.pointOfSale as string, 10) || arcaConfig.defaultPointOfSale;
    const tipo = (req.query.invoiceType as InvoiceType) || 'B';
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
  } catch (err: any) {
    // Si ARCA no responde, se falla explícitamente sin inventar numeración
    res.status(502).json({
      success: false,
      error: `No se pudo obtener el último comprobante desde ARCA: ${err.message}`
    });
  }
});

// ─── 5. EMISIÓN E IDEMPOTENCIA FISCAL (SOLICITAR AUTORIZACIÓN) ─────
router.post('/authorize', requireRole(['employee', 'cashier', 'admin', 'owner']), validateAuthorizePayload, async (req: Request, res: Response) => {
  const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.idempotencyKey;

  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere una clave de idempotencia (X-Idempotency-Key / UUID v4).'
    });
  }

  const fiscalRepo = getRepository();

  const {
    saleIds = [],
    pointOfSale = arcaConfig.defaultPointOfSale,
    invoiceType = 'B',
    customer,
    items = [],
    pricesIncludeTax = true
  } = req.body;

  const authReq = req as AuthenticatedRequest;
  const requestedBy = authReq.employee?.name || authReq.user?.email || 'Admin';

  // 1. Verificar idempotencia en PostgreSQL
  const existingOp = await fiscalRepo.getOperationByIdempotencyKey(idempotencyKey);
  if (existingOp) {
    if (existingOp.status === 'AUTORIZADA' && existingOp.invoice_id) {
      const existingInv = await fiscalRepo.getInvoiceById(existingOp.invoice_id);
      return res.json({
        success: true,
        status: 'AUTORIZADA',
        message: 'Esta operación ya fue autorizada previamente.',
        invoice: existingInv
      });
    }
    if (existingOp.status === 'EN_PROCESO') {
      return res.status(409).json({
        success: false,
        status: 'EN_PROCESO',
        message: 'La operación está siendo procesada actualmente. Por favor espere.'
      });
    }
    if (existingOp.status === 'ESTADO_DESCONOCIDO') {
      return res.status(409).json({
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        operationId: existingOp.id,
        message: 'La operación previa tuvo un timeout con ARCA. Debe reconciliarse antes de reintentar.'
      });
    }
  }

  // 2. Verificar en PostgreSQL si alguna de las ventas ya está facturada y autorizada
  if (saleIds.length > 0) {
    const alreadyBilled = await fiscalRepo.findAuthorizedInvoicesForSales(saleIds);
    if (alreadyBilled.length > 0) {
      const first = alreadyBilled[0];
      return res.status(400).json({
        success: false,
        error: `La venta ya cuenta con una factura fiscal autorizada (#${first.point_of_sale}-${first.invoice_number}, Tipo ${first.invoice_type}).`
      });
    }
  }

  // 3. Validaciones fiscales del receptor
  if (!customer || !customer.name || !customer.taxCondition) {
    return res.status(400).json({
      success: false,
      error: 'Los datos del cliente receptor (nombre y condición IVA) son obligatorios.'
    });
  }

  const typeDetermination = determineInvoiceType('Responsable Inscripto', customer.taxCondition);
  if (typeDetermination.invoiceType !== invoiceType) {
    return res.status(400).json({
      success: false,
      error: `Incompatibilidad fiscal: ${typeDetermination.reason}`
    });
  }

  if (invoiceType === 'A') {
    const cuitValidation = validateCuit(customer.cuit || customer.documentNumber);
    if (!cuitValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Para emitir Factura A se exige un CUIT válido: ${cuitValidation.error}`
      });
    }
  }

  // 4. Recálculo riguroso de ítems, IVA y totales
  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Debe incluir al menos un producto en el comprobante.'
    });
  }

  const calc = recalculateFiscalInvoice(items, pricesIncludeTax);

  // 4.1. Validación de umbral normativo ARCA para Consumidor Final (Factura B)
  if (invoiceType === 'B' && customer.taxCondition === 'Consumidor Final') {
    if (calc.total >= CF_DNI_REQUIRED_LIMIT) {
      const docNum = (customer.documentNumber || '').trim();
      const docType = customer.documentType;
      if (!docNum || docNum === '0' || docType === 'SIN_IDENTIFICAR') {
        return res.status(400).json({
          success: false,
          error: `Para comprobantes a Consumidor Final que alcancen o superen $${CF_DNI_REQUIRED_LIMIT.toLocaleString('es-AR')}, la normativa de ARCA exige identificar obligatoriamente al comprador con DNI o CUIT.`
        });
      }
    }
  }

  // 5. Registrar operación en estado 'EN_PROCESO' en PostgreSQL
  const opId = `FIO-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ saleIds, pointOfSale, invoiceType, total: calc.total })).digest('hex');

  const newOp: FiscalOperationRecord = {
    id: opId,
    idempotency_key: idempotencyKey,
    operation_type: 'AUTHORIZE_INVOICE',
    sale_ids: saleIds,
    point_of_sale: pointOfSale,
    invoice_type: invoiceType,
    invoice_type_code: VOUCHER_CODES[invoiceType as InvoiceType] || 6,
    status: 'EN_PROCESO',
    request_hash: requestHash,
    requested_by: requestedBy,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const createOpResult = await fiscalRepo.createOperation(newOp);
  if (!createOpResult.success && createOpResult.error?.code === '23505') {
    return res.status(409).json({
      success: false,
      status: 'EN_PROCESO',
      message: 'Solicitud concurrente duplicada detectada en base de datos. Espere la resolución de la operación previa.'
    });
  }

  // 6. Bloqueo de concurrencia y consulta de correlatividad a ARCA
  const lockKey = `${pointOfSale}_${newOp.invoice_type_code}`;

  try {
    const result = await acquireNumberingLock(lockKey, async () => {
      // 6.1. SEGUNDA VERIFICACIÓN DENTRO DEL LOCK (Prevención de condición de carrera):
      // Si otra solicitud concurrente autorizó alguna de estas ventas mientras esperábamos el lock,
      // abortamos inmediatamente sin consultar correlatividad ni llamar a ARCA.
      if (saleIds.length > 0) {
        const lockedCheckBilled = await fiscalRepo.findAuthorizedInvoicesForSales(saleIds);
        if (lockedCheckBilled.length > 0) {
          const firstBilled = lockedCheckBilled[0];
          await fiscalRepo.updateOperation(idempotencyKey, {
            status: 'RECHAZADA',
            error_code: 'SALE_ALREADY_BILLED',
            error_message: `Conflicto de concurrencia: la venta ya fue facturada en comprobante #${firstBilled.point_of_sale}-${firstBilled.invoice_number}`
          });
          const conflictErr: any = new Error(`La venta ya cuenta con una factura fiscal autorizada (#${firstBilled.point_of_sale}-${firstBilled.invoice_number}, Tipo ${firstBilled.invoice_type}).`);
          conflictErr.isSaleConflict = true;
          conflictErr.existingInvoice = firstBilled;
          throw conflictErr;
        }
      }

      const service = ArcaInvoiceServiceFactory.getService(invoiceType as InvoiceType);

      // Obtener último número real directamente de ARCA
      let lastNumber: number;
      try {
        lastNumber = await service.getLastVoucher(pointOfSale, newOp.invoice_type_code);
      } catch (err: any) {
        await fiscalRepo.updateOperation(idempotencyKey, {
          status: 'ERROR_TECNICO',
          error_message: `Fallo al consultar último comprobante a ARCA: ${err.message}`
        });
        throw new Error(`No se pudo obtener la numeración correlativa desde ARCA: ${err.message}. Emisión abortada.`);
      }

      const nextNumber = lastNumber + 1;

      let docTypeCode = DOCUMENT_TYPE_CODES[(customer.documentType as any) || (customer.cuit ? 'CUIT' : 'DNI')] || 96;

      // ARCA WSMTXCA (Facturas A y B con detalle de ítems) no admite código 99 (SIN_IDENTIFICAR).
      // Para Consumidor Final sin DNI informado, la normativa oficial exige tipo de documento 96 (DNI) con número "0".
      if (invoiceType === 'A' || invoiceType === 'B' || [1, 2, 3, 6, 7, 8].includes(newOp.invoice_type_code)) {
        if (docTypeCode === 99 || customer.documentType === 'SIN_IDENTIFICAR') {
          docTypeCode = 96; // DNI
        }
      }

      const cleanDocNumber = (customer.documentNumber || customer.cuit || '0').replace(/\D/g, '') || '0';

      const voucherRequest: NormalizedVoucherRequest = {
        idempotencyKey,
        saleIds,
        pointOfSale,
        invoiceType: invoiceType as InvoiceType,
        invoiceTypeCode: newOp.invoice_type_code,
        voucherNumber: nextNumber,
        date: new Date().toISOString().split('T')[0],
        concept: 1, // 1: Productos
        customer: {
          name: customer.name,
          documentType: (docTypeCode === 96 && cleanDocNumber === '0') ? 'DNI' : (customer.documentType || (customer.cuit ? 'CUIT' : 'DNI')),
          documentTypeCode: docTypeCode,
          documentNumber: cleanDocNumber,
          cuit: customer.cuit ? customer.cuit.replace(/\D/g, '') : undefined,
          taxCondition: customer.taxCondition,
          taxConditionCode: customer.taxConditionCode || (customer.taxCondition === 'Consumidor Final' ? 5 : undefined),
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

      // 7. Persistir proposedVoucherNumber y payload ANTES de invocar ARCA para permitir reconciliación exacta
      await fiscalRepo.updateOperation(idempotencyKey, {
        raw_response: {
          proposedVoucherNumber: nextNumber,
          requestPayload: voucherRequest
        }
      });

      // 8. Invocar autorización ante el Web Service de ARCA
      const arcaResponse = await service.authorizeInvoice(voucherRequest);
      return { arcaResponse, voucherRequest, nextNumber };
    });

    const { arcaResponse, voucherRequest, nextNumber } = result;

    // ─── REGLA ESTRICTA DE VALIDACIÓN DE CAE REAL ──────────────────
    // Un CAE es válido SOLO SI success es true, existe cae, tiene 14 dígitos numéricos
    // y proviene inequívocamente de la respuesta de ARCA
    const isCaeValid = Boolean(
      arcaResponse.success &&
      arcaResponse.cae &&
      /^\d{14}$/.test(arcaResponse.cae.trim())
    );

    if (isCaeValid && arcaResponse.cae) {
      // ─── AUTORIZADA REAL POR ARCA ──────────────────────────────
      const invId = `INV-${Date.now()}-${String(nextNumber).padStart(8, '0')}`;

      // Generar QR Oficial RG 4892/2020 con datos reales
      const qrPayload = buildArcaQrPayload({
        date: voucherRequest.date,
        emitterCuit: arcaConfig.cuit,
        pointOfSale: newOp.point_of_sale,
        invoiceTypeCode: newOp.invoice_type_code,
        invoiceNumber: nextNumber,
        total: voucherRequest.total,
        currency: 'PES',
        customerDocumentTypeCode: voucherRequest.customer.documentTypeCode,
        customerDocumentNumber: voucherRequest.customer.documentNumber,
        cae: arcaResponse.cae,
        status: 'AUTORIZADA'
      });
      const qrUrl = buildArcaQrUrl(qrPayload);
      const qrDataUrl = await generateQrDataUrl(qrUrl);

      // Obtener datos del emisor dinámicos
      const emitterConfig = await fiscalRepo.getFiscalConfig();

      // Generar PDF Fiscal
      const pdfBuffer = await generateFiscalInvoicePdf({
        invoiceType: newOp.invoice_type as InvoiceType,
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
        caeExpirationDate: arcaResponse.caeExpirationDate || ''
      });

      // Persistir Factura Autorizada en PostgreSQL
      const fiscalInvoice: FiscalInvoiceRecord = {
        id: invId,
        branch_id: 'main',
        idempotency_key: idempotencyKey,
        sale_ids: saleIds,
        direction: 'venta',
        invoice_type: newOp.invoice_type,
        invoice_type_code: newOp.invoice_type_code,
        point_of_sale: newOp.point_of_sale,
        invoice_number: nextNumber,
        date: new Date().toISOString(),
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
        currency: 'PES',
        status: 'AUTORIZADA',
        service_used: arcaResponse.serviceUsed as 'WSMTXCA' | 'WSFEv1',
        cae: arcaResponse.cae,
        cae_expiration_date: arcaResponse.caeExpirationDate || '',
        arca_observations: arcaResponse.observations || [],
        items: voucherRequest.items,
        vat_breakdown: voucherRequest.vatBreakdown,
        qr_payload: qrPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: requestedBy
      };

      await fiscalRepo.saveInvoice(fiscalInvoice);

      // Asociar órdenes / ventas en PostgreSQL como facturadas
      if (saleIds && saleIds.length > 0) {
        try {
          const supabase = fiscalRepo.getClient();
          await supabase
            .from('orders')
            .update({
              is_billed: true,
              invoice_id: invId,
              billing_status: 'FACTURADO_AFIP',
              updated_at: new Date().toISOString()
            })
            .in('id', saleIds);
        } catch (orderErr: any) {
          console.warn('[ArcaRoutes] Advertencia vinculando órdenes en authorize:', orderErr.message);
        }
      }

      // Actualizar estado en PostgreSQL
      await fiscalRepo.updateOperation(idempotencyKey, {
        status: 'AUTORIZADA',
        invoice_id: invId,
        raw_response: { cae: arcaResponse.cae, vto: arcaResponse.caeExpirationDate }
      });

      // Registrar auditoría en PostgreSQL
      await fiscalRepo.logAudit({
        action: 'AUTORIZADO',
        voucher_info: `${newOp.invoice_type} ${String(newOp.point_of_sale).padStart(4, '0')}-${String(nextNumber).padStart(8, '0')}`,
        result: 'EXITO',
        user_id: requestedBy,
        details: { cae: arcaResponse.cae, total: voucherRequest.total, sales: saleIds }
      });

      return res.json({
        success: true,
        status: 'AUTORIZADA',
        invoice: {
          ...fiscalInvoice,
          pointOfSale: newOp.point_of_sale,
          invoiceNumber: nextNumber,
          point_of_sale: newOp.point_of_sale,
          invoice_number: nextNumber,
          folio: `${String(newOp.point_of_sale).padStart(4, '0')}-${String(nextNumber).padStart(8, '0')}`,
          type: newOp.invoice_type,
          invoiceType: newOp.invoice_type,
          invoice_type: newOp.invoice_type,
          clientName: voucherRequest.customer.name,
          clientCuit: voucherRequest.customer.cuit || voucherRequest.customer.documentNumber || '',
          subtotal: voucherRequest.subtotalNet,
          subtotalNet: voucherRequest.subtotalNet
        },
        qrDataUrl,
        pdfDownloadUrl: `/api/arca/invoices/${invId}/pdf`
      });
    } else {
      // ─── RECHAZADA POR ARCA ──────────────────────────────────
      const primaryErr = arcaResponse.errors?.[0] || { code: 'ARCA_REJECTED', message: 'Comprobante rechazado por ARCA.' };
      const friendlyErr = translateArcaError(primaryErr.code, primaryErr.message);

      await fiscalRepo.updateOperation(idempotencyKey, {
        status: 'RECHAZADA',
        error_code: primaryErr.code,
        error_message: primaryErr.message,
        raw_response: { errors: arcaResponse.errors, observations: arcaResponse.observations }
      });

      await fiscalRepo.logAudit({
        action: 'RECHAZADO',
        voucher_info: `${newOp.invoice_type} PV ${newOp.point_of_sale}`,
        result: 'RECHAZO',
        user_id: requestedBy,
        details: { errors: arcaResponse.errors, observations: arcaResponse.observations }
      });

      return res.status(422).json({
        success: false,
        status: 'RECHAZADA',
        error: friendlyErr,
        rawErrors: arcaResponse.errors,
        observations: arcaResponse.observations
      });
    }
  } catch (err: any) {
    if (err.isSaleConflict) {
      return res.status(409).json({
        success: false,
        status: 'RECHAZADA',
        error: err.message,
        existingInvoice: err.existingInvoice
      });
    }

    // ─── TIMEOUT O ERROR DE RED (ESTADO DESCONOCIDO) ───────────
    const isTimeout = err.code === 'ECONNABORTED' ||
      err.message?.includes('timeout') ||
      err.message?.includes('ETIMEDOUT') ||
      err.code === 'ECONNRESET' ||
      err.code === 'ESOCKETTIMEDOUT' ||
      err.message?.includes('socket hang up');

    if (isTimeout) {
      await fiscalRepo.updateOperation(idempotencyKey, {
        status: 'ESTADO_DESCONOCIDO',
        error_message: err.message
      });

      await fiscalRepo.logAudit({
        action: 'ESTADO_DESCONOCIDO',
        voucher_info: `${newOp.invoice_type} PV ${newOp.point_of_sale}`,
        result: 'TIMEOUT',
        user_id: requestedBy,
        details: { error: err.message }
      });

      return res.status(504).json({
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        operationId: newOp.id,
        error: translateArcaError('TIMEOUT', err.message),
        message: 'No se recibió respuesta a tiempo de ARCA. No vuelva a presionar facturar; ejecute la reconciliación.'
      });
    }

    await fiscalRepo.updateOperation(idempotencyKey, {
      status: 'ERROR_TECNICO',
      error_message: err.message
    });

    return res.status(502).json({
      success: false,
      status: 'ERROR_TECNICO',
      error: translateArcaError('NETWORK_ERROR', err.message)
    });
  }
});

// ─── 6. PROTOCOLO DE RECONCILIACIÓN DE ESTADO DESCONOCIDO ─────────
async function reconcileFiscalOperation(opId: string, res: Response) {
  const fiscalRepo = getRepository();
  const op = await fiscalRepo.getOperationById(opId);

  if (!op) {
    return res.status(404).json({
      success: false,
      error: 'Operación no encontrada en base de datos.'
    });
  }

  // 1. Verificación previa de idempotencia: si ya existe la factura autorizada, retornarla sin reintentar en ARCA
  const existingInv = await fiscalRepo.getInvoiceByIdempotencyKey(op.idempotency_key);
  if (existingInv && existingInv.status === 'AUTORIZADA') {
    if (op.status !== 'AUTORIZADA') {
      await fiscalRepo.updateOperation(op.idempotency_key, {
        status: 'AUTORIZADA',
        invoice_id: existingInv.id
      });
    }
    return res.json({
      success: true,
      status: 'AUTORIZADA',
      message: 'El comprobante ya fue reconciliado previamente y se encuentra disponible.',
      invoice: existingInv
    });
  }

  if (op.status !== 'ESTADO_DESCONOCIDO' && op.status !== 'EN_PROCESO') {
    return res.json({
      success: true,
      status: op.status,
      message: `La operación no requiere reconciliación (estado actual: ${op.status}).`
    });
  }

  try {
    const service = ArcaInvoiceServiceFactory.getService(op.invoice_type as InvoiceType);

    // Obtener número propuesto previamente persistido y payload original
    const rawData = op.raw_response || {};
    const proposedNumber = rawData.proposedVoucherNumber;
    const requestPayload = rawData.requestPayload;

    const lastNumberInArca = await service.getLastVoucher(op.point_of_sale, op.invoice_type_code);

    // Si ARCA aún no alcanzó el número que intentábamos emitir, definitivamente ARCA nunca procesó la solicitud
    if (proposedNumber && lastNumberInArca < proposedNumber) {
      await fiscalRepo.updateOperation(op.idempotency_key, {
        status: 'ERROR_TECNICO',
        error_message: `Comprobante no registrado en ARCA (Último en ARCA: ${lastNumberInArca}, intentado: ${proposedNumber}). Ventas liberadas de forma segura.`
      });

      return res.json({
        success: true,
        status: 'ERROR_TECNICO',
        message: 'Se confirmó que el comprobante no fue registrado en ARCA. Las ventas han sido liberadas para reintento.'
      });
    }

    if (!proposedNumber) {
      return res.status(400).json({
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        error: 'No se dispone de proposedVoucherNumber registrado para esta operación. No es seguro asumir qué comprobante corresponde a esta venta sin intervención técnica.'
      });
    }

    // Consultar inequívocamente el comprobante propuesto en ARCA
    let voucherData: NormalizedVoucherData | null = null;
    try {
      voucherData = await service.getInvoice(op.point_of_sale, op.invoice_type_code, proposedNumber);
    } catch (consultErr: any) {
      return res.status(502).json({
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        error: `No fue posible verificar el comprobante #${proposedNumber} en ARCA: ${consultErr.message}. La operación permanece en ESTADO_DESCONOCIDO para evitar duplicaciones.`
      });
    }

    if (!voucherData || !voucherData.cae || !/^\d{14}$/.test(voucherData.cae.trim())) {
      return res.status(409).json({
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        error: `ARCA no retornó CAE válido para el comprobante #${proposedNumber}. No es posible asociarlo automáticamente.`
      });
    }

    // Comprobación estricta de coherencia para evitar asociar facturas de otros clientes u operaciones
    if (requestPayload && requestPayload.total !== undefined) {
      const expectedTotal = Number(requestPayload.total);
      const actualTotal = Number(voucherData.total);
      if (Math.abs(expectedTotal - actualTotal) > 0.05) {
        return res.status(409).json({
          success: false,
          status: 'ESTADO_DESCONOCIDO',
          error: `Discrepancia en el importe total: Esperado $${expectedTotal}, en ARCA figura $${actualTotal}. Operación bloqueada preventivamente.`
        });
      }
    }

    if (requestPayload && requestPayload.customer?.documentNumber && requestPayload.customer?.documentNumber !== '0') {
      const cleanReqDoc = String(requestPayload.customer.documentNumber).replace(/\D/g, '');
      const cleanArcaDoc = String(voucherData.documentNumber || '').replace(/\D/g, '');
      if (cleanReqDoc && cleanArcaDoc && cleanReqDoc !== cleanArcaDoc) {
        return res.status(409).json({
          success: false,
          status: 'ESTADO_DESCONOCIDO',
          error: `Discrepancia en receptor: CUIT/DNI esperado ${cleanReqDoc}, en ARCA figura ${cleanArcaDoc}. Operación bloqueada preventivamente.`
        });
      }
    }

    // Coincidencia inequívoca confirmada: Crear factura fiscal real en Supabase
    const invId = `INV-${Date.now()}-${String(proposedNumber).padStart(8, '0')}`;
    const qrPayload = buildArcaQrPayload({
      date: voucherData.date || new Date().toISOString().split('T')[0],
      emitterCuit: arcaConfig.cuit,
      pointOfSale: op.point_of_sale,
      invoiceTypeCode: op.invoice_type_code,
      invoiceNumber: proposedNumber,
      total: voucherData.total,
      currency: 'PES',
      customerDocumentTypeCode: requestPayload?.customer?.documentTypeCode || 96,
      customerDocumentNumber: voucherData.documentNumber || requestPayload?.customer?.documentNumber || '0',
      cae: voucherData.cae,
      status: 'AUTORIZADA'
    });

    const calculatedSubtotal = Number(requestPayload?.subtotalNet ?? (voucherData.total / 1.21));
    const calculatedTaxes = Number(requestPayload?.taxes ?? (voucherData.total - calculatedSubtotal));

    const invoiceRecord: FiscalInvoiceRecord = {
      id: invId,
      branch_id: 'main',
      idempotency_key: op.idempotency_key,
      sale_ids: op.sale_ids || [],
      direction: 'venta',
      invoice_type: op.invoice_type,
      invoice_type_code: op.invoice_type_code,
      point_of_sale: op.point_of_sale,
      invoice_number: proposedNumber,
      date: voucherData.date || new Date().toISOString().split('T')[0],
      customer_id: requestPayload?.customer?.id || null,
      customer_name: requestPayload?.customer?.name || 'Consumidor Final',
      customer_document_type: requestPayload?.customer?.documentType || 'DNI',
      customer_document_number: voucherData.documentNumber || requestPayload?.customer?.documentNumber || '0',
      customer_cuit: requestPayload?.customer?.cuit || null,
      customer_tax_condition: requestPayload?.customer?.taxCondition || 'Consumidor Final',
      customer_address: requestPayload?.customer?.address || null,
      subtotal_net: calculatedSubtotal,
      taxes: calculatedTaxes,
      total: Number(voucherData.total),
      currency: 'PES',
      service_used: op.invoice_type === 'C' ? 'WSFEv1' : 'WSMTXCA',
      cae: voucherData.cae,
      cae_expiration_date: voucherData.caeExpirationDate,
      status: 'AUTORIZADA',
      qr_payload: qrPayload,
      items: requestPayload?.items || [],
      vat_breakdown: requestPayload?.vatBreakdown || [],
      created_by: op.requested_by || 'Sistema (Reconciliación)'
    };

    // 1. Guardar factura definitiva
    await fiscalRepo.saveInvoice(invoiceRecord);

    // 2. Actualizar operación a AUTORIZADA
    await fiscalRepo.updateOperation(op.idempotency_key, {
      status: 'AUTORIZADA',
      invoice_id: invId,
      raw_response: voucherData
    });

    // 3. Bloquear ventas
    if (op.sale_ids && op.sale_ids.length > 0) {
      try {
        const supabase = fiscalRepo.getClient();
        await supabase
          .from('orders')
          .update({
            is_billed: true,
            invoice_id: invId,
            billing_status: 'FACTURADO_AFIP',
            updated_at: new Date().toISOString()
          })
          .in('id', op.sale_ids);
      } catch (errLock: any) {
        console.warn('[ArcaRoutes] Advertencia marcando órdenes como facturadas:', errLock.message);
      }
    }

    return res.json({
      success: true,
      status: 'AUTORIZADA',
      message: 'El comprobante fue verificado, recuperado de ARCA y registrado exitosamente en el sistema.',
      invoice: invoiceRecord
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      error: `Error durante la reconciliación con ARCA: ${err.message}`
    });
  }
}

router.post('/operations/:id/reconcile', requireRole(['admin', 'owner', 'super_admin']), async (req: Request, res: Response) => {
  return reconcileFiscalOperation(req.params.id, res);
});

router.post('/reconcile-unknown', requireRole(['admin', 'owner', 'super_admin']), async (req: Request, res: Response) => {
  const opId = req.body.operationId || req.body.id || req.body.operation_id;
  if (!opId || typeof opId !== 'string') {
    return res.status(400).json({ success: false, error: 'Se requiere "operationId" en el cuerpo de la petición.' });
  }
  return reconcileFiscalOperation(opId, res);
});

// ─── 7. DESCARGA Y STREAMING DE PDF FISCAL ─────────────────────────
router.get('/invoices/:id/pdf', async (req: Request, res: Response) => {
  const fiscalRepo = getRepository();
  const inv = await fiscalRepo.getInvoiceById(req.params.id);

  if (!inv) {
    return res.status(404).send('Factura no encontrada.');
  }

  if (inv.status !== 'AUTORIZADA' || !inv.cae) {
    return res.status(400).send('No se puede generar PDF fiscal para un comprobante no autorizado.');
  }

  try {
    const emitterConfig = await fiscalRepo.getFiscalConfig();
    const pdfBuffer = await generateFiscalInvoicePdf({
      invoiceType: inv.invoice_type as InvoiceType,
      invoiceTypeCode: inv.invoice_type_code,
      pointOfSale: inv.point_of_sale,
      invoiceNumber: inv.invoice_number,
      date: inv.date.split('T')[0],
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
        cuit: inv.customer_cuit || undefined,
        taxCondition: inv.customer_tax_condition,
        address: inv.customer_address || undefined
      },
      items: inv.items || [],
      subtotalNet: Number(inv.subtotal_net),
      taxes: Number(inv.taxes),
      total: Number(inv.total),
      cae: inv.cae,
      caeExpirationDate: inv.cae_expiration_date
    });

    const filename = `Factura_${inv.invoice_type}_${String(inv.point_of_sale).padStart(4, '0')}-${String(inv.invoice_number).padStart(8, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).send(`Error generando PDF fiscal: ${err.message}`);
  }
});

// ─── 8. LISTADO DE FACTURAS FISCALES EMITIDAS ─────────────────────
router.get('/invoices', requireRole(['employee', 'cashier', 'admin', 'owner']), async (req: Request, res: Response) => {
  const fiscalRepo = getRepository();
  const invoices = await fiscalRepo.listInvoices();

  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      let qrDataUrl = (inv as any).qrDataUrl;
      // El QR debe generarse ÚNICAMENTE para comprobantes efectivamente autorizados con CAE real
      if (!qrDataUrl && inv.status === 'AUTORIZADA' && inv.cae && inv.qr_payload) {
        try {
          const qrUrl = buildArcaQrUrl(inv.qr_payload);
          qrDataUrl = await generateQrDataUrl(qrUrl);
        } catch (err) { console.error('Error generando QR de ARCA:', err); }
      }
      return {
        ...inv,
        pointOfSale: inv.point_of_sale,
        invoiceNumber: inv.invoice_number,
        point_of_sale: inv.point_of_sale,
        invoice_number: inv.invoice_number,
        folio: `${String(inv.point_of_sale || 1).padStart(4, '0')}-${String(inv.invoice_number || 1).padStart(8, '0')}`,
        type: inv.invoice_type,
        invoiceType: inv.invoice_type,
        invoice_type: inv.invoice_type,
        clientName: inv.customer_name || 'Consumidor Final',
        clientCuit: inv.customer_cuit || inv.customer_document_number || 'CF',
        subtotal: inv.subtotal_net,
        subtotalNet: inv.subtotal_net,
        qrDataUrl
      };
    })
  );

  res.json({ success: true, invoices: enriched });
});

// ─── 9. HISTORIAL DE AUDITORÍA ────────────────────────────────────
router.get('/audit-logs', requireRole(['admin', 'owner']), async (req: Request, res: Response) => {
  const fiscalRepo = getRepository();
  const logs = await fiscalRepo.listAuditLogs();
  res.json({ success: true, logs });
});

// ─── 10. CONSULTA PUNTUAL DE COMPROBANTE EN ARCA (SOLO LECTURA) ───
router.get('/voucher-info', requireRole(['employee', 'cashier', 'admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const pv = parseInt(req.query.pointOfSale as string, 10) || arcaConfig.defaultPointOfSale;
    const tipo = (req.query.invoiceType as InvoiceType) || 'B';
    const tipoCode = parseInt(req.query.invoiceTypeCode as string, 10) || VOUCHER_CODES[tipo] || 6;
    const number = parseInt(req.query.voucherNumber as string, 10);

    if (!number || isNaN(number) || number <= 0) {
      return res.status(400).json({ success: false, error: 'Número de comprobante obligatorio y mayor a cero.' });
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
        message: 'Comprobante no encontrado en ARCA.'
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 11. REGISTRO DE FACTURA EXTERNA / MANUAL ──────────────────────
async function handleRegisterExternalInvoice(req: Request, res: Response) {
  try {
    const body = req.body as RegisterExternalInvoiceRequest;
    const pv = body.pointOfSale || arcaConfig.defaultPointOfSale;
    const tipo = body.invoiceType || 'B';
    const tipoCode = VOUCHER_CODES[tipo] || 6;
    const number = body.invoiceNumber;

    if (!number || isNaN(number) || number <= 0) {
      return res.status(400).json({ success: false, error: 'Número de comprobante obligatorio y mayor a cero.' });
    }

    if (!body.customer || !body.customer.name) {
      return res.status(400).json({ success: false, error: 'Datos del cliente/receptor obligatorios.' });
    }

    if (body.total === undefined || body.total === null || isNaN(body.total)) {
      return res.status(400).json({ success: false, error: 'Importe total obligatorio.' });
    }

    const fiscalRepo = getRepository();

    // REGLA 11 & 12: Bloquear si ya existe (pointOfSale, invoiceTypeCode, invoiceNumber)
    const existing = await fiscalRepo.findInvoiceByVoucher(pv, tipoCode, number);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Ya existe un comprobante registrado para este Punto de Venta, Tipo y Número.',
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

    // Comprobar contra ARCA el último comprobante emitido oficialmente para advertencia informativa
    let warningMessage: string | undefined;
    try {
      const service = ArcaInvoiceServiceFactory.getService(tipo as InvoiceType);
      const lastOfficialNumber = await service.getLastVoucher(pv, tipoCode);
      if (lastOfficialNumber > 0 && number > lastOfficialNumber + 1) {
        warningMessage = `ADVERTENCIA: ARCA informa que el último comprobante registrado es el Nº ${lastOfficialNumber}. Está registrando externamente el Nº ${number}, lo que generará un salto de correlatividad si no existen los comprobantes intermedios.`;
      }
    } catch {
      // Si falla la consulta informativa contra ARCA, no bloquear el registro
    }

    const invoiceId = `INV-EXT-${Date.now()}-${String(number).padStart(8, '0')}`;
    const dateStr = body.date || new Date().toISOString().split('T')[0];

    const qrPayload = body.cae ? buildArcaQrPayload({
      date: dateStr,
      emitterCuit: arcaConfig.cuit,
      pointOfSale: pv,
      invoiceTypeCode: tipoCode,
      invoiceNumber: number,
      total: body.total,
      currency: 'PES',
      customerDocumentTypeCode: (body.customer as any).documentTypeCode || 99,
      customerDocumentNumber: body.customer.documentNumber || '0',
      cae: body.cae,
      status: 'REGISTRADA_EXTERNAMENTE'
    }) : null;

    const externalRecord: FiscalInvoiceRecord = {
      id: invoiceId,
      branch_id: 'main',
      idempotency_key: `ext-${pv}-${tipoCode}-${number}-${Date.now()}`,
      sale_ids: body.saleIds || [],
      direction: 'venta',
      invoice_type: tipo,
      invoice_type_code: tipoCode,
      point_of_sale: pv,
      invoice_number: number,
      date: dateStr,
      customer_id: (body.customer as any).id || null,
      customer_name: body.customer.name,
      customer_document_type: body.customer.documentType || 'DNI',
      customer_document_number: body.customer.documentNumber || '0',
      customer_cuit: body.customer.cuit || null,
      customer_tax_condition: body.customer.taxCondition || 'Consumidor Final',
      customer_address: body.customer.address || null,
      subtotal_net: body.subtotalNet || (body.total / 1.21),
      taxes: body.taxes || (body.total - (body.total / 1.21)),
      total: body.total,
      currency: 'PES',
      origin: ((body as any).origin || 'EXTERNA_MANUAL') as any,
      status: 'REGISTRADA_EXTERNAMENTE',
      service_used: 'WSMTXCA',
      cae: body.cae || null,
      cae_expiration_date: body.caeExpirationDate || null,
      arca_observations: body.notes ? { notes: body.notes } : null,
      items: body.items || [],
      vat_breakdown: (body as any).vatBreakdown || [],
      qr_payload: qrPayload,
      created_by: body.requestedBy || 'Admin'
    };

    const saveResult = await fiscalRepo.saveInvoice(externalRecord);
    if (!saveResult.success) {
      return res.status(500).json({ success: false, error: saveResult.error });
    }

    if (body.saleIds && body.saleIds.length > 0) {
      try {
        const supabase = fiscalRepo.getClient();
        await supabase
          .from('orders')
          .update({
            is_billed: true,
            invoice_id: invoiceId,
            billing_status: 'FACTURADO_EXTERNO',
            updated_at: new Date().toISOString()
          })
          .in('id', body.saleIds);
      } catch (orderErr: any) {
        console.warn(`[ARCA External] Advertencia vinculando órdenes:`, orderErr.message);
      }
    }

    await fiscalRepo.logAudit({
      action: 'EXTERNAL_INVOICE_REGISTERED',
      voucher_info: `Factura ${tipo} ${String(pv).padStart(4, '0')}-${String(number).padStart(8, '0')}`,
      result: 'REGISTRADA_EXTERNAMENTE',
      user_id: body.requestedBy || 'Admin',
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
      message: 'Factura externa registrada exitosamente. No se emitió ningún comprobante ante ARCA.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

router.post('/external-invoices', requireRole(['admin', 'owner']), validateExternalInvoicePayload, handleRegisterExternalInvoice);
router.post('/external-invoice', requireRole(['admin', 'owner']), validateExternalInvoicePayload, handleRegisterExternalInvoice);

// ─── 12. VERIFICACIÓN Y RECONCILIACIÓN EN ARCA (SOLO LECTURA) ─────
router.post('/invoices/:id/verify-external', requireRole(['admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const fiscalRepo = getRepository();
    const inv = await fiscalRepo.getInvoiceById(req.params.id);

    if (!inv) {
      return res.status(404).json({ success: false, error: 'Comprobante no encontrado.' });
    }

    const tipo = (inv.invoice_type as InvoiceType) || 'B';
    const service = ArcaInvoiceServiceFactory.getService(tipo);

    // REGLA 15: Solo lectura a ARCA
    const arcaData = await service.getInvoice(inv.point_of_sale, inv.invoice_type_code, inv.invoice_number);
    const verifiedBy = req.body.verifiedBy || 'Admin';

    if (!arcaData || !arcaData.cae) {
      // REGLA 6: Mantener REGISTRADA_EXTERNAMENTE, NO inventar datos
      await fiscalRepo.logAudit({
        action: 'EXTERNAL_INVOICE_VERIFY_ATTEMPT',
        voucher_info: `Factura ${inv.invoice_type} ${String(inv.point_of_sale).padStart(4, '0')}-${String(inv.invoice_number).padStart(8, '0')}`,
        result: 'NO_ENCONTRADA_EN_ARCA',
        user_id: verifiedBy,
        details: { invoiceId: inv.id }
      });

      return res.json({
        success: true,
        verified: false,
        currentStatus: inv.status,
        message: 'El comprobante no pudo ser verificado en ARCA (no encontrado en el servidor fiscal).'
      });
    }

    // REGLA 7: Actualizar datos oficiales y pasar a VERIFICADA_EN_ARCA
    const now = new Date().toISOString();
    const updateResult = await fiscalRepo.updateExternalInvoiceVerification(inv.id, {
      status: 'VERIFICADA_EN_ARCA',
      cae: arcaData.cae,
      caeExpirationDate: arcaData.caeExpirationDate,
      verifiedAt: now,
      verifiedBy,
      observations: [{ verified: true, arcaResult: arcaData.result, date: arcaData.date, total: arcaData.total }]
    });

    if (!updateResult.success) {
      return res.status(500).json({ success: false, error: updateResult.error?.message || 'Error actualizando comprobante.' });
    }

    await fiscalRepo.logAudit({
      action: 'EXTERNAL_INVOICE_VERIFIED',
      voucher_info: `Factura ${inv.invoice_type} ${String(inv.point_of_sale).padStart(4, '0')}-${String(inv.invoice_number).padStart(8, '0')}`,
      result: 'VERIFICADA_EN_ARCA',
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
      status: 'VERIFICADA_EN_ARCA',
      cae: arcaData.cae,
      caeExpirationDate: arcaData.caeExpirationDate,
      verifiedAt: now,
      message: '✓ Comprobante verificado y confirmado exitosamente en ARCA.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 13. AUDITORÍA Y VERIFICACIÓN DE RANGO (SOLO LECTURA) ─────────
router.get('/verify-range', requireRole(['admin', 'owner']), async (req: Request, res: Response) => {
  try {
    const pv = parseInt(req.query.pointOfSale as string, 10) || arcaConfig.defaultPointOfSale;
    const tipo = (req.query.invoiceType as InvoiceType) || 'B';
    const tipoCode = VOUCHER_CODES[tipo] || 6;
    const from = parseInt(req.query.from as string, 10);
    const to = parseInt(req.query.to as string, 10);

    if (isNaN(from) || isNaN(to) || from <= 0 || to < from) {
      return res.status(400).json({ success: false, error: 'Rango numérico inválido (desde debe ser <= hasta y > 0).' });
    }

    if (to - from > 50) {
      return res.status(400).json({ success: false, error: 'El rango máximo de consulta simultánea es de 50 comprobantes.' });
    }

    const fiscalRepo = getRepository();
    const service = ArcaInvoiceServiceFactory.getService(tipo);
    const report: VerifyRangeReportItem[] = [];

    for (let num = from; num <= to; num++) {
      const local = await fiscalRepo.findInvoiceByVoucher(pv, tipoCode, num);
      let arcaData: NormalizedVoucherData | null = null;
      try {
        arcaData = await service.getInvoice(pv, tipoCode, num);
      } catch {
        arcaData = null;
      }

      const arcaExists = Boolean(arcaData && arcaData.cae);
      const localExists = Boolean(local);

      let obs: VerifyRangeReportItem['observation'] = 'OK';
      if (arcaExists && !localExists) {
        obs = 'FALTANTE_LOCAL';
      } else if (!arcaExists && localExists) {
        obs = 'SOLO_LOCAL';
      } else if (arcaExists && localExists) {
        if (local?.cae && local.cae !== arcaData?.cae) {
          obs = 'DIFERENCIA_DATOS';
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
        localTotal: local ? Number(local.total) : undefined,
        localCae: local?.cae || undefined,
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
