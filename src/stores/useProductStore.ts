import { create } from 'zustand';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product.types';
import { productsService } from '../services/products.service';

interface ProductState {
  products: Product[];
  loading: boolean;
  error: string | null;
  
  fetchProducts: () => Promise<void>;
  
  // Paginated states
  inventoryProducts: Product[];
  inventoryTotal: number;
  inventoryLoading: boolean;
  fetchInventoryProducts: (params: { page: number; limit: number; search?: string; categoryId?: string; subcategoryId?: string; sortBy?: string; sortDesc?: boolean }) => Promise<void>;

  lowStockDashboardProducts: Product[];
  lowStockDashboardTotal: number;
  lowStockDashboardLoading: boolean;
  outOfStockTotal: number;
  lowStockTotal: number;
  fetchLowStockDashboardProducts: (params: { page: number; limit: number }) => Promise<void>;

  addProduct: (product: CreateProductInput) => Promise<Product | null>;
  updateProduct: (id: string, updates: UpdateProductInput) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  updateStock: (id: string, stock: number) => Promise<boolean>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  bulkAddProducts: (products: CreateProductInput[]) => Promise<boolean>;
  bulkUpdatePrice: (ids: string[], percentage: number) => Promise<boolean>;
  clearError: () => void;
}

const getErrorMessage = (err: any, defaultMessage: string): string => {
  if (err.response?.data?.message) {
    return `${defaultMessage}: ${err.response.data.message}`;
  }
  return err.message ? `${defaultMessage}: ${err.message}` : defaultMessage;
};

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

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      console.log('🔄 Fetching products from Supabase...');
      const products = await productsService.getProducts();
      set({ products, loading: false });
      console.log('✅ Products fetched successfully:', products.length);
    } catch (err: any) {
      console.error('❌ Error fetching products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener productos'), loading: false });
    }
  },

  fetchInventoryProducts: async (params) => {
    set({ inventoryLoading: true, error: null });
    try {
      const { data, total } = await productsService.getProductsPaginated(params);
      set({ inventoryProducts: data, inventoryTotal: total, inventoryLoading: false });
    } catch (err: any) {
      console.error('❌ Error fetching inventory products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener productos del inventario'), inventoryLoading: false });
    }
  },

  fetchLowStockDashboardProducts: async (params) => {
    set({ lowStockDashboardLoading: true, error: null });
    try {
      const { data, total, outOfStockTotal, lowStockTotal } = await productsService.getLowStockProductsPaginated(params);
      set({ 
        lowStockDashboardProducts: data, 
        lowStockDashboardTotal: total, 
        outOfStockTotal,
        lowStockTotal,
        lowStockDashboardLoading: false 
      });
    } catch (err: any) {
      console.error('❌ Error fetching low stock products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener alertas de stock'), lowStockDashboardLoading: false });
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

  bulkUpdatePrice: async (ids, percentage) => {
    const multiplier = 1 + (percentage / 100);
    const previousProducts = get().products;
    
    // Optimistic UI
    set(state => ({
      products: state.products.map(p => {
        if (ids.includes(p.id)) {
          return {
            ...p,
            price: Math.round(p.price * multiplier),
            originalPrice: p.originalPrice ? Math.round(p.originalPrice * multiplier) : p.originalPrice
          };
        }
        return p;
      }),
      error: null
    }));

    try {
      console.log(`🔄 Bulk updating prices for ${ids.length} products...`);
      // Since Supabase REST doesn't easily support a single bulk PATCH with different values without an RPC, 
      // we'll loop sequentially or in parallel batches. For small numbers, Promise.all is fine.
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
      set({ products: previousProducts, error: getErrorMessage(err, 'Error actualizando precios masivamente') });
      return false;
    }
  },

  clearError: () => set({ error: null })
}));
