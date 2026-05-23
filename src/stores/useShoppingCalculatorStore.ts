import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ShoppingCalculatorItem, ShoppingSession, ShoppingSessionItem } from '../types/shopping-session.types';
import { useProductStore } from './useProductStore';
import { productsService } from '../services/products.service';
import { shoppingSessionService } from '../services/shopping-session.service';

interface ShoppingCalculatorState {
  items: ShoppingCalculatorItem[];
  subtotal: number;
  totalItems: number;
  scannerOpen: boolean;
  lastScannedCode: string | null;
  loading: boolean;
  error: string | null;
  generatedSession: { session: ShoppingSession; items: ShoppingSessionItem[] } | null;

  addProductByBarcode: (barcode: string) => Promise<boolean>;
  addProduct: (product: any) => void;
  addManualProduct: (name: string, price: number) => void;
  incrementItem: (id: string) => void;
  decrementItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearCalculator: () => void;
  setScannerOpen: (open: boolean) => void;
  clearError: () => void;
  finalizeCalculator: (customerName?: string, customerPhone?: string) => Promise<boolean>;
  resetGeneratedSession: () => void;
}

const recalculateTotals = (items: ShoppingCalculatorItem[]) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  return { subtotal, totalItems };
};

export const useShoppingCalculatorStore = create<ShoppingCalculatorState>()(
  persist(
    (set, get) => ({
      items: [],
      subtotal: 0,
      totalItems: 0,
      scannerOpen: false,
      lastScannedCode: null,
      loading: false,
      error: null,
      generatedSession: null,

      setScannerOpen: (open: boolean) => set({ scannerOpen: open }),
      clearError: () => set({ error: null }),

      addProductByBarcode: async (barcode: string) => {
        const cleanBarcode = barcode.trim();
        set({ loading: true, error: null, lastScannedCode: cleanBarcode });

        try {
          // 1. First attempt: Search locally in loaded store products
          let product = useProductStore.getState().products.find(
            p => p.barcode && p.barcode.trim() === cleanBarcode
          );

          // 2. Second attempt: If not found, fetch from Supabase
          if (!product) {
            console.log(`🔍 Barcode ${cleanBarcode} not found in local store, querying database...`);
            const fetched = await productsService.getProductByBarcode(cleanBarcode);
            if (fetched) {
              product = fetched;
            }
          }

          if (!product) {
            set({
              loading: false,
              error: `El código "${cleanBarcode}" no fue encontrado en la sucursal.`
            });
            return false;
          }

          // 3. Add product to the calculator list
          get().addProduct(product);
          set({ loading: false, scannerOpen: false, error: null });
          return true;
        } catch (err: any) {
          console.error('Error adding product by barcode:', err);
          set({
            loading: false,
            error: 'Error al buscar el producto. Por favor reintentá.'
          });
          return false;
        }
      },

      addProduct: (product: any) => {
        const currentItems = get().items;
        const existing = currentItems.find(item => item.id === product.id);

        let newItems: ShoppingCalculatorItem[];
        if (existing) {
          newItems = currentItems.map(item =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        } else {
          newItems = [
            ...currentItems,
            {
              id: product.id,
              productId: product.id,
              barcode: product.barcode,
              name: product.name,
              image: product.image,
              price: product.price,
              quantity: 1,
              isManual: false
            }
          ];
        }

        const { subtotal, totalItems } = recalculateTotals(newItems);
        set({ items: newItems, subtotal, totalItems });
      },

      addManualProduct: (name: string, price: number) => {
        const currentItems = get().items;
        const newItem: ShoppingCalculatorItem = {
          id: `manual-${Date.now()}`,
          productId: null,
          barcode: null,
          name: name.trim(),
          image: '',
          price: price,
          quantity: 1,
          isManual: true
        };

        const newItems = [...currentItems, newItem];
        const { subtotal, totalItems } = recalculateTotals(newItems);
        set({ items: newItems, subtotal, totalItems });
      },

      incrementItem: (id: string) => {
        const newItems = get().items.map(item =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item
        );
        const { subtotal, totalItems } = recalculateTotals(newItems);
        set({ items: newItems, subtotal, totalItems });
      },

      decrementItem: (id: string) => {
        const newItems = get().items.map(item => {
          if (item.id === id) {
            const nextQty = Math.max(1, item.quantity - 1);
            return { ...item, quantity: nextQty };
          }
          return item;
        });
        const { subtotal, totalItems } = recalculateTotals(newItems);
        set({ items: newItems, subtotal, totalItems });
      },

      removeItem: (id: string) => {
        const newItems = get().items.filter(item => item.id !== id);
        const { subtotal, totalItems } = recalculateTotals(newItems);
        set({ items: newItems, subtotal, totalItems });
      },

      clearCalculator: () => {
        set({ items: [], subtotal: 0, totalItems: 0, error: null, lastScannedCode: null });
      },

      finalizeCalculator: async (customerName?: string, customerPhone?: string) => {
        const calculatorItems = get().items;
        if (calculatorItems.length === 0) return false;

        set({ loading: true, error: null });

        try {
          const input = {
            branchId: 'main',
            customerName: customerName || '',
            customerPhone: customerPhone || '',
            subtotal: get().subtotal,
            totalItems: get().totalItems,
            items: calculatorItems.map(item => ({
              productId: item.productId || null,
              barcode: item.barcode || null,
              name: item.name,
              image: item.image,
              price: item.price,
              quantity: item.quantity
            }))
          };

          const response = await shoppingSessionService.createShoppingSession(input);
          
          set({
            generatedSession: response,
            items: [],
            subtotal: 0,
            totalItems: 0,
            loading: false,
            error: null
          });
          return true;
        } catch (err: any) {
          console.error('Error finalizing shopping session pre-purchase:', err);
          set({
            loading: false,
            error: 'No se pudo generar el código de pre-compra en el servidor. Por favor intentá nuevamente.'
          });
          return false;
        }
      },

      resetGeneratedSession: () => {
        set({ generatedSession: null, error: null });
      }
    }),
    {
      name: 'la-martina-shopping-calculator',
      partialize: (state) => ({
        items: state.items,
        subtotal: state.subtotal,
        totalItems: state.totalItems,
        generatedSession: state.generatedSession
      })
    }
  )
);
