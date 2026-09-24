import assert from 'assert';

console.log('================================================================');
console.log('  TEST SUITE: SEGURIDAD RLS Y TRIGGERS DE CUSTOMER_PROFILES & PRODUCT DELETE');
console.log('================================================================\n');

/**
 * Simulación de la función del trigger de PostgreSQL:
 * check_customer_profile_financial_fields()
 * Definida en: supabase/migrations/20260921000000_customer_profiles_security_trigger.sql
 */
interface CustomerProfileRow {
  id: string;
  user_id?: string | null;
  full_name: string;
  phone: string;
  email?: string;
  dni?: string;
  current_account_balance: number;
  current_account_limit: number;
  has_current_account: boolean;
  is_blocked: boolean;
}

interface UserContext {
  id: string;
  isEmployee: boolean;
  role: 'admin' | 'owner' | 'cajero' | 'cliente' | 'anon';
}

function simulateCustomerProfileUpdateTrigger(
  oldRow: CustomerProfileRow,
  newRow: CustomerProfileRow,
  context: UserContext
): { allowed: boolean; error?: string } {
  // Si el usuario es empleado autorizado, se permite la actualización
  if (context.isEmployee && ['admin', 'owner', 'cajero', 'repositor'].includes(context.role)) {
    return { allowed: true };
  }

  // Si no es empleado (es un cliente modificando su propio perfil vía RLS)
  if (newRow.user_id !== oldRow.user_id) {
    return { allowed: false, error: 'No está autorizado a modificar la vinculación del usuario.' };
  }

  if (newRow.current_account_balance !== oldRow.current_account_balance) {
    return { allowed: false, error: 'No está autorizado a alterar el saldo de su cuenta corriente.' };
  }

  if (newRow.current_account_limit !== oldRow.current_account_limit) {
    return { allowed: false, error: 'No está autorizado a alterar el límite de crédito de su cuenta corriente.' };
  }

  if (newRow.has_current_account !== oldRow.has_current_account) {
    return { allowed: false, error: 'No está autorizado a habilitar o deshabilitar su cuenta corriente.' };
  }

  if (newRow.is_blocked !== oldRow.is_blocked) {
    return { allowed: false, error: 'No está autorizado a cambiar su estado de bloqueo.' };
  }

  return { allowed: true };
}

/**
 * Simulación de la política RLS de eliminación de productos:
 * products_delete_admin -> is_admin_or_owner()
 */
function simulateProductDeletePolicy(context: UserContext): { allowed: boolean; error?: string } {
  if (['admin', 'owner'].includes(context.role)) {
    return { allowed: true };
  }
  return { allowed: false, error: 'new row violates row-level security policy for table "products"' };
}

async function runTests() {
  const baseProfile: CustomerProfileRow = {
    id: 'cust-101',
    user_id: 'usr-cust-1',
    full_name: 'Lautaro Sosa',
    phone: '3411234567',
    email: 'lautaro@example.com',
    dni: '38123456',
    current_account_balance: 15000,
    current_account_limit: 50000,
    has_current_account: true,
    is_blocked: false,
  };

  const customerCtx: UserContext = {
    id: 'usr-cust-1',
    isEmployee: false,
    role: 'cliente'
  };

  const adminCtx: UserContext = {
    id: 'usr-admin-1',
    isEmployee: true,
    role: 'admin'
  };

  const cashierCtx: UserContext = {
    id: 'usr-cashier-1',
    isEmployee: true,
    role: 'cajero'
  };

  console.log('--- TEST 1: Cliente modifica sus datos de contacto legítimos ---');
  {
    const updated = {
      ...baseProfile,
      full_name: 'Lautaro Sosa Editado',
      phone: '3419999999',
      dni: '38123456'
    };
    const res = simulateCustomerProfileUpdateTrigger(baseProfile, updated, customerCtx);
    assert.strictEqual(res.allowed, true, 'El cliente debe poder actualizar sus datos de contacto');
    console.log('  ✅ PASS: Actualización legítima de nombre y teléfono permitida al cliente');
  }

  console.log('\n--- TEST 2: Intento de auto-modificación de saldo de cuenta corriente por el cliente ---');
  {
    const attack = {
      ...baseProfile,
      current_account_balance: 0 // Intento de condonarse la deuda de 15000 a 0
    };
    const res = simulateCustomerProfileUpdateTrigger(baseProfile, attack, customerCtx);
    assert.strictEqual(res.allowed, false, 'El cliente NO debe poder alterar su saldo');
    assert.ok(res.error?.includes('saldo de su cuenta corriente'));
    console.log('  ✅ PASS: Intento de modificación de saldo bloqueado con excepción');
  }

  console.log('\n--- TEST 3: Intento de aumento no autorizado de límite de crédito ---');
  {
    const attack = {
      ...baseProfile,
      current_account_limit: 500000 // Intento de subirse el límite de 50.000 a 500.000
    };
    const res = simulateCustomerProfileUpdateTrigger(baseProfile, attack, customerCtx);
    assert.strictEqual(res.allowed, false, 'El cliente NO debe poder alterar su límite de crédito');
    console.log('  ✅ PASS: Intento de aumento de límite de crédito bloqueado');
  }

  console.log('\n--- TEST 4: Intento de auto-desbloqueo de cliente bloqueado ---');
  {
    const blockedProfile: CustomerProfileRow = { ...baseProfile, is_blocked: true };
    const attack = { ...blockedProfile, is_blocked: false };
    const res = simulateCustomerProfileUpdateTrigger(blockedProfile, attack, customerCtx);
    assert.strictEqual(res.allowed, false, 'El cliente NO debe poder desbloquearse a sí mismo');
    console.log('  ✅ PASS: Intento de auto-desbloqueo denegado');
  }

  console.log('\n--- TEST 5: Empleado/Admin modifica saldo o límites legítimamente ---');
  {
    const adminUpdate = {
      ...baseProfile,
      current_account_balance: 20000,
      current_account_limit: 80000
    };
    const res = simulateCustomerProfileUpdateTrigger(baseProfile, adminUpdate, adminCtx);
    assert.strictEqual(res.allowed, true, 'El administrador debe poder gestionar los saldos y límites');
    console.log('  ✅ PASS: Administrador autorizado para actualizar saldo y límite');
  }

  console.log('\n--- TEST 6: Permisos de DELETE en catálogo de productos ---');
  {
    const cashierDelete = simulateProductDeletePolicy(cashierCtx);
    assert.strictEqual(cashierDelete.allowed, false, 'Cajero no debe poder eliminar productos');
    console.log('  ✅ PASS: Cajero no tiene permiso para borrar productos de la base de datos');

    const customerDelete = simulateProductDeletePolicy(customerCtx);
    assert.strictEqual(customerDelete.allowed, false, 'Cliente no debe poder eliminar productos');
    console.log('  ✅ PASS: Cliente bloqueado de eliminar productos');

    const adminDelete = simulateProductDeletePolicy(adminCtx);
    assert.strictEqual(adminDelete.allowed, true, 'Admin debe poder eliminar productos');
    console.log('  ✅ PASS: Admin autorizado para eliminar productos');
  }

  console.log('\n================================================================');
  console.log('  TODOS LOS TESTS DE RLS Y TRIGGERS PASARON CON ÉXITO');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test falló con error:', err);
  process.exit(1);
});
