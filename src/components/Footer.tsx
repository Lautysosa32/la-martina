import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-surface-container-lowest text-on-surface font-label-sm text-label-sm mt-section-gap border-t border-outline-variant w-full py-5 px-margin-mobile md:px-margin-desktop">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-10">
        {/* Marca y Contacto */}
        <div className="flex flex-col items-center md:items-start">
          <div className="font-headline-md text-headline-md text-primary text-3xl font-bold">
            La Martina
          </div>
          <div className="mt-6 flex flex-col items-center md:items-start">
            <a href="tel:08102225316" className="text-primary font-bold text-xl hover:opacity-80 transition-opacity">
              0810 XXX XXXX
            </a>
            <p className="text-on-surface-variant text-body-md mt-2 text-m text-center md:text-left max-w-[250px] leading-snug">
              Horario de atención lunes a viernes de 9 a 21hs.
            </p>
          </div>
        </div>

        {/* Links de Navegación */}
        <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-3 max-w-lg">
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all">About Us</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all">Sustainability</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all">Privacy Policy</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all">Terms of Service</a>
          <a href="#" className="text-on-surface-variant hover:text-primary transition-all">Store Locator</a>
        </div>
      </div>

      <div className="mt-5 pt-8 border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant">
        <div>
          © 2024 La Martina Premium Supermarket. All rights reserved.
        </div>

      </div>
    </footer>
  );
};
