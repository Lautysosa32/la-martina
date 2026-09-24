import QRCode from 'qrcode';

export interface ArcaQrData {
  ver: number;
  fecha: string; // YYYY-MM-DD
  cuit: number; // CUIT emisor
  ptoVta: number;
  tipoCmp: number; // Código oficial ARCA
  nroCmp: number;
  importe: number;
  moneda: string; // 'PES'
  ctz: number; // 1
  tipoDocRec?: number; // 80=CUIT, 96=DNI, 99=Sin identificar
  nroDocRec?: number;
  tipoCodAut: string; // 'E' para CAE
  codAut: number; // Número de CAE
}

export interface AuthorizedInvoiceForQr {
  date: string; // YYYY-MM-DD
  emitterCuit: string;
  pointOfSale: number;
  invoiceTypeCode: number;
  invoiceNumber: number;
  total: number;
  currency?: string;
  customerDocumentTypeCode?: number;
  customerDocumentNumber?: string;
  cae: string;
  status: string; // Must be 'AUTORIZADA'
}

const ARCA_QR_BASE_URL = 'https://www.afip.gob.ar/fe/qr/?p=';

/**
 * Construye el payload estructurado oficial exigido por ARCA (RG 4892/2020).
 * Exige estrictamente que la factura esté autorizada con CAE válido.
 */
export function buildArcaQrPayload(invoice: AuthorizedInvoiceForQr): string {
  if (invoice.status !== 'AUTORIZADA' || !invoice.cae) {
    throw new Error('No se puede generar código QR fiscal para una factura que no ha sido autorizada con CAE.');
  }

  const cleanCuit = parseInt(invoice.emitterCuit.replace(/\D/g, ''), 10);
  const cleanCae = parseInt(invoice.cae.replace(/\D/g, ''), 10);

  let docRecNum: number | undefined;
  if (invoice.customerDocumentNumber) {
    const parsed = parseInt(invoice.customerDocumentNumber.replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      docRecNum = parsed;
    }
  }

  const qrObj: ArcaQrData = {
    ver: 1,
    fecha: invoice.date.split('T')[0],
    cuit: cleanCuit,
    ptoVta: invoice.pointOfSale,
    tipoCmp: invoice.invoiceTypeCode,
    nroCmp: invoice.invoiceNumber,
    importe: Math.round((invoice.total + Number.EPSILON) * 100) / 100,
    moneda: invoice.currency || 'PES',
    ctz: 1,
    tipoDocRec: invoice.customerDocumentTypeCode ?? (docRecNum ? 96 : 99),
    nroDocRec: docRecNum,
    tipoCodAut: 'E',
    codAut: cleanCae
  };

  return JSON.stringify(qrObj);
}

/**
 * Codifica el payload en Base64 y construye la URL de validación fiscal de ARCA.
 */
export function buildArcaQrUrl(payload: string): string {
  const base64Payload = Buffer.from(payload, 'utf8').toString('base64');
  return `${ARCA_QR_BASE_URL}${base64Payload}`;
}

/**
 * Genera la imagen del código QR oficial en formato DataURL (base64 PNG) para frontend o PDF.
 */
export async function generateQrDataUrl(qrUrl: string): Promise<string> {
  return QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/**
 * Genera el buffer PNG del código QR oficial para incrustar en el PDF con PDFKit.
 */
export async function generateQrBuffer(qrUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}
