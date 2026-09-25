export interface ReplenishmentConfig {
  enabled: boolean;
  /** Activate automatic margin adjustment based on weekly sales volatility (CV) */
  useDeviation: boolean;
  historyWeeks: number; // 4 to 52
  coverageDays: number; // 1 to 60
  anticipationDays: number; // 1 to 14
  /** Fixed margin fallback (or anchor when useDeviation=true). Range: 10–20 % */
  marginLow: number;
  /** Fixed margin fallback (or anchor when useDeviation=true). Range: 20–30 % */
  marginMedium: number;
  /** Fixed margin fallback (or anchor when useDeviation=true). Range: 30–40 % */
  marginHigh: number;
  thresholdComplete: number; // <= historyWeeks
  thresholdPartial: number; // < thresholdComplete, >= 1
}

/** Hard bounds for each margin level — never configurable, only the value inside can move */
export const MARGIN_BOUNDS = {
  LOW:    { min: 10, max: 20 } as const,
  MEDIUM: { min: 20, max: 30 } as const,
  HIGH:   { min: 30, max: 40 } as const,
} as const;

export const defaultReplenishmentConfig: ReplenishmentConfig = {
  enabled: false,
  useDeviation: false,
  historyWeeks: 16,
  coverageDays: 15,
  anticipationDays: 3,
  marginLow: 15,
  marginMedium: 25,
  marginHigh: 35,
  thresholdComplete: 16,
  thresholdPartial: 8
};

export function validateReplenishmentConfig(config: ReplenishmentConfig): string | null {
  if (config.historyWeeks < 4 || config.historyWeeks > 52) return 'Historial debe estar entre 4 y 52 semanas.';
  if (config.coverageDays < 1 || config.coverageDays > 60) return 'Días de cobertura debe estar entre 1 y 60.';
  if (config.anticipationDays < 1 || config.anticipationDays > 14) return 'Días de anticipación debe estar entre 1 y 14.';
  if (config.anticipationDays >= config.coverageDays) return 'Días de anticipación debe ser menor a días de cobertura.';
  
  if (config.marginLow < 10 || config.marginLow > 20) return 'Margen BAJO debe estar entre 10% y 20%.';
  if (config.marginMedium < 20 || config.marginMedium > 30) return 'Margen MEDIO debe estar entre 20% y 30%.';
  if (config.marginHigh < 30 || config.marginHigh > 40) return 'Margen ALTO debe estar entre 30% y 40%.';
  
  if (!(config.marginLow <= config.marginMedium && config.marginMedium <= config.marginHigh)) {
    return 'Márgenes inválidos. Regla: BAJO <= MEDIO <= ALTO.';
  }

  if (config.thresholdPartial < 1) return 'Umbral parcial debe ser al menos 1.';
  if (config.thresholdPartial >= config.thresholdComplete) return 'Umbral parcial debe ser menor al completo.';
  if (config.thresholdComplete > config.historyWeeks) return 'Umbral completo no puede superar el historial máximo.';

  return null;
}

export type ReplenishmentStatus = 'NORMAL' | 'REPOSICION' | 'SIN_HISTORIAL';
export type MarginLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export interface ReplenishmentInput {
  ventasPorSemana: number[];
  semanasDisponibles: number;
  stockActual: number;
  config: ReplenishmentConfig;
}

export interface ReplenishmentResult {
  status: ReplenishmentStatus;
  alerta: boolean;
  stockObjetivo: number | null;
  cantidadRecomendada: number | null;
  puntoReposicion: number | null;
  promedioSemanal: number | null;
  diasCobertura: number | null;
  nivelHistorial: MarginLevel | null;
  historialInsuficiente: boolean;
  etiquetaMargen: string | null;
  ventanaEfectiva: number | null;
}

// Tolerancia para errores de coma flotante (ej: 18.000000000000004 -> 18)
const TOLERANCE = 1e-9;
function tolerantCeil(value: number): number {
  return Math.ceil(value - TOLERANCE);
}

/**
 * Calculates the Coefficient of Variation (CV = stddev / mean) from the dense
 * weekly sales array, ignoring weeks with 0 sales to avoid noise from zeros.
 * Returns a value in [0, 1]: 0 = perfectly stable, 1+ = highly volatile (clamped to 1).
 */
