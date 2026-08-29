import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export const TermsAndConditions: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const lastUpdated = '29 de agosto de 2026';

  const sections = [
    {
      title: '1. Identificación del Responsable',
      content: `El presente sitio web es propiedad y está operado por **Martina Supermercado**, con domicilio comercial en La Paz, Mendoza, Argentina.

Correo electrónico de contacto: martinasuper1327@gmail.com
Teléfono de contacto: (263) 477-6230
WhatsApp: +54 9 261 713-9129`
    },
    {
      title: '2. Aceptación de los Términos',
      content: `Al acceder, navegar o utilizar este sitio web, el usuario acepta de forma expresa e incondicional los presentes Términos y Condiciones de Uso. Si no está de acuerdo con alguno de estos términos, le solicitamos abstenerse de utilizar el Sitio.

Martina Supermercado se reserva el derecho de modificar estos Términos y Condiciones en cualquier momento, sin necesidad de previo aviso. Las modificaciones entrarán en vigencia desde su publicación en el Sitio. El uso continuado del Sitio después de cualquier modificación implica la aceptación de los nuevos términos.`
    },
    {
      title: '3. Objeto del Servicio',
      content: `El Sitio permite al Usuario:
• Consultar el catálogo de productos disponibles en Martina Supermercado.
• Realizar pedidos de compra en línea para retiro en sucursal o envío a domicilio.
• Utilizar herramientas como la calculadora de compras en local.
• Gestionar su cuenta personal, historial de compras y lista de favoritos.
• Consultar información institucional, ofertas, horarios y medios de contacto.

Los productos ofrecidos están sujetos a disponibilidad de stock al momento de la preparación del pedido.`
    },
    {
      title: '4. Registro de Cuenta y Datos Personales',
      content: `Para realizar compras, el Usuario podrá optar por crear una cuenta personal o comprar como invitado. Al registrarse, el Usuario se compromete a:
• Proporcionar información veraz, precisa, completa y actualizada.
• Mantener la confidencialidad de sus credenciales de acceso (usuario y contraseña).
• No ceder ni compartir su cuenta con terceros.
• Notificar de inmediato cualquier uso no autorizado de su cuenta.

Martina Supermercado no será responsable por los daños derivados del uso indebido de las credenciales de acceso del Usuario. El tratamiento de datos personales se rige por nuestra **Política de Privacidad**.`
    },
    {
      title: '5. Precios, Ofertas y Disponibilidad',
      content: `• Los precios publicados en el Sitio se expresan en **Pesos Argentinos (ARS)** e incluyen IVA cuando corresponda.
• Los precios pueden variar sin previo aviso y están sujetos a cambios de acuerdo con la dinámica comercial del supermercado.
• El precio aplicable será el vigente al momento de la **confirmación del pedido**.
• Las ofertas y promociones tienen validez limitada y están sujetas a condiciones específicas que se indicarán en cada caso.
• En caso de error tipográfico o informático en los precios publicados, Martina Supermercado se reserva el derecho de cancelar el pedido notificando al Usuario.
• Los productos ofrecidos están sujetos a disponibilidad de stock. En caso de faltante de un producto solicitado, Martina Supermercado se comunicará con el Usuario para ofrecer una alternativa o reembolso parcial.`
    },
    {
      title: '6. Proceso de Compra',
      content: `El proceso de compra se completa de la siguiente manera:
1. **Selección de productos**: El Usuario agrega los productos deseados al carrito de compras.
2. **Revisión del pedido**: El Usuario verifica los productos, cantidades y precios en el carrito.
3. **Datos de entrega**: El Usuario selecciona el método de entrega (envío a domicilio o retiro en sucursal) e ingresa la información necesaria.
4. **Confirmación**: El Usuario confirma el pedido, momento en el cual se genera una orden de compra.
5. **Preparación y entrega**: Martina Supermercado prepara el pedido y lo envía o lo pone a disposición para retiro.

La confirmación del pedido implica una oferta de compra sujeta a la aceptación de Martina Supermercado. Martina Supermercado se reserva el derecho de rechazar pedidos por motivos justificados (falta de stock, zona no cubierta por el delivery, etc.).`
    },
    {
      title: '7. Métodos de Pago',
      content: `Martina Supermercado acepta los siguientes métodos de pago:
• **Efectivo**: Pago al momento de la entrega o retiro.
• **Tarjetas de débito y crédito**: Visa, Mastercard y otras redes habilitadas.
• **Transferencias bancarias**: Transferencias y otros medios asociados a la plataforma.

El procesamiento de pagos electrónicos es gestionado por pasarelas de pago de terceros. Martina Supermercado no almacena datos de tarjetas de crédito o débito del Usuario.`
    },
    {
      title: '8. Envío y Entrega a Domicilio',
      content: `• Las entregas se realizan dentro de la zona de cobertura definida por Martina Supermercado, la cual puede ser consultada en la sección "Zonas de Envío" del Sitio.
• El tiempo estimado de entrega es de **60 a 90 minutos** desde la confirmación del pedido, sujeto a demanda y condiciones operativas.
• Los costos de envío se informarán al Usuario antes de confirmar el pedido.
• El Usuario deberá proporcionar una dirección de entrega válida y completa. Martina Supermercado no será responsable por entregas fallidas debido a datos incorrectos proporcionados por el Usuario.
• En caso de ausencia del receptor, el repartidor intentará comunicarse por los medios informados. Si no se logra la entrega, el pedido podrá ser devuelto al local y se coordinará un nuevo intento.`
    },
    {
      title: '9. Retiro en Sucursal',
      content: `• El Usuario podrá optar por retirar su pedido en nuestro local comercial ubicado en La Paz, Mendoza.
• El pedido estará disponible para retiro dentro de los horarios de atención vigentes.
• El Usuario deberá identificarse al momento del retiro, pudiendo presentar su número de pedido o documento de identidad.`
    },
    {
      title: '10. Derecho de Revocación (Arrepentimiento)',
      content: `De conformidad con el **Artículo 34 de la Ley 24.240 de Defensa del Consumidor** de la República Argentina, el Usuario tiene derecho a revocar (arrepentirse de) la compra dentro de los **diez (10) días corridos** contados a partir de la entrega del producto, sin necesidad de justificar su decisión y sin penalidad alguna.

Para ejercer este derecho, el Usuario deberá:
• Comunicarse con nuestro equipo a través de los canales de contacto indicados en estos Términos.
• Los productos deberán ser devueltos en el mismo estado en que fueron recibidos, sin uso y con su embalaje original.
• Los costos de devolución serán asumidos por Martina Supermercado.
• La devolución del importe se efectuará en un plazo máximo de **diez (10) días hábiles** mediante el mismo medio de pago utilizado en la compra.

**Excepciones**: Quedan excluidos del derecho de revocación los productos perecederos (carnes, lácteos, frutas, verduras, panificados, productos congelados) y aquellos que por su naturaleza no puedan ser devueltos o cuyo valor se deprecie rápidamente.`
    },
    {
      title: '11. Cambios y Devoluciones',
      content: `Más allá del derecho de revocación, Martina Supermercado acepta cambios y devoluciones en los siguientes casos:
• **Producto en mal estado**: Si el producto recibido presenta defectos de calidad, frescura o se encuentra en mal estado al momento de la entrega.
• **Producto erróneo**: Si el producto entregado no coincide con el solicitado por el Usuario.
• **Faltante de productos**: Si el pedido está incompleto respecto a lo confirmado.

En cualquiera de estos casos, el Usuario deberá comunicarse dentro de las **24 horas** posteriores a la recepción del pedido. Martina Supermercado ofrecerá la reposición del producto, un crédito a favor para futuras compras o la devolución del importe correspondiente.`
    },
    {
      title: '12. Garantía Legal',
      content: `Todos los productos comercializados por Martina Supermercado cuentan con la **garantía legal** establecida por la Ley 24.240 de Defensa del Consumidor. Martina Supermercado garantiza la calidad, idoneidad y seguridad de todos los productos ofrecidos conforme a las normas aplicables.

En caso de que un producto presente defectos o vicios ocultos, el Usuario podrá solicitar la reparación, sustitución, quita proporcional del precio o resolución del contrato, conforme a lo previsto en la legislación vigente.`
    },
    {
      title: '13. Propiedad Intelectual',
      content: `Todo el contenido del Sitio —incluyendo, sin limitación, textos, gráficos, logotipos, íconos, imágenes, diseños, código fuente, software, marcas y nombres comerciales— es propiedad exclusiva de Martina Supermercado o de sus licenciantes, y se encuentra protegido por las leyes de propiedad intelectual de la República Argentina (Ley 11.723) y tratados internacionales aplicables.

Queda prohibida la reproducción, distribución, modificación, comunicación pública o cualquier otro uso no autorizado del contenido del Sitio sin el consentimiento previo y por escrito de Martina Supermercado.`
    },
    {
      title: '14. Limitación de Responsabilidad',
      content: `Martina Supermercado no será responsable por:
• Interrupciones temporales del servicio por mantenimiento, actualizaciones o causas de fuerza mayor.
• Errores en la transmisión de datos o fallos técnicos de la plataforma.
• Daños o perjuicios causados por virus informáticos u otros elementos que pudieran alterar el dispositivo del Usuario.
• El uso indebido que el Usuario haga del Sitio o de la información contenida en él.
• Demoras en la entrega causadas por factores externos (condiciones climáticas, cortes de ruta, problemas logísticos ajenos a Martina Supermercado).

Martina Supermercado realizará sus mejores esfuerzos para mantener el Sitio disponible y actualizado en todo momento.`
    },
    {
      title: '15. Conducta del Usuario',
      content: `El Usuario se compromete a utilizar el Sitio de manera lícita, de buena fe y conforme a estos Términos. Queda prohibido:
• Utilizar el Sitio con fines ilegales, fraudulentos o contrarios a la moral y al orden público.
• Introducir virus, código malicioso o cualquier elemento que pueda dañar o alterar el funcionamiento del Sitio.
• Intentar acceder a áreas restringidas del Sitio sin autorización.
• Reproducir, copiar o distribuir el contenido del Sitio sin autorización.
• Realizar pedidos falsos, fraudulentos o con información inexacta.`
    },
    {
      title: '16. Comunicaciones y Notificaciones',
      content: `Martina Supermercado podrá enviar comunicaciones al Usuario a través de:
• El correo electrónico proporcionado al momento del registro o pedido.
• Mensajes de WhatsApp al número de teléfono informado.
• Notificaciones dentro del propio Sitio.

Dichas comunicaciones podrán incluir confirmaciones de pedido, actualizaciones de estado, información sobre ofertas y novedades. El Usuario podrá solicitar la baja de comunicaciones comerciales en cualquier momento.`
    },
    {
      title: '17. Enlaces a Terceros',
      content: `El Sitio puede contener enlaces a sitios web de terceros (pasarelas de pago, redes sociales, servicios de mensajería). Martina Supermercado no controla ni es responsable por el contenido, las políticas de privacidad o las prácticas de dichos sitios. La inclusión de enlaces no implica la aprobación o respaldo por parte de Martina Supermercado.`
    },
    {
      title: '18. Resolución de Conflictos',
      content: `Para cualquier controversia derivada de estos Términos y Condiciones o del uso del Sitio, las partes intentarán resolverla de buena fe mediante negociación directa.

En caso de no alcanzarse un acuerdo, el Usuario podrá:
• Formular su reclamo ante la **Secretaría de Comercio Interior** de la Nación o ante la **Dirección de Defensa del Consumidor** de la Provincia de Mendoza.
• Utilizar el sistema de resolución de conflictos en línea del **Servicio de Conciliación Previa en las Relaciones de Consumo (COPREC)**.
• Recurrir a la jurisdicción de los **Tribunales Ordinarios de la Provincia de Mendoza**, con sede en el Departamento Judicial que corresponda.`
    },
    {
      title: '19. Legislación Aplicable',
      content: `Estos Términos y Condiciones se rigen por las leyes vigentes de la República Argentina, en particular:
• **Ley 24.240** — Defensa del Consumidor y sus modificatorias.
• **Ley 25.326** — Protección de los Datos Personales.
• **Ley 26.361** — Modificaciones a la Ley de Defensa del Consumidor.
• **Resolución 424/2020** de la Secretaría de Comercio Interior (Botón de Arrepentimiento).
• **Código Civil y Comercial de la Nación** — Contratos de consumo (Artículos 1092 a 1122).`
    },
    {
      title: '20. Botón de Arrepentimiento',
      content: `En cumplimiento de la **Resolución 424/2020** de la Secretaría de Comercio Interior, Martina Supermercado pone a disposición del Usuario un mecanismo sencillo para ejercer su derecho de arrepentimiento. El Usuario puede comunicarse por los siguientes canales para solicitar la revocación de su compra dentro de los 10 días corridos desde la entrega:

• **WhatsApp**: +54 9 261 713-9129
• **Email**: martinasuper1327@gmail.com
• **Teléfono**: (263) 477-6230

La solicitud será procesada y se confirmará la devolución dentro de las 48 horas hábiles posteriores a la comunicación.`
    },
    {
      title: '21. Vigencia',
      content: `Los presentes Términos y Condiciones tienen vigencia indefinida desde su publicación y permanecerán en vigor mientras el Sitio se encuentre activo. Martina Supermercado podrá dar de baja o modificar el Sitio y estos Términos en cualquier momento, notificando a los Usuarios registrados a través de los medios de comunicación disponibles.`
    }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium mb-4"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Volver al Inicio
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[24px]">gavel</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight">
              Términos y Condiciones
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
              Última actualización: {lastUpdated}
            </p>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed max-w-2xl">
          Estos Términos y Condiciones regulan el uso del sitio web y servicios de compra en línea de Martina Supermercado. Por favor, leélos detenidamente antes de utilizar nuestros servicios.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {sections.map((section, index) => (
          <section
            key={index}
            className="bg-white rounded-2xl border border-outline-variant/15 shadow-xs overflow-hidden"
          >
            <h2 className="text-sm sm:text-base font-bold text-on-surface px-5 py-4 bg-surface-container-low/50 border-b border-outline-variant/10">
              {section.title}
            </h2>
            <div className="px-5 py-4 text-[13px] sm:text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
              {section.content.split('**').map((part, i) =>
                i % 2 === 1 ? (
                  <strong key={i} className="text-on-surface font-semibold">{part}</strong>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Contact and Rights Box */}
      <div className="mt-8 p-5 bg-primary/5 rounded-2xl border border-primary/10">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[22px] mt-0.5 shrink-0">contact_support</span>
          <div>
            <p className="text-sm font-bold text-on-surface mb-1">¿Tenés dudas sobre estos términos?</p>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Podés comunicarte con nosotros por{' '}
              <a href="https://wa.me/5492617139129" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">
                WhatsApp
              </a>,{' '}
              <a href="mailto:martinasuper1327@gmail.com" className="text-primary font-semibold hover:underline">
                email
              </a>{' '}
              o llamando al{' '}
              <a href="tel:2634776230" className="text-primary font-semibold hover:underline">(263) 477-6230</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Related Links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/privacy"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-primary font-bold bg-primary/5 hover:bg-primary/10 px-4 py-2.5 rounded-xl transition-colors border border-primary/10"
        >
          <span className="material-symbols-outlined text-[16px]">shield</span>
          Política de Privacidad
        </Link>
        <Link
          to="/faq"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-primary font-bold bg-primary/5 hover:bg-primary/10 px-4 py-2.5 rounded-xl transition-colors border border-primary/10"
        >
          <span className="material-symbols-outlined text-[16px]">help</span>
          Preguntas Frecuentes
        </Link>
      </div>
    </div>
  );
};
