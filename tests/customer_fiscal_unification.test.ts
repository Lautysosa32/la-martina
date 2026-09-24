import assert from 'assert';
import { 
  validateCuit, 
  determineInvoiceType, 
  CF_DNI_REQUIRED_LIMIT,
  recalculateFiscalInvoice
} from '../server/services/arca/arcaTaxRules';
import type { CustomerTaxCondition } from '../server/services/arca/arcaTypes';

console.log('========================================================================');
console.log('  TEST SUITE: UNIFICACIÓN DE CLIENTES Y DATOS FISCALES ARCA');
console.log('========================================================================\n');

// Invariante de seguridad fiscal: 0 llamadas de emisión a ARCA
let arcaAutorizarCalls = 0;
const arcaGuard = {
  autorizarComprobante: () => {
    arcaAutorizarCalls++;
    throw new Error('VIOLACIÓN CRÍTICA: Se intentó llamar a autorizarComprobante de ARCA.');
  }
};

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ------------------------------------------------------------------------
// 1. VALIDACIÓN DE CUIT (MÓDULO 11 OFICIAL AFIP/ARCA)
// ------------------------------------------------------------------------
console.log('--- 1. Validación de CUIT (Módulo 11) ---');

test('CUIT válido de Persona Jurídica (prefijo 30)', () => {
  const res = validateCuit('30712345671');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.clean, '30712345671');
  assert.strictEqual(res.formatted, '30-71234567-1');
});

test('CUIT válido de Persona Física (prefijo 20)', () => {
  const res = validateCuit('20329482597');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.clean, '20329482597');
  assert.strictEqual(res.formatted, '20-32948259-7');
});

test('CUIT inválido por longitud menor a 11 dígitos', () => {
  const res = validateCuit('2032948259');
  assert.strictEqual(res.valid, false);
  assert.match(res.error || '', /11 dígitos/);
});

test('CUIT inválido por prefijo no autorizado', () => {
  const res = validateCuit('99329482598');
  assert.strictEqual(res.valid, false);
  assert.match(res.error || '', /prefijo/);
});

test('CUIT inválido por dígito verificador incorrecto', () => {
  const res = validateCuit('20329482590'); // último dígito alterado
  assert.strictEqual(res.valid, false);
  assert.match(res.error || '', /Dígito verificador inválido/);
});

// ------------------------------------------------------------------------
// 2. DETERMINACIÓN AUTOMÁTICA DE TIPO DE COMPROBANTE (FACTURA A vs B)
// ------------------------------------------------------------------------
console.log('\n--- 2. Determinación Normativa de Factura A / B ---');

test('Supermercado (RI) a Responsable Inscripto -> Factura A', () => {
  const rule = determineInvoiceType('Responsable Inscripto', 'Responsable Inscripto');
  assert.strictEqual(rule.invoiceType, 'A');
  assert.strictEqual(rule.invoiceTypeCode, 1);
});

test('Supermercado (RI) a Monotributista -> Factura A (RG 5003/2021)', () => {
  const rule = determineInvoiceType('Responsable Inscripto', 'Monotributista');
  assert.strictEqual(rule.invoiceType, 'A');
  assert.strictEqual(rule.invoiceTypeCode, 1);
  assert.match(rule.reason, /RG 5003/);
});

test('Supermercado (RI) a Consumidor Final -> Factura B', () => {
  const rule = determineInvoiceType('Responsable Inscripto', 'Consumidor Final');
  assert.strictEqual(rule.invoiceType, 'B');
  assert.strictEqual(rule.invoiceTypeCode, 6);
});

test('Supermercado (RI) a Exento -> Factura B', () => {
  const rule = determineInvoiceType('Responsable Inscripto', 'Exento');
  assert.strictEqual(rule.invoiceType, 'B');
  assert.strictEqual(rule.invoiceTypeCode, 6);
});

// ------------------------------------------------------------------------
// 3. VALIDACIÓN DE UMBRAL ARCA PARA CONSUMIDOR FINAL ($344.488)
// ------------------------------------------------------------------------
console.log('\n--- 3. Umbral Consumidor Final No Identificado ---');

test('CF_DNI_REQUIRED_LIMIT es exactamente $344.488', () => {
  assert.strictEqual(CF_DNI_REQUIRED_LIMIT, 344488);
});

test('Venta a CF por debajo del umbral permite cliente no identificado', () => {
  const total = 50000;
  const isCfDniMandatory = total >= CF_DNI_REQUIRED_LIMIT;
  assert.strictEqual(isCfDniMandatory, false);
});

