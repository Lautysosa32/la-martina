import { create } from 'zustand';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product.types';
import { productsService } from '../services/products.service';

interface ProductState {
  products: Product[];
  loading: boolean;
  error: string | null;
  
  fetchProducts: () => Promise<void>;
  addProduct: (product: CreateProductInput) => Promise<Product | null>;
  updateProduct: (id: string, updates: UpdateProductInput) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  updateStock: (id: string, stock: number) => Promise<boolean>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  bulkAddProducts: (products: CreateProductInput[]) => Promise<boolean>;
  bulkUpdatePrice: (ids: string[], percentage: number) => Promise<boolean>;
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

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      console.log('🔄 Fetching products from Supabase...');
      const products = await productsService.getProducts();
      set({ products, loading: false });
      console.log('✅ Products fetched successfully');
    } catch (err: any) {
      console.error('❌ Error fetching products:', err);
      set({ error: getErrorMessage(err, 'Error al obtener productos'), loading: false });
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
    set(state => ({
      products: state.products.map(p => p.id === id ? { ...p, ...updates } : p),
      error: null
    }));

    try {
      console.log(`🔄 Updating product ${id}...`);
      const updatedProduct = await productsService.updateProduct(id, updates);
      // Actualizamos con el dato real de la DB para asegurarnos de que la fecha de updatedAt u otros triggers se sincronicen
      set(state => ({
        products: state.products.map(p => p.id === id ? updatedProduct : p)
      }));
      console.log('✅ Product updated successfully');
      return true;
    } catch (err: any) {
      console.error(`❌ Error updating product ${id}:`, err);
      // Rollback
      set({ products: previousProducts, error: getErrorMessage(err, 'Error al actualizar producto') });
      return false;
    }
  },

  deleteProduct: async (id) => {
    const previousProducts = get().products;
    set(state => ({
      products: state.products.filter(p => p.id !== id),
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
      set({ products: previousProducts, error: getErrorMessage(err, 'Error al eliminar producto') });
      return false;
    }
  },

  updateStock: async (id, stock) => {
    const previousProducts = get().products;
    set(state => ({
      products: state.products.map(p => p.id === id ? { ...p, stock } : p),
      error: null
    }));

    try {
      await productsService.updateStock(id, stock);
      return true;
    } catch (err: any) {
      console.error(`❌ Error updating stock for product ${id}:`, err);
      set({ products: previousProducts, error: getErrorMessage(err, 'Error al actualizar stock') });
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
  }
}));
