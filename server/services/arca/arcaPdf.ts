import PDFDocument from 'pdfkit';
import { generateQrBuffer, buildArcaQrPayload, buildArcaQrUrl } from './arcaQr';
import { InvoiceType } from './arcaTypes';

export interface FiscalInvoicePdfData {
  invoiceType: InvoiceType;
  invoiceTypeCode: number;
  pointOfSale: number;
  invoiceNumber: number;
  date: string; // YYYY-MM-DD o DD/MM/YYYY
  emitter: {
    businessName: string;
    cuit: string;
    taxCondition: string;
    grossIncome: string;
    startDate: string;
    fiscalAddress: string;
  };
  customer: {
    name: string;
    documentType: string;
    documentTypeCode?: number;
    documentNumber: string;
    cuit?: string;
    taxCondition: string;
    address?: string;
  };
  items: Array<{
    code?: string;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    vatRate: number;
    total: number;
  }>;
  subtotalNet: number;
  taxes: number;
  total: number;
  cae: string;
  caeExpirationDate: string;
  currency?: string;
}

/**
 * Genera el documento PDF fiscal oficial con formato reglamentario argentino utilizando PDFKit.
 */
export async function generateFiscalInvoicePdf(data: FiscalInvoicePdfData): Promise<Buffer> {
  // 1. Generar QR Oficial de ARCA
  const qrPayload = buildArcaQrPayload({
    date: data.date,
    emitterCuit: data.emitter.cuit,
    pointOfSale: data.pointOfSale,
    invoiceTypeCode: data.invoiceTypeCode,
    invoiceNumber: data.invoiceNumber,
    total: data.total,
    currency: data.currency || 'PES',
    customerDocumentTypeCode: data.customer.documentTypeCode,
    customerDocumentNumber: data.customer.documentNumber || data.customer.cuit,
    cae: data.cae,
    status: 'AUTORIZADA'
  });

  const qrUrl = buildArcaQrUrl(qrPayload);
  const qrBuffer = await generateQrBuffer(qrUrl);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `Factura_${data.invoiceType}_${String(data.pointOfSale).padStart(4, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`,
          Author: data.emitter.businessName,
          Subject: 'Factura Electrónica ARCA'
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const pvStr = String(data.pointOfSale).padStart(4, '0');
      const numStr = String(data.invoiceNumber).padStart(8, '0');
      const letter = data.invoiceType.replace('NC_', '').replace('ND_', '');
      const docTitle = data.invoiceType.startsWith('NC') ? 'NOTA DE CRÉDITO' : 'FACTURA';

      // ─── MARCO EXTERIOR ──────────────────────────────────────────
      doc.rect(36, 36, 523, 770).lineWidth(1).stroke('#333333');

      // ─── CUADRO CENTRAL DE LETRA (A, B, C) ────────────────────────
      doc.rect(275, 36, 45, 45).lineWidth(1).stroke('#333333');
      doc.fontSize(24).font('Helvetica-Bold').text(letter, 275, 42, { width: 45, align: 'center' });
      doc.fontSize(7).font('Helvetica').text(`COD. ${String(data.invoiceTypeCode).padStart(2, '0')}`, 275, 70, { width: 45, align: 'center' });

      // Línea divisoria central vertical
      doc.moveTo(297, 81).lineTo(297, 180).lineWidth(0.5).stroke('#cccccc');

      // ─── CABECERA IZQUIERDA: EMISOR ──────────────────────────────
      doc.fontSize(14).font('Helvetica-Bold').text(data.emitter.businessName, 46, 50, { width: 220 });
      doc.fontSize(8).font('Helvetica')
        .text(`Razón Social: ${data.emitter.businessName}`, 46, 85)
        .text(`Domicilio Comercial: ${data.emitter.fiscalAddress}`, 46, 100, { width: 220 })
        .text(`Condición frente al IVA: ${data.emitter.taxCondition}`, 46, 125);

      // ─── CABECERA DERECHA: COMPROBANTE ───────────────────────────
      doc.fontSize(14).font('Helvetica-Bold').text(docTitle, 330, 50);
      doc.fontSize(10).font('Helvetica-Bold').text(`Punto de Venta: ${pvStr}   Comp. Nro: ${numStr}`, 330, 75);
      doc.fontSize(9).font('Helvetica')
        .text(`Fecha de Emisión: ${data.date}`, 330, 95)
        .text(`CUIT: ${data.emitter.cuit}`, 330, 110)
        .text(`Ingresos Brutos: ${data.emitter.grossIncome || 'Exento'}`, 330, 125)
        .text(`Inicio de Actividades: ${data.emitter.startDate || '01/01/2024'}`, 330, 140);

      // Línea divisoria de cabecera
      doc.moveTo(36, 175).lineTo(559, 175).lineWidth(1).stroke('#333333');

      // ─── DATOS DEL RECEPTOR (CLIENTE) ────────────────────────────
      doc.fontSize(8).font('Helvetica-Bold')
        .text(`CUIT / Documento: `, 46, 185, { continued: true })
        .font('Helvetica').text(`${data.customer.documentNumber || data.customer.cuit || 'Consumidor Final'}`)
        .font('Helvetica-Bold').text(`Apellido y Nombre / Razón Social: `, 46, 200, { continued: true })
        .font('Helvetica').text(`${data.customer.name}`)
        .font('Helvetica-Bold').text(`Condición frente al IVA: `, 46, 215, { continued: true })
        .font('Helvetica').text(`${data.customer.taxCondition}`)
        .font('Helvetica-Bold').text(`Domicilio: `, 330, 185, { continued: true })
        .font('Helvetica').text(`${data.customer.address || 'San Luis'}`)
        .font('Helvetica-Bold').text(`Condición de Venta: `, 330, 200, { continued: true })
        .font('Helvetica').text(`Contado`);

      // Línea divisoria de cliente
      doc.moveTo(36, 235).lineTo(559, 235).lineWidth(1).stroke('#333333');

      // ─── TABLA DE ARTÍCULOS ──────────────────────────────────────
      const tableTop = 242;
      doc.rect(36, tableTop, 523, 18).fill('#f3f4f6');
      doc.fillColor('#000000');
      doc.fontSize(8).font('Helvetica-Bold')
        .text('Código', 46, tableTop + 5, { width: 60 })
        .text('Descripción', 110, tableTop + 5, { width: 190 })
        .text('Cantidad', 305, tableTop + 5, { width: 45, align: 'right' })
        .text('U.M.', 355, tableTop + 5, { width: 35, align: 'center' })
        .text('Precio Unit.', 395, tableTop + 5, { width: 50, align: 'right' })
        .text('% IVA', 450, tableTop + 5, { width: 35, align: 'right' })
        .text('Subtotal', 490, tableTop + 5, { width: 60, align: 'right' });

      let currentY = tableTop + 24;
      doc.font('Helvetica').fontSize(8);

      data.items.slice(0, 18).forEach((item, index) => {
        if (index % 2 === 1) {
          doc.rect(36, currentY - 2, 523, 14).fill('#fafafa');
          doc.fillColor('#000000');
        }

        doc.text(item.code || 'GEN', 46, currentY, { width: 60 });
        doc.text(item.description, 110, currentY, { width: 190, ellipsis: true });
        doc.text(item.quantity.toFixed(2), 305, currentY, { width: 45, align: 'right' });
        doc.text(item.unit || 'un', 355, currentY, { width: 35, align: 'center' });
        doc.text(`$${item.unitPrice.toFixed(2)}`, 395, currentY, { width: 50, align: 'right' });
        doc.text(`${item.vatRate}%`, 450, currentY, { width: 35, align: 'right' });
        doc.text(`$${item.total.toFixed(2)}`, 490, currentY, { width: 60, align: 'right' });

        currentY += 14;
      });

      // ─── RESUMEN DE TOTALES ──────────────────────────────────────
      const totalsY = 660;
      doc.moveTo(36, totalsY).lineTo(559, totalsY).lineWidth(1).stroke('#333333');

      doc.fontSize(8).font('Helvetica')
        .text(`Subtotal Neto Gravado: $${data.subtotalNet.toFixed(2)}`, 340, totalsY + 10, { width: 210, align: 'right' })
        .text(`IVA Liquidado: $${data.taxes.toFixed(2)}`, 340, totalsY + 25, { width: 210, align: 'right' });

      doc.fontSize(11).font('Helvetica-Bold')
        .text(`TOTAL GENERAL: $${data.total.toFixed(2)}`, 340, totalsY + 45, { width: 210, align: 'right' });

      // ─── PIE FISCAL CON QR, CAE Y VENCIMIENTO ─────────────────────
      const footerY = 720;
      doc.moveTo(36, footerY).lineTo(559, footerY).lineWidth(1).stroke('#333333');

      // Incrustar imagen QR oficial
      doc.image(qrBuffer, 46, footerY + 8, { width: 68, height: 68 });

      doc.fontSize(9).font('Helvetica-Bold')
        .text(`CAE N°: `, 130, footerY + 20, { continued: true })
        .font('Helvetica').text(data.cae)
        .font('Helvetica-Bold').text(`Fecha de Vto. de CAE: `, 130, footerY + 38, { continued: true })
        .font('Helvetica').text(data.caeExpirationDate);

      doc.fontSize(7).font('Helvetica-Oblique').fillColor('#666666')
        .text('Comprobante Autorizado por ARCA (ex-AFIP). La autenticidad de este documento puede verificarse escaneando el código QR con cualquier dispositivo móvil.', 130, footerY + 58, { width: 410 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
