import JsBarcode from 'jsbarcode';
import { Product } from '../types/product.types';

export type PriceTagPaperFormat = '80mm' | '58mm' | 'a4_grid' | 'custom';

export interface PriceTagConfig {
  paperFormat: PriceTagPaperFormat;
  widthMm: number;        // Ancho en mm (ej: 72 para 80mm, 48 para 58mm, 65 para A4)
  heightMm: number;       // Alto en mm (ej: 38 para estándar)
  showBrand: boolean;     // Mostrar marca arriba en negrita
  showName: boolean;      // Mostrar nombre del producto
  showFormat: boolean;    // Mostrar formato/presentación arriba a la derecha (ej: 700ML)
  showBarcode: boolean;   // Mostrar código de barras 1D
  showBarcodeText: boolean; // Mostrar numeración bajo las barras
  showCuttingLine: boolean; // Mostrar línea de puntos con tijera entre tickets
  showDate: boolean;      // Mostrar fecha de impresión/actualización
  fontSize: 'compact' | 'medium' | 'large';
  pageBreakPerTag: boolean; // Salto de página tras cada etiqueta (para rollos de stickers troquelados)
  columnsA4: number;      // Columnas en formato hoja A4 (ej: 3)
}

export const defaultPriceTagConfig: PriceTagConfig = {
  paperFormat: '80mm',
  widthMm: 72,
  heightMm: 38,
  showBrand: true,
  showName: true,
  showFormat: true,
  showBarcode: true,
  showBarcodeText: true,
  showCuttingLine: true,
  showDate: false,
  fontSize: 'medium',
  pageBreakPerTag: false,
  columnsA4: 3,
};

/**
 * Genera el SVG vector de código de barras 1D usando JsBarcode.
 * Compatible con cualquier código numérico o alfanumérico (CODE128).
 */
export function generateBarcodeSvg(
  barcodeValue: string, 
  options?: { height?: number; width?: number; displayValue?: boolean; fontSize?: number }
): string {
  if (!barcodeValue || barcodeValue.trim() === '') return '';
  const cleanCode = barcodeValue.trim();
  
  try {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, cleanCode, {
      format: 'CODE128',
      lineColor: '#000000',
      width: options?.width ?? 1.5,
      height: options?.height ?? 32,
      displayValue: options?.displayValue ?? true,
      text: cleanCode,
      font: 'monospace',
      fontSize: options?.fontSize ?? 10,
      textMargin: 2,
      margin: 0,
      background: 'transparent',
    });
    return svgNode.outerHTML;
  } catch (err) {
    console.warn('JsBarcode SVG generation warning for code:', cleanCode, err);
    return `<div style="font-family: monospace; font-size: 11px; font-weight: bold; border: 1px dashed #999; padding: 4px; text-align: center; background: #fafafa;">${cleanCode}</div>`;
  }
}

/**
 * Formatea moneda para el precio grande (ej: $15.400)
 */