export function computeWeeklySalesCV(ventasPorSemana: number[]): number {
  const nonZero = ventasPorSemana.filter(v => v > 0);
  if (nonZero.length < 2) return 0; // not enough data to compute dispersion
  const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
  if (mean === 0) return 0;
  const variance = nonZero.reduce((s, v) => s + (v - mean) ** 2, 0) / nonZero.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.min(cv, 1); // clamp to [0, 1]
}

/**
 * Returns the effective margin % for the given level, taking into account
 * whether dynamic deviation mode is active.
 * - Fixed mode: returns the configured value directly.
 * - Deviation mode: interpolates between the level bounds using CV.
 *   cv=0 (stable) -> min bound; cv=1 (volatile) -> max bound.
 */
function resolveMarginPct(
  nivel: 'BAJO' | 'MEDIO' | 'ALTO',
  cv: number,
  config: ReplenishmentConfig
): number {
  if (!config.useDeviation) {
    return nivel === 'BAJO' ? config.marginLow
         : nivel === 'MEDIO' ? config.marginMedium
         : config.marginHigh;
  }
  const { min, max } = nivel === 'BAJO' ? MARGIN_BOUNDS.LOW
                     : nivel === 'MEDIO' ? MARGIN_BOUNDS.MEDIUM
                     : MARGIN_BOUNDS.HIGH;
  // Linear interpolation: more volatile -> closer to max bound
  return min + cv * (max - min);
}

export function calculateProductReplenishment(input: ReplenishmentInput): ReplenishmentResult {
  const { ventasPorSemana, semanasDisponibles: N, stockActual, config } = input;
  const S = Math.max(stockActual, 0);

  const totalVentas = ventasPorSemana.reduce((sum, v) => sum + v, 0);

  if (N <= 0 || totalVentas === 0) {
    return {
      status: 'SIN_HISTORIAL',
      alerta: false,
      stockObjetivo: null,
      cantidadRecomendada: null,
      puntoReposicion: null,
      promedioSemanal: null,
      diasCobertura: null,
      nivelHistorial: null,
      historialInsuficiente: false,
      etiquetaMargen: null,
      ventanaEfectiva: null,
    };
  }

  const promedioSemanal = totalVentas / N;
  const d = promedioSemanal / 7;
  const diasCobertura = d > 0 ? S / d : Infinity;

  // Coefficient of variation — used only when useDeviation=true
  const cv = config.useDeviation ? computeWeeklySalesCV(ventasPorSemana) : 0;

  let nivel: MarginLevel;
  let historialInsuficiente = false;

  if (N >= config.thresholdComplete) {
    nivel = 'BAJO';
  } else if (N >= config.thresholdPartial) {
    nivel = 'MEDIO';
  } else {
    nivel = 'ALTO';
    historialInsuficiente = true;
  }

  const margenPct = resolveMarginPct(nivel, cv, config);
  const margenPctRounded = Math.round(margenPct * 10) / 10;

  const nivelLabel = nivel === 'BAJO' ? 'Historial completo'
                   : nivel === 'MEDIO' ? 'Historial parcial'
                   : 'Historial insuficiente';
  const desvLabel = config.useDeviation ? ` · CV ${Math.round(cv * 100)}%` : '';
  const margenStr = `${nivelLabel} · margen ${margenPctRounded}%${desvLabel}`;

  const m = margenPct / 100;
  
  const PR = tolerantCeil(d * config.anticipationDays * (1 + m));
  const baseObjetivo = tolerantCeil(d * config.coverageDays * (1 + m));
  const stockObjetivo = Math.max(baseObjetivo, PR + 1);
  const cantidadRecomendada = Math.max(stockObjetivo - S, 0);
  
  const alerta = S <= PR;
  const status: ReplenishmentStatus = alerta ? 'REPOSICION' : 'NORMAL';

  return {
    status,
    alerta,
    stockObjetivo,
    cantidadRecomendada,
    puntoReposicion: PR,
    promedioSemanal,
    diasCobertura,
    nivelHistorial: nivel,
    historialInsuficiente,
    etiquetaMargen: margenStr,
    ventanaEfectiva: config.anticipationDays * (1 + m)
  };
}

/**
 * Builds the dense sales array for a product and calculates N.
 * Takes the raw data from the RPC (which only returns rows for weeks with >0 sales).
 */
