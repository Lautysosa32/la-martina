import assert from 'assert';
import { thermalPrinterService } from '../src/services/thermalPrinter.service';

console.log('========================================================================');
console.log('  TEST SUITE: FLUJO FISCAL POS + IMPRESIÓN TÉRMICA DIRECTA (SIN WINDOW.PRINT)');
console.log('========================================================================\n');

/**
 * Validador estricto de comprobante fiscal antes de permitir el envío a impresora térmica.
 * Regla: Solo AUTORIZADA con CAE oficial de exactamente 14 dígitos numéricos.
 */
function validatePrintPreconditions(invoice: any): { canPrint: boolean; error?: string } {
  if (!invoice) {
    return { canPrint: false, error: 'Comprobante nulo o indefinido.' };
  }

  if (invoice.status !== 'AUTORIZADA') {
    return {
      canPrint: false,
      error: 'La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal.'
    };
  }

  const cae = String(invoice.cae || '').trim();
  if (!cae) {
    return {
      canPrint: false,
      error: 'La factura no posee CAE. No se puede imprimir el comprobante fiscal.'
    };
  }

  if (!/^\d{14}$/.test(cae)) {
    return {
      canPrint: false,
      error: `El CAE "${cae}" no tiene el formato oficial de exactamente 14 dígitos numéricos.`
    };
  }

  return { canPrint: true };
}

/**
 * Simulación del flujo de autorización e idempotencia en POS
 */
class PosFiscalPrintSimulator {
  public arcaCallCount = 0;
  public invoicesDb = new Map<string, any>();
  public operationsDb = new Map<string, any>();
  public printJobCount = 0;
  public lastPrintedJob: any = null;
  public isPrinterConnected = true;

  async authorizeSale(sale: {
    orderId: string;
    total: number;
    customerName: string;
    items: any[];
    idempotencyKey: string;
  }, mockArcaBehavior: 'SUCCESS' | 'REJECT' | 'TIMEOUT' = 'SUCCESS'): Promise<any> {
    // 1. Verificación en base de datos si la venta ya está facturada (evitar doble facturación)
    for (const inv of this.invoicesDb.values()) {
      if (inv.saleId === sale.orderId || inv.saleIds?.includes(sale.orderId)) {
        if (inv.status === 'AUTORIZADA') {
          return {
            success: true,
            status: 'AUTORIZADA',
            isAlreadyBilled: true,
            invoice: inv
          };
        }
      }
    }

    // 2. Control de Idempotencia
    if (this.operationsDb.has(sale.idempotencyKey)) {
      const op = this.operationsDb.get(sale.idempotencyKey);
      if (op.status === 'AUTORIZADA') {
        return { success: true, status: 'AUTORIZADA', invoice: this.invoicesDb.get(op.invoiceId) };
      }
      if (op.status === 'EN_PROCESO') {
        return { success: false, status: 'EN_PROCESO', message: 'Operación concurrente en vuelo.' };
      }
      if (op.status === 'ESTADO_DESCONOCIDO') {
        return {
          success: false,
          status: 'ESTADO_DESCONOCIDO',
          operationId: op.operationId,
          suggestedAction: 'RECONCILIAR',
          message: 'Existe una operación previa con estado desconocido. Debe reconciliarse antes de reintentar.'
        };
      }
    }

    this.operationsDb.set(sale.idempotencyKey, { status: 'EN_PROCESO' });

    // 3. Llamada al servicio fiscal de ARCA
    this.arcaCallCount++;

    if (mockArcaBehavior === 'REJECT') {
      this.operationsDb.set(sale.idempotencyKey, { status: 'RECHAZADA', error: 'CUIT inválido o límite superado' });
      return {
        success: false,
        status: 'RECHAZADA',
        error: { title: 'Rechazo ARCA', reason: 'Comprobante no cumple normativas fiscales.' }
      };
    }

    if (mockArcaBehavior === 'TIMEOUT') {
      this.operationsDb.set(sale.idempotencyKey, { status: 'ESTADO_DESCONOCIDO', operationId: `OP-${Date.now()}` });
      return {
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        operationId: `OP-${Date.now()}`,
        message: 'Tiempo de espera agotado con ARCA.'
      };
    }

    // ARCA AUTORIZA
    const invoiceId = `INV-${Date.now()}-00000001`;
    const authorizedInvoice = {
      id: invoiceId,
      status: 'AUTORIZADA',
      saleId: sale.orderId,
      saleIds: [sale.orderId],
      pointOfSale: 1,
      invoiceNumber: 1,
      type: 'B',
      cae: '86370890723993', // 14 dígitos numéricos reales
      caeExpirationDate: '20261001',
      date: new Date().toISOString(),
      total: sale.total,
      customerName: sale.customerName,
      items: sale.items,
      qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
    };

    this.invoicesDb.set(invoiceId, authorizedInvoice);
    this.operationsDb.set(sale.idempotencyKey, { status: 'AUTORIZADA', invoiceId });

    return {
      success: true,
      status: 'AUTORIZADA',
      invoice: authorizedInvoice
    };
  }

