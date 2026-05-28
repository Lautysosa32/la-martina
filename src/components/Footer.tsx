import React from 'react';
import logoNegativo from '../logoNegativo.png';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-surface-container-lowest text-on-surface border-t border-outline-variant w-full py-6 px-6 md:py-10 md:px-12 mt-section-gap">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-6 md:gap-10">
        {/* Marca y Contacto */}
        <div className="flex flex-col items-center md:items-start">
          <img
            src={logoNegativo}
            alt=""
            aria-hidden="true"
            translate="no"
            className="h-10 md:h-12 object-contain"
          />
          <div className="mt-4 flex flex-col items-center md:items-start gap-1">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-4">
              <a href="https://wa.me/5492617139129" target="_blank" rel="noopener noreferrer" className="text-primary font-bold text-base md:text-lg hover:opacity-80 transition-opacity flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[20px]">chat</span>
                261 713-9129
              </a>
              <a href="tel:2634776230" className="text-on-surface-variant font-medium text-sm hover:text-primary transition-colors flex items-center gap-1.5 pt-1">
                <span className="material-symbols-outlined text-[16px]">call</span>
                263 477-6230 (Llamadas)
              </a>
            </div>
            <a href="mailto:martinasuper1327@gmail.com" className="text-on-surface-variant font-medium text-sm hover:text-primary transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">mail</span>
              martinasuper1327@gmail.com
            </a>
            
            <div className="text-on-surface-variant/70 text-[11px] md:text-xs mt-2 text-center md:text-left leading-relaxed">
              <p>Lunes a sábado: 9:00 a 15:00 y 17:30 a 21:30</p>
              <p>Domingo y feriados: 10:00 a 14:00</p>
            </div>
          </div>
        </div>

        {/* Links de Navegación */}
        <div className="flex flex-wrap justify-center md:justify-end gap-x-4 gap-y-2 md:gap-x-6 md:gap-y-3 max-w-lg">
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Sobre Nosotros</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Sustentabilidad</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Política de Privacidad</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Términos de Servicio</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all text-xs md:text-sm font-medium">Sucursales</a>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant/60 text-[10px] md:text-xs">
        <div className="text-center md:text-left">
          © 2024 La Martina Premium Supermarket. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};
