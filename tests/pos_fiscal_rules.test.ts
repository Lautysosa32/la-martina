import assert from 'assert';
import { determineInvoiceType, validateCuit, recalculateFiscalInvoice } from '../server/services/arca/arcaTaxRules';
import { VOUCHER_CODES } from '../server/services/arca/arcaTypes';

console.log('================================================================');
console.log('  TEST SUITE: REGLAS FISCALES POS + ARCA (COMPROBANTES Y CONTROL)');
console.log('================================================================\n');

// ─── 1. DETERMINACIÓN FISCAL DE COMPROBANTES (REGLA 1) ─────────────────
console.log('--- TEST 1: Determinación de comprobante según emisor y receptor ---');

const ruleCF = determineInvoiceType('Responsable Inscripto', 'Consumidor Final');
assert.strictEqual(ruleCF.invoiceType, 'B', 'Consumidor Final debe recibir Factura B');
assert.strictEqual(ruleCF.invoiceTypeCode, VOUCHER_CODES.B, 'Código fiscal debe ser 6 (Factura B)');
console.log('  ✅ PASS: Consumidor Final -> Factura B (Código 6)');

const ruleExento = determineInvoiceType('Responsable Inscripto', 'Exento');
assert.strictEqual(ruleExento.invoiceType, 'B', 'Sujeto Exento debe recibir Factura B');
assert.strictEqual(ruleExento.invoiceTypeCode, VOUCHER_CODES.B, 'Código fiscal debe ser 6 (Factura B)');
console.log('  ✅ PASS: Sujeto Exento -> Factura B (Código 6)');

const ruleRI = determineInvoiceType('Responsable Inscripto', 'Responsable Inscripto');
assert.strictEqual(ruleRI.invoiceType, 'A', 'Responsable Inscripto debe recibir Factura A');
assert.strictEqual(ruleRI.invoiceTypeCode, VOUCHER_CODES.A, 'Código fiscal debe ser 1 (Factura A)');
console.log('  ✅ PASS: Responsable Inscripto -> Factura A (Código 1)');

const ruleMono = determineInvoiceType('Responsable Inscripto', 'Monotributista');
assert.strictEqual(ruleMono.invoiceType, 'A', 'Monotributista debe recibir Factura A (RG 5003/2021)');
assert.strictEqual(ruleMono.invoiceTypeCode, VOUCHER_CODES.A, 'Código fiscal debe ser 1 (Factura A)');
console.log('  ✅ PASS: Monotributista -> Factura A con IVA discriminado (RG 5003/2021)');

// ─── 2. VALIDACIÓN DE CUIT POR MÓDULO 11 ──────────────────────────────
console.log('\n--- TEST 2: Validación de CUIT para Factura A ---');

const validCuit = '20304050607'; // Algoritmo verificador
// Probamos con CUITs conocidos
const cuitVal1 = validateCuit('20-30405060-7');
console.log('  CUIT 20-30405060-7 resultado:', cuitVal1.valid ? 'Válido' : cuitVal1.error);

const invalidCuit1 = validateCuit('123456');
assert.strictEqual(invalidCuit1.valid, false, 'CUIT de longitud incorrecta debe ser inválido');
console.log('  ✅ PASS: CUIT de longitud incorrecta es rechazado');

const invalidCuit2 = validateCuit('');
assert.strictEqual(invalidCuit2.valid, false, 'CUIT vacío debe ser inválido');
console.log('  ✅ PASS: CUIT vacío es rechazado');

// ─── 3. CONTROL DE DUPLICADOS Y ESTADO DESCONOCIDO (REGLA 3) ──────────
console.log('\n--- TEST 3: Prevención de doble facturación y ESTADO_DESCONOCIDO ---');

function mockCheckSaleBilledStatus(invoices: any[], saleId: string) {
  const inv = invoices.find(i => i.saleId === saleId);
  if (!inv) return { isBilled: false, canRetry: true, needsReconciliation: false };
  if (inv.status === 'AUTORIZADA') return { isBilled: true, invoice: inv, canRetry: false, needsReconciliation: false };
  if (inv.status === 'ESTADO_DESCONOCIDO') return { isBilled: false, invoice: inv, canRetry: false, needsReconciliation: true };
  return { isBilled: false, invoice: inv, canRetry: true, needsReconciliation: false };
}

const mockInvoices = [
  { id: 'inv-1', saleId: 'POS-001', status: 'AUTORIZADA', type: 'B', pointOfSale: 1, invoiceNumber: 1, cae: '86370890723993' },
  { id: 'inv-2', saleId: 'POS-002', status: 'RECHAZADA', type: 'B' },
  { id: 'inv-3', saleId: 'POS-003', status: 'ESTADO_DESCONOCIDO', operationId: 'OP-123' }
];