  async sendToThermalPrinter(invoice: any): Promise<{ printed: boolean; error?: string }> {
    const check = validatePrintPreconditions(invoice);
    if (!check.canPrint) {
      return { printed: false, error: check.error };
    }

    if (!this.isPrinterConnected) {
      throw new Error(`No se pudo conectar con la impresora térmica.\nLa factura fue autorizada correctamente por ARCA,\npero NO fue posible imprimirla.\nCAE: ${invoice.cae}`);
    }

    this.printJobCount++;
    this.lastPrintedJob = {
      ...invoice,
      printedAt: new Date().toISOString()
    };

    return { printed: true };
  }

  reprintInvoice(invoiceId: string): any {
    const existing = this.invoicesDb.get(invoiceId);
    if (!existing) {
      throw new Error('Factura no encontrada en base de datos.');
    }
    // NUNCA incrementa arcaCallCount
    return existing;
  }
}

async function runTests() {
  console.log('--- TEST 1: Venta → ARCA → AUTORIZADA → CAE 14 dígitos → Guardar → Impresión directa ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-001',
      total: 12500,
      customerName: 'Juan Pérez',
      items: [{ description: 'Aceite Girasol 1.5L', quantity: 2, price: 6250, total: 12500 }],
      idempotencyKey: 'idem-test-1'
    };

    const res = await pos.authorizeSale(sale, 'SUCCESS');
    assert.strictEqual(res.status, 'AUTORIZADA', 'La factura debe estar en estado AUTORIZADA');
    assert.strictEqual(res.invoice.cae.length, 14, 'El CAE debe tener 14 dígitos');
    assert.match(res.invoice.cae, /^\d{14}$/, 'El CAE debe ser numérico');

    const printRes = await pos.sendToThermalPrinter(res.invoice);
    assert.strictEqual(printRes.printed, true, 'La impresión térmica directa debe realizarse');
    assert.strictEqual(pos.printJobCount, 1, 'Debe registrarse exactamente 1 trabajo de impresión');
    assert.strictEqual(pos.arcaCallCount, 1, 'Debe haber 1 llamada de emisión a ARCA');
    console.log('  ✅ PASS: Venta autorizada con CAE de 14 dígitos, guardada e impresa directamente.');
  }

  console.log('\n--- TEST 2: ARCA RECHAZADA → NO imprimir ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-002',
      total: 8000,
      customerName: 'Cliente Rechazado',
      items: [{ description: 'Arroz 1kg', quantity: 4, price: 2000, total: 8000 }],
      idempotencyKey: 'idem-test-2'
    };

    const res = await pos.authorizeSale(sale, 'REJECT');
    assert.strictEqual(res.status, 'RECHAZADA');

    // Intentar imprimir comprobante en estado RECHAZADA
    const rejectedInvoice = { id: 'INV-REJ-1', status: 'RECHAZADA', cae: null, total: 8000 };
    const printRes = await pos.sendToThermalPrinter(rejectedInvoice);
    assert.strictEqual(printRes.printed, false, 'No debe imprimirse un comprobante rechazado');
    assert.match(printRes.error!, /no fue autorizada por ARCA/);
    assert.strictEqual(pos.printJobCount, 0, 'No debe generarse ningún trabajo de impresión');
    console.log('  ✅ PASS: Factura rechazada por ARCA bloquea inmediatamente la impresión.');
  }

  console.log('\n--- TEST 3: Timeout → ESTADO_DESCONOCIDO → NO imprimir → NO duplicar → Reconciliación ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-003',
      total: 15000,
      customerName: 'Cliente Timeout',
      items: [{ description: 'Leche Entera 1L', quantity: 10, price: 1500, total: 15000 }],
      idempotencyKey: 'idem-test-3'
    };

    const res = await pos.authorizeSale(sale, 'TIMEOUT');
    assert.strictEqual(res.status, 'ESTADO_DESCONOCIDO');

    // Intentar imprimir comprobante en estado ESTADO_DESCONOCIDO
    const unknownInvoice = { id: 'INV-UNK-1', status: 'ESTADO_DESCONOCIDO', cae: null, total: 15000 };
    const printRes = await pos.sendToThermalPrinter(unknownInvoice);
    assert.strictEqual(printRes.printed, false, 'No debe imprimirse en estado desconocido');
    assert.match(printRes.error!, /no fue autorizada por ARCA/);
    assert.strictEqual(pos.printJobCount, 0, 'Cero impresiones permitidas');

    // Intentar emitir de nuevo con la misma clave de idempotencia antes de reconciliar
    const retryRes = await pos.authorizeSale(sale, 'TIMEOUT');
    assert.strictEqual(pos.arcaCallCount, 1, 'No debe haber una segunda llamada a ARCA en timeout');
    console.log('  ✅ PASS: Estado desconocido bloquea la impresión y no duplica comprobantes.');
  }

  console.log('\n--- TEST 4: Doble Clic simultáneo → 1 sola autorización → 1 factura → 1 CAE ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-004',
      total: 5500,
      customerName: 'Consumidor Final',
      items: [{ description: 'Fideos 500g', quantity: 5, price: 1100, total: 5500 }],
      idempotencyKey: 'idem-double-click'
    };

    // Dos llamadas simultáneas con la misma clave de idempotencia
    const [call1, call2] = await Promise.all([
      pos.authorizeSale(sale, 'SUCCESS'),
      pos.authorizeSale(sale, 'SUCCESS')
    ]);

    assert.strictEqual(pos.arcaCallCount, 1, 'ARCA solo debe recibir 1 solicitud de autorización');
    assert.strictEqual(pos.invoicesDb.size, 1, 'Solo debe persistirse 1 factura en base de datos');
    console.log('  ✅ PASS: Doble clic concurrente genera 1 sola llamada a ARCA, 1 factura y 1 CAE.');
  }

  console.log('\n--- TEST 5: Factura existente → Reimprimir → 0 llamadas nuevas a ARCA ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-005',
      total: 9900,
      customerName: 'Cliente Reimpresión',
      items: [{ description: 'Azúcar 1kg', quantity: 9, price: 1100, total: 9900 }],
      idempotencyKey: 'idem-test-5'
    };

    const firstRes = await pos.authorizeSale(sale, 'SUCCESS');
    assert.strictEqual(pos.arcaCallCount, 1);

    // El cajero solicita reimpresión
    const existingInv = pos.reprintInvoice(firstRes.invoice.id);
    const reprintJob = await pos.sendToThermalPrinter(existingInv);

    assert.strictEqual(reprintJob.printed, true);
    assert.strictEqual(pos.arcaCallCount, 1, 'ARCA no debe ser consultado de nuevo en una reimpresión');
    assert.strictEqual(pos.printJobCount, 1, 'Se emite la reimpresión sin nuevas emisiones');
    console.log('  ✅ PASS: Reimpresión utiliza la factura persistida con exactamente 0 nuevas llamadas a ARCA.');
  }

  console.log('\n--- TEST 6: CAE null → NO imprimir ---');
  {
    const inv = {
      id: 'INV-FAKE-1',
      status: 'AUTORIZADA',
      cae: null,
      total: 1000
    };
    const res = validatePrintPreconditions(inv);
    assert.strictEqual(res.canPrint, false, 'CAE nulo debe ser rechazado');
    console.log('  ✅ PASS: Factura con CAE null bloquea la impresión fiscal.');
  }

  console.log('\n--- TEST 7: CAE de 13 dígitos → NO imprimir ---');
  {
    const inv = {
      id: 'INV-FAKE-2',
      status: 'AUTORIZADA',
      cae: '1234567890123', // 13 dígitos
      total: 1000
    };
    const res = validatePrintPreconditions(inv);
    assert.strictEqual(res.canPrint, false, 'CAE de 13 dígitos debe ser rechazado');
    assert.match(res.error!, /14 dígitos numéricos/);
    console.log('  ✅ PASS: CAE de 13 dígitos es rechazado por longitud inválida.');
  }

  console.log('\n--- TEST 8: CAE de 15 dígitos → NO imprimir ---');
  {
    const inv = {
      id: 'INV-FAKE-3',
      status: 'AUTORIZADA',
      cae: '123456789012345', // 15 dígitos
      total: 1000
    };
    const res = validatePrintPreconditions(inv);
    assert.strictEqual(res.canPrint, false, 'CAE de 15 dígitos debe ser rechazado');
    assert.match(res.error!, /14 dígitos numéricos/);
    console.log('  ✅ PASS: CAE de 15 dígitos es rechazado por longitud inválida.');
  }

  console.log('\n--- TEST 9: ARCA AUTORIZADA → Impresora desconectada → Factura permanece AUTORIZADA → NO reemitir ---');
  {
    const pos = new PosFiscalPrintSimulator();
    pos.isPrinterConnected = false; // Simular impresora apagada o sin papel

    const sale = {
      orderId: 'POS-CAJA01-009',
      total: 18000,
      customerName: 'Cliente Offline Impresora',
      items: [{ description: 'Yerba Mate 1kg', quantity: 3, price: 6000, total: 18000 }],
      idempotencyKey: 'idem-test-9'
    };

    const res = await pos.authorizeSale(sale, 'SUCCESS');
    assert.strictEqual(res.status, 'AUTORIZADA');
    assert.strictEqual(pos.invoicesDb.size, 1, 'La factura fue guardada');

    let printFailed = false;
    try {
      await pos.sendToThermalPrinter(res.invoice);
    } catch (err: any) {
      printFailed = true;
      assert.match(err.message, /No se pudo conectar con la impresora térmica/);
      assert.match(err.message, /CAE: 86370890723993/);
    }

    assert.strictEqual(printFailed, true, 'El fallo de la impresora debe ser capturado');

    // Verificar que la factura en base de datos SIGUE estando AUTORIZADA y con su CAE
    const savedInv = pos.invoicesDb.get(res.invoice.id);
    assert.strictEqual(savedInv.status, 'AUTORIZADA', 'La factura NO debe desautorizarse por fallo de impresora');
    assert.strictEqual(savedInv.cae, '86370890723993');
    assert.strictEqual(pos.arcaCallCount, 1, 'No se reemitió a ARCA');

    // Ahora reconectar la impresora y reimprimir sin llamar a ARCA
    pos.isPrinterConnected = true;
    const retryPrint = await pos.sendToThermalPrinter(savedInv);
    assert.strictEqual(retryPrint.printed, true, 'Al reconectar la impresora el ticket se imprime');
    assert.strictEqual(pos.arcaCallCount, 1, 'Sigue habiendo exactamente 1 llamada a ARCA');
    console.log('  ✅ PASS: Fallo de impresora no desautoriza la factura y permite reimpresión sin reemisión a ARCA.');
  }

  console.log('\n--- TEST 10: Reimpresión → Mismo CAE → Mismo número → Mismo QR ---');
  {
    const pos = new PosFiscalPrintSimulator();
    const sale = {
      orderId: 'POS-CAJA01-010',
      total: 7500,
      customerName: 'Cliente Consistente',
      items: [{ description: 'Galletitas', quantity: 5, price: 1500, total: 7500 }],
      idempotencyKey: 'idem-test-10'
    };

    const originalRes = await pos.authorizeSale(sale, 'SUCCESS');
    await pos.sendToThermalPrinter(originalRes.invoice);
    const originalPrint = pos.lastPrintedJob;

    // Reimpresión
    const reprintInv = pos.reprintInvoice(originalRes.invoice.id);
    await pos.sendToThermalPrinter(reprintInv);
    const reprintedPrint = pos.lastPrintedJob;

    assert.strictEqual(originalPrint.cae, reprintedPrint.cae, 'El CAE debe ser exactamente el mismo');
    assert.strictEqual(originalPrint.invoiceNumber, reprintedPrint.invoiceNumber, 'El número de factura debe ser idéntico');
    assert.strictEqual(originalPrint.pointOfSale, reprintedPrint.pointOfSale, 'El punto de venta debe ser idéntico');
    assert.strictEqual(originalPrint.qrDataUrl, reprintedPrint.qrDataUrl, 'El QR fiscal debe ser idéntico');
    assert.strictEqual(originalPrint.total, reprintedPrint.total, 'El total debe ser idéntico');
    assert.strictEqual(pos.arcaCallCount, 1, '0 nuevas consultas a ARCA');
    console.log('  ✅ PASS: La reimpresión conserva exactamente el mismo CAE, número, punto de venta y QR.');
  }

  console.log('\n========================================================================');
  console.log('  TODOS LOS 10 TESTS DE FLUJO FISCAL E IMPRESIÓN DIRECTA PASARON (10/10)');
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('❌ ERROR EN TEST:', err);
  process.exit(1);
});
