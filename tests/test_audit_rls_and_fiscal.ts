import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { FiscalRepository } from '../server/db/fiscalRepository';

dotenv.config();

async function runRlsAudit() {
  console.log('================================================================');
  console.log('  AUDITORÍA DE RLS, AISLAMIENTO BACKEND Y PERSISTENCIA SUPABASE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const backendRepo = new FiscalRepository();
  const testIdempotencyKey = `AUDIT-TEST-IDEMP-${Date.now()}`;
  const testOpId = `AUDIT-OP-${Date.now()}`;

  // ─── A) Insertar en fiscal_invoice_operations desde Backend ───────
  console.log('--- A) Inserción en fiscal_invoice_operations desde Backend ---');
  assert(backendRepo.isServiceRoleConfigured === true, '[BACKEND ADMIN] Clave administrativa Supabase detectada y configurada');

  const insertResult = await backendRepo.createOperation({
    id: testOpId,
    idempotency_key: testIdempotencyKey,
    operation_type: 'AUTHORIZE_INVOICE',
    sale_ids: ['SALE-AUDIT-001'],
    point_of_sale: 1,
    invoice_type: 'B',
    invoice_type_code: 6,
    status: 'EN_PROCESO',
    request_hash: 'audit_test_hash'
  });

  assert(insertResult.success === true, `[BACKEND ADMIN] Inserción exitosa en fiscal_invoice_operations (Sin error 42501). ID: ${insertResult.data?.id}`);

  // ─── B) Actualizar en fiscal_invoice_operations desde Backend ─────
  console.log('\n--- B) Actualización en fiscal_invoice_operations desde Backend ---');
  const updateResult = await backendRepo.updateOperation(testIdempotencyKey, {
    status: 'RECHAZADA',
    error_code: 'TEST_ERR',
    error_message: 'Actualización de prueba exitosa'
  });

  assert(updateResult === true, '[BACKEND ADMIN] Actualización exitosa en fiscal_invoice_operations');

  const fetchedOp = await backendRepo.getOperationByIdempotencyKey(testIdempotencyKey);
  assert(fetchedOp?.status === 'RECHAZADA' && fetchedOp.error_code === 'TEST_ERR', '[BACKEND ADMIN] Registro verificado con estado actualizado en PostgreSQL');

  // Limpiar registro de prueba
  await (backendRepo as any).client.from('fiscal_invoice_operations').delete().eq('idempotency_key', testIdempotencyKey);

  // ─── C) Persistencia de fiscal_access_tickets desde Backend ───────
  console.log('\n--- C) Persistencia de fiscal_access_tickets en PostgreSQL ---');
  const testService = 'test_service';
  await backendRepo.saveAccessTicket({
    service: testService,
    token: 'TEST_TOKEN_XYZ',
    sign: 'TEST_SIGN_XYZ',
    generation_time: new Date().toISOString(),
    expiration_time: new Date(Date.now() + 3600000).toISOString()
  });

  const fetchedTicket = await backendRepo.getAccessTicket(testService);
  assert(fetchedTicket?.token === 'TEST_TOKEN_XYZ', '[BACKEND ADMIN] Ticket de acceso persistido y recuperado exitosamente en PostgreSQL');

  // Limpiar ticket de prueba
  await (backendRepo as any).client.from('fiscal_access_tickets').delete().eq('service', testService);

  // ─── D) Verificación de RLS en Frontend (Cliente Anon) ────────────
  console.log('\n--- D) Verificación de Seguridad RLS en Frontend (Anon Key) ---');
  const anonClient = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');
  
  // 1. Intentar insertar en fiscal_invoice_operations con la clave pública de frontend
  const { data: anonData, error: anonError } = await anonClient
    .from('fiscal_invoice_operations')
    .insert({
      id: `ANON-ILLEGAL-${Date.now()}`,
      idempotency_key: `ANON-KEY-${Date.now()}`,
      operation_type: 'AUTHORIZE_INVOICE',
      sale_ids: ['ILLEGAL'],
      point_of_sale: 1,
      invoice_type: 'B',
      invoice_type_code: 6,
      status: 'EN_PROCESO',
      request_hash: 'illegal_hash'
    });

  assert(Boolean(anonError), '[FRONTEND SECURITY] Inserción desde frontend bloqueada por RLS');
  assert(anonError?.code === '42501', `[FRONTEND SECURITY] Error retornado es exactamente 42501 (RLS Policy Violation): "${anonError?.message}"`);

  // 2. Intentar insertar en fiscal_access_tickets con la clave pública de frontend
  const { error: anonTicketError } = await anonClient
    .from('fiscal_access_tickets')
    .insert({
      service: 'illegal_service',
      token: 'T',
      sign: 'S',
      generation_time: new Date().toISOString(),
      expiration_time: new Date().toISOString()
    });

  assert(Boolean(anonTicketError), '[FRONTEND SECURITY] Acceso de escritura a tickets bloqueado para anon');

  // ─── E) Verificación de Bundle Frontend (Sin Secretos) ────────────
  console.log('\n--- E) Verificación de Ausencia de Secretos en Bundle Vite ---');
  const distDir = path.resolve(process.cwd(), 'dist');
  assert(fs.existsSync(distDir), '[BUNDLE AUDIT] Directorio dist/ existe');

  let secretFoundInBundle = false;
  const secretKey = process.env.SUPABASE_SECRET_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  function checkDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
        checkDir(full);
      } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        const content = fs.readFileSync(full, 'utf8');
        if (secretKey && content.includes(secretKey)) secretFoundInBundle = true;
        if (serviceKey && content.includes(serviceKey)) secretFoundInBundle = true;
        if (content.includes('SUPABASE_SECRET_KEY') || content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
          secretFoundInBundle = true;
        }
      }
    }
  }

  checkDir(distDir);
  assert(secretFoundInBundle === false, '[BUNDLE AUDIT] Ningún secreto de Supabase (ni clave maestra ni nombres de variables de entorno secretas) existe en el bundle de producción de Vite');

  console.log('\n================================================================');
  console.log(`  RESULTADO AUDITORÍA: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runRlsAudit().catch(err => {
  console.error('Error fatal en auditoría RLS:', err);
  process.exit(1);
});