export function buildDenseSalesHistory(
  productCreatedAt: string,
  firstSaleAt: string | null,
  rawSales: { week_start: string; units: number }[],
  hWeeks: number,
  nowMs: number = Date.now(),
  tz: string = 'America/Argentina/Buenos_Aires'
): { ventasPorSemana: number[]; semanasDisponibles: number } {
  // Use Intl.DateTimeFormat to compute local current week start in the correct timezone
  // Para simplificar sin dependencias, como el RPC asume lunes a domingo,
  // calculamos el lunes local usando JS estándar asumiendo que la zona horaria no cruza el lunes de manera extrema
  // o podemos iterar H semanas hacia atrás.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
  });
  
  const dateParts = formatter.formatToParts(new Date(nowMs));
  const getPart = (type: string) => parseInt(dateParts.find(p => p.type === type)!.value);
  const localNow = new Date(getPart('year'), getPart('month') - 1, getPart('day'), getPart('hour'), getPart('minute'), getPart('second'));
  
  // Find current week's Monday 00:00:00
  const day = localNow.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const currentMonday = new Date(localNow);
  currentMonday.setDate(currentMonday.getDate() - diffToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const currentMondayMs = currentMonday.getTime();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  
  const windowStartMs = currentMondayMs - (hWeeks * oneWeekMs);

  // Determinar inicio del producto
  const createdMs = new Date(productCreatedAt).getTime();
  const firstSaleMs = firstSaleAt ? new Date(firstSaleAt).getTime() : Infinity;
  // MIN(created_at, primera_venta) como se acordó, aunque primera_venta puede no existir (Infinity)
  const productStartMs = Math.min(createdMs, firstSaleMs);
  
  // Inicio de disponibilidad es MAX(productStartMs, windowStartMs)
  // Pero alineado al lunes anterior o igual.
  const pDate = new Date(Math.max(productStartMs, windowStartMs));
  const pDay = pDate.getDay();
  const pDiff = pDay === 0 ? 6 : pDay - 1;
  const pMonday = new Date(pDate);
  pMonday.setDate(pMonday.getDate() - pDiff);
  pMonday.setHours(0, 0, 0, 0);

  let semanasDisponibles = Math.round((currentMondayMs - pMonday.getTime()) / oneWeekMs);
  if (semanasDisponibles > hWeeks) semanasDisponibles = hWeeks;
  if (semanasDisponibles < 0) semanasDisponibles = 0;

  // Build the dense array
  const ventasMap = new Map<string, number>();
  rawSales.forEach(s => {
    // rawSales.week_start is "YYYY-MM-DD"
    ventasMap.set(s.week_start, Number(s.units));
  });

  const ventasPorSemana: number[] = [];
  for (let i = 0; i < hWeeks; i++) {
    const weekStart = new Date(windowStartMs + (i * oneWeekMs));
    // Formato "YYYY-MM-DD"
    const yy = weekStart.getFullYear();
    const mm = String(weekStart.getMonth() + 1).padStart(2, '0');
    const dd = String(weekStart.getDate()).padStart(2, '0');
    const key = `${yy}-${mm}-${dd}`;
    ventasPorSemana.push(ventasMap.get(key) || 0);
  }

  return {
    ventasPorSemana,
    semanasDisponibles
  };
}

export interface ProductWeeklySalesStat {
  product_id: string;
  first_sale_at: string | null;
  weeks: {
    week_start: string;
    units: number;
  }[];
}

/**
 * Procesa la respuesta JSONB del RPC get_product_weekly_sales_stats
 * devolviendo un mapa indexado por product_id.
 * Valida la forma esperada: array de { product_id, first_sale_at, weeks: [] }.
 * Si el formato es inválido o plano legacy (ej: { product_id, week_start, units }), lanza Error.
 */
export function parseReplenishmentRpcResponse(
  rpcData: unknown
): Map<string, { weeks: { week_start: string; units: number }[]; firstSale: string | null }> {
  if (!Array.isArray(rpcData)) {
    throw new Error('Invalid replenishment RPC response: expected an array');
  }

  const map = new Map<string, { weeks: { week_start: string; units: number }[]; firstSale: string | null }>();

  for (const item of rpcData) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('product_id' in item) ||
      !('first_sale_at' in item) ||
      !('weeks' in item) ||
      !Array.isArray(item.weeks)
    ) {
      throw new Error('Invalid replenishment RPC response shape: expected array of {product_id, first_sale_at, weeks[]}');
    }

    map.set(item.product_id, {
      weeks: item.weeks.map((w: any) => ({
        week_start: String(w.week_start),
        units: Number(w.units ?? 0)
      })),
      firstSale: item.first_sale_at ?? null
    });
  }

  return map;
}

