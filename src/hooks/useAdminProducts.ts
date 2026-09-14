import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types/product.types';

export interface UseAdminProductsOptions {
  pageSize?: number;
  initialPage?: number;
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  sortBy?: string;
  sortDesc?: boolean;
}

// Proyección estricta para la vista del catálogo de administración:
// Solo columnas necesarias para la tabla, evitando transferir campos innecesarios
export const ADMIN_CATALOG_SELECT = 'id, branch_id, barcode, name, brand, category_id, subcategory_id, price, original_price, stock, min_stock, image, is_paused, sale_type, badge, updated_at, created_at';

export interface UseAdminProductsResult {
  products: Product[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  setPage: (pageOrFn: number | ((prev: number) => number)) => void;
  nextPage: () => void;
  prevPage: () => void;
  refetch: () => Promise<void>;
}

/**
 * Hook para paginación eficiente desde el servidor (Server-Side Pagination)
 * Implementa .range(from, to) de Supabase sin cargar los 10,000+ registros a la vez.
 */
export function useAdminProducts(options: UseAdminProductsOptions = {}): UseAdminProductsResult {
  const pageSize = options.pageSize || 50;
  const [page, setPage] = useState<number>(options.initialPage || 1);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Cálculo del rango inclusivo para Supabase:
      // Para página 1 con pageSize 50: from = 0, to = 49 (50 registros exactos)
      // Para página 2: from = 50, to = 99
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // 2. Consulta a Supabase con .range() y conteo exacto en el encabezado
      let query = supabase
        .from('products')
        .select(ADMIN_CATALOG_SELECT, { count: 'exact' })
        .range(from, to);

      // 3. Filtro por categoría y subcategoría
      if (options.categoryId && options.categoryId !== 'all') {
        query = query.eq('category_id', options.categoryId);
      }
      if (options.subcategoryId && options.subcategoryId !== 'all') {
        query = query.eq('subcategory_id', options.subcategoryId);
      }

      // 4. Búsqueda por texto (nombre, marca o código de barras)
      if (options.search && options.search.trim() !== '') {
        const cleanSearch = options.search.trim();
        query = query.or(`name.ilike.%${cleanSearch}%,brand.ilike.%${cleanSearch}%,barcode.ilike.%${cleanSearch}%`);
      }

      // 5. Ordenamiento dinámico
      const sortColumn = options.sortBy || 'created_at';
      query = query.order(sortColumn, { ascending: !options.sortDesc });

      const { data, count, error: queryError } = await query;

      if (queryError) throw queryError;

      // 6. Mapear datos a la interfaz Product del frontend
      const mapped: Product[] = (data || []).map((p: any) => ({
        id: p.id,
        branchId: p.branch_id ?? null,
        name: p.name || '',
        brand: p.brand || '',
        categoryId: p.category_id || '',
        subcategoryId: p.subcategory_id || null,
        price: Number(p.price || 0),
        originalPrice: p.original_price ? Number(p.original_price) : null,
        image: p.image || '',
        format: p.format || null,
        isNew: Boolean(p.is_new),
        discount: p.discount ? Number(p.discount) : null,
        badge: p.badge || null,
        minStock: Number(p.min_stock ?? 0),
        barcode: p.barcode ? String(p.barcode).trim() : null,
        stock: Number(p.stock ?? 0),
        saleType: p.sale_type === 'weight' ? 'weight' : 'unit',
        isPaused: Boolean(p.is_paused),
        createdAt: p.created_at || '',
        updatedAt: p.updated_at || ''
      }));

      setProducts(mapped);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      console.error('❌ Error en useAdminProducts:', err);
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, options.categoryId, options.subcategoryId, options.search, options.sortBy, options.sortDesc]);

  // Ejecutar fetch cada vez que cambien los parámetros
  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Si cambia la búsqueda o categoría desde el padre, resetear a página 1
  useEffect(() => {
    setPage(1);
  }, [options.search, options.categoryId, options.subcategoryId]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const nextPage = () => setPage(prev => (prev < totalPages ? prev + 1 : prev));
  const prevPage = () => setPage(prev => Math.max(1, prev - 1));

  return {
    products,
    totalCount,
    totalPages,
    page,
    pageSize,
    loading,
    error,
    setPage,
    nextPage,
    prevPage,
    refetch: fetchPage
  };
}
