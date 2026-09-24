import assert from 'assert';
import { requireAuth, requireRole } from '../server/middleware/auth.middleware';
import { validateAuthorizePayload, validateExternalInvoicePayload } from '../server/middleware/validation.middleware';

console.log('================================================================');
console.log('  TEST SUITE: BACKEND AUTHENTICATION & ARCA SECURITY MIDDLEWARE');
console.log('================================================================\n');

// Mock Express Request & Response helper
function createMockReqRes(headers: Record<string, string> = {}, body: any = {}) {
  const req: any = {
    headers: { ...headers },
    body: { ...body },
    query: {},
    path: '',
  };

  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getBody: () => jsonResponse,
  };

  let nextCalled = false;
  let nextError: any = null;
  const next = (err?: any) => {
    nextCalled = true;
    nextError = err;
  };

  return { req, res, next, isNextCalled: () => nextCalled, getNextError: () => nextError };
}

async function runTests() {
  // ─── 1. REQUIRE AUTH: MISSING OR MALFORMED TOKEN ──────────────────
  console.log('--- TEST 1: Rechazo de peticiones sin token o con formato inválido ---');

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    await requireAuth(req, res, next);
    assert.strictEqual(res.getStatusCode(), 401, 'Debe retornar 401 sin header');
    assert.strictEqual(res.getBody()?.error, 'Acceso no autorizado: Se requiere token de autenticación Bearer.');
    assert.strictEqual(isNextCalled(), false, 'Next no debe ser llamado');
    console.log('  ✅ PASS: 401 cuando falta Authorization header');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes({ authorization: 'Basic abc123xyz' });
    await requireAuth(req, res, next);
    assert.strictEqual(res.getStatusCode(), 401, 'Debe retornar 401 con esquema que no sea Bearer');
    assert.strictEqual(isNextCalled(), false, 'Next no debe ser llamado');
    console.log('  ✅ PASS: 401 cuando el esquema no es Bearer');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes({ authorization: 'Bearer ' });
    await requireAuth(req, res, next);
    assert.strictEqual(res.getStatusCode(), 401, 'Debe retornar 401 con Bearer token vacío');
    assert.strictEqual(isNextCalled(), false, 'Next no debe ser llamado');
    console.log('  ✅ PASS: 401 con Bearer token vacío');
  }

  // ─── 2. REQUIRE ROLE: RBAC PERMISSIONS ────────────────────────────
  console.log('\n--- TEST 2: Control de acceso basado en roles (RBAC) ---');

  const adminRoleCheck = requireRole(['admin']);
  const posRoleCheck = requireRole(['admin', 'cajero', 'repositor']);

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    // req.user no asignado
    adminRoleCheck(req, res, next);
    assert.strictEqual(res.getStatusCode(), 401, 'Debe retornar 401 si req.employee no está definido');
    assert.strictEqual(isNextCalled(), false);
    console.log('  ✅ PASS: Role check rechaza si req.employee no existe');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    req.user = { id: 'usr-1', email: 'cliente@test.com' };
    req.employee = { id: 'emp-1', user_id: 'usr-1', role: 'cliente', active: true, name: 'Cliente' };
    adminRoleCheck(req, res, next);
    assert.strictEqual(res.getStatusCode(), 403, 'Cliente debe ser bloqueado de funciones admin');
    assert.strictEqual(isNextCalled(), false);
    console.log('  ✅ PASS: 403 para usuario con rol "cliente" en ruta admin');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    req.user = { id: 'usr-2', email: 'cajero@test.com' };
    req.employee = { id: 'emp-2', user_id: 'usr-2', role: 'cajero', active: true, name: 'Cajero' };
    adminRoleCheck(req, res, next);
    assert.strictEqual(res.getStatusCode(), 403, 'Cajero debe ser bloqueado de rutas exclusivas de admin');
    assert.strictEqual(isNextCalled(), false);
    console.log('  ✅ PASS: 403 para cajero intentando acceder a ruta exclusiva de admin');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    req.user = { id: 'usr-3', email: 'cajero@test.com' };
    req.employee = { id: 'emp-3', user_id: 'usr-3', role: 'cajero', active: true, name: 'Cajero' };
    posRoleCheck(req, res, next);
    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(isNextCalled(), true, 'Cajero debe poder acceder a facturación');
    console.log('  ✅ PASS: Cajero tiene acceso a endpoints de emisión fiscal');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes();
    req.user = { id: 'usr-4', email: 'admin@test.com' };
    req.employee = { id: 'emp-4', user_id: 'usr-4', role: 'admin', active: true, name: 'Admin' };
    adminRoleCheck(req, res, next);
    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(isNextCalled(), true, 'Admin tiene acceso a endpoints admin');
    console.log('  ✅ PASS: Admin tiene acceso a endpoints de configuración/reconciliación');
  }

  // ─── 3. VALIDATION MIDDLEWARE: PAYLOAD INTEGRITY ───────────────────
  console.log('\n--- TEST 3: Validación estricta de payloads en Backend ---');

  {
    const { req, res, next, isNextCalled } = createMockReqRes({}, {
      // payload incompleto: sin idempotencyKey
      invoiceType: 'B',
      customerDocType: '96',
    });
    validateAuthorizePayload(req, res, next);
    assert.strictEqual(res.getStatusCode(), 400, 'Debe rechazar payload sin idempotencyKey');
    assert.strictEqual(isNextCalled(), false);
    console.log('  ✅ PASS: 400 en /authorize con payload incompleto');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes({}, {
      idempotencyKey: 'idemp-key-12345',
      pointOfSale: 1,
      invoiceType: 'B',
      customer: {
        name: 'Juan Perez',
        taxCondition: 'Consumidor Final',
      },
      items: [{ description: 'Aceite', quantity: 1, price: 1500 }],
    });
    validateAuthorizePayload(req, res, next);
    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(isNextCalled(), true, 'Debe pasar validación con payload completo');
    console.log('  ✅ PASS: Payload de /authorize válido pasa a siguiente middleware');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes({}, {
      // External invoice sin cae de 14 digitos
      pointOfSale: 1,
      invoiceType: 'B',
      invoiceNumber: 10,
      totalAmount: 500,
      customerName: 'Cliente Test',
      cae: '1234', // inválido
      caeExpirationDate: '2026-10-01'
    });
    validateExternalInvoicePayload(req, res, next);
    assert.strictEqual(res.getStatusCode(), 400, 'External invoice con CAE no de 14 dígitos debe ser rechazada');
    assert.strictEqual(isNextCalled(), false);
    console.log('  ✅ PASS: 400 en /external-invoices con CAE inválido');
  }

  {
    const { req, res, next, isNextCalled } = createMockReqRes({}, {
      pointOfSale: 1,
      invoiceType: 'B',
      invoiceNumber: 10,
      totalAmount: 500,
      customerName: 'Cliente Test',
      cae: '12345678901234',
      caeExpirationDate: '2026-10-01'
    });
    validateExternalInvoicePayload(req, res, next);
    assert.strictEqual(res.getStatusCode(), 200);
    assert.strictEqual(isNextCalled(), true, 'External invoice válida');
    console.log('  ✅ PASS: Payload de /external-invoices válido pasa correctamente');
  }

  console.log('\n================================================================');
  console.log('  TODOS LOS TESTS DE AUTH Y MIDDLEWARE PASARON CON ÉXITO');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test falló con error:', err);
  process.exit(1);
});
