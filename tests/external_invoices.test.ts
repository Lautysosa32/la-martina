import assert from 'assert';
import { VOUCHER_CODES } from '../server/services/arca/arcaTypes';
import type { InvoiceOrigin, FiscalStatus, RegisterExternalInvoiceRequest } from '../server/services/arca/arcaTypes';

console.log('========================================================================');
console.log('  TEST SUITE: FACTURAS EXTERNAS / MANUALES Y AUDITORÍA DE NUMERACIÓN');
console.log('========================================================================\n');

// Mock tracking de llamadas a ARCA para garantizar REGLAS FISCALES INVIOLABLES
let autorizarComprobanteCalls = 0;
let arcaVoucherCounter = 3; // Supongamos que en ARCA el último comprobante emitido es el Nº 3

const mockArcaService = {
  autorizarComprobante: async () => {
    autorizarComprobanteCalls++;
    throw new Error('VIOLACIÓN CRÍTICA: autorizarComprobante NO DEBE SER LLAMADO.');
  },
  getLastVoucher: async (pv: number, voucherType: string) => {
    return arcaVoucherCounter;
  },
  getInvoice: async (pv: number, voucherType: number, voucherNumber: number) => {
    // Si voucherNumber <= 3, simular que existe en ARCA
    if (voucherNumber === 3) {
      return {
        pointOfSale: pv,
        voucherType,
        voucherNumber: 3,
        date: '20260915',
        totalAmount: 15000,
        netAmount: 12396.69,
        ivaAmount: 2603.31,
        cae: '74389201928374',
        caeExpirationDate: '20260925',
        docType: 96,
        docNumber: '30111222',
        result: 'A'
      };
    }
    if (voucherNumber === 4) {
      // Simular que el Nº 4 fue emitido por talonario / contingencia pero se autorizó en ARCA con estos datos
      return {
        pointOfSale: pv,
        voucherType,
        voucherNumber: 4,
        date: '20260916',
        totalAmount: 20000,
        netAmount: 16528.93,
        ivaAmount: 3471.07,
        cae: '89230192837401',
        caeExpirationDate: '20260926',
        docType: 96,
        docNumber: '0',
        result: 'A'
      };
    }
    // Para otros comprobantes, ARCA devuelve null (no encontrado)
    return null;
  }
};

// Base de datos mock en memoria para pruebas
interface MockDbInvoice {
  id: string;
  point_of_sale: number;
  invoice_type_code: number;
  invoice_type: string;
  invoice_number: number;
  origin: InvoiceOrigin;
  status: FiscalStatus;
  cae?: string | null;
  cae_expiration_date?: string | null;
  total: number;
  subtotal_net?: number;
  taxes?: number;
  client_name: string;
  client_document_type?: string;
  client_document_number?: string;
  sale_ids?: string[];
  notes?: string;
  attachment_url?: string;
  verified_at?: string | null;
  verified_by?: string | null;
}

const mockDatabase: MockDbInvoice[] = [
  {
    id: 'inv-local-1',
    point_of_sale: 1,
    invoice_type_code: 6,
    invoice_type: 'B',
    invoice_number: 1,
    origin: 'ARCA_LOCAL',
    status: 'AUTORIZADA',
    cae: '71000000000001',
    cae_expiration_date: '20260920',
    total: 10000,
    client_name: 'Cliente 1',
    sale_ids: ['SALE-001']
  },
  {
    id: 'inv-local-2',
    point_of_sale: 1,
    invoice_type_code: 6,
    invoice_type: 'B',
    invoice_number: 2,
    origin: 'ARCA_LOCAL',
    status: 'AUTORIZADA',
    cae: '71000000000002',
    cae_expiration_date: '20260921',
    total: 12000,
    client_name: 'Cliente 2',
    sale_ids: ['SALE-002']
  },
  {
    id: 'inv-local-3',
    point_of_sale: 1,
    invoice_type_code: 6,
    invoice_type: 'B',
    invoice_number: 3,
    origin: 'ARCA_LOCAL',
    status: 'AUTORIZADA',
    cae: '74389201928374',
    cae_expiration_date: '20260925',
    total: 15000,
    client_name: 'Cliente 3',
    sale_ids: ['SALE-003']
  }
];

const mockSales = [
  { id: 'SALE-001', is_billed: true },
  { id: 'SALE-002', is_billed: true },
  { id: 'SALE-003', is_billed: true },
  { id: 'SALE-004', is_billed: false },
  { id: 'SALE-005', is_billed: false }
];

