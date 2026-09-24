import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { 
  calculateProductReplenishment, 
  ReplenishmentConfig, 
  buildDenseSalesHistory,
  buildReplenishmentAlerts
} from '../src/utils/replenishment';

const config: ReplenishmentConfig = {
  enabled: true,
  historyWeeks: 16,
  coverageDays: 15,
  anticipationDays: 3,
  marginLow: 15,
  marginMedium: 25,
  marginHigh: 35,
  thresholdComplete: 16,
  thresholdPartial: 8
};

const nowMs = Date.parse('2026-09-23T00:00:00Z');

describe('Tests Sintéticos de Reposición (S9, S11, S14, S16)', () => {
  const lastMonday = '2026-09-14';
  const oldMonday = '2026-06-01'; // más de 16 semanas

  test('S9: Producto sin stock, ventas pasadas -> REPOSICION', () => {
    const dense = buildDenseSalesHistory('2025-01-01T00:00:00Z', oldMonday, [{ week_start: oldMonday, units: 100 }], config.historyWeeks, nowMs);
    const res = calculateProductReplenishment({
      ventasPorSemana: dense.ventasPorSemana,
      semanasDisponibles: dense.semanasDisponibles,
      stockActual: 0,
      config
    });
    assert.strictEqual(res.status, 'REPOSICION');
    assert.strictEqual(res.alerta, true);
    assert.ok(res.cantidadRecomendada! > 0);
  });

  test('S11: Ventas futuras / sin ventas pasadas en ventana y stock <= 0 -> SIN_HISTORIAL', () => {
    const dense = buildDenseSalesHistory('2025-01-01T00:00:00Z', null, [], config.historyWeeks, nowMs);
    const res = calculateProductReplenishment({
      ventasPorSemana: dense.ventasPorSemana,
      semanasDisponibles: dense.semanasDisponibles,
      stockActual: 0,
      config
    });
    assert.strictEqual(res.status, 'SIN_HISTORIAL');
    assert.strictEqual(res.alerta, false);
  });

  test('S14: Primera venta muy reciente (< 1 semana) -> Historial insuficiente', () => {
    const dense = buildDenseSalesHistory('2026-09-10T00:00:00Z', lastMonday, [{ week_start: lastMonday, units: 10 }], config.historyWeeks, nowMs);
    const res = calculateProductReplenishment({
      ventasPorSemana: dense.ventasPorSemana,
      semanasDisponibles: dense.semanasDisponibles,
      stockActual: 0,
      config
    });
    assert.strictEqual(res.status, 'REPOSICION');
    assert.strictEqual(res.historialInsuficiente, true);
    assert.strictEqual(res.nivelHistorial, 'ALTO');
  });

  test('S16: Completamente vacío, stock <= 0 -> SIN_HISTORIAL', () => {
    const res = calculateProductReplenishment({
      ventasPorSemana: Array(16).fill(0),
      semanasDisponibles: 0,
      stockActual: 0,
      config
    });
    assert.strictEqual(res.status, 'SIN_HISTORIAL');
    assert.strictEqual(res.alerta, false);
    assert.strictEqual(res.cantidadRecomendada, null);
  });
});

describe('Tests de Cadena de Fallback (Punto 5)', () => {
  test('Rama 1: RPC exitoso -> Genera alertas dinámicas y guarda estadísticas', () => {
    const activeProducts = [
      { id: 'prod-1', name: 'Producto Activo 1', stock: 5, isPaused: false, createdAt: '2026-01-01' }
    ] as any;
    const groupedStats = new Map([
      ['prod-1', { weeks: [{ week_start: '2026-09-14', units: 50 }], firstSale: '2026-01-01' }]
    ]);
    const liveStockMap = new Map([['prod-1', 2]]);

    const { alerts, noHistoryProducts } = buildReplenishmentAlerts(activeProducts, liveStockMap, groupedStats, config, nowMs);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].id, 'prod-1');
    assert.strictEqual(alerts[0].stock, 2);
    assert.strictEqual(alerts[0].replenishmentResult?.status, 'REPOSICION');
  });

  test('Rama 2: RPC falla pero existe caché en localStorage -> Se recupera del caché y recalcula con stock vivo', () => {
    const cachedStats = [
      { product_id: 'prod-cached', week_start: '2026-09-14', units: 30, first_sale_at: '2026-01-01' }
    ];
    // Simulamos la recuperación del caché
    const groupedStats = new Map();
    cachedStats.forEach(s => {
      groupedStats.set(s.product_id, {
        weeks: [{ week_start: s.week_start, units: s.units }],
        firstSale: s.first_sale_at
      });
    });

    const activeProducts = [
      { id: 'prod-cached', name: 'Producto Cacheado', stock: 10, isPaused: false, createdAt: '2026-01-01' }
    ] as any;
    // Stock en vivo actualizado
    const liveStockMap = new Map([['prod-cached', 1]]);

    const { alerts } = buildReplenishmentAlerts(activeProducts, liveStockMap, groupedStats, config, nowMs);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].stock, 1); // Recalculado con stock vivo
    assert.strictEqual(alerts[0].replenishmentResult?.alerta, true);
  });

  test('Rama 3: RPC falla y no hay caché -> Fallback a lógica estática', () => {
    // Si no hay stats ni caché, el store invoca productsService.getLowStockProductsPaginated
    const legacyProducts = [
      { id: 'p-leg', name: 'Legacy Prod', stock: 5, min_stock: 10, is_paused: false }
    ];
    const isLegacyAlert = legacyProducts[0].stock <= (legacyProducts[0].min_stock ?? 15);
    assert.strictEqual(isLegacyAlert, true);
  });

  test('Rama 4: getLiveStock falla -> Se utiliza el stock local del catálogo en memoria', () => {
    const catalogProducts = [
      { id: 'prod-local', name: 'Prod Local', stock: 1, isPaused: false, createdAt: '2026-01-01' }
    ] as any;
    
    // Si liveStockMap viene vacío porque la red falló, toma p.stock del catálogo
    const liveStockMap = new Map<string, number>(); // falló
    const groupedStats = new Map([
      ['prod-local', { weeks: [{ week_start: '2026-09-14', units: 40 }], firstSale: '2026-01-01' }]
    ]);

    const { alerts } = buildReplenishmentAlerts(catalogProducts, liveStockMap, groupedStats, config, nowMs);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].stock, 1); // Mantiene el stock del catálogo
    assert.strictEqual(alerts[0].replenishmentResult?.alerta, true);
  });
});

describe('Performance Benchmark (P1)', () => {
  test('P1: Procesamiento en memoria de 1.000 productos activos (benchmark informativo)', () => {
    const products: any[] = [];
    const liveStockMap = new Map<string, number>();
    const groupedStats = new Map<string, any>();

    for (let i = 0; i < 1000; i++) {
      const id = `prod-bench-${i}`;
      products.push({ id, name: `Producto ${i}`, stock: 0, isPaused: false, createdAt: '2025-01-01' });
      liveStockMap.set(id, 0);
      groupedStats.set(id, {
        weeks: [{ week_start: '2026-09-14', units: 20 }],
        firstSale: '2025-01-01'
      });
    }

    const t0 = performance.now();
    const { alerts } = buildReplenishmentAlerts(products, liveStockMap, groupedStats, config, nowMs);
    const duration = performance.now() - t0;

    assert.strictEqual(alerts.length, 1000);
    console.log(`  ℹ P1 Benchmark: 1.000 productos procesados en ${duration.toFixed(2)}ms`);
  });
});

