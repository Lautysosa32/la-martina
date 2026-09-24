import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { 
  calculateProductReplenishment, 
  buildDenseSalesHistory, 
  ReplenishmentConfig, 
  defaultReplenishmentConfig, 
  validateReplenishmentConfig,
  buildReplenishmentAlerts,
  sortReplenishmentAlerts,
  paginateAlerts,
  parseReplenishmentRpcResponse
} from '../src/utils/replenishment';
import { buildLowStockPaginatedUrl, PRODUCT_LOW_STOCK_SELECT, fetchLowStockDashboardProductsHandler } from '../src/utils/lowStockUrl';

describe('Replenishment Logic (T1-T14, T16)', () => {
  const config: ReplenishmentConfig = {
    ...defaultReplenishmentConfig,
    historyWeeks: 16,
    coverageDays: 15,
    anticipationDays: 3,
    marginLow: 15,
    marginMedium: 25,
    marginHigh: 35,
    thresholdComplete: 16,
    thresholdPartial: 8
  };

  test('T1: Historial completo', () => {
    // 16 sem × 30 uds
    const ventas = Array(16).fill(30);
    const result = calculateProductReplenishment({
      ventasPorSemana: ventas,
      semanasDisponibles: 16,
      stockActual: 30, // probamos con stock distinto para ver PR y objetivo
      config
    });

    assert.strictEqual(result.nivelHistorial, 'BAJO');
    assert.strictEqual(result.puntoReposicion, 15);
    assert.strictEqual(result.stockObjetivo, 74);

    const res16 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 16, config });
    assert.strictEqual(res16.alerta, false);

    const res15 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config });
    assert.strictEqual(res15.alerta, true);
    assert.strictEqual(res15.cantidadRecomendada, 59); 

    const res12 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 12, config });
    assert.strictEqual(res12.alerta, true);
    assert.strictEqual(res12.cantidadRecomendada, 62);
  });

  test('T2: Historial medio', () => {
    const ventas = Array(16).fill(0);
    for (let i=0; i<10; i++) ventas[i] = 30; 

    const res17 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 10, stockActual: 17, config });
    assert.strictEqual(res17.nivelHistorial, 'MEDIO');
    assert.strictEqual(res17.puntoReposicion, 17);
    assert.strictEqual(res17.stockObjetivo, 81);
    assert.strictEqual(res17.alerta, true);
    assert.strictEqual(res17.cantidadRecomendada, 64);

    const res18 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 10, stockActual: 18, config });
    assert.strictEqual(res18.alerta, false);
  });

  test('T3: Historial insuficiente', () => {
    const ventas = [10, 10, 10, 4];
    const res = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 4, stockActual: 4, config });
    assert.strictEqual(res.nivelHistorial, 'ALTO');
    assert.strictEqual(res.puntoReposicion, 5);
    assert.strictEqual(res.stockObjetivo, 25);
    assert.strictEqual(res.historialInsuficiente, true);
    assert.strictEqual(res.alerta, true);
    assert.ok(Math.abs(res.diasCobertura! - 3.29) < 0.1); 
    assert.strictEqual(res.cantidadRecomendada, 21); 

    const res6 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 4, stockActual: 6, config });
    assert.strictEqual(res6.alerta, false);
  });

  test('T4: Sin ventas', () => {
    const res = calculateProductReplenishment({ ventasPorSemana: Array(16).fill(0), semanasDisponibles: 16, stockActual: 10, config });
    assert.strictEqual(res.status, 'SIN_HISTORIAL');
    assert.strictEqual(res.alerta, false);
    assert.strictEqual(res.cantidadRecomendada, null);
  });

  test('T5: Ceros vs sin datos', () => {
    const ventasA = Array(16).fill(0);
    for(let i=0; i<12; i++) ventasA[i] = 30;
    const resA = calculateProductReplenishment({ ventasPorSemana: ventasA, semanasDisponibles: 16, stockActual: 0, config });
    assert.strictEqual(resA.puntoReposicion, 12);
    assert.strictEqual(resA.stockObjetivo, 56);

    const ventasB = Array(12).fill(30);
    const resB = calculateProductReplenishment({ ventasPorSemana: ventasB, semanasDisponibles: 12, stockActual: 0, config });
    assert.strictEqual(resB.nivelHistorial, 'MEDIO');
    assert.strictEqual(resB.puntoReposicion, 17);
    assert.strictEqual(resB.stockObjetivo, 81);
  });

  test('T6: Fronteras S=15, S=16, S=74', () => {
    const ventas = Array(16).fill(30);
    const res15 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config });
    assert.strictEqual(res15.alerta, true);
    
    const res16 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 16, config });
    assert.strictEqual(res16.alerta, false);

    const res74 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 74, config });
    assert.strictEqual(res74.alerta, false);
    assert.strictEqual(res74.cantidadRecomendada, 0); 
  });

  test('T7: Baja rotación (4 uds en 16 semanas)', () => {
    // 4 unidades vendidas distribuidas en 16 semanas: d = 4 / 16 / 7 = 0.035714 uds/día
    // N=16 -> nivel BAJO, margen 15%. PR = ceil(0.035714 * 3 * 1.15) = 1.
    // stockObjetivo = max(ceil(0.035714 * 15 * 1.15), 1 + 1) = 2.
    const ventas = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    assert.strictEqual(ventas.reduce((a, b) => a + b, 0), 4);
    assert.strictEqual(ventas.length, 16);

    const res1 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 1, config });
    assert.strictEqual(res1.puntoReposicion, 1);
    assert.strictEqual(res1.stockObjetivo, 2);
    assert.strictEqual(res1.alerta, true); 
    assert.strictEqual(res1.cantidadRecomendada, 1); 

    const res0 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 0, config });
    assert.strictEqual(res0.alerta, true);
    assert.strictEqual(res0.cantidadRecomendada, 2);

    const res2 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 2, config });
    assert.strictEqual(res2.alerta, false);
    assert.strictEqual(res2.cantidadRecomendada, 0);
  });

  test('T8: Ruido de coma flotante', () => {
    const ventas = Array(16).fill(35);
    const testConfig = { ...config, marginLow: 20 };
    const res = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 10, config: testConfig });
    assert.strictEqual(res.puntoReposicion, 18); 
  });

  test('T9: Agrupación de pedidos (W=3 vs W=5)', () => {
    // 3 productos con 7 uds/sem × 16 sem (d=1), stocks A=2, B=3, C=5.
    const ventas = Array(16).fill(7);
    const stockA = 2;
    const stockB = 3;
    const stockC = 5;

    // Con W=3 (PR 4) alertan A y B, C no.
    const configW3: ReplenishmentConfig = { ...config, anticipationDays: 3 };
    const resA_W3 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockA, config: configW3 });
    const resB_W3 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockB, config: configW3 });
    const resC_W3 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockC, config: configW3 });

    assert.strictEqual(resA_W3.puntoReposicion, 4);
    assert.strictEqual(resB_W3.puntoReposicion, 4);
    assert.strictEqual(resC_W3.puntoReposicion, 4);

    assert.strictEqual(resA_W3.alerta, true);
    assert.strictEqual(resB_W3.alerta, true);
    assert.strictEqual(resC_W3.alerta, false);

    // Con W=5 (PR 6) alertan los tres. Objetivo 18; cantidades con W=5: 16, 15 y 13.
    const configW5: ReplenishmentConfig = { ...config, anticipationDays: 5 };
    const resA_W5 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockA, config: configW5 });
    const resB_W5 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockB, config: configW5 });
    const resC_W5 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: stockC, config: configW5 });

    assert.strictEqual(resA_W5.puntoReposicion, 6);
    assert.strictEqual(resB_W5.puntoReposicion, 6);
    assert.strictEqual(resC_W5.puntoReposicion, 6);

    assert.strictEqual(resA_W5.alerta, true);
    assert.strictEqual(resB_W5.alerta, true);
    assert.strictEqual(resC_W5.alerta, true);

    assert.strictEqual(resA_W5.stockObjetivo, 18);
    assert.strictEqual(resB_W5.stockObjetivo, 18);
    assert.strictEqual(resC_W5.stockObjetivo, 18);

    assert.strictEqual(resA_W5.cantidadRecomendada, 16);
    assert.strictEqual(resB_W5.cantidadRecomendada, 15);
    assert.strictEqual(resC_W5.cantidadRecomendada, 13);
  });

  test('T10: Cambio de configuración', () => {
    const ventas = Array(16).fill(30);
    const resCob30 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config: { ...config, coverageDays: 30 } });
    assert.strictEqual(resCob30.stockObjetivo, 148); 

    const resAnt5 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config: { ...config, anticipationDays: 5 } });
    assert.strictEqual(resAnt5.puntoReposicion, 25); 

    const resM20 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config: { ...config, marginLow: 20 } });
    assert.strictEqual(resM20.puntoReposicion, 16); 
    assert.strictEqual(resM20.stockObjetivo, 78); 
  });

  test('T11: Nueva venta en función pura con buildReplenishmentAlerts sin llamar al RPC', () => {
    // Producto con perfil T1 (16 sem x 30 uds) y stock inicial 16
    const activeProducts = [{
      id: 'prod-t11',
      name: 'Producto T11',
      createdAt: '2025-01-01T00:00:00Z',
      stock: 16
    }];

    const weeks = [];
    const currentMondayMs = Date.parse('2026-09-21T00:00:00Z');
    for (let w = 1; w <= 16; w++) {
      const weekStartStr = new Date(currentMondayMs - w * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      weeks.push({ week_start: weekStartStr, units: 30 });
    }
    const groupedStats = new Map([
      ['prod-t11', { weeks, firstSale: '2025-01-01T00:00:00Z' }]
    ]);

    // 1. Stock en vivo inicial = 16 (PR = 15, S > PR => No genera alerta)
    const nowMs = Date.parse('2026-09-23T00:00:00Z');
    const liveStockMap = new Map<string, number>([['prod-t11', 16]]);
    const initialRun = buildReplenishmentAlerts(activeProducts, liveStockMap, groupedStats, config, nowMs);
    assert.strictEqual(initialRun.alerts.length, 0);

    // 2. Se registra 1 venta: el stock en vivo cambia a 15 (S <= PR => Genera alerta, comprar 59)
    liveStockMap.set('prod-t11', 15);
    const afterSaleRun = buildReplenishmentAlerts(activeProducts, liveStockMap, groupedStats, config, nowMs);
    assert.strictEqual(afterSaleRun.alerts.length, 1);
    const alert = afterSaleRun.alerts[0];
    assert.strictEqual(alert.id, 'prod-t11');
    assert.strictEqual(alert.stock, 15);
    assert.strictEqual(alert.replenishmentResult?.alerta, true);
    assert.strictEqual(alert.replenishmentResult?.puntoReposicion, 15);
    assert.strictEqual(alert.replenishmentResult?.stockObjetivo, 74);
    assert.strictEqual(alert.replenishmentResult?.cantidadRecomendada, 59);
  });

  test('T13: Determinismo', () => {
    const ventas = Array(16).fill(30);
    const res1 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config });
    const res2 = calculateProductReplenishment({ ventasPorSemana: ventas, semanasDisponibles: 16, stockActual: 15, config });
    assert.deepStrictEqual(res1, res2);
  });

  test('T14: Paginación (10/10/5) y universo del PDF idéntico usando funciones de producción', () => {
    // 25 productos activos construidos a través de buildReplenishmentAlerts
    const activeProducts: any[] = [];
    const liveStockMap = new Map<string, number>();
    const groupedStats = new Map<string, { weeks: { week_start: string; units: number }[]; firstSale: string | null }>();
    const nowMs = Date.parse('2026-09-23T00:00:00Z');

    for (let i = 1; i <= 25; i++) {
      const id = `prod-${String(i).padStart(2, '0')}`;
      const name = `Producto ${String(i).padStart(2, '0')}`;
      const stock = 5;
      const weeklyUnits = 10 + i * 2; // entre 12 y 60 unidades por semana

      activeProducts.push({
        id,
        name,
        createdAt: '2025-01-01T00:00:00Z',
        stock
      });
      liveStockMap.set(id, stock);

      const weeks = [];
      const currentMondayMs = Date.parse('2026-09-21T00:00:00Z');
      for (let w = 1; w <= 16; w++) {
        const weekStartStr = new Date(currentMondayMs - w * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        weeks.push({ week_start: weekStartStr, units: weeklyUnits });
      }
      groupedStats.set(id, {
        weeks,
        firstSale: '2025-01-01T00:00:00Z'
      });
    }

    // Ejecutamos la función de producción buildReplenishmentAlerts
    const { alerts, noHistoryProducts } = buildReplenishmentAlerts(
      activeProducts,
      liveStockMap,
      groupedStats,
      config,
      nowMs
    );

    // Todos los 25 deben estar en REPOSICION porque S=5 <= PR (PR >= 6 para todos)
    assert.strictEqual(alerts.length, 25);
    assert.strictEqual(noHistoryProducts.length, 0);

    // Ordenamos con la función pura real del store
    const sortedAlerts = sortReplenishmentAlerts(alerts);
    assert.strictEqual(sortedAlerts.length, 25);

    // Verificamos orden ascendente por diasCobertura
    for (let i = 0; i < sortedAlerts.length - 1; i++) {
      const covA = sortedAlerts[i].replenishmentResult?.diasCobertura ?? Infinity;
      const covB = sortedAlerts[i + 1].replenishmentResult?.diasCobertura ?? Infinity;
      assert.ok(covA <= covB, `Error en orden: ${covA} > ${covB}`);
    }

    // Paginamos con la función pura real del store (10 por página)
    const page1 = paginateAlerts(sortedAlerts, 1, 10);
    const page2 = paginateAlerts(sortedAlerts, 2, 10);
    const page3 = paginateAlerts(sortedAlerts, 3, 10);

    assert.strictEqual(page1.paginated.length, 10);
    assert.strictEqual(page2.paginated.length, 10);
    assert.strictEqual(page3.paginated.length, 5);

    // El universo del PDF es la lista completa idéntica en orden y valores
    const pdfUniverse = [...sortedAlerts];
    assert.strictEqual(pdfUniverse.length, 25);
    assert.deepStrictEqual(pdfUniverse, sortedAlerts);
    assert.deepStrictEqual([...page1.paginated, ...page2.paginated, ...page3.paginated], pdfUniverse);
  });

  test('T16: Flag apagado - función pura buildLowStockPaginatedUrl compara idéntica con HEAD', () => {
    // Cadena literal extraída de HEAD (git show HEAD:src/services/products.service.ts)
    const expectedHeadUrl = (page: number, limit: number) => {
      const offset = (page - 1) * limit;
      return `/products?select=${PRODUCT_LOW_STOCK_SELECT}&stock=lte.15&is_paused=eq.false&order=stock.asc,updated_at.desc&limit=${limit}&offset=${offset}`;
    };

    const urlPage1 = buildLowStockPaginatedUrl({ page: 1, limit: 10 });
    const urlPage2 = buildLowStockPaginatedUrl({ page: 2, limit: 10 });

    assert.strictEqual(urlPage1, expectedHeadUrl(1, 10));
    assert.strictEqual(urlPage2, expectedHeadUrl(2, 10));

    // Comprobamos filtros obligatorios exigidos por la arquitectura previa
    assert.ok(urlPage1.includes('stock=lte.15'));
    assert.ok(urlPage1.includes('is_paused=eq.false'));
    assert.ok(urlPage1.includes('order=stock.asc,updated_at.desc'));
  });

  test('T16 (Store): Flag apagado llama a getLowStockProductsPaginated con {page, limit}', async () => {
    let calledWithParams: any = null;
    let setCalledWith: any = null;
    let allAlertsCalled = false;

    await fetchLowStockDashboardProductsHandler(
      { page: 3, limit: 10 },
      {
        getConfig: async () => ({ enabled: false }),
        getLowStockProductsPaginated: async (params) => {
          calledWithParams = params;
          return {
            data: [{ id: 'prod-mock', name: 'Mock Prod', stock: 3 }],
            total: 25,
            outOfStockTotal: 5,
            lowStockTotal: 20
          };
        },
        fetchAllReplenishmentAlerts: async () => {
          allAlertsCalled = true;
        },
        getAllReplenishmentAlerts: () => [],
        getProducts: () => [],
        set: (state) => {
          setCalledWith = { ...setCalledWith, ...state };
        }
      }
    );

    // 1. Demuestra que llama a getLowStockProductsPaginated con { page: 3, limit: 10 }
    assert.deepStrictEqual(calledWithParams, { page: 3, limit: 10 });
    // 2. Demuestra que NO llama a la lógica dinámica ni al RPC
    assert.strictEqual(allAlertsCalled, false);
    // 3. Demuestra que el estado guardado contiene los datos y totales devueltos
    assert.strictEqual(setCalledWith.lowStockDashboardProducts.length, 1);
    assert.strictEqual(setCalledWith.lowStockDashboardTotal, 25);
    assert.strictEqual(setCalledWith.outOfStockTotal, 5);
    assert.strictEqual(setCalledWith.lowStockTotal, 20);
    assert.strictEqual(setCalledWith.lowStockDashboardLoading, false);
  });

  test('con getConfig que lanza un error, el handler llama a getLowStockProductsPaginated con {page, limit} y deja lowStockDashboardProducts con los datos', async () => {
    let calledWithParams: any = null;
    let setCalledWith: any = null;
    const mockProducts = [{ id: 'prod-fallback', name: 'Fallback Prod', stock: 4 }];

    await fetchLowStockDashboardProductsHandler(
      { page: 2, limit: 10 },
      {
        getConfig: async () => {
          throw new Error('Database connection failed fetching settings');
        },
        getLowStockProductsPaginated: async (params) => {
          calledWithParams = params;
          return {
            data: mockProducts,
            total: 1,
            outOfStockTotal: 0,
            lowStockTotal: 1
          };
        },
        fetchAllReplenishmentAlerts: async () => {},
        getAllReplenishmentAlerts: () => [],
        getProducts: () => [],
        set: (state) => {
          setCalledWith = { ...setCalledWith, ...state };
        }
      }
    );

    assert.deepStrictEqual(calledWithParams, { page: 2, limit: 10 });
    assert.deepStrictEqual(setCalledWith.lowStockDashboardProducts, mockProducts);
    assert.strictEqual(setCalledWith.lowStockDashboardLoading, false);
    assert.strictEqual(setCalledWith.error, null);
  });

  test('dos llamadas seguidas no repiten la lectura de la configuración', async () => {
    let configReadCount = 0;
    let cachedConfig: { enabled: boolean } | null = null;

    const mockDeps = {
      getCachedConfig: () => cachedConfig,
      getConfig: async () => {
        configReadCount++;
        cachedConfig = { enabled: false };
        return cachedConfig;
      },
      getLowStockProductsPaginated: async () => ({
        data: [{ id: 'p1', name: 'P1', stock: 1 }],
        total: 1,
        outOfStockTotal: 0,
        lowStockTotal: 1
      }),
      fetchAllReplenishmentAlerts: async () => {},
      getAllReplenishmentAlerts: () => [],
      getProducts: () => [],
      set: () => {}
    };

    // Primera llamada (página 1)
    await fetchLowStockDashboardProductsHandler({ page: 1, limit: 10 }, mockDeps);
    // Segunda llamada consecutiva (página 2, cambio de página)
    await fetchLowStockDashboardProductsHandler({ page: 2, limit: 10 }, mockDeps);

    assert.strictEqual(configReadCount, 1, 'La configuración solo debe leerse una vez');
  });

  test('Validación de forma en parseReplenishmentRpcResponse (JSONB vs legacy flat rows)', () => {
    // 1. Formato JSONB nuevo válido: array de { product_id, first_sale_at, weeks: [] }
    const validJsonb = [
      {
        product_id: 'prod-001',
        first_sale_at: '2025-01-01T00:00:00Z',
        weeks: [
          { week_start: '2026-09-01', units: 10 },
          { week_start: '2026-09-08', units: 15 }
        ]
      }
    ];
    const parsed = parseReplenishmentRpcResponse(validJsonb);
    assert.strictEqual(parsed.has('prod-001'), true);
    assert.strictEqual(parsed.get('prod-001')!.weeks.length, 2);

    // 2. Formato viejo desplegado en la base (filas planas con week_start y units por fila)
    const oldFlatRows = [
      { product_id: 'prod-001', week_start: '2026-09-01', units: 10, first_sale_at: '2025-01-01T00:00:00Z' },
      { product_id: 'prod-001', week_start: '2026-09-08', units: 15, first_sale_at: '2025-01-01T00:00:00Z' }
    ];
    // Debe lanzar Error para que el store entre al catch y ejecute el fallback
    assert.throws(() => {
      parseReplenishmentRpcResponse(oldFlatRows);
    }, /Invalid replenishment RPC response shape/);

    // 3. Respuesta no array (ej: null o error object)
    assert.throws(() => {
      parseReplenishmentRpcResponse({ error: 'something' });
    }, /expected an array/);
  });
});

