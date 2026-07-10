// ─── EXPENSE TYPES ───────────────────────────────────────────────────────────
// Diseñado para ser escalable: soporta futuras funciones como
// cuentas corrientes con proveedores, órdenes de compra, facturas de compra,
// vencimientos, aprobación de gastos y múltiples sucursales.

export type ExpenseType =
  | 'mercaderia'       // Compra de mercadería
  | 'proveedor'        // Pago a proveedor
  | 'sueldos'          // Sueldos
  | 'alquiler'         // Alquiler
  | 'impuestos'        // Impuestos y tasas
  | 'retiro'           // Retiro del dueño
  | 'combustible'      // Combustible
  | 'mantenimiento'    // Mantenimiento
  | 'administrativo'   // Gastos administrativos
  | 'otros';           // Otros

export type ExpensePaymentMethod =
  | 'cash'             // Efectivo
  | 'transfer'         // Transferencia bancaria
  | 'card'             // Tarjeta de crédito/débito
  | 'cuenta_corriente';// Cuenta corriente con proveedor

export type ExpenseStatus = 'active' | 'cancelled';

export interface Expense {
  id: string;
  branch_id: string;
  type: ExpenseType;
  supplier_name?: string;            // Proveedor (opcional)
  amount: number;
  payment_method: ExpensePaymentMethod;
  description?: string;
  observations?: string;
  receipt_url?: string;              // URL comprobante en Supabase Storage (futuro)
  created_by: string;                // Nombre del responsable
  created_at: string;                // ISO timestamp (automático Supabase)
  updated_at: string;                // ISO timestamp (automático Supabase)
  status: ExpenseStatus;
  expense_date: string;              // Fecha elegida por el usuario (YYYY-MM-DD)

  // ── Gestión de Cuentas Corrientes ──────────────────────────────────────────
  payment_status?: 'pending' | 'paid';
  cancellation_date?: string | null;
  cancellation_method?: 'cash' | 'card' | 'transfer' | null;
  last_activity_at?: string;

  // ── Campos reservados para futuras funciones ──────────────────────────────
  // purchase_order_id?: string;     // Para órdenes de compra
  // invoice_id?: string;            // Para facturas de compra
  // due_date?: string;              // Vencimiento
  // approved_by?: string;           // Aprobador
  // supplier_account_id?: string;   // Cuenta corriente con proveedor
}

// Labels para mostrar en la UI
export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  mercaderia: 'Compra de Mercadería',
  proveedor: 'Pago a Proveedor',
  sueldos: 'Sueldos',
  alquiler: 'Alquiler',
  impuestos: 'Impuestos',
  retiro: 'Retiro',
  combustible: 'Combustible',
  mantenimiento: 'Mantenimiento',
  administrativo: 'Gastos Administrativos',
  otros: 'Otros',
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cuenta_corriente: 'Cuenta Corriente',
};

export const EXPENSE_TYPE_ICONS: Record<ExpenseType, string> = {
  mercaderia: 'shopping_cart',
  proveedor: 'local_shipping',
  sueldos: 'badge',
  alquiler: 'home',
  impuestos: 'account_balance',
  retiro: 'account_balance_wallet',
  combustible: 'local_gas_station',
  mantenimiento: 'build',
  administrativo: 'folder',
  otros: 'more_horiz',
};
