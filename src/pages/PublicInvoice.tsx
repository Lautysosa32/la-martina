import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Printer, 
  Share2, 
  ExternalLink, 
  AlertCircle, 
  ArrowLeft, 
  Maximize2, 
  X, 
  ShoppingBag, 
  Copy, 
  Check,
  FileText,
  ShieldCheck
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

interface InvoiceData {
  id: string;
  branch_id: string;
  direction: string;
  invoice_type: string;
  invoice_type_code: number;
  point_of_sale: number;
  invoice_number: number;
  date: string;
  customer_name: string;
  customer_document_type: string;
  customer_document_number: string;
  customer_cuit?: string | null;
  customer_tax_condition: string;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  subtotal_net: number;
  taxes: number;
  total: number;
  currency: string;
  status: string;
  service_used: string;
  cae: string;
  cae_expiration_date: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice?: number;
    price?: number;
    vatRate?: number;
    total?: number;
    netAmount?: number;
    vatAmount?: number;
    barcode?: string;
    codigoMtx?: string;
    unit?: string;
  }>;
  vat_breakdown?: Array<{
    vatCode: number;
    vatRate: number;
    vatAmount: number;
    baseAmount: number;
  }>;
  qr_payload?: string | null;
  created_at: string;
  created_by?: string | null;
}

