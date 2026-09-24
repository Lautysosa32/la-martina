import { ArcaInvoiceService } from '../../server/services/arca/services/ArcaInvoiceService';
import { 
  NormalizedVoucherRequest, 
  NormalizedVoucherResponse, 
  NormalizedVoucherData, 
  ArcaServerStatus 
} from '../../server/services/arca/arcaTypes';

/**
 * MOCK EXPLICITO PARA PRUEBAS UNITARIAS LOCALES
 * Se utiliza EXCLUSIVAMENTE dentro del directorio tests/ para validar contratos de datos.
 * NUNCA se utiliza en código de producción ni en server/services/arca/.
 */
export class MockArcaInvoiceService implements ArcaInvoiceService {
  readonly serviceName = 'wsmtxca' as const;

  async getServerStatus(): Promise<ArcaServerStatus> {
    return {
      appServer: true,
      dbServer: true,
      authServer: true,
      environment: 'testing',
      cuit: '20300000003',
      lastChecked: new Date().toISOString()
    };
  }

  async getLastVoucher(_pointOfSale: number, _voucherType: number): Promise<number> {
    return 100;
  }

  async authorizeInvoice(request: NormalizedVoucherRequest): Promise<NormalizedVoucherResponse> {
    // CAE fixture para tests unitarios de mapeo y formato
    return {
      success: true,
      serviceUsed: 'WSMTXCA',
      voucherNumber: request.voucherNumber,
      pointOfSale: request.pointOfSale,
      invoiceType: request.invoiceType,
      invoiceTypeCode: request.invoiceTypeCode,
      cae: '74123456789012',
      caeExpirationDate: '2026-09-24',
      rawResponse: '<mock>Comprobante simulado para test unitario</mock>'
    };
  }

  async getInvoice(pointOfSale: number, voucherType: number, voucherNumber: number): Promise<NormalizedVoucherData | null> {
    return {
      pointOfSale,
      voucherType,
      voucherNumber,
      date: '2026-09-14',
      total: 4025,
      cae: '74123456789012',
      caeExpirationDate: '2026-09-24',
      documentType: 96,
      documentNumber: '30123456',
      result: 'A'
    };
  }
}
