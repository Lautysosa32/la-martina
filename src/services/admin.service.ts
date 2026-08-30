import { supabase } from '../lib/supabase';
import { 
  AdminOrder, CashMovement, CashClose, Offer, 
  CustomerProfile, TicketConfig, CurrentAccountConfig, 
  StoreStatus, CashRegister, Invoice, BillingCustomer,
  Category
} from '../context/AdminContext';

const BRANCH_ID = 'main';

// ─── ORDERS ─────────────────────────────────────────────────────────────
export const fetchOrders = async (): Promise<AdminOrder[]> => {
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('branch_id', BRANCH_ID).order('created_at', { ascending: false });
  if (error) { 
    console.error('Error fetching orders:', error); 
    alert(`Error AL CARGAR órdenes: ${error.message}`);
    return []; 
  }
  
  return (data || []).map((dbOrder: any) => {
    let delivery_lat = dbOrder.delivery_lat ?? null;
    let delivery_lng = dbOrder.delivery_lng ?? null;
    let delivery_address_label = dbOrder.delivery_address_label ?? null;
    let delivery_house_number = dbOrder.delivery_house_number ?? null;
    let delivery_reference = dbOrder.delivery_reference ?? null;
    let delivery_notes = dbOrder.delivery_notes ?? null;
    let rawAddress = dbOrder.address || '';

    // Extraer coordenadas y metadatos si estaban embebidos en el string de dirección
    if (rawAddress) {
      const geoMatch = rawAddress.match(/\[GEO:([-\d.]+),([-\d.]+)\]/);
      if (geoMatch) {
        if (!delivery_lat) delivery_lat = parseFloat(geoMatch[1]);
        if (!delivery_lng) delivery_lng = parseFloat(geoMatch[2]);
      }
      const alturaMatch = rawAddress.match(/\[ALTURA:([^\]]+)\]/);
      if (alturaMatch) {
        if (!delivery_house_number) delivery_house_number = alturaMatch[1].trim();
      }
      const refMatch = rawAddress.match(/\[REF:([^\]]+)\]/);
      if (refMatch) {
        if (!delivery_reference) delivery_reference = refMatch[1].trim();
      }
      const notasMatch = rawAddress.match(/\[NOTAS:([^\]]+)\]/);
      if (notasMatch) {
        if (!delivery_notes) delivery_notes = notasMatch[1].trim();
      }

      // Fallback para pedidos anteriores con formato "Calle Nº 123 (Ref)"
      if (!delivery_house_number) {
        const legacyNroMatch = rawAddress.match(/Nº\s*([^\(\[]+)/i);
        if (legacyNroMatch) delivery_house_number = legacyNroMatch[1].trim();
      }
      if (!delivery_reference) {
        const legacyRefMatch = rawAddress.match(/\(([^\)\[]+)\)/);
        if (legacyRefMatch) delivery_reference = legacyRefMatch[1].trim();
      }

      // Limpiar rawAddress para obtener la dirección/calle pura
      let cleanAddress = rawAddress
        .replace(/\s*\[GEO:[-\d.]+,[-\d.]+\]/g, '')
        .replace(/\s*\[ALTURA:[^\]]+\]/g, '')
        .replace(/\s*\[REF:[^\]]+\]/g, '')
        .replace(/\s*\[NOTAS:[^\]]+\]/g, '')
        .replace(/\s*Nº\s*[^\(\[]+/i, '')
        .replace(/\s*\([^\)\[]+\)/g, '')
        .trim();

      if (!delivery_address_label || delivery_address_label === rawAddress) {
        delivery_address_label = cleanAddress || rawAddress;
      }
      rawAddress = cleanAddress || rawAddress;
    }

    return {
      id: dbOrder.id,
      date: dbOrder.date,
      timestamp: dbOrder.timestamp,
      customer: dbOrder.customer,
      phone: dbOrder.phone,
      dni: dbOrder.dni,
      address: delivery_address_label || rawAddress,
      deliveryTime: dbOrder.delivery_time,
      method: dbOrder.method,
      source: dbOrder.method === 'Caja Fija' ? 'pos' : 'web',
      paymentMethod: dbOrder.payment_method,
      paymentStatus: dbOrder.payment_status,
      status: dbOrder.status,
      total: dbOrder.total,
      paidAmount: Number(dbOrder.paid_amount ?? (dbOrder.payment_status === 'Pagado' ? dbOrder.total : 0)),
      discount: dbOrder.discount,
      discountLabel: dbOrder.discount_label,
      delivery_lat,
      delivery_lng,
      delivery_address_label: delivery_address_label || rawAddress,
      delivery_house_number: delivery_house_number ? String(delivery_house_number).trim() : null,
      delivery_reference: delivery_reference ? String(delivery_reference).trim() : null,
      delivery_notes: delivery_notes ? String(delivery_notes).trim() : null,
      delivery_method: dbOrder.delivery_method,
      items: (dbOrder.order_items || []).map((item: any) => ({
        id: item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image
      }))
    };
  });
};

