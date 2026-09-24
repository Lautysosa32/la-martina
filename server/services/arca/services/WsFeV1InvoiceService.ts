import axios from 'axios';
import { ArcaInvoiceService } from './ArcaInvoiceService';
import { arcaConfig } from '../arcaConfig';
import { getWsaaTicket } from '../arcaAuth';
import { 
  NormalizedVoucherRequest, 
  NormalizedVoucherResponse, 
  NormalizedVoucherData, 
  ArcaServerStatus 
} from '../arcaTypes';

export class WsFeV1InvoiceService implements ArcaInvoiceService {
  readonly serviceName = 'wsfe' as const;

  private async executeSoapRequest(operation: string, innerXml: string): Promise<string> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    ${innerXml}
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await axios.post(arcaConfig.endpoints.wsfe, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction': `http://ar.gov.afip.dif.FEV1/${operation}`
      },
      timeout: 30000
    });

    return response.data;
  }

  async getServerStatus(): Promise<ArcaServerStatus> {
    try {
      const xml = `<ar:FEDummy/>`;
      const responseXml = await this.executeSoapRequest('FEDummy', xml);

      const appServer = /<AppServer>OK<\/AppServer>/i.test(responseXml);
      const dbServer = /<DbServer>OK<\/DbServer>/i.test(responseXml);
      const authServer = /<AuthServer>OK<\/AuthServer>/i.test(responseXml);

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

  async getLastVoucher(pointOfSale: number, voucherType: number): Promise<number> {
    try {
      const ticket = await getWsaaTicket('wsfe');

      const xml = `<ar:FECompUltimoAutorizado>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:PtoVta>${pointOfSale}</ar:PtoVta>
        <ar:CbteTipo>${voucherType}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>`;

      const responseXml = await this.executeSoapRequest('FECompUltimoAutorizado', xml);

      const match = responseXml.match(/<CbteNro>(\d+)<\/CbteNro>/i);
      if (match) {
        return parseInt(match[1], 10);
      }

      return 0;
    } catch (err: any) {
      throw new Error(`Error al consultar último comprobante en ARCA WSFEv1 (PV ${pointOfSale}, Tipo ${voucherType}): ${err.message}`);
    }
  }

  async authorizeInvoice(request: NormalizedVoucherRequest): Promise<NormalizedVoucherResponse> {
    try {
      const ticket = await getWsaaTicket('wsfe');
      const formattedDate = request.date.replace(/-/g, ''); // YYYYMMDD

      // Desglose de IVA para WSFEv1 (solo si hay IVA discriminado)
      let ivaXml = '';
      if (request.vatBreakdown.length > 0 && request.taxes > 0) {
        const alics = request.vatBreakdown.map(entry => `
          <ar:AlicIva>
            <ar:Id>${entry.vatCode}</ar:Id>
            <ar:BaseImp>${entry.baseAmount.toFixed(2)}</ar:BaseImp>
            <ar:Importe>${entry.vatAmount.toFixed(2)}</ar:Importe>
          </ar:AlicIva>
        `).join('');

        ivaXml = `<ar:Iva>${alics}</ar:Iva>`;
      }

      // Comprobantes asociados (para Notas de Crédito / Débito)
      let asociadosXml = '';
      if (request.associatedVoucher) {
        asociadosXml = `
        <ar:CbtesAsoc>
          <ar:CbteAsoc>
            <ar:Tipo>${request.associatedVoucher.invoiceTypeCode}</ar:Tipo>
            <ar:PtoVta>${request.associatedVoucher.pointOfSale}</ar:PtoVta>
            <ar:Nro>${request.associatedVoucher.invoiceNumber}</ar:Nro>
          </ar:CbteAsoc>
        </ar:CbtesAsoc>`;
      }

      const xml = `<ar:FECAESolicitar>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${request.pointOfSale}</ar:PtoVta>
            <ar:CbteTipo>${request.invoiceTypeCode}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>${request.concept}</ar:Concepto>
              <ar:DocTipo>${request.customer.documentTypeCode}</ar:DocTipo>
              <ar:DocNro>${request.customer.documentNumber}</ar:DocNro>
              <ar:CbteDesde>${request.voucherNumber}</ar:CbteDesde>
              <ar:CbteHasta>${request.voucherNumber}</ar:CbteHasta>
              <ar:CbteFch>${formattedDate}</ar:CbteFch>
              <ar:ImpTotal>${request.total.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${request.subtotalNet.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:ImpIVA>${request.taxes.toFixed(2)}</ar:ImpIVA>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1</ar:MonCotiz>
              ${ivaXml}
              ${asociadosXml}
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>`;

      const responseXml = await this.executeSoapRequest('FECAESolicitar', xml);

      const resMatch = responseXml.match(/<Resultado>(A|R)<\/Resultado>/i);
      const resultado = resMatch ? resMatch[1].toUpperCase() : 'R';

      if (resultado === 'A') {
        const caeMatch = responseXml.match(/<CAE>(\d+)<\/CAE>/i);
        const vtoMatch = responseXml.match(/<CAEFchVto>(\d{8})<\/CAEFchVto>/i);
        let formattedVto = '';
        if (vtoMatch) {
          const raw = vtoMatch[1];
          formattedVto = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
        }

        return {
          success: true,
          serviceUsed: 'WSFEv1',
          voucherNumber: request.voucherNumber,
          pointOfSale: request.pointOfSale,
          invoiceType: request.invoiceType,
          invoiceTypeCode: request.invoiceTypeCode,
          cae: caeMatch ? caeMatch[1] : '',
          caeExpirationDate: formattedVto,
          rawResponse: responseXml
        };
      } else {
        const errMatches = Array.from(responseXml.matchAll(/<Err>\s*<Code>(\d+)<\/Code>\s*<Msg>([^<]+)<\/Msg>/gi));
        const errors = errMatches.map(m => ({ code: m[1], message: m[2].trim() }));

        const obsMatches = Array.from(responseXml.matchAll(/<Obs>\s*<Code>(\d+)<\/Code>\s*<Msg>([^<]+)<\/Msg>/gi));
        const observations = obsMatches.map(m => ({ code: m[1], message: m[2].trim() }));

        return {
          success: false,
          serviceUsed: 'WSFEv1',
          voucherNumber: request.voucherNumber,
          pointOfSale: request.pointOfSale,
          invoiceType: request.invoiceType,
          invoiceTypeCode: request.invoiceTypeCode,
          errors: errors.length > 0 ? errors : [{ code: 'ARCA_REJECTED', message: 'Comprobante rechazado por ARCA.' }],
          observations,
          rawResponse: responseXml
        };
      }
    } catch (err: any) {
      throw err;
    }
  }

  async getInvoice(pointOfSale: number, voucherType: number, voucherNumber: number): Promise<NormalizedVoucherData | null> {
    try {
      const ticket = await getWsaaTicket('wsfe');

      const xml = `<ar:FECompConsultar>
        <ar:Auth>
          <ar:Token>${ticket.token}</ar:Token>
          <ar:Sign>${ticket.sign}</ar:Sign>
          <ar:Cuit>${arcaConfig.cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCompConsReq>
          <ar:CbteTipo>${voucherType}</ar:CbteTipo>
          <ar:CbteNro>${voucherNumber}</ar:CbteNro>
          <ar:PtoVta>${pointOfSale}</ar:PtoVta>
        </ar:FeCompConsReq>
      </ar:FECompConsultar>`;

      const responseXml = await this.executeSoapRequest('FECompConsultar', xml);

      const caeMatch = responseXml.match(/<CodAutorizacion>(\d+)<\/CodAutorizacion>/i);
      if (!caeMatch) return null;

      const vtoMatch = responseXml.match(/<FchVto>(\d{8})<\/FchVto>/i);
      const fechaMatch = responseXml.match(/<CbteFch>(\d{8})<\/CbteFch>/i);
      const totalMatch = responseXml.match(/<ImpTotal>([^<]+)<\/ImpTotal>/i);
      const docTipoMatch = responseXml.match(/<DocTipo>([^<]+)<\/DocTipo>/i);
      const docNroMatch = responseXml.match(/<DocNro>([^<]+)<\/DocNro>/i);

      let formattedDate = '';
      if (fechaMatch) {
        const raw = fechaMatch[1];
        formattedDate = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
      }

      let formattedVto = '';
      if (vtoMatch) {
        const raw = vtoMatch[1];
        formattedVto = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
      }

      return {
        pointOfSale,
        voucherType,
        voucherNumber,
        date: formattedDate,
        total: totalMatch ? parseFloat(totalMatch[1]) : 0,
        cae: caeMatch[1],
        caeExpirationDate: formattedVto,
        documentType: docTipoMatch ? parseInt(docTipoMatch[1], 10) : 99,
        documentNumber: docNroMatch ? docNroMatch[1] : '',
        result: 'A'
      };
    } catch (err) {
      return null;
    }
  }
}
