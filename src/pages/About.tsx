import React from 'react';

export const About: React.FC = () => {
  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden h-[300px] md:h-[400px] mb-12 shadow-lg">
        <img
          src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-8 md:p-12">
          <h1 className="text-white font-display-xl text-4xl md:text-6xl font-bold mb-4">Martina</h1>
          <p className="text-white/90 text-lg md:text-xl max-w-2xl font-body-lg">
            Calidad premium en cada detalle desde 2014.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Historia y Descripción */}
        <div className="md:col-span-2 space-y-8">
          <section>
            <h2 className="text-[25px] font-bold text-on-background mb-6 border-l-4 border-primary pl-4">Nuestra Historia</h2>
            <div className="space-y-4 text-on-surface-variant text-lg leading-relaxed">
              <p>
                En <strong>Martina supermercado</strong>, no solo vendemos productos; seleccionamos experiencias. Nacimos con la visión de crear un espacio donde la frescura del mercado se encuentra con la exclusividad de un gourmet.
              </p>
              <p>
                Cada producto en nuestras góndolas ha pasado por un riguroso proceso de selección. Desde las carnes hasta los vinos de bodegas boutique, nuestra misión es garantizar que solo lo mejor llegue a tu mesa.
              </p>
            </div>
          </section>

          {/* Valores/Pilares */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/30 text-center">
              <span className="material-symbols-outlined text-primary text-4xl mb-4" aria-hidden="true" translate="no">eco</span>
              <h3 className="font-bold mb-2">Frescura Total</h3>
              <p className="text-sm text-on-surface-variant">Productos directos del productor a tu hogar.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/30 text-center">
              <span className="material-symbols-outlined text-primary text-4xl mb-4" aria-hidden="true" translate="no">verified</span>
              <h3 className="font-bold mb-2">Calidad Premium</h3>
              <p className="text-sm text-on-surface-variant">Solo marcas y productos de primer nivel.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/30 text-center">
              <span className="material-symbols-outlined text-primary text-4xl mb-4" aria-hidden="true" translate="no">local_shipping</span>
              <h3 className="font-bold mb-2">Envío Veloz</h3>
              <p className="text-sm text-on-surface-variant">Llegamos a tu puerta en menos de 60 minutos.</p>
            </div>
          </section>
        </div>

        {/* Contacto y Mapa */}
        <div className="space-y-8">
          <section className="bg-surface-container-low p-8 rounded-2xl border border-outline-variant/20">
            <h3 className="text-[25px] font-bold text-on-background mb-6">Contacto</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">call</span>
                <div>
                  <p className="font-bold">WhatsApp / Teléfonos</p>
                  <a href="https://wa.me/5492617139129" target="_blank" rel="noopener noreferrer" className="text-primary text-xl font-bold block hover:underline">
                    261 713-9129
                  </a>
                  <a href="tel:2634776230" className="text-on-surface-variant font-medium block hover:text-primary transition-colors mb-1">
                    263 477-6230 (Llamadas)
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">schedule</span>
                <div>
                  <p className="font-bold">Horarios de atención</p>
                  <div className="text-sm text-on-surface-variant mt-1">
                    <p>Lunes a sábado: 9 a 15hs y 17:30 a 21:30hs</p>
                    <p>Domingo y feriados: 10 a 14hs</p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">location_on</span>
                <div>
                  <p className="font-bold">Dirección</p>
                  <p className="text-on-surface-variant">25 de Mayo (entre Buenos Aires y Belgrano), La Paz, Mendoza</p>
                  <a
                    href="https://www.google.com/maps/place/Martina+supermercado/@-33.4763684,-67.6461458,11.25z/data=!4m6!3m5!1s0x967f5d9a53d32efb:0x20989bacf6605d80!8m2!3d-33.4590393!4d-67.5518086!16s%2Fg%2F11sn_4jnn5?entry=ttu&g_ep=EgoyMDI2MDUwMi4wIKXMDSoASAFQAw%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-xs font-bold hover:underline flex items-center mt-1"
                  >
                    CÓMO LLEGAR <span className="material-symbols-outlined text-[14px] ml-1" aria-hidden="true" translate="no">open_in_new</span>
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-primary" aria-hidden="true" translate="no">mail</span>
                <div>
                  <p className="font-bold">Email</p>
                  <a href="mailto:martinasuper1327@gmail.com" className="text-on-surface-variant hover:text-primary transition-colors">
                    martinasuper1327@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Mini Mapa Actualizado */}
          <section className="rounded-2xl overflow-hidden h-[250px] shadow-inner relative border border-outline-variant/20 group">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3345.8340798739953!2d-67.5539972!3d-33.4588047!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x967f5d9a53d32efb%3A0x20989bacf6605d80!2sMartina%20supermercado!5e0!3m2!1ses-419!2sar!4v1714567890123!5m2!1ses-419!2sar"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
            <div className="absolute inset-0 bg-primary/5 pointer-events-none group-hover:bg-transparent transition-colors"></div>
          </section>
        </div>
      </div>
    </div>
  );
};
