import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from '../components/ProductCard';

export const Search: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [priceRange, setPriceRange] = React.useState<[number, number]>([0, 50000]);
  const [selectedBrands, setSelectedBrands] = React.useState<string[]>([]);
  const [sortBy, setSortBy] = React.useState('relevance');
  const { adminProducts, getStock } = useAdmin();

  const baseResults = adminProducts.filter(product => 
    product.name.toLowerCase().includes(query.toLowerCase()) ||
    product.brand.toLowerCase().includes(query.toLowerCase()) ||
    product.categoryId.toLowerCase().includes(query.toLowerCase())
  );

  const brands: string[] = Array.from(new Set(baseResults.map(p => p.brand || ''))).filter(b => b !== '') as string[];

  const filteredResults = baseResults
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

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  return (
    <div className="relative">
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
        <div className="mb-6">
          <h1 className="text-[25px] font-bold text-on-background mb-2">
            Resultados para "{query}"
          </h1>
          <p className="text-on-surface-variant text-base">
            Encontramos {filteredResults.length} {filteredResults.length === 1 ? 'producto' : 'productos'} que coinciden.
          </p>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center justify-between py-4 border-y border-outline-variant/30 mb-8">
          <button 
            onClick={() => setIsFilterOpen(true)}
            className="flex items-center gap-2 text-on-surface font-bold text-sm bg-surface-container-low px-4 py-2 rounded-full border border-outline-variant/20"
          >
            <span className="material-symbols-outlined text-[20px]">filter_list</span> 
            Filtrar {selectedBrands.length > 0 && `(${selectedBrands.length})`}
          </button>

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent border-none font-bold text-sm text-on-surface-variant outline-none cursor-pointer"
          >
            <option value="relevance">Relevancia</option>
            <option value="price_asc">Menor Precio</option>
            <option value="price_desc">Mayor Precio</option>
          </select>
        </div>

        {filteredResults.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
            {filteredResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/30">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4">search_off</span>
            <p className="text-on-surface-variant text-lg">No encontramos nada que coincida.</p>
            <button onClick={() => {setSelectedBrands([]); setPriceRange([0, 50000])}} className="mt-4 text-primary font-bold hover:underline">Limpiar filtros</button>
          </div>
        )}
      </div>

      {/* Filter Drawer */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[320px] bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
              <h3 className="text-xl font-bold">Filtros</h3>
              <button onClick={() => setIsFilterOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div>
                <h4 className="font-bold mb-4 flex justify-between items-center text-sm uppercase tracking-wider text-on-surface-variant">
                  Rango de Precio
                  <span className="text-primary normal-case tracking-normal">${priceRange[1].toLocaleString()}</span>
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

              <div>
                <h4 className="font-bold mb-4 text-sm uppercase tracking-wider text-on-surface-variant">Marcas</h4>
                <div className="flex flex-wrap gap-2">
                  {brands.map((brand: string) => (
                    <button
                      key={brand}
                      onClick={() => toggleBrand(brand)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                        selectedBrands.includes(brand)
                          ? 'bg-primary border-primary text-white shadow-md'
                          : 'bg-white border-outline-variant/30 text-on-surface-variant hover:border-primary/50'
                      }`}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-outline-variant/20 bg-surface-container-lowest">
              <button 
                onClick={() => setIsFilterOpen(false)}
                className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 transition-all shadow-md"
              >
                APLICAR FILTROS
              </button>
              <button 
                onClick={() => {setSelectedBrands([]); setPriceRange([0, 50000]); setIsFilterOpen(false)}}
                className="w-full text-on-surface-variant font-bold py-3 mt-2 hover:bg-surface-container-low rounded-xl transition-all"
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
