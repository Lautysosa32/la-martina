import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Product } from '../data/mockData';
import { useAuth } from './AuthContext';
import { useAdmin } from './AdminContext';

export interface CartItem extends Product {
  quantity: number;
  finalPrice?: number;
  lineDiscount?: number;
  offerLabel?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product) => boolean;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => boolean;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  originalPriceSum: number;
  discountApplied: number;
  orderOfferDiscount: number;
  orderOfferLabel: string | null;
  getStock: (productId: string) => number;
  stockWarnings: { productId: string; name: string; requested: number; available: number }[];
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { customers, applyOffersToCartItem, applyOrderOffers, getStock } = useAdmin();

  const [rawItems, setRawItems] = useState<CartItem[]>(() => {
    const savedCart = localStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(rawItems));
  }, [rawItems]);

  const addItem = (product: Product): boolean => {
    const stock = getStock(product.id);
    const currentInCart = rawItems.find(item => item.id === product.id)?.quantity || 0;
    if (currentInCart + 1 > stock) return false;

    setRawItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === product.id);
      if (existingItem) {
        return prevItems.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevItems, { ...product, quantity: 1 }];
    });
    return true;
  };

  const removeItem = (productId: string) => {
    setRawItems(prevItems => prevItems.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number): boolean => {
    if (quantity <= 0) {
      removeItem(productId);
      return true;
    }
    const stock = getStock(productId);
    if (quantity > stock) return false;

    setRawItems(prevItems =>
      prevItems.map(item =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
    return true;
  };

  const clearCart = () => setRawItems([]);

  // Find associated customer matching the logged in user phone
  const currentCustomer = useMemo(() => {
    if (!user?.phone) return null;
    const clean = (p: string) => {
      let c = p.replace(/\D/g, '');
      if (c.startsWith('549')) c = c.substring(3);
      else if (c.startsWith('54')) c = c.substring(2);
      if (c.startsWith('0')) c = c.substring(1);
      return c;
    };
    const userPhoneClean = clean(user.phone);
    return customers.find(c => clean(c.phone) === userPhoneClean);
  }, [customers, user?.phone]);

  // Compute items with offers applied
  const items = useMemo(() => {
    return rawItems.map(item => {
      const calc = applyOffersToCartItem(
        { productId: item.id, categoryId: item.categoryId, price: item.price, quantity: item.quantity },
        currentCustomer
      );
      return {
        ...item,
        finalPrice: calc.finalPrice,
        lineDiscount: calc.discountAmount,
        offerLabel: calc.offerLabel
      };
    });
  }, [rawItems, currentCustomer, applyOffersToCartItem]);

  // Stock warnings: check if any cart item exceeds current stock
  const stockWarnings = useMemo(() => {
    const warnings: { productId: string; name: string; requested: number; available: number }[] = [];
    rawItems.forEach(item => {
      const available = getStock(item.id);
      if (item.quantity > available) {
        warnings.push({ productId: item.id, name: item.name, requested: item.quantity, available });
      }
    });
    return warnings;
  }, [rawItems, getStock]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const originalPriceSum = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const subtotalAfterItemDiscounts = items.reduce((sum, item) => sum + (item.finalPrice ?? item.price) * item.quantity, 0);

  const orderOfferCalc = useMemo(() => {
    return applyOrderOffers(subtotalAfterItemDiscounts, currentCustomer);
  }, [subtotalAfterItemDiscounts, currentCustomer, applyOrderOffers]);

  const totalPrice = subtotalAfterItemDiscounts - orderOfferCalc.discountAmount;
  const discountApplied = originalPriceSum - totalPrice;

  return (
    <CartContext.Provider value={{ 
      items, 
      addItem, 
      removeItem, 
      updateQuantity, 
      clearCart, 
      totalItems, 
      totalPrice,
      originalPriceSum,
      discountApplied,
      orderOfferDiscount: orderOfferCalc.discountAmount,
      orderOfferLabel: orderOfferCalc.offerLabel,
      getStock,
      stockWarnings
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
