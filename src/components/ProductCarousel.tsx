import React, { useRef, useState, useEffect } from 'react';
import { Product } from '../data/mockData';
import { ProductCard } from './ProductCard';

interface ProductCarouselProps {
  title: string;
  products: Product[];
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({ title, products }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsPerPage = 4;

  // Chunk products into groups of 4 for the 2x2 grid slides
  const productChunks = [];
  for (let i = 0; i < products.length; i += itemsPerPage) {
    productChunks.push(products.slice(i, i + itemsPerPage));
  }
  const totalPages = productChunks.length;

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
              className="snap-start shrink-0 w-full grid grid-cols-2 gap-x-4 gap-y-6 px-1"
              style={{ gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }}
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
