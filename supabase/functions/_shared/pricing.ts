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
  const prod = products.find(p => p.id === item.productId || (p.barcode && item.productCode && p.barcode === item.productCode));
  const rawCatId = item.categoryId || prod?.categoryId || prod?.category_id || '';
  const itemCategoryId = rawCatId.toString().trim();
  const rawSubcatId = item.subcategoryId || prod?.subcategoryId || prod?.subcategory_id || '';
  const itemSubcategoryId = rawSubcatId.toString().trim();
  const itemBadge = ((item.badge !== undefined && item.badge !== null) ? item.badge : prod?.badge) || '';

  const applicable = offers.filter(o => {
    if (!o.active) return false;
    const startStr = (o.startDate || '').split('T')[0];
    const endStr = (o.endDate || '').split('T')[0];
    if (startStr && startStr > todayStr) return false;
    if (endStr && endStr < todayStr) return false;

    // Restricción por nivel de cliente (si aplica a todos, requiredTier es 'all', '' o undefined)
    if (o.requiredTier && o.requiredTier !== 'all' && !options?.forDisplay) {
      if (!customer) return false;
      if (!isTierMatch(customer.tier, o.requiredTier)) return false;
    }

    if (o.scope === 'product') {
      const pIds = o.targetIds && Array.isArray(o.targetIds) && o.targetIds.length > 0
        ? o.targetIds
        : (o.targetId && o.targetId.includes(','))
          ? o.targetId.split(',').map(s => s.trim())
          : [o.targetId || o.productId || ''].filter(Boolean);

      const targetList = pIds.map(id => id.toLowerCase().trim());
      const curId = (item.productId || '').toLowerCase().trim();
      const curCode = (item.productCode || '').toLowerCase().trim();
      const prodBarcode = (prod?.barcode || '').toLowerCase().trim();

      return targetList.includes(curId) ||
        (curCode !== '' && targetList.includes(curCode)) ||
        (prodBarcode !== '' && targetList.includes(prodBarcode));
    }

    if (o.scope === 'category') {
      if (!itemCategoryId) return false;
      const targetCat = (o.targetId || '').trim();
      if (!targetCat) return false;
      const catList = targetCat.includes(',')
        ? targetCat.split(',').map(s => s.trim().toLowerCase())
        : [targetCat.toLowerCase()];
      return catList.includes(itemCategoryId.toLowerCase());
    }

    if (o.scope === 'subcategory') {
      if (!itemSubcategoryId) return false;
      const targetSub = (o.subcategoryId || o.targetId || '').trim();
      if (!targetSub) return false;
      const subList = targetSub.includes(',')
        ? targetSub.split(',').map(s => s.trim().toLowerCase())
        : [targetSub.toLowerCase()];
      return subList.includes(itemSubcategoryId.toLowerCase());
    }

    if (o.scope === 'tag') {
      const targetTag = (o.tagFilter || o.targetId || '').toLowerCase().trim();
      return Boolean(itemBadge && itemBadge.toLowerCase().trim() === targetTag);
    }

    return false;
  });

  const rawOriginalPrice = item.originalPrice ?? prod?.originalPrice ?? (prod as any)?.original_price ?? null;
  const regularBasePrice = (rawOriginalPrice && rawOriginalPrice > item.price)
    ? rawOriginalPrice
    : item.price;

  if (applicable.length === 0) return { finalPrice: item.price, discountAmount: 0, offerLabel: null, offerId: null, discountedQuantity: 0, originalPrice: regularBasePrice };

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
      const unitDiscount = regularBasePrice * (o.discountValue / 100);
      discVal = unitDiscount * allowedQuantity;
      if (o.maxDiscountAmount && discVal > o.maxDiscountAmount) {
        discVal = o.maxDiscountAmount;
      }
    } else {
      discVal = Math.min(o.discountValue * allowedQuantity, regularBasePrice * allowedQuantity);
    }

    if (discVal > bestDiscount) {
      bestDiscount = discVal;
      bestLabel = o.label || o.name || 'Oferta';
      bestOfferId = o.id;
      finalDiscountedQuantity = allowedQuantity;
    }
  });

  const calculatedFinalPrice = bestDiscount > 0 && finalDiscountedQuantity > 0
    ? Math.max(0, regularBasePrice - (bestDiscount / finalDiscountedQuantity))
    : item.price;

  return {
    finalPrice: calculatedFinalPrice,
    discountAmount: bestDiscount,
    offerLabel: bestLabel,
    offerId: bestOfferId,
    discountedQuantity: finalDiscountedQuantity,
    originalPrice: regularBasePrice
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
