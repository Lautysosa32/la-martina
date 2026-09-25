import api from '../lib/axios';
import { Product, CreateProductInput, UpdateProductInput, SupabaseProduct } from '../types/product.types';
import { catalogCache, TTL } from './catalogCache';
import { ProductWeeklySalesStat } from '../utils/replenishment';

// Columnas estrictas para vistas de catálogo y listas (Ahorro crítico de Egress)
export const PRODUCT_CATALOG_SELECT = 'id,name,brand,category_id,subcategory_id,price,original_price,barcode,image,format,is_new,discount,badge,stock,min_stock,sale_type,is_paused';

// Columnas mínimas para autocompletado y búsqueda rápida en navbar
export const PRODUCT_AUTOCOMPLETE_SELECT = 'id,name,brand,price,image,category_id';

export { PRODUCT_LOW_STOCK_SELECT, buildLowStockPaginatedUrl } from '../utils/lowStockUrl';
import { buildLowStockPaginatedUrl } from '../utils/lowStockUrl';

// Convert from frontend camelCase to Supabase snake_case
const toSupabaseProduct = (input: Partial<CreateProductInput>): Partial<SupabaseProduct> => {
  return {
    ...(input.branchId !== undefined && { branch_id: input.branchId }),
    ...(input.name !== undefined && { name: input.name }),
    ...(input.brand !== undefined && { brand: input.brand }),
    ...(input.categoryId !== undefined && { category_id: input.categoryId }),
    ...(input.subcategoryId !== undefined && { subcategory_id: input.subcategoryId || null }),
    ...(input.price !== undefined && { price: input.price }),
    ...(input.originalPrice !== undefined && { original_price: input.originalPrice }),
    ...(input.image !== undefined && { image: input.image }),
    ...(input.format !== undefined && { format: input.format }),
    ...(input.isNew !== undefined && { is_new: input.isNew }),
    ...(input.discount !== undefined && { discount: input.discount }),
    ...(input.badge !== undefined && { badge: input.badge }),
    ...(input.minStock !== undefined && { min_stock: input.minStock }),
    ...(input.barcode !== undefined && { barcode: input.barcode }),
    ...(input.stock !== undefined && { stock: input.stock }),
    ...(input.saleType !== undefined && { sale_type: input.saleType }),
    ...(input.isPaused !== undefined && { is_paused: input.isPaused }),
    updated_at: new Date().toISOString()
  };
};

// Convert from Supabase snake_case to frontend camelCase (admite proyecciones parciales)
const toFrontendProduct = (product: any): Product => {
  return {
    id: product.id,
    branchId: product.branch_id ?? null,
    name: product.name ?? '',
    brand: product.brand ?? '',
    categoryId: product.category_id ?? '',
    subcategoryId: product.subcategory_id || null,
    price: product.price ?? 0,
    originalPrice: product.original_price ?? null,
    image: product.image ?? '',
    format: product.format ?? null,
    isNew: product.is_new ?? false,
    discount: product.discount ?? null,
    badge: product.badge ?? null,
    minStock: product.min_stock ?? 0,
    barcode: product.barcode ?? null,
    stock: product.stock ?? 0,
    saleType: product.sale_type || 'unit',
    isPaused: product.is_paused ?? false,
    createdAt: product.created_at ?? '',
    updatedAt: product.updated_at ?? '',
  };
};

export interface PaginatedProductsParams {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  sortBy?: string;
  sortDesc?: boolean;
  columns?: string;
  useCache?: boolean;
  minPrice?: number;
  maxPrice?: number;
  brands?: string[];
  onlyInStock?: boolean;
  includePaused?: boolean;
  status?: 'active' | 'paused' | 'all';
}

