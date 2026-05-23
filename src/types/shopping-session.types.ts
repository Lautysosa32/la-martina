export type ShoppingSessionStatus = 'draft' | 'pending' | 'confirmed' | 'cancelled' | 'expired';

export interface ShoppingSession {
  id: string;
  code: string;
  branchId: string;
  status: ShoppingSessionStatus;
  customerName: string;
  customerPhone: string;
  subtotal: number;
  totalItems: number;
  expiresAt: string;
  createdAt: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
}

export interface ShoppingSessionItem {
  id: number;
  sessionId: string;
  productId: string | null;
  barcode: string | null;
  name: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface ShoppingCalculatorItem {
  id: string; // product id or 'manual-' + timestamp
  productId?: string | null;
  barcode?: string | null;
  name: string;
  image: string;
  price: number;
  quantity: number;
  isManual?: boolean;
}

export interface CreateShoppingSessionInput {
  branchId?: string;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  totalItems: number;
  items: {
    productId: string | null;
    barcode: string | null;
    name: string;
    image: string;
    price: number;
    quantity: number;
  }[];
}

export interface SupabaseShoppingSession {
  id: string;
  code: string;
  branch_id: string;
  status: ShoppingSessionStatus;
  customer_name: string;
  customer_phone: string;
  subtotal: number;
  total_items: number;
  expires_at: string;
  created_at: string;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
}

export interface SupabaseShoppingSessionItem {
  id: number;
  session_id: string;
  product_id: string | null;
  barcode: string | null;
  name: string;
  image: string;
  price: number;
  quantity: number;
  subtotal: number;
}
