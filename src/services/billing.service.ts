import axios from 'axios';
import { supabase } from '../lib/supabase';

export interface FiscalStatusResult {
  connected: boolean;
  serverStatus: {
    appServer: boolean;
    dbServer: boolean;
    authServer: boolean;
    environment: 'testing' | 'production';
    cuit: string;
    lastChecked: string;
  };
  certificate: {
    isValid: boolean;
    subject?: string;
    issuer?: string;
    validTo?: string;
    daysRemaining?: number;
    error?: string;
  };
  config: {
    environment: 'testing' | 'production';
    cuit: string;
    defaultPointOfSale: number;
  };
}

export interface FiscalBusinessConfig {
  businessName: string;
  fantasyName: string;
  cuit: string;
  taxCondition: string;
  grossIncome: string;
  startDate: string;
  fiscalAddress: string;
  postalCode: string;
  phone: string;
  defaultPointOfSale: number;
  environment?: 'testing' | 'production';
}

export interface AuthorizeInvoicePayload {
  saleIds: string[];
  pointOfSale: number;
  invoiceType: 'A' | 'B' | 'C';
  customer: {
    id?: string;
    name: string;
    documentType: string;
    documentNumber: string;
    cuit?: string;
    taxCondition: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  items: Array<{
    productId?: string;
    code?: string;
    codigoMtx?: string;
    barcode?: string;
    gtin?: string;
    ean?: string;
    unidadesMtx?: number;
    description: string;
    quantity: number;
    unit?: string;
    price: number;
    taxRate?: number;
  }>;
  pricesIncludeTax?: boolean;
  requestedBy?: string;
}

export interface AuthorizeInvoiceResponse {
  success: boolean;
  status: 'AUTORIZADA' | 'RECHAZADA' | 'ESTADO_DESCONOCIDO' | 'EN_PROCESO' | 'ERROR_TECNICO';
  invoice?: any;
  qrDataUrl?: string;
  pdfDownloadUrl?: string;
  operationId?: string;
  error?: {
    code: string;
    title: string;
    reason: string;
    suggestedAction: string;
    isRetryable: boolean;
  };
  message?: string;
}

class BillingService {
  private client = axios.create({
    baseURL: '/api/arca',
    timeout: 35000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  constructor() {
    this.client.interceptors.request.use(async (config) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch (err) {
        console.warn('[BillingService] Error obteniendo sesión de Supabase:', err);
      }
      return config;
    });
  }

  /**
   * Consulta el estado de los servidores de ARCA y la validez del certificado digital.
   */
  async checkStatus(): Promise<FiscalStatusResult> {
    const res = await this.client.get<FiscalStatusResult>('/status');
    return res.data;
  }

  /**
   * Obtiene la configuración fiscal segura del comercio.
   */
  async getConfig(): Promise<FiscalBusinessConfig> {
    const res = await this.client.get('/config');
    return res.data.config;
  }

  /**
   * Actualiza la configuración fiscal del comercio (Razón social, CUIT, IIBB, etc.).
   */
  async updateConfig(config: Partial<FiscalBusinessConfig>): Promise<FiscalBusinessConfig> {
    const res = await this.client.put('/config', config);
    return res.data.config;
  }

  /**
   * Sube los certificados digitales de ARCA y los guarda en el servidor
   */
  async uploadCertificates(crtContent: string, keyContent: string, isProduction: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await this.client.post('/certificates', { crtContent, keyContent, isProduction });
      return res.data;
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || err.message || 'Error al subir los certificados.' };
    }
  }

  /**
   * Obtiene los puntos de venta habilitados.
   */
  async getPointsOfSale(): Promise<any[]> {
    const res = await this.client.get('/points-of-sale');
    return res.data.pointsOfSale;
  }

  /**
   * Consulta el último número de comprobante autorizado en ARCA y retorna el próximo sugerido.
   */
  async getLastVoucherNumber(pointOfSale: number, invoiceType: string): Promise<{ lastNumber: number; nextNumber: number }> {
    const res = await this.client.get('/last-voucher', {
      params: { pointOfSale, invoiceType }
    });
    return {
      lastNumber: res.data.lastNumber,
      nextNumber: res.data.nextNumber
    };
  }