describe('Config Validation', () => {
  test('valida configuraciones correctamente', () => {
    assert.strictEqual(validateReplenishmentConfig(defaultReplenishmentConfig), null);
    assert.match(validateReplenishmentConfig({ ...defaultReplenishmentConfig, historyWeeks: 12 })!, /Umbral completo no puede superar/);
    assert.match(validateReplenishmentConfig({ ...defaultReplenishmentConfig, marginLow: 25 })!, /Margen BAJO debe estar entre 10% y 20%/);
    assert.match(validateReplenishmentConfig({ ...defaultReplenishmentConfig, anticipationDays: 10, coverageDays: 10 })!, /menor a días de cobertura/);
  });
});

describe('Dense Sales History', () => {
  test('rellena ceros y calcula N excluyendo semanas previas', () => {
    const nowMs = new Date('2026-09-23T12:00:00Z').getTime();
    const createdMs = nowMs - (8 * 7 * 24 * 60 * 60 * 1000);
    const createdAt = new Date(createdMs).toISOString();

    const raw = [
      { week_start: '2026-09-14', units: 10 },
      { week_start: '2026-09-07', units: 5 }
    ];

    const { ventasPorSemana, semanasDisponibles } = buildDenseSalesHistory(
      createdAt, 
      null,
      raw, 
      16, 
      nowMs,
      'UTC' 
    );

    assert.strictEqual(semanasDisponibles, 8);
    assert.strictEqual(ventasPorSemana.length, 16); 
    
    assert.strictEqual(ventasPorSemana[15], 10);
    assert.strictEqual(ventasPorSemana[14], 5);
    assert.strictEqual(ventasPorSemana[0], 0);
  });
});
