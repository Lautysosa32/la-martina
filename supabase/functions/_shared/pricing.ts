import type { PricingCustomer, PricingOffer, PricingOfferRedemption, PricingProduct, PricingItemInput } from './pricing.types.ts';

// Helper to match customer tiers flexibly (Gold/Oro, Silver/Plata, Bronze/Bronce, Regular)
export const isTierMatch = (customerTier?: string, requiredTier?: string) => {
  if (!requiredTier || requiredTier === 'all' || requiredTier === '') return true;
  if (!customerTier) return false;
  const c = customerTier.toLowerCase().trim();
  const r = requiredTier.toLowerCase().trim();
  if (c === r) return true;
  if ((r === 'oro' && c === 'gold') || (r === 'gold' && c === 'oro')) return true;
  if ((r === 'plata' && c === 'silver') || (r === 'silver' && c === 'plata')) return true;
  if ((r === 'bronce' && c === 'bronze') || (r === 'bronze' && c === 'bronce')) return true;
  return false;
};

// Pure logic for applying offers to a single item
export const applyOffersToCartItem = (
  item: PricingItemInput,
  products: PricingProduct[],
  offers: PricingOffer[],
  offerRedemptions: PricingOfferRedemption[],
  todayStr: string,
  customer?: PricingCustomer | null,
  options?: { forDisplay?: boolean }
) => {
  const prod = products.find(p => p.id === item.productId);
  const itemCategoryId = item.categoryId || prod?.categoryId;
  const itemSubcategoryId = prod?.subcategoryId || prod?.subcategory_id;
  const itemBadge = prod?.badge;

  const applicable = offers.filter(o => {
    if (!o.active) return false;
    const startStr = (o.startDate || '').split('T')[0];
    const endStr = (o.endDate || '').split('T')[0];
    if (startStr && startStr > todayStr) return false;
    if (endStr && endStr < todayStr) return false;

    if (o.requiredTier && o.requiredTier !== 'all' && !options?.forDisplay) {
      if (!customer) return false;
      if (!isTierMatch(customer.tier, o.requiredTier)) return false;
    }

    if (o.scope === 'product') {
      if (o.targetIds && Array.isArray(o.targetIds) && o.targetIds.length > 0) {
        return o.targetIds.includes(item.productId);
      }
      if (o.targetId && o.targetId.includes(',')) {
        return o.targetId.split(',').map(s => s.trim()).includes(item.productId);
      }
      return o.targetId === item.productId || o.productId === item.productId;
    }

    if (o.scope === 'category') {
      return Boolean(itemCategoryId && itemCategoryId === o.targetId);
    }

    if (o.scope === 'subcategory') {
      const targetSub = o.subcategoryId || o.targetId;
      return Boolean(itemSubcategoryId && itemSubcategoryId === targetSub);
    }

    if (o.scope === 'tag') {
      const targetTag = (o.tagFilter || o.targetId || '').toLowerCase().trim();
      return Boolean(itemBadge && itemBadge.toLowerCase().trim() === targetTag);
    }

    return false;
  });

  if (applicable.length === 0) return { finalPrice: item.price, discountAmount: 0, offerLabel: null, offerId: null, discountedQuantity: 0, originalPrice: item.price };

  let bestDiscount = 0;
  let bestLabel: string | null = null;
  let bestOfferId: string | null = null;
  let finalDiscountedQuantity = 0;

  applicable.forEach(o => {
    let allowedQuantity = item.quantity;
    if (o.daily_quantity_limit || o.per_customer_daily_limit || o.total_quantity_limit) {
      const todayRedemptions = offerRedemptions.filter(r => r.offer_id === o.id && r.redemption_date === todayStr);
      const usedTodayTotal = todayRedemptions.reduce((s, r) => s + r.quantity, 0);
      const usedTodayCustomer = customer ? todayRedemptions.filter(r => {
        const clean1 = (r.customer_phone || '').replace(/\D/g, '');
        const clean2 = (customer.phone || '').replace(/\D/g, '');
        return clean1 === clean2 && clean1 !== '';
      }).reduce((s, r) => s + r.quantity, 0) : 0;

      let remainingGlobal = o.daily_quantity_limit ? Math.max(0, o.daily_quantity_limit - usedTodayTotal) : Infinity;
      let remainingTotal = o.total_quantity_limit ? Math.max(0, o.total_quantity_limit - offerRedemptions.filter(r => r.offer_id === o.id).reduce((s, r) => s + r.quantity, 0)) : Infinity;
      let remainingCustomer = o.per_customer_daily_limit ? Math.max(0, o.per_customer_daily_limit - usedTodayCustomer) : Infinity;

      const strictLimit = Math.min(remainingGlobal, remainingTotal, remainingCustomer);
      allowedQuantity = Math.min(item.quantity, strictLimit);
    }

    if (allowedQuantity <= 0) return;

    let discVal = 0;
    if (o.discountType === 'percent') {
      const unitDiscount = item.price * (o.discountValue / 100);
      discVal = unitDiscount * allowedQuantity;
      if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
        discVal = o.maxDiscountAmount;
      }
    } else {
      discVal = Math.min(o.discountValue * allowedQuantity, item.price * allowedQuantity);
    }

    if (discVal > bestDiscount) {
      bestDiscount = discVal;
      bestLabel = o.label || o.name || 'Oferta';
      bestOfferId = o.id;
      finalDiscountedQuantity = allowedQuantity;
    }
  });

  return {
    finalPrice: bestDiscount > 0 && finalDiscountedQuantity > 0 ? Math.max(0, item.price - (bestDiscount / finalDiscountedQuantity)) : item.price,
    discountAmount: bestDiscount,
    offerLabel: bestLabel,
    offerId: bestOfferId,
    discountedQuantity: finalDiscountedQuantity
  };
};