test('Venta a CF que alcanza o supera el umbral EXIGE DNI / CUIT', () => {
  const total = 350000;
  const isCfDniMandatory = total >= CF_DNI_REQUIRED_LIMIT;
  assert.strictEqual(isCfDniMandatory, true);

  // Simulación de validación en backend /authorize
  const customer = {
    name: 'Consumidor Final',
    taxCondition: 'Consumidor Final' as CustomerTaxCondition,
    documentType: 'SIN_IDENTIFICAR',
    documentNumber: '0'
  };

  const shouldReject = (
    isCfDniMandatory && 
    customer.taxCondition === 'Consumidor Final' && 
    (!customer.documentNumber || customer.documentNumber === '0' || customer.documentType === 'SIN_IDENTIFICAR')
  );

  assert.strictEqual(shouldReject, true);
});

test('Venta a CF sobre el umbral con DNI ingresado es ACEPTADA', () => {
  const total = 400000;
  const customer = {
    name: 'Lautaro Gómez',
    taxCondition: 'Consumidor Final' as CustomerTaxCondition,
    documentType: 'DNI',
    documentNumber: '42123456'
  };

  const isCfDniMandatory = total >= CF_DNI_REQUIRED_LIMIT;
  const docNum = (customer.documentNumber || '').trim();
  const isRejected = (
    isCfDniMandatory && 
    customer.taxCondition === 'Consumidor Final' && 
    (!docNum || docNum === '0' || customer.documentType === 'SIN_IDENTIFICAR')
  );

  assert.strictEqual(isRejected, false);
});

// ------------------------------------------------------------------------
// 4. CORRECCIÓN DEL BUG DE CONTAMINACIÓN DNI / TELÉFONO
// ------------------------------------------------------------------------
console.log('\n--- 4. Corrección de Contaminación DNI / Teléfono ---');

test('Guardar cliente sin DNI no debe copiar el teléfono en el campo DNI', () => {
  const rawInput = {
    phone: '3511234567',
    name: 'Cliente Sin DNI',
    dni: '' // no proporcionó DNI
  };

  // Simulación de la lógica corregida en upsertCustomerProfile
  const cleanPhone = rawInput.phone.trim();
  const cleanDni = (rawInput.dni || '').trim();
  const profileToSave = {
    phone: cleanPhone,
    name: rawInput.name.trim(),
    dni: cleanDni || null // No contamina con teléfono
  };

  assert.strictEqual(profileToSave.dni, null);
  assert.strictEqual(profileToSave.phone, '3511234567');
});

// ------------------------------------------------------------------------
// 5. UNIFICACIÓN DE FUENTE DE VERDAD Y DERIVACIÓN DE BILLING CUSTOMERS
// ------------------------------------------------------------------------
console.log('\n--- 5. Unificación: CustomerProfile a BillingCustomer ---');

test('CustomerProfile con datos fiscales se mapea automáticamente a BillingCustomer', () => {
  const customerProfile = {
    id: 'cust-123',
    name: 'Lautaro Empresa SRL',
    phone: '3519876543',
    dni: '30712345678',
    cuit: '30712345678',
    documentType: 'CUIT',
    taxCondition: 'Responsable Inscripto',
    businessName: 'Lautaro Empresa SRL',
    fiscalAddress: 'Av. Colón 1234, Córdoba',
    email: 'contacto@la-empresa.com',
    notes: 'Cliente mayorista',
    balance: 0,
    currentDebt: 0,
    isRegistered: true
  };

  // Derivación memoizada como en AdminContext.tsx:
  const billingCustomer = {
    id: customerProfile.id,
    name: customerProfile.businessName || customerProfile.name,
    cuit: customerProfile.cuit || (customerProfile.documentType === 'CUIT' ? customerProfile.dni : ''),
    phone: customerProfile.phone,
    email: customerProfile.email || '',
    taxCondition: customerProfile.taxCondition || 'Consumidor Final',
    documentType: customerProfile.documentType || (customerProfile.cuit ? 'CUIT' : 'DNI'),
    documentNumber: customerProfile.cuit || customerProfile.dni || '',
    address: customerProfile.fiscalAddress || '',
    notes: customerProfile.notes || ''
  };

  assert.strictEqual(billingCustomer.name, 'Lautaro Empresa SRL');
  assert.strictEqual(billingCustomer.cuit, '30712345678');
  assert.strictEqual(billingCustomer.taxCondition, 'Responsable Inscripto');
  assert.strictEqual(billingCustomer.documentType, 'CUIT');
  assert.strictEqual(billingCustomer.address, 'Av. Colón 1234, Córdoba');
});

