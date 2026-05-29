import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../data/mockData';
import { useAuthStore } from '../stores/useAuthStore';
import { useProductStore } from '../stores/useProductStore';
import { supabase } from '../lib/supabase';

interface FavoritesContextType {
  favorites: Product[];
  toggleFavorite: (product: Product) => void;
  isFavorite: (productId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<Product[]>([]);
  const user = useAuthStore((state) => state.user);
  const products = useProductStore((state) => state.products);
  const loading = useProductStore((state) => state.loading);

  // Load favorites
  useEffect(() => {
    if (user) {
      // Authenticated storefront customer: load from public.favorites in Supabase
      const fetchDbFavorites = async () => {
        const { data, error } = await supabase
          .from('favorites')
          .select('product_id')
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Error fetching favorites from Supabase:', error);
          return;
        }
        
        if (data) {
          const favoriteIds = data.map((f: any) => f.product_id);
          // Resolve to actual product objects from our product store
          const favProducts = products.filter(p => favoriteIds.includes(p.id)) as any;
          setFavorites(favProducts);
        }
      };

      fetchDbFavorites();

      // Realtime syncing for user favorites
      const channel = supabase.channel(`favorites_user_${user.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'favorites', 
          filter: `user_id=eq.${user.id}` 
        }, () => {
          fetchDbFavorites();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      // Guest storefront user: load from localStorage
      const saved = localStorage.getItem('la-martina-favorites');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // Keep backward compatibility for both array of Product objects or array of product IDs
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              const mapped = products.filter(p => parsed.includes(p.id)) as any;
              setFavorites(mapped);
            } else if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].id) {
              // Array of product objects: map to latest storefront product objects
              const ids = parsed.map((p: any) => p.id);
              const mapped = products.filter(p => ids.includes(p.id)) as any;
              setFavorites(mapped);
            } else {
              setFavorites(parsed);
            }
          }
        } catch (e) {
          console.error("Error loading favorites from localStorage", e);
        }
      } else {
        setFavorites([]);
      }
    }
  }, [user, products, loading]);

  // Sync guest favorites to Supabase upon customer login
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem('la-martina-favorites');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const productIds = parsed.map((item: any) => typeof item === 'string' ? item : item.id);
            console.log('🔄 Sincronizando favoritos locales con Supabase para el usuario...', user.id);
            
            const syncFavorites = async () => {
              // Get current database favorites to prevent duplicates
              const { data: currentFavs } = await supabase
                .from('favorites')
                .select('product_id')
                .eq('user_id', user.id);
              
              const currentIds = currentFavs ? currentFavs.map((f: any) => f.product_id) : [];
              const idsToInsert = productIds.filter(id => !currentIds.includes(id));
              
              if (idsToInsert.length > 0) {
                const inserts = idsToInsert.map(prodId => ({
                  user_id: user.id,
                  product_id: prodId
                }));
                const { error } = await supabase.from('favorites').insert(inserts);
                if (error) {
                  console.error('Error syncing local favorites to Supabase:', error);
                } else {
                  console.log('✅ Sincronización de favoritos completada con éxito');
                }
              }
              // Clean up local storage key now that it has been migrated
              localStorage.removeItem('la-martina-favorites');
            };

            syncFavorites();
          }
        } catch (e) {
          console.error("Error parsing/syncing local favorites", e);
        }
      }
    }
  }, [user]);

  const toggleFavorite = async (product: Product) => {
    if (user) {
      const exists = favorites.some(p => p.id === product.id);
      if (exists) {
        // Remove from state (optimistic) and Supabase
        setFavorites(prev => prev.filter(p => p.id !== product.id));
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        if (error) {
          console.error('Error removing favorite from Supabase:', error);
        }
      } else {
        // Add to state (optimistic) and Supabase
        setFavorites(prev => [...prev, product]);
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, product_id: product.id });
        if (error) {
          console.error('Error adding favorite to Supabase:', error);
        }
      }
    } else {
      // Guest: update localStorage
      setFavorites(prev => {
        const exists = prev.some(p => p.id === product.id);
        const next = exists 
          ? prev.filter(p => p.id !== product.id)
          : [...prev, product];
        localStorage.setItem('la-martina-favorites', JSON.stringify(next));
        return next;
      });
    }
  };

  const isFavorite = (productId: string) => {
    return favorites.some(p => p.id === productId);
  };

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
