import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const lastUpdated = '29 de agosto de 2026';

  const sections = [
    {
      title: '1. Responsable del Tratamiento de Datos',
      content: `**Supermercado La Martina** (en adelante, "La Martina", "nosotros" o "el Responsable") es el responsable del tratamiento de los datos personales recolectados a través de este sitio web y sus servicios asociados.

Domicilio comercial: La Paz, Mendoza, Argentina
Correo electrónico: martinasuper1327@gmail.com
Teléfono: (263) 477-6230
WhatsApp: +54 9 261 713-9129`
    },
    {
      title: '2. Marco Legal Aplicable',
      content: `La presente Política de Privacidad se rige por la normativa vigente en la República Argentina en materia de protección de datos personales:
• **Ley 25.326** — Ley de Protección de los Datos Personales.
• **Decreto Reglamentario 1558/2001** y sus modificaciones.
• **Disposiciones de la Agencia de Acceso a la Información Pública (AAIP)**.
• **Ley 24.240** — Defensa del Consumidor (en lo relativo a la información al consumidor).
• **Artículo 43 de la Constitución Nacional Argentina** — Habeas Data.

La Martina se compromete a tratar los datos personales de los Usuarios con responsabilidad, transparencia y conforme a los principios de legalidad, finalidad, proporcionalidad y seguridad establecidos por la ley.`
    },
    {
      title: '3. Datos Personales que Recopilamos',
      content: `Recopilamos las siguientes categorías de datos personales cuando el Usuario interactúa con nuestro Sitio:

**Datos de identificación y contacto:**
• Nombre y apellido
• Dirección de correo electrónico
• Número de teléfono / WhatsApp
• Dirección de entrega (calle, número, localidad, código postal)
• Datos de ubicación geográfica (con consentimiento, al utilizar "Zonas de Envío")

**Datos de la cuenta:**
• Credenciales de acceso (usuario/contraseña almacenados de forma encriptada)
• Historial de pedidos y compras
• Lista de productos favoritos
• Preferencias de entrega (envío a domicilio o retiro en sucursal)

**Datos de navegación y técnicos:**
• Dirección IP
• Tipo de navegador y sistema operativo
• Páginas visitadas dentro del Sitio y tiempo de permanencia
• Datos de cookies y tecnologías similares (ver sección 8)

**Datos de pago:**
• La Martina **NO almacena** datos de tarjetas de crédito o débito. Los pagos electrónicos son procesados exclusivamente por pasarelas de pago de terceros (Mercado Pago u otros proveedores autorizados) bajo sus propias políticas de seguridad.`
    },
    {
      title: '4. Finalidad del Tratamiento',
      content: `Los datos personales recopilados son utilizados para las siguientes finalidades:

**Finalidades principales (ejecución del servicio):**
• Gestionar y procesar pedidos de compra realizados a través del Sitio.
• Coordinar la entrega a domicilio o el retiro en sucursal.
• Comunicar al Usuario el estado de sus pedidos (confirmación, preparación, envío, entrega).
• Gestionar la cuenta del Usuario, incluyendo su historial y preferencias.
• Atender consultas, reclamos y solicitudes del Usuario.
• Facturación y registro contable de las operaciones comerciales.

**Finalidades secundarias (con consentimiento):**
• Envío de comunicaciones comerciales, ofertas y promociones.
• Personalización de la experiencia de compra basada en el historial del Usuario.
• Realización de encuestas de satisfacción y estudios de mercado.
• Mejora continua del Sitio y sus funcionalidades.

El Usuario puede revocar su consentimiento para las finalidades secundarias en cualquier momento, sin que esto afecte la prestación del servicio principal.`
    },
    {
      title: '5. Base Legal del Tratamiento',
      content: `El tratamiento de datos personales se fundamenta en las siguientes bases legales:
• **Consentimiento del titular**: Otorgado al registrarse, realizar un pedido o aceptar los Términos y Condiciones.
• **Ejecución contractual**: Necesario para cumplir con la relación comercial (entrega de productos, procesamiento de pagos, etc.).
• **Obligación legal**: Cumplimiento de normativas fiscales, contables y de defensa del consumidor.
• **Interés legítimo**: Prevención de fraude, seguridad del Sitio y mejora del servicio.`
    },
    {
      title: '6. Compartición de Datos con Terceros',
      content: `La Martina podrá compartir datos personales del Usuario con las siguientes categorías de terceros, exclusivamente en la medida necesaria para las finalidades indicadas:

• **Proveedores de servicios de pago**: Mercado Pago y/o procesadoras de tarjetas, para la gestión de transacciones electrónicas.
• **Servicios de logística y delivery**: Para coordinar la entrega de pedidos a domicilio.
• **Proveedores de tecnología**: Servicios de alojamiento web, bases de datos y herramientas de análisis (ej. Supabase, servicios de hosting).
• **Autoridades públicas**: Cuando sea requerido por ley, orden judicial o requerimiento de autoridad competente.

La Martina **NO vende, alquila ni cede** datos personales a terceros con fines comerciales propios. Los proveedores de servicios que accedan a datos personales están obligados contractualmente a mantener la confidencialidad y a tratar los datos exclusivamente para las finalidades autorizadas.`
    },
    {
      title: '7. Seguridad de los Datos',
      content: `La Martina implementa medidas de seguridad técnicas y organizativas para proteger los datos personales contra acceso no autorizado, alteración, divulgación o destrucción, incluyendo:

• **Encriptación**: Las contraseñas se almacenan con algoritmos de hash seguros. Las comunicaciones se realizan bajo protocolo HTTPS/TLS.
• **Control de acceso**: Acceso restringido a datos personales solo al personal autorizado, con diferentes niveles de permisos.
• **Copias de seguridad**: Respaldos periódicos de la base de datos para prevenir la pérdida de información.
• **Monitoreo**: Supervisión activa del sistema para detectar y prevenir accesos no autorizados.
• **Actualización**: Revisión y actualización periódica de las medidas de seguridad conforme a las mejores prácticas del sector.

No obstante, ningún sistema de seguridad es infalible. En caso de una brecha de seguridad que afecte datos personales, La Martina notificará a los Usuarios afectados y a la autoridad competente conforme a la normativa vigente.`
    },
    {
      title: '8. Cookies y Tecnologías Similares',
      content: `El Sitio utiliza cookies y tecnologías de almacenamiento local para mejorar la experiencia del Usuario. Las categorías de cookies utilizadas son:

**Cookies estrictamente necesarias:**
• Gestión de la sesión del Usuario y del carrito de compras.
• Recordar preferencias de entrega y configuración del Sitio.
• Garantizar la seguridad y el funcionamiento del Sitio.

**Cookies de funcionalidad:**
• Almacenar las preferencias del Usuario (idioma, ubicación, modo de visualización).
• Mantener la lista de productos favoritos.
• Recordar el estado de la calculadora de compras.

**Cookies de análisis (opcionales):**
• Recopilar información anónima sobre el uso del Sitio para mejorar su funcionamiento y contenido.

El Usuario puede gestionar las cookies desde la configuración de su navegador. Desactivar cookies esenciales puede afectar el funcionamiento del Sitio.`
    },
    {
      title: '9. Derechos del Titular de los Datos (ARCO)',
      content: `De conformidad con la **Ley 25.326**, el Usuario tiene los siguientes derechos sobre sus datos personales:

• **Acceso**: Solicitar información sobre qué datos personales tenemos almacenados y cómo los utilizamos. Este derecho puede ejercerse de forma **gratuita** a intervalos no inferiores a seis (6) meses, conforme al Artículo 14 de la Ley 25.326.
• **Rectificación**: Solicitar la corrección de datos inexactos, incompletos o desactualizados.
• **Supresión**: Solicitar la eliminación de sus datos personales cuando ya no sean necesarios para las finalidades para las que fueron recopilados, salvo que exista una obligación legal de conservarlos.
• **Confidencialidad**: Solicitar que sus datos sean tratados con la debida reserva.
• **Oposición**: Oponerse al tratamiento de sus datos para finalidades específicas, como comunicaciones comerciales.

**Cómo ejercer tus derechos:**
Para ejercer cualquiera de estos derechos, el Usuario deberá enviar una solicitud a:
• **Email**: martinasuper1327@gmail.com
• **WhatsApp**: +54 9 261 713-9129
• **Dirección postal**: La Paz, Mendoza, Argentina

La solicitud deberá incluir: nombre completo, datos de contacto y descripción del derecho que desea ejercer. La Martina responderá en un plazo máximo de **diez (10) días hábiles**.

**Derecho de Habeas Data**: De acuerdo al Artículo 43 de la Constitución Nacional y la Ley 25.326, el titular de los datos puede interponer la acción de habeas data para tomar conocimiento de los datos a él referidos y de su finalidad, que consten en registros o bases de datos públicos o privados.

**Organismo de control**: La **Agencia de Acceso a la Información Pública (AAIP)** es el órgano de control de la Ley 25.326. Dirección: Av. Pte. Julio A. Roca 710, Piso 2°, Ciudad Autónoma de Buenos Aires. Web: www.argentina.gob.ar/aaip.`
    },
    {
      title: '10. Retención de Datos',
      content: `Los datos personales serán conservados durante el tiempo necesario para cumplir con las finalidades para las que fueron recopilados, y posteriormente durante los plazos establecidos por la normativa aplicable:

• **Datos de la cuenta**: Mientras la cuenta del Usuario permanezca activa. Tras la solicitud de baja, se conservarán durante **seis (6) meses** para atender posibles reclamos.
• **Datos de compras y facturación**: **Diez (10) años**, conforme a las obligaciones fiscales y contables (Ley 11.683 y Código de Comercio).
• **Datos de navegación y cookies**: Máximo **doce (12) meses** desde su recolección.
• **Comunicaciones de soporte**: **Dos (2) años** desde la última interacción.

Una vez vencidos los plazos de retención, los datos serán eliminados de forma segura o anonimizados de manera irreversible.`
    },
    {
      title: '11. Transferencia Internacional de Datos',
      content: `Algunos de los servicios tecnológicos utilizados por La Martina (como servicios de alojamiento web y bases de datos) pueden operar desde servidores ubicados fuera de la República Argentina. En tales casos:

• La Martina garantiza que los proveedores de servicios cumplen con estándares de protección de datos equivalentes a los establecidos por la legislación argentina.
• Las transferencias internacionales se realizan conforme a lo previsto en el Artículo 12 de la Ley 25.326, priorizando países con niveles adecuados de protección.
• Se establecen cláusulas contractuales que aseguran la confidencialidad y seguridad de los datos transferidos.`
    },
    {
      title: '12. Protección de Datos de Menores',
      content: `El Sitio no está dirigido a menores de **13 años**. La Martina no recopila intencionalmente datos personales de menores de 13 años. Si tomamos conocimiento de que hemos recopilado datos de un menor sin el consentimiento de su padre, madre o tutor legal, procederemos a eliminar dicha información de forma inmediata.

Los menores de entre 13 y 18 años podrán utilizar el Sitio únicamente con el consentimiento y supervisión de sus padres o representantes legales.`
    },
    {
      title: '13. Modificaciones a esta Política',
      content: `La Martina se reserva el derecho de modificar la presente Política de Privacidad en cualquier momento para adaptarla a cambios legislativos, jurisprudenciales, del sector o de nuestras propias prácticas internas.

Las modificaciones serán publicadas en el Sitio con indicación de la fecha de la última actualización. En caso de cambios sustanciales que afecten el tratamiento de datos personales, notificaremos a los Usuarios registrados a través de correo electrónico o notificación en el Sitio.

El uso continuado del Sitio después de la publicación de las modificaciones implica la aceptación de la nueva Política de Privacidad.`
    },
    {
      title: '14. Contacto del Delegado de Protección de Datos',
      content: `Para cualquier consulta, solicitud o reclamo relacionado con la protección de sus datos personales, el Usuario puede comunicarse con La Martina a través de los siguientes medios:

• **Email**: martinasuper1327@gmail.com (asunto: "Protección de Datos")
• **WhatsApp**: +54 9 261 713-9129
• **Teléfono**: (263) 477-6230
• **Dirección postal**: La Paz, Mendoza, Argentina

Nos comprometemos a responder todas las solicitudes dentro de los plazos legales establecidos.`
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
            <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight">
              Política de Privacidad
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
              Última actualización: {lastUpdated}
            </p>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed max-w-2xl">
          En Supermercado La Martina valoramos y protegemos tu privacidad. Esta política describe cómo recopilamos, usamos, almacenamos y protegemos tus datos personales cuando utilizás nuestro sitio web y servicios.
        </p>
      </div>

      {/* AAIP Notice */}
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200/60 rounded-2xl flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-600 text-[20px] mt-0.5 shrink-0">info</span>
        <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
          <strong>Aviso legal:</strong> La <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>, en su carácter de órgano de control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
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
          <span className="material-symbols-outlined text-primary text-[22px] mt-0.5 shrink-0">lock</span>
          <div>
            <p className="text-sm font-bold text-on-surface mb-1">Tu privacidad es nuestra prioridad</p>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Si querés ejercer tus derechos ARCO (Acceso, Rectificación, Cancelación, Oposición) o tenés consultas sobre el tratamiento de tus datos, contactanos por{' '}
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
          to="/terms"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-primary font-bold bg-primary/5 hover:bg-primary/10 px-4 py-2.5 rounded-xl transition-colors border border-primary/10"
        >
          <span className="material-symbols-outlined text-[16px]">gavel</span>
          Términos y Condiciones
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
