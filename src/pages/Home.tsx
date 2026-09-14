import React from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../stores/useAuthStore';
import { ProductCarousel } from '../components/ProductCarousel';
import { ProductCard } from '../components/ProductCard';
import { HeroCarousel } from '../components/HeroCarousel';
import { productsService } from '../services/products.service';
import { Product } from '../types/product.types';

export const Home: React.FC = () => {
  const { applyOffersToCartItem, getStock, activeOffers } = useAdmin();
  const { currentCustomer } = useCart();
  const { isAuthenticated, user, customerProfile } = useAuth();
  const isUserLoggedIn = isAuthenticated || !!currentCustomer || !!customerProfile || (!!user?.phone && user.phone.length > 5);

  // Cantidad de productos requeridos para rellenar exactamente 10 filas:
  // Celular (<768px): 2 cols * 10 filas = 20 productos
  // Tablet (768px - 1023px): 3 cols * 10 filas = 30 productos
  // Computadora (>=1024px): 4 cols * 10 filas = 40 productos
  const [targetCount, setTargetCount] = React.useState(40);

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setTargetCount(40);
      } else if (width >= 768) {
        setTargetCount(30);
      } else {
        setTargetCount(20);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Estados locales para productos de la Home (Ahorro crítico de Egress)
  const [rawOffers, setRawOffers] = React.useState<Product[]>([]);
  const [rawFeatured, setRawFeatured] = React.useState<Product[]>([]);
  const [loadingFeatured, setLoadingFeatured] = React.useState(true);

  // 1. Cargar ofertas según promociones activas y productos con descuento
  React.useEffect(() => {
    let isMounted = true;
    productsService.getOffersProducts(25, activeOffers).then(res => {
      if (isMounted) setRawOffers(res);
    }).catch(console.error);

    return () => { isMounted = false; };
  }, [activeOffers]);

  // 2. Cargar destacados según targetCount (20 celular / 40 computadora = 10 filas)
  React.useEffect(() => {
    let isMounted = true;
    setLoadingFeatured(true);
    productsService.getFeaturedProducts(targetCount).then(res => {
      if (isMounted) {
        setRawFeatured(res);
        setLoadingFeatured(false);
      }
    }).catch(err => {
      console.error(err);
      if (isMounted) setLoadingFeatured(false);
    });

    return () => { isMounted = false; };
  }, [targetCount]);

  // Aplicar lógica de ofertas personalizadas: solo incluimos productos con beneficio o descuento real
  const productsWithOffers = React.useMemo(() => {
    const list: any[] = [];

    rawOffers
      .filter(p => {
        if (p.isPaused) return false;
        const availableStock = Math.max(Number(p.stock) || 0, getStock(p.id, p.stock));
        return availableStock > 0;
      })
      .forEach(p => {
        const basePrice = (p.originalPrice && p.originalPrice > p.price) ? p.originalPrice : p.price;
        const calc = applyOffersToCartItem(
          { productId: p.id, categoryId: p.categoryId, price: basePrice, quantity: 1 },
          currentCustomer,
          { forDisplay: true }
        );

        const hasCalcDiscount = calc.discountAmount > 0;
        const hasOriginalPrice = Boolean(p.originalPrice && p.originalPrice > p.price);
        const hasDiscountField = p.discount !== null && p.discount !== undefined && Number(p.discount) > 0;
        const hasOfferBadge = Boolean(p.badge && /(oferta|3x2|promo|descuento)/i.test(p.badge));

        if (hasCalcDiscount) {
          const discountPercentStr = basePrice > 0
            ? `-${Math.round((calc.discountAmount / basePrice) * 100)}%`
            : undefined;
          list.push({
            ...p,
            originalPrice: basePrice,
            price: calc.finalPrice,
            discount: discountPercentStr || p.discount || `-$${calc.discountAmount.toLocaleString('es-AR')}`,
            badge: calc.offerLabel || p.badge || 'Oferta',
            offerLabel: calc.offerLabel
          });
        } else if (hasOriginalPrice || hasDiscountField || hasOfferBadge) {
          list.push(p);
        }
      });

    return list;
  }, [rawOffers, applyOffersToCartItem, getStock, currentCustomer]);

  // Aplicar ofertas a destacados (para display a todos los visitantes)
  const featuredProducts = React.useMemo(() => {
    return rawFeatured
      .filter(p => {
        if (p.isPaused) return false;
        const availableStock = Math.max(Number(p.stock) || 0, getStock(p.id, p.stock));
        return availableStock > 0;
      })
      .slice(0, targetCount)
      .map(p => {
        const basePrice = (p.originalPrice && p.originalPrice > p.price) ? p.originalPrice : p.price;
        const calc = applyOffersToCartItem(
          { productId: p.id, categoryId: p.categoryId, price: basePrice, quantity: 1 },
          currentCustomer,
          { forDisplay: true }
        );
        if (calc.discountAmount > 0) {
          const discountPercentStr = basePrice > 0
            ? `-${Math.round((calc.discountAmount / basePrice) * 100)}%`
            : undefined;
          return {
            ...p,
            originalPrice: basePrice,
            price: calc.finalPrice,
            discount: discountPercentStr || p.discount || `-$${calc.discountAmount.toLocaleString('es-AR')}`,
            badge: calc.offerLabel || p.badge || 'Oferta',
            offerLabel: calc.offerLabel
          };
        }
        return p;
      });
  }, [rawFeatured, targetCount, applyOffersToCartItem, getStock, currentCustomer]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 animate-in fade-in duration-500">

      {/* Banner Calculadora en Local (Solo visible en móviles/tablets, oculto en PC) */}
      <section className="block lg:hidden">
        <Link
          to="/calculadora-compras"
          className="flex items-center justify-between bg-gradient-to-r from-surface-container-lowest via-white to-primary/5 p-3.5 sm:p-4 rounded-2xl shadow-xs border border-outline-variant/20 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary text-white shadow-md shadow-primary/20 shrink-0 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true" translate="no">calculate</span>
            </div>
            <div className="text-left">
              <p className="text-xs sm:text-sm text-on-surface font-black tracking-tight uppercase flex items-center gap-1.5 whitespace-nowrap">
                <span>¡CALCULÁ TU COMPRA EN EL LOCAL!</span>
              </p>
              <p className="text-[11px] sm:text-xs text-on-surface-variant/90 font-medium leading-snug mt-0.5 max-w-sm">
                Escaneá tus productos mientras comprás y<br className="hidden xxs:inline" /> controlá tu gasto antes de pasar por caja.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-primary font-bold text-xs bg-primary/10 px-2.5 sm:px-3.5 py-2 rounded-xl group-hover:bg-primary group-hover:text-white transition-all shrink-0 ml-1">
            <span className="hidden sm:inline">Usar</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </div>
        </Link>
      </section>

      {/* Hero Banner Carousel */}
      <HeroCarousel />

      {/* Explorar Categorías */}
      <section className="mt-4">
        <div className="mb-4 flex justify-between items-end">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold">
              Nuestras Categorías
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Encontrá rápidamente lo que necesitás</p>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
          {[
            { id: 'almacen', name: 'Almacén', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCWUOCTkqhlUgYy_xu3NGmfb56WQRL8UV1o_-f25G8H6URHltBsZyVnPpWuBMzOHfJMdTv_2NUJDwwoBxs1lAVabTMcsatMbf8Y3TEqQosk7JwccSFl8jfmm9-0sKHw8V-t5_UTarjHoWtt34wTQ52ZVx92DlDsJ64tUgl4xB0Hz_t6u7SnzfuAGbi2wdvz65yVnvcmDBRUKIuWjHzZ-juL24kQUp3RLILMWNBHhqXH2zxggaQ-D67zsJv3VCExRLtXRzx2NX_gk6b3' },
            { id: 'bebidas', name: 'Bebidas', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCOducrLPS-H_2ZB1GIL_jmKXYKzr2IPHQ08Rps1TLqWQSvs7htEPb8_E_DJ0InRWr-jMqvTjgLYsKzaSHGVqhldbiUAifPTLT5msNjluywcgDr6QRxsdT3wmunD7AG7zHRZqqjuLmmY8me4uL5dnAIoFocKnEYNHSL3ZDEX3F899nL2cZVszAjiYTtfVfdtAxzEMHlKvCyx71_nc3vaC3sjaj8W2g3dfFrwtNJRXsQh03NFzTmzUnkcazrjXyjfJFR9UCKuTDt52so' },
            { id: 'carnes', name: 'Carnes', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB4BbH2r3CvJz-VPiX-rANZKyzJS-_9C7u_utA_HUVlB3VbNHkgK3p5gaDGZTebIOTCtAs6AJcwiHmyP077iw9vYrH1LsvYKSZcYejZSlZSTYeqAYMi9lteCq9el2bK0mMfJEpqWf-f5RkDblQ0a6XMZDL9TIWgdHm2u3seLDJltmP6Vy-pKjqNQk-bdzjt1psYkZlLEnoteV4VvYRKopePQck3ToEKzIWp9nYzmvYYwePloHevmv0dXtBbawgFgSC6ZoWEp1s3XhAQ' },
            { id: 'lacteos', name: 'Lácteos', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPj1sG_Zc3G_N6W9CYVZZvCmHqsbXOTn43V13to-LDPlBmgjf47r9QpN8RHwTDC3afxy88Xf2PRSWfuiSZwKr-w0JFF5wsXhE-wuR1_gcyAooHIq1gUDgssclbwFufjzGysAnSo2q-9nHEail3EeDANUwQS0GSCbWMAHPwnOK-d327yQA0K6CNPrVtFC056YEO5zwM3wsgTxhyIf1lU4lKHvYEDMMNfZZ3jmUM0bc300z3B6-kUCM_9VhFMGvsvEvBD2y_kx-g1As3' },
            { id: 'limpieza', name: 'Limpieza', img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400' },
            { id: 'perfumeria', name: 'Perfumería', img: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=400' }
          ].map(cat => (
            <Link
              key={cat.id}
              to={`/category/${cat.id}`}
              className="flex flex-col items-center group p-3 bg-white rounded-2xl border border-outline-variant/10 shadow-xs hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-[#f5f0ee] mb-2 sm:mb-3 overflow-hidden shadow-xs flex items-center justify-center p-1 relative">
                <img src={cat.img} alt={cat.name} aria-hidden="true" className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform duration-300" />
              </div>
              <span className="font-body-md text-on-surface font-bold text-center text-xs sm:text-sm group-hover:text-primary transition-colors leading-tight">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Ofertas Relámpago Carousel (Mostrado a todos los visitantes) */}
      {productsWithOffers.length > 0 ? (
        <ProductCarousel
          title="Ofertas Relámpago"
          badgeText="Beneficio Exclusivo Registrados"
          subtitle={
            isAuthenticated
              ? (currentCustomer?.name
                  ? `¡Hola ${currentCustomer.name.split(' ')[0]}! Beneficios exclusivos aplicados a tu cuenta.`
                  : 'Beneficios exclusivos aplicados a tu cuenta de cliente registrado.')
              : 'Registrate o iniciá sesión gratis para aplicar estos descuentos en tu compra'
          }
          products={productsWithOffers.slice(0, 25)}
        />
      ) : (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold flex items-center gap-2">
              <span>Ofertas Relámpago</span>
            </h2>
            <span className="bg-primary/10 text-primary text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-primary/20">
              Beneficio Martina Club
            </span>
          </div>
          <div className="bg-white rounded-2xl p-6 sm:p-8 text-center border border-outline-variant/15 shadow-xs">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl text-primary flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[26px]" aria-hidden="true" translate="no">local_offer</span>
            </div>
            <p className="text-on-surface font-bold text-sm sm:text-base">
              Pronto sumaremos nuevas Ofertas Relámpago
            </p>
            <p className="text-on-surface-variant text-xs mt-1.5 max-w-md mx-auto leading-relaxed">
              {isAuthenticated
                ? 'Estamos preparando nuevas promociones especiales para miembros de Martina Club. ¡Volvé a consultar pronto!'
                : 'Creá tu cuenta gratis para ser el primero en aprovechar los descuentos exclusivos cuando estén activos.'}
            </p>
            {!isAuthenticated && (
              <div className="mt-4 flex items-center justify-center">
                <Link
                  to="/profile"
                  className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  <span>Registrarme / Iniciar Sesión</span>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Productos Destacados en Grid (20 en móvil / 40 en desktop = 10 filas) */}
      <section className="mt-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold">
              Productos Destacados
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Los favoritos de nuestros clientes</p>
          </div>
        </div>

        {loadingFeatured ? (
          <div className="product-grid">
            {Array.from({ length: Math.min(targetCount, 8) }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-3 border border-outline-variant/10 animate-pulse flex flex-col h-72">
                <div className="w-full aspect-square bg-surface-container-low rounded-lg mb-3"></div>
                <div className="h-3 bg-surface-container rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-surface-container rounded w-3/4 mb-4"></div>
                <div className="h-6 bg-surface-container rounded w-1/2 mt-auto"></div>
              </div>
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="product-grid">
            {featuredProducts.map(product => (
              <ProductCard key={product.id} product={product as any} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center border border-outline-variant/15 shadow-xs">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl text-primary flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[26px]" aria-hidden="true" translate="no">inventory_2</span>
            </div>
            <p className="text-on-surface font-bold text-sm sm:text-base">
              No hay productos destacados activos en este momento
            </p>
            <p className="text-on-surface-variant text-xs mt-1.5 max-w-md mx-auto leading-relaxed">
              Los productos se mostrarán aquí en cuanto estén habilitados y cuenten con stock disponible.
            </p>
          </div>
        )}
      </section>

    </div>
  );
};