export function PublicInvoice() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrVerificationUrl, setQrVerificationUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showEnlargedQr, setShowEnlargedQr] = useState(false);
  const [emitter, setEmitter] = useState<any>(null);

  useEffect(() => {
    async function loadInvoice() {
      if (!id) {
        setError('No se proporcionó un identificador de comprobante.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Consultar factura por ID
        const { data, error: dbError } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (dbError) {
          throw new Error(`Error al consultar el comprobante: ${dbError.message}`);
        }

        if (!data) {
          setError('El comprobante fiscal solicitado no fue encontrado o no está disponible.');
          setLoading(false);
          return;
        }

        setInvoice(data as InvoiceData);

        // Consultar configuración fiscal del emisor
        try {
          const { data: configData } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'fiscal_config')
            .maybeSingle();

          if (configData?.value) {
            setEmitter(configData.value);
          }
        } catch (_) {}

        // Generar QR oficial si está autorizada y tiene payload
        if (data.status === 'AUTORIZADA' && data.cae && data.qr_payload) {
          try {
            const b64 = btoa(data.qr_payload);
            const afipUrl = `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
            setQrVerificationUrl(afipUrl);

            const dataUrl = await QRCode.toDataURL(afipUrl, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 260,
              color: {
                dark: '#000000',
                light: '#ffffff'
              }
            });
            setQrDataUrl(dataUrl);
          } catch (qrErr) {
            console.error('Error generando QR de ARCA:', qrErr);
          }
        }
      } catch (err: any) {
        console.error('Error cargando factura pública:', err);
        setError(err.message || 'Error inesperado al cargar el comprobante.');
      } finally {
        setLoading(false);
      }
    }

    loadInvoice();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (navigator.share && invoice) {
      try {
        await navigator.share({
          title: `Factura ${invoice.invoice_type} N° ${String(invoice.point_of_sale).padStart(4, '0')}-${String(invoice.invoice_number).padStart(8, '0')} - La Martina`,
          text: `Comprobante Fiscal Oficial ARCA de Supermercado La Martina`,
          url: window.location.href
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const formatARS = (val: number | string | undefined | null) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
    return num.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDateAR = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) {
        // Formato YYYY-MM-DD
        const parts = isoString.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return isoString;
      }
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200 text-center max-w-md w-full animate-pulse">
          <div className="w-16 h-16 bg-red-100 rounded-full mx-auto flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-primary animate-bounce" />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Cargando Comprobante Fiscal...</h2>
          <p className="text-sm text-neutral-500">Estamos recuperando la información oficial desde ARCA</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full mx-auto flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Comprobante no disponible</h2>
          <p className="text-sm text-neutral-600 mb-6">{error || 'No se encontró la factura solicitada.'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-5 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            Ir a la tienda
          </Link>
        </div>
      </div>
    );
  }

  const pvStr = String(invoice.point_of_sale || 1).padStart(4, '0');
  const numStr = String(invoice.invoice_number || 1).padStart(8, '0');
  const invoiceTitle = invoice.invoice_type.startsWith('NC') 
    ? `NOTA DE CRÉDITO ${invoice.invoice_type.replace('NC', '').trim()}`
    : invoice.invoice_type.startsWith('ND')
    ? `NOTA DE DÉBITO ${invoice.invoice_type.replace('ND', '').trim()}`
    : `FACTURA ${invoice.invoice_type}`;

  return (
    <div className="min-h-screen bg-[#525659] py-4 sm:py-8 px-2 sm:px-4 flex flex-col items-center font-sans antialiased text-neutral-900">
      {/* Barra de Acciones Superior (Oculta en Impresión) */}
      <header className="print:hidden w-full max-w-4xl bg-[#323639] text-white px-4 py-3 rounded-xl shadow-lg mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link 
            to="/" 
            className="text-neutral-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium"
            title="Ir al inicio"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tienda</span>
          </Link>
          <span className="text-neutral-500">|</span>
          <span className="text-xs sm:text-sm font-semibold tracking-wide text-neutral-200">
            {invoiceTitle} N° {pvStr}-{numStr}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
            title="Copiar enlace"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copiado' : 'Copiar enlace'}</span>
          </button>

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer"
            title="Compartir comprobante"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compartir</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs sm:text-sm font-bold bg-primary hover:bg-primary-hover text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </header>

      {/* Contenedor Principal de la Factura (Estilo Hoja A4 Oficial) */}
      <main 
        id="factura-print-container" 
        className="w-full max-w-4xl bg-white text-black p-4 sm:p-8 rounded-lg shadow-2xl print:shadow-none print:m-0 print:p-4 print:max-w-none print:w-full border border-neutral-300 print:border-none"
      >
        {/* ENCABEZADO SUPERIOR */}
        <div className="border border-black mb-3">
          <div className="grid grid-cols-12 relative">
            {/* Mitad Izquierda: Emisor */}
            <div className="col-span-12 sm:col-span-5 p-3 sm:p-4 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-black">
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 uppercase">
                  {emitter?.fantasyName || 'LA MARTINA'}
                </h1>
                <p className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Supermercado y Autoservicio
                </p>
                <div className="mt-2 text-[11px] space-y-0.5 text-neutral-800">
                  <p className="font-semibold">{emitter?.businessName || 'MARTINA SUPERMERCADO S.R.L.'}</p>
                  <p>{emitter?.fiscalAddress || 'Av. Libertador 1234, San Luis, Argentina'}</p>
                  <p className="font-semibold text-neutral-900">IVA {emitter?.taxCondition || 'Responsable Inscripto'}</p>
                </div>
              </div>
            </div>

            {/* Recuadro Central: Letra del Comprobante */}
            <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-16 bg-white flex-col items-center justify-start border-l border-r border-black pt-1 z-10">
              <div className="w-12 h-11 border border-black flex items-center justify-center font-black text-3xl bg-neutral-50 shadow-inner">
                {invoice.invoice_type.replace(/[^ABC]/g, '') || invoice.invoice_type}
              </div>
              <span className="text-[9px] font-black mt-0.5">
                COD. {String(invoice.invoice_type_code || 6).padStart(3, '0')}
              </span>
              <span className="text-[8px] tracking-tighter uppercase font-bold text-neutral-500 mt-1">
                ORIGINAL
              </span>
            </div>

            {/* Mitad Derecha: Datos del Comprobante */}
            <div className="col-span-12 sm:col-span-7 p-3 sm:p-4 sm:pl-10 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <h2 className="text-lg sm:text-xl font-black uppercase text-neutral-900 tracking-wide">
                    {invoiceTitle}
                  </h2>
                  <span className="sm:hidden border border-black px-2 py-0.5 text-xs font-black bg-neutral-100">
                    LETRA {invoice.invoice_type} (COD. {String(invoice.invoice_type_code || 6).padStart(3, '0')})
                  </span>
                </div>

                <div className="mt-2 text-xs space-y-1">
                  <p className="font-mono text-sm font-bold">
                    Punto de Venta: <span className="font-black">{pvStr}</span> &nbsp; Comp. Nro: <span className="font-black">{numStr}</span>
                  </p>
                  <p className="text-[11px]">
                    <span className="font-bold">Fecha de Emisión:</span> {formatDateAR(invoice.date)}
                  </p>
                  <p className="text-[11px]">
                    <span className="font-bold">CUIT:</span> {emitter?.cuit || '---'}
                  </p>
                  <p className="text-[11px]">
                    <span className="font-bold">Ingresos Brutos:</span> {emitter?.grossIncome || '901-123456-7'}
                  </p>
                  <p className="text-[11px]">
                    <span className="font-bold">Fecha de Inicio de Actividades:</span> {emitter?.startDate || '01/01/2024'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PERÍODO FACTURADO */}
        <div className="border border-black p-2 text-[10px] sm:text-[11px] mb-3 grid grid-cols-1 sm:grid-cols-3 gap-1 bg-neutral-50">
          <div>
            <span className="font-bold">Período Facturado Desde:</span> {formatDateAR(invoice.date)}
          </div>
          <div>
            <span className="font-bold">Hasta:</span> {formatDateAR(invoice.date)}
          </div>
          <div>
            <span className="font-bold">Fecha de Vto. para el pago:</span> {formatDateAR(invoice.date)}
          </div>
        </div>

        {/* DATOS DEL RECEPTOR / CLIENTE */}
        <div className="border border-black p-3 text-[11px] mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            <div>
              <span className="font-bold">Documento:</span>{' '}
              {invoice.customer_document_type} {invoice.customer_document_number || 'Sin Identificar'}
            </div>
            <div>
              <span className="font-bold">Condición frente al IVA:</span>{' '}
              <span className="font-semibold">{invoice.customer_tax_condition || 'Consumidor Final'}</span>
            </div>
            <div>
              <span className="font-bold">Apellido y Nombre / Razón Social:</span>{' '}
              <span className="font-semibold uppercase">{invoice.customer_name || 'Consumidor Final'}</span>
            </div>
            <div>
              <span className="font-bold">Condición de Venta:</span> Contado / Efectivo / Débito
            </div>
            {invoice.customer_address && (
              <div className="col-span-full">
                <span className="font-bold">Domicilio:</span> {invoice.customer_address}
              </div>
            )}
          </div>
        </div>

        {/* TABLA DE PRODUCTOS / ÍTEMS */}
        <div className="border border-black mb-3">
          <table className="w-full text-left border-collapse text-[10px] sm:text-[11px] table-fixed">
            <thead>
              <tr className="bg-neutral-100 border-b border-black font-bold uppercase text-neutral-800">
                <th className="py-1.5 px-2 border-r border-black w-24">Código</th>
                <th className="py-1.5 px-2 border-r border-black">Descripción</th>
                <th className="py-1.5 px-2 border-r border-black text-right w-16">Cant.</th>
                <th className="py-1.5 px-2 border-r border-black text-center w-16">U.M.</th>
                <th className="py-1.5 px-2 border-r border-black text-right w-24">Precio Unit.</th>
                <th className="py-1.5 px-2 border-r border-black text-right w-16">% IVA</th>
                <th className="py-1.5 px-2 text-right w-24">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, idx) => {
                  const unitPrice = item.price ?? item.unitPrice ?? 0;
                  const qty = item.quantity || 1;
                  const rowSubtotal = item.total ?? (unitPrice * qty);
                  // If it's a UUID, we can optionally truncate it for display, but break-all is safer
                  const rawCode = item.codigoMtx || item.barcode || 'S/C';
                  const isUuid = rawCode.length > 20 && rawCode.includes('-');
                  const code = isUuid ? rawCode.split('-')[0] : rawCode;

                  return (
                    <tr key={idx} className="hover:bg-neutral-50/50">
                      <td className="py-1.5 px-2 border-r border-black font-mono text-[9px] text-neutral-600 break-all align-top">
                        {code}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black font-medium text-neutral-900 break-words align-top">
                        {item.description}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono align-top">
                        {qty}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-center text-neutral-600 align-top">
                        {item.unit || 'unidades'}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono">
                        ${formatARS(unitPrice)}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono">
                        {item.vatRate ?? 21}%
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-semibold">
                        ${formatARS(rowSubtotal)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-neutral-500 italic">
                    Sin detalle de ítems registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* CUADRO DE TOTALES */}
        <div className="border border-black mb-4 p-3 bg-neutral-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="text-[10px] text-neutral-600 space-y-1">
              <p className="font-semibold text-neutral-800">
                Moneda: Pesos Argentinos (ARS)
              </p>
              {invoice.invoice_type === 'B' ? (
                <p className="italic">
                  * El IVA se encuentra incluido en el precio final de acuerdo con la normativa vigente de ARCA para Facturas B.
                </p>
              ) : (
                <p>
                  * Factura A con IVA discriminado por alícuota aplicable.
                </p>
              )}
            </div>

            <div className="space-y-1 text-right text-xs">
              <div className="flex justify-between sm:justify-end gap-6 text-neutral-700">
                <span>Subtotal Neto:</span>
                <span className="font-mono font-medium">${formatARS(invoice.subtotal_net)}</span>
              </div>

              <div className="flex justify-between sm:justify-end gap-6 text-neutral-700">
                <span>IVA Liquidado:</span>
                <span className="font-mono font-medium">${formatARS(invoice.taxes)}</span>
              </div>

              <div className="flex justify-between sm:justify-end gap-6 text-base sm:text-lg font-black text-neutral-900 border-t border-neutral-300 pt-1 mt-1">
                <span className="uppercase">Importe Total:</span>
                <span className="font-mono text-primary">${formatARS(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PIE FISCAL OFICIAL ARCA (EX-AFIP) */}
        <div className="border border-black p-3 bg-white">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Lado Izquierdo: QR y Validación */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {qrDataUrl ? (
                <div 
                  className="relative group cursor-pointer border border-neutral-300 p-1 rounded bg-white shrink-0 hover:border-black transition-colors"
                  onClick={() => setShowEnlargedQr(true)}
                  title="Click para ampliar QR"
                >
                  <img 
                    src={qrDataUrl} 
                    alt="QR Fiscal ARCA" 
                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain" 
                  />
                  <div className="print:hidden absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity rounded">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                </div>
              ) : (
                <div className="w-24 h-24 border border-dashed border-neutral-300 flex items-center justify-center text-[10px] text-neutral-400 text-center p-2">
                  QR Fiscal en proceso
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-black text-neutral-900 tracking-tight">
                    Comprobante Autorizado por ARCA
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-neutral-500 max-w-xs leading-tight">
                  Esta Administración Federal no se responsabiliza por los datos ingresados en el comprobante.
                </p>
                {qrVerificationUrl && (
                  <a 
                    href={qrVerificationUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="print:hidden inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline pt-0.5"
                  >
                    <span>Verificar en sitio oficial ARCA</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Lado Derecho: CAE y Vencimiento */}
            <div className="w-full sm:w-auto text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-200">
              <div className="text-xs space-y-1">
                <p>
                  <span className="font-bold text-neutral-700">CAE N°:</span>{' '}
                  <span className="font-mono font-black text-sm text-neutral-900 tracking-wider">
                    {invoice.cae || 'N/A'}
                  </span>
                </p>
                <p>
                  <span className="font-bold text-neutral-700">Fecha de Vto. de CAE:</span>{' '}
                  <span className="font-mono font-bold text-neutral-900">
                    {formatDateAR(invoice.cae_expiration_date)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* PIE DE PÁGINA COMERCIAL */}
        <div className="mt-4 pt-3 text-center border-t border-neutral-200 text-[10px] text-neutral-500">
          <p className="font-medium text-neutral-700">
            Supermercado La Martina • Calidad y el mejor precio cerca tuyo
          </p>
          <p className="text-[9px] mt-0.5">
            Comprobante fiscal electrónico generado de acuerdo a la RG 4291/2018 y complementarias de ARCA.
          </p>
        </div>
      </main>

      {/* Modal QR Ampliado */}
      {showEnlargedQr && qrDataUrl && (
        <div 
          className="print:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowEnlargedQr(false)}
        >
          <div 
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowEnlargedQr(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 p-1 rounded-full hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-neutral-900 mb-1">
              Código QR Oficial ARCA
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Escaneá con la cámara de tu celular para validar este comprobante en el portal de ARCA.
            </p>

            <div className="bg-white p-3 border border-neutral-200 rounded-xl shadow-inner inline-block mb-4">
              <img 
                src={qrDataUrl} 
                alt="QR Fiscal ARCA Ampliado" 
                className="w-64 h-64 object-contain mx-auto" 
              />
            </div>

            {qrVerificationUrl && (
              <a
                href={qrVerificationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors w-full justify-center"
              >
                <span>Abrir portal oficial de ARCA</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PublicInvoice;