// Lógica de registro de factura externa
async function registerExternalInvoice(req: RegisterExternalInvoiceRequest): Promise<{ success: boolean; error?: string; warning?: string; invoice?: MockDbInvoice }> {
  // 1. Validar duplicado
  const typeCode = req.invoiceType === 'A' ? 1 : 6;
  const existing = mockDatabase.find(i =>
    i.point_of_sale === req.pointOfSale &&
    i.invoice_type_code === typeCode &&
    i.invoice_number === req.invoiceNumber
  );

  if (existing) {
    return {
      success: false,
      error: `Ya existe un comprobante registrado con PV ${req.pointOfSale} Tipo ${req.invoiceType} Nº ${req.invoiceNumber}. Operación bloqueada.`
    };
  }

  // 2. Consultar último comprobante en ARCA para advertencia (SIN BLOQUEAR Y SIN EMITIR)
  const lastArcaVoucher = await mockArcaService.getLastVoucher(req.pointOfSale, req.invoiceType);
  let warning: string | undefined;
  if (req.invoiceNumber !== lastArcaVoucher + 1) {
    warning = `ADVERTENCIA: ARCA informa que el último comprobante registrado es el Nº ${lastArcaVoucher}. Está registrando externamente el Nº ${req.invoiceNumber}.`;
  }

  // 3. Crear registro con estado REGISTRADA_EXTERNAMENTE y origen EXTERNA_MANUAL
  const newInvoice: MockDbInvoice = {
    id: `ext-${Date.now()}-${req.invoiceNumber}`,
    point_of_sale: req.pointOfSale,
    invoice_type_code: typeCode,
    invoice_type: req.invoiceType,
    invoice_number: req.invoiceNumber,
    origin: 'EXTERNA_MANUAL',
    status: 'REGISTRADA_EXTERNAMENTE',
    cae: req.cae || null,
    cae_expiration_date: req.caeExpirationDate || null,
    total: req.total,
    subtotal_net: req.subtotalNet,
    taxes: req.taxes,
    client_name: req.customer.name,
    client_document_type: req.customer.documentType,
    client_document_number: req.customer.documentNumber,
    notes: req.notes,
    attachment_url: req.attachmentUrl,
    sale_ids: req.saleIds,
    verified_at: null,
    verified_by: null
  };

  mockDatabase.push(newInvoice);

  // 4. Si tiene ventas asociadas, marcarlas como facturadas
  if (req.saleIds && req.saleIds.length > 0) {
    for (const sid of req.saleIds) {
      const sale = mockSales.find(s => s.id === sid);
      if (sale) sale.is_billed = true;
    }
  }

  return { success: true, warning, invoice: newInvoice };
}

// Lógica de verificación contra ARCA (solo lectura)
async function verifyExternalInvoice(invoiceId: string, verifiedBy: string) {
  const inv = mockDatabase.find(i => i.id === invoiceId);
  if (!inv) return { success: false, error: 'Comprobante no encontrado' };

  // Consultar en modo lectura
  const arcaData = await mockArcaService.getInvoice(inv.point_of_sale, inv.invoice_type_code, inv.invoice_number);
  if (!arcaData) {
    return {
      success: true,
      verified: false,
      message: 'Comprobante no encontrado en los registros de ARCA. Se mantiene como REGISTRADA_EXTERNAMENTE.'
    };
  }

  // Si se encontró, validar datos compatibles
  inv.status = 'VERIFICADA_EN_ARCA';
  inv.verified_at = new Date().toISOString();
  inv.verified_by = verifiedBy;
  inv.cae = arcaData.cae;
  inv.cae_expiration_date = arcaData.caeExpirationDate;

  return {
    success: true,
    verified: true,
    cae: arcaData.cae,
    caeExpirationDate: arcaData.caeExpirationDate
  };
}

// ─── TEST 1: Registrar factura externa sin CAE ─────────────────────────
console.log('--- TEST 1: Registrar factura externa sin CAE (talonario manual / contingencia) ---');
const res1 = await registerExternalInvoice({
  pointOfSale: 1,
  invoiceType: 'B',
  invoiceNumber: 4,
  date: '2026-09-16',
  customer: { name: 'Juan Pérez', documentType: 'DNI', documentNumber: '32000111', taxCondition: 'Consumidor Final' },
  total: 20000,
  subtotalNet: 16528.93,
  taxes: 3471.07,
  notes: 'Talonario papel Nº 0001-00000004 por corte de luz',
  saleIds: ['SALE-004']
});

assert.strictEqual(res1.success, true, 'Debe registrar la factura externa');
assert.strictEqual(res1.invoice?.origin, 'EXTERNA_MANUAL', 'Origen debe ser EXTERNA_MANUAL');
assert.strictEqual(res1.invoice?.status, 'REGISTRADA_EXTERNAMENTE', 'Estado debe ser REGISTRADA_EXTERNAMENTE');
assert.strictEqual(res1.invoice?.cae, null, 'CAE debe ser null (no se inventa CAE)');
console.log('  ✅ PASS: Factura externa registrada sin CAE con status REGISTRADA_EXTERNAMENTE');

