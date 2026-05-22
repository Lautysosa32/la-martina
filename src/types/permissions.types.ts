export type UserRole = 'super_admin' | 'owner' | 'admin' | 'employee';

export type PermissionKey =
  // Productos
  | 'products.view'
  | 'products.create'
  | 'products.update'
  | 'products.delete'
  | 'products.change_price'
  | 'products.change_stock'
  // Pedidos
  | 'orders.view'
  | 'orders.update_status'
  | 'orders.cancel'
  | 'orders.view_revenue'
  // POS
  | 'pos.access'
  | 'pos.sell'
  | 'pos.apply_discount'
  // Caja
  | 'cash.view'
  | 'cash.open'
  | 'cash.close'
  | 'cash.withdraw'
  | 'cash.view_reports'
  // Clientes
  | 'customers.view'
  | 'customers.create'
  | 'customers.update'
  | 'customers.delete'
  // Dashboard
  | 'dashboard.view_operations'
  | 'dashboard.view_financial'
  // Configuración
  | 'settings.access'
  // Empleados
  | 'employees.view'
  | 'employees.create'
  | 'employees.update'
  | 'employees.delete'
  | 'employees.manage_permissions'
  // Facturación
  | 'billing.view'
  | 'billing.create'
  | 'billing.cancel'
  // Ofertas
  | 'offers.view'
  | 'offers.create'
  | 'offers.update'
  | 'offers.delete';

export interface PermissionsOverride {
  allow: PermissionKey[];
  deny: PermissionKey[];
}

export interface Employee {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  branch_id: string | null;
  active: boolean;
  permissions_override: PermissionsOverride;
  created_at: string;
  updated_at: string;
}

export type EmployeePreset = 'encargado' | 'repositor_delivery' | 'cajero';