export function formatTagPrice(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Genera el HTML de una etiqueta individual con los estilos exactos de la imagen.
 */
export function renderSinglePriceTagHtml(
  product: Product,
  config: PriceTagConfig,
  currentDateStr: string
): string {
  const barcode = (product.barcode || product.id || '').trim();
  const barcodeSvg = config.showBarcode && barcode
    ? generateBarcodeSvg(barcode, {
        height: config.fontSize === 'compact' ? 26 : config.fontSize === 'large' ? 38 : 32,
        width: config.paperFormat === '58mm' ? 1.2 : 1.5,
        displayValue: config.showBarcodeText,
        fontSize: config.fontSize === 'compact' ? 9 : 11,
      })
    : '';

  const brand = (product.brand || '').trim();
  const name = (product.name || '').trim();
  const format = (product.format || '').trim();
  const priceFormatted = formatTagPrice(product.price);

  // Dimensiones según formato
  const widthCss = config.paperFormat === 'custom' 
    ? `${config.widthMm}mm` 
    : config.paperFormat === '58mm' 
      ? '48mm' 
      : config.paperFormat === '80mm' 
        ? '72mm' 
        : '100%';

  const minHeightCss = config.heightMm ? `${config.heightMm}mm` : 'auto';

  // Tamaños de fuente
  const titleSize = config.fontSize === 'compact' ? '11px' : config.fontSize === 'large' ? '15px' : '13px';
  const subtitleSize = config.fontSize === 'compact' ? '9px' : config.fontSize === 'large' ? '12px' : '10.5px';
  const priceSize = config.fontSize === 'compact' ? '22px' : config.fontSize === 'large' ? '32px' : '26px';

  return `
    <div class="price-tag-wrapper" style="width: ${widthCss}; margin: 0 auto; page-break-inside: avoid; break-inside: avoid; ${config.pageBreakPerTag ? 'page-break-after: always; break-after: page;' : ''}">
      <div class="price-tag-box" style="
        border: 1.5px solid #000;
        border-radius: 4px;
        padding: 6px 8px 6px 8px;
        background: #ffffff;
        box-sizing: border-box;
        text-align: center;
        min-height: ${minHeightCss};
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      ">
        <!-- Encabezado con Marca / Nombre / Formato -->
        <div style="position: relative; margin-bottom: 2px;">
          ${config.showFormat && format ? `
            <span style="position: absolute; right: 0; top: 0; font-size: 8.5px; font-weight: 800; color: #333; text-transform: uppercase;">
              ${format}
            </span>
          ` : ''}

          ${config.showBrand && brand ? `
            <div style="font-size: ${titleSize}; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.2px; line-height: 1.15; padding-right: ${format ? '28px' : '0'}; word-break: break-word;">
              ${brand}
            </div>
            ${config.showName && name && name.toLowerCase() !== brand.toLowerCase() ? `
              <div style="font-size: ${subtitleSize}; font-weight: 700; color: #111; text-transform: uppercase; line-height: 1.15; margin-top: 1px; word-break: break-word;">
                ${name}
              </div>
            ` : ''}
          ` : `
            <div style="font-size: ${titleSize}; font-weight: 900; color: #000; text-transform: uppercase; line-height: 1.15; padding-right: ${format ? '28px' : '0'}; word-break: break-word;">
              ${name || brand}
            </div>
          `}
        </div>

        <!-- Precio Grande Destacado -->
        <div style="margin: 3px 0 2px 0;">
          <div style="font-size: ${priceSize}; font-weight: 950; color: #000; letter-spacing: -0.5px; line-height: 1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            ${priceFormatted}
          </div>
        </div>

        <!-- Código de barras y pie -->
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 2px;">
          ${barcodeSvg ? `
            <div style="display: flex; justify-content: center; width: 100%; overflow: hidden;">
              ${barcodeSvg}
            </div>
          ` : `
            <div style="font-size: 9px; font-weight: bold; color: #666; font-family: monospace;">
              ${barcode || 'SIN CÓDIGO'}
            </div>
          `}

          ${config.showDate ? `
            <div style="font-size: 7.5px; color: #666; font-weight: 600; margin-top: 2px; text-transform: uppercase;">
              Act. ${currentDateStr}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Línea de corte con tijeras -->
      ${config.showCuttingLine ? `
        <div class="cutting-line" style="
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 6px 0;
          color: #777;
          font-size: 11px;
          user-select: none;
        ">
          <div style="flex: 1; border-top: 1px dashed #777; height: 1px;"></div>
          <span style="padding: 0 8px; font-size: 13px; line-height: 1;">✂</span>
          <div style="flex: 1; border-top: 1px dashed #777; height: 1px;"></div>
        </div>
      ` : `
        <div style="height: 8px;"></div>
      `}
    </div>
  `;
}

/**
 * Dispara la impresión silenciosa y limpia mediante un iframe oculto.
 */
export function printPriceTags(
  products: Product[],
  config: PriceTagConfig,
  copiesMap?: Record<string, number>
): void {
  if (!products || products.length === 0) return;

  const currentDateStr = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  // Generar lista de etiquetas según las copias solicitadas
  const tagsHtmlList: string[] = [];
  products.forEach(prod => {
    const copies = copiesMap?.[prod.id] ?? 1;
    for (let i = 0; i < copies; i++) {
      tagsHtmlList.push(renderSinglePriceTagHtml(prod, config, currentDateStr));
    }
  });

  const isRoll = config.paperFormat === '80mm' || config.paperFormat === '58mm';
  const rollWidth = config.paperFormat === '58mm' ? '58mm' : '80mm';

  let layoutContent = '';
  if (config.paperFormat === 'a4_grid') {
    const cols = config.columnsA4 || 3;
    layoutContent = `
      <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4mm; padding: 5mm; box-sizing: border-box;">
        ${tagsHtmlList.join('')}
      </div>
    `;
  } else {
    // Rollo continuo térmico o personalizado
    layoutContent = `
      <div style="width: ${isRoll ? rollWidth : '100%'}; margin: 0 auto; box-sizing: border-box; padding: 2mm 0;">
        ${tagsHtmlList.join('')}
      </div>
    `;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.id = 'price_tags_print_frame';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas de Precios</title>
        <style>
          @page {
            size: ${config.paperFormat === 'a4_grid' ? 'A4 portrait' : isRoll ? `${rollWidth} auto` : `${config.widthMm}mm auto`};
            margin: ${config.paperFormat === 'a4_grid' ? '8mm' : '0mm'};
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          svg {
            max-width: 100%;
            height: auto;
            shape-rendering: crispEdges;
          }
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        ${layoutContent}
      </body>
    </html>
  `);
  doc.close();

  // Esperar a que se carguen los estilos y SVGs antes de imprimir
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Limpieza tras imprimir
    setTimeout(() => {
      try {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      } catch (e) {
        console.error('Error removing print iframe:', e);
      }
    }, 2000);
  }, 350);
}
