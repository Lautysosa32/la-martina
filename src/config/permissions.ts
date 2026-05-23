import { PermissionKey, UserRole, EmployeePreset } from '../types/permissions.types';

// Definimos TODOS los permisos disponibles para facilitar la creación del super_admin y owner
const ALL_PERMISSIONS: PermissionKey[] = [
  'products.view', 'products.create', 'products.update', 'products.delete', 'products.change_price', 'products.change_stock',
  'orders.view', 'orders.update_status', 'orders.cancel', 'orders.view_revenue',
  'pos.access', 'pos.sell', 'pos.apply_discount',
  'cash.view', 'cash.open', 'cash.close', 'cash.withdraw', 'cash.view_reports',
  'customers.view', 'customers.create', 'customers.update', 'customers.delete',
  'dashboard.view_operations', 'dashboard.view_financial',
  'settings.access',
  'employees.view', 'employees.create', 'employees.update', 'employees.delete', 'employees.manage_permissions',
  'billing.view', 'billing.create', 'billing.cancel',
  'offers.view', 'offers.create', 'offers.update', 'offers.delete'
];

export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: ALL_PERMISSIONS, // Acceso total global
  owner: ALL_PERMISSIONS,       // Acceso total a su sucursal
  admin: [
    // Acceso a operaciones comerciales, inventario y caja, pero restringido en áreas financieras, empleados y facturación
    'products.view', 'products.create', 'products.update', 'products.delete', 'products.change_price', 'products.change_stock',
    'orders.view', 'orders.update_status', 'orders.cancel',
    'pos.access', 'pos.sell', 'pos.apply_discount',
    'cash.view', 'cash.open', 'cash.close', 'cash.withdraw',
    'customers.view', 'customers.create', 'customers.update', 'customers.delete',
    'dashboard.view_operations',
    'offers.view', 'offers.create', 'offers.update', 'offers.delete'
    // NOTA: admin ya no tiene acceso a 'employees.*', 'billing.*', 'dashboard.view_financial', ni 'orders.view_revenue'
  ],
  employee: [
    // El empleado común tiene permisos MUY básicos por defecto,
    // se le agregan más mediante presets o overrides (allow)
    'dashboard.view_operations',
    'products.view',
    'products.create',
    'products.update',
    'orders.view',
    'orders.update_status'
  ]
};

// Presets comunes para cargar overrides rápidos a los empleados
export const EMPLOYEE_PRESETS: Record<EmployeePreset, PermissionKey[]> = {
  encargado: [
    'dashboard.view_operations',
    'products.view', 'products.change_stock', 'products.change_price',
    'orders.view', 'orders.update_status',
    'pos.access', 'pos.sell',
    'cash.view', 'cash.open', 'cash.close',
    'customers.view', 'customers.create',
    'offers.view'
  ],
  repositor_delivery: [
    'dashboard.view_operations',
    'products.view', 'products.change_stock',
    'orders.view', 'orders.update_status'
  ],
  cajero: [
    'dashboard.view_operations',
    'products.view',
    'orders.view',
    'pos.access', 'pos.sell',
    'cash.view', 'cash.open', 'cash.close',
    'orders.update_status'
  ]
};
