import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import assert from 'assert';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Falta VITE_SUPABASE_URL o SUPABASE_SECRET_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runTests() {
  console.log('================================================================');
  console.log('  TEST: REPOSICIÓN INTELIGENTE EVENT-DRIVEN (PASO 1: BASE DE DATOS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Obtener o crear un producto de prueba
  console.log('--- 1. Preparación de producto de prueba ---');
  const testProductId = `test-prod-rep-${Date.now()}`;
  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .insert({
      id: testProductId,
      name: 'Producto Test Reposición Cola',
      stock: 20,
      price: 500,
      is_paused: false
    })
    .select()
    .single();

  testAssert(!prodErr && !!prod, `Producto de prueba insertado con ID: ${testProductId}`);

  try {
    // 2. Probar Trigger ante cambio de stock
    console.log('\n--- 2. Trigger de stock -> Encolado automático ---');
    // Actualizamos el stock de 20 a 10
    const { error: stockErr1 } = await supabase
      .from('products')
      .update({ stock: 10 })
      .eq('id', testProductId);

    testAssert(!stockErr1, 'Stock actualizado de 20 a 10');

    // Verificar que entró a replenishment_queue
    const { data: queueItems1, error: qErr1 } = await supabase
      .from('replenishment_queue')
      .select('*')
      .eq('product_id', testProductId)
      .eq('status', 'pending');

    testAssert(
      !qErr1 && queueItems1 && queueItems1.length === 1,
      'Trigger encoló el producto en replenishment_queue con status = "pending"'
    );
    testAssert(
      queueItems1?.[0]?.claimed_at === null && queueItems1?.[0]?.processed_at === null,
      'claimed_at y processed_at están inicialmente en NULL'
    );

    // 3. Probar Deduplicación: Vender de nuevo mientras sigue pendiente
    console.log('\n--- 3. Deduplicación e Idempotencia en Cola ---');
    // Actualizamos stock varias veces seguidas (simulando 3 ventas continuas)
    await supabase.from('products').update({ stock: 9 }).eq('id', testProductId);
    await supabase.from('products').update({ stock: 8 }).eq('id', testProductId);
    await supabase.from('products').update({ stock: 7 }).eq('id', testProductId);

    const { data: queueItemsDup } = await supabase
      .from('replenishment_queue')
      .select('*')
      .eq('product_id', testProductId)
      .eq('status', 'pending');

    testAssert(
      queueItemsDup?.length === 1,
      `Deduplicación exitosa: múltiples cambios de stock generaron exactamente 1 trabajo pendiente (Total: ${queueItemsDup?.length})`
    );

    // 4. Probar Prioridad alta si stock llega a 0
    console.log('\n--- 4. Prioridad alta en quiebre de stock (stock <= 0) ---');
    // Eliminamos trabajo anterior para probar trigger con stock 0
    await supabase.from('replenishment_queue').delete().eq('product_id', testProductId);
    await supabase.from('products').update({ stock: 0 }).eq('id', testProductId);

    const { data: queueZero } = await supabase
      .from('replenishment_queue')
      .select('*')
      .eq('product_id', testProductId)
      .eq('status', 'pending')
      .single();

    testAssert(
      queueZero?.priority === 2 && queueZero?.reason === 'stock_zero',
      `Stock = 0 asignó prioridad alta (priority=${queueZero?.priority}, reason=${queueZero?.reason})`
    );

    // 5. Probar RPC claim_replenishment_queue_batch (separación claimed_at vs processed_at)
    console.log('\n--- 5. RPC claim_replenishment_queue_batch ---');
    const { data: claimedBatch, error: claimErr } = await supabase.rpc('claim_replenishment_queue_batch', {
      p_max_batch: 10
    });

    if (claimErr) console.error('  --> claimErr details:', claimErr);
    testAssert(!claimErr, 'Invocación exitosa de claim_replenishment_queue_batch');
    const myClaimed = (claimedBatch || []).find((c: any) => c.product_id === testProductId);
    testAssert(!!myClaimed, `Producto ${testProductId} reclamado en el lote`);

    // Verificar en BD que status = 'processing', claimed_at tiene fecha y processed_at sigue en NULL
    const { data: claimedRecord } = await supabase
      .from('replenishment_queue')
      .select('*')
      .eq('product_id', testProductId)
      .single();

    testAssert(
      claimedRecord?.status === 'processing',
      'Estado cambió a "processing"'
    );
    testAssert(
      claimedRecord?.claimed_at !== null && claimedRecord?.processed_at === null,
      'claimed_at fue establecido con fecha de reclamo y processed_at permanece estrictamente en NULL'
    );

    // 6. Probar RPC save_replenishment_evaluation y detección de transición
    console.log('\n--- 6. RPC save_replenishment_evaluation y Transición de Alertas ---');
    // Transición A: de OK a REPOSICION -> DEBE alertar (should_notify_whatsapp = true)
    const { data: evalResult1, error: evalErr1 } = await supabase.rpc('save_replenishment_evaluation', {
      p_queue_id: claimedRecord?.id,
      p_product_id: testProductId,
      p_status: 'REPOSICION',
      p_stock_at_evaluation: 0,
      p_punto_reposicion: 15,
      p_stock_objetivo: 30,
      p_cantidad_recomendada: 30,
      p_dias_cobertura: 0,
      p_etiqueta_margen: 'Historial completo · margen 15.0%'
    });

    testAssert(!evalErr1, 'save_replenishment_evaluation ejecutado con éxito');
    const r1 = evalResult1?.[0];
    testAssert(
      r1?.should_notify_whatsapp === true && r1?.previous_status === 'OK' && r1?.new_status === 'REPOSICION',
      'Transición inicial OK -> REPOSICION detectada: should_notify_whatsapp = TRUE'
    );

    // Verificar que la cola se marcó como 'completed' con processed_at definitivo
    const { data: completedRecord } = await supabase
      .from('replenishment_queue')
      .select('*')
      .eq('id', claimedRecord?.id)
      .single();

    testAssert(
      completedRecord?.status === 'completed' && completedRecord?.processed_at !== null,
      'Trabajo finalizado: status = "completed" y processed_at registrado'
    );

    // Transición B: Sigue en REPOSICION en una evaluación posterior -> NO DEBE alertar (anti-spam)
    const { data: evalResult2 } = await supabase.rpc('save_replenishment_evaluation', {
      p_queue_id: null,
      p_product_id: testProductId,
      p_status: 'REPOSICION',
      p_stock_at_evaluation: 0,
      p_punto_reposicion: 15,
      p_stock_objetivo: 30,
      p_cantidad_recomendada: 30,
      p_dias_cobertura: 0,
      p_etiqueta_margen: 'Historial completo · margen 15.0%'
    });

    const r2 = evalResult2?.[0];
    testAssert(
      r2?.should_notify_whatsapp === false && r2?.previous_status === 'REPOSICION',
      'Transición REPOSICION -> REPOSICION ignorada: should_notify_whatsapp = FALSE (Anti-spam)'
    );

    // Transición C: Reposición de stock -> Pasa a OK
    const { data: evalResult3 } = await supabase.rpc('save_replenishment_evaluation', {
      p_queue_id: null,
      p_product_id: testProductId,
      p_status: 'OK',
      p_stock_at_evaluation: 50,
      p_punto_reposicion: 15,
      p_stock_objetivo: 30,
      p_cantidad_recomendada: 0,
      p_dias_cobertura: 25,
      p_etiqueta_margen: 'Historial completo · margen 15.0%'
    });

    const r3 = evalResult3?.[0];
    testAssert(
      r3?.should_notify_whatsapp === false && r3?.new_status === 'OK',
      'Transición REPOSICION -> OK: estado reseteado a "OK" para futuras alertas'
    );

    // 7. Probar Límite duro de 1.000 evaluaciones cada 15 minutos
    console.log('\n--- 7. Límite duro de 1.000 evaluaciones / 15 minutos ---');
    // Insertamos 1.000 registros sintéticos simulando evaluaciones completadas en los últimos 2 minutos
    const fakeCompleted = [];
    for (let i = 0; i < 1000; i++) {
      fakeCompleted.push({
        product_id: testProductId,
        status: 'completed',
        priority: 1,
        reason: 'rate_limit_test',
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        claimed_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        processed_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // dentro de la ventana de 15m
        attempts: 1
      });
    }

    const { error: bulkInsertErr } = await supabase.from('replenishment_queue').insert(fakeCompleted);
    testAssert(!bulkInsertErr, '1.000 evaluaciones completadas insertadas en los últimos 15 min');

    // Insertamos 5 productos pendientes para intentar reclamar
    const fakePending = [];
    for (let i = 0; i < 5; i++) {
      fakePending.push({
        product_id: testProductId,
        status: 'pending',
        priority: 1,
        reason: 'pending_test'
      });
    }
    // Para pending el índice único es por product_id, usamos IDs temporales o limpiamos
    // Como el índice es condicional WHERE status IN ('pending', 'processing'), insertamos 1 pendiente
    await supabase.from('replenishment_queue').insert({
      product_id: testProductId,
      status: 'pending',
      priority: 1,
      reason: 'quota_overflow_test'
    });

    // Intentamos reclamar cuando la cuota de 1.000 en 15m está agotada
    const { data: rateLimitedClaims } = await supabase.rpc('claim_replenishment_queue_batch', {
      p_max_batch: 50
    });

    testAssert(
      (rateLimitedClaims || []).length === 0,
      `Rate limit global respetado: Con 1.000 completados en 15 min, reclamos devueltos = ${(rateLimitedClaims || []).length} (Bloqueo exitoso)`
    );

    // Limpieza de datos de prueba de rate limit
    await supabase.from('replenishment_queue').delete().eq('reason', 'rate_limit_test');
    await supabase.from('replenishment_queue').delete().eq('reason', 'quota_overflow_test');

    // 8. Probar Lease Timeout Recovery
    console.log('\n--- 8. Recuperación de trabajos caídos (Lease timeout > 5 min) ---');
    await supabase.from('replenishment_queue').delete().eq('product_id', testProductId);
    // Insertamos un trabajo que quedó en 'processing' hace 10 minutos
    const { data: stuckJob, error: stuckErr } = await supabase
      .from('replenishment_queue')
      .insert({
        product_id: testProductId,
        status: 'processing',
        priority: 1,
        reason: 'lease_timeout_test',
        claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // hace 10 min
        attempts: 1
      })
      .select()
      .single();

    testAssert(!stuckErr && !!stuckJob, 'Trabajo en "processing" simulado con claimed_at de hace 10 minutos');

    // Al llamar a claim_replenishment_queue_batch, el lease recovery debe recuperarlo y ponerlo en 'pending' o reclamarlo
    const { data: recoveredClaims } = await supabase.rpc('claim_replenishment_queue_batch', {
      p_max_batch: 10
    });

    const isRecoveredAndClaimed = (recoveredClaims || []).some((c: any) => c.product_id === testProductId);
    testAssert(
      isRecoveredAndClaimed,
      'Lease timeout funcionó: el trabajo caído fue recuperado automáticamente y re-reclamado para procesamiento'
    );

  } finally {
    // Limpieza final del producto de prueba
    console.log('\n--- Limpieza final ---');
    await supabase.from('replenishment_queue').delete().eq('product_id', testProductId);
    await supabase.from('product_replenishment_state').delete().eq('product_id', testProductId);
    await supabase.from('products').delete().eq('id', testProductId);
    console.log('  🧹 Datos de prueba eliminados correctamente.');
  }

  console.log('\n================================================================');
  console.log(`  RESULTADO: ${passed} pasados, ${failed} fallados`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
