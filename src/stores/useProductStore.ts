import { create } from 'zustand';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product.types';
import { productsService } from '../services/products.service';
import { productRepository } from '../offline/repositories/productRepository';
import { syncEngine } from '../offline/syncEngine';
import { LocalProduct } from '../offline/types';
import { fetchSetting } from '../services/admin.service';
import { calculateProductReplenishment, buildDenseSalesHistory, defaultReplenishmentConfig, validateReplenishmentConfig, ReplenishmentConfig, ReplenishmentResult, parseReplenishmentRpcResponse, sortReplenishmentAlerts, paginateAlerts } from '../utils/replenishment';
import { fetchLowStockDashboardProductsHandler } from '../utils/lowStockUrl';

export type ProductWithReplenishment = Product & {
  replenishmentResult?: ReplenishmentResult | null;
  sku?: string;
};

interface ProductState {
  products: Product[];
  loading: boolean;
  error: string | null;
  isReplenishmentEnabled: boolean;
  replenishmentConfig: ReplenishmentConfig | null;
  setReplenishmentConfig: (config: ReplenishmentConfig | null) => void;
  
  fetchProducts: () => Promise<void>;
  
  // Paginated states
  inventoryProducts: Product[];
  inventoryTotal: number;
  inventoryLoading: boolean;
  fetchInventoryProducts: (params: { page: number; limit: number; search?: string; categoryId?: string; subcategoryId?: string; status?: 'active' | 'paused' | 'all'; sortBy?: string; sortDesc?: boolean }) => Promise<void>;

  lowStockDashboardProducts: ProductWithReplenishment[];
  lowStockDashboardTotal: number;
  lowStockDashboardLoading: boolean;
  outOfStockTotal: number;
  lowStockTotal: number;
  
  // For the PDF and internal usage
  allReplenishmentAlerts: ProductWithReplenishment[];
  allReplenishmentNoHistory: ProductWithReplenishment[];

  fetchLowStockDashboardProducts: (params: { page: number; limit: number; search?: string; categoryId?: string; subcategoryId?: string }) => Promise<void>;
  fetchAllReplenishmentAlerts: (forceRefresh?: boolean) => Promise<void>;
  getProductReplenishment: (product: Product) => Promise<ReplenishmentResult | null>;

  addProduct: (product: CreateProductInput) => Promise<Product | null>;
  updateProduct: (id: string, updates: UpdateProductInput) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  updateStock: (id: string, stock: number) => Promise<boolean>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  bulkAddProducts: (products: CreateProductInput[]) => Promise<boolean>;
  bulkUpdateProducts: (items: { id: string; updates: UpdateProductInput }[], onProgress?: (processed: number) => void) => Promise<boolean>;
  bulkUpdatePrice: (ids: string[], percentage: number) => Promise<boolean>;
  bulkTogglePause: (ids: string[], forceState?: boolean) => Promise<boolean>;
  clearError: () => void;
}

const getErrorMessage = (err: any, defaultMessage: string): string => {
  if (err.response?.data?.message) {
    return `${defaultMessage}: ${err.response.data.message}`;
  }
  return err.message ? `${defaultMessage}: ${err.message}` : defaultMessage;
};

let isFetchingProducts = false;
let lastReplenishmentFetchTimestamp = 0;

