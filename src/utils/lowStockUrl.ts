import { paginateAlerts } from './replenishment';

// Columnas para panel de bajo stock en administración
export const PRODUCT_LOW_STOCK_SELECT = 'id,name,brand,category_id,subcategory_id,price,stock,min_stock,image,badge,updated_at,is_paused';

/**
 * Función pura que construye la URL para la consulta paginada de bajo stock tradicional (flag apagado).
 */
export function buildLowStockPaginatedUrl(params: { page: number; limit: number }): string {
  const offset = (params.page - 1) * params.limit;
  return `/products?select=${PRODUCT_LOW_STOCK_SELECT}&stock=lte.15&is_paused=eq.false&order=stock.asc,updated_at.desc&limit=${params.limit}&offset=${offset}`;
}

export interface FetchLowStockDashboardDeps {
  getConfig: () => Promise<{ enabled: boolean }>;
  getCachedConfig?: () => { enabled: boolean } | null | undefined;
  getLowStockProductsPaginated: (params: { page: number; limit: number }) => Promise<{ data: any[]; total: number; outOfStockTotal: number; lowStockTotal: number }>;
  fetchAllReplenishmentAlerts: () => Promise<void>;
  getAllReplenishmentAlerts: () => any[];
  getProducts: () => any[];
  getOutOfStockTotal?: () => number;
  getLowStockTotal?: () => number;
  set: (state: any) => void;
}

/**
 * Lógica pura del store para cargar productos de bajo stock en el Dashboard.
 * Permite probar directamente la bifurcación del feature flag (encendido vs apagado)
 * aislando el comportamiento de dependencias externas.
 */
export async function fetchLowStockDashboardProductsHandler(
  params: { page: number; limit: number; search?: string; categoryId?: string; subcategoryId?: string },
  deps: FetchLowStockDashboardDeps
): Promise<void> {
  deps.set({ lowStockDashboardLoading: true, error: null });
  let config: { enabled: boolean } = { enabled: false };
  try {
    const cached = deps.getCachedConfig ? deps.getCachedConfig() : null;
    if (cached) {
      config = cached;
    } else {
      config = await deps.getConfig();
    }
  } catch (err) {
    console.error('❌ Error reading replenishment config, assuming enabled=false:', err);
    config = { enabled: false };
  }

  if (!config.enabled) {
    const { data, total, outOfStockTotal, lowStockTotal } = await deps.getLowStockProductsPaginated(params);
    deps.set({
      lowStockDashboardProducts: data,
      lowStockDashboardTotal: total,
      outOfStockTotal,
      lowStockTotal,
      lowStockDashboardLoading: false,
      allReplenishmentAlerts: [],
      allReplenishmentNoHistory: []
    });
    return;
  }

  await deps.fetchAllReplenishmentAlerts();
  const alerts = deps.getAllReplenishmentAlerts();

  let filtered = alerts;
  if (params.search) {
    const s = params.search.toLowerCase();
    filtered = filtered.filter(p => p.name?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s));
  }
  if (params.categoryId && params.categoryId !== 'all') {
    filtered = filtered.filter(p => p.categoryId === params.categoryId);
  }
  if (params.subcategoryId && params.subcategoryId !== 'all') {
    filtered = filtered.filter(p => {
      if (p.subcategoryId === params.subcategoryId) return true;
      const parts = params.subcategoryId!.split('-');
      const lastPart = parts[parts.length - 1];
      return p.subcategoryId === lastPart;
    });
  }

  const { paginated, total } = paginateAlerts(filtered, params.page, params.limit);
  const outOfStockTotal = deps.getOutOfStockTotal ? deps.getOutOfStockTotal() : deps.getProducts().filter(p => !p.isPaused && (p.stock ?? 0) <= 0).length;
  const lowStockTotal = deps.getLowStockTotal ? deps.getLowStockTotal() : alerts.filter(p => (p.stock ?? 0) > 0).length;

  deps.set({
    lowStockDashboardProducts: paginated,
    lowStockDashboardTotal: total,
    outOfStockTotal,
    lowStockTotal,
    lowStockDashboardLoading: false
  });
}
