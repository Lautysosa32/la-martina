import api from '../lib/axios';
import { Product, CreateProductInput, UpdateProductInput, SupabaseProduct } from '../types/product.types';

// Convert from frontend camelCase to Supabase snake_case
const toSupabaseProduct = (input: Partial<CreateProductInput>): Partial<SupabaseProduct> => {
  return {
    ...(input.branchId !== undefined && { branch_id: input.branchId }),
    ...(input.name !== undefined && { name: input.name }),
    ...(input.brand !== undefined && { brand: input.brand }),
    ...(input.categoryId !== undefined && { category_id: input.categoryId }),
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
  };
};

// Convert from Supabase snake_case to frontend camelCase
const toFrontendProduct = (product: SupabaseProduct): Product => {
  return {
    id: product.id,
    branchId: product.branch_id,
    name: product.name,
    brand: product.brand,
    categoryId: product.category_id,
    price: product.price,
    originalPrice: product.original_price,
    image: product.image,
    format: product.format,
    isNew: product.is_new,
    discount: product.discount,
    badge: product.badge,
    minStock: product.min_stock,
    barcode: product.barcode,
    stock: product.stock,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
};

export const productsService = {
  async getProducts(): Promise<Product[]> {
    const response = await api.get<SupabaseProduct[]>('/products?select=*');
    return response.data.map(toFrontendProduct);
  },

  async createProduct(product: CreateProductInput): Promise<Product> {
    const data = toSupabaseProduct(product);
    const response = await api.post<SupabaseProduct[]>('/products', data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendProduct(response.data[0]);
  },

  async updateProduct(id: string, updates: UpdateProductInput): Promise<Product> {
    const data = toSupabaseProduct(updates);
    const response = await api.patch<SupabaseProduct[]>(`/products?id=eq.${id}`, data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendProduct(response.data[0]);
  },

  async deleteProduct(id: string): Promise<void> {
    await api.delete(`/products?id=eq.${id}`);
  },

  async updateStock(id: string, stock: number): Promise<void> {
    await api.patch(`/products?id=eq.${id}`, { stock });
  },

  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const response = await api.get<SupabaseProduct[]>(`/products?barcode=eq.${barcode}&select=*`);
    if (response.data.length === 0) return null;
    return toFrontendProduct(response.data[0]);
  },

  async bulkCreateProducts(products: CreateProductInput[]): Promise<Product[]> {
    const data = products.map(toSupabaseProduct);
    const response = await api.post<SupabaseProduct[]>('/products', data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data.map(toFrontendProduct);
  }
};