const toLocalProductFromStoreProduct = (p: Product): LocalProduct => ({
  id: p.id,
  branch_id: p.branchId || undefined,
  name: p.name || '',
  brand: p.brand || '',
  category_id: p.categoryId || '',
  subcategory_id: p.subcategoryId || null,
  price: Number(p.price || 0),
  original_price: p.originalPrice ? Number(p.originalPrice) : null,
  barcode: p.barcode ? String(p.barcode).trim() : null,
  image: p.image || '',
  format: p.format || null,
  stock: Number(p.stock ?? 0),
  min_stock: Number(p.minStock ?? 0),
  sale_type: p.saleType === 'weight' ? 'weight' : 'unit',
  discount: p.discount ? String(p.discount) : null,
  badge: p.badge || null,
  is_new: Boolean(p.isNew),
  active: true,
  is_paused: Boolean(p.isPaused),
  updated_at: p.updatedAt || new Date().toISOString()
});

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  error: null,

  inventoryProducts: [],
  inventoryTotal: 0,
  inventoryLoading: false,

  lowStockDashboardProducts: [],
  lowStockDashboardTotal: 0,
  outOfStockTotal: 0,
  lowStockTotal: 0,
  lowStockDashboardLoading: false,
  allReplenishmentAlerts: [],
  allReplenishmentNoHistory: [],
  replenishmentConfig: null,
  isReplenishmentEnabled: false,

  setReplenishmentConfig: (config) => {
    set({
      replenishmentConfig: config,
      isReplenishmentEnabled: config ? config.enabled : false
    });
  },

  fetchProducts: async () => {
    if (isFetchingProducts) {
      console.log('⏳ Sincronización de catálogo ya en curso, ignorando llamada simultánea');
      return;
    }
    isFetchingProducts = true;
    set({ loading: true, error: null });
    try {
      // 1. Hidratación inmediata desde IndexedDB local (0 ms de bloqueo para el POS)
      const cached = await productRepository.getAllProducts();
      if (cached && cached.length > 0) {
        const mappedCached: Product[] = cached.map(p => ({
          id: p.id,
          branchId: p.branch_id ?? null,
          name: p.name,
          brand: p.brand,
          categoryId: p.category_id,
          subcategoryId: p.subcategory_id || null,
          price: p.price,
          originalPrice: p.original_price ?? null,
          image: p.image,
          format: p.format ?? null,
          isNew: p.is_new ?? false,
          discount: p.discount ? Number(p.discount) : null,
          badge: p.badge ?? null,
          minStock: p.min_stock ?? 0,
          barcode: p.barcode ?? null,
          stock: p.stock,
          saleType: p.sale_type,
          isPaused: p.is_paused ?? false,
          createdAt: '',
          updatedAt: p.updated_at
        }));
        set({ products: mappedCached, loading: false });
        console.log('📦 Productos precargados desde IndexedDB local:', mappedCached.length);
      }

      // 2. Si hay red, sincronizar de forma diferencial (Delta Sync) solo los cambios
      console.log('🔄 Ejecutando Delta Sync de catálogo con Supabase...');
      await syncEngine.pullProductsIncremental();

      // 3. Recargar el catálogo local fresco desde IndexedDB
      const freshLocal = await productRepository.getAllProducts();
      if (freshLocal && freshLocal.length > 0) {
        const mappedFresh: Product[] = freshLocal.map(p => ({
          id: p.id,
          branchId: p.branch_id ?? null,
          name: p.name,
          brand: p.brand,
          categoryId: p.category_id,
          subcategoryId: p.subcategory_id || null,
          price: p.price,
          originalPrice: p.original_price ?? null,
          image: p.image,
          format: p.format ?? null,
          isNew: p.is_new ?? false,
          discount: p.discount ? Number(p.discount) : null,
          badge: p.badge ?? null,
          minStock: p.min_stock ?? 0,
          barcode: p.barcode ?? null,
          stock: p.stock,
          saleType: p.sale_type,
          isPaused: p.is_paused ?? false,
          createdAt: '',
          updatedAt: p.updated_at
        }));
        set({ products: mappedFresh, loading: false });
        console.log('✅ Catálogo POS sincronizado y actualizado en memoria:', mappedFresh.length);
      } else {
        set({ loading: false });
      }
    } catch (err: any) {
      console.error('❌ Error fetching products:', err);
      // Si ya tenemos productos locales en memoria, continuar operando
      const current = get().products;
      if (current.length === 0) {
        set({ error: getErrorMessage(err, 'Error al obtener productos'), loading: false });
      } else {
        console.log('ℹ️ Operando con productos locales de IndexedDB');
        set({ loading: false });
      }
    } finally {
      isFetchingProducts = false;
    }
  },

  fetchInventoryProducts: async (params) => {
    set({ inventoryLoading: true, error: null });
    try {
      const { data, total } = await productsService.getProductsPaginated({
        ...params,
        includePaused: params.status === 'all' || params.status === 'paused',
        onlyInStock: false,
        useCache: false
      });
      set({ inventoryProducts: data, inventoryTotal: total, inventoryLoading: false });
    } catch (err: any) {
      console.error('❌ Error fetching inventory products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener productos del inventario'), inventoryLoading: false });
    }
  },

  fetchLowStockDashboardProducts: async (params) => {
    try {
      await fetchLowStockDashboardProductsHandler(params, {
        getCachedConfig: () => get().replenishmentConfig,
        getConfig: async () => {
          const cached = get().replenishmentConfig;
          if (cached !== null) {
            return cached;
          }
          try {
            const rawConfig = await fetchSetting<ReplenishmentConfig>('inventory_replenishment_config', defaultReplenishmentConfig);
            const configError = validateReplenishmentConfig(rawConfig);
            const config = configError ? (console.warn(`[REPLENISHMENT CONFIG] Configuración inválida: ${configError}. Usando defaults.`), defaultReplenishmentConfig) : rawConfig;
            set({ replenishmentConfig: config, isReplenishmentEnabled: config.enabled });
            return config;
          } catch (err) {
            console.error('❌ Error fetching replenishment config:', err);
            const fallback = { ...defaultReplenishmentConfig, enabled: false };
            set({ replenishmentConfig: fallback, isReplenishmentEnabled: false });
            return fallback;
          }
        },
        getLowStockProductsPaginated: (p) => productsService.getLowStockProductsPaginated(p),
        fetchAllReplenishmentAlerts: () => get().fetchAllReplenishmentAlerts(),
        getAllReplenishmentAlerts: () => get().allReplenishmentAlerts,
        getProducts: () => get().products,
        set: (state) => set(state)
      });
    } catch (err: any) {
      console.error('❌ Error fetching low stock products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener alertas de stock'), lowStockDashboardLoading: false });
    }
  },

  fetchAllReplenishmentAlerts: async (forceRefresh = false) => {
    try {
      const now = Date.now();
      // Si ya calculamos alertas en los últimos 10 minutos y no se solicita refresco forzado, reutilizar
      if (!forceRefresh && get().allReplenishmentAlerts.length > 0 && (now - lastReplenishmentFetchTimestamp) < 10 * 60 * 1000) {
        return;
      }

      const rawConfig = await fetchSetting<ReplenishmentConfig>('inventory_replenishment_config', defaultReplenishmentConfig);
      const configError = validateReplenishmentConfig(rawConfig);
      const config = configError ? (console.warn(`[REPLENISHMENT CONFIG] Configuración inválida: ${configError}. Usando defaults.`), defaultReplenishmentConfig) : rawConfig;
      if (!config.enabled) return;

      const nowDate = new Date();
      // Clave: Fecha (YYYY-MM-DD) + config_updated_at (simulado aquí con H y otros parámetros críticos)
      // Como no tenemos config.updated_at en el payload crudo, armamos un hash
      const cacheKey = `replenishment_stats_${nowDate.toLocaleDateString('es-AR')}_H${config.historyWeeks}`;
      
      let stats = [];
      let usingCache = false;

      // 1. Intentar obtener liveStock (si falla, usar catálogo local)
      let liveStock = [];
      try {
        liveStock = await productsService.getLiveStock();
      } catch (lsErr) {
        console.error('❌ Error fetching live stock, falling back to local catalog:', lsErr);
        const currentProducts = get().products;
        liveStock = currentProducts.map(p => ({ id: p.id, stock: p.stock ?? 0 }));
      }
      
      const liveStockMap = new Map(liveStock.map(ls => [ls.id, ls.stock]));
      
      // 2. Intentar obtener stats (si falla, buscar en localStorage crudo)
      try {
        stats = await productsService.getReplenishmentStats(config.historyWeeks);
        // Validar forma inmediatamente: si es formato viejo, lanza error para entrar en el fallback
        parseReplenishmentRpcResponse(stats);
        // Guardar stats crudos
        try {
          localStorage.setItem(cacheKey, JSON.stringify(stats));
        } catch(e) {}
      } catch (errStats) {
        console.error('❌ Error fetching replenishment stats, attempting to use cache:', errStats);
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            stats = JSON.parse(cached);
            usingCache = true;
            console.log('✅ Utilizando caché de estadísticas de ventas.');
          } else {
            throw new Error('No cache found');
          }
        } catch (cacheErr) {
          console.error('❌ No hay caché disponible. Haciendo fallback a lógica estática.');
          // Fallback final: usar static logic temporalmente.
          const { data, outOfStockTotal, lowStockTotal } = await productsService.getLowStockProductsPaginated({ page: 1, limit: 1000 });
          set({ 
            allReplenishmentAlerts: data as ProductWithReplenishment[],
            allReplenishmentNoHistory: [],
            outOfStockTotal,
            lowStockTotal
          });
          return;
        }
      }
      
      // Combinar stock fresco con catálogo local (solo activos)
      const currentProducts = get().products;
      const activeProducts = currentProducts.filter(p => !p.isPaused);
      const nowMs = Date.now();
      
      // Agrupamos stats mediante el parser compatible con JSONB y plano
      const groupedStats = parseReplenishmentRpcResponse(stats);

      const alerts: ProductWithReplenishment[] = [];
      const noHistory: ProductWithReplenishment[] = [];

      for (const p of activeProducts) {
        const prodStats = groupedStats.get(p.id) || { weeks: [], firstSale: null };
        const dense = buildDenseSalesHistory(p.createdAt || new Date().toISOString(), prodStats.firstSale, prodStats.weeks, config.historyWeeks, nowMs);
        
        const currentStock = liveStockMap.has(p.id) ? liveStockMap.get(p.id)! : (p.stock ?? 0);
        
        const res = calculateProductReplenishment({
          ventasPorSemana: dense.ventasPorSemana,
          semanasDisponibles: dense.semanasDisponibles,
          stockActual: currentStock,
          config
        });
        
        const itemWithRep = p as ProductWithReplenishment;
        itemWithRep.replenishmentResult = res;

        if (res.status === 'REPOSICION') {
          alerts.push({ ...itemWithRep, stock: currentStock });
        } else if (res.status === 'SIN_HISTORIAL' && currentStock <= 0) {
          noHistory.push({ ...itemWithRep, stock: currentStock });
        }
      }

      // Ordenar alertas con la función pura real del store (diasCobertura ASC, nombre)
      const sortedAlerts = sortReplenishmentAlerts(alerts);
      lastReplenishmentFetchTimestamp = Date.now();

      set({ allReplenishmentAlerts: sortedAlerts, allReplenishmentNoHistory: noHistory });
    } catch (err) {
      console.error('Error fetching all replenishment alerts:', err);
    }
  },

  getProductReplenishment: async (product: Product): Promise<ReplenishmentResult | null> => {
    try {
      // 1. Si ya está calculado en alguna lista de alertas
      const fromDashboard = (get().lowStockDashboardProducts as ProductWithReplenishment[]).find(p => p.id === product.id)?.replenishmentResult;
      if (fromDashboard) return fromDashboard;
      const fromAlerts = (get().allReplenishmentAlerts as ProductWithReplenishment[]).find(p => p.id === product.id)?.replenishmentResult;
      if (fromAlerts) return fromAlerts;

      // 2. Obtener config
      let config = get().replenishmentConfig;
      if (!config) {
        const rawConfig = await fetchSetting<ReplenishmentConfig>('inventory_replenishment_config', defaultReplenishmentConfig);
        const configError = validateReplenishmentConfig(rawConfig);
        config = configError ? defaultReplenishmentConfig : rawConfig;
        set({ replenishmentConfig: config, isReplenishmentEnabled: config.enabled });
      }
      if (!config.enabled) return null;

      // 3. Stats (catalogCache tiene TTL de 24h, muy rápido)
      let stats = [];
      const cacheKey = `replenishment_stats_${new Date().toLocaleDateString('es-AR')}_H${config.historyWeeks}`;
      try {
        stats = await productsService.getReplenishmentStats(config.historyWeeks);
      } catch (e) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) stats = JSON.parse(cached);
        } catch (_) {}
      }

      if (!stats || !Array.isArray(stats)) return null;

      const groupedStats = parseReplenishmentRpcResponse(stats);
      const prodStats = groupedStats.get(product.id) || { weeks: [], firstSale: null };
      const dense = buildDenseSalesHistory(
        product.createdAt || new Date().toISOString(),
        prodStats.firstSale,
        prodStats.weeks,
        config.historyWeeks,
        Date.now()
      );

      return calculateProductReplenishment({
        ventasPorSemana: dense.ventasPorSemana,
        semanasDisponibles: dense.semanasDisponibles,
        stockActual: product.stock ?? 0,
        config
      });
    } catch (err) {
      console.error('Error in getProductReplenishment on demand:', err);
      return null;
    }
  },

  addProduct: async (product) => {
    set({ loading: true, error: null });
    try {
      console.log('🔄 Creating new product...', product.name);
      const newProduct = await productsService.createProduct(product);
      set(state => ({
        products: [...state.products, newProduct],
        loading: false
      }));
      try {
        await productRepository.saveProducts([toLocalProductFromStoreProduct(newProduct)]);
      } catch (repoErr) {
        console.warn('Could not save new product to IndexedDB:', repoErr);
      }
      console.log('✅ Product created successfully', newProduct.id);
      return newProduct;
    } catch (err: any) {
      console.error('❌ Error creating product:', err);
      set({ error: getErrorMessage(err, 'Error al crear producto'), loading: false });
      return null;
    }
  },

  updateProduct: async (id, updates) => {
    // Optimistic update
    const previousProducts = get().products;
    const previousInventory = get().inventoryProducts;
    const previousLowStock = get().lowStockDashboardProducts;
    const previousLowStockTotal = get().lowStockDashboardTotal;

    set(state => {
      let newLowStock = state.lowStockDashboardProducts;
      let newLowStockTotal = state.lowStockDashboardTotal;

      if (updates.stock !== undefined) {
        const item = state.lowStockDashboardProducts.find(p => p.id === id);
        const minStock = updates.minStock ?? item?.minStock ?? 15;
        const isLow = updates.stock <= minStock;
        if (item) {
          if (!isLow) {
            newLowStock = state.lowStockDashboardProducts.filter(p => p.id !== id);
            newLowStockTotal = Math.max(0, state.lowStockDashboardTotal - 1);
          } else {
            newLowStock = state.lowStockDashboardProducts.map(p => p.id === id ? { ...p, ...updates } : p);
          }
        }
      } else {
        newLowStock = state.lowStockDashboardProducts.map(p => p.id === id ? { ...p, ...updates } : p);
      }

      if (updates.isPaused === true) {
        const wasInLowStock = state.lowStockDashboardProducts.some(p => p.id === id);
        if (wasInLowStock) {
          newLowStock = newLowStock.filter(p => p.id !== id);
          newLowStockTotal = Math.max(0, newLowStockTotal - 1);
        }
      }

      return {
        products: state.products.map(p => p.id === id ? { ...p, ...updates } : p),
        inventoryProducts: state.inventoryProducts.map(p => p.id === id ? { ...p, ...updates } : p),
        lowStockDashboardProducts: newLowStock,
        lowStockDashboardTotal: newLowStockTotal,
        error: null
      };
    });

    try {
      console.log(`🔄 Updating product ${id}...`);
      const updatedProduct = await productsService.updateProduct(id, updates);
      set(state => ({
        products: state.products.map(p => p.id === id ? updatedProduct : p),
        inventoryProducts: state.inventoryProducts.map(p => p.id === id ? updatedProduct : p),
        lowStockDashboardProducts: state.lowStockDashboardProducts.map(p => p.id === id ? updatedProduct : p)
      }));
      try {
        await productRepository.saveProducts([toLocalProductFromStoreProduct(updatedProduct)]);
      } catch (repoErr) {
        console.warn('Could not update product in IndexedDB:', repoErr);
      }
      console.log('✅ Product updated successfully');
      return true;
    } catch (err: any) {
      console.error(`❌ Error updating product ${id}:`, err);
      // Rollback
      set({ 
        products: previousProducts, 
        inventoryProducts: previousInventory,
        lowStockDashboardProducts: previousLowStock,
        lowStockDashboardTotal: previousLowStockTotal,
        error: getErrorMessage(err, 'Error al actualizar producto') 
      });
      return false;
    }
  },

  deleteProduct: async (id) => {
    const previousProducts = get().products;
    const previousInventory = get().inventoryProducts;
    const previousInventoryTotal = get().inventoryTotal;
    const previousLowStock = get().lowStockDashboardProducts;
    const previousLowStockTotal = get().lowStockDashboardTotal;

    const wasInLowStock = previousLowStock.some(p => p.id === id);

    set(state => ({
      products: state.products.filter(p => p.id !== id),
      inventoryProducts: state.inventoryProducts.filter(p => p.id !== id),
      inventoryTotal: Math.max(0, state.inventoryTotal - 1),
      lowStockDashboardProducts: state.lowStockDashboardProducts.filter(p => p.id !== id),
      lowStockDashboardTotal: wasInLowStock ? Math.max(0, state.lowStockDashboardTotal - 1) : state.lowStockDashboardTotal,
      error: null
    }));

    try {
      console.log(`🔄 Deleting product ${id}...`);
      await productsService.deleteProduct(id);
      console.log('✅ Product deleted successfully');
      return true;
    } catch (err: any) {
      console.error(`❌ Error deleting product ${id}:`, err);
      // Rollback
      set({ 
        products: previousProducts, 
        inventoryProducts: previousInventory,
        inventoryTotal: previousInventoryTotal,
        lowStockDashboardProducts: previousLowStock,
        lowStockDashboardTotal: previousLowStockTotal,
        error: getErrorMessage(err, 'Error al eliminar producto') 
      });
      return false;
    }
  },

  updateStock: async (id, stock) => {
    const previousProducts = get().products;
    const previousInventory = get().inventoryProducts;
    const previousLowStock = get().lowStockDashboardProducts;
    const previousLowStockTotal = get().lowStockDashboardTotal;

    // Find product to check previous stock
    const product = previousProducts.find(p => p.id === id) || previousInventory.find(p => p.id === id);
    const prevStock = product ? product.stock : null;
    const productName = product ? product.name : 'Producto Desconocido';
    const minStock = product?.minStock ?? 15;
    
    let crossedLowStock = false;
    let crossedOutOfStock = false;

    if (prevStock !== null) {
      if (prevStock > minStock && stock <= minStock && stock > 0) {
        crossedLowStock = true;
      }
      if (prevStock > 0 && stock === 0) {
        crossedOutOfStock = true;
      }
    }

    let nextLowStockTotal = get().lowStockTotal;
    let nextOutOfStockTotal = get().outOfStockTotal;

    // Optimistic update
    set(state => {
      const item = state.lowStockDashboardProducts.find(p => p.id === id);
      const isLow = stock <= minStock;

      let newLowStock = state.lowStockDashboardProducts;
      let newLowStockTotal = state.lowStockDashboardTotal;

      if (item) {
        if (!isLow) {
          // If stock is replenished above threshold, remove immediately from list
          newLowStock = state.lowStockDashboardProducts.filter(p => p.id !== id);
          newLowStockTotal = Math.max(0, state.lowStockDashboardTotal - 1);
          // If it was at 0, reduce outOfStock
          if (item.stock === 0 && stock > 0) nextOutOfStockTotal = Math.max(0, nextOutOfStockTotal - 1);
          if (item.stock > 0 && item.stock <= minStock && stock > minStock) nextLowStockTotal = Math.max(0, nextLowStockTotal - 1);
        } else {
          newLowStock = state.lowStockDashboardProducts.map(p => p.id === id ? { ...p, stock } : p);
          // Adjust detailed counts if going from low -> 0 or 0 -> low
          if (item.stock > 0 && stock === 0) {
            nextLowStockTotal = Math.max(0, nextLowStockTotal - 1);
            nextOutOfStockTotal++;
          } else if (item.stock === 0 && stock > 0) {
            nextOutOfStockTotal = Math.max(0, nextOutOfStockTotal - 1);
            nextLowStockTotal++;
          }
        }
      } else if (isLow) {
        // If it wasn't in the dashboard but now is low
        newLowStockTotal++;
        if (stock === 0) nextOutOfStockTotal++;
        else nextLowStockTotal++;
      }

      return {
        products: state.products.map(p => p.id === id ? { ...p, stock } : p),
        inventoryProducts: state.inventoryProducts.map(p => p.id === id ? { ...p, stock } : p),
        lowStockDashboardProducts: newLowStock,
        lowStockDashboardTotal: newLowStockTotal,
        lowStockTotal: nextLowStockTotal,
        outOfStockTotal: nextOutOfStockTotal,
        error: null
      };
    });

    if (crossedLowStock || crossedOutOfStock) {
      import('../services/whatsapp-message.service').then(({ whatsappMessageService }) => {
        whatsappMessageService.createLowStockAlertMessage(
          productName,
          stock,
          nextOutOfStockTotal,
          nextLowStockTotal
        ).catch(console.error);
      });
    }

    try {
      await productsService.updateStock(id, stock);
      return true;
    } catch (err: any) {
      console.error(`❌ Error updating stock for product ${id}:`, err);
      set({ 
        products: previousProducts,
        inventoryProducts: previousInventory,
        lowStockDashboardProducts: previousLowStock,
        lowStockDashboardTotal: previousLowStockTotal,
        error: getErrorMessage(err, 'Error al actualizar stock') 
      });
      return false;
    }
  },

  getProductByBarcode: (barcode) => {
    return get().products.find(p => p.barcode === barcode);
  },

  bulkAddProducts: async (products) => {
    set({ loading: true, error: null });
    try {
      console.log(`🔄 Bulk adding ${products.length} products...`);
      const newProducts = await productsService.bulkCreateProducts(products);
      
      // Guardar inmediatamente en IndexedDB local
      if (newProducts.length > 0) {
        const localBatch: LocalProduct[] = newProducts.map(toLocalProductFromStoreProduct);
        await productRepository.saveProducts(localBatch);
      }

      set(state => ({
        products: [...state.products, ...newProducts],
        loading: false
      }));
      console.log('✅ Bulk add successful');
      return true;
    } catch (err: any) {
      console.error('❌ Error in bulk adding products:', err);
      set({ error: getErrorMessage(err, 'Error en importación masiva'), loading: false });
      return false;
    }
  },

  bulkUpdateProducts: async (items, onProgress) => {
    set({ loading: true, error: null });
    try {
      console.log(`🔄 Bulk updating ${items.length} products...`);
      const updatedProducts: Product[] = [];
      const batchSize = 15;
      let processed = 0;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async item => {
            try {
              return await productsService.updateProduct(item.id, item.updates);
            } catch (e) {
              console.error(`Error updating product ${item.id} in bulk:`, e);
              return null;
            }
          })
        );
        const validResults = batchResults.filter((p): p is Product => p !== null);
        updatedProducts.push(...validResults);

        // Guardar de inmediato este lote en IndexedDB local
        if (validResults.length > 0) {
          const localBatch: LocalProduct[] = validResults.map(toLocalProductFromStoreProduct);
          await productRepository.saveProducts(localBatch);
        }

        processed += batch.length;
        if (onProgress) {
          onProgress(processed);
        }
      }

      // Single atomic store update!
      const updatedMap = new Map(updatedProducts.map(p => [p.id, p]));
      set(state => ({
        products: state.products.map(p => updatedMap.get(p.id) || p),
        inventoryProducts: state.inventoryProducts.map(p => updatedMap.get(p.id) || p),
        lowStockDashboardProducts: state.lowStockDashboardProducts.map(p => updatedMap.get(p.id) || p),
        loading: false
      }));

      console.log(`✅ Bulk update successful: ${updatedProducts.length} products updated and persisted in local DB`);
      return true;
    } catch (err: any) {
      console.error('❌ Error in bulk updating products:', err);
      set({ error: getErrorMessage(err, 'Error al actualizar productos masivamente'), loading: false });
      return false;
    }
  },

  bulkUpdatePrice: async (ids, percentage) => {
    const multiplier = 1 + (percentage / 100);
    const previousProducts = get().products;
    const previousInventory = get().inventoryProducts;
    
    // Optimistic UI
    const updateProductPrice = (p: Product) => {
      if (ids.includes(p.id)) {
        return {
          ...p,
          price: Math.round(p.price * multiplier),
          originalPrice: p.originalPrice ? Math.round(p.originalPrice * multiplier) : p.originalPrice
        };
      }
      return p;
    };

    set(state => ({
      products: state.products.map(updateProductPrice),
      inventoryProducts: state.inventoryProducts.map(updateProductPrice),
      error: null
    }));

    try {
      console.log(`🔄 Bulk updating prices for ${ids.length} products...`);
      const toUpdate = get().products.filter(p => ids.includes(p.id));
      await Promise.all(
        toUpdate.map(p => productsService.updateProduct(p.id, { 
          price: p.price, 
          originalPrice: p.originalPrice 
        }))
      );
      console.log('✅ Bulk price update successful');
      return true;
    } catch (err: any) {
      console.error('❌ Error in bulk updating prices:', err);
      set({ 
        products: previousProducts, 
        inventoryProducts: previousInventory,
        error: getErrorMessage(err, 'Error actualizando precios masivamente') 
      });
      return false;
    }
  },

  bulkTogglePause: async (ids, forceState) => {
    if (ids.length === 0) return true;
    const currentInventory = get().inventoryProducts;
    const currentProducts = get().products;
    
    // Si no se especifica forceState:
    // Si al menos uno no está pausado -> pausar todos.
    // Si todos ya están pausados -> reanudar todos.
    const selectedItems = currentInventory.length > 0
      ? currentInventory.filter(p => ids.includes(p.id))
      : currentProducts.filter(p => ids.includes(p.id));

    const targetPaused = forceState !== undefined 
      ? forceState 
      : (selectedItems.length > 0 ? selectedItems.some(p => !p.isPaused) : true);

    const previousProducts = currentProducts;
    const previousInventory = currentInventory;
    const previousLowStock = get().lowStockDashboardProducts;
    const previousLowStockTotal = get().lowStockDashboardTotal;

    // Optimistic UI
    set(state => ({
      products: state.products.map(p => ids.includes(p.id) ? { ...p, isPaused: targetPaused } : p),
      inventoryProducts: state.inventoryProducts.map(p => ids.includes(p.id) ? { ...p, isPaused: targetPaused } : p),
      lowStockDashboardProducts: targetPaused
        ? state.lowStockDashboardProducts.filter(p => !ids.includes(p.id))
        : state.lowStockDashboardProducts,
      lowStockDashboardTotal: targetPaused
        ? Math.max(0, state.lowStockDashboardTotal - state.lowStockDashboardProducts.filter(p => ids.includes(p.id)).length)
        : state.lowStockDashboardTotal,
      error: null
    }));

    try {
      console.log(`🔄 Bulk toggling pause (${targetPaused ? 'PAUSAR' : 'REANUDAR'}) for ${ids.length} products...`);
      await productsService.bulkUpdatePause(ids, targetPaused);
      console.log('✅ Bulk pause update successful');
      return true;
    } catch (err: any) {
      console.error('❌ Error in bulk pause toggle:', err);
      set({ 
        products: previousProducts, 
        inventoryProducts: previousInventory,
        lowStockDashboardProducts: previousLowStock,
        lowStockDashboardTotal: previousLowStockTotal,
        error: getErrorMessage(err, 'Error al cambiar estado de pausa de los productos') 
      });
      return false;
    }
  },

  clearError: () => set({ error: null })
}));
