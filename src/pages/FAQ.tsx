import React, { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export const FAQ: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      category: 'Envíos',
      question: '¿A qué zonas realizan envíos?',
      answer: 'Realizamos envíos a toda la zona de La Paz y alrededores. Podes consultar el costo de envío ingresando tu dirección en la pantalla de "Entrega".'
    },
    {
      category: 'Envíos',
      question: '¿Cuánto tarda en llegar mi pedido?',
      answer: 'El tiempo estimado de entrega es de 60 a 90 minutos, dependiendo de la demanda y tu ubicación. También podés programar tu entrega para el horario que prefieras.'
    },
    {
      category: 'Pagos',
      question: '¿Qué métodos de pago aceptan?',
      answer: 'Aceptamos efectivo al momento de la entrega, tarjetas de débito y crédito (Visa, Mastercard, American Express) y pagos a través de Mercado Pago.'
    },
    {
      category: 'Pedidos',
      question: '¿Puedo modificar un pedido ya realizado?',
      answer: 'Si el pedido aún no ha salido de nuestro local, podés modificarlo comunicándote directamente a nuestro número de atención al cliente: 0810 222 5316.'
    },
    {
      category: 'Productos',
      question: '¿Qué pasa si un producto llega en mal estado?',
      answer: 'En La Martina garantizamos la frescura total. Si algún producto no cumple con tus expectativas, podés solicitar el cambio o la devolución inmediata al momento de recibirlo.'
    },
    {
      category: 'Cuenta',
      question: '¿Es necesario crear una cuenta para comprar?',
      answer: 'No es obligatorio, pero te recomendamos hacerlo para guardar tus direcciones favoritas, ver tu historial de compras y recibir ofertas exclusivas.'
    }
  ];

  const filteredFaqs = faqs.filter(faq => 
    faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-3xl mx-auto px-margin-mobile md:px-margin-desktop py-12 animate-in slide-in-from-bottom-4 duration-700">
      <div className="text-center md:text-left mb-12">
        <h1 className="text-[25px] font-bold text-on-background mb-2">Preguntas Frecuentes</h1>
        <p className="text-on-surface-variant text-base">Respuestas rápidas a tus dudas frecuentes.</p>
      </div>

      {/* Buscador Mock */}
      <div className="relative mb-12">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
        <input 
          type="text" 
          placeholder="Buscá tu duda (ej: envíos, pagos...)" 
          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-outline-variant/30 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-lg"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Lista de FAQ */}
      <div className="space-y-4">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, index) => (
            <div 
              key={index} 
              className="bg-white rounded-2xl border border-outline-variant/20 overflow-hidden transition-all duration-300 hover:shadow-md"
            >
              <button 
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left group"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">{faq.category}</span>
                  <span className="font-bold text-lg text-on-surface group-hover:text-primary transition-colors">{faq.question}</span>
                </div>
                <span className={`material-symbols-outlined transition-transform duration-300 ${openIndex === index ? 'rotate-180 text-primary' : 'text-on-surface-variant'}`}>
                  expand_more
                </span>
              </button>
              
              <div className={`transition-all duration-300 ease-in-out ${openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
                <div className="px-6 pb-6 text-on-surface-variant leading-relaxed border-t border-outline-variant/10 pt-4">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl mb-2 opacity-20">search_off</span>
            <p>No encontramos preguntas que coincidan con tu búsqueda.</p>
          </div>
        )}
      </div>

      {/* Soporte Extra */}
      <div className="mt-16 bg-primary-container/10 rounded-3xl p-8 border border-primary/10 text-center">
        <h3 className="text-[25px] font-bold text-on-background mb-2">¿Todavía tenés dudas?</h3>
        <p className="text-on-surface-variant mb-6">Nuestro equipo de atención al cliente está listo para ayudarte.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href="tel:08102225316" className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-primary/90 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">call</span>
            Llamar ahora
          </a>
          <a href="https://wa.me/yournumber" className="bg-[#25D366] text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">chat</span>
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
};