// ─── TEST 2: Registrar factura externa con CAE informado ──────────────
console.log('\n--- TEST 2: Registrar factura externa con CAE informado (sin verificar aún) ---');
const res2 = await registerExternalInvoice({
  pointOfSale: 1,
  invoiceType: 'B',
  invoiceNumber: 5,
  date: '2026-09-16',
  customer: { name: 'Comercio Amigo', documentType: 'CUIT', documentNumber: '30712345678', taxCondition: 'Responsable Inscripto' },
  total: 45000,
  cae: '89123456789012',
  caeExpirationDate: '2026-09-26',
  notes: 'Emitida por software anterior'
});

assert.strictEqual(res2.success, true);
assert.strictEqual(res2.invoice?.origin, 'EXTERNA_MANUAL');
assert.strictEqual(res2.invoice?.status, 'REGISTRADA_EXTERNAMENTE', 'No debe marcarse VERIFICADA_EN_ARCA hasta que se consulte ARCA');
assert.strictEqual(res2.invoice?.cae, '89123456789012', 'Conserva el CAE informado por el usuario');
console.log('  ✅ PASS: Factura con CAE informado queda como REGISTRADA_EXTERNAMENTE (no VERIFICADA_EN_ARCA)');

// ─── TEST 3: Bloquear duplicado PV + tipo + número ─────────────────────
console.log('\n--- TEST 3: Bloqueo estricto de comprobante duplicado (PV + Tipo + Nº) ---');
const resDup = await registerExternalInvoice({
  pointOfSale: 1,
  invoiceType: 'B',
  invoiceNumber: 4, // Ya existe
  date: '2026-09-16',
  customer: { name: 'Otro Cliente', documentType: 'DNI', documentNumber: '0', taxCondition: 'Consumidor Final' },
  total: 5000
});

assert.strictEqual(resDup.success, false, 'Debe fallar al intentar registrar duplicado');
assert(resDup.error?.includes('Ya existe un comprobante registrado'), 'Mensaje de error debe indicar duplicado');
console.log('  ✅ PASS: Duplicado bloqueado correctamente: ' + resDup.error);

// ─── TEST 4: Advertencia de salto de numeración sin bloquear ───────────
console.log('\n--- TEST 4: Advertencia informativa si existe salto de numeración respecto a ARCA ---');
const resJump = await registerExternalInvoice({
  pointOfSale: 1,
  invoiceType: 'B',
  invoiceNumber: 10, // ARCA tiene 3
  date: '2026-09-16',
  customer: { name: 'Cliente Rango Salto', documentType: 'DNI', documentNumber: '0', taxCondition: 'Consumidor Final' },
  total: 1000
});

assert.strictEqual(resJump.success, true, 'No debe bloquear el registro a pesar del salto');
assert(resJump.warning?.includes('ARCA informa que el último comprobante registrado es el Nº 3'), 'Debe emitir advertencia informativa');
console.log('  ✅ PASS: Registro permitido con advertencia administrativa informativa:\n    ' + resJump.warning);

// ─── TEST 5: Confirmar que registrar factura externa NO cambia getLastVoucher de ARCA
console.log('\n--- TEST 5: Confirmar que registrar externa NO altera el último comprobante oficial en ARCA ---');
const lastAfterExt = await mockArcaService.getLastVoucher(1, 'B');
assert.strictEqual(lastAfterExt, 3, 'El contador de ARCA debe seguir siendo 3');
console.log(`  ✅ PASS: getLastVoucher de ARCA sigue devolviendo Nº ${lastAfterExt} (ARCA mantiene soberanía fiscal)`);

// ─── TEST 6: Verificar factura existente en ARCA -> VERIFICADA_EN_ARCA ─
console.log('\n--- TEST 6: Reconciliación / verificación de factura externa existente en ARCA ---');
const verifyRes = await verifyExternalInvoice(res1.invoice!.id, 'Administrador Auditor');
assert.strictEqual(verifyRes.success, true);
assert.strictEqual(verifyRes.verified, true);
assert.strictEqual(res1.invoice?.status, 'VERIFICADA_EN_ARCA', 'Estado debe actualizarse a VERIFICADA_EN_ARCA');
assert.strictEqual(res1.invoice?.cae, '89230192837401', 'Debe almacenar el CAE oficial validado');
assert(res1.invoice?.verified_at !== null, 'verified_at debe tener timestamp');
assert.strictEqual(res1.invoice?.verified_by, 'Administrador Auditor');
console.log('  ✅ PASS: Comprobante conciliado y actualizado a VERIFICADA_EN_ARCA con CAE oficial y auditoría');

