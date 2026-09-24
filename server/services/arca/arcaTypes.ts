export type InvoiceOrigin = 'ARCA_LOCAL' | 'EXTERNA_MANUAL';

export type FiscalStatus = 
  | 'BORRADOR'
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'AUTORIZADA'
  | 'RECHAZADA'
  | 'ESTADO_DESCONOCIDO'
  | 'ERROR_TECNICO'
  | 'REGISTRADA_EXTERNAMENTE'
  | 'VERIFICADA_EN_ARCA'
  | 'ANULADA'
  | 'ANULADA_POR_NC';

export type InvoiceType = 'A' | 'B' | 'C' | 'NC_A' | 'NC_B' | 'NC_C' | 'ND_A' | 'ND_B' | 'ND_C';

export type CustomerTaxCondition = 
  | 'Responsable Inscripto'
  | 'Monotributista'
  | 'Consumidor Final'
  | 'Exento'
  | 'No Categorizado';

export type DocumentType = 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';

// Mapeo oficial de códigos de comprobantes ARCA (AFIP)
export const VOUCHER_CODES: Record<InvoiceType, number> = {
  A: 1,
  ND_A: 2,
  NC_A: 3,
  B: 6,
  ND_B: 7,
  NC_B: 8,
  C: 11,
  ND_C: 12,
  NC_C: 13
};

// Mapeo oficial de tipo de documento ARCA
export const DOCUMENT_TYPE_CODES: Record<DocumentType, number> = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  PASAPORTE: 94,
  SIN_IDENTIFICAR: 99
};

// Mapeo oficial de alícuotas de IVA ARCA
// 3: 0%, 4: 10.5%, 5: 21%, 6: 27%, 8: 5%, 9: 2.5%
export const VAT_CODES: Record<number, number> = {
  0: 3,
  10.5: 4,
  21: 5,
  27: 6,
  5: 8,
  2.5: 9
};

// Unidades de medida ARCA (7: unidades, 1: kilogramos, 2: metros, etc.)
export const UNIT_CODES: Record<string, number> = {
  unidades: 7,
  unidad: 7,
  unit: 7,
  u: 7,
  kilos: 1,
  kilo: 1,
  kg: 1,
  gramos: 1,
  gr: 1,
  g: 1
};

export interface NormalizedInvoiceItem {
  productId?: string;
  code?: string;
  codigoMtx?: string; // Código de producto/servicio ARCA WSMTXCA (GTIN / EAN / Barcode)
  barcode?: string;
  gtin?: string;
  ean?: string;
  unidadesMtx?: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  price: number;
  taxRate: number;
  netAmount: number;
  vatRate: number; // e.g. 21, 10.5, 0
  vatAmount: number;
  discountAmount?: number;
  total: number;
}

export interface VatBreakdownEntry {
  vatRate: number;
  vatCode: number;
  baseAmount: number;
  vatAmount: number;
}

export interface NormalizedVoucherRequest {
  idempotencyKey: string;
  saleIds: string[];
  pointOfSale: number;
  invoiceType: InvoiceType;
  invoiceTypeCode: number;
  voucherNumber: number;
  date: string; // YYYY-MM-DD
  concept: number; // 1: Productos, 2: Servicios, 3: Ambos
  customer: {
    id?: string;
    name: string;
    documentType: DocumentType;
    documentTypeCode: number;
    documentNumber: string;
    cuit?: string;
    taxCondition: CustomerTaxCondition;
    taxConditionCode?: number;
    address?: string;
    email?: string;
    phone?: string;
  };
  subtotalNet: number;
  taxes: number;
  total: number;
  items: NormalizedInvoiceItem[];
  vatBreakdown: VatBreakdownEntry[];
  associatedVoucher?: {
    pointOfSale: number;
    invoiceTypeCode: number;
    invoiceNumber: number;
  };
}

export interface NormalizedVoucherResponse {
  success: boolean;
  serviceUsed: 'WSMTXCA' | 'WSFEv1';
  voucherNumber: number;
  pointOfSale: number;
  invoiceType: InvoiceType;
  invoiceTypeCode: number;
  cae?: string;
  caeExpirationDate?: string;
  observations?: Array<{ code: string; message: string }>;
  errors?: Array<{ code: string; message: string }>;
  rawResponse?: any;
}

export interface ArcaServerStatus {
  appServer: boolean;
  dbServer: boolean;
  authServer: boolean;
  environment: 'testing' | 'production';
  cuit: string;
  lastChecked: string;
}

export interface NormalizedVoucherData {
  pointOfSale: number;
  voucherType: number;
  voucherNumber: number;
  date: string;
  total: number;
  cae: string;
  caeExpirationDate: string;
  documentType: number;
  documentNumber: string;
  result: string;
}

export interface RegisterExternalInvoiceRequest {
  pointOfSale: number;
  invoiceType: InvoiceType;
  invoiceNumber: number;
  date: string;
  customer: {
    name: string;
    documentType: DocumentType;
    documentNumber: string;
    cuit?: string;
    taxCondition: CustomerTaxCondition;
    address?: string;
    email?: string;
    phone?: string;
  };
  subtotalNet?: number;
  taxes?: number;
  total: number;
  currency?: string;
  cae?: string;
  caeExpirationDate?: string;
  notes?: string;
  attachmentUrl?: string;
  saleIds?: string[];
  items?: NormalizedInvoiceItem[];
  requestedBy?: string;
}

export interface VerifyRangeReportItem {
  number: number;
  voucherNumber?: number;
  arcaExists: boolean;
  existsInArca?: boolean;
  arcaCae?: string;
  arcaVencimiento?: string;
  arcaTotal?: number;
  localExists: boolean;
  existsInDb?: boolean;
  localId?: string;
  localOrigin?: InvoiceOrigin;
  origin?: InvoiceOrigin;
  localStatus?: FiscalStatus;
  status?: FiscalStatus;
  localTotal?: number;
  localCae?: string;
  observation: 'OK' | 'FALTANTE_LOCAL' | 'SOLO_LOCAL' | 'DIFERENCIA_DATOS' | 'SALTO_DETECTADO';
}

