import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { categories } from '../data/mockData';
import { useAdmin } from '../context/AdminContext';
import { useCart } from '../context/CartContext';
import { useScrollLock } from '../utils/useScrollLock';
import { productsService } from '../services/products.service';
import { Product } from '../types/product.types';

export const Category: React.FC = () => {
  const { id, subId } = useParams<{ id: string; subId?: string }>();
  const { adminCategories, adminSubcategories, applyOffersToCartItem } = useAdmin();
  const { currentCustomer } = useCart();

  const categoriesList = adminCategories.length > 0 ? adminCategories : categories;
  const category = categoriesList.find(c => c.id === id) || { title: id?.toUpperCase() || 'CATEGORÍA', description: 'Productos seleccionados', id: id || 'cat' };

  const currentCategorySubcategories = React.useMemo(() => {
    return adminSubcategories.filter(s => s.categoryId === id);
  }, [adminSubcategories, id]);

  const currentSubcategory = React.useMemo(() => {
    if (!subId) return undefined;
    return currentCategorySubcategories.find(s => s.id === subId || s.id === `${id}-${subId}`);
  }, [currentCategorySubcategories, subId, id]);

  const effectiveSubId = currentSubcategory ? currentSubcategory.id : subId;

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  useScrollLock(isFilterOpen);
  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 50000]);
  const [selectedBrands, setSelectedBrands] = React.useState<string[]>([]);
  const [availableBrands, setAvailableBrands] = React.useState<string[]>([]);
  const [sortBy, setSortBy] = React.useState('featured');
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const sortDropdownRef = React.useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Estados para productos paginados desde Supabase (Ahorro de Egress)
  const [products, setProducts] = React.useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const sortOptions = [
    { id: 'featured', label: 'Destacados', icon: 'auto_awesome' },
    { id: 'price_asc', label: 'Menor Precio', icon: 'trending_down' },
    { id: 'price_desc', label: 'Mayor Precio', icon: 'trending_up' },
  ];

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Exactamente 10 filas de productos según el dispositivo:
  // Celular (<768px): 2 cols * 10 filas = 20 productos
  // Tablet (768-1023px): 3 cols * 10 filas = 30 productos
  // Computadora (>=1024px): 4 cols * 10 filas = 40 productos
  const [itemsPerPage, setItemsPerPage] = React.useState(40);

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setItemsPerPage(40);
      } else if (width >= 768) {
        setItemsPerPage(30);
      } else {
        setItemsPerPage(20);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const routeKey = `${id || ''}_${effectiveSubId || ''}`;
  const prevRouteKeyRef = React.useRef(routeKey);

  // Reiniciar a página 1 y scroll al inicio cuando cambia la categoría o subcategoría
  React.useEffect(() => {
    setCurrentPage(1);
    setSelectedBrands([]);
    setAvailableBrands([]);
    setPriceRange([0, 50000]);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [id, effectiveSubId]);

  // Cargar lista completa de marcas disponibles en esta categoría / subcategoría
  React.useEffect(() => {
    let isMounted = true;
    const loadBrands = async () => {
      try {
        const b = await productsService.getCategoryBrands(id, effectiveSubId);
        if (isMounted && b.length > 0) {
          setAvailableBrands(b);
        }
      } catch (err) {
        console.warn('Error cargando marcas de categoría:', err);
      }
    };
    if (id) loadBrands();
    return () => { isMounted = false; };
  }, [id, effectiveSubId]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [priceRange, selectedBrands, sortBy]);

  // Consulta paginada a Supabase con selección estricta de columnas y caché
  React.useEffect(() => {
    let isMounted = true;
    const isNewRoute = prevRouteKeyRef.current !== routeKey;
    if (isNewRoute) {
      prevRouteKeyRef.current = routeKey;
    }

    // Si la ruta acaba de cambiar, no arrastrar filtros de marcas de la ruta anterior
    const brandsToQuery = isNewRoute ? undefined : (selectedBrands.length > 0 ? selectedBrands : undefined);

    const fetchCategoryProducts = async () => {
      setLoading(true);
      try {
        const { data, total } = await productsService.getProductsPaginated({
          categoryId: id,
          subcategoryId: effectiveSubId,
          page: isNewRoute ? 1 : currentPage,
          limit: itemsPerPage,
          onlyInStock: true,
          includePaused: false,
          sortBy: sortBy === 'price_asc' || sortBy === 'price_desc' ? 'price' : undefined,
          sortDesc: sortBy === 'price_desc',
          minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
          maxPrice: priceRange[1] < 50000 ? priceRange[1] : undefined,
          brands: brandsToQuery,
          useCache: true,
        });

        if (isMounted) {
          setProducts(data);
          setTotalProducts(total);

          // Extraer marcas observadas para filtros
          if (data.length > 0) {
            setAvailableBrands(prev => {
              const set = new Set(prev);
              data.forEach(p => { if (p.brand && p.brand.trim()) set.add(p.brand.trim()); });
              return Array.from(set);
            });
          }
        }
      } catch (err) {
        console.error('Error fetching category products:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCategoryProducts();

    return () => {
      isMounted = false;
    };
  }, [id, effectiveSubId, currentPage, itemsPerPage, sortBy, priceRange, selectedBrands, routeKey]);

  // Aplicar ofertas personalizadas por cliente (solo productos activos y con stock)
  const paginatedProducts = React.useMemo(() => {
    return products
      .filter(p => !p.isPaused && (p.stock ?? 0) > 0)
      .map(p => {
        const calc = applyOffersToCartItem(
          { productId: p.id, categoryId: p.categoryId, price: p.price, quantity: 1 },
          currentCustomer,
          { forDisplay: true }
        );
        if (calc.discountAmount > 0) {
          const discountPercentStr = (calc.originalPrice || p.price) > 0
            ? `-${Math.round((calc.discountAmount / (calc.originalPrice || p.price)) * 100)}%`
            : undefined;
          return {
            ...p,
            originalPrice: calc.originalPrice || p.price,
            price: calc.finalPrice,
            discount: discountPercentStr || p.discount || `-$${calc.discountAmount.toLocaleString('es-AR')}`,
            badge: calc.offerLabel || p.badge || 'Oferta',
            offerLabel: calc.offerLabel
          };
        }
        return p;
      });
  }, [products, applyOffersToCartItem, currentCustomer]);

  const totalPages = Math.max(1, Math.ceil(totalProducts / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalProducts);

  const handlePageChange = (newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, totalPages));
    setCurrentPage(validPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  const clearFilters = () => {
    setSelectedBrands([]);
    setPriceRange([0, 50000]);
  };

  const hasActiveFilters = selectedBrands.length > 0 || priceRange[1] < 50000;

  // Helper para generar números de página con elipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-in fade-in duration-500">
      {/* Breadcrumb & Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant/70 mb-2 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">Inicio</Link>
          <span>/</span>
          {subId ? (
            <>
              <Link to={`/category/${category.id}`} className="hover:text-primary transition-colors">{category.title}</Link>
              <span>/</span>
              <span className="text-on-surface font-bold">{currentSubcategory?.title || subId}</span>
            </>
          ) : (
            <span className="text-on-surface font-bold">{category.title}</span>
          )}
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-outline-variant/15 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-on-background tracking-tight">
              {currentSubcategory ? currentSubcategory.title : category.title}
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">
              {currentSubcategory?.description || category.description}
            </p>
          </div>
          <span className="text-xs font-bold text-on-surface-variant/80 bg-surface-container-high px-3 py-1.5 rounded-full w-fit">
            {loading ? 'Buscando...' : `${totalProducts} ${totalProducts === 1 ? 'producto' : 'productos'}`}
          </span>
        </div>

      </div>

      {/* Main Layout: Sidebar (Desktop) + Products Area */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* Desktop Sidebar Filters (Visible on lg+) */}
        <aside className="hidden lg:block w-64 xl:w-72 shrink-0 sticky top-36 bg-white p-5 rounded-2xl border border-outline-variant/15 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3">
            <h3 className="font-bold text-base flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-primary text-[20px]">filter_alt</span>
              Filtros
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary font-bold hover:underline cursor-pointer"
              >
                Limpiar todo
              </button>
            )}
          </div>

          {/* Subcategorías en Sidebar */}
          {currentCategorySubcategories.length > 0 && (
            <div className="border-b border-outline-variant/15 pb-5">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                Subcategorías
              </span>
              <div className="space-y-1">
                <Link
                  to={`/category/${id}`}
                  className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl transition-colors ${!subId
                    ? 'bg-primary text-white font-bold shadow-2xs'
                    : 'text-on-surface hover:bg-surface-container-high font-medium'
                    }`}
                >
                  <span>Todas</span>
                </Link>
                {currentCategorySubcategories.map(sub => {
                  const isSelected = subId === sub.id || subId === sub.id.replace(`${id}-`, '');
                  return (
                    <Link
                      key={sub.id}
                      to={`/category/${id}/${sub.id}`}
                      className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl transition-colors ${isSelected
                        ? 'bg-primary text-white font-bold shadow-2xs'
                        : 'text-on-surface hover:bg-surface-container-high font-medium'
                        }`}
                    >
                      <span>{sub.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rango de Precio */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Precio Máximo</span>
              <span className="text-sm font-black text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                ${priceRange[1].toLocaleString('es-AR')}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50000"
              step="500"
              value={priceRange[1]}
              onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/70 mt-1 font-semibold">
              <span>$0</span>
              <span>$50.000+</span>
            </div>
          </div>

          {/* Marcas */}
          {availableBrands.length > 0 && (
            <div className="border-t border-outline-variant/15 pt-5">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                Marcas ({availableBrands.length})
              </span>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                {availableBrands.map(brand => {
                  const isChecked = selectedBrands.includes(brand);
                  return (
                    <label
                      key={brand}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${isChecked ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container-low text-on-surface'
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleBrand(brand)}
                          className="accent-primary w-4 h-4 rounded cursor-pointer"
                        />
                        <span className="truncate max-w-[160px]">{brand}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Right Content Area */}
        <div className="flex-1 w-full min-w-0">

          {/* Top Sort & Mobile Filter Trigger */}
          <div className="flex items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-outline-variant/15 shadow-xs mb-6">
            {/* Mobile Filter Button */}
            <button
              onClick={() => setIsFilterOpen(true)}
              className="lg:hidden flex items-center gap-1.5 text-on-surface font-bold text-xs bg-surface-container-low px-3 sm:px-4 py-2 rounded-xl border border-outline-variant/20 cursor-pointer shadow-xs active:scale-95 transition-all truncate max-w-[50%]"
            >
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0">tune</span>
              <span className="truncate">
                {currentSubcategory
                  ? currentSubcategory.title
                  : selectedBrands.length > 0
                    ? `Filtros (${selectedBrands.length})`
                    : 'Filtros'}
              </span>
              {currentSubcategory && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
              )}
            </button>

            {/* Active filter badges on desktop */}
            <div className="hidden lg:flex flex-wrap items-center gap-2 flex-1 mr-4">
              {currentSubcategory && (
                <span className="inline-flex items-center gap-1 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                  {currentSubcategory.title}
                  <Link to={`/category/${id}`} className="hover:text-white/80 cursor-pointer ml-0.5 flex items-center">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </Link>
                </span>
              )}
              {selectedBrands.map(brand => (
                <span key={brand} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                  {brand}
                  <button onClick={() => toggleBrand(brand)} className="hover:text-red-700 cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
              {priceRange[1] < 50000 && (
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                  Hasta ${priceRange[1].toLocaleString('es-AR')}
                  <button onClick={() => setPriceRange([0, 50000])} className="hover:text-red-700 cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              )}
            </div>

            {/* Custom Sort Selector Dropdown */}
            <div className="relative shrink-0" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="flex items-center gap-1.5 sm:gap-2 bg-surface-container-low hover:bg-surface-container hover:border-primary/30 transition-all border border-outline-variant/20 rounded-xl px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-bold text-on-surface shadow-2xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                  {sortBy === 'price_asc' ? 'arrow_upward_alt' : sortBy === 'price_desc' ? 'arrow_downward_alt' : 'swap_vert'}
                </span>
                <span className="hidden md:inline text-on-surface-variant font-medium">Ordenar:</span>
                <span className="font-extrabold text-on-surface whitespace-nowrap">
                  {sortOptions.find(o => o.id === sortBy)?.label || 'Destacados'}
                </span>
                <span className={`material-symbols-outlined text-[16px] sm:text-[18px] text-on-surface-variant transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {isSortOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-outline-variant/15 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-on-surface-variant/70 border-b border-outline-variant/10">
                    Ordenar productos por
                  </div>
                  {sortOptions.map(option => {
                    const isSelected = sortBy === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSortBy(option.id);
                          setIsSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm text-left transition-colors cursor-pointer ${isSelected
                          ? 'bg-primary/10 text-primary font-black'
                          : 'text-on-surface hover:bg-surface-container-low font-medium'
                          }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-primary">{option.icon}</span>
                          {option.label}
                        </span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[18px] text-primary">check</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading ? (
            <div className="product-grid">
              {Array.from({ length: Math.min(itemsPerPage, 12) }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-3 border border-outline-variant/10 animate-pulse flex flex-col h-72">
                  <div className="w-full aspect-square bg-surface-container-low rounded-lg mb-3"></div>
                  <div className="h-3 bg-surface-container rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-surface-container rounded w-3/4 mb-4"></div>
                  <div className="h-6 bg-surface-container rounded w-1/2 mt-auto"></div>
                </div>
              ))}
            </div>
          ) : paginatedProducts.length > 0 ? (
            <>
              {/* Product Grid */}
              <div className="product-grid">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product as any} />
                ))}
              </div>

              {/* Controles de Paginación */}
              {totalPages > 1 && (
                <div className="mt-10 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-outline-variant/15 shadow-xs">
                  <span className="text-xs font-medium text-on-surface-variant">
                    Mostrando <strong className="text-on-surface">{startIndex + 1} - {endIndex}</strong> de <strong className="text-on-surface">{totalProducts}</strong> productos
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Anterior */}
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${currentPage === 1
                        ? 'border-outline-variant/20 text-on-surface-variant/30 bg-transparent cursor-not-allowed'
                        : 'border-outline-variant/30 bg-white text-on-surface hover:bg-primary hover:text-white hover:border-primary shadow-xs'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                      <span className="hidden sm:inline">Anterior</span>
                    </button>

                    {/* Números de página */}
                    <div className="flex items-center gap-1">
                      {getPageNumbers().map((page, idx) => (
                        typeof page === 'number' ? (
                          <button
                            key={idx}
                            onClick={() => handlePageChange(page)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${currentPage === page
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                              }`}
                          >
                            {page}
                          </button>
                        ) : (
                          <span key={idx} className="px-1 text-xs text-on-surface-variant font-bold">
                            {page}
                          </span>
                        )
                      ))}
                    </div>

                    {/* Botón Siguiente */}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${currentPage === totalPages
                        ? 'border-outline-variant/20 text-on-surface-variant/30 bg-transparent cursor-not-allowed'
                        : 'border-outline-variant/30 bg-white text-on-surface hover:bg-primary hover:text-white hover:border-primary shadow-xs'
                        }`}
                    >
                      <span className="hidden sm:inline">Siguiente</span>
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-outline-variant/30 p-8 shadow-xs">
              <span className="material-symbols-outlined text-5xl mb-3 text-on-surface-variant/30">filter_list_off</span>
              <p className="text-on-surface font-bold text-lg">No hay productos que coincidan con estos filtros</p>
              <p className="text-on-surface-variant text-xs mt-1 max-w-sm mx-auto">Probá ampliando el rango de precios o desmarcando algunas marcas.</p>
              <button
                onClick={clearFilters}
                className="mt-5 bg-primary text-white text-xs font-bold px-6 py-2.5 rounded-full hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
              >
                Limpiar todos los filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex justify-start lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in duration-300"
            onClick={() => setIsFilterOpen(false)}
          />

          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto z-10 animate-in slide-in-from-left duration-300">
            <div>
              <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4 mb-6">
                <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">tune</span>
                  Filtros
                </h3>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant cursor-pointer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Subcategorías en Mobile Drawer */}
              {currentCategorySubcategories.length > 0 && (
                <div className="mb-6 border-b border-outline-variant/15 pb-6">
                  <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-on-surface-variant">
                    Subcategorías
                  </h4>
                  <div className="space-y-1">
                    <Link
                      to={`/category/${id}`}
                      onClick={() => setIsFilterOpen(false)}
                      className={`flex items-center justify-between text-xs py-2 px-3 rounded-xl transition-colors ${!subId
                        ? 'bg-primary text-white font-bold shadow-2xs'
                        : 'text-on-surface hover:bg-surface-container-high font-medium'
                        }`}
                    >
                      <span>Todas</span>
                    </Link>
                    {currentCategorySubcategories.map(sub => {
                      const isSelected = subId === sub.id || subId === sub.id.replace(`${id}-`, '');
                      return (
                        <Link
                          key={sub.id}
                          to={`/category/${id}/${sub.id}`}
                          onClick={() => setIsFilterOpen(false)}
                          className={`flex items-center justify-between text-xs py-2 px-3 rounded-xl transition-colors ${isSelected
                            ? 'bg-primary text-white font-bold shadow-2xs'
                            : 'text-on-surface hover:bg-surface-container-high font-medium'
                            }`}
                        >
                          <span>{sub.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rango de Precio */}
              <div>
                <h4 className="font-bold mb-3 flex justify-between items-center text-xs uppercase tracking-wider text-on-surface-variant">
                  Rango de Precio
                  <span className="text-primary normal-case font-black">${priceRange[1].toLocaleString('es-AR')}</span>
                </h4>
                <input
                  type="range"
                  min="0"
                  max="50000"
                  step="500"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                  className="w-full accent-primary cursor-pointer mb-2"
                />
                <div className="flex justify-between text-xs text-on-surface-variant/70 font-semibold mb-6">
                  <span>$0</span>
                  <span>$50.000+</span>
                </div>
              </div>

              {/* Marcas en Mobile Drawer */}
              {availableBrands.length > 0 && (
                <div className="border-t border-outline-variant/15 pt-5 mb-6">
                  <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-on-surface-variant">
                    Marcas ({availableBrands.length})
                  </h4>
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                    {availableBrands.map(brand => {
                      const isChecked = selectedBrands.includes(brand);
                      return (
                        <label
                          key={brand}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${isChecked ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container-low text-on-surface'
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBrand(brand)}
                              className="accent-primary w-4 h-4 rounded cursor-pointer"
                            />
                            <span className="truncate max-w-[170px]">{brand}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-outline-variant/15 flex gap-2">
              <button
                onClick={clearFilters}
                className="w-1/2 py-3 rounded-xl border border-outline-variant/30 text-on-surface font-bold text-xs hover:bg-surface-container transition-colors cursor-pointer"
              >
                Limpiar
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="w-1/2 py-3 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-colors shadow-md cursor-pointer"
              >
                Aplicar ({totalProducts})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