/**
 * Ordena alertas de reposición por días de cobertura ascendente, y secundariamente por nombre.
 */
export function sortReplenishmentAlerts<T extends { name?: string; replenishmentResult?: ReplenishmentResult | null }>(
  alerts: T[]
): T[] {
  return [...alerts].sort((a, b) => {
    const covA = a.replenishmentResult?.diasCobertura ?? Infinity;
    const covB = b.replenishmentResult?.diasCobertura ?? Infinity;
    if (covA !== covB) return covA - covB;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * Función pura de paginación para alertas de reposición.
 */
export function paginateAlerts<T>(
  items: T[],
  page: number,
  pageSize: number
): { paginated: T[]; total: number; offset: number } {
  const total = items.length;
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, pageSize);
  const offset = (safePage - 1) * safeLimit;
  const paginated = items.slice(offset, offset + safeLimit);
  return { paginated, total, offset };
}

export interface ProductWithReplenishment {
  id: string;
  name?: string;
  brand?: string;
  categoryId?: string;
  subcategoryId?: string;
  price?: number;
  stock?: number;
  minStock?: number;
  image?: string;
  isPaused?: boolean;
  sku?: string;
  barcode?: string;
  createdAt?: string;
  updatedAt?: string;
  replenishmentResult?: ReplenishmentResult | null;
}

/**
 * Función pura que construye el arreglo de alertas de reposición
 * consumible por el PDF y el Dashboard.
 */
export function buildReplenishmentAlerts(
  activeProducts: any[],
  liveStockMap: Map<string, number>,
  groupedStats: Map<string, { weeks: { week_start: string; units: number }[]; firstSale: string | null }>,
  config: ReplenishmentConfig,
  nowMs: number = Date.now()
): {
  alerts: ProductWithReplenishment[];
  noHistoryProducts: ProductWithReplenishment[];
} {
  const processed: ProductWithReplenishment[] = activeProducts.map(p => {
    const currentStock = liveStockMap.has(p.id) ? liveStockMap.get(p.id)! : (p.stock ?? 0);
    const pStats = groupedStats.get(p.id);
    
    return { ...p, stock: currentStock, _stats: pStats };
  });

  const allAlerts: ProductWithReplenishment[] = [];
  const noHistoryProducts: ProductWithReplenishment[] = [];

  for (const p of processed) {
    const pStats = (p as any)._stats;
    delete (p as any)._stats;

    let result: ReplenishmentResult | null = null;
    
    const rawWeeks = (pStats && Array.isArray(pStats.weeks)) ? pStats.weeks : [];
    const firstSale = pStats?.firstSale ?? null;

    if (rawWeeks.length > 0) {
      const dense = buildDenseSalesHistory(
        p.createdAt || new Date(nowMs).toISOString(),
        firstSale,
        rawWeeks,
        config.historyWeeks,
        nowMs
      );

      result = calculateProductReplenishment({
        ventasPorSemana: dense.ventasPorSemana,
        semanasDisponibles: dense.semanasDisponibles,
        stockActual: p.stock ?? 0,
        config
      });
    } else {
      // Sin ninguna venta registrada, si el stock <= 0, va a SIN_HISTORIAL
      if ((p.stock ?? 0) <= 0) {
        result = {
          status: 'SIN_HISTORIAL',
          alerta: false,
          stockObjetivo: null,
          cantidadRecomendada: null,
          puntoReposicion: null,
          diasCobertura: null,
          promedioSemanal: null,
          nivelHistorial: null,
          historialInsuficiente: false,
          etiquetaMargen: null,
          ventanaEfectiva: null
        };
      }
    }
    
    if (result) {
      p.replenishmentResult = result;
      
      if (result.status === 'REPOSICION' || (result.status === 'NORMAL' && result.alerta)) {
        allAlerts.push(p);
      } else if (result.status === 'SIN_HISTORIAL') {
        noHistoryProducts.push(p);
      }
    }
  }

  return { alerts: allAlerts, noHistoryProducts };
}
