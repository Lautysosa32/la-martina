import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Delivery: React.FC = () => {
  const navigate = useNavigate();
  const currentMethod = localStorage.getItem('la-martina-delivery-method') || 'envio';

  const selectMethod = (method: 'retiro' | 'envio') => {
    localStorage.setItem('la-martina-delivery-method', method);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="pt-8 pb-16 flex flex-col items-center justify-start px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="w-full max-w-2xl text-center mb-10">
        <span className="text-xs font-extrabold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full inline-block mb-3">
          Método de Recepción
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-on-background mb-2">
          ¿Cómo querés recibir tu compra?
        </h1>
        <p className="text-on-surface-variant text-sm sm:text-base">
          Elegí tu opción preferida para calcular los tiempos y costos de entrega.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Option 1: Retiro */}
        <button
          onClick={() => selectMethod('retiro')}
          className={`bg-white rounded-3xl p-8 flex flex-col items-center text-center shadow-xs hover:shadow-lg transition-all border cursor-pointer group relative overflow-hidden ${
            currentMethod === 'retiro' 
              ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
              : 'border-outline-variant/20 hover:border-primary/40'
          }`}
        >
          {currentMethod === 'retiro' && (
            <span className="absolute top-4 right-4 bg-primary text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              Seleccionado
            </span>
          )}
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all text-primary">
            <span className="material-symbols-outlined text-4xl">storefront</span>
          </div>
          <h2 className="text-xl font-black text-on-surface mb-2">Retiro en Sucursal</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed max-w-xs mb-4">
            Prepararemos tu pedido y te avisaremos para que pases a retirarlo sin filas por nuestro local.
          </p>
          <span className="text-xs font-black text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">
            ¡100% GRATIS!
          </span>
        </button>

        {/* Option 2: Envío */}
        <button
          onClick={() => selectMethod('envio')}
          className={`bg-white rounded-3xl p-8 flex flex-col items-center text-center shadow-xs hover:shadow-lg transition-all border cursor-pointer group relative overflow-hidden ${
            currentMethod === 'envio' 
              ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
              : 'border-outline-variant/20 hover:border-primary/40'
          }`}
        >
          {currentMethod === 'envio' && (
            <span className="absolute top-4 right-4 bg-primary text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              Seleccionado
            </span>
          )}
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all text-primary">
            <span className="material-symbols-outlined text-4xl">local_shipping</span>
          </div>
          <h2 className="text-xl font-black text-on-surface mb-2">Envío a Domicilio</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed max-w-xs mb-4">
            Llegamos a tu puerta en Rivadavia y zonas aledañas con productos frescos y cadena de frío garantizada.
          </p>
          <span className="text-xs font-black text-primary bg-primary/10 px-3 py-1 rounded-full">
            Entrega rápida en el día
          </span>
        </button>
      </div>
    </div>
  );
};

