import assert from 'assert';

console.log('================================================================');
console.log('  TEST SUITE: RECONCILIACIÓN ESTADO_DESCONOCIDO & IDEMPOTENCIA');
console.log('================================================================\n');

/**
 * Mock de la lógica de reconciliación determinista implementada en /api/arca/operations/:id/reconcile
 */
interface MockFiscalOperation {
  id: string;
  status: 'PENDIENTE' | 'AUTORIZADA' | 'RECHAZADA' | 'ESTADO_DESCONOCIDO' | 'ERROR_TECNICO';
  point_of_sale: number;
  invoice_type: string;
  proposed_voucher_number?: number | null;
  idempotency_key: string;
  request_payload: any;
  response_payload?: any;
}

interface MockArcaVoucher {
  CbteTipo: number;
  PtoVta: number;
  CbteNro: number;
  CodAutorizacion: string;
  FchVto: string;
  ImpTotal: number;
  DocTipo: number;
  DocNro: string | number;
  CbteFch: string;
}

function verifyVoucherMatch(
  operation: MockFiscalOperation,
  arcaVoucher: MockArcaVoucher
): { matched: boolean; reason?: string } {
  const req = operation.request_payload;

  // 1. Tipo y Punto de Venta
  if (arcaVoucher.PtoVta !== operation.point_of_sale) {
    return { matched: false, reason: 'Punto de venta no coincide con la operación' };
  }

  // 2. Número de comprobante exacto
  if (arcaVoucher.CbteNro !== operation.proposed_voucher_number) {
    return { matched: false, reason: `Número comprobante (${arcaVoucher.CbteNro}) no coincide con el propuesto (${operation.proposed_voucher_number})` };
  }

  // 3. CAE presente
  if (!arcaVoucher.CodAutorizacion || arcaVoucher.CodAutorizacion.trim().length !== 14) {
    return { matched: false, reason: 'Comprobante consultado en ARCA no posee CAE válido de 14 dígitos' };
  }

  // 4. Importe con tolerancia por redondeo decimal (0.05)
  const expectedTotal = Number(req.totalAmount);
  const actualTotal = Number(arcaVoucher.ImpTotal);
  if (Math.abs(expectedTotal - actualTotal) > 0.05) {
    return {
      matched: false,
      reason: `Discrepancia en importe: ARCA=${actualTotal}, Operación=${expectedTotal}`
    };
  }

  // 5. Documento del receptor si aplica
  if (req.customerDocumentNumber && req.customerDocumentNumber !== '0') {
    const cleanReqDoc = String(req.customerDocumentNumber).replace(/\D/g, '');
    const cleanArcaDoc = String(arcaVoucher.DocNro).replace(/\D/g, '');
    if (cleanReqDoc !== cleanArcaDoc) {
      return {
        matched: false,
        reason: `Discrepancia en documento: ARCA=${cleanArcaDoc}, Operación=${cleanReqDoc}`
      };
    }
  }

  return { matched: true };
}

function reconcileOperation(
  operation: MockFiscalOperation,
  existingInvoice: any | null,
  arcaVoucher: MockArcaVoucher | null,
  lastVoucherInArca: number
): {
  finalStatus: string;
  savedInvoice: boolean;
  ambiguous: boolean;
  message: string;
} {
  // Idempotencia: Si ya existía factura para esta clave, retornar éxito sin duplicar
  if (existingInvoice) {
    return {
      finalStatus: 'AUTORIZADA',
      savedInvoice: false,
      ambiguous: false,
      message: 'Factura ya existía previamente (idempotencia garantizada)'
    };
  }

  // Si no hay proposed_voucher_number
  if (!operation.proposed_voucher_number) {
    return {
      finalStatus: 'ESTADO_DESCONOCIDO',
      savedInvoice: false,
      ambiguous: true,
      message: 'No hay número propuesto persistido; requiere intervención manual'
    };
  }

  // Si el último comprobante en ARCA es estrictamente menor al propuesto, nunca llegó a emitirse
  if (lastVoucherInArca < operation.proposed_voucher_number) {
    return {
      finalStatus: 'ERROR_TECNICO',
      savedInvoice: false,
      ambiguous: false,
      message: 'Comprobante no existe en ARCA (el último emitido es anterior). Se libera la operación.'
    };
  }

  // Si ARCA devolvió comprobante, verificar coincidencia inequívoca
  if (arcaVoucher) {
    const match = verifyVoucherMatch(operation, arcaVoucher);
    if (match.matched) {
      return {
        finalStatus: 'AUTORIZADA',
        savedInvoice: true,
        ambiguous: false,
        message: 'Comprobante verificado inequívocamente en ARCA. Registrado en invoices.'
      };
    } else {
      // Discrepancia -> Mantener ESTADO_DESCONOCIDO para evitar colisiones
      return {
        finalStatus: 'ESTADO_DESCONOCIDO',
        savedInvoice: false,
        ambiguous: true,
        message: `Ambigüedad detectada: ${match.reason}. Se preserva ESTADO_DESCONOCIDO.`
      };
    }
  }

  return {
    finalStatus: 'ESTADO_DESCONOCIDO',
    savedInvoice: false,
    ambiguous: true,
    message: 'Respuesta indefinida de ARCA. Permanece ESTADO_DESCONOCIDO.'
  };
}

