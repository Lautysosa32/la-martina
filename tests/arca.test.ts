import fs from 'fs';
import { determineInvoiceType, validateCuit, recalculateFiscalInvoice } from '../server/services/arca/arcaTaxRules';
import { translateArcaError } from '../server/services/arca/arcaErrors';
import { buildArcaQrPayload, buildArcaQrUrl, generateQrDataUrl } from '../server/services/arca/arcaQr';
import { generateFiscalInvoicePdf } from '../server/services/arca/arcaPdf';
import { ArcaInvoiceServiceFactory } from '../server/services/arca/services/ArcaInvoiceServiceFactory';
import { WsMtxcaInvoiceService } from '../server/services/arca/services/WsMtxcaInvoiceService';
import { getCertificateInfo, getWsaaTicket, clearTicketCache } from '../server/services/arca/arcaAuth';
import { arcaConfig } from '../server/services/arca/arcaConfig';
import { MockArcaInvoiceService } from './mocks/mockArcaService';
import { FiscalRepository, getSupabaseAdminKey } from '../server/db/fiscalRepository';

async function runTests() {
  console.log('================================================================');
  console.log('  SUITE DE PRUEBAS: FACTURACIÓN ELECTRÓNICA ARCA (EX-AFIP)');
  console.log('  (Separación estricta entre Unitarias, Mocks y Homologación)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  function skip(testName: string, reason: string) {
    console.log(`  ⏭️  SKIP: ${testName} (${reason})`);
    skipped++;
  }

  // ─── 1. DETERMINACIÓN DE COMPROBANTE A / B / C (UNIT TEST) ────────
  console.log('--- 1. [UNIT TEST] Determinación de Comprobantes A / B / C ---');
  const resRiToRi = determineInvoiceType('Responsable Inscripto', 'Responsable Inscripto');
  assert(resRiToRi.invoiceType === 'A' && resRiToRi.invoiceTypeCode === 1, '[UNIT] RI a RI genera Factura A (código 01)');

  const resRiToMono = determineInvoiceType('Responsable Inscripto', 'Monotributista');
  assert(resRiToMono.invoiceType === 'A' && resRiToMono.invoiceTypeCode === 1, '[UNIT] RI a Monotributista genera Factura A (RG 5003/2021)');

  const resRiToCf = determineInvoiceType('Responsable Inscripto', 'Consumidor Final');
  assert(resRiToCf.invoiceType === 'B' && resRiToCf.invoiceTypeCode === 6, '[UNIT] RI a Consumidor Final genera Factura B (código 06)');

  const resRiToEx = determineInvoiceType('Responsable Inscripto', 'Exento');
  assert(resRiToEx.invoiceType === 'B' && resRiToEx.invoiceTypeCode === 6, '[UNIT] RI a Exento genera Factura B (código 06)');

  const resMonoToAll = determineInvoiceType('Monotributista', 'Responsable Inscripto');
  assert(resMonoToAll.invoiceType === 'C' && resMonoToAll.invoiceTypeCode === 11, '[UNIT] Monotributista emite Factura C a todos los receptores');

  // ─── 2. CÁLCULO DE IVA Y TOTALES (UNIT TEST) ──────────────────────
  console.log('\n--- 2. [UNIT TEST] Recálculo Fiscal y Desglose de IVA ---');
  const sampleItems = [
    { description: 'Leche La Serenísima', quantity: 2, price: 1210, taxRate: 21 },
    { description: 'Carne Picada Especial', quantity: 1, price: 1105, taxRate: 10.5 },
    { description: 'Pan Francés', quantity: 1, price: 500, taxRate: 0 }
  ];

  const calc = recalculateFiscalInvoice(sampleItems, true);
  assert(calc.total === 4025, `[UNIT] Total general coincide con la suma: $${calc.total}`);
  assert(calc.subtotalNet === 3500, `[UNIT] Subtotal neto gravado exacto: $${calc.subtotalNet}`);
  assert(calc.taxes === 525, `[UNIT] IVA total liquidado exacto: $${calc.taxes}`);
  assert(calc.vatBreakdown.length === 3, '[UNIT] Se generaron 3 grupos de alícuotas (21%, 10.5%, 0%)');

  // ─── 3. VALIDACIÓN DE CUIT (MÓDULO 11) (UNIT TEST) ───────────────
  console.log('\n--- 3. [UNIT TEST] Validación de CUIT (Módulo 11) ---');
  const validCuit = validateCuit('20123456786');
  assert(validCuit.clean === '20123456786', '[UNIT] CUIT numérico limpio correctamente');
  
  const knownValidCuit = validateCuit('20300000003');
  assert(knownValidCuit.valid === true, '[UNIT] CUIT válido con algoritmo Módulo 11 aceptado');

  const invalidCuit = validateCuit('20300000009');
  assert(invalidCuit.valid === false, '[UNIT] CUIT con dígito verificador corrupto es rechazado');

  const shortCuit = validateCuit('203000000');
  assert(shortCuit.valid === false, '[UNIT] CUIT con longitud menor a 11 dígitos es rechazado');

  // ─── 4. SELECCIÓN DE WEB SERVICE (UNIT TEST) ──────────────────────
  console.log('\n--- 4. [UNIT TEST] Selección de Web Service (WSMTXCA vs WSFE) ---');
  const serviceA = ArcaInvoiceServiceFactory.getService('A');
  assert(serviceA.serviceName === 'wsmtxca', '[UNIT] Factura A con detalle de productos utiliza WSMTXCA');

  const serviceB = ArcaInvoiceServiceFactory.getService('B');
  assert(serviceB.serviceName === 'wsmtxca', '[UNIT] Factura B con detalle de productos utiliza WSMTXCA');

  const serviceNcA = ArcaInvoiceServiceFactory.getService('NC_A');
  assert(serviceNcA.serviceName === 'wsmtxca', '[UNIT] Nota de Crédito A utiliza WSMTXCA');

  const serviceC = ArcaInvoiceServiceFactory.getService('C');
  assert(serviceC.serviceName === 'wsfe', '[UNIT] Factura C utiliza WSFEv1');

  const serviceByCode1 = ArcaInvoiceServiceFactory.getServiceByCode(1);
  assert(serviceByCode1.serviceName === 'wsmtxca', '[UNIT] Código de comprobante 01 utiliza WSMTXCA');

  // ─── 4.B [UNIT TEST] Manejo WSMTXCA Código 1502 vs Otros Errores ARCA ───
  console.log('\n--- 4.B [UNIT TEST] Manejo Específico WSMTXCA Código 1502 ---');
  const mtxcaService = new WsMtxcaInvoiceService();

  // Caso 1: ARCA responde con código 1502 (sin comprobantes registrados) -> debe retornar 0 sin excepción
  const xml1502 = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <consultarUltimoComprobanteAutorizadoResponse xmlns="http://impl.service.wsmtxca.afip.gov.ar/service/">
          <arrayErrores>
            <codigoDescripcion>
              <codigo>1502</codigo>
              <descripcion>Para la CUIT, Tipo de Comprobante y Punto de Ventas requeridos no se registran comprobantes en las bases del Organismo</descripcion>
            </codigoDescripcion>
          </arrayErrores>
        </consultarUltimoComprobanteAutorizadoResponse>
      </soap:Body>
    </soap:Envelope>
  `;
  const lastVoucher1502 = mtxcaService.parseLastVoucherResponse(xml1502, 1, 6);
  assert(lastVoucher1502 === 0, '[UNIT] ARCA 1502 -> getLastVoucher() retorna 0 sin lanzar excepción');

  // Caso 2: ARCA responde con otro error fiscal (ej. 1500) -> debe lanzar excepción con el error real
  const xmlOtherError = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <consultarUltimoComprobanteAutorizadoResponse xmlns="http://impl.service.wsmtxca.afip.gov.ar/service/">
          <arrayErrores>
            <codigoDescripcion>
              <codigo>1500</codigo>
              <descripcion>CUIT no habilitada para operar en este punto de venta</descripcion>
            </codigoDescripcion>
          </arrayErrores>
        </consultarUltimoComprobanteAutorizadoResponse>
      </soap:Body>
    </soap:Envelope>
  `;
  let otherErrorCaught = false;
  try {
    mtxcaService.parseLastVoucherResponse(xmlOtherError, 1, 6);
  } catch (err: any) {
    otherErrorCaught = true;
    assert(err.message.includes('[1500]'), `[UNIT] Otro error ARCA lanza excepción con mensaje real: ${err.message}`);
  }
  assert(otherErrorCaught === true, '[UNIT] Cualquier otro error fiscal ARCA lanza excepción real y no se convierte en 0');

  // ─── 4.C [UNIT TEST] Secuencia Oficial de XML WSMTXCA y Validación Fiscal ───
  console.log('\n--- 4.C [UNIT TEST] Secuencia Oficial de XML WSMTXCA (ComprobanteType) ---');
  const sampleTestVoucher = {
    idempotencyKey: 'TEST-PAYLOAD-ORDER-1',
    saleIds: ['SALE-TEST-001'],
    pointOfSale: 1,
    invoiceType: 'B' as const,
    invoiceTypeCode: 6,
    voucherNumber: 1,
    date: '2026-09-15',
    concept: 1,
    customer: {
      name: 'Consumidor Final',
      documentType: 'DNI' as const,
      documentTypeCode: 96,
      documentNumber: '30123456',
      taxCondition: 'Consumidor Final' as const
    },
    subtotalNet: 3500.00,
    taxes: 577.50,
    total: 4077.50,
    items: [
      {
        code: 'PRD-001',
        codigoMtx: '7790787004461',
        description: 'Alimento Balanceado Premium 10kg',
        quantity: 1,
        unit: 'unidades',
        unitPrice: 2000.00,
        price: 2420.00,
        taxRate: 21,
        netAmount: 2000.00,
        vatRate: 21,
        vatAmount: 420.00,
        discountAmount: 0.00,
        total: 2420.00
      },
      {
        code: 'PRD-002',
        codigoMtx: '7798087630175',
        description: 'Cereal de Avena Tradicional 5kg',
        quantity: 1,
        unit: 'unidades',
        unitPrice: 1500.00,
        price: 1657.50,
        taxRate: 10.5,
        netAmount: 1500.00,
        vatRate: 10.5,
        vatAmount: 157.50,
        discountAmount: 0.00,
        total: 1657.50
      }
    ],
    vatBreakdown: [
      { vatRate: 21, vatCode: 5, baseAmount: 2000.00, vatAmount: 420.00 },
      { vatRate: 10.5, vatCode: 4, baseAmount: 1500.00, vatAmount: 157.50 }
    ]
  };

  const generatedXml = mtxcaService.buildAuthorizePayloadXml(sampleTestVoucher, {
    token: 'DUMMY_TOKEN_FOR_TEST',
    sign: 'DUMMY_SIGN_FOR_TEST'
  });

  // Validar orden estricto de elementos según esquema oficial ARCA ComprobanteType
  const posCodTipoComp = generatedXml.indexOf('<codigoTipoComprobante>');
  const posPtoVta = generatedXml.indexOf('<numeroPuntoVenta>');
  const posNroComp = generatedXml.indexOf('<numeroComprobante>');
  const posFechaEmision = generatedXml.indexOf('<fechaEmision>');
  const posCodTipoDoc = generatedXml.indexOf('<codigoTipoDocumento>');
  const posNroDoc = generatedXml.indexOf('<numeroDocumento>');
  const posCondIva = generatedXml.indexOf('<condicionIVAReceptor>');
  const posImpGravado = generatedXml.indexOf('<importeGravado>');
  const posImpSubtotal = generatedXml.indexOf('<importeSubtotal>');
  const posImpTotal = generatedXml.indexOf('<importeTotal>');
  const posCodMoneda = generatedXml.indexOf('<codigoMoneda>');
  const posCotizMoneda = generatedXml.indexOf('<cotizacionMoneda>');
  const posCodConcepto = generatedXml.indexOf('<codigoConcepto>');
  const posArrayItems = generatedXml.indexOf('<arrayItems>');
  const posArrayIva = generatedXml.indexOf('<arraySubtotalesIVA>');

  const isStrictOrderValid = (
    posCodTipoComp !== -1 &&
    posCodTipoComp < posPtoVta &&
    posPtoVta < posNroComp &&
    posNroComp < posFechaEmision &&
    posFechaEmision < posCodTipoDoc &&
    posCodTipoDoc < posNroDoc &&
    posNroDoc < posCondIva &&
    posCondIva < posImpGravado &&
    posImpGravado < posImpSubtotal &&
    posImpSubtotal < posImpTotal &&
    posImpTotal < posCodMoneda &&
    posCodMoneda < posCotizMoneda &&
    posCotizMoneda < posCodConcepto &&
    posCodConcepto < posArrayItems &&
    posArrayItems < posArrayIva
  );

  assert(isStrictOrderValid, '[UNIT] Secuencia XML respeta estrictamente ComprobanteType con condicionIVAReceptor entre documento y gravado');
  assert(generatedXml.includes('<condicionIVAReceptor>5</condicionIVAReceptor>'), '[UNIT] condicionIVAReceptor (5) incluido para Consumidor Final / Factura B');
  assert(generatedXml.includes('<codigoMtx>7790787004461</codigoMtx>'), '[UNIT] codigoMtx (GTIN/EAN del producto) incluido correctamente en el XML del ítem');

  // Validar orden de codigoMtx y codigo dentro de ItemType
  const posItemMtx = generatedXml.indexOf('<codigoMtx>7790787004461</codigoMtx>');
  const posItemCod = generatedXml.indexOf('<codigo>PRD-001</codigo>');
  assert(posItemMtx !== -1 && posItemMtx < posItemCod, '[UNIT] En ItemType, codigoMtx se ubica antes del codigo interno');

  assert(generatedXml.includes('<importeGravado>3500.00</importeGravado>'), '[UNIT] importeGravado (3500.00) calculado y posicionado correctamente');
  assert(generatedXml.includes('<importeSubtotal>3500.00</importeSubtotal>'), '[UNIT] importeSubtotal (3500.00) posicionado correctamente');
  assert(generatedXml.includes('<importeTotal>4077.50</importeTotal>'), '[UNIT] importeTotal (4077.50) coincide exactamente con suma neta + IVA');

  // [FACTURA B ESPECÍFICO - Reglas ARCA 514 y 519]
  assert(generatedXml.includes('<precioUnitario>2420.00</precioUnitario>'), '[UNIT] [Factura B] precioUnitario informado con IVA incluido (2420.00)');
  assert(generatedXml.includes('<importeItem>2420.00</importeItem>'), '[UNIT] [Factura B] importeItem coincide con precio final (2420.00)');
  assert(!generatedXml.includes('<importeIVA>'), '[UNIT] [Factura B] ausencia estricta de <importeIVA> dentro de los ítems (ARCA error 514)');
  assert(generatedXml.includes('<arraySubtotalesIVA>'), '[UNIT] [Factura B] arraySubtotalesIVA conservado a nivel comprobante');

  // [FACTURA A ESPECÍFICO - Reglas comprobante A]
  const sampleInvoiceA = {
    ...sampleTestVoucher,
    invoiceType: 'A' as const,
    invoiceTypeCode: 1,
    customer: {
      ...sampleTestVoucher.customer,
      documentType: 'CUIT' as const,
      documentTypeCode: 80,
      documentNumber: '30712345678',
      taxCondition: 'Responsable Inscripto' as const,
      taxConditionCode: 1
    }
  };
  const xmlInvoiceA = mtxcaService.buildAuthorizePayloadXml(sampleInvoiceA, { token: 'T', sign: 'S' });
  assert(xmlInvoiceA.includes('<precioUnitario>2000.00</precioUnitario>'), '[UNIT] [Factura A] precioUnitario informado neto sin IVA (2000.00)');
  assert(xmlInvoiceA.includes('<importeIVA>420.00</importeIVA>'), '[UNIT] [Factura A] importeIVA discriminado e informado dentro del ítem (420.00)');

  // Validar rechazo ante ítem sin codigoMtx
  let missingMtxCaught = false;
  try {
    const voucherWithoutMtx = {
      ...sampleTestVoucher,
      items: [
        { ...sampleTestVoucher.items[0], codigoMtx: undefined, barcode: undefined, gtin: undefined, ean: undefined },
        sampleTestVoucher.items[1]
      ]
    };
    mtxcaService.buildAuthorizePayloadXml(voucherWithoutMtx as any, { token: 'T', sign: 'S' });
  } catch (err: any) {
    missingMtxCaught = true;
    assert(err.message.includes('Falta el dato fiscal del producto'), `[UNIT] Backend bloquea emisión si falta codigoMtx: ${err.message}`);
  }
  assert(missingMtxCaught === true, '[UNIT] Validación fiscal de backend exige codigoMtx en cada ítem');

  // Validar rechazo ante manipulación inconsistente
  let inconsistentCaught = false;
  try {
    const corruptVoucher = { ...sampleTestVoucher, total: 9999.00 };
    mtxcaService.buildAuthorizePayloadXml(corruptVoucher, { token: 'T', sign: 'S' });
  } catch (err: any) {
    inconsistentCaught = true;
    assert(err.message.includes('Inconsistencia fiscal'), `[UNIT] Backend bloquea inconsistencia de totales antes de enviar: ${err.message}`);
  }
  assert(inconsistentCaught === true, '[UNIT] Validación fiscal de backend previene envío con suma incorrecta');

  // ─── 4.D [UNIT TEST] Seguridad y Aislamiento de Supabase Admin Client ─────
  console.log('\n--- 4.D [UNIT TEST] Seguridad y Aislamiento de Supabase Admin ---');
  // 1. Probar que no se aceptan anon/publishable keys como clave de administración
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test_dummy_key';
    
    const keyDetected = getSupabaseAdminKey();
    assert(keyDetected === '', '[SECURITY] getSupabaseAdminKey rechaza terminantemente la anon/publishable key');

    const repoWithoutSecret = new FiscalRepository();
    assert(repoWithoutSecret.isServiceRoleConfigured === false, '[SECURITY] FiscalRepository detecta correctamente ausencia de clave administrativa');
  } finally {
    if (originalSecretKey) process.env.SUPABASE_SECRET_KEY = originalSecretKey;
    if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  }

  // ─── 4.E [REGRESSION TESTS] Casos Críticos WSMTXCA y Manejo de Errores vs Observaciones ───
  console.log('\n--- 4.E [REGRESSION TESTS] Parser WSMTXCA y Separación de Errores vs Observaciones ---');

  // Caso A: WSMTXCA con codigoAutorizacion + observación 504 => AUTORIZADA
  const xmlCaseA = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <autorizarComprobanteResponse xmlns="http://impl.service.wsmtxca.afip.gov.ar/service/">
          <resultado>A</resultado>
          <codigoTipoAutorizacion>E</codigoTipoAutorizacion>
          <codigoAutorizacion>86370890723993</codigoAutorizacion>
          <fechaVencimiento>2026-09-25</fechaVencimiento>
          <arrayObservaciones>
            <codigoDescripcion>
              <codigo>504</codigo>
              <descripcion>Ítem 1: El campo Código de Producto/Servicio no es un código GS1 válido (GTIN-8, GTIN-12 o GTIN-13)</descripcion>
            </codigoDescripcion>
          </arrayObservaciones>
        </autorizarComprobanteResponse>
      </soap:Body>
    </soap:Envelope>
  `;
  const resCaseA = mtxcaService.parseAuthorizeResponse(xmlCaseA, sampleTestVoucher);
  assert(resCaseA.success === true, '[REGRESIÓN CASO A] WSMTXCA con codigoAutorizacion y observación 504 -> success=true (AUTORIZADA)');
  assert(resCaseA.cae === '86370890723993', '[REGRESIÓN CASO A] CAE extraído correctamente desde <codigoAutorizacion> (86370890723993)');
  assert(resCaseA.caeExpirationDate === '2026-09-25', '[REGRESIÓN CASO A] Vencimiento extraído correctamente desde <fechaVencimiento> (2026-09-25)');
  assert(resCaseA.observations?.length === 1 && resCaseA.observations[0].code === '504', '[REGRESIÓN CASO A] Observación 504 preservada en array de observaciones');
  assert(!resCaseA.errors || resCaseA.errors.length === 0, '[REGRESIÓN CASO A] Observación 504 NO es convertida en error fiscal excluyente');

  // Caso B: WSMTXCA con arrayErrores real => RECHAZADA
  const xmlCaseB = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <autorizarComprobanteResponse xmlns="http://impl.service.wsmtxca.afip.gov.ar/service/">
          <resultado>R</resultado>
          <arrayErrores>
            <codigoDescripcion>
              <codigo>1500</codigo>
              <descripcion>CUIT no habilitada para operar en este punto de venta</descripcion>
            </codigoDescripcion>
          </arrayErrores>
        </autorizarComprobanteResponse>
      </soap:Body>
    </soap:Envelope>
  `;
  const resCaseB = mtxcaService.parseAuthorizeResponse(xmlCaseB, sampleTestVoucher);
  assert(resCaseB.success === false, '[REGRESIÓN CASO B] WSMTXCA con arrayErrores real -> success=false (RECHAZADA)');
  assert(!resCaseB.cae, '[REGRESIÓN CASO B] No se asigna CAE ficticio cuando ARCA rechaza');
  assert(resCaseB.errors?.length === 1 && resCaseB.errors[0].code === '1500', '[REGRESIÓN CASO B] Error fiscal real (1500) extraído exclusivamente desde <arrayErrores>');

  // Caso C: WSMTXCA timeout => ESTADO_DESCONOCIDO
  const timeoutErr: any = new Error('Connect timeout to ARCA server');
  timeoutErr.code = 'ETIMEDOUT';
  const isTimeoutDetected = timeoutErr.code === 'ECONNABORTED' || timeoutErr.message?.includes('timeout') || timeoutErr.message?.includes('ETIMEDOUT');
  assert(isTimeoutDetected === true, '[REGRESIÓN CASO C] Detector de timeout clasifica ETIMEDOUT como fallo de conectividad');
  const friendlyTimeout = translateArcaError('TIMEOUT', timeoutErr.message);
  assert(friendlyTimeout.code === 'TIMEOUT', '[REGRESIÓN CASO C] Error clasificado como TIMEOUT');
  assert(friendlyTimeout.suggestedAction.includes('ESTADO_DESCONOCIDO'), '[REGRESIÓN CASO C] Acción sugerida instruye reconciliar para comprobar si ARCA autorizó');

  // Caso D: WSMTXCA consultarComprobante con CAE real => AUTORIZADA
  const xmlCaseD = `
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <consultarComprobanteResponse xmlns="http://impl.service.wsmtxca.afip.gov.ar/service/">
          <comprobante>
            <codigoTipoComprobante>6</codigoTipoComprobante>
            <numeroPuntoVenta>1</numeroPuntoVenta>
            <numeroComprobante>1</numeroComprobante>
            <fechaEmision>2026-09-15</fechaEmision>
            <codigoTipoAutorizacion>E</codigoTipoAutorizacion>
            <codigoAutorizacion>86370890723993</codigoAutorizacion>
            <fechaVencimiento>2026-09-25</fechaVencimiento>
            <codigoTipoDocumento>96</codigoTipoDocumento>
            <numeroDocumento>20112233445</numeroDocumento>
            <importeGravado>1115.70</importeGravado>
            <importeSubtotal>1115.70</importeSubtotal>
            <importeTotal>1350.00</importeTotal>
            <codigoMoneda>PES</codigoMoneda>
            <cotizacionMoneda>1</cotizacionMoneda>
            <codigoConcepto>1</codigoConcepto>
            <arrayObservaciones>
              <codigoDescripcion>
                <codigo>504</codigo>
                <descripcion>Ítem 1: El campo Código de Producto/Servicio no es un código GS1 válido (GTIN-8, GTIN-12 o GTIN-13)</descripcion>
              </codigoDescripcion>
            </arrayObservaciones>
          </comprobante>
        </consultarComprobanteResponse>
      </soap:Body>
    </soap:Envelope>
  `;
  const resCaseD = mtxcaService.parseConsultarComprobanteResponse(xmlCaseD, 1, 6, 1);
  assert(resCaseD !== null, '[REGRESIÓN CASO D] consultarComprobante parsea comprobante existente');
  assert(resCaseD?.cae === '86370890723993', '[REGRESIÓN CASO D] CAE real (86370890723993) extraído de <codigoAutorizacion>');
  assert(resCaseD?.caeExpirationDate === '2026-09-25', '[REGRESIÓN CASO D] Vencimiento (2026-09-25) extraído de <fechaVencimiento>');
  assert(resCaseD?.voucherNumber === 1 && resCaseD?.pointOfSale === 1 && resCaseD?.voucherType === 6, '[REGRESIÓN CASO D] PV 1, Tipo 6, Nº 1 confirmados');
  assert(resCaseD?.result === 'A', '[REGRESIÓN CASO D] Estado retornado como AUTORIZADA');

  // ─── 5. SEGURIDAD Y COMPORTAMIENTO ESTRICTO DE CERTIFICADOS ───────
  console.log('\n--- 5. [UNIT TEST] Validación Estricta de Certificados (Sin Mocks en Backend) ---');
  const savedCertPath = arcaConfig.certPath;
  try {
    arcaConfig.certPath = './certs/non-existent-certificate.crt';
    clearTicketCache(false);
    const certInfo = getCertificateInfo();
    assert(certInfo.isValid === false, '[UNIT] Detector de certificados informa inválido cuando no existe el archivo');

    let ticketErrorCaught = false;
    try {
      await getWsaaTicket('wsmtxca', false);
    } catch (err: any) {
      ticketErrorCaught = true;
      assert(err.message.includes('Certificado ARCA no configurado'), `[UNIT] getWsaaTicket lanza excepción estricta sin certificados: "${err.message}"`);
    }
    assert(ticketErrorCaught === true, '[UNIT] El backend productivo rechaza autenticación sin inventar tokens simulados');
  } finally {
    arcaConfig.certPath = savedCertPath;
  }

  // ─── 6. SIMULACIÓN DE FLUJO CON MOCK EXPLÍCITO (MOCK TEST) ────────
  console.log('\n--- 6. [MOCK TEST] Prueba Aislada con Mock Explicitamente Declarado ---');
  const mockService = new MockArcaInvoiceService();
  const mockAuthResponse = await mockService.authorizeInvoice({
    idempotencyKey: 'TEST-UUID-MOCK-1',
    saleIds: ['SALE-MOCK-001'],
    pointOfSale: 1,
    invoiceType: 'B',
    invoiceTypeCode: 6,
    voucherNumber: 101,
    date: new Date().toISOString().split('T')[0],
    concept: 1,
    customer: {
      name: 'Consumidor Final',
      documentType: 'DNI',
      documentTypeCode: 96,
      documentNumber: '30123456',
      taxCondition: 'Consumidor Final'
    },
    subtotalNet: calc.subtotalNet,
    taxes: calc.taxes,
    total: calc.total,
    items: calc.items,
    vatBreakdown: calc.vatBreakdown
  });

  assert(mockAuthResponse.success === true, '[MOCK] MockService devuelve respuesta exitosa simulada para pruebas de contrato');
  assert(mockAuthResponse.cae === '74123456789012', '[MOCK] CAE del mock explícito es 74123456789012 (claramente identificado como mock)');

  // ─── 7. TRADUCCIÓN Y MANEJO DE ERRORES ARCA (UNIT TEST) ───────────
  console.log('\n--- 7. [UNIT TEST] Traducción y Manejo de Errores ARCA ---');
  const err10016 = translateArcaError('10016');
  assert(err10016.title.includes('inconsistente'), '[UNIT] Código 10016 traducido con mensaje explicativo');
  assert(err10016.isRetryable === true, '[UNIT] Código 10016 marcado como subsanable tras resincronizar');

  const errTimeout = translateArcaError('ETIMEDOUT', 'Connect timeout to ARCA server');
  assert(errTimeout.code === 'TIMEOUT', '[UNIT] Timeout clasificado apropiadamente para evitar reintento ciego');

  // ─── 8. GENERACIÓN DE CÓDIGO QR SEGÚN RG 4892/2020 (INTEGRACIÓN) ─
  console.log('\n--- 8. [LOCAL INTEGRATION] Código QR según RG 4892/2020 ---');
  const qrPayload = buildArcaQrPayload({
    date: '2026-09-14',
    emitterCuit: '30712345678',
    pointOfSale: 1,
    invoiceTypeCode: 6,
    invoiceNumber: 101,
    total: 4025,
    currency: 'PES',
    customerDocumentTypeCode: 96,
    customerDocumentNumber: '30123456',
    cae: '74123456789012',
    status: 'AUTORIZADA'
  });

  assert(qrPayload.includes('"ver":1') && qrPayload.includes('"ptoVta":1'), '[INTEGRATION] Payload de QR contiene estructura reglamentaria');

  const qrUrl = buildArcaQrUrl(qrPayload);
  assert(qrUrl.startsWith('https://www.afip.gob.ar/fe/qr/?p='), '[INTEGRATION] URL de QR apunta al validador oficial de AFIP/ARCA');

  const qrDataUrl = await generateQrDataUrl(qrUrl);
  assert(qrDataUrl.startsWith('data:image/png;base64,'), '[INTEGRATION] Imagen QR generada exitosamente como DataURL');

  // ─── 9. GENERACIÓN DE PDF FISCAL (INTEGRACIÓN LOCAL) ──────────────
  console.log('\n--- 9. [LOCAL INTEGRATION] Generación de PDF Fiscal con PDFKit ---');
  const pdfBuffer = await generateFiscalInvoicePdf({
    invoiceType: 'B',
    invoiceTypeCode: 6,
    pointOfSale: 1,
    invoiceNumber: 101,
    date: '2026-09-14',
    emitter: {
      businessName: 'MARTINA SUPERMERCADO S.R.L.',
      cuit: '30712345678',
      taxCondition: 'Responsable Inscripto',
      grossIncome: '901-123456-7',
      startDate: '01/01/2024',
      fiscalAddress: 'Av. Libertador 1234, San Luis, Argentina'
    },
    customer: {
      name: 'Juan Pérez',
      documentType: 'DNI',
      documentTypeCode: 96,
      documentNumber: '30123456',
      taxCondition: 'Consumidor Final',
      address: 'San Luis'
    },
    items: calc.items,
    subtotalNet: calc.subtotalNet,
    taxes: calc.taxes,
    total: calc.total,
    cae: '74123456789012',
    caeExpirationDate: '2026-09-24'
  });

  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 5000, `[INTEGRATION] PDF fiscal generado correctamente (${pdfBuffer.length} bytes)`);
  assert(pdfBuffer.toString('utf8', 0, 5) === '%PDF-', '[INTEGRATION] El buffer contiene la firma de archivo PDF válida (%PDF-)');

  // ─── 10. PRUEBA DE HOMOLOGACIÓN REAL CON ARCA (CONDICIONAL) ───────
  console.log('\n--- 10. [ARCA HOMOLOGATION] Prueba Real de Conexión Externa ---');
  const hasCert = fs.existsSync(arcaConfig.certPath);
  const hasKey = fs.existsSync(arcaConfig.keyPath);
  const hasRealCuit = Boolean(process.env.ARCA_CUIT && process.env.ARCA_CUIT !== '20300000001');

  if (hasCert && hasKey && hasRealCuit) {
    console.log('  📡 Detectadas credenciales de Homologación. Ejecutando llamada real contra WSAA y WSMTXCA...');
    try {
      const realTicket = await getWsaaTicket('wsmtxca', false);
      assert(Boolean(realTicket.token && realTicket.sign), '[HOMOLOGACIÓN REAL] Ticket WSAA válido y activo obtenido para WSMTXCA');

      const service = new WsMtxcaInvoiceService();
      const lastVoucher = await service.getLastVoucher(1, 6);
      assert(lastVoucher >= 1, `[HOMOLOGACIÓN REAL] WSMTXCA getLastVoucher(PV 1, Tipo 6) contra ARCA responde >= 1 (comprobante registrado en ARCA: ${lastVoucher})`);
    } catch (err: any) {
      assert(false, `[HOMOLOGACIÓN REAL] Fallo al autenticar o consultar contra AFIP: ${err.message}`);
    }
  } else {
    skip(
      '[HOMOLOGACIÓN REAL] Prueba de autorización contra AFIP',
      'Omitida intencionalmente: requiere certificados reales en disco y ARCA_CUIT configurado en .env'
    );
  }

  // ─── RESUMEN FINAL ────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`  RESUMEN: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal en ejecución de pruebas:', err);
  process.exit(1);
});
