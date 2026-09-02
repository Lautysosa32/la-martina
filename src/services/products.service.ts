import api from '../lib/axios';
import { Product, CreateProductInput, UpdateProductInput, SupabaseProduct } from '../types/product.types';

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
    subcategoryId: product.subcategory_id || null,
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
    saleType: product.sale_type || 'unit',
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
};

export const productsService = {
  async getProductsPaginated(params: { page: number; limit: number; search?: string; categoryId?: string; subcategoryId?: string; sortBy?: string; sortDesc?: boolean }): Promise<{ data: Product[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    let url = `/products?select=*&limit=${params.limit}&offset=${offset}`;

    if (params.categoryId && params.categoryId !== 'all') {
      url += `&category_id=eq.${params.categoryId}`;
    }

    if (params.subcategoryId && params.subcategoryId !== 'all') {
      url += `&subcategory_id=eq.${params.subcategoryId}`;
    }

    if (params.search) {
      url += `&or=(name.ilike.*${params.search}*,brand.ilike.*${params.search}*,barcode.ilike.*${params.search}*)`;
    }

    if (params.sortBy) {
      // Map frontend keys to database columns
      let column = params.sortBy;
      if (column === 'categoryId') column = 'category_id';
      if (column === 'subcategoryId') column = 'subcategory_id';
      
      // Stock sorting shouldn't fail if null, PostgREST handles nulls, but we can specify nulls first/last if needed.
      url += `&order=${column}.${params.sortDesc ? 'desc' : 'asc'}.nullslast`;
    } else {
      url += `&order=created_at.desc`;
    }

    const response = await api.get<SupabaseProduct[]>(url, {
      headers: { 'Prefer': 'count=exact' }
    });

    const countStr = response.headers['content-range'] || response.headers['Content-Range'];
    let total = 0;
    if (countStr) {
      const match = countStr.match(/\/\s*(\d+)/);
      if (match) total = parseInt(match[1]);
    }

    return {
      data: response.data.map(toFrontendProduct),
      total
    };
  },

  async getLowStockProductsPaginated(params: { page: number; limit: number }): Promise<{ data: Product[]; total: number; outOfStockTotal: number; lowStockTotal: number }> {
    const offset = (params.page - 1) * params.limit;
    const url = `/products?select=*&stock=lte.15&order=stock.asc,updated_at.desc&limit=${params.limit}&offset=${offset}`;

    const [response, outOfStockRes, lowStockRes] = await Promise.all([
      api.get<SupabaseProduct[]>(url, { headers: { 'Prefer': 'count=exact' } }),
      api.get(`/products?stock=eq.0&limit=1`, { headers: { 'Prefer': 'count=exact' } }),
      api.get(`/products?stock=gt.0&stock=lte.15&limit=1`, { headers: { 'Prefer': 'count=exact' } })
    ]);

    const getCount = (res: any) => {
      const countStr = res.headers['content-range'] || res.headers['Content-Range'];
      if (countStr) {
        const match = countStr.match(/\/\s*(\d+)/);
        if (match) return parseInt(match[1]);
      }
      return 0;
    };

    const total = getCount(response);
    const outOfStockTotal = getCount(outOfStockRes);
    const lowStockTotal = getCount(lowStockRes);

    return {
      data: response.data.map(toFrontendProduct),
      total,
      outOfStockTotal,
      lowStockTotal
    };
  },

  async getAllLowStockProducts(): Promise<{ id: string; name: string; categoryId: string; stock: number }[]> {
    const PAGE_SIZE = 1000;
    let all: { id: string; name: string; categoryId: string; stock: number }[] = [];
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const response = await api.get<any[]>(
        `/products?select=id,name,category_id,stock&stock=lte.15&order=name.asc&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const batch = response.data.map(p => ({
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

  async getProducts(): Promise<Product[]> {
    // Keep this for POS or global usage if absolutely needed, though we will try to avoid calling it on mount.
    const PAGE_SIZE = 1000;
    let allProducts: SupabaseProduct[] = [];
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const response = await api.get<SupabaseProduct[]>(
        `/products?select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const batch = response.data;
      allProducts = [...allProducts, ...batch];
      
      if (batch.length < PAGE_SIZE) {
        keepFetching = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    console.log(`📦 Total productos cargados desde Supabase: ${allProducts.length}`);
    return allProducts.map(toFrontendProduct);
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
