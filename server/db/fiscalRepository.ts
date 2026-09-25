import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { FiscalStatus, InvoiceOrigin } from '../services/arca/arcaTypes';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://oczxbflkvutumcflnwlx.supabase.co';

/**
 * Obtiene la clave secreta administrativa de Supabase exclusiva para el backend.
 * Prioriza SUPABASE_SECRET_KEY (formato moderno sb_secret_...) y SUPABASE_SERVICE_ROLE_KEY (legacy).
 * NUNCA debe utilizar la clave pública/anon para escrituras administrativas de facturación fiscal.
 */
export function getSupabaseAdminKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || 
              process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SERVICE_ROLE_KEY || 
              process.env.SUPABASE_KEY || '';
  
  // Rechazar explícitamente si se intenta usar la publishable/anon key como clave administrativa
  if (key && (key.startsWith('sb_publishable_') || key === process.env.VITE_SUPABASE_ANON_KEY)) {
    return '';
  }

  return key.trim();
}

export interface FiscalOperationRecord {
  id: string;
  idempotency_key: string;
  operation_type: string;
  sale_ids: string[];
  point_of_sale: number;
  invoice_type: string;
  invoice_type_code: number;
  status: FiscalStatus;
  invoice_id?: string | null;
  request_hash: string;
  requested_by?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  raw_response?: any;
  created_at?: string;
  updated_at?: string;
}

export interface FiscalInvoiceRecord {
  id: string;
  branch_id?: string;
  idempotency_key: string;
  sale_ids: string[];
  direction: 'venta' | 'compra';
  invoice_type: string;
  invoice_type_code: number;
  point_of_sale: number;
  invoice_number: number;
  date: string;
  customer_id?: string | null;
  customer_name: string;
  customer_document_type: string;
  customer_document_number: string;
  customer_cuit?: string | null;
  customer_tax_condition: string;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  subtotal_net: number;
  taxes: number;
  total: number;
  currency: string;
  origin?: InvoiceOrigin;
  status: FiscalStatus;
  service_used: 'WSMTXCA' | 'WSFEv1';
  cae?: string | null;
  cae_expiration_date?: string | null;
  arca_observations?: any;
  items: any[];
  vat_breakdown: any[];
  qr_payload?: string | null;
  attachment_url?: string | null;
  notes?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  associated_invoice_id?: string | null;
  associated_point_of_sale?: number | null;
  associated_invoice_number?: number | null;
  associated_invoice_type?: string | null;
  associated_invoice_type_code?: number | null;
  associated_cuit?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface FiscalAuditLogRecord {
  id?: string;
  branch_id?: string;
  action: string;
  voucher_info?: string;
  result: string;
  user_id?: string | null;
  details?: any;
  created_at?: string;
}

export interface FiscalAccessTicketRecord {
  service: string;
  token: string;
  sign: string;
  generation_time: string;
  expiration_time: string;
  updated_at?: string;
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
}

export class FiscalRepository {
  private client: SupabaseClient;
  public readonly isServiceRoleConfigured: boolean;

  /**
   * Inicializa el repositorio fiscal utilizando exclusivamente el cliente administrativo de backend.
   * NO recibe ni adjunta tokens JWT de usuario/sesión en las cabeceras globales para garantizar
   * que las operaciones fiscales administrativas se ejecuten con rol maestro (service_role) y no
   * sean bloqueadas por políticas de RLS de usuarios individuales.
   */
  constructor() {
    const adminKey = getSupabaseAdminKey();
    this.isServiceRoleConfigured = Boolean(adminKey);

    const options: any = {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    };

    if (!adminKey) {
      // Si la clave administrativa no está configurada, advertir en consola y utilizar cliente restringido
      this.client = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vGCWtTOQ5cPScfxggmOMwg_DyIX6lhO', options);
    } else {
      // Cliente administrativo exclusivo de backend: bypass de RLS garantizado
      this.client = createClient(supabaseUrl, adminKey, options);
    }
  }