  /**
   * Envía a autorizar una factura fiscal ante ARCA.
   * Genera automáticamente un UUID v4 como X-Idempotency-Key para garantizar idempotencia.
   */
  async authorizeInvoice(payload: AuthorizeInvoicePayload): Promise<AuthorizeInvoiceResponse> {
    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `IDEM-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await this.client.post<AuthorizeInvoiceResponse>('/authorize', payload, {
        headers: {
          'X-Idempotency-Key': idempotencyKey
        }
      });
      return res.data;
    } catch (err: any) {
      if (err.response?.data) {
        return err.response.data;
      }
      return {
        success: false,
        status: 'ESTADO_DESCONOCIDO',
        error: {
          code: 'NETWORK_TIMEOUT',
          title: 'Tiempo de espera agotado con ARCA',
          reason: 'No se pudo obtener confirmación inmediata del servidor fiscal.',
          suggestedAction: 'Verificá el estado con el botón Reconciliar en la factura.',
          isRetryable: false
        }
      };
    }
  }

  /**
   * Reconcilia una operación que quedó en ESTADO_DESCONOCIDO tras un timeout o corte de red.
   */
  async reconcileOperation(operationId: string): Promise<any> {
    const res = await this.client.post(`/operations/${operationId}/reconcile`);
    return res.data;
  }

  /**
   * Obtiene el listado de comprobantes fiscales emitidos.
   */
  async getFiscalInvoices(): Promise<any[]> {
    try {
      const res = await this.client.get('/invoices');
      return res.data.invoices || [];
    } catch {
      return [];
    }
  }

  /**
   * Obtiene los registros del log de auditoría fiscal.
   */
  async getAuditLogs(): Promise<any[]> {
    try {
      const res = await this.client.get('/audit-logs');
      return res.data.logs || [];
    } catch {
      return [];
    }
  }

  /**
   * Consulta los datos fiscales de un comprobante específico en ARCA (modo solo lectura).
   */
  async getVoucherInfo(pointOfSale: number, invoiceType: string, voucherNumber: number): Promise<{ success: boolean; exists: boolean; voucherData?: any; message?: string }> {
    try {
      const res = await this.client.get('/voucher-info', {
        params: { pointOfSale, invoiceType, voucherNumber }
      });
      return res.data;
    } catch (err: any) {
      return {
        success: false,
        exists: false,
        message: err.response?.data?.error || err.message || 'Error consultando comprobante en ARCA.'
      };
    }
  }

  /**
   * Registra una factura manual / externa en el sistema.
   * NO llama a autorizarComprobante ni emite nada en ARCA.
   */
  async registerExternalInvoice(payload: {
    pointOfSale: number;
    invoiceType: string;
    invoiceNumber: number;
    date: string;
    customer: {
      name: string;
      documentType: string;
      documentNumber: string;
      cuit?: string;
      taxCondition: string;
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
    requestedBy?: string;
  }): Promise<{ success: boolean; invoice?: any; warning?: string; error?: string }> {
    try {
      const res = await this.client.post('/external-invoices', payload);
      return res.data;
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'Error registrando factura externa.'
      };
    }
  }

  /**
   * Reconcilia y verifica una factura externa consultando ARCA en modo lectura.
   * Si existe en ARCA, actualiza el estado a VERIFICADA_EN_ARCA.
   */
  async verifyExternalInvoice(invoiceId: string, verifiedBy?: string): Promise<{ success: boolean; verified: boolean; status?: string; cae?: string; caeExpirationDate?: string; message?: string; error?: string }> {
    try {
      const res = await this.client.post(`/invoices/${invoiceId}/verify-external`, { verifiedBy });
      return res.data;
    } catch (err: any) {
      return {
        success: false,
        verified: false,
        error: err.response?.data?.error || err.message || 'Error verificando factura en ARCA.'
      };
    }
  }

  /**
   * Audita un rango de comprobantes comparando la base local contra ARCA (solo lectura).
   */
  async verifyRange(pointOfSale: number, invoiceType: string, from: number, to: number): Promise<{ success: boolean; count: number; report: any[]; error?: string }> {
    try {
      const res = await this.client.get('/verify-range', {
        params: { pointOfSale, invoiceType, from, to }
      });
      return res.data;
    } catch (err: any) {
      return {
        success: false,
        count: 0,
        report: [],
        error: err.response?.data?.error || err.message || 'Error verificando rango de comprobantes.'
      };
    }
  }

  /**
   * Abre o descarga el PDF oficial de una factura fiscal autenticado mediante blob URL
   */
  async openInvoicePdf(invoiceId: string): Promise<void> {
    if (!invoiceId) return;
    try {
      const res = await this.client.get(`/invoices/${invoiceId}/pdf`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      console.warn('[BillingService] Fallback abriendo PDF por URL:', err.message);
      let token = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || '';
      } catch {}
      const fallbackUrl = `/api/arca/invoices/${invoiceId}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      window.open(fallbackUrl, '_blank');
    }
  }
}

export const billingService = new BillingService();