export const insertOrder = async (order: AdminOrder): Promise<void> => {
  // Construir dirección enriquecida con metadatos estructurados para preservar todo
  let baseAddressLabel = order.delivery_address_label || order.address || '';
  // Limpiar cualquier tag previo si existiera
  baseAddressLabel = baseAddressLabel
    .replace(/\s*\[GEO:[-\d.]+,[-\d.]+\]/g, '')
    .replace(/\s*\[ALTURA:[^\]]+\]/g, '')
    .replace(/\s*\[REF:[^\]]+\]/g, '')
    .replace(/\s*\[NOTAS:[^\]]+\]/g, '')
    .replace(/\s*Nº\s*[^\(\[]+/i, '')
    .replace(/\s*\([^\)\[]+\)/g, '')
    .trim();

  const metaParts: string[] = [];
  if (order.delivery_house_number && order.delivery_house_number.trim()) {
    metaParts.push(`[ALTURA:${order.delivery_house_number.trim()}]`);
  }
  if (order.delivery_reference && order.delivery_reference.trim()) {
    metaParts.push(`[REF:${order.delivery_reference.trim()}]`);
  }
  if (order.delivery_notes && order.delivery_notes.trim()) {
    metaParts.push(`[NOTAS:${order.delivery_notes.trim()}]`);
  }
  if (order.delivery_lat && order.delivery_lng) {
    metaParts.push(`[GEO:${order.delivery_lat},${order.delivery_lng}]`);
  }

  const fullAddress = [baseAddressLabel, ...metaParts].filter(Boolean).join(' ');

  const dbOrder: any = {
    id: order.id,
    branch_id: BRANCH_ID,
    date: order.date,
    timestamp: order.timestamp || Date.now(),
    customer: order.customer,
    phone: order.phone,
    address: fullAddress,
    delivery_time: order.deliveryTime,
    method: order.method,
    payment_method: order.paymentMethod,
    payment_status: order.paymentStatus,
    status: order.status,
    total: order.total,
    paid_amount: order.paidAmount ?? (order.paymentStatus === 'Pagado' ? order.total : 0),
    discount: order.discount,
    discount_label: order.discountLabel
  };
  if (order.dni) dbOrder.dni = order.dni;
  if (order.delivery_lat !== undefined) dbOrder.delivery_lat = order.delivery_lat;
  if (order.delivery_lng !== undefined) dbOrder.delivery_lng = order.delivery_lng;
  if (order.delivery_address_label !== undefined) dbOrder.delivery_address_label = order.delivery_address_label;
  if (order.delivery_house_number !== undefined) dbOrder.delivery_house_number = order.delivery_house_number;
  if (order.delivery_reference !== undefined) dbOrder.delivery_reference = order.delivery_reference;
  if (order.delivery_notes !== undefined) dbOrder.delivery_notes = order.delivery_notes;
  if (order.delivery_method !== undefined) dbOrder.delivery_method = order.delivery_method;

  const { error } = await supabase.from('orders').insert(dbOrder);
  if (error) {
    console.warn('Inserción con columnas extendidas de delivery falló, reintentando con columnas estándar:', error.message);
    
    // Inserción segura garantizada con columnas estándar de Supabase
    const standardDbOrder: any = {
      id: order.id,
      branch_id: BRANCH_ID,
      date: order.date,
      timestamp: order.timestamp || Date.now(),
      customer: order.customer,
      phone: order.phone,
      address: fullAddress,
      delivery_time: order.deliveryTime,
      method: order.method,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      status: order.status,
      total: order.total,
      paid_amount: order.paidAmount ?? (order.paymentStatus === 'Pagado' ? order.total : 0),
      discount: order.discount,
      discount_label: order.discountLabel
    };
    if (order.dni) standardDbOrder.dni = order.dni;

    const { error: retryError } = await supabase.from('orders').insert(standardDbOrder);
    if (retryError) {
      console.error('Error insertando orden estándar:', retryError);
      alert(`Error guardando orden: ${retryError.message}`);
      return;
    }
  }

  if (order.items && order.items.length > 0) {
    const dbOrderItems = order.items.map(i => ({
      order_id: order.id,
      product_id: i.id,
      quantity: i.quantity,
      price: i.price,
      name: i.name
      // Omitimos la imagen porque si es un base64 gigante rompe el límite de 1MB de Supabase y da "Failed to fetch"
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(dbOrderItems);
    if (itemsError) {
      console.error('Error inserting order items:', itemsError);
      // Si la columna en Supabase es integer, reintentar con enteros redondeados para no interrumpir la venta
      if (itemsError.message?.includes('integer')) {
        const fallbackItems = dbOrderItems.map(i => ({
          ...i,
          quantity: Math.max(1, Math.round(i.quantity))
        }));
        const { error: retryErr } = await supabase.from('order_items').insert(fallbackItems);
        if (retryErr) {
          console.error('Error inserting fallback order items:', retryErr);
        }
      } else {
        alert(`Error guardando ítems: ${itemsError.message}`);
      }
    }
  }
};

export const updateOrderInDb = async (id: string, updates: Partial<AdminOrder>): Promise<void> => {
  const dbUpdates: any = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.paymentStatus !== undefined) dbUpdates.payment_status = updates.paymentStatus;
  if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
  if (updates.paidAmount !== undefined) dbUpdates.paid_amount = updates.paidAmount;
  if (updates.total !== undefined) dbUpdates.total = updates.total;
  if (updates.deliveryTime !== undefined) dbUpdates.delivery_time = updates.deliveryTime;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.dni !== undefined) dbUpdates.dni = updates.dni;
  if (updates.customer !== undefined) dbUpdates.customer = updates.customer;
  if (updates.delivery_lat !== undefined) dbUpdates.delivery_lat = updates.delivery_lat;
  if (updates.delivery_lng !== undefined) dbUpdates.delivery_lng = updates.delivery_lng;
  if (updates.delivery_address_label !== undefined) dbUpdates.delivery_address_label = updates.delivery_address_label;
  if (updates.delivery_house_number !== undefined) dbUpdates.delivery_house_number = updates.delivery_house_number;
  if (updates.delivery_reference !== undefined) dbUpdates.delivery_reference = updates.delivery_reference;
  if (updates.delivery_notes !== undefined) dbUpdates.delivery_notes = updates.delivery_notes;
  if (updates.delivery_method !== undefined) dbUpdates.delivery_method = updates.delivery_method;
  
  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase.from('orders').update(dbUpdates).eq('id', id).eq('branch_id', BRANCH_ID);
  if (error) console.error('Error updating order:', error);
};

export const updateOrderItemsInDb = async (
  orderId: string, 
  items: any[], 
  newTotal: number
): Promise<void> => {
  // 1. Actualizar total en la orden
  const { error: orderErr } = await supabase
    .from('orders')
    .update({ total: newTotal })
    .eq('id', orderId)
    .eq('branch_id', BRANCH_ID);
  
  if (orderErr) {
    console.error('Error updating order total in db:', orderErr);
  }

  // 2. Reemplazar items en order_items
  const { error: delErr } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId);

  if (delErr) {
    console.error('Error removing old order_items in db:', delErr);
  }

  if (items && items.length > 0) {
    const dbOrderItems = items.map(i => ({
      order_id: orderId,
      product_id: i.id,
      quantity: i.quantity,
      price: i.price,
      name: i.name
    }));

    const { error: insErr } = await supabase
      .from('order_items')
      .insert(dbOrderItems);

    if (insErr) {
      console.error('Error inserting updated order_items:', insErr);
      if (insErr.message?.includes('integer')) {
        const fallbackItems = dbOrderItems.map(i => ({
          ...i,
          quantity: Math.max(1, Math.round(i.quantity))
        }));
        await supabase.from('order_items').insert(fallbackItems);
      }
    }
  }
};

// ─── CASH MOVEMENTS ─────────────────────────────────────────────────────
export const fetchCashMovements = async (): Promise<CashMovement[]> => {
  const { data, error } = await supabase.from('cash_movements').select('*').eq('branch_id', BRANCH_ID).order('timestamp', { ascending: false });
  if (error) { console.error('Error fetching cash movements:', error); return []; }
  
  return (data || []).map((dbMov: any) => ({
    id: dbMov.id,
    type: dbMov.type,
    amount: dbMov.amount,
    description: dbMov.description,
    timestamp: dbMov.timestamp,
    cashier: dbMov.cashier,
    orderId: dbMov.order_id
  }));
};

export const insertCashMovement = async (mov: CashMovement): Promise<void> => {
  const dbMov = {
    id: mov.id,
    branch_id: BRANCH_ID,
    type: mov.type,
    amount: mov.amount,
    description: mov.description,
    timestamp: mov.timestamp || Date.now(),
    cashier: mov.cashier,
    order_id: mov.orderId
  };
  const { error } = await supabase.from('cash_movements').insert(dbMov);
  if (error) {
    console.error('Error inserting cash movement:', error);
    alert(`Error guardando movimiento de caja: ${error.message}`);
  }
};

// ─── CASH CLOSES ────────────────────────────────────────────────────────
export const fetchCashCloses = async (): Promise<CashClose[]> => {
  const { data, error } = await supabase.from('cash_closes').select('*').eq('branch_id', BRANCH_ID).order('closed_at', { ascending: false });
  if (error) { console.error('Error fetching cash closes:', error); return []; }
  
  return (data || []).map((dbClose: any) => ({
    id: dbClose.id,
    date: dbClose.date,
    period: dbClose.period,
    totalSales: dbClose.total_sales ?? dbClose.totalSales,
    totalOrders: dbClose.total_orders ?? dbClose.totalOrders,
    cashPayments: dbClose.cash_payments ?? dbClose.cashPayments,
    cardPayments: dbClose.card_payments ?? dbClose.cardPayments,
    transferPayments: dbClose.transfer_payments ?? dbClose.transferPayments,
    cuentaCorrientePayments: dbClose.cuenta_corriente_payments ?? dbClose.cuentaCorrientePayments ?? 0,
    closedAt: dbClose.closed_at ?? dbClose.closedAt ?? dbClose.created_at,
    withdrawals: dbClose.withdrawals || [],
    totalWithdrawals: dbClose.total_withdrawals ?? dbClose.totalWithdrawals,
    movementIds: (dbClose.movement_ids ?? dbClose.movementIds) || [],
    initialAmount: dbClose.initial_amount ?? dbClose.initialAmount,
    openingControlExpected: dbClose.opening_control_expected ?? dbClose.openingControlExpected,
    openingControlCounted: dbClose.opening_control_counted ?? dbClose.openingControlCounted,
    openingControlDifference: dbClose.opening_control_difference ?? dbClose.openingControlDifference,
    openingControlNotes: dbClose.opening_control_notes ?? dbClose.openingControlNotes,
    openingControlCheckedBy: dbClose.opening_control_checked_by ?? dbClose.openingControlCheckedBy,
    openingControlCheckedAt: dbClose.opening_control_checked_at ?? dbClose.openingControlCheckedAt
  }));
};

export const insertCashClose = async (close: CashClose): Promise<void> => {
  const dbClose = {
    id: close.id,
    branch_id: BRANCH_ID,
    date: close.date,
    period: close.period,
    total_sales: close.totalSales,
    total_orders: close.totalOrders,
    cash_payments: close.cashPayments,
    card_payments: close.cardPayments,
    transfer_payments: close.transferPayments,
    cuenta_corriente_payments: close.cuentaCorrientePayments ?? 0,
    closed_at: close.closedAt,
    withdrawals: close.withdrawals,
    total_withdrawals: close.totalWithdrawals,
    movement_ids: close.movementIds,
    initial_amount: close.initialAmount,
    opening_control_expected: close.openingControlExpected,
    opening_control_counted: close.openingControlCounted,
    opening_control_difference: close.openingControlDifference,
    opening_control_notes: close.openingControlNotes,
    opening_control_checked_by: close.openingControlCheckedBy,
    opening_control_checked_at: close.openingControlCheckedAt
  };
  const { error } = await supabase.from('cash_closes').insert(dbClose);
  if (error) {
    console.error('Error inserting cash close:', error);
    alert(`Error guardando cierre de caja: ${error.message}. Por favor contactá a soporte o revisá la base de datos.`);
  }
};

// ─── OFFERS ─────────────────────────────────────────────────────────────
export const fetchOffers = async (): Promise<Offer[]> => {
  const { data, error } = await supabase.from('offers').select('*').eq('branch_id', BRANCH_ID);
  if (error) { console.error('Error fetching offers:', error); return []; }
  return data || [];
};

export const insertOffer = async (offer: Offer): Promise<void> => {
  const { error } = await supabase.from('offers').insert({ ...offer, branch_id: BRANCH_ID });
  if (error) console.error('Error inserting offer:', error);
};

export const updateOfferInDb = async (id: string, updates: Partial<Offer>): Promise<void> => {
  const { error } = await supabase.from('offers').update(updates).eq('id', id).eq('branch_id', BRANCH_ID);
  if (error) console.error('Error updating offer:', error);
};

export const deleteOfferInDb = async (id: string): Promise<void> => {
  const { error } = await supabase.from('offers').delete().eq('id', id).eq('branch_id', BRANCH_ID);
  if (error) console.error('Error deleting offer:', error);
};

// ─── CUSTOMER PROFILES ──────────────────────────────────────────────────
export const fetchCustomerProfiles = async (): Promise<Record<string, CustomerProfile>> => {
  const { data, error } = await supabase.from('customer_profiles').select('*').eq('branch_id', BRANCH_ID);
  if (error) { console.error('Error fetching customer profiles:', error); return {}; }
  
  const profiles: Record<string, CustomerProfile> = {};
  data?.forEach((prof: any) => {
    profiles[prof.phone] = prof as CustomerProfile; // Primary tracking by phone
  });
  return profiles;
};

export const upsertCustomerProfile = async (profile: CustomerProfile): Promise<void> => {
  const dbProfile = { ...profile, branch_id: BRANCH_ID, dni: profile.dni || profile.phone }; // Ensure DNI is present
  const { error } = await supabase.from('customer_profiles').upsert(
    dbProfile,
    { onConflict: 'phone, branch_id' }
  );
  if (error) console.error('Error upserting customer profile:', error);
};

// ─── SETTINGS (Key-Value Store) ─────────────────────────────────────────
export const fetchSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .eq('branch_id', BRANCH_ID)
    .maybeSingle();
    
  if (error && error.code !== 'PGRST116') {
    console.error(`Error fetching setting ${key}:`, error);
  }
  return data?.value ? (data.value as T) : defaultValue;
};

export const saveSetting = async <T>(key: string, value: T): Promise<void> => {
  const { error } = await supabase.from('settings').upsert(
    { key, branch_id: BRANCH_ID, value },
    { onConflict: 'key, branch_id' }
  );
  if (error) console.error(`Error saving setting ${key}:`, error);
};

// ─── CATEGORIES ─────────────────────────────────────────────────────────
export const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*').order('title', { ascending: true });
  if (error) { console.error('Error fetching categories:', error); return []; }
  return data || [];
};

export const insertCategory = async (category: Category): Promise<void> => {
  const { error } = await supabase.from('categories').insert(category);
  if (error) console.error('Error inserting category:', error);
};

export const updateCategoryInDb = async (id: string, updates: Partial<Category>): Promise<void> => {
  const { error } = await supabase.from('categories').update(updates).eq('id', id);
  if (error) console.error('Error updating category:', error);
};

export const deleteCategoryFromDb = async (id: string): Promise<void> => {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) console.error('Error deleting category:', error);
};
