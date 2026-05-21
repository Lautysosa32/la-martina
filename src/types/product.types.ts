export interface Product {
  id: string;
  branchId: string | null;
  name: string;
  brand: string;
  categoryId: string;
  price: number;
  originalPrice: number | null;
  image: string;
  format: string | null;
  isNew: boolean;
  discount: number | null;
  badge: string | null;
  minStock: number;
  barcode: string | null;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateProductInput = Partial<CreateProductInput>;

export interface SupabaseProduct {
  id: string;
  branch_id: string | null;
  name: string;
  brand: string;
  category_id: string;
  price: number;
  original_price: number | null;
  image: string;
  format: string | null;
  is_new: boolean;
  discount: number | null;
  badge: string | null;
  min_stock: number;
  barcode: string | null;
  stock: number;
  created_at: string;
  updated_at: string;
}
