import React, { useState, useEffect, useRef } from 'react';
import { thermalPrinterService } from '../services/thermalPrinter.service';
import { billingService } from '../services/billing.service';
import { useAdmin } from '../context/AdminContext';

export interface FiscalTicketPrinterProps {
  invoice: any;
  isOpen: boolean;
  autoPrint?: boolean;
  onClose: () => void;
}

// ─── COMPONENTE DE CÓDIGO DE BARRAS TIPO CODE128 PARA TICKET TÉRMICO ───────
const BarcodeStripe: React.FC = () => (
  <div className="w-full flex justify-center py-0.5">
    <svg
      className="w-full max-w-[270px] h-7 text-black"
      viewBox="0 0 270 28"
      preserveAspectRatio="none"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 0h3v28H4zm5 0h2v28H9zm4 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h1v28h-1zm3 0h3v28h-3zm5 0h2v28h-2zm4 0h4v28h-4zm6 0h1v28h-1zm3 0h2v28h-2zm4 0h3v28h-3zm5 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h1v28h-1zm3 0h3v28h-3zm5 0h2v28h-2zm4 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h3v28h-3zm5 0h1v28h-1zm3 0h2v28h-2zm4 0h4v28h-4zm6 0h1v28h-1zm3 0h3v28h-3zm5 0h2v28h-2zm4 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h3v28h-3zm5 0h1v28h-1zm3 0h2v28h-2zm4 0h4v28h-4zm6 0h1v28h-1zm3 0h3v28h-3zm5 0h2v28h-2zm4 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h3v28h-3zm5 0h1v28h-1zm3 0h2v28h-2zm4 0h4v28h-4zm6 0h2v28h-2zm4 0h1v28h-1zm3 0h3v28h-3zm5 0h2v28h-2zm4 0h1v28h-1zm3 0h4v28h-4zm6 0h2v28h-2zm4 0h3v28h-3zm5 0h2v28h-2zm4 0h3v28h-3z" />
    </svg>
  </div>
);

// ─── LÍNEA DIVISORIA GUIONADA PARA TICKET TÉRMICO ──────────────────────────
const TicketDivider: React.FC = () => (
  <div className="border-b border-dashed border-neutral-400 my-1 w-full" />
);