// Pure logic for applying order-level offers
export const applyOrderOffers = (
  subtotalAfterItemDiscounts: number,
  offers: PricingOffer[],
  offerRedemptions: PricingOfferRedemption[],
  todayStr: string,
  todayMonth: number,
  todayDay: number,
  customer?: PricingCustomer | null
) => {
  const applicable = offers.filter(o => {
    if (!o.active) return false;
    const startStr = (o.startDate || '').split('T')[0];
    const endStr = (o.endDate || '').split('T')[0];
    if (startStr && startStr > todayStr) return false;
    if (endStr && endStr < todayStr) return false;

    if (o.requiredTier && o.requiredTier !== 'all') {
      if (!customer) return false;
      if (!isTierMatch(customer.tier, o.requiredTier)) return false;
    }

    if (o.scope === 'all') return true;
    if (o.scope === 'tier') {
      if (!customer) return false;
      return isTierMatch(customer.tier, o.targetId);
    }
    if (o.scope === 'customer') {
      if (!customer) return false;
      if (customer.dni === o.targetId) return true;
      const clean = (p: string) => {
        let c = (p || '').replace(/\D/g, '');
        if (c.startsWith('549')) c = c.substring(3);
        else if (c.startsWith('54')) c = c.substring(2);
        if (c.startsWith('0')) c = c.substring(1);
        return c;
      };
      return clean(customer.phone || '') === clean(o.targetId || '');
    }
    if (o.scope === 'birthday') {
      if (!customer?.birthday) return false;
      const parts = customer.birthday.split('-');
      let bMonth: number, bDay: number;
      if (parts.length === 3) {
        bMonth = parseInt(parts[1]);
        bDay = parseInt(parts[2]);
      } else if (parts.length === 2) {
        bDay = parseInt(parts[0]);
        bMonth = parseInt(parts[1]);
      } else {
        return false;
      }
      return (todayMonth === bMonth && todayDay === bDay);
    }
    return false;
  });

  if (applicable.length === 0) return { discountAmount: 0, offerLabel: null, offerId: null };

  let bestDiscount = 0;
  let bestLabel: string | null = null;
  let bestId: string | null = null;

  applicable.forEach(o => {
    let isValid = true;
    if (o.daily_quantity_limit || o.per_customer_daily_limit || o.total_quantity_limit) {
      const todayRedemptions = offerRedemptions.filter(r => r.offer_id === o.id && r.redemption_date === todayStr);
      const usedTodayTotal = todayRedemptions.length;
      const usedTodayCustomer = customer ? todayRedemptions.filter(r => {
        const clean1 = (r.customer_phone || '').replace(/\D/g, '');
        const clean2 = (customer.phone || '').replace(/\D/g, '');
        return clean1 === clean2 && clean1 !== '';
      }).length : 0;

      if (o.daily_quantity_limit && usedTodayTotal >= o.daily_quantity_limit) isValid = false;
      if (o.per_customer_daily_limit && usedTodayCustomer >= o.per_customer_daily_limit) isValid = false;
      const totalRedemptions = offerRedemptions.filter(r => r.offer_id === o.id).length;
      if (o.total_quantity_limit && totalRedemptions >= o.total_quantity_limit) isValid = false;
    }
    if (!isValid) return;

    let discVal = 0;
    if (o.discountType === 'percent') {
      discVal = subtotalAfterItemDiscounts * (o.discountValue / 100);
      if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
        discVal = o.maxDiscountAmount;
      }
    } else {
      discVal = o.discountValue;
    }

    if (discVal > bestDiscount) {
      bestDiscount = discVal;
      bestLabel = o.label || o.name || 'Oferta';
      bestId = o.id;
    }
  });

  return {
    discountAmount: Math.min(bestDiscount, subtotalAfterItemDiscounts),
    offerLabel: bestLabel,
    offerId: bestId
  };
};
