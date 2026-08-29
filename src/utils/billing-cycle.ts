/**
 * Reglas de Ciclo de Facturación y Vencimiento de Cuenta Corriente:
 * 
 * 1. Inicio de ciclo: 10 días antes del inicio del mes (día 21 del mes anterior).
 * 2. Cierre de ciclo: Último día del mes.
 * 3. Notificaciones:
 *    - Cada vez que el cliente realiza un pedido a Cuenta Corriente.
 *    - Notificación de cierre el último día del mes.
 * 4. Fecha límite de pago: Día 10 del mes siguiente.
 *    - Si llega el día 11 y existen compras impagas de un ciclo previo, la cuenta queda bloqueada por vencimiento.
 */

export interface CustomerOverdueStatus {
  isOverdue: boolean;
  overdueDebt: number;
  oldestDueDate: Date | null;
  oldestOrderDate: string | null;
}

/**
 * Calcula la fecha de vencimiento exacta (Día 10 a las 23:59:59 del mes siguiente al ciclo)
 * para una compra registrada en un timestamp determinado.
 */
export const getOrderDueDate = (timestamp: number): Date => {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  // Si la compra fue el día 21 o posterior: pertenece al ciclo del mes siguiente (month + 1).
  // La fecha límite de pago es el día 10 del mes posterior a ese ciclo (month + 2).
  // Si la compra fue antes del día 21: pertenece al ciclo del mes corriente (month).
  // La fecha límite de pago es el día 10 del mes siguiente (month + 1).
  let dueYear = year;
  let dueMonth = day >= 21 ? month + 2 : month + 1;
  if (dueMonth > 11) {
    dueYear += Math.floor(dueMonth / 12);
    dueMonth = dueMonth % 12;
  }

  return new Date(dueYear, dueMonth, 10, 23, 59, 59, 999);
};

/**
 * Evalúa si un cliente posee deuda vencida analizando sus pedidos impagos en Cuenta Corriente.
 */
export const checkCustomerOverdueDebt = (
  customerPhone: string,
  orders: {
    phone?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    status?: string;
    total: number;
    paidAmount?: number;
    timestamp?: number;
    date?: string;
  }[]
): CustomerOverdueStatus => {
  if (!customerPhone || !orders || orders.length === 0) {
    return { isOverdue: false, overdueDebt: 0, oldestDueDate: null, oldestOrderDate: null };
  }

  const now = Date.now();
  const cleanPhone = customerPhone.replace(/\D/g, '');

  const unpaidCcOrders = orders.filter(o => {
    const oPhone = (o.phone || '').replace(/\D/g, '');
    const isMatchingPhone = oPhone === cleanPhone || (cleanPhone.length >= 8 && oPhone.endsWith(cleanPhone.slice(-8)));
    const isUnpaidCc = o.paymentMethod === 'cuenta_corriente' && o.paymentStatus !== 'Pagado' && o.status !== 'Cancelado';
    const pendingAmount = o.total - (o.paidAmount || 0);
    return isMatchingPhone && isUnpaidCc && pendingAmount > 0;
  });

  let overdueDebt = 0;
  let oldestDueDate: Date | null = null;
  let oldestOrderDate: string | null = null;

  for (const o of unpaidCcOrders) {
    const ts = o.timestamp || (o.date ? new Date(o.date).getTime() : now);
    const dueDate = getOrderDueDate(ts);
    if (now > dueDate.getTime()) {
      overdueDebt += (o.total - (o.paidAmount || 0));
      if (!oldestDueDate || dueDate < oldestDueDate) {
        oldestDueDate = dueDate;
        oldestOrderDate = o.date || new Date(ts).toLocaleDateString('es-AR');
      }
    }
  }

  return {
    isOverdue: overdueDebt > 0,
    overdueDebt,
    oldestDueDate,
    oldestOrderDate
  };
};

/**
 * Determina si corresponde mostrar el recordatorio de vencimiento del ciclo de Cuenta Corriente.
 * 
 * Regla: El recordatorio solo debe mostrarse si la cuenta/pedido inició en un ciclo anterior y
 * ya pasó el mes en el que se inició (por ejemplo, inició en agosto o antes del 20 de agosto y
 * ya estamos a partir del 1 de septiembre). No debe mostrarse en compras nuevas donde se está
 * dentro del período regular y al día.
 */
export const shouldShowCycleReminder = (oldestTimestampOrDate?: number | string | null): boolean => {
  if (!oldestTimestampOrDate) return false;

  const orderTs = typeof oldestTimestampOrDate === 'string'
    ? new Date(oldestTimestampOrDate).getTime()
    : oldestTimestampOrDate;

  if (isNaN(orderTs)) return false;

  const orderDate = new Date(orderTs);
  const now = new Date();

  const orderDay = orderDate.getDate();
  const orderMonth = orderDate.getMonth();
  const orderYear = orderDate.getFullYear();

  // Determinar el mes de cierre del ciclo para esa orden:
  // Si fue antes del día 21: el ciclo cierra el último día de orderMonth.
  // A partir del 1 del mes siguiente (orderMonth + 1), ya pasó el mes y se debe mostrar el recordatorio.
  // Si fue el día 21 o después: pertenece al ciclo del mes siguiente (orderMonth + 1).
  // A partir del 1 del mes subsiguiente (orderMonth + 2), se muestra el recordatorio.
  let reminderYear = orderYear;
  let reminderMonth = orderDay >= 21 ? orderMonth + 2 : orderMonth + 1;
  if (reminderMonth > 11) {
    reminderYear += Math.floor(reminderMonth / 12);
    reminderMonth = reminderMonth % 12;
  }

  const reminderStartDate = new Date(reminderYear, reminderMonth, 1, 0, 0, 0, 0);
  return now.getTime() >= reminderStartDate.getTime();
};

