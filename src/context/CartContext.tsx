import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Product } from '../data/mockData';
import { useAuth } from '../stores/useAuthStore';
import { useAdmin } from './AdminContext';

export interface CartItem extends Product {
  quantity: number;
  regularPrice?: number;
  memberPrice?: number;
  finalPrice?: number;
  lineDiscount?: number;
  offerLabel?: string | null;
  offerId?: string | null;
  discountedQuantity?: number;
  potentialDiscount?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: any, quantity?: number) => boolean;
  addItems: (items: Array<{ product: any; quantity?: number }>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => boolean;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  originalPriceSum: number;
  discountApplied: number;
  potentialDiscount: number;
  orderOfferDiscount: number;
  orderOfferLabel: string | null;
  getStock: (productId: string, fallbackStock?: number) => number;
  stockWarnings: { productId: string; name: string; requested: number; available: number }[];
  currentCustomer: any | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, customerProfile, isAuthenticated } = useAuth();
  const { customers, applyOffersToCartItem, applyOrderOffers, getStock: getAdminStock } = useAdmin();

  const [rawItems, setRawItems] = useState<CartItem[]>(() => {
    const savedCart = localStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const getStock = (productId: string, fallbackStock?: number): number => {
    const existing = rawItems.find(item => item.id === productId);
    const fallback = fallbackStock !== undefined ? fallbackStock : existing?.stock;
    return getAdminStock(productId, fallback);
  };

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(rawItems));
  }, [rawItems]);

  const addItem = (product: any, quantityToAdd: number = 1): boolean => {
    const qty = Math.max(1, quantityToAdd);
    const availableStock = getStock(product.id, product.stock);
    const existing = rawItems.find(item => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    if (availableStock > 0 && currentQty + qty > availableStock) {
      return false; // Excede stock
    }

    setRawItems(prev => {
      const idx = prev.findIndex(item => item.id === product.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...product, quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { ...product, quantity: qty }];
    });
    return true;
  };

  const addItems = (itemsToAdd: Array<{ product: any; quantity?: number }>) => {
    setRawItems(prev => {
      const next = [...prev];
      for (const { product, quantity } of itemsToAdd) {
        const qty = Math.max(1, quantity || 1);
        const availableStock = getStock(product.id, product.stock);
        const idx = next.findIndex(item => item.id === product.id);

        if (idx > -1) {
          const newQty = availableStock > 0 ? Math.min(availableStock, next[idx].quantity + qty) : (next[idx].quantity + qty);
          next[idx] = { ...next[idx], ...product, quantity: newQty };
        } else {
          const finalQty = availableStock > 0 ? Math.min(availableStock, qty) : qty;
          next.push({ ...product, quantity: finalQty });
        }
      }
      return next;
    });
  };

  const removeItem = (productId: string) => {
    setRawItems(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number): boolean => {
    if (quantity <= 0) {
      removeItem(productId);
      return true;
    }
    const existing = rawItems.find(item => item.id === productId);
    const availableStock = getStock(productId, existing?.stock);
    if (quantity > availableStock) {
      return false; // Excede stock
    }
    setRawItems(prev =>
      prev.map(item => item.id === productId ? { ...item, quantity } : item)
    );
    return true;
  };

  const clearCart = () => setRawItems([]);

  // Find associated customer matching the logged in user phone or customerProfile
  // ONLY if isAuthenticated is true!
  const currentCustomer = useMemo(() => {
    if (!isAuthenticated) return null;
    const activePhone = customerProfile?.phone || user?.phone;
    if (!activePhone && !customerProfile) return null;

    const clean = (p?: string) => {
      if (!p) return '';
      let c = p.replace(/\D/g, '');
      if (c.startsWith('549')) c = c.substring(3);
      else if (c.startsWith('54')) c = c.substring(2);
      if (c.startsWith('0')) c = c.substring(1);
      return c;
    };

    const targetClean = clean(activePhone);
    const found = customers.find(c => {
      const cClean = clean(c.phone);
      return cClean === targetClean ||
        (targetClean.length >= 8 && cClean.endsWith(targetClean.slice(-8))) ||
        (cClean.length >= 8 && targetClean.endsWith(cClean.slice(-8)));
    });

    if (found) return found;

    // Direct fallback from customerProfile (always available synchronously on page load)
    if (customerProfile) {
      return {
        phone: customerProfile.phone,
        name: `${customerProfile.name} ${customerProfile.last_name || ''}`.trim(),
        dni: (customerProfile as any).dni || '',
        address: customerProfile.address || '',
        totalOrders: 0,
        totalSpent: 0,
        lastOrder: '-',
        hasCurrentAccount: (customerProfile as any).hasCurrentAccount ?? true,
        currentDebt: 0,
        creditLimit: (customerProfile as any).customDebtLimit || (customerProfile as any).creditLimit || 50000,
        birthday: (customerProfile as any).birthday || '',
        spent30: 0,
        tier: (customerProfile as any).tier || 'Regular',
        oldestDebtDays: 0,
        useCustomAccountLimits: (customerProfile as any).useCustomAccountLimits || false,
        customDebtLimit: (customerProfile as any).customDebtLimit,
        customDebtDays: (customerProfile as any).customDebtDays,
        accountLimitNotes: (customerProfile as any).accountLimitNotes || '',
      } as any;
    }

    return null;
  }, [customers, user?.phone, customerProfile, isAuthenticated]);

  // Compute items with offers applied
  const items = useMemo(() => {
    return rawItems.map(item => {
      // Determinamos el precio regular unitario (base sin oferta)
      const basePrice = (item.originalPrice && item.originalPrice > item.price)
        ? item.originalPrice
        : item.price;

      // Calculamos la oferta real para el usuario actual (respeta restricciones de rango)
      const calcActual = applyOffersToCartItem(
        { productId: item.id, categoryId: item.categoryId, price: basePrice, quantity: item.quantity },
        currentCustomer,
        { forDisplay: false }
      );

      // Calculamos la oferta teórica para display público (saber beneficio disponible sin restricciones)
      const calcDisplay = applyOffersToCartItem(
        { productId: item.id, categoryId: item.categoryId, price: basePrice, quantity: item.quantity },
        currentCustomer,
        { forDisplay: true }
      );

      const regularUnitPrice = basePrice;

      // El precio real a pagar por el usuario si cumple con las condiciones de la oferta
      const actualUnitPrice = calcActual.finalPrice < regularUnitPrice
        ? calcActual.finalPrice
        : (item.price < regularUnitPrice ? item.price : regularUnitPrice);

      // El precio "visual" mínimo posible para mostrar como beneficio de registro
      const memberUnitPrice = calcDisplay.finalPrice < regularUnitPrice
        ? calcDisplay.finalPrice
        : actualUnitPrice;

      // Descuento unitario si NO está registrado (basado en el mejor precio público teórico)
      const potentialUnitDiscount = Math.max(0, regularUnitPrice - memberUnitPrice);
      const totalPotentialDiscount = potentialUnitDiscount * item.quantity;

      // Descuento unitario REAL si SÍ está registrado y cumple las condiciones
      const actualUnitDiscount = Math.max(0, regularUnitPrice - actualUnitPrice);
      const totalActualDiscount = actualUnitDiscount * item.quantity;

      const offerLabel = calcActual.offerLabel || calcDisplay.offerLabel || (item.discount ? `${item.discount}% OFF` : (item.originalPrice && item.originalPrice > item.price ? 'Oferta' : null));

      if (isAuthenticated) {
        // Para usuario REGISTRADO: aplicamos el descuento a finalPrice según calcActual (que sí valida rangos)
        return {
          ...item,
          regularPrice: regularUnitPrice,
          memberPrice: actualUnitPrice, // Solo para referencia, pero el que se usa es finalPrice
          finalPrice: actualUnitPrice,
          lineDiscount: totalActualDiscount,
          offerLabel: offerLabel,
          offerId: calcActual.offerId,
          discountedQuantity: calcActual.discountedQuantity || item.quantity,
          potentialDiscount: 0
        };
      } else {
        // Para usuario NO REGISTRADO (Invitado): se le cobra el precio regular, NO se descuenta del total
        return {
          ...item,
          regularPrice: regularUnitPrice,
          memberPrice: memberUnitPrice,
          finalPrice: regularUnitPrice,
          lineDiscount: 0,
          offerLabel: offerLabel,
          offerId: calcDisplay.offerId,
          discountedQuantity: 0,
          potentialDiscount: totalPotentialDiscount // Monto que ahorraría si se registra o cumple requisitos
        };
      }
    });
  }, [rawItems, currentCustomer, applyOffersToCartItem, isAuthenticated]);

  // Stock warnings: check if any cart item exceeds current stock
  const stockWarnings = useMemo(() => {
    const warnings: { productId: string; name: string; requested: number; available: number }[] = [];
    rawItems.forEach(item => {
      const available = getStock(item.id, item.stock);
      if (item.quantity > available) {
        warnings.push({ productId: item.id, name: item.name, requested: item.quantity, available });
      }
    });
    return warnings;
  }, [rawItems, getStock]);

  const totalItems = items.reduce((sum, item) => sum + (item.saleType === 'weight' ? 1 : item.quantity), 0);
  const originalPriceSum = items.reduce((sum, item) => sum + (item.regularPrice ?? item.price) * item.quantity, 0);

  // Total de descuentos que ahorraría el usuario si no está registrado
  const potentialDiscount = useMemo(() => {
    if (isAuthenticated) return 0;
    const itemsDiscount = items.reduce((sum, item) => sum + (item.potentialDiscount || 0), 0);
    // Calcular si calificaría también a una oferta de orden (ej. cupón de carrito)
    const potentialSubtotal = originalPriceSum - itemsDiscount;
    const orderCalc = applyOrderOffers(potentialSubtotal, null);
    return itemsDiscount + (orderCalc.discountAmount || 0);
  }, [items, isAuthenticated, originalPriceSum, applyOrderOffers]);

  const subtotalAfterItemDiscounts = items.reduce((sum, item) => {
    const unitPrice = isAuthenticated ? (item.memberPrice ?? item.finalPrice ?? item.price) : (item.regularPrice ?? item.price);
    return sum + (unitPrice * item.quantity);
  }, 0);

  const orderOfferCalc = useMemo(() => {
    if (!isAuthenticated) return { discountAmount: 0, offerLabel: null, offerId: null };
    return applyOrderOffers(subtotalAfterItemDiscounts, currentCustomer);
  }, [subtotalAfterItemDiscounts, currentCustomer, applyOrderOffers, isAuthenticated]);

  const totalPrice = Math.round((subtotalAfterItemDiscounts - orderOfferCalc.discountAmount) * 100) / 100;
  const discountApplied = isAuthenticated ? Math.max(0, originalPriceSum - totalPrice) : 0;

  return (
    <CartContext.Provider value={{ 
      items, 
      addItem, 
      addItems, 
      removeItem, 
      updateQuantity, 
      clearCart, 
      totalItems, 
      totalPrice,
      originalPriceSum,
      discountApplied,
      potentialDiscount,
      orderOfferDiscount: orderOfferCalc.discountAmount,
      orderOfferLabel: orderOfferCalc.offerLabel,
      getStock,
      stockWarnings,
      currentCustomer
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
