import { supabase } from '../lib/supabase';

export interface WhatsAppMessage {
  id?: string;
  branch_id?: string;
  phone: string;
  customer_name?: string;
  type: string;
  title?: string;
  message: string;
  status?: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  order_id?: string | null;
  customer_phone?: string | null;
  account_movement_id?: string | null;
  attempts?: number;
  error_message?: string | null;
  scheduled_at?: string;
  sent_at?: string | null;
  created_at?: string;
}

/**
 * Normaliza y formatea el número de teléfono para envío por WhatsApp (especialmente prefijos argentinos).
 */
export const cleanAndFormatPhone = (phone: string): string => {
  if (!phone) return '';
  // Quitar espacios, símbolos y todo lo que no sea número
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';

  // Celulares en Argentina: si el número ya tiene el prefijo de país "54" y le falta el "9" 
  // (es decir, longitud de 12 dígitos, ej. "54 2634877314"), insertamos el "9" ➔ "5492634877314"
  if (cleaned.startsWith('54') && cleaned.length === 12) {
    cleaned = '549' + cleaned.substring(2);
  } else if (cleaned.length === 10 && !cleaned.startsWith('54')) {
    // Si tiene 10 dígitos (código de área + número local) y no empieza con "54", anteponer "549"
    cleaned = '549' + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith('9') && !cleaned.startsWith('54')) {
    // Si tiene 11 dígitos y empieza con 9, ej. "92617139129", anteponer "54"
    cleaned = '54' + cleaned;
  } else if (cleaned.length > 0 && !cleaned.startsWith('54') && cleaned.length < 12) {
    // Prefijo comodín
    cleaned = '549' + cleaned;
  }
  return cleaned;
};

export const whatsappMessageService = {
  /**
   * Crea e inserta un mensaje genérico en la cola de Supabase
   */
  async createWhatsAppMessage(payload: Omit<WhatsAppMessage, 'id' | 'created_at'>): Promise<WhatsAppMessage | null> {
    const formattedPhone = cleanAndFormatPhone(payload.phone);
    if (!formattedPhone) {
      console.warn('⚠️ No se puede encolar mensaje de WhatsApp: teléfono vacío o inválido.', payload.phone);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert({
          ...payload,
          phone: formattedPhone,
          branch_id: payload.branch_id || 'main',
          status: payload.status || 'pending',
          attempts: payload.attempts || 0
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error insertando mensaje en whatsapp_messages:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('❌ Excepción al encolar mensaje de WhatsApp:', err);
      return null;
    }
  },

  /**
   * Encola un mensaje de cambio de estado de pedido (Fase 4), evitando duplicar
   * el mismo estado consecutivamente para el mismo pedido.
   */
  async createOrderStatusMessage(order: { id: string; customer: string; phone: string; status: string }) {
    if (!order.phone) return null;

    // Verificar si ya existe un mensaje idéntico (pedido + estado)
    try {
      const { data: existing } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('order_id', order.id)
        .eq('type', 'order_status_changed')
        .eq('title', `Estado: ${order.status}`)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`ℹ️ Mensaje de estado "${order.status}" para el pedido #${order.id} ya se encuentra encolado. Ignorando duplicado.`);
        return null;
      }
    } catch (e) {
      console.error('Error verificando duplicado de mensaje de estado:', e);
    }

    let statusText = '';
    let emoji = '🛒';

    switch (order.status) {
      case 'Preparación':
        statusText = `está en preparación.`;
        emoji = '👨‍🍳';
        break;
      case 'En Camino':
        statusText = `ya está en camino. 🚚`;
        emoji = '🚚';
        break;
      case 'Entregado':
        statusText = `fue entregado. ¡Gracias por comprar en La Martina!`;
        emoji = '✅';
        break;
      case 'Cancelado':
        statusText = `ha sido cancelado.`;
        emoji = '❌';
        break;
      default:
        statusText = `cambió a estado: ${order.status}.`;
    }

    const message = `Hola ${order.customer} ${emoji}\nTu pedido *#${order.id}* ${statusText}`;

    return this.createWhatsAppMessage({
      phone: order.phone,
      customer_name: order.customer,
      type: 'order_status_changed',
      title: `Estado: ${order.status}`,
      message,
      order_id: order.id,
      customer_phone: order.phone
    });
  },

  /**
   * Encola un mensaje de deuda agregada a cuenta corriente (Fase 3)
   */
  async createCurrentAccountDebtMessage(
    customerPhone: string,
    customerName: string,
    amount: number,
    totalDebt: number,
    detail: string,
    orderId?: string
  ) {
    const formattedAmount = amount.toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const formattedTotal = totalDebt.toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const message = `Hola ${customerName} 👋\nSe agregó una compra a tu cuenta corriente en La Martina.\n\nImporte: *$${formattedAmount}*\nDetalle: ${detail}\nDeuda total actual: *$${formattedTotal}*\n\nGracias.`;

    return this.createWhatsAppMessage({
      phone: customerPhone,
      customer_name: customerName,
      type: 'current_account_debt_added',
      title: 'Compra en Cuenta Corriente',
      message,
      order_id: orderId || null,
      customer_phone: customerPhone
    });
  },

  /**
   * Encola un mensaje de pago recibido en cuenta corriente (Fase 3)
   */
  async createCurrentAccountPaymentMessage(
    customerPhone: string,
    customerName: string,
    paymentAmount: number,
    remainingDebt: number
  ) {
    const formattedPayment = paymentAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const formattedRemaining = remainingDebt.toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const message = `Hola ${customerName} 👋\nRegistramos un pago en tu cuenta corriente.\n\nPago recibido: *$${formattedPayment}*\nDeuda restante: *$${formattedRemaining}*\n\nGracias.`;

    return this.createWhatsAppMessage({
      phone: customerPhone,
      customer_name: customerName,
      type: 'current_account_payment_received',
      title: 'Pago Recibido - Cuenta Corriente',
      message,
      customer_phone: customerPhone
    });
  },

  /**
   * Encola un mensaje de alerta de límite superado (Fase 3)
   */
  async createLimitExceededMessage(
    customerPhone: string,
    customerName: string,
    totalDebt: number,
    limit: number
  ) {
    const formattedDebt = totalDebt.toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const formattedLimit = limit.toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const message = `Hola ${customerName} 👋\nTu cuenta corriente superó el límite configurado.\n\nDeuda actual: *$${formattedDebt}*\nLímite: *$${formattedLimit}*`;

    return this.createWhatsAppMessage({
      phone: customerPhone,
      customer_name: customerName,
      type: 'current_account_limit_exceeded',
      title: 'Límite Superado',
      message,
      customer_phone: customerPhone
    });
  },

  /**
   * Obtiene todos los mensajes de la tabla (usado en panel admin)
   */
  async getAllMessages(): Promise<WhatsAppMessage[]> {
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching whatsapp_messages:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception fetching messages:', err);
      return [];
    }
  },

  /**
   * Cancela un mensaje pendiente (Fase 5)
   */
  async cancelMessage(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) {
        console.error('Error canceling message:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception canceling message:', err);
      return false;
    }
  },

  /**
   * Reintenta un mensaje fallido (Fase 5)
   */
  async retryMessage(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({
          status: 'pending',
          attempts: 0,
          error_message: null
        })
        .eq('id', id);

      if (error) {
        console.error('Error retrying message:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Exception retrying message:', err);
      return false;
    }
  }
};