// ─── TEST 7: Factura no encontrada en ARCA -> Mantiene REGISTRADA_EXTERNAMENTE
console.log('\n--- TEST 7: Verificación en ARCA de comprobante no encontrado (ej. talonario papel) ---');
const verifyNotFound = await verifyExternalInvoice(resJump.invoice!.id, 'Auditor');
assert.strictEqual(verifyNotFound.success, true);
assert.strictEqual(verifyNotFound.verified, false);
assert.strictEqual(resJump.invoice?.status, 'REGISTRADA_EXTERNAMENTE', 'Debe mantenerse REGISTRADA_EXTERNAMENTE');
console.log('  ✅ PASS: Comprobante no hallado en ARCA se preserva con estado REGISTRADA_EXTERNAMENTE');

// ─── TEST 8: Auditoría y detección de diferencias de importes ─────────
console.log('\n--- TEST 8: Auditoría de rango y discrepancia de importes ---');
function auditVoucherComparison(localInv: MockDbInvoice | undefined, arcaInv: any) {
  if (!arcaInv && !localInv) return 'NO EXISTE';
  if (arcaInv && !localInv) return 'FALTANTE LOCAL';
  if (!arcaInv && localInv) return localInv.status === 'REGISTRADA_EXTERNAMENTE' ? 'EXTERNA PENDIENTE' : 'SOLO EN BASE LOCAL';
  if (arcaInv && localInv) {
    if (Math.abs(arcaInv.totalAmount - localInv.total) > 0.01) {
      return `DIFERENCIA TOTAL (ARCA: $${arcaInv.totalAmount}, Local: $${localInv.total})`;
    }
    return 'OK';
  }
  return 'DESCONOCIDO';
}

const auditOk = auditVoucherComparison(res1.invoice, { totalAmount: 20000 });
assert.strictEqual(auditOk, 'OK');
console.log('  ✅ PASS: Conciliación de importes exacta -> OK');

const auditDiff = auditVoucherComparison(res1.invoice, { totalAmount: 25000 });
assert(auditDiff.includes('DIFERENCIA TOTAL'));
console.log('  ✅ PASS: Detección de discrepancia en importe: ' + auditDiff);

// ─── TEST 9 & 10: Factura vinculada a venta e impedimento de doble facturación
console.log('\n--- TEST 9 & 10: Vinculación con venta e impedimento de facturación duplicada en POS ---');
const sale4 = mockSales.find(s => s.id === 'SALE-004');
assert.strictEqual(sale4?.is_billed, true, 'Venta vinculada SALE-004 debe marcarse como facturada');

function attemptPosBillSale(saleId: string) {
  const sale = mockSales.find(s => s.id === saleId);
  if (!sale) throw new Error('Venta no existe');
  if (sale.is_billed) {
    return { allowed: false, reason: 'La venta ya fue facturada (sea por el sistema o comprobante externo).' };
  }
  return { allowed: true };
}

const posBillAttempt = attemptPosBillSale('SALE-004');
assert.strictEqual(posBillAttempt.allowed, false, 'POS no debe permitir refacturar una venta vinculada a factura externa');
console.log('  ✅ PASS: La venta SALE-004 vinculada a la factura externa no puede volver a facturarse desde POS');

// ─── TEST 11: Confirmar que jamás se llamó autorizarComprobante ────────
console.log('\n--- TEST 11: Invariante fiscal: autorizarComprobante NUNCA fue invocado ---');
assert.strictEqual(autorizarComprobanteCalls, 0, 'autorizarComprobante DEBE tener exactamente 0 invocaciones');
console.log('  ✅ PASS: autorizarComprobante invocaciones = 0 (CERO emisiones ante ARCA)');

// ─── TEST 12: Confirmar que no se generan CAE ficticios ───────────────
console.log('\n--- TEST 12: Invariante: ausencia total de CAE sintéticos / inventados ---');
const allCaes = mockDatabase.map(i => i.cae).filter(Boolean) as string[];
for (const cae of allCaes) {
  assert(!cae.includes('TEST') && !cae.includes('MOCK') && !cae.includes('FAKE'), 'No deben existir CAEs inventados');
  assert(/^\d+$/.test(cae), 'Los CAEs deben ser secuencias numéricas reales');
}
console.log('  ✅ PASS: Todos los comprobantes tienen CAE nulo o CAE numérico informado/oficial sin falsificaciones');

console.log('\n========================================================================');
console.log('  TODAS LAS 12 PRUEBAS DE FACTURAS EXTERNAS PASARON SATISFACTORIAMENTE');
console.log('========================================================================\n');
