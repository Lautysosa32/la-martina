export interface PricingCustomer {
  dni?: string;
  phone?: string;
  tier?: 'Gold' | 'Silver' | 'Bronze' | 'Regular' | string;
  birthday?: string; // YYYY-MM-DD
}

export interface PricingOffer {
  id: string;
  name?: string;
  scope: 'product' | 'category' | 'subcategory' | 'tag' | 'all' | 'customer' | 'birthday' | 'tier';
  targetId?: string;
  targetIds?: string[];
  productId?: string;
  subcategoryId?: string;
  tagFilter?: string;
  requiredTier?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscountAmount?: number;
  startDate?: string;
  endDate?: string;
  active: boolean;
  label?: string;
  daily_quantity_limit?: number | null;
  per_customer_daily_limit?: number | null;
  total_quantity_limit?: number | null;
  limit_strategy?: 'discount_only' | 'block_sale' | 'hide_offer';
}

export interface PricingOfferRedemption {
  id?: string;
  offer_id: string;
  customer_phone?: string;
  quantity: number;
  redemption_date: string;
}

export interface PricingProduct {
  id: string;
  categoryId?: string;
  subcategoryId?: string;
  subcategory_id?: string;
  badge?: string;
}

export interface PricingItemInput {
  productId: string;
  categoryId?: string;
  price: number;
  quantity: number;
}
