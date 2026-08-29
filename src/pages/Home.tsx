import React from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { ProductCarousel } from '../components/ProductCarousel';
import { ProductCard } from '../components/ProductCard';

export const Home: React.FC = () => {
  const { adminProducts: products, applyOffersToCartItem, getTopSellingProducts, getStock } = useAdmin();

  const productsWithOffers = React.useMemo(() => {
    return products
      .filter(p => getStock(p.id) > 0)
      .map(p => {
        // Simulate adding 1 item to check for discounts
        const calc = applyOffersToCartItem({ productId: p.id, categoryId: p.categoryId, price: p.price, quantity: 1 });
        if (calc.discountAmount > 0) {
          // Return a mapped product that ProductCard will render as discounted
          return { ...p, originalPrice: p.price, price: calc.finalPrice, offerLabel: calc.offerLabel };
        }
        return p.originalPrice ? p : null; // Fallback to hardcoded mock data if present
      }).filter(Boolean) as any[];
  }, [products, applyOffersToCartItem, getStock]);

  // Detectamos el ancho de pantalla para saber cuántos productos requerimos para rellenar exactamente 15 filas:
  // Celular (<768px): 2 cols * 15 filas = 30 productos
  // Tablet (768px - 1023px): 3 cols * 15 filas = 45 productos
  // Computadora (>=1024px): 4 cols * 15 filas = 60 productos
  // Pantallas XL (>=1600px): 5 cols * 15 filas = 75 productos
  const [targetCount, setTargetCount] = React.useState(60);

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1600) {
        setTargetCount(75);  // 5 columnas * 15 filas
      } else if (width >= 1024) {
        setTargetCount(60);  // 4 columnas * 15 filas
      } else if (width >= 768) {
        setTargetCount(45);  // 3 columnas * 15 filas
      } else {
        setTargetCount(30);  // 2 columnas * 15 filas
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Vinculado totalmente con el backend/analíticas.
  // Obtiene los más vendidos y autocompleta el resto aleatoriamente de los demás productos del catálogo (excluyendo sin stock).
  const featuredProducts = React.useMemo(() => {
    const inStockProducts = products.filter(p => getStock(p.id) > 0);
    const top = getTopSellingProducts(30)
      .map(item => item.product)
      .filter(p => getStock(p.id) > 0);

    // Si ya cubrimos o superamos el target count, devolvemos los más vendidos recortados
    if (top.length >= targetCount) {
      return top.slice(0, targetCount);
    }

    // Set de IDs existentes para evitar duplicados
    const existingIds = new Set(top.map(p => p.id));
    const remainingCount = targetCount - top.length;

    // Filtrar los productos del catálogo que no estén ya en la lista de más vendidos y que tengan stock disponible
    const availablePool = inStockProducts.filter(p => !existingIds.has(p.id));

    // Si no hay suficientes productos en el pool, simplemente tomamos lo que hay
    if (availablePool.length <= remainingCount) {
      return [...top, ...availablePool];
    }

    // Seleccionar aleatoriamente
    const shuffled = [...availablePool].sort(() => 0.5 - Math.random());
    const randomPick = shuffled.slice(0, remainingCount);

    return [...top, ...randomPick];
  }, [products, getTopSellingProducts, targetCount, getStock]);


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

      {/* Hero Banner */}
      <section>
        <div className="relative w-full h-[220px] sm:h-[320px] md:h-[380px] lg:h-[420px] rounded-3xl overflow-hidden shadow-md flex items-center bg-surface-variant">
          <img
            src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1600"
            alt="La Martina Supermercado"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent z-10" />

          <div className="relative z-20 px-6 sm:px-10 md:px-14 max-w-2xl text-white">
            <span className="inline-flex items-center gap-1.5 bg-secondary-container text-on-secondary-container font-label-sm px-3 py-1 rounded-full mb-3 font-extrabold tracking-wider uppercase text-[10px] sm:text-xs shadow-xs">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              Calidad y Frescura Garantizada
            </span>
            <h1 className="font-display-xl text-2xl sm:text-4xl md:text-5xl font-black leading-tight mb-3 text-white">
              Tu Supermercado de Confianza
            </h1>
            <p className="font-body-md text-xs sm:text-base md:text-lg mb-6 opacity-90 text-white/90 leading-snug hidden sm:block max-w-xl">
              Cortes seleccionados, lácteos, bebidas y las mejores marcas a precios directos en tu mesa.
            </p>
            <div className="flex items-center gap-3">
              <Link
                to="/category/almacen"
                className="bg-primary text-white font-label-sm px-6 py-2.5 sm:px-7 sm:py-3 rounded-full hover:bg-primary/90 transition-all flex items-center space-x-2 text-xs sm:text-sm font-bold shadow-md hover:scale-105"
              >
                <span>Comprar Ahora</span>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true" translate="no">arrow_forward</span>
              </Link>
              <Link
                to="/delivery"
                className="bg-white/20 backdrop-blur-xs text-white border border-white/30 font-label-sm px-5 py-2.5 sm:px-6 sm:py-3 rounded-full hover:bg-white hover:text-on-surface transition-all flex items-center space-x-1.5 text-xs sm:text-sm font-bold"
              >
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                <span>Envíos</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

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

      {/* Ofertas Relámpago Carousel */}
      {productsWithOffers.length > 0 ? (
        <ProductCarousel
          title="Ofertas Relámpago"
          products={productsWithOffers.slice(0, 16)}
        />
      ) : (
        <section className="mt-8">
          <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold mb-4">Ofertas Relámpago</h2>
          <div className="bg-white rounded-2xl p-8 text-center border border-outline-variant/15 shadow-xs">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block" aria-hidden="true" translate="no">local_offer</span>
            <p className="text-on-surface-variant font-bold">No hay ofertas activas en este momento</p>
            <p className="text-on-surface-variant/60 text-xs mt-1">¡Volvé pronto para ver nuestras promociones especiales!</p>
          </div>
        </section>
      )}

      {/* Productos Destacados en Grid de Productos */}
      <section className="mt-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-[22px] sm:text-[25px] text-on-background font-bold">
              Productos Destacados
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Los favoritos de nuestros clientes</p>
          </div>
        </div>

        <div className="product-grid">
          {featuredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

    </div>
  );
};
