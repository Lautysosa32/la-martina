import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdmin, HeroBanner, defaultHeroBanners } from '../context/AdminContext';

export const HeroCarousel: React.FC = () => {
  const { heroBanners } = useAdmin();
  const navigate = useNavigate();

  // Filtrar banners activos y ordenados
  const activeBanners = React.useMemo(() => {
    const list = (heroBanners && heroBanners.length > 0 ? heroBanners : defaultHeroBanners)
      .filter(b => b.active)
      .sort((a, b) => a.order - b.order);
    return list.length > 0 ? list : defaultHeroBanners;
  }, [heroBanners]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [dragDistance, setDragDistance] = useState(0);
  const isSwipingRef = useRef(false);

  // Asegurar que el índice no quede fuera de rango
  useEffect(() => {
    if (currentIndex >= activeBanners.length) {
      setCurrentIndex(0);
    }
  }, [activeBanners.length, currentIndex]);

  const nextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % activeBanners.length);
  }, [activeBanners.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + activeBanners.length) % activeBanners.length);
  }, [activeBanners.length]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  // Autoplay con temporizador
  useEffect(() => {
    if (isPaused || activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 5500);

    return () => clearInterval(interval);
  }, [isPaused, activeBanners.length, nextSlide]);

  // Manejo de Redirección
  const handleBannerClick = (banner: HeroBanner, e: React.MouseEvent) => {
    // Si fue un swipe, evitamos el click
    if (isSwipingRef.current) {
      isSwipingRef.current = false;
      return;
    }

    if (!banner.linkUrl) return;

    const url = banner.linkUrl.trim();
    if (!url) return;

    const isExternal = banner.linkExternal || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('www.');

    if (isExternal) {
      const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    } else {
      navigate(url);
    }
  };

  // Gestos táctiles (Swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(e.targetTouches[0].clientX);
    setDragDistance(0);
    isSwipingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.targetTouches[0].clientX;
    setTouchEndX(currentX);
    const diff = currentX - touchStartX;
    setDragDistance(diff);
    if (Math.abs(diff) > 10) {
      isSwipingRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    if (touchStartX !== null && touchEndX !== null) {
      const diff = touchStartX - touchEndX;
      const threshold = 50; // Mínimo de px para considerar swipe
      if (diff > threshold) {
        nextSlide();
      } else if (diff < -threshold) {
        prevSlide();
      }
    }
    setTouchStartX(null);
    setTouchEndX(null);
    setDragDistance(0);
    setTimeout(() => {
      isSwipingRef.current = false;
    }, 100);
  };

  const currentBanner = activeBanners[currentIndex] || activeBanners[0];
  const hasMultiple = activeBanners.length > 1;

  if (!currentBanner) return null;

  return (
    <section className="relative w-full select-none" aria-label="Banners promocionales">
      <div
        className="relative w-full h-[230px] xxs:h-[260px] sm:h-[340px] md:h-[400px] lg:h-[440px] rounded-3xl overflow-hidden shadow-md bg-surface-variant group"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slides */}
        {activeBanners.map((banner, index) => {
          const isActive = index === currentIndex;
          const hasContent = Boolean(banner.title || banner.subtitle || banner.badge || banner.linkLabel);
          const hasLink = Boolean(banner.linkUrl);

          return (
            <div
              key={banner.id}
              onClick={(e) => hasLink && handleBannerClick(banner, e)}
              className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              } ${hasLink ? 'cursor-pointer' : ''}`}
            >
              {/* Imagen de Fondo */}
              <img
                src={banner.imageUrl}
                alt={banner.title || 'Banner La Martina'}
                className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-1000 ease-out"
                style={{
                  transform: isActive ? 'scale(1)' : 'scale(1.04)',
                }}
                loading={index === 0 ? 'eager' : 'lazy'}
              />

              {/* Degradado Overlay (solo si tiene texto o para contraste sutil) */}
              <div
                className={`absolute inset-0 z-10 transition-opacity duration-500 ${
                  hasContent
                    ? 'bg-gradient-to-r from-black/90 via-black/55 to-black/10 sm:from-black/85 sm:via-black/45 sm:to-transparent'
                    : 'bg-black/10'
                }`}
              />

              {/* Contenido Textual Overlay */}
              {hasContent && (
                <div className="relative z-20 h-full flex flex-col justify-center px-6 sm:px-10 md:px-14 max-w-2xl text-white">
                  {banner.badge && (
                    <span className="inline-flex items-center gap-1.5 bg-secondary-container/95 text-on-secondary-container font-label-sm px-3 py-1 rounded-full mb-2.5 sm:mb-3 font-extrabold tracking-wider uppercase text-[10px] sm:text-xs shadow-xs w-fit backdrop-blur-xs animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <span className="material-symbols-outlined text-[13px] sm:text-[14px]">verified</span>
                      {banner.badge}
                    </span>
                  )}

                  {banner.title && (
                    <h1 className="font-display-xl text-xl xxs:text-2xl sm:text-4xl md:text-5xl font-black leading-tight mb-2 sm:mb-3 text-white drop-shadow-sm line-clamp-2 animate-in fade-in slide-in-from-bottom-3 duration-500">
                      {banner.title}
                    </h1>
                  )}

                  {banner.subtitle && (
                    <p className="font-body-md text-xs sm:text-base md:text-lg mb-4 sm:mb-6 opacity-90 text-white/95 leading-snug line-clamp-2 sm:line-clamp-3 max-w-xl drop-shadow-xs animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {banner.subtitle}
                    </p>
                  )}

                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-500">
                    {banner.linkLabel && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBannerClick(banner, e);
                        }}
                        className="bg-primary text-white font-label-sm px-5 py-2.5 sm:px-7 sm:py-3 rounded-full hover:bg-primary/90 transition-all flex items-center space-x-2 text-xs sm:text-sm font-bold shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        <span>{banner.linkLabel}</span>
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]" aria-hidden="true">
                          arrow_forward
                        </span>
                      </button>
                    )}

                    {/* Botón secundario fijo de envíos si es el slide principal */}
                    {index === 0 && !banner.linkLabel && (
                      <Link
                        to="/category/almacen"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-primary text-white font-label-sm px-6 py-2.5 sm:px-7 sm:py-3 rounded-full hover:bg-primary/90 transition-all flex items-center space-x-2 text-xs sm:text-sm font-bold shadow-md hover:scale-105"
                      >
                        <span>Comprar Ahora</span>
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </Link>
                    )}

                    {index === 0 && (
                      <Link
                        to="/delivery"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white/20 backdrop-blur-xs text-white border border-white/30 font-label-sm px-4 py-2.5 sm:px-6 sm:py-3 rounded-full hover:bg-white hover:text-on-surface transition-all flex items-center space-x-1.5 text-xs sm:text-sm font-bold"
                      >
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">local_shipping</span>
                        <span>Envíos</span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Flechas de Navegación (Prev / Next) */}
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevSlide();
              }}
              aria-label="Banner anterior"
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/35 hover:bg-black/65 text-white backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chevron_left</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextSlide();
              }}
              aria-label="Siguiente banner"
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/35 hover:bg-black/65 text-white backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chevron_right</span>
            </button>
          </>
        )}

        {/* Indicadores / Dots */}
        {hasMultiple && (
          <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-md border border-white/15">
            {activeBanners.map((_, idx) => {
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToSlide(idx);
                  }}
                  aria-label={`Ir al banner ${idx + 1}`}
                  className={`h-2 sm:h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                    isCurrent
                      ? 'w-6 sm:w-8 bg-white shadow-sm'
                      : 'w-2 sm:w-2.5 bg-white/50 hover:bg-white/80'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
