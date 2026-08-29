import React, { useRef, useState, useEffect } from 'react';
import { Product } from '../data/mockData';
import { ProductCard } from './ProductCard';

interface ProductCarouselProps {
  title: string;
  products: Product[];
}

/**
 * Devuelve cuántos productos mostrar por slide según el ancho de pantalla:
 *   < 768px  → 4  (2×2)
 *   768–1023px → 6  (3×2)
 *   ≥ 1024px  → 8  (4×2)
 */
function useItemsPerPage(): number {
  const getItems = () => {
    if (window.innerWidth >= 1024) return 8;
    if (window.innerWidth >= 768) return 6;
    return 4;
  };

  const [items, setItems] = useState<number>(getItems);

  useEffect(() => {
    const handler = () => setItems(getItems());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return items;
}

/**
 * Devuelve cuántas columnas usar en el grid del slide según el ancho de pantalla.
 */
function useGridCols(): number {
  const getCols = () => {
    if (window.innerWidth >= 1024) return 4;
    if (window.innerWidth >= 768) return 3;
    return 2;
  };

  const [cols, setCols] = useState<number>(getCols);

  useEffect(() => {
    const handler = () => setCols(getCols());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return cols;
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({ title, products }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsPerPage = useItemsPerPage();
  const gridCols = useGridCols();

  // Chunk products into groups of itemsPerPage for the grid slides
  const productChunks: Product[][] = [];
  for (let i = 0; i < products.length; i += itemsPerPage) {
    productChunks.push(products.slice(i, i + itemsPerPage));
  }
  const totalPages = productChunks.length;

  // Reset to first page when itemsPerPage changes (breakpoint crossed)
  useEffect(() => {
    setActiveIndex(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'instant' });
    }
  }, [itemsPerPage]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const index = Math.round((scrollLeft / (scrollWidth - clientWidth)) * (totalPages - 1));
      if (!isNaN(index) && index >= 0) {
        setActiveIndex(index);
      }
    }
  };

  const scrollToPage = (pageIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    if (scrollRef.current) {
      const { scrollWidth, clientWidth } = scrollRef.current;
      const scrollAmount = (clampedIndex * (scrollWidth - clientWidth)) / (totalPages - 1 || 1);
      scrollRef.current.scrollTo({
        left: scrollAmount,
        behavior: 'smooth'
      });
      setActiveIndex(clampedIndex);
    }
  };

  const handlePrev = () => {
    scrollToPage(activeIndex - 1);
  };

  const handleNext = () => {
    scrollToPage(activeIndex + 1);
  };

  // Inline style para el grid-template-columns del slide
  const slideGridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
  };

  return (
    <section className="mt-10 relative">
      {/* Header with Title and Desktop Arrows */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold flex items-center gap-2">
          <span>{title}</span>
        </h2>

        {/* Desktop Header Navigation Controls */}
        {totalPages > 1 && (
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={activeIndex === 0}
              aria-label="Página anterior"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                activeIndex === 0
                  ? 'border-outline-variant/20 text-on-surface-variant/30 cursor-not-allowed bg-transparent'
                  : 'border-outline-variant/40 bg-white text-on-surface hover:bg-primary hover:text-white hover:border-primary shadow-xs'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <span className="text-xs font-bold text-on-surface-variant px-1">
              {activeIndex + 1} / {totalPages}
            </span>
            <button
              onClick={handleNext}
              disabled={activeIndex >= totalPages - 1}
              aria-label="Página siguiente"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                activeIndex >= totalPages - 1
                  ? 'border-outline-variant/20 text-on-surface-variant/30 cursor-not-allowed bg-transparent'
                  : 'border-outline-variant/40 bg-white text-on-surface hover:bg-primary hover:text-white hover:border-primary shadow-xs'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative group">
        {/* Floating Side Arrows (Desktop Hover) */}
        {totalPages > 1 && activeIndex > 0 && (
          <button
            onClick={handlePrev}
            aria-label="Slide anterior"
            className="hidden lg:flex absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 text-on-surface rounded-full shadow-lg border border-outline-variant/20 items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-primary hover:text-white transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">chevron_left</span>
          </button>
        )}

        {totalPages > 1 && activeIndex < totalPages - 1 && (
          <button
            onClick={handleNext}
            aria-label="Slide siguiente"
            className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 text-on-surface rounded-full shadow-lg border border-outline-variant/20 items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-primary hover:text-white transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]">chevron_right</span>
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-6 pb-4"
        >
          {productChunks.map((chunk, chunkIdx) => (
            <div
              key={chunkIdx}
              className="snap-start shrink-0 w-full grid gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-5 px-1"
              style={slideGridStyle}
            >
              {chunk.map((product) => (
                <div key={product.id} className="w-full">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Dots */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-2">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => scrollToPage(idx)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                activeIndex === idx
                  ? 'w-6 bg-primary opacity-100'
                  : 'w-2 bg-primary opacity-30 hover:opacity-50'
              }`}
              aria-label={`Ir a página ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