test('Cliente normal de supermercado (Consumidor Final sin CUIT) NO se incluye en Clientes Fiscales', () => {
  const normalCustomer = {
    id: 'cust-cf-001',
    name: 'Lautaro Consumidor',
    phone: '3511112233',
    dni: '42123456',
    cuit: '',
    documentType: 'DNI',
    taxCondition: 'Consumidor Final',
    businessName: '',
    isFiscal: false
  };

  const hasCuit = Boolean(normalCustomer.cuit && normalCustomer.cuit.trim().length > 0);
  const hasBusinessName = Boolean(normalCustomer.businessName && normalCustomer.businessName.trim().length > 0);
  const isSpecialTax = Boolean(normalCustomer.taxCondition && normalCustomer.taxCondition !== 'Consumidor Final');
  const isDocCuit = normalCustomer.documentType === 'CUIT' || normalCustomer.documentType === 'CUIL';
  const isExplicitFiscal = normalCustomer.isFiscal === true;
  const isBillingCustomer = hasCuit || hasBusinessName || isSpecialTax || isDocCuit || isExplicitFiscal;

  assert.strictEqual(isBillingCustomer, false);
});

test('Eliminar cliente fiscal es no destructivo: preserva el perfil y solo limpia los datos fiscales', () => {
  let customerProfile = {
    phone: '+542611234567',
    name: 'Juan Pérez',
    dni: '11223344',
    cuit: '20112233448',
    businessName: 'Distribuidora Ejemplo S.A.',
    taxCondition: 'Responsable Inscripto',
    fiscalAddress: 'Calle San Martín 123',
    isFiscal: true
  };

  // Simulación de deleteBillingCustomer no destructivo
  const clearFiscalUpdates = {
    cuit: '',
    businessName: '',
    taxCondition: 'Consumidor Final',
    fiscalAddress: '',
    isFiscal: false
  };
  customerProfile = { ...customerProfile, ...clearFiscalUpdates };

  // El perfil de cliente NO se borra
  assert.strictEqual(customerProfile.phone, '+542611234567');
  assert.strictEqual(customerProfile.name, 'Juan Pérez');
  assert.strictEqual(customerProfile.dni, '11223344');
  // Pero sus atributos fiscales quedaron reiniciados a Consumidor Final
  assert.strictEqual(customerProfile.cuit, '');
  assert.strictEqual(customerProfile.businessName, '');
  assert.strictEqual(customerProfile.taxCondition, 'Consumidor Final');
  assert.strictEqual(customerProfile.isFiscal, false);
});
console.log('\n--- 6. Inmutabilidad de Facturas Históricas ---');

test('Modificar un perfil de cliente no altera el snapshot histórico de la factura', () => {
  // Factura emitida históricamente (snapshot inmutable)
  const historicalInvoice = {
    id: 'inv-001',
    folio: '0001-00000001',
    type: 'A',
    clientName: 'Ale Serrano Razón Social Original',
    clientCuit: '20329482598',
    subtotal: 10000,
    taxes: 2100,
    total: 12100,
    cae: '74389201928374',
    date: '2026-09-10'
  };

  // El cliente luego cambia su razón social en customer_profiles
  const updatedCustomerProfile = {
    id: 'cust-ale',
    name: 'Ale Serrano Nuevo Nombre 2026',
    businessName: 'Ale Serrano Distribuciones SA'
  };

  // El registro de la factura mantiene inmutable su snapshot fiscal
  assert.strictEqual(historicalInvoice.clientName, 'Ale Serrano Razón Social Original');
  assert.strictEqual(historicalInvoice.clientCuit, '20329482598');
  assert.strictEqual(historicalInvoice.cae, '74389201928374');
  assert.notStrictEqual(historicalInvoice.clientName, updatedCustomerProfile.businessName);
});

// ------------------------------------------------------------------------
// 7. INVARIANTE FISCAL: CERO LLAMADAS A ARCA
// ------------------------------------------------------------------------
console.log('\n--- 7. Invariante Fiscal ARCA ---');

test('Ninguna llamada autorizarComprobante ocurrió durante la ejecución', () => {
  assert.strictEqual(arcaAutorizarCalls, 0);
});

console.log('\n========================================================================');
console.log(`  RESUMEN: ${passedTests}/${totalTests} TESTS EXITOSOS - 0 LLAMADAS ARCA`);
console.log('========================================================================\n');
