import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Delivery: React.FC = () => {
  const navigate = useNavigate();

  const selectMethod = (method: 'retiro' | 'envio') => {
    localStorage.setItem('la-martina-delivery-method', method);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex-grow pt-4 pb-[100px] flex flex-col items-center justify-start px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto">
      <div className="w-full max-w-2xl text-center mt-12 mb-12">
        <h1 className="font-headline-lg text-headline-lg text-primary mb-4">¡Hola, empecemos!</h1>
        <p className="font-display-xl text-display-xl text-on-surface">Elegí cómo querés recibir tu pedido</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* Option 1: Retiro */}
        <button
          onClick={() => selectMethod('retiro')}
          className="bg-surface-container-lowest rounded-xl p-8 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-primary-container/20 group"
        >
          <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-6 group-hover:bg-primary-container/10 transition-colors">
            <span className="material-symbols-outlined text-5xl text-primary fill">storefront</span>
          </div>
          <h3 className="font-headline-md text-headline-md text-primary mb-3">Retiro</h3>
          <p className="font-body-md text-body-md text-on-surface-variant">Retirá tu pedido en la sucursal más cercana</p>
        </button>

        {/* Option 2: Envío */}
        <button
          onClick={() => selectMethod('envio')}
          className="bg-surface-container-lowest rounded-xl p-8 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-primary-container/20 group"
        >
          <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-6 group-hover:bg-primary-container/10 transition-colors">
            <span className="material-symbols-outlined text-5xl text-primary fill">local_shipping</span>
          </div>
          <h3 className="font-headline-md text-headline-md text-primary mb-3">Envío a domicilio</h3>
          <p className="font-body-md text-body-md text-on-surface-variant">Recibí tu pedido en tu domicilio</p>
        </button>
      </div>
    </div>
  );
};
