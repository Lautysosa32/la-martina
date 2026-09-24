import axios from 'axios';
import { ArcaInvoiceService } from './ArcaInvoiceService';
import { arcaConfig } from '../arcaConfig';
import { getWsaaTicket } from '../arcaAuth';
import { 
  NormalizedVoucherRequest, 
  NormalizedVoucherResponse, 
  NormalizedVoucherData, 
  ArcaServerStatus,
  UNIT_CODES 
} from '../arcaTypes';

export class WsMtxcaInvoiceService implements ArcaInvoiceService {
  readonly serviceName = 'wsmtxca' as const;

  /**
   * Ejecuta una llamada SOAP directa contra el servicio WSMTXCA de ARCA.
   */
  private async executeSoapRequest(operation: string, innerXml: string): Promise<string> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://impl.service.wsmtxca.afip.gov.ar/service/">
  <soapenv:Header/>
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;

    try {
      const response = await axios.post(arcaConfig.endpoints.wsmtxca, soapEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'SOAPAction': `http://impl.service.wsmtxca.afip.gov.ar/service/${operation}`
        },
        timeout: 30000
      });

      return response.data;
    } catch (err: any) {
      if (err.response && err.response.data) {
        const raw = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
        console.error('[ARCA WSMTXCA ERROR RAW RESPONSE]:', raw);
        const faultMatch = raw.match(/<faultstring>([^<]+)<\/faultstring>/i) 
          || raw.match(/<descripcion>([^<]+)<\/descripcion>/i);
        if (faultMatch) {
          throw new Error(`ARCA WSMTXCA SOAP Fault (${operation}): ${faultMatch[1]}`);
        }
        throw new Error(`ARCA WSMTXCA HTTP ${err.response.status}: ${raw}`);
      }
      throw err;
    }
  }

  async getServerStatus(): Promise<ArcaServerStatus> {
    try {
      const xml = `<ser:dummyRequest/>`;
      const responseXml = await this.executeSoapRequest('dummy', xml);

      const appServer = /<appserver>OK<\/appserver>/i.test(responseXml);
      const dbServer = /<dbserver>OK<\/dbserver>/i.test(responseXml);
      const authServer = /<authserver>OK<\/authserver>/i.test(responseXml);

      return {
        appServer,
        dbServer,
        authServer,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        appServer: false,
        dbServer: false,
        authServer: false,
        environment: arcaConfig.environment,
        cuit: arcaConfig.cuit,
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * Parsea la respuesta XML de consultarUltimoComprobanteAutorizado.
   * Maneja específicamente el código 1502 como 0 (sin comprobantes previos)
   * y propaga cualquier otro error fiscal como excepción real.
   */
  public parseLastVoucherResponse(responseXml: string, pointOfSale: number, voucherType: number): number {
    // 1. Extraer errores explícitos de ARCA WSMTXCA si existen en arrayErrores
    const errorMatches = Array.from(responseXml.matchAll(/<codigo>(\d+)<\/codigo>\s*<descripcion>([^<]+)<\/descripcion>/gi));
    if (errorMatches.length > 0) {
      const is1502 = errorMatches.some(m => m[1] === '1502');
      if (is1502) {
        console.log(`[WSMTXCA] ARCA informó código 1502 (sin comprobantes previos registrados para CUIT, PV ${pointOfSale}, Tipo ${voucherType}). Retornando último comprobante = 0.`);
        return 0;
      }

      const errorMsg = errorMatches.map(m => `[${m[1]}] ${m[2].trim()}`).join(', ');
      throw new Error(`ARCA WSMTXCA: ${errorMsg}`);
    }

    // 2. Extraer número de comprobante si fue devuelto exitosamente
    const match = responseXml.match(/<numeroComprobante>(\d+)<\/numeroComprobante>/i);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 0;
  }

  async getLastVoucher(pointOfSale: number, voucherType: number): Promise<number> {
    try {
      const ticket = await getWsaaTicket('wsmtxca');

      const xml = `<ser:consultarUltimoComprobanteAutorizadoRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <consultaUltimoComprobanteAutorizadoRequest>
          <codigoTipoComprobante>${voucherType}</codigoTipoComprobante>
          <numeroPuntoVenta>${pointOfSale}</numeroPuntoVenta>
        </consultaUltimoComprobanteAutorizadoRequest>
      </ser:consultarUltimoComprobanteAutorizadoRequest>`;

      const responseXml = await this.executeSoapRequest('consultarUltimoComprobanteAutorizado', xml);

      return this.parseLastVoucherResponse(responseXml, pointOfSale, voucherType);
    } catch (err: any) {
      throw new Error(`Error al consultar último comprobante en ARCA WSMTXCA (PV ${pointOfSale}, Tipo ${voucherType}): ${err.message}`);
    }
  }

  /**
   * Construye el cuerpo del XML de autorizarComprobanteRequest respetando estrictamente
   * la secuencia del esquema oficial WSMTXCA (ComprobanteType).
   * Valida además las sumas y consistencias fiscales requeridas antes de generar el XML.
   */
  public buildAuthorizePayloadXml(request: NormalizedVoucherRequest, ticket: { token: string; sign: string }): string {
    const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    // 1. Recalcular y validar importe gravado e IVA desde backend exclusivamente
    const importeGravado = round2(
      request.vatBreakdown && request.vatBreakdown.length > 0
        ? request.vatBreakdown
            .filter(entry => entry.vatRate > 0)
            .reduce((sum, entry) => sum + entry.baseAmount, 0)
        : request.subtotalNet
    );

    const ivaTotal = round2(
      request.vatBreakdown && request.vatBreakdown.length > 0
        ? request.vatBreakdown.reduce((sum, entry) => sum + entry.vatAmount, 0)
        : request.taxes
    );

    // 2. Validaciones estrictas de coherencia fiscal
    // Validar suma de items
    const sumItemsTotal = round2(request.items.reduce((sum, item) => sum + item.total, 0));
    if (Math.abs(sumItemsTotal - round2(request.total)) > 0.05) {
      throw new Error(`Inconsistencia fiscal: la suma de importeItem ($${sumItemsTotal}) no coincide con importeTotal ($${round2(request.total)}).`);
    }

    // Validar cada ítem individual: importeItem = neto + IVA - bonificación
    for (const item of request.items) {
      const net = round2(item.netAmount);
      const vat = round2(item.vatAmount);
      const bonus = round2(item.discountAmount || 0);
      const expectedItemTotal = round2(net + vat - bonus);
      if (Math.abs(expectedItemTotal - round2(item.total)) > 0.05) {
        throw new Error(`Inconsistencia fiscal en ítem "${item.description}": neto ($${net}) + IVA ($${vat}) - bonificación ($${bonus}) no coincide con importeItem ($${item.total}).`);
      }
    }

    // Validar neto + IVA = total
    if (Math.abs(round2(request.subtotalNet + ivaTotal) - round2(request.total)) > 0.05) {
      throw new Error(`Inconsistencia fiscal: neto ($${request.subtotalNet}) + IVA ($${ivaTotal}) no coincide con total ($${request.total}).`);
    }

    // Validar suma de bases gravadas vs importeGravado
    if (request.vatBreakdown && request.vatBreakdown.length > 0) {
      const sumBasesGravadas = round2(
        request.vatBreakdown.filter(v => v.vatRate > 0).reduce((sum, v) => sum + v.baseAmount, 0)
      );
      if (Math.abs(sumBasesGravadas - importeGravado) > 0.05) {
        throw new Error(`Inconsistencia fiscal: la suma de bases gravadas ($${sumBasesGravadas}) no coincide con importeGravado ($${importeGravado}).`);
      }
    }

    const isBType = [6, 7, 8, 206, 207, 208].includes(request.invoiceTypeCode);

    // 3. XML de Ítems (Posición 21 en ComprobanteType)
    const itemsXml = request.items.map((item, idx) => {
      const uCode = UNIT_CODES[item.unit.toLowerCase()] || 7; // 7 = Unidades
      const mtxCode = (item.codigoMtx || item.barcode || item.gtin || item.ean || '').trim();

      // Validación estricta: WSMTXCA exige código de producto/servicio para ítems estándar
      if (!mtxCode) {
        throw new Error(
          `Falta el dato fiscal del producto en el ítem ${idx + 1} ("${item.description}"): ` +
          `se requiere 'codigoMtx' (o 'barcode' / 'gtin' / 'ean' del producto) para autorizar ante ARCA WSMTXCA.`
        );
      }

      // Reglas WSMTXCA según tipo de comprobante:
      // Para Factura B (6, 7, 8, 206, 207, 208):
      // - precioUnitario se informa con IVA incluido (ARCA regla 519)
      // - NO se informa <importeIVA> dentro del ítem (ARCA error 514)
      // - importeItem = precioUnitario * cantidad - bonificación
      // Para Factura A (1, 2, 3, etc.):
      // - precioUnitario se informa neto sin IVA
      // - SE informa <importeIVA> discriminado dentro del ítem
      const unitPriceValue = isBType
        ? (item.price || (item.quantity > 0 ? (item.total + (item.discountAmount || 0)) / item.quantity : item.total))
        : item.unitPrice;

      const importeIvaXml = isBType
        ? ''
        : `\n              <importeIVA>${item.vatAmount.toFixed(2)}</importeIVA>`;

      return `
            <item>
              <unidadesMtx>${item.unidadesMtx || 1}</unidadesMtx>
              <codigoMtx>${mtxCode}</codigoMtx>
              <codigo>${item.code || 'GEN'}</codigo>
              <descripcion>${item.description.replace(/[<>&'"]/g, '')}</descripcion>
              <cantidad>${item.quantity.toFixed(2)}</cantidad>
              <codigoUnidadMedida>${uCode}</codigoUnidadMedida>
              <precioUnitario>${unitPriceValue.toFixed(2)}</precioUnitario>
              <importeBonificacion>${(item.discountAmount || 0).toFixed(2)}</importeBonificacion>
              <codigoCondicionIVA>${entryVatCode(item.vatRate)}</codigoCondicionIVA>${importeIvaXml}
              <importeItem>${item.total.toFixed(2)}</importeItem>
            </item>`;
    }).join('');

    // 4. XML de Subtotales de IVA (Posición 22 en ComprobanteType)
    const ivaXml = request.vatBreakdown.map(entry => `
            <subtotalIVA>
              <codigo>${entry.vatCode}</codigo>
              <importe>${entry.vatAmount.toFixed(2)}</importe>
            </subtotalIVA>`).join('');

    // 5. Condición de IVA del receptor (Posición 7 en ComprobanteType)
    const condicionIvaCode = getCondicionIvaReceptor(request.customer, request.invoiceTypeCode);
    const condicionIvaXml = `\n          <condicionIVAReceptor>${condicionIvaCode}</condicionIVAReceptor>`;

    const importeNoGravadoXml = (request as any).subtotalUntaxed && (request as any).subtotalUntaxed > 0
      ? `\n          <importeNoGravado>${(request as any).subtotalUntaxed.toFixed(2)}</importeNoGravado>`
      : '';

    const importeExentoXml = (request as any).subtotalExempt && (request as any).subtotalExempt > 0
      ? `\n          <importeExento>${(request as any).subtotalExempt.toFixed(2)}</importeExento>`
      : '';

    const importeOtrosTributosXml = (request as any).otherTaxes && (request as any).otherTaxes > 0
      ? `\n          <importeOtrosTributos>${(request as any).otherTaxes.toFixed(2)}</importeOtrosTributos>`
      : '';

    const observacionesXml = (request as any).observations
      ? `\n          <observaciones>${(request as any).observations.replace(/[<>&'"]/g, '')}</observaciones>`
      : '';

    // Campos de servicio (solo para conceptos 2 o 3)
    let serviceFieldsXml = '';
    if (request.concept !== 1) {
      if ((request as any).serviceDateFrom) {
        serviceFieldsXml += `\n          <fechaServicioDesde>${(request as any).serviceDateFrom}</fechaServicioDesde>`;
      }
      if ((request as any).serviceDateTo) {
        serviceFieldsXml += `\n          <fechaServicioHasta>${(request as any).serviceDateTo}</fechaServicioHasta>`;
      }
      if ((request as any).paymentDueDate) {
        serviceFieldsXml += `\n          <fechaVencimientoPago>${(request as any).paymentDueDate}</fechaVencimientoPago>`;
      }
    }

    // Comprobantes asociados (para Notas de Crédito / Débito)
    let comprobantesAsociadosXml = '';
    if (request.associatedVoucher) {
      comprobantesAsociadosXml = `\n          <arrayComprobantesAsociados>
            <comprobanteAsociado>
              <codigoTipoComprobante>${request.associatedVoucher.invoiceTypeCode}</codigoTipoComprobante>
              <numeroPuntoVenta>${request.associatedVoucher.pointOfSale}</numeroPuntoVenta>
              <numeroComprobante>${request.associatedVoucher.invoiceNumber}</numeroComprobante>
            </comprobanteAsociado>
          </arrayComprobantesAsociados>`;
    }

    let arrayOtrosTributosXml = '';
    if ((request as any).arrayOtrosTributosXml) {
      arrayOtrosTributosXml = `\n          ${(request as any).arrayOtrosTributosXml}`;
    }

    // Construir Envelope y Request respetando rigurosamente el orden de ComprobanteType
    // En ARCA WSMTXCA el código 99 (SIN_IDENTIFICAR) no existe; para Consumidor Final sin DNI exige código 96 (DNI) con número "0"
    const safeDocTypeCode = (request.customer.documentTypeCode === 99 || !request.customer.documentTypeCode) ? 96 : request.customer.documentTypeCode;
    const safeDocNumber = (!request.customer.documentNumber || request.customer.documentNumber === '0' || request.customer.documentTypeCode === 99)
      ? (request.customer.documentNumber || '0')
      : request.customer.documentNumber;

    return `<ser:autorizarComprobanteRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <comprobanteCAERequest>
          <codigoTipoComprobante>${request.invoiceTypeCode}</codigoTipoComprobante>
          <numeroPuntoVenta>${request.pointOfSale}</numeroPuntoVenta>
          <numeroComprobante>${request.voucherNumber}</numeroComprobante>
          <fechaEmision>${request.date}</fechaEmision>
          <codigoTipoDocumento>${safeDocTypeCode}</codigoTipoDocumento>
          <numeroDocumento>${safeDocNumber}</numeroDocumento>${condicionIvaXml}
          <importeGravado>${importeGravado.toFixed(2)}</importeGravado>${importeNoGravadoXml}${importeExentoXml}
          <importeSubtotal>${request.subtotalNet.toFixed(2)}</importeSubtotal>${importeOtrosTributosXml}
          <importeTotal>${request.total.toFixed(2)}</importeTotal>
          <codigoMoneda>PES</codigoMoneda>
          <cotizacionMoneda>1</cotizacionMoneda>${observacionesXml}
          <codigoConcepto>${request.concept}</codigoConcepto>${serviceFieldsXml}${comprobantesAsociadosXml}${arrayOtrosTributosXml}
          <arrayItems>${itemsXml}
          </arrayItems>
          <arraySubtotalesIVA>${ivaXml}
          </arraySubtotalesIVA>
        </comprobanteCAERequest>
      </ser:autorizarComprobanteRequest>`;
  }

  public parseAuthorizeResponse(responseXml: string, request: NormalizedVoucherRequest): NormalizedVoucherResponse {
    // Parsear resultado y códigos de autorización oficiales WSMTXCA
    const resMatch = responseXml.match(/<resultado>(A|O|R)<\/resultado>/i);
    const resultado = resMatch ? resMatch[1].toUpperCase() : '';

    // En WSMTXCA, el CAE se informa en <codigoAutorizacion> (o <cae> por compatibilidad)
    const caeMatch = responseXml.match(/<(?:codigoAutorizacion|cae)>(\d+)<\/(?:codigoAutorizacion|cae)>/i);
    const vtoMatch = responseXml.match(/<(?:fechaVencimiento|fechaVencimientoCAE)>([^<]+)<\/(?:fechaVencimiento|fechaVencimientoCAE)>/i);

    // Extraer errores exclusivamente de <arrayErrores>
    const erroresXml = responseXml.match(/<arrayErrores>([\s\S]*?)<\/arrayErrores>/i)?.[1] || '';
    const errors = extractCodeDescriptions(erroresXml);

    // Extraer observaciones exclusivamente de <arrayObservaciones>
    const obsXml = responseXml.match(/<arrayObservaciones>([\s\S]*?)<\/arrayObservaciones>/i)?.[1] || '';
    const observations = extractCodeDescriptions(obsXml);

    // En WSMTXCA:
    // Si existe código de autorización válido de 14 dígitos y no hay errores excluyentes en arrayErrores -> AUTORIZADA
    const isApproved = Boolean(caeMatch && /^\d{14}$/.test(caeMatch[1].trim()) && errors.length === 0);

    if (isApproved && caeMatch) {
      return {
        success: true,
        serviceUsed: 'WSMTXCA',
        voucherNumber: request.voucherNumber,
        pointOfSale: request.pointOfSale,
        invoiceType: request.invoiceType,
        invoiceTypeCode: request.invoiceTypeCode,
        cae: caeMatch[1].trim(),
        caeExpirationDate: vtoMatch ? vtoMatch[1].trim() : '',
        observations,
        rawResponse: responseXml
      };
    } else {
      return {
        success: false,
        serviceUsed: 'WSMTXCA',
        voucherNumber: request.voucherNumber,
        pointOfSale: request.pointOfSale,
        invoiceType: request.invoiceType,
        invoiceTypeCode: request.invoiceTypeCode,
        errors: errors.length > 0 ? errors : [{ code: 'ARCA_REJECTED', message: 'Comprobante rechazado por ARCA.' }],
        observations,
        rawResponse: responseXml
      };
    }
  }

  async authorizeInvoice(request: NormalizedVoucherRequest): Promise<NormalizedVoucherResponse> {
    try {
      const ticket = await getWsaaTicket('wsmtxca');
      const xml = this.buildAuthorizePayloadXml(request, ticket);
      const responseXml = await this.executeSoapRequest('autorizarComprobante', xml);
      return this.parseAuthorizeResponse(responseXml, request);
    } catch (err: any) {
      throw err;
    }
  }

  public parseConsultarComprobanteResponse(
    responseXml: string,
    pointOfSale: number,
    voucherType: number,
    voucherNumber: number
  ): NormalizedVoucherData | null {
    const caeMatch = responseXml.match(/<(?:codigoAutorizacion|cae)>(\d+)<\/(?:codigoAutorizacion|cae)>/i);
    if (!caeMatch) return null;

    const vtoMatch = responseXml.match(/<(?:fechaVencimiento|fechaVencimientoCAE)>([^<]+)<\/(?:fechaVencimiento|fechaVencimientoCAE)>/i);
    const fechaMatch = responseXml.match(/<fechaEmision>([^<]+)<\/fechaEmision>/i);
    const totalMatch = responseXml.match(/<importeTotal>([^<]+)<\/importeTotal>/i);
    const docTipoMatch = responseXml.match(/<codigoTipoDocumento>([^<]+)<\/codigoTipoDocumento>/i);
    const docNroMatch = responseXml.match(/<numeroDocumento>([^<]+)<\/numeroDocumento>/i);

    return {
      pointOfSale,
      voucherType,
      voucherNumber,
      date: fechaMatch ? fechaMatch[1] : '',
      total: totalMatch ? parseFloat(totalMatch[1]) : 0,
      cae: caeMatch[1].trim(),
      caeExpirationDate: vtoMatch ? vtoMatch[1].trim() : '',
      documentType: docTipoMatch ? parseInt(docTipoMatch[1], 10) : 99,
      documentNumber: docNroMatch ? docNroMatch[1] : '',
      result: 'A'
    };
  }

  async getInvoice(pointOfSale: number, voucherType: number, voucherNumber: number): Promise<NormalizedVoucherData | null> {
    try {
      const ticket = await getWsaaTicket('wsmtxca');

      const xml = `<ser:consultarComprobanteRequest>
        <authRequest>
          <token>${ticket.token}</token>
          <sign>${ticket.sign}</sign>
          <cuitRepresentada>${arcaConfig.cuit}</cuitRepresentada>
        </authRequest>
        <consultaComprobanteRequest>
          <codigoTipoComprobante>${voucherType}</codigoTipoComprobante>
          <numeroPuntoVenta>${pointOfSale}</numeroPuntoVenta>
          <numeroComprobante>${voucherNumber}</numeroComprobante>
        </consultaComprobanteRequest>
      </ser:consultarComprobanteRequest>`;

      const responseXml = await this.executeSoapRequest('consultarComprobante', xml);
      return this.parseConsultarComprobanteResponse(responseXml, pointOfSale, voucherType, voucherNumber);
    } catch (err) {
      return null;
    }
  }
}

function extractCodeDescriptions(blockXml: string): Array<{ code: string; message: string }> {
  if (!blockXml) return [];
  const entries: Array<{ code: string; message: string }> = [];
  const itemMatches = Array.from(blockXml.matchAll(/<codigoDescripcion>([\s\S]*?)<\/codigoDescripcion>/gi));
  for (const item of itemMatches) {
    const codeMatch = item[1].match(/<codigo>(\d+)<\/codigo>/i);
    const descMatch = item[1].match(/<descripcion>([^<]+)<\/descripcion>/i);
    if (codeMatch && descMatch) {
      entries.push({ code: codeMatch[1].trim(), message: descMatch[1].trim() });
    }
  }
  // Fallback si no viniera envuelto en <codigoDescripcion>
  if (entries.length === 0) {
    const directMatches = Array.from(blockXml.matchAll(/<codigo>(\d+)<\/codigo>\s*<descripcion>([^<]+)<\/descripcion>/gi));
    for (const m of directMatches) {
      entries.push({ code: m[1].trim(), message: m[2].trim() });
    }
  }
  return entries;
}

function entryVatCode(rate: number): number {
  if (rate === 10.5) return 4;
  if (rate === 0) return 3;
  if (rate === 27) return 6;
  return 5; // 21%
}

function getCondicionIvaReceptor(customer: { taxCondition?: string; taxConditionCode?: number }, invoiceTypeCode?: number): number {
  if (customer && customer.taxConditionCode) return customer.taxConditionCode;
  const tc = customer && customer.taxCondition ? customer.taxCondition.trim() : '';
  switch (tc) {
    case 'Responsable Inscripto':
      return 1;
    case 'Exento':
      return 4;
    case 'Consumidor Final':
      return 5;
    case 'Monotributista':
    case 'Responsable Monotributo':
      return 6;
    case 'No Categorizado':
    case 'Sujeto No Categorizado':
      return 7;
    default:
      if (invoiceTypeCode === 6 || invoiceTypeCode === 7 || invoiceTypeCode === 8) {
        return 5; // Factura B / NC B / ND B -> Consumidor Final
      }
      return 5;
  }
}