async function runTests() {
  console.log('--- TEST 1: Reconciliación exitosa cuando ARCA confirma el comprobante propuesto ---');
  {
    const operation: MockFiscalOperation = {
      id: 'op-100',
      status: 'ESTADO_DESCONOCIDO',
      point_of_sale: 1,
      invoice_type: 'B',
      proposed_voucher_number: 45,
      idempotency_key: 'idemp-100',
      request_payload: {
        totalAmount: 12500.50,
        customerDocumentNumber: '20304050607'
      }
    };

    const arcaVoucher: MockArcaVoucher = {
      CbteTipo: 6,
      PtoVta: 1,
      CbteNro: 45,
      CodAutorizacion: '74123456789012',
      FchVto: '20261001',
      ImpTotal: 12500.50,
      DocTipo: 80,
      DocNro: '20304050607',
      CbteFch: '20260921'
    };

    const result = reconcileOperation(operation, null, arcaVoucher, 45);
    assert.strictEqual(result.finalStatus, 'AUTORIZADA');
    assert.strictEqual(result.savedInvoice, true);
    assert.strictEqual(result.ambiguous, false);
    console.log('  ✅ PASS: Operación reconciliada a AUTORIZADA e invoice generada');
  }

  console.log('\n--- TEST 2: Idempotencia absoluta — Si ya existe invoice no se duplica ---');
  {
    const operation: MockFiscalOperation = {
      id: 'op-101',
      status: 'ESTADO_DESCONOCIDO',
      point_of_sale: 1,
      invoice_type: 'B',
      proposed_voucher_number: 46,
      idempotency_key: 'idemp-101',
      request_payload: { totalAmount: 5000, customerDocumentNumber: '0' }
    };

    const existingInvoice = { id: 'inv-existing-1', cae: '74123456789013' };
    const result = reconcileOperation(operation, existingInvoice, null, 46);
    assert.strictEqual(result.finalStatus, 'AUTORIZADA');
    assert.strictEqual(result.savedInvoice, false, 'No debe intentar re-guardar la invoice existente');
    console.log('  ✅ PASS: Idempotencia verificada: detecta factura previa y no re-inserta');
  }

  console.log('\n--- TEST 3: Descarte seguro cuando ARCA nunca recibió el comprobante ---');
  {
    const operation: MockFiscalOperation = {
      id: 'op-102',
      status: 'ESTADO_DESCONOCIDO',
      point_of_sale: 1,
      invoice_type: 'B',
      proposed_voucher_number: 50,
      idempotency_key: 'idemp-102',
      request_payload: { totalAmount: 8000 }
    };

    // Último en ARCA es 49 (menor a 50)
    const result = reconcileOperation(operation, null, null, 49);
    assert.strictEqual(result.finalStatus, 'ERROR_TECNICO');
    assert.strictEqual(result.savedInvoice, false);
    console.log('  ✅ PASS: Si último comprobante en ARCA < propuesto, pasa a ERROR_TECNICO y libera venta');
  }

  console.log('\n--- TEST 4: Bloqueo de asociación errónea por discrepancia de importe o CUIT ---');
  {
    const operation: MockFiscalOperation = {
      id: 'op-103',
      status: 'ESTADO_DESCONOCIDO',
      point_of_sale: 1,
      invoice_type: 'A',
      proposed_voucher_number: 12,
      idempotency_key: 'idemp-103',
      request_payload: {
        totalAmount: 10000.00,
        customerDocumentNumber: '20111111112'
      }
    };

    // ARCA tiene el comprobante 12 pero emitido a otro CUIT y por otro importe
    const conflictingArcaVoucher: MockArcaVoucher = {
      CbteTipo: 1,
      PtoVta: 1,
      CbteNro: 12,
      CodAutorizacion: '74123456789099',
      FchVto: '20261001',
      ImpTotal: 50000.00, // Discrepancia grave
      DocTipo: 80,
      DocNro: '30999999999', // Discrepancia de cliente
      CbteFch: '20260921'
    };

    const result = reconcileOperation(operation, null, conflictingArcaVoucher, 12);
    assert.strictEqual(result.finalStatus, 'ESTADO_DESCONOCIDO', 'Debe mantenerse en ESTADO_DESCONOCIDO');
    assert.strictEqual(result.ambiguous, true);
    assert.strictEqual(result.savedInvoice, false, 'NUNCA debe guardar invoice con datos ambiguos');
    console.log('  ✅ PASS: Discrepancia detectada inequívocamente; se preserva ESTADO_DESCONOCIDO sin asociar');
  }

  console.log('\n================================================================');
  console.log('  TODOS LOS TESTS DE RECONCILIACIÓN PASARON CON ÉXITO');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test falló con error:', err);
  process.exit(1);
});
