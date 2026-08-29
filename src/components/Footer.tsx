import React from 'react';
import { Link } from 'react-router-dom';
import logoNegativo from '../logoNegativo.png';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-surface-container-lowest text-on-surface border-t border-outline-variant/20 w-full py-10 sm:py-12 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-12 mb-8">
          
          {/* Columna 1: Marca y Canales directos */}
          <div className="flex flex-col items-start space-y-3">
            <Link to="/">
              <img
                src={logoNegativo}
                alt="La Martina Supermercado"
                className="h-10 md:h-12 object-contain"
              />
            </Link>
            <p className="text-xs sm:text-sm text-on-surface-variant/80 max-w-sm leading-relaxed">
              Supermercado La Martina. Frescura, variedad y los mejores precios para tu hogar todos los días.
            </p>
            <div className="pt-2 flex items-center gap-3 text-on-surface-variant">
              <a
                href="https://wa.me/5492617139129"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-2xl bg-green-50 text-green-700 border border-green-200 flex items-center justify-center hover:scale-105 hover:bg-green-100 transition-all shadow-xs"
                title="WhatsApp Directo: 261 713-9129"
              >
                <span className="material-symbols-outlined text-[20px]">chat</span>
              </a>
              <a
                href="tel:2634776230"
                className="w-10 h-10 rounded-2xl bg-surface-container-high text-on-surface flex items-center justify-center hover:scale-105 hover:bg-surface-container-highest transition-all shadow-xs"
                title="Llamar a Sucursal: 263 477-6230"
              >
                <span className="material-symbols-outlined text-[20px]">call</span>
              </a>
              <a
                href="mailto:martinasuper1327@gmail.com"
                className="w-10 h-10 rounded-2xl bg-surface-container-high text-on-surface flex items-center justify-center hover:scale-105 hover:bg-surface-container-highest transition-all shadow-xs"
                title="Enviar Email"
              >
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </a>
            </div>
          </div>

          {/* Columna 2: Horarios de Atención */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
              <span>Horarios de Atención</span>
            </h4>
            <div className="space-y-2 text-xs text-on-surface-variant leading-relaxed">
              <div className="p-3 bg-surface-container-low rounded-2xl border border-outline-variant/10">
                <p className="font-bold text-on-surface">Lunes a Sábados</p>
                <p className="text-on-surface-variant">9:00 a 15:00 y 17:30 a 21:30 hs</p>
              </div>
              <div className="p-3 bg-surface-container-low rounded-2xl border border-outline-variant/10">
                <p className="font-bold text-on-surface">Domingos y Feriados</p>
                <p className="text-on-surface-variant">10:00 a 14:00 hs</p>
              </div>
            </div>
          </div>

          {/* Columna 3: Información y Soporte */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">support_agent</span>
              <span>Atención al Cliente</span>
            </h4>
            <div className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
              <p>
                ¿Tenés consultas sobre tus pedidos, pagos o entregas? Estamos para ayudarte.
              </p>
              <div className="space-y-2 pt-1">
                <Link 
                  to="/faq" 
                  className="flex items-center gap-2 text-primary font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">help</span>
                  <span>Preguntas Frecuentes</span>
                </Link>
                <Link 
                  to="/about" 
                  className="flex items-center gap-2 text-primary font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">storefront</span>
                  <span>Sobre Nosotros e Historia</span>
                </Link>
                <Link 
                  to="/terms" 
                  className="flex items-center gap-2 text-primary font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  <span>Términos y Condiciones</span>
                </Link>
                <Link 
                  to="/privacy" 
                  className="flex items-center gap-2 text-primary font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">shield</span>
                  <span>Política de Privacidad</span>
                </Link>
              </div>
            </div>
          </div>

        </div>

        {/* Barra inferior de copyright */}
        <div className="pt-6 border-t border-outline-variant/15 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-on-surface-variant/60">
          <p>© {new Date().getFullYear()} La Martina Supermercado. Todos los derechos reservados.</p>
          <div className="flex items-center gap-3">
            <Link to="/terms" className="hover:text-on-surface transition-colors">Términos y Condiciones</Link>
            <span className="opacity-40">|</span>
            <Link to="/privacy" className="hover:text-on-surface transition-colors">Política de Privacidad</Link>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-green-600 text-[13px]">verified_user</span>
              Compra segura
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