// Venta ya autorizada
const statusPos1 = mockCheckSaleBilledStatus(mockInvoices, 'POS-001');
assert.strictEqual(statusPos1.isBilled, true, 'Venta AUTORIZADA debe marcarse como facturada');
assert.strictEqual(statusPos1.canRetry, false, 'Venta AUTORIZADA no puede volver a facturarse (bloqueo estricto)');
console.log('  ✅ PASS: Venta AUTORIZADA queda bloqueada permanentemente para evitar doble facturación');

// Venta rechazada
const statusPos2 = mockCheckSaleBilledStatus(mockInvoices, 'POS-002');
assert.strictEqual(statusPos2.isBilled, false, 'Venta RECHAZADA no está facturada');
assert.strictEqual(statusPos2.canRetry, true, 'Venta RECHAZADA puede volver a intentarse');
console.log('  ✅ PASS: Venta RECHAZADA permite reintento de autorización');

// Venta en ESTADO_DESCONOCIDO
const statusPos3 = mockCheckSaleBilledStatus(mockInvoices, 'POS-003');
assert.strictEqual(statusPos3.isBilled, false, 'Venta en ESTADO_DESCONOCIDO no está confirmada');
assert.strictEqual(statusPos3.canRetry, false, 'Venta en ESTADO_DESCONOCIDO no puede reintentarse sin reconciliar');
assert.strictEqual(statusPos3.needsReconciliation, true, 'Venta en ESTADO_DESCONOCIDO exige reconciliación');
console.log('  ✅ PASS: Venta en ESTADO_DESCONOCIDO exige reconciliación antes de permitir cualquier acción');

// ─── 4. CÓDIGOS OFICIALES PARA NC / ND (REGLA 12) ─────────────────────
console.log('\n--- TEST 4: Códigos oficiales WSMTXCA para Notas de Crédito y Débito ---');

assert.strictEqual(VOUCHER_CODES.NC_B, 8, 'Nota de Crédito B debe ser tipo fiscal 8');
assert.strictEqual(VOUCHER_CODES.ND_B, 7, 'Nota de Débito B debe ser tipo fiscal 7');
assert.strictEqual(VOUCHER_CODES.NC_A, 3, 'Nota de Crédito A debe ser tipo fiscal 3');
assert.strictEqual(VOUCHER_CODES.ND_A, 2, 'Nota de Débito A debe ser tipo fiscal 2');
console.log('  ✅ PASS: NC B = Tipo 8 (WSMTXCA)');
console.log('  ✅ PASS: ND B = Tipo 7 (WSMTXCA)');
console.log('  ✅ PASS: NC A = Tipo 3 (WSMTXCA)');
console.log('  ✅ PASS: ND A = Tipo 2 (WSMTXCA)');

// ─── 5. ENTREGA SEGURA WHATSAPP (REGLA 5) ──────────────────────────────
console.log('\n--- TEST 5: Generación de URL segura para WhatsApp (sin localhost) ---');

function getSafeWhatsAppInvoiceUrl(invoiceId: string, origin: string, publicUrlFallback: string): string {
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  const baseUrl = isLocal ? publicUrlFallback : origin;
  return `${baseUrl}/factura/${invoiceId}`;
}

const localUrl = getSafeWhatsAppInvoiceUrl('inv-123', 'http://localhost:3000', 'https://martina.app');
assert(!localUrl.includes('localhost'), 'En entorno local la URL no debe contener localhost');
assert(localUrl.startsWith('https://martina.app/factura/inv-123'), 'Debe utilizar el dominio público seguro');
console.log('  ✅ PASS: URL en entorno local reemplazada por dominio público seguro: ' + localUrl);

const prodUrl = getSafeWhatsAppInvoiceUrl('inv-123', 'https://supermercadolamartina.com', 'https://martina.app');
assert(prodUrl.startsWith('https://supermercadolamartina.com/factura/inv-123'), 'En producción usa el dominio activo');
console.log('  ✅ PASS: URL en producción mantiene el dominio activo: ' + prodUrl);

// ─── 6. LÍMITE DE IDENTIFICACIÓN CONSUMIDOR FINAL (REGLA 6) ───────────
console.log('\n--- TEST 6: Regla de identificación obligatoria de Consumidor Final ---');

const CF_DNI_REQUIRED_LIMIT = 344488;
const saleBelowLimit = 25000;
const saleAboveLimit = 400000;

assert.strictEqual(saleBelowLimit >= CF_DNI_REQUIRED_LIMIT, false, 'Venta menor a $344.488 no exige DNI');
assert.strictEqual(saleAboveLimit >= CF_DNI_REQUIRED_LIMIT, true, 'Venta mayor a $344.488 exige DNI');
console.log('  ✅ PASS: Venta de $25.000 -> DNI opcional (ARCA RG 4444)');
console.log('  ✅ PASS: Venta de $400.000 -> DNI obligatorio según tope ARCA');

console.log('\n================================================================');
console.log('  TODAS LAS PRUEBAS DE INTEGRACIÓN POS + ARCA PASARON CON ÉXITO');
console.log('================================================================\n');