  public getClient(userToken?: string): SupabaseClient {
    if (this.isServiceRoleConfigured || !userToken) {
      return this.client;
    }

    return createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vGCWtTOQ5cPScfxggmOMwg_DyIX6lhO', {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });
  }

  /**
   * Obtiene una operación por su clave única de idempotencia.
   */
  async getOperationByIdempotencyKey(idempotencyKey: string): Promise<FiscalOperationRecord | null> {
    const { data, error } = await this.client
      .from('fiscal_invoice_operations')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      console.warn(`[FiscalRepository] Error al buscar operación por idempotencyKey: ${error.message}`);
      return null;
    }

    return data as FiscalOperationRecord | null;
  }

  /**
   * Obtiene una operación por su ID primario.
   */
  async getOperationById(id: string): Promise<FiscalOperationRecord | null> {
    const { data, error } = await this.client
      .from('fiscal_invoice_operations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn(`[FiscalRepository] Error al buscar operación por ID: ${error.message}`);
      return null;
    }

    return data as FiscalOperationRecord | null;
  }

  /**
   * Registra una nueva operación fiscal en PostgreSQL.
   * Si ya existe la clave de idempotencia, falla garantizando la restricción UNIQUE.
   */
  async createOperation(op: FiscalOperationRecord): Promise<{ success: boolean; data?: FiscalOperationRecord; error?: any }> {
    const record = {
      ...op,
      created_at: op.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.client
      .from('fiscal_invoice_operations')
      .insert(record)
      .select()
      .single();

    if (error) {
      return { success: false, error };
    }

    return { success: true, data: data as FiscalOperationRecord };
  }

  /**
   * Actualiza el estado y datos de una operación fiscal.
   */
  async updateOperation(idempotencyKey: string, updates: Partial<FiscalOperationRecord>): Promise<boolean> {
    const updatePayload = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { error } = await this.client
      .from('fiscal_invoice_operations')
      .update(updatePayload)
      .eq('idempotency_key', idempotencyKey);

    if (error) {
      console.error(`[FiscalRepository] Error actualizando operación ${idempotencyKey}:`, error.message);
      return false;
    }

    return true;
  }

  /**
   * Comprueba en PostgreSQL si alguna de las ventas ya está asociada a una factura AUTORIZADA.
   * Utiliza el operador de superposición de arrays de PostgreSQL (.overlaps).
   */
  async findAuthorizedInvoicesForSales(saleIds: string[]): Promise<FiscalInvoiceRecord[]> {
    if (!saleIds || saleIds.length === 0) return [];

    const { data, error } = await this.client
      .from('invoices')
      .select('*')
      .eq('status', 'AUTORIZADA')
      .overlaps('sale_ids', saleIds);

    if (error) {
      console.error(`[FiscalRepository] Error verificando ventas facturadas en PostgreSQL:`, error.message);
      return [];
    }

    return (data || []) as FiscalInvoiceRecord[];
  }

  /**
   * Guarda una factura fiscal autorizada con CAE real en la tabla `invoices`.
   */
  async saveInvoice(invoice: FiscalInvoiceRecord): Promise<{ success: boolean; error?: any }> {
    const { error } = await this.client
      .from('invoices')
      .insert({
        ...invoice,
        created_at: invoice.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error(`[FiscalRepository] Error persistiendo factura ${invoice.id}:`, error.message);
      return { success: false, error };
    }

    return { success: true };
  }

  /**
   * Obtiene una factura por su ID primario.
   */
  async getInvoiceById(id: string): Promise<FiscalInvoiceRecord | null> {
    const { data, error } = await this.client
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[FiscalRepository] Error consultando factura ${id}:`, error.message);
      return null;
    }

    return data as FiscalInvoiceRecord | null;
  }

  /**
   * Obtiene una factura por su clave única de idempotencia.
   */
  async getInvoiceByIdempotencyKey(idempotencyKey: string): Promise<FiscalInvoiceRecord | null> {
    const { data, error } = await this.client
      .from('invoices')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      console.error(`[FiscalRepository] Error consultando factura por idempotencyKey:`, error.message);
      return null;
    }

    return data as FiscalInvoiceRecord | null;
  }

  /**
   * Busca si ya existe un comprobante registrado por (punto de venta, tipo de comprobante, número).
   * Previene duplicados físicos y lógicos tanto para facturas locales como externas.
   */
  async findInvoiceByVoucher(pointOfSale: number, invoiceTypeCode: number, invoiceNumber: number): Promise<FiscalInvoiceRecord | null> {
    const { data, error } = await this.client
      .from('invoices')
      .select('*')
      .eq('point_of_sale', pointOfSale)
      .eq('invoice_type_code', invoiceTypeCode)
      .eq('invoice_number', invoiceNumber)
      .maybeSingle();

    if (error) {
      console.error(`[FiscalRepository] Error buscando comprobante PV ${pointOfSale}, Tipo ${invoiceTypeCode}, Nº ${invoiceNumber}:`, error.message);
      return null;
    }

    return data as FiscalInvoiceRecord | null;
  }

  /**
   * Guarda una factura registrada manualmente/externamente.
   */
  async saveExternalInvoice(invoice: FiscalInvoiceRecord): Promise<{ success: boolean; error?: any }> {
    const { error } = await this.client
      .from('invoices')
      .insert({
        ...invoice,
        origin: 'EXTERNA_MANUAL',
        status: invoice.status || 'REGISTRADA_EXTERNAMENTE',
        created_at: invoice.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error(`[FiscalRepository] Error guardando factura externa ${invoice.id}:`, error.message);
      return { success: false, error };
    }

    return { success: true };
  }

  /**
   * Actualiza el estado de verificación oficial de una factura externa reconciliada con ARCA.
   */
  async updateExternalInvoiceVerification(
    id: string, 
    updateData: { 
      status: FiscalStatus; 
      cae?: string | null; 
      caeExpirationDate?: string | null; 
      verifiedAt: string; 
      verifiedBy?: string | null; 
      observations?: any 
    }
  ): Promise<{ success: boolean; error?: any }> {
    const { error } = await this.client
      .from('invoices')
      .update({
        status: updateData.status,
        cae: updateData.cae,
        cae_expiration_date: updateData.caeExpirationDate,
        verified_at: updateData.verifiedAt,
        verified_by: updateData.verifiedBy,
        arca_observations: updateData.observations,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`[FiscalRepository] Error actualizando verificación de factura ${id}:`, error.message);
      return { success: false, error };
    }

    return { success: true };
  }

  /**
   * Lista facturas fiscales recientes.
   */
  async listInvoices(limit: number = 50): Promise<FiscalInvoiceRecord[]> {
    const { data, error } = await this.client
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[FiscalRepository] Error listando facturas:`, error.message);
      return [];
    }

    return (data || []) as FiscalInvoiceRecord[];
  }

