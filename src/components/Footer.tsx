import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-surface-container-lowest text-on-surface border-t border-outline-variant w-full py-6 px-6 md:py-10 md:px-12 mt-section-gap">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-6 md:gap-10">
        {/* Marca y Contacto */}
        <div className="flex flex-col items-center md:items-start">
          <div style={{ fontFamily: "'Fredoka', sans-serif" }} className="text-xl md:text-3xl text-primary font-black">
            Martina
          </div>
          <div className="text-on-surface-variant text-xs md:text-sm font-semibold tracking-wide uppercase mt-0.5 opacity-80">
            Supermercado
          </div>
          <div className="mt-4 flex flex-col items-center md:items-start">
            <a href="tel:08102225316" className="text-primary font-bold text-base md:text-lg hover:opacity-80 transition-opacity">
              0810 XXX XXXX
            </a>
            <p className="text-on-surface-variant/70 text-[11px] md:text-xs mt-1.5 text-center md:text-left max-w-[220px] leading-relaxed">
              Horario de atención lunes a viernes de 9 a 21hs.
            </p>
          </div>
        </div>

        {/* Links de Navegación */}
        <div className="flex flex-wrap justify-center md:justify-end gap-x-4 gap-y-2 md:gap-x-6 md:gap-y-3 max-w-lg">
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">About Us</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Sustainability</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Privacy Policy</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Terms of Service</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Store Locator</a>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant/60 text-[10px] md:text-xs">
        <div className="text-center md:text-left">
          © 2024 La Martina Premium Supermarket. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
