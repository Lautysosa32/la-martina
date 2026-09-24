export type SyncStatus = 
  | 'local_confirmed' 
  | 'pending_sync' 
  | 'syncing' 
  | 'synced' 
  | 'conflict' 
  | 'failed';

export type OperationType = 
  | 'SALE' 
  | 'CASH_MOVEMENT' 
  | 'CASH_CLOSE' 
  | 'CUSTOMER_PAYMENT';

export type ConflictType = 
  | 'CREDIT_LIMIT_EXCEEDED' 
  | 'CUSTOMER_BLOCKED' 
  | 'STOCK_NEGATIVE' 
  | 'CLOSE_DISCREPANCY' 
  | 'PRICE_MISMATCH'
  | 'OTHER';

export interface OfflineSaleItem {
  productId: string;
  productCode: string; // barcode or custom code
  name: string;
  price: number;
  originalPrice?: number | null;
  quantity: number;
  saleType: 'unit' | 'weight';
  image?: string;
  discount?: number;
  discountLabel?: string;
  lineDiscount?: number;
  total: number;
}

export interface OfflineSale {
  sale_id: string; // Canonical format: POS-CAJA01-1725750000-8A3F
  caja_id: string; // e.g. CAJA-01
  sync_status: SyncStatus;
  created_at: string; // ISO date
  timestamp: number; // epoch ms
  employee_id?: string;
  employee_name?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_dni?: string;
  payment_method: 'cash' | 'card' | 'transfer' | 'cuenta_corriente';
  payment_status: 'Pagado' | 'Pendiente';
  items: OfflineSaleItem[];
  subtotal: number;
  discount_amount: number;
  discount_label?: string;
  total: number;
  ticket_number?: string;
  is_offline: boolean;
  invoice_id?: string;
  is_billed?: boolean;
  error_message?: string;
  synced_at?: string;
}

export interface OfflineCashMovement {
  id: string;
  caja_id: string;
  type: 'Ingreso' | 'Egreso' | 'Retiro';
  description: string;
  cashier: string;
  amount: number;
  timestamp: number;
  order_id?: string;
  sync_status: SyncStatus;
  created_at: string;
  synced_at?: string;
}

export interface OfflineCashClose {
  id: string;
  caja_id: string;
  date: string;
  period: 'diario' | 'semanal' | 'mensual';
  total_sales: number;
  total_orders: number;
  cash_payments: number;
  card_payments: number;
  transfer_payments: number;
  cuenta_corriente_payments: number;
  initial_amount: number;
  total_withdrawals: number;
  closed_at: string;
  closed_by: string;
  pending_sync_count: number;
  withdrawals: Array<{ amount: number; reason: string; timestamp: number }>;
  sync_status: SyncStatus;
  reconciled_at?: string;
}

export interface LocalProduct {
  id: string;
  branch_id?: string;
  name: string;
  brand: string;
  category_id: string;
  subcategory_id?: string | null;
  price: number;
  original_price?: number | null;
  barcode?: string | null;
  image: string;
  format?: string | null;
  stock: number;
  min_stock?: number;
  sale_type: 'unit' | 'weight';
  discount?: string | null;
  badge?: string | null;
  is_new?: boolean;
  active: boolean;
  is_paused?: boolean;
  updated_at: string;
  deleted_at?: string | null;
}

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string;
  dni?: string;
  email?: string;
  address?: string;
  hasCurrentAccount: boolean;
  creditLimit: number;
  customDebtLimit?: number | null;
  customDebtDays?: number | null;
  useCustomAccountLimits?: boolean;
  currentDebt: number;
  oldestDebtDays?: number;
  active: boolean;
  updated_at: string;
}

export interface LocalOffer {
  id: string;
  title: string;
  description?: string;
  discount_percentage?: number;
  active: boolean;
  valid_until?: string;
  updated_at?: string;
}

export interface SyncQueueItem {
  id: string;
  caja_id: string;
  operation_type: OperationType;
  entity_id: string; // sale_id, movement_id, close_id
  payload: any;
  status: SyncStatus;
  retry_count: number;
  last_error?: string;
  created_at: number;
  updated_at: number;
}

export interface SyncConflict {
  id: string;
  caja_id: string;
  entity_type: 'SALE' | 'PAYMENT' | 'STOCK' | 'CLOSE';
  entity_id: string;
  conflict_type: ConflictType;
  details: Record<string, any>;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export interface CajaConfig {
  key: string;
  value: any;
  updated_at?: number;
}

export interface ConnectionState {
  isOnline: boolean;
  isSupabaseReachable: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastHeartbeat?: number;
}