export const FiscalTicketPrinter: React.FC<FiscalTicketPrinterProps> = ({
  invoice,
  isOpen,
  autoPrint = true,
  onClose
}) => {
  const { fiscalConfig } = useAdmin();
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [printMethod, setPrintMethod] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const hasAutoPrintedRef = useRef(false);

  // ─── REGLA 1: VALIDACIÓN ESTRICTA FISCAL ANTES DE RENDERIZAR O IMPRIMIR ───
  const isCaeValid = Boolean(
    invoice &&
    invoice.status === 'AUTORIZADA' &&
    invoice.cae &&
    /^\d{14}$/.test(String(invoice.cae).trim())
  );

  const cleanCae = isCaeValid ? String(invoice.cae).trim() : null;

  const handleDirectPrint = async () => {
    if (!isCaeValid || !invoice) {
      setPrintError('La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal.');
      return;
    }

    setIsPrinting(true);
    setPrintError(null);

    try {
      // Envío DIRECTO a la impresora térmica sin abrir diálogo del navegador
      const result = await thermalPrinterService.printFiscalTicket(invoice, undefined, fiscalConfig);
      setPrintSuccess(true);
      setPrintMethod(result.method === 'qz-tray' ? 'QZ Tray (Directo)' : 'Puente Local (Windows Spooler)');
    } catch (err: any) {
      console.warn('[FiscalTicketPrinter] Error en impresión directa:', err.message);
      // REGLA CRÍTICA: El fallo de impresora NO desautoriza la factura
      setPrintError(err.message || 'Error de comunicación con la impresora térmica.');
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    if (isOpen && isCaeValid && autoPrint && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      // Disparo automático e inmediato de la impresión directa
      handleDirectPrint();
    }
  }, [isOpen, isCaeValid, autoPrint]);

  if (!isOpen) return null;

  // ─── CASO DE FACTURA NO AUTORIZADA O SIN CAE VÁLIDO ──────────────────────
  if (!isCaeValid) {
    return (
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 animate-in zoom-in-95">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">
            <span className="material-symbols-outlined text-[36px]">block</span>
          </div>
          <h3 className="text-lg font-black text-neutral-900">Impresión Fiscal Bloqueada</h3>
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 font-medium text-left space-y-2">
            <p className="font-bold">
              La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal.
            </p>
            <p className="text-[11px] text-red-700">
              Estado: <span className="font-mono font-bold">{invoice?.status || 'SIN_ESTADO'}</span>
              <br />
              CAE: <span className="font-mono font-bold">{invoice?.cae || 'null (Sin CAE)'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-neutral-800 hover:bg-neutral-900 text-white font-bold py-3.5 rounded-2xl transition-all text-sm cursor-pointer"
          >
            Entendido / Cerrar
          </button>
        </div>
      </div>
    );
  }

  // ─── FORMATEO DE DATOS CON RIGOR FISCAL Y 2 DECIMALES ESTRICTOS ──────────
  const pv = String(invoice.pointOfSale || 1).padStart(4, '0');
  const cbte = String(invoice.invoiceNumber || 1).padStart(8, '0');
  const tipo = String(invoice.type || invoice.invoiceType || 'B').toUpperCase();
  const total = Number(invoice.total || 0);
  const subtotal = Number(invoice.subtotalNet ?? invoice.subtotal ?? (total / 1.21));
  const discountAmount = Number(invoice.discountAmount || 0);
  const ivaContenido = Math.max(0, total - subtotal);

  // Formato estricto de moneda argentina con exactamente 2 decimales
  const fmtMoney = (val: number | string | undefined | null) => {
    const num = Number(val || 0);
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Código de comprobante AFIP/ARCA
  const getCbteCode = (t: string) => {
    switch (t) {
      case 'A': return 'Cod 01';
      case 'B': return 'Cod 06';
      case 'C': return 'Cod 11';
      case 'M': return 'Cod 51';
      default: return 'Cod 06';
    }
  };

  // Fecha y hora del comprobante
  let dateObj = new Date();
  if (invoice.date) {
    const parsed = new Date(invoice.date);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }
  const dateStr = dateObj.toLocaleDateString('es-AR');
  const timeStr = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // Vencimiento CAE
  let vtoDate = invoice.caeExpirationDate || '';
  if (vtoDate && vtoDate.length === 8 && /^\d{8}$/.test(vtoDate)) {
    vtoDate = `${vtoDate.slice(6, 8)}/${vtoDate.slice(4, 6)}/${vtoDate.slice(0, 4)}`;
  }

  // Etiqueta legible de forma de pago
  const getPaymentMethodLabel = (method?: string) => {
    if (!method) return 'EFECTIVO';
    const m = String(method).toLowerCase();
    if (m.includes('deb') || m.includes('master') || m.includes('visa deb')) return 'MASTER CARD DEBITO';
    if (m.includes('cred') || m.includes('tarjeta')) return 'TARJETA DE CREDITO';
    if (m.includes('transf') || m.includes('mp') || m.includes('mercado')) return 'MERCADO PAGO';
    if (m.includes('cuenta') || m.includes('corriente')) return 'CTA. CORRIENTE';
    return 'EFECTIVO';
  };

  const items: any[] = invoice.items || [];
  const clientName = (invoice.customerName || invoice.clientName || 'Consumidor Final').toUpperCase();
  const clientDoc = (invoice.customerDocumentNumber || invoice.clientCuit || '').replace(/\D/g, '');
  const taxCond = (invoice.customerTaxCondition || 'CONSUMIDOR FINAL').toUpperCase();

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[94vh] overflow-hidden flex flex-col animate-in zoom-in-95">
        
        {/* Header del Modal */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/10 bg-[#e6fcf0] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[24px]">print</span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                Ticket Térmico Fiscal ARCA
              </span>
              <h3 className="text-base font-black text-emerald-950 mt-0.5">
                Factura {tipo} #{pv}-{cbte}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 text-neutral-600 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Notificaciones de Estado de Impresión Directa */}
        {isPrinting && (
          <div className="p-3 bg-blue-50 border-b border-blue-200 text-xs text-blue-900 font-bold flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Enviando comprobante directamente a la impresora térmica...
          </div>
        )}

        {printSuccess && !isPrinting && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-900 font-bold flex items-center justify-center gap-2 animate-in fade-in">
            <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
            ¡Ticket enviado exitosamente a la impresora térmica ({printMethod})!
          </div>
        )}

        {printError && !isPrinting && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 font-medium space-y-1.5 animate-in fade-in">
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <span className="material-symbols-outlined text-amber-700 text-[18px]">info</span>
              Aviso de Impresora Térmica
            </div>
            <p className="whitespace-pre-line leading-relaxed">{printError}</p>
            <p className="text-[11px] text-emerald-800 font-bold mt-1">
              ✓ Comprobante autorizado con CAE por ARCA y persistido. Si estás en modo de prueba sin impresora física conectada, podés revisar el ticket abajo o descargar el PDF oficial.
            </p>
          </div>
        )}

        {/* ─── VISTA PREVIA DEL PAPEL TÉRMICO ─────────────────────────────── */}
        {/* Contenedor gris scrolleable con flex-col centrado para evitar que el papel se corte */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-neutral-200/90 flex flex-col items-center min-h-0">
          {/* Tarjeta del papel térmico blanco: h-fit y shrink-0 aseguran que el papel envuelva TODO */}
          <div className="w-full max-w-[350px] bg-white p-5 sm:p-6 rounded-2xl shadow-xl border border-neutral-300 font-mono text-[11px] text-black leading-tight space-y-2.5 h-fit my-auto shrink-0 select-text">
            
            {/* 1. Header Comprobante */}
            <div className="text-center space-y-1">
              <div className="font-bold text-sm tracking-wide">
                FACTURA {tipo} {pv}-{cbte}
              </div>
              <div className="flex justify-between text-[10px] text-neutral-800">
                <span className="font-bold">{getCbteCode(tipo)}</span>
                <span className="font-bold tracking-wider">(ORIGINAL)</span>
                <span>{dateStr} {timeStr}</span>
              </div>
            </div>

            {/* 2. Encabezado Comercio */}
            <div className="space-y-0.5 text-[10.5px]">
              <p className="font-bold text-xs uppercase">{fiscalConfig?.fantasyName || 'LA MARTINA SUPERMERCADO'}</p>
              <p className="text-[10px] text-neutral-800">De: {fiscalConfig?.businessName || 'MARTINA SUPERMERCADO S.R.L.'}</p>
              <div className="flex justify-between text-[10px]">
                <span>CUIT {invoice.emitterCuit || fiscalConfig?.cuit || '30-71850123-4'}</span>
                <span className="font-bold">IVA: {fiscalConfig?.taxCondition === 'Responsable Inscripto' ? 'RI' : (fiscalConfig?.taxCondition || 'RI')}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>Ing.Br: {fiscalConfig?.grossIncome || '750953'}</span>
                <span>Fec.I.Act: {fiscalConfig?.startDate || '01/10/2015'}</span>
              </div>
              <p className="text-[10px]">{fiscalConfig?.fiscalAddress || 'Av. Libertador 1234'}</p>
              <p className="text-[10px]">{fiscalConfig?.postalCode ? `CP(${fiscalConfig.postalCode}) SAN LUIS` : 'CP(5700) SAN LUIS'}</p>
              {fiscalConfig?.phone && <p className="text-[10px]">Tel: {fiscalConfig.phone}</p>}
            </div>

            <TicketDivider />

            {/* 3. Datos del Receptor / Cliente */}
            <div className="text-[10.5px] space-y-0.5">
              {taxCond.includes('CONSUMIDOR FINAL') ? (
                <>
                  <p className="font-bold">A CONSUMIDOR FINAL</p>
                  {clientDoc && clientDoc !== '0' && <p>DNI: {clientDoc}</p>}
                </>
              ) : (
                <>
                  <p className="font-bold truncate">CLIENTE: {clientName}</p>
                  <p>CUIT/DNI: {clientDoc || 'S/D'}</p>
                  <p>IVA: {taxCond}</p>
                </>
              )}
            </div>

            <TicketDivider />

            {/* 4. Detalle de Artículos */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold text-[10px] uppercase border-b border-neutral-200 pb-0.5">
                <span>DESCRIPCIÓN</span>
                <span>TOTAL</span>
              </div>
              {items.map((item, idx) => {
                const qty = Number(item.quantity || 1);
                const unitPrice = Number(item.price || (item.total / qty));
                const lineTotal = Number(item.total || (qty * unitPrice));
                return (
                  <div key={idx} className="space-y-0.5">
                    <p className="font-bold uppercase truncate">
                      {item.description || item.name || 'PRODUCTO'}
                    </p>
                    <div className="flex justify-between text-neutral-800 text-[10px]">
                      <span>
                        {qty} x ${fmtMoney(unitPrice)}
                      </span>
                      <span className="font-bold text-black">
                        ${fmtMoney(lineTotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <TicketDivider />

            {/* 5. Totales */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-neutral-800">
                <span>Subtotal:</span>
                <span>${fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-800">
                <span>Desc/Rec:</span>
                <span>{discountAmount > 0 ? `-$${fmtMoney(discountAmount)}` : '$0,00'}</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-1 border-t border-neutral-300">
                <span>TOTAL:</span>
                <span>${fmtMoney(total)}</span>
              </div>
            </div>

            <TicketDivider />

            {/* 6. Recibimos / Medio de Pago */}
            <div className="space-y-0.5 text-[10.5px]">
              <p className="font-bold text-[10px] text-neutral-700">Recibi(mos):</p>
              <div className="flex justify-between font-bold">
                <span>{getPaymentMethodLabel(invoice.paymentMethod)}</span>
                <span>${fmtMoney(total)}</span>
              </div>
            </div>

            <TicketDivider />

            {/* 7. Transparencia Fiscal (Ley 27.743) */}
            <div className="space-y-0.5 text-[10px]">
              <p className="font-bold text-neutral-800">Transparencia Fiscal (Ley 27.743)</p>
              <div className="flex justify-between text-neutral-700">
                <span>IVA Contenido:</span>
                <span>${fmtMoney(ivaContenido)}</span>
              </div>
              <div className="flex justify-between text-neutral-700">
                <span>Otros Impuestos Nacionales Indirectos:</span>
                <span>$0,00</span>
              </div>
            </div>

            <TicketDivider />

            {/* 8. Códigos de Barras y Operador */}
            <div className="space-y-1">
              <BarcodeStripe />
              <div className="flex justify-end text-[10px] text-neutral-800 font-mono">
                <span>Operador: 1</span>
              </div>
              <BarcodeStripe />
              <div className="flex justify-between text-[10px] font-bold">
                <span>CAE {cleanCae}</span>
                <span>Vencim: {vtoDate || 'N/A'}</span>
              </div>
            </div>

            <TicketDivider />

            {/* 9. Código QR Oficial ARCA y Pie Fiscal */}
            <div className="text-center pt-1 space-y-1.5 flex flex-col items-center">
              {invoice.qrDataUrl ? (
                <div className="p-1 bg-white border border-neutral-300 rounded-lg shadow-sm">
                  <img
                    src={invoice.qrDataUrl}
                    alt="QR Fiscal Oficial ARCA"
                    className="w-32 h-32 object-contain block mx-auto"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 border border-dashed border-neutral-400 rounded-lg flex items-center justify-center text-[10px] text-neutral-400">
                  QR ARCA
                </div>
              )}
              <p className="text-[9.5px] uppercase font-bold tracking-wider text-neutral-700">
                COMPROBANTE AUTORIZADO POR ARCA
              </p>
            </div>

          </div>
        </div>

        {/* Botones de Acción */}
        <div className="p-4 sm:p-5 border-t border-outline-variant/10 bg-white flex flex-wrap gap-2.5 shrink-0 justify-between items-center">
          <div className="flex gap-2 flex-1 min-w-[240px]">
            <button
              type="button"
              disabled={isPrinting}
              onClick={handleDirectPrint}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-black py-3 px-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${isPrinting ? 'animate-spin' : ''}`}>
                {isPrinting ? 'progress_activity' : 'print'}
              </span>
              {isPrinting ? 'Imprimiendo...' : 'Reimprimir Térmica'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (invoice?.id) {
                  billingService.openInvoicePdf(invoice.id);
                }
              }}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-200 font-black py-3 px-3.5 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              title="Ver o descargar el PDF oficial generado con CAE"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              Ver PDF Fiscal
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 font-bold text-neutral-600 hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

