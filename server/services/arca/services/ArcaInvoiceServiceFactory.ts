import { ArcaInvoiceService } from './ArcaInvoiceService';
import { WsMtxcaInvoiceService } from './WsMtxcaInvoiceService';
import { WsFeV1InvoiceService } from './WsFeV1InvoiceService';
import { InvoiceType } from '../arcaTypes';

export class ArcaInvoiceServiceFactory {
  private static wsMtxcaInstance: WsMtxcaInvoiceService | null = null;
  private static wsFeInstance: WsFeV1InvoiceService | null = null;

  /**
   * Retorna el servicio de facturación adecuado según el tipo de comprobante.
   * Facturas A y B (con detalle de ítems de supermercado) -> WSMTXCA.
   * Facturas C (monotributo / sin discriminación de IVA) -> WSFEv1.
   */
  public static getService(invoiceType: InvoiceType, preferFeV1: boolean = false): ArcaInvoiceService {
    if (preferFeV1) {
      if (!this.wsFeInstance) {
        this.wsFeInstance = new WsFeV1InvoiceService();
      }
      return this.wsFeInstance;
    }

    // Facturas A y B, y sus Notas de Débito/Crédito asociadas utilizan WSMTXCA para el detalle de artículos
    const mtxcaTypes: InvoiceType[] = ['A', 'B', 'NC_A', 'NC_B', 'ND_A', 'ND_B'];
    if (mtxcaTypes.includes(invoiceType)) {
      if (!this.wsMtxcaInstance) {
        this.wsMtxcaInstance = new WsMtxcaInvoiceService();
      }
      return this.wsMtxcaInstance;
    }

    // Facturas C y demás comprobantes sin detalle de alícuotas usan WSFEv1
    if (!this.wsFeInstance) {
      this.wsFeInstance = new WsFeV1InvoiceService();
    }
    return this.wsFeInstance;
  }

  /**
   * Retorna el servicio adecuado a partir del código numérico oficial de comprobante de ARCA.
   */
  public static getServiceByCode(voucherTypeCode: number): ArcaInvoiceService {
    // 1: Factura A, 2: ND A, 3: NC A, 6: Factura B, 7: ND B, 8: NC B
    const mtxcaCodes = [1, 2, 3, 6, 7, 8];
    if (mtxcaCodes.includes(voucherTypeCode)) {
      if (!this.wsMtxcaInstance) {
        this.wsMtxcaInstance = new WsMtxcaInvoiceService();
      }
      return this.wsMtxcaInstance;
    }

    if (!this.wsFeInstance) {
      this.wsFeInstance = new WsFeV1InvoiceService();
    }
    return this.wsFeInstance;
  }
}
