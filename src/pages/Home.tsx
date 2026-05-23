import React from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { ProductCarousel } from '../components/ProductCarousel';


export const Home: React.FC = () => {
  const { adminProducts: products } = useAdmin();
  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-4 flex flex-col gap-1">


      <section className="mb-3">
        <Link to="/calculadora-compras" className="flex items-center space-x-3 bg-surface-container-lowest p-3 rounded-xl shadow-sm border border-outline-variant/20 cursor-pointer hover:bg-surface-bright transition-colors">
          <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-white animate-pulse shrink-0">
            <span className="material-symbols-outlined text-primary text-[20px]">calculate</span>
          </div>
          <div className="flex-1 text-left">
            <p className="font-label-sm text-[13px] text-on-surface font-bold tracking-tight uppercase flex items-center">
              ¡CALCULÁ TU COMPRA EN EL LOCAL! <span className="text-primary ml-1 material-symbols-outlined text-[16px]">chevron_right</span>
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1 font-medium leading-tight">
              Escaneá tus productos mientras comprás y controlá tu gasto antes de pasar por caja.
            </p>
          </div>
        </Link>
      </section>

      {/* Hero Banner */}
      <section>
        <div className="relative w-full h-[400px] md:h-[400px] rounded-xl overflow-hidden shadow-sm flex items-center bg-surface-variant">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCGKrpE0YcIwZeIu5GDXL8WnwZf5Qs0PHtEBMC-wP_3sLjV4h_1gwWX2QPaU-MaSSEPyO5Bqv8SNuB0nPGyuynOcK098TUtm49AY4vl4Zw8XUbi3rCHYRYan-jSwlDLvnFVFOPZeUa0Xhvou3SP343pAgxEblnSGXjrmsH8oF1EugpLbaGBKvjtSRDCAKAlL7rVzHlM-5AmBstRztUsNXzMV0Nyw9SAHxpZQzxXWrcSJ7wSCIG3ez5sJmGxw8i1XjhXFmmkJxamIW0z"
            alt="Fresh Produce"
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-on-background/80 via-on-background/50 to-transparent z-10" />

          <div className="relative z-20 px-6 md:px-12 max-w-xl text-surface-container-lowest">
            <span className="inline-block bg-secondary-container text-on-secondary-container font-label-sm px-3 py-1 rounded-full mb-4 font-bold tracking-wide uppercase">
              New Arrivals
            </span>
            <h1 className="font-display-xl text-display-xl mb-4 text-white">Curated Freshness</h1>
            <p className="font-body-lg text-body-lg mb-8 opacity-90 text-white">
              Experience the finest selection of organic produce and artisanal goods, handpicked for your culinary journey.
            </p>
            <button className="bg-primary text-white font-label-sm px-8 py-3 rounded-full hover:bg-primary/90 transition-colors flex items-center space-x-2">
              <span>Shop Now</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      {/* Explorar Categorías */}
      <section className="mt-10">
        <div className="mb-5 flex justify-between items-end">
          <h2 className="font-headline-lg text-headline-lg text-[25px] text-on-background font-bold">Nuestras Categorías</h2>
        </div>

        <div className="grid grid-cols-3 gap-y-5 gap-x-4 md:grid-cols-6 md:gap-x-6 pb-4">
          {[
            { id: 'almacen', name: 'Almacén', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCWUOCTkqhlUgYy_xu3NGmfb56WQRL8UV1o_-f25G8H6URHltBsZyVnPpWuBMzOHfJMdTv_2NUJDwwoBxs1lAVabTMcsatMbf8Y3TEqQosk7JwccSFl8jfmm9-0sKHw8V-t5_UTarjHoWtt34wTQ52ZVx92DlDsJ64tUgl4xB0Hz_t6u7SnzfuAGbi2wdvz65yVnvcmDBRUKIuWjHzZ-juL24kQUp3RLILMWNBHhqXH2zxggaQ-D67zsJv3VCExRLtXRzx2NX_gk6b3' },
            { id: 'bebidas', name: 'Bebidas', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCOducrLPS-H_2ZB1GIL_jmKXYKzr2IPHQ08Rps1TLqWQSvs7htEPb8_E_DJ0InRWr-jMqvTjgLYsKzaSHGVqhldbiUAifPTLT5msNjluywcgDr6QRxsdT3wmunD7AG7zHRZqqjuLmmY8me4uL5dnAIoFocKnEYNHSL3ZDEX3F899nL2cZVszAjiYTtfVfdtAxzEMHlKvCyx71_nc3vaC3sjaj8W2g3dfFrwtNJRXsQh03NFzTmzUnkcazrjXyjfJFR9UCKuTDt52so' },
            { id: 'carnes', name: 'Carnes', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB4BbH2r3CvJz-VPiX-rANZKyzJS-_9C7u_utA_HUVlB3VbNHkgK3p5gaDGZTebIOTCtAs6AJcwiHmyP077iw9vYrH1LsvYKSZcYejZSlZSTYeqAYMi9lteCq9el2bK0mMfJEpqWf-f5RkDblQ0a6XMZDL9TIWgdHm2u3seLDJltmP6Vy-pKjqNQk-bdzjt1psYkZlLEnoteV4VvYRKopePQck3ToEKzIWp9nYzmvYYwePloHevmv0dXtBbawgFgSC6ZoWEp1s3XhAQ' },
            { id: 'lacteos', name: 'Lácteos', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPj1sG_Zc3G_N6W9CYVZZvCmHqsbXOTn43V13to-LDPlBmgjf47r9QpN8RHwTDC3afxy88Xf2PRSWfuiSZwKr-w0JFF5wsXhE-wuR1_gcyAooHIq1gUDgssclbwFufjzGysAnSo2q-9nHEail3EeDANUwQS0GSCbWMAHPwnOK-d327yQA0K6CNPrVtFC056YEO5zwM3wsgTxhyIf1lU4lKHvYEDMMNfZZ3jmUM0bc300z3B6-kUCM_9VhFMGvsvEvBD2y_kx-g1As3' },
            { id: 'limpieza', name: 'Limpieza', img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400' },
            { id: 'perfumeria', name: 'Perfumería', img: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=400' }
          ].map(cat => (
            <Link key={cat.id} to={`/category/${cat.id}`} className="flex flex-col items-center group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full bg-[#f5f0ee] mb-3 overflow-hidden shadow-sm flex items-center justify-center p-1.5 relative">
                <img src={cat.img} alt={cat.name} className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform duration-300" />
              </div>
              <span className="font-body-md text-on-surface font-medium text-center text-sm sm:text-base">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>
      <ProductCarousel
        title="Productos Destacados"
        products={products.slice(0, 12)}
      />

      {products.filter(p => p.originalPrice).length > 0 ? (
        <ProductCarousel
          title="Ofertas Relámpago"
          products={products.filter(p => p.originalPrice).slice(0, 12)}
        />
      ) : (
        <section className="mt-10">
          <h2 className="font-headline-lg text-headline-lg text-[25px] text-on-background font-bold mb-4">Ofertas Relámpago</h2>
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center border border-outline-variant/10">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">local_offer</span>
            <p className="text-on-surface-variant font-medium">No hay ofertas activas en este momento</p>
            <p className="text-on-surface-variant/60 text-sm mt-1">¡Volvé pronto para ver nuestras promociones!</p>
          </div>
        </section>
      )}

    </div>
  );
};
