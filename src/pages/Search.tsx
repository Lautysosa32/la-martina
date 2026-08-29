import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from '../components/ProductCard';

export const Search: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 50000]);
  const [selectedBrands, setSelectedBrands] = React.useState<string[]>([]);
  const [sortBy, setSortBy] = React.useState('relevance');
  const [currentPage, setCurrentPage] = React.useState(1);
  const { adminProducts, getStock } = useAdmin();

  // 15 filas de productos por página según el ancho de pantalla
  const [itemsPerPage, setItemsPerPage] = React.useState(60);

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1600) {
        setItemsPerPage(75); // 5 cols * 15 filas = 75
      } else if (width >= 1024) {
        setItemsPerPage(60); // 4 cols * 15 filas = 60
      } else if (width >= 768) {
        setItemsPerPage(45); // 3 cols * 15 filas = 45
      } else {
        setItemsPerPage(30); // 2 cols * 15 filas = 30
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reiniciar a página 1 cuando cambia la búsqueda o los filtros
  React.useEffect(() => {
    setCurrentPage(1);
  }, [query, priceRange, selectedBrands, sortBy]);

  const baseResults = adminProducts.filter(product => 
    product.name?.toLowerCase().includes(query.toLowerCase()) ||
    product.brand?.toLowerCase().includes(query.toLowerCase()) ||
    product.categoryId?.toLowerCase().includes(query.toLowerCase())
  );

  // Obtener marcas únicas con conteo
  const brandCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    baseResults.forEach(p => {
      if (p.brand && p.brand.trim() !== '') {
        counts[p.brand] = (counts[p.brand] || 0) + 1;
      }
    });
    return counts;
  }, [baseResults]);

  const brands: string[] = Object.keys(brandCounts);

  const filteredResults = React.useMemo(() => {
    return baseResults
      .filter(p => p.price >= priceRange[0] && p.price <= priceRange[1])
      .filter(p => selectedBrands.length === 0 || selectedBrands.includes(p.brand))
      .sort((a, b) => {
        // Always push out-of-stock items to the end
        const stockA = getStock(a.id);
        const stockB = getStock(b.id);
        if (stockA <= 0 && stockB > 0) return 1;
        if (stockA > 0 && stockB <= 0) return -1;
        if (sortBy === 'price_asc') return a.price - b.price;
        if (sortBy === 'price_desc') return b.price - a.price;
        return 0;
      });
  }, [baseResults, priceRange, selectedBrands, sortBy, getStock]);

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredResults.length);
  const paginatedResults = filteredResults.slice(startIndex, endIndex);

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
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant/70 mb-2">
          <Link to="/" className="hover:text-primary transition-colors">Inicio</Link>
          <span>/</span>
          <span className="text-on-surface font-bold">Búsqueda</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-outline-variant/15 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-on-background tracking-tight">
              Resultados para "{query}"
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Explorá todos los productos que coinciden con tu búsqueda.
            </p>
          </div>
          <span className="text-xs font-bold text-on-surface-variant/80 bg-surface-container-high px-3 py-1.5 rounded-full w-fit">
            {filteredResults.length} {filteredResults.length === 1 ? 'producto encontrado' : 'productos encontrados'}
          </span>
        </div>
      </div>

      {/* Main Layout: Sidebar (Desktop) + Products Area */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* Desktop Sidebar Filters (Visible on lg+) */}
        {brands.length > 0 && (
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
            {brands.length > 0 && (
              <div className="border-t border-outline-variant/15 pt-5">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-3">
                  Marcas ({brands.length})
                </span>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                  {brands.map(brand => {
                    const isChecked = selectedBrands.includes(brand);
                    return (
                      <label
                        key={brand}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                          isChecked ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container-low text-on-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleBrand(brand)}
                            className="accent-primary w-4 h-4 rounded cursor-pointer"
                          />
                          <span className="truncate max-w-[140px]">{brand}</span>
                        </div>
                        <span className="text-[10px] text-on-surface-variant/60 font-normal">
                          ({brandCounts[brand]})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Right Content Area */}
        <div className="flex-1 w-full min-w-0">
          
          {/* Top Sort & Mobile Filter Trigger */}
          <div className="flex items-center justify-between bg-white p-3 sm:p-4 rounded-xl border border-outline-variant/15 shadow-xs mb-6">
            {/* Mobile Filter Button */}
            <button 
              onClick={() => setIsFilterOpen(true)}
              className="lg:hidden flex items-center gap-1.5 text-on-surface font-bold text-xs bg-surface-container-low px-3.5 py-2 rounded-full border border-outline-variant/20 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">filter_list</span> 
              <span>Filtros {selectedBrands.length > 0 && `(${selectedBrands.length})`}</span>
            </button>

            {/* Active filter badges on desktop */}
            <div className="hidden lg:flex flex-wrap items-center gap-2 flex-1 mr-4">
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

            {/* Sort Selector */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:inline text-xs text-on-surface-variant font-medium">Ordenar:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-1.5 font-bold text-xs sm:text-sm text-on-surface outline-none cursor-pointer"
              >
                <option value="relevance">Relevancia</option>
                <option value="price_asc">Menor Precio</option>
                <option value="price_desc">Mayor Precio</option>
              </select>
            </div>
          </div>

          {/* Product Grid */}
          {filteredResults.length > 0 ? (
            <>
              <div className="product-grid">
                {paginatedResults.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Controles de Paginación */}
              {totalPages > 1 && (
                <div className="mt-10 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-outline-variant/15 shadow-xs">
                  <span className="text-xs font-medium text-on-surface-variant">
                    Mostrando <strong className="text-on-surface">{startIndex + 1} - {endIndex}</strong> de <strong className="text-on-surface">{filteredResults.length}</strong> productos
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Anterior */}
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        currentPage === 1
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
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              currentPage === page
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
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        currentPage === totalPages
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
              <span className="material-symbols-outlined text-5xl mb-3 text-on-surface-variant/30">search_off</span>
              <p className="text-on-surface font-bold text-lg">No encontramos productos para "{query}"</p>
              <p className="text-on-surface-variant text-xs mt-1 max-w-sm mx-auto">Revisá la ortografía o intentá con términos más generales como "leche", "aceite" o "galletitas".</p>
              {hasActiveFilters && (
                <button 
                  onClick={clearFilters} 
                  className="mt-5 bg-primary text-white text-xs font-bold px-6 py-2.5 rounded-full hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setIsFilterOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[320px] bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center bg-primary text-white">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">filter_list</span>
                Filtros
              </h3>
              <button onClick={() => setIsFilterOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Rango de Precio */}
              <div>
                <h4 className="font-bold mb-3 flex justify-between items-center text-xs uppercase tracking-wider text-on-surface-variant">
                  Rango de Precio
                  <span className="text-primary normal-case font-black">${priceRange[1].toLocaleString('es-AR')}</span>
                </h4>
                <input 
                  type="range" min="0" max="50000" step="500"
                  value={priceRange[1]} 
                  onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-xs text-on-surface-variant mt-2 font-medium">
                  <span>$0</span>
                  <span>$50.000+</span>
                </div>
              </div>

              {/* Marcas */}
              <div>
                <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-on-surface-variant">Marcas</h4>
                <div className="flex flex-wrap gap-2">
                  {brands.map(brand => (
                    <button
                      key={brand}
                      onClick={() => toggleBrand(brand)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        selectedBrands.includes(brand)
                          ? 'bg-primary border-primary text-white shadow-xs'
                          : 'bg-white border-outline-variant/30 text-on-surface-variant hover:border-primary/50'
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant/20 bg-surface-container-lowest space-y-2">
              <button 
                onClick={() => setIsFilterOpen(false)}
                className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-all shadow-md cursor-pointer text-sm"
              >
                APLICAR FILTROS
              </button>
              <button 
                onClick={() => { clearFilters(); setIsFilterOpen(false); }}
                className="w-full text-on-surface-variant font-bold py-2 hover:bg-surface-container-low rounded-xl transition-all text-xs cursor-pointer"
              >
                Limpiar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