export const productsService = {
  /**
   * Obtiene productos paginados con proyección estricta de columnas y caché con TTL
   */
  async getProductsPaginated(params: PaginatedProductsParams): Promise<{ data: Product[]; total: number }> {
    const columns = params.columns || PRODUCT_CATALOG_SELECT;
    const useCache = params.useCache ?? true;

    const cacheKey = `catalog_v6_${params.categoryId || 'all'}_${params.subcategoryId || 'all'}_p${params.page}_l${params.limit}_s${params.search || ''}_sort${params.sortBy || 'def'}_${params.sortDesc ? 'desc' : 'asc'}_min${params.minPrice || ''}_max${params.maxPrice || ''}_b${(params.brands || []).sort().join(',')}_stk${params.onlyInStock ? '1' : '0'}_pau${params.includePaused ? '1' : '0'}_st${params.status || 'def'}`;

    if (useCache) {
      const cached = catalogCache.get<{ data: Product[]; total: number }>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const offset = (params.page - 1) * params.limit;
    let url = `/products?select=${columns}&limit=${params.limit}&offset=${offset}`;

    // 1. Regla de productos pausados / activos:
    if (params.status === 'active') {
      url += `&is_paused=eq.false`;
    } else if (params.status === 'paused') {
      url += `&is_paused=eq.true`;
    } else if (params.status === 'all') {
      // No filtrar por is_paused
    } else if (!params.includePaused) {
      url += `&is_paused=eq.false`;
    }

    // 2. Regla de productos con stock:
    // Si se requiere solo productos con stock disponible (ej: categorías de la tienda)
    if (params.onlyInStock) {
      url += `&stock=gt.0`;
    }

    if (params.categoryId && params.categoryId !== 'all') {
      url += `&category_id=eq.${encodeURIComponent(params.categoryId)}`;
    }

    if (params.subcategoryId && params.subcategoryId !== 'all') {
      const cleanSub = params.subcategoryId.trim();
      if (params.categoryId && params.categoryId !== 'all' && !cleanSub.startsWith(params.categoryId)) {
        url += `&or=(subcategory_id.eq.${encodeURIComponent(cleanSub)},subcategory_id.eq.${encodeURIComponent(params.categoryId + '-' + cleanSub)})`;
      } else {
        url += `&subcategory_id=eq.${encodeURIComponent(cleanSub)}`;
      }
    }

    if (params.search && params.search.trim() !== '') {
      const cleanSearch = encodeURIComponent(params.search.trim());
      url += `&or=(name.ilike.*${cleanSearch}*,brand.ilike.*${cleanSearch}*,barcode.ilike.*${cleanSearch}*)`;
    }

    if (params.minPrice !== undefined && params.minPrice > 0) {
      url += `&price=gte.${params.minPrice}`;
    }

    if (params.maxPrice !== undefined && params.maxPrice < 9999999) {
      url += `&price=lte.${params.maxPrice}`;
    }

    if (params.brands && params.brands.length > 0) {
      if (params.brands.length === 1) {
        url += `&brand=ilike.*${encodeURIComponent(params.brands[0].trim())}*`;
      } else {
        const variants: string[] = [];
        params.brands.forEach(b => {
          const t = b.trim();
          variants.push(
            `"${t}"`,
            `"${t} "`,
            `" ${t}"`,
            `"${t.toLowerCase()}"`,
            `"${t.toLowerCase()} "`,
            `"${t.toUpperCase()}"`,
            `"${t.toUpperCase()} "`
          );
        });
        url += `&brand=in.(${variants.join(',')})`;
      }
    }

    if (params.sortBy) {
      let column = params.sortBy;
      if (column === 'categoryId') column = 'category_id';
      if (column === 'subcategoryId') column = 'subcategory_id';
      if (column === 'featured') column = 'created_at';
      
      url += `&order=${column}.${params.sortDesc ? 'desc' : 'asc'}.nullslast`;
    } else {
      url += `&order=created_at.desc`;
    }

    const response = await api.get<any[]>(url, {
      headers: { 'Prefer': 'count=exact' }
    });

    const countStr = response.headers['content-range'] || response.headers['Content-Range'];
    let total = 0;
    if (countStr) {
      const match = countStr.match(/\/\s*(\d+)/);
      if (match) total = parseInt(match[1]);
    } else {
      total = response.data.length;
    }

    const rawProducts = response.data.map(toFrontendProduct);
    const filteredProducts = rawProducts.filter(p => {
      if (!params.includePaused && p.isPaused) return false;
      if (params.onlyInStock && (p.stock ?? 0) <= 0) return false;
      return true;
    });

    const result = {
      data: filteredProducts,
      total
    };

    if (useCache && result.data.length > 0) {
      catalogCache.set(cacheKey, result, TTL.CATALOG_PAGE);
    }

    return result;
  },

  /**
   * Obtiene la lista única de marcas disponibles para una categoría o subcategoría
   */
  async getCategoryBrands(categoryId?: string, subcategoryId?: string): Promise<string[]> {
    try {
      let url = `/products?select=brand&is_paused=eq.false&stock=gt.0&brand=neq.`;
      if (categoryId && categoryId !== 'all') {
        url += `&category_id=eq.${encodeURIComponent(categoryId)}`;
      }
      if (subcategoryId && subcategoryId !== 'all') {
        const cleanSub = subcategoryId.trim();
        if (categoryId && categoryId !== 'all' && !cleanSub.startsWith(categoryId)) {
          url += `&or=(subcategory_id.eq.${encodeURIComponent(cleanSub)},subcategory_id.eq.${encodeURIComponent(categoryId + '-' + cleanSub)})`;
        } else {
          url += `&subcategory_id=eq.${encodeURIComponent(cleanSub)}`;
        }
      }
      const response = await api.get<{ brand: string }[]>(url);
      const set = new Set<string>();
      (response.data || []).forEach(p => {
        if (p.brand && p.brand.trim()) {
          set.add(p.brand.trim());
        }
      });
      return Array.from(set).sort();
    } catch (e) {
      console.warn('Error fetching category brands:', e);
      return [];
    }
  },

  /**
   * Búsqueda rápida con debounce para el Header navbar (5 items, solo 6 columnas ultra-ligeras)
   */
  async searchProductsQuick(query: string, limit: number = 5): Promise<Product[]> {
    const clean = query.trim();
    if (clean.length < 2) return [];

    const cacheKey = `search_quick_v5_${clean.toLowerCase()}_${limit}`;
    const cached = catalogCache.get<Product[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;

    const encoded = encodeURIComponent(clean);
    const url = `/products?select=${PRODUCT_AUTOCOMPLETE_SELECT}&is_paused=eq.false&or=(name.ilike.*${encoded}*,brand.ilike.*${encoded}*)&limit=${limit}&order=name.asc`;

    try {
      const response = await api.get<any[]>(url);
      const data = response.data.map(toFrontendProduct).filter(p => !p.isPaused);
      if (data.length > 0) {
        catalogCache.set(cacheKey, data, TTL.SEARCH_AUTOCOMPLETE);
      }
      return data;
    } catch (err) {
      console.error('Error in searchProductsQuick:', err);
      return [];
    }
  },

  /**
   * Obtiene productos con descuento/oferta para la Home (exactamente 25 productos, columnas estrictas)
   * Soporta tanto promociones activas (offers de Admin) como descuentos directos en producto.
   */
  async getOffersProducts(limit: number = 25, activeOffers?: any[]): Promise<Product[]> {
    const offersSignature = (activeOffers || [])
      .map(o => `${o.id || o.name}:${o.scope}:${o.targetId || ''}`)
      .sort()
      .join('|');
    const cacheKey = `home_offers_v6_${limit}_${offersSignature ? btoa(offersSignature).slice(0, 16) : 'default'}`;
    const cached = catalogCache.get<Product[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;

    // 1. Analizar alcances de las promociones activas
    const hasGlobalOffer = (activeOffers || []).some(o => o.active && o.scope === 'all');
    const targetProductIds: string[] = [];
    const targetCategoryIds: string[] = [];
    const targetSubcategoryIds: string[] = [];
    const targetTags: string[] = [];

    (activeOffers || []).forEach(o => {
      if (!o.active) return;
      if (o.scope === 'product') {
        const ids = o.targetIds && o.targetIds.length > 0
          ? o.targetIds
          : (o.targetId ? [o.targetId] : (o.productId ? [o.productId] : []));
        targetProductIds.push(...ids);
      } else if (o.scope === 'category' && o.targetId) {
        targetCategoryIds.push(o.targetId);
      } else if (o.scope === 'subcategory' && (o.subcategoryId || o.targetId)) {
        targetSubcategoryIds.push(o.subcategoryId || o.targetId);
      } else if (o.scope === 'tag' && (o.tagFilter || o.targetId)) {
        targetTags.push(o.tagFilter || o.targetId);
      }
    });

    let url = `/products?select=${PRODUCT_CATALOG_SELECT}&stock=gt.0&is_paused=eq.false`;

    if (!hasGlobalOffer) {
      const orFilters: string[] = [
        'discount.gt.0',
        'original_price.not.is.null',
        'badge.ilike.*oferta*',
        'badge.ilike.*3x2*',
        'badge.ilike.*promo*',
        'badge.ilike.*descuento*'
      ];

      if (targetProductIds.length > 0) {
        const uniqueIds = Array.from(new Set(targetProductIds)).slice(0, 50);
        orFilters.push(`id.in.(${uniqueIds.map(id => `"${encodeURIComponent(id)}"`).join(',')})`);
      }
      if (targetCategoryIds.length > 0) {
        const uniqueCats = Array.from(new Set(targetCategoryIds));
        orFilters.push(`category_id.in.(${uniqueCats.map(c => `"${encodeURIComponent(c)}"`).join(',')})`);
      }
      if (targetSubcategoryIds.length > 0) {
        const uniqueSubs = Array.from(new Set(targetSubcategoryIds));
        orFilters.push(`subcategory_id.in.(${uniqueSubs.map(s => `"${encodeURIComponent(s)}"`).join(',')})`);
      }
      if (targetTags.length > 0) {
        targetTags.forEach(t => orFilters.push(`badge.ilike.*${encodeURIComponent(t)}*`));
      }

      url += `&or=(${orFilters.join(',')})`;
    }

    url += `&order=updated_at.desc&limit=${limit}`;

    try {
      const response = await api.get<any[]>(url);
      const raw = response.data.map(toFrontendProduct);
      
      // Filtramos para garantizar que solo ingresen productos con beneficio o descuento comprobable, activos y con stock
      const products = raw.filter(p => {
        if (p.isPaused || (p.stock ?? 0) <= 0) return false;
        if (hasGlobalOffer) return true;

        const hasDiscount = p.discount !== null && p.discount !== undefined && Number(p.discount) > 0;
        const hasOriginalPrice = p.originalPrice !== null && p.originalPrice !== undefined && Number(p.originalPrice) > Number(p.price);
        const hasOfferBadge = Boolean(p.badge && /(oferta|3x2|promo|descuento)/i.test(p.badge));
        if (hasDiscount || hasOriginalPrice || hasOfferBadge) return true;

        if (activeOffers && activeOffers.length > 0) {
          return activeOffers.some(o => {
            if (!o.active) return false;
            if (o.scope === 'all') return true;
            if (o.scope === 'product') {
              const ids = o.targetIds && o.targetIds.length > 0
                ? o.targetIds
                : (o.targetId ? [o.targetId] : (o.productId ? [o.productId] : []));
              return ids.includes(p.id);
            }
            if (o.scope === 'category') return p.categoryId && p.categoryId === o.targetId;
            if (o.scope === 'subcategory') return p.subcategoryId && p.subcategoryId === o.targetId;
            if (o.scope === 'tag') {
              const tag = (o.tagFilter || o.targetId || '').toLowerCase().trim();
              return p.badge && p.badge.toLowerCase().includes(tag);
            }
            return false;
          });
        }

        return false;
      });

      if (products.length > 0) {
        catalogCache.set(cacheKey, products, TTL.OFFERS);
      }
      return products;
    } catch (err) {
      console.error('Error fetching offers:', err);
      return [];
    }
  },

  /**
   * Obtiene productos destacados para la Home (limit dinámico: 20 celular / 40 computadora = 10 filas)
   */
  async getFeaturedProducts(limit: number = 40): Promise<Product[]> {
    const cacheKey = `home_featured_v5_${limit}`;
    const cached = catalogCache.get<Product[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;

    const url = `/products?select=${PRODUCT_CATALOG_SELECT}&stock=gt.0&is_paused=eq.false&order=created_at.desc&limit=${limit}`;

    try {
      const response = await api.get<any[]>(url);
      const products = response.data.map(toFrontendProduct).filter(p => !p.isPaused && (p.stock ?? 0) > 0);
      if (products.length > 0) {
        catalogCache.set(cacheKey, products, TTL.OFFERS);
      }
      return products;
    } catch (err) {
      console.error('Error fetching featured products:', err);
      return [];
    }
  },

  /**
   * Obtiene productos con bajo stock paginados para el panel de administración
   */
  async getLowStockProductsPaginated(params: { page: number; limit: number }): Promise<{ data: Product[]; total: number; outOfStockTotal: number; lowStockTotal: number }> {
    const url = buildLowStockPaginatedUrl(params);

    const [response, outOfStockRes, lowStockRes] = await Promise.all([
      api.get<any[]>(url, { headers: { 'Prefer': 'count=exact' } }),
      api.get(`/products?stock=eq.0&is_paused=eq.false&limit=1`, { headers: { 'Prefer': 'count=exact' } }),
      api.get(`/products?stock=gt.0&stock=lte.15&is_paused=eq.false&limit=1`, { headers: { 'Prefer': 'count=exact' } })
    ]);

    const getCount = (res: any) => {
      const countStr = res.headers['content-range'] || res.headers['Content-Range'];
      if (countStr) {
        const match = countStr.match(/\/\s*(\d+)/);
        if (match) return parseInt(match[1]);
      }
      return 0;
    };

    return {
      data: response.data.map(toFrontendProduct),
      total: getCount(response),
      outOfStockTotal: getCount(outOfStockRes),
      lowStockTotal: getCount(lowStockRes)
    };
  },

  /**
   * Obtiene resumen de alertas de stock (excluyendo productos pausados)
   */
  async getAllLowStockProducts(): Promise<{ id: string; name: string; categoryId: string; stock: number }[]> {
    const PAGE_SIZE = 500;
    let all: { id: string; name: string; categoryId: string; stock: number }[] = [];
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const response = await api.get<any[]>(
        `/products?select=id,name,category_id,stock,is_paused&stock=lte.15&is_paused=eq.false&order=name.asc&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const batch = response.data
        .filter(p => p.is_paused !== true)
        .map(p => ({
          id: p.id,
          name: p.name,
          categoryId: p.category_id,
          stock: p.stock ?? 0
        }));
      all = [...all, ...batch];
      if (batch.length < PAGE_SIZE) {
        keepFetching = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    return all;
  },

  /**
   * Obtiene estadísticas semanales de ventas para reposición de inventario
   */
  /**
   * Obtiene estadísticas semanales de ventas mediante la función RPC optimizada (retorna JSONB).
   */
  async getReplenishmentStats(hWeeks: number = 16): Promise<ProductWeeklySalesStat[]> {
    try {
      const cacheKey = `replenishment_stats_${hWeeks}`;
      const cached = catalogCache.get<ProductWeeklySalesStat[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) return cached;
      
      const response = await api.post<ProductWeeklySalesStat[]>('/rpc/get_product_weekly_sales_stats', { h_weeks: hWeeks });
      const stats = Array.isArray(response.data) ? response.data : [];
      
      if (stats.length > 0) {
        catalogCache.set(cacheKey, stats, 24 * 60 * 60 * 1000);
      }
      return stats;
    } catch (err) {
      console.error('Error fetching replenishment stats:', err);
      // Propagate to trigger the store's fallback
      throw err;
    }
  },

  /**
   * Obtiene el stock actual de todos los productos (liviano)
   */
  async getLiveStock(): Promise<{ id: string; stock: number }[]> {
    const PAGE_SIZE = 1000;
    let allStock: { id: string; stock: number }[] = [];
    let offset = 0;
    let keepFetching = true;
    let iterations = 0;

    while (keepFetching) {
      iterations++;
      if (iterations > 1000) {
        throw new Error('Live stock pagination exceeded maximum limit of 1000 iterations');
      }

      const response = await api.get<any[]>(`/products?select=id,stock&is_paused=eq.false&limit=${PAGE_SIZE}&offset=${offset}`);
      if (response.data && response.data.length > 0) {
        const batch = response.data.map(p => ({ id: p.id, stock: p.stock ?? 0 }));
        allStock = [...allStock, ...batch];
        if (batch.length < PAGE_SIZE) {
          keepFetching = false;
        } else {
          offset += PAGE_SIZE;
        }
      } else {
        keepFetching = false;
      }
    }
    
    return allStock;
  },

  /**
   * Búsqueda por código de barras (solo para punto de venta o calculadora)
   */
  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const clean = barcode.trim();
    if (!clean) return null;
    const response = await api.get<any[]>(`/products?barcode=eq.${encodeURIComponent(clean)}&select=${PRODUCT_CATALOG_SELECT}`);
    if (response.data.length === 0) return null;
    return toFrontendProduct(response.data[0]);
  },

  /**
   * getProducts: Mantenido para casos específicos de administración/POS si fuera requerido,
   * con columnas estrictas para no transferir campos innecesarios.
   */
  async getProducts(): Promise<Product[]> {
    const PAGE_SIZE = 1000;
    let allProducts: any[] = [];
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const response = await api.get<any[]>(
        `/products?select=${PRODUCT_CATALOG_SELECT}&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const batch = response.data;
      allProducts = [...allProducts, ...batch];
      
      if (batch.length < PAGE_SIZE) {
        keepFetching = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    return allProducts.map(toFrontendProduct);
  },

  async createProduct(product: CreateProductInput): Promise<Product> {
    catalogCache.invalidateCatalog();
    const data = toSupabaseProduct(product);
    const response = await api.post<SupabaseProduct[]>('/products', data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendProduct(response.data[0]);
  },

  async updateProduct(id: string, updates: UpdateProductInput): Promise<Product> {
    catalogCache.invalidateCatalog();
    const data = toSupabaseProduct(updates);
    const response = await api.patch<SupabaseProduct[]>(`/products?id=eq.${id}`, data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendProduct(response.data[0]);
  },

  async deleteProduct(id: string): Promise<void> {
    catalogCache.invalidateCatalog();
    await api.delete(`/products?id=eq.${id}`);
  },

  async updateStock(id: string, stock: number): Promise<void> {
    catalogCache.invalidateCatalog();
    await api.patch(`/products?id=eq.${id}`, { stock });
  },

  async bulkCreateProducts(products: CreateProductInput[]): Promise<Product[]> {
    catalogCache.invalidateCatalog();
    const data = products.map(toSupabaseProduct);
    const response = await api.post<SupabaseProduct[]>('/products', data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data.map(toFrontendProduct);
  },

  async bulkUpdatePause(ids: string[], isPaused: boolean): Promise<void> {
    if (ids.length === 0) return;
    catalogCache.invalidateCatalog();
    await api.patch(`/products?id=in.(${ids.join(',')})`, { is_paused: isPaused });
  }
};