  /**
   * Registra un log de auditoría fiscal en `fiscal_audit_logs`.
   */
  async logAudit(log: FiscalAuditLogRecord): Promise<void> {
    try {
      await this.client.from('fiscal_audit_logs').insert({
        branch_id: log.branch_id || 'main',
        action: log.action,
        voucher_info: log.voucher_info || '',
        result: log.result,
        user_id: log.user_id || 'system',
        details: log.details || {},
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      console.warn(`[FiscalRepository] No se pudo guardar log de auditoría:`, err.message);
    }
  }

  /**
   * Obtiene los logs de auditoría fiscal recientes.
   */
  async listAuditLogs(limit: number = 50): Promise<FiscalAuditLogRecord[]> {
    const { data, error } = await this.client
      .from('fiscal_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn(`[FiscalRepository] Error listando logs de auditoría:`, error.message);
      return [];
    }

    return (data || []) as FiscalAuditLogRecord[];
  }

  /**
   * Obtiene el Ticket de Acceso (WSAA) persistido para un servicio ('wsmtxca' | 'wsfe').
   */
  async getAccessTicket(service: string): Promise<FiscalAccessTicketRecord | null> {
    try {
      const { data, error } = await this.client
        .from('fiscal_access_tickets')
        .select('*')
        .eq('service', service)
        .maybeSingle();

      if (error) {
        // Puede ocurrir si la tabla aún no fue migrada en PostgreSQL
        return null;
      }

      return data as FiscalAccessTicketRecord | null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda o actualiza el Ticket de Acceso (WSAA) en PostgreSQL/Supabase.
   */
  async saveAccessTicket(record: FiscalAccessTicketRecord): Promise<void> {
    try {
      await this.client
        .from('fiscal_access_tickets')
        .upsert({
          service: record.service,
          token: record.token,
          sign: record.sign,
          generation_time: record.generation_time,
          expiration_time: record.expiration_time,
          updated_at: new Date().toISOString()
        }, { onConflict: 'service' });
    } catch (err: any) {
      console.warn(`[FiscalRepository] Advertencia al persistir TA en PostgreSQL: ${err.message}`);
    }
  }

  /**
   * Obtiene la configuración fiscal del comercio desde Supabase (tabla settings).
   * Si no existe o falla, retorna valores por defecto basados en variables de entorno.
   */
  async getFiscalConfig(): Promise<FiscalBusinessConfig> {
    const defaults: FiscalBusinessConfig = {
      businessName: process.env.ARCA_BUSINESS_NAME || 'MARTINA SUPERMERCADO S.R.L.',
      fantasyName: process.env.ARCA_FANTASY_NAME || 'Supermercado La Martina',
      cuit: (process.env.ARCA_CUIT || '').replace(/\D/g, ''),
      taxCondition: process.env.ARCA_TAX_CONDITION || 'Responsable Inscripto',
      grossIncome: process.env.ARCA_GROSS_INCOME || '901-123456-7',
      startDate: process.env.ARCA_START_DATE || '01/01/2024',
      fiscalAddress: process.env.ARCA_FISCAL_ADDRESS || 'Av. Libertador 1234, San Luis, Argentina',
      postalCode: process.env.ARCA_POSTAL_CODE || '5700',
      phone: process.env.ARCA_PHONE || '(0266) 442-1234',
      defaultPointOfSale: Number(process.env.ARCA_PV || 1),
    };

    try {
      const { data, error } = await this.client
        .from('settings')
        .select('value')
        .eq('key', 'fiscal_config')
        .eq('branch_id', 'main')
        .maybeSingle();

      if (!error && data?.value && typeof data.value === 'object') {
        return {
          ...defaults,
          ...data.value
        };
      }
    } catch (err: any) {
      console.warn(`[FiscalRepository] Error al obtener fiscal_config: ${err.message}`);
    }

    return defaults;
  }

  /**
   * Guarda o actualiza la configuración fiscal del comercio en Supabase.
   */
  async saveFiscalConfig(config: Partial<FiscalBusinessConfig>): Promise<FiscalBusinessConfig> {
    const current = await this.getFiscalConfig();
    const updated: FiscalBusinessConfig = {
      ...current,
      ...config,
      cuit: config.cuit ? String(config.cuit).replace(/\D/g, '') : current.cuit,
      defaultPointOfSale: config.defaultPointOfSale !== undefined ? Number(config.defaultPointOfSale) : current.defaultPointOfSale
    };

    const { error } = await this.client
      .from('settings')
      .upsert(
        { key: 'fiscal_config', branch_id: 'main', value: updated },
        { onConflict: 'key, branch_id' }
      );

    if (error) {
      console.error(`[FiscalRepository] Error guardando fiscal_config: ${error.message}`);
      throw error;
    }

    return updated;
  }
}
