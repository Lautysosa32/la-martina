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
    if (scrollRef.current) {
      const { scrollWidth, clientWidth } = scrollRef.current;
      const scrollAmount = (pageIndex * (scrollWidth - clientWidth)) / (totalPages - 1);
      scrollRef.current.scrollTo({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Inline style para el grid-template-columns del slide
  const slideGridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
  };

  return (
    <section className="mt-10">
      <h2 className="font-headline-lg text-headline-lg text-[25px] text-on-background font-bold mb-4">
        {title}
      </h2>

      <div className="relative group">
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
              className={`h-2 rounded-full transition-all duration-300 ${activeIndex === idx
                ? 'w-6 bg-primary opacity-100'
                : 'w-2 bg-primary opacity-30 hover:opacity-50'
                }`}
              aria-label={`Go to page ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
