import { 
  NormalizedVoucherRequest, 
  NormalizedVoucherResponse, 
  NormalizedVoucherData, 
  ArcaServerStatus 
} from '../arcaTypes';

export interface ArcaInvoiceService {
  readonly serviceName: 'wsmtxca' | 'wsfe';
  
  /**
   * Consulta el estado de los servidores de ARCA (AppServer, DbServer, AuthServer).
   */
  getServerStatus(): Promise<ArcaServerStatus>;

  /**
   * Obtiene el número del último comprobante autorizado para un punto de venta y tipo de comprobante.
   */
  getLastVoucher(pointOfSale: number, voucherType: number): Promise<number>;

  /**
   * Envía a autorizar el comprobante y solicita el Código de Autorización Electrónico (CAE).
   */
  authorizeInvoice(request: NormalizedVoucherRequest): Promise<NormalizedVoucherResponse>;

  /**
   * Consulta los datos fiscales de un comprobante específico ya emitido ante ARCA.
   * Utilizado para reconciliar operaciones con estado desconocido (ESTADO_DESCONOCIDO).
   */
  getInvoice(pointOfSale: number, voucherType: number, voucherNumber: number): Promise<NormalizedVoucherData | null>;
}
