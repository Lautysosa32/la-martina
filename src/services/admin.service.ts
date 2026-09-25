import { supabase } from '../lib/supabase';
import api from '../lib/axios';
import { catalogCache, TTL } from './catalogCache';
import { settingsRepository } from '../offline/repositories/settingsRepository';
import { 
  AdminOrder, CashMovement, CashClose, Offer, 
  CustomerProfile, TicketConfig, CurrentAccountConfig, 
  StoreStatus, CashRegister, Invoice, BillingCustomer,
  Category, Subcategory
} from '../context/AdminContext';

const BRANCH_ID = 'main';

// ─── ORDERS ─────────────────────────────────────────────────────────────
export const fetchOrders = async (): Promise<AdminOrder[]> => {
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('branch_id', BRANCH_ID).order('created_at', { ascending: false });
  if (error) { 
    console.error('Error fetching orders from Supabase:', error); 
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

  // Normalizar status para garantizar compatibilidad con constraints de Supabase
  const validStatusList = ['Nuevo', 'Preparando', 'Listo', 'En Camino', 'Entregado', 'Cancelado'];
  const sanitizedStatus = validStatusList.includes(order.status)
    ? order.status
    : 'Nuevo';

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
    payment_status: order.paymentStatus || 'Pendiente',
    status: sanitizedStatus,
    total: order.total,
    paid_amount: order.paidAmount ?? (order.paymentStatus === 'Pagado' ? order.total : 0),
    discount: order.discount,
    discount_label: order.discountLabel,
    source: order.source || 'web'
  };
  if (order.dni) dbOrder.dni = order.dni;
  if (order.delivery_lat !== undefined) dbOrder.delivery_lat = order.delivery_lat;
  if (order.delivery_lng !== undefined) dbOrder.delivery_lng = order.delivery_lng;
  if (order.delivery_address_label !== undefined) dbOrder.delivery_address_label = order.delivery_address_label;
  if (order.delivery_house_number !== undefined) dbOrder.delivery_house_number = order.delivery_house_number;
  if (order.delivery_reference !== undefined) dbOrder.delivery_reference = order.delivery_reference;
  if (order.delivery_notes !== undefined) dbOrder.delivery_notes = order.delivery_notes;
  if (order.delivery_method !== undefined) dbOrder.delivery_method = order.delivery_method;

  let orderError = null;
  if (order.checkoutToken) {
    // Si hay token, usar RPC (invitado seguro)
    const { error } = await supabase.rpc('create_guest_order', {
      p_order: dbOrder,
      p_token: order.checkoutToken
    });
    orderError = error;
  } else {
    // Si no hay token, intentar inserción normal (funcionará solo para empleados por RLS)
    const { error } = await supabase.from('orders').insert(dbOrder);
    
    if (error) {
      console.warn('Inserción con columnas extendidas de delivery falló, reintentando con estándar:', error.message);
      
      const standardDbOrder: any = { ...dbOrder };
      const { error: retryError } = await supabase.from('orders').insert(standardDbOrder);
      if (retryError) {
        orderError = retryError;
      }
    }
  }

  if (orderError) {
    console.error('Error insertando orden:', orderError);
    throw new Error(`Error guardando orden: ${orderError.message}`);
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
        console.error('Error guardando ítems de la orden:', itemsError);
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
    throw new Error('Error al registrar movimiento de caja en base de datos.');
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
    throw new Error('Error guardando cierre de caja en base de datos. Por favor contactá a soporte o revisá la base de datos.');
  }
};

export const updateCashCloseOpeningControlInDb = async (
  closeId: string,
  data: {
    counted: number;
    difference: number;
    notes: string;
    checkedBy: string;
    checkedAt: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('cash_closes')
    .update({
      opening_control_counted: data.counted,
      opening_control_difference: data.difference,
      opening_control_notes: data.notes,
      opening_control_checked_by: data.checkedBy,
      opening_control_checked_at: data.checkedAt,
    })
    .eq('id', closeId)
    .eq('branch_id', BRANCH_ID);

  if (error) {
    console.error('Error updating cash close opening control:', error);
    throw error;
  }
};

// ─── OFFERS ─────────────────────────────────────────────────────────────
// ─── OFFERS ─────────────────────────────────────────────────────────────
const getCachedOffers = async (): Promise<Offer[]> => {
  const fromSettings = await fetchSetting<Offer[]>('admin_offers', []);
  if (fromSettings && fromSettings.length > 0) return fromSettings;
  try {
    const local = localStorage.getItem('la_martina_offers');
    if (local) return JSON.parse(local);
  } catch (err) { console.error('JSON/Storage Error:', err); }
  return [];
};

const saveOffersToSettings = async (offersList: Offer[]): Promise<void> => {
  try {
    localStorage.setItem('la_martina_offers', JSON.stringify(offersList));
  } catch (err) { console.error('JSON/Storage Error:', err); }
  await saveSetting('admin_offers', offersList);
};

export const fetchOffers = async (): Promise<Offer[]> => {
  try {
    const { data, error } = await supabase.from('offers').select('*').eq('branch_id', BRANCH_ID);
    if (!error && data && data.length > 0) {
      const mapped = data.map((dbOffer: any) => {
        let metadata: any = {};
        if (dbOffer.description && typeof dbOffer.description === 'string' && dbOffer.description.trim().startsWith('{')) {
          try { metadata = JSON.parse(dbOffer.description); } catch (err) { console.error('JSON/Storage Error:', err); }
        }
        const targetIds = metadata.targetIds || (dbOffer.target_id && dbOffer.target_id.includes(',') ? dbOffer.target_id.split(',').map((s: string) => s.trim()) : (dbOffer.target_id ? [dbOffer.target_id] : []));
        return {
          id: dbOffer.id,
          name: dbOffer.name || '',
          description: dbOffer.description || '',
          scope: dbOffer.scope,
          targetId: dbOffer.target_id || dbOffer.targetId,
          targetIds: targetIds,
          productId: dbOffer.product_id || dbOffer.productId,
          subcategoryId: metadata.subcategoryId || dbOffer.subcategoryId,
          tagFilter: metadata.tagFilter || dbOffer.tagFilter,
          requiredTier: metadata.requiredTier || dbOffer.requiredTier,
          discountType: dbOffer.discount_type || dbOffer.discountType || 'percent',
          discountPercent: dbOffer.discount_percent ?? dbOffer.discountPercent ?? (dbOffer.discount_value || dbOffer.discountValue || 0),
          discountValue: dbOffer.discount_value ?? dbOffer.discountValue ?? 0,
          maxDiscountAmount: dbOffer.max_discount_amount ?? dbOffer.maxDiscountAmount,
          startDate: dbOffer.start_date || dbOffer.startDate || '',
          endDate: dbOffer.end_date || dbOffer.endDate || '',
          active: dbOffer.active !== false,
          label: dbOffer.label || '',
          daily_quantity_limit: dbOffer.daily_quantity_limit ?? dbOffer.daily_quantity_limit,
          per_customer_daily_limit: dbOffer.per_customer_daily_limit ?? dbOffer.per_customer_daily_limit,
          total_quantity_limit: dbOffer.total_quantity_limit ?? dbOffer.total_quantity_limit,
          limit_strategy: dbOffer.limit_strategy || dbOffer.limit_strategy || 'discount_only'
        };
      });
      saveOffersToSettings(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('Error fetching from offers SQL table, using settings:', err);
  }

  return await getCachedOffers();
};

export const insertOffer = async (offer: Offer): Promise<void> => {
  // 1. Persistir inmediatamente en la tabla settings de Supabase y localStorage
  const currentOffers = await getCachedOffers();
  const nextOffers = [...currentOffers.filter(o => o.id !== offer.id), offer];
  await saveOffersToSettings(nextOffers);

  // 2. Intentar también guardar en la tabla offers de SQL
  try {
    const metadata = {
      targetIds: offer.targetIds && offer.targetIds.length > 0 ? offer.targetIds : (offer.targetId ? [offer.targetId] : []),
      subcategoryId: offer.subcategoryId,
      tagFilter: offer.tagFilter,
      requiredTier: offer.requiredTier
    };
    const payload = {
      id: offer.id,
      name: offer.name,
      description: JSON.stringify(metadata),
      scope: offer.scope,
      target_id: offer.targetId || (offer.targetIds && offer.targetIds.length > 0 ? offer.targetIds.join(',') : null),
      product_id: offer.productId || (offer.scope === 'product' && offer.targetIds && offer.targetIds.length > 0 ? offer.targetIds[0] : offer.targetId) || null,
      discount_type: offer.discountType,
      discount_percent: offer.discountPercent ?? (offer.discountType === 'percent' ? offer.discountValue : 0),
      discount_value: offer.discountValue,
      max_discount_amount: offer.maxDiscountAmount ?? null,
      start_date: offer.startDate,
      end_date: offer.endDate,
      active: offer.active ?? true,
      label: offer.label || null,
      daily_quantity_limit: offer.daily_quantity_limit ?? null,
      per_customer_daily_limit: offer.per_customer_daily_limit ?? null,
      total_quantity_limit: offer.total_quantity_limit ?? null,
      limit_strategy: offer.limit_strategy || 'discount_only',
      branch_id: BRANCH_ID
    };
    const { error } = await supabase.from('offers').insert(payload);
    if (error) console.warn('SQL table insert skipped (persisted to Supabase settings):', error.message);
  } catch (err) {
    console.warn('SQL table insert error (persisted to Supabase settings):', err);
  }
};

export const updateOfferInDb = async (id: string, updates: Partial<Offer>): Promise<void> => {
  // 1. Actualizar en Supabase settings y localStorage
  const currentOffers = await getCachedOffers();
  const nextOffers = currentOffers.map(o => o.id === id ? { ...o, ...updates } : o);
  await saveOffersToSettings(nextOffers);

  // 2. Intentar actualización SQL
  try {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.scope !== undefined) payload.scope = updates.scope;
    if (updates.targetId !== undefined) payload.target_id = updates.targetId;
    if (updates.productId !== undefined) payload.product_id = updates.productId;
    if (updates.discountType !== undefined) payload.discount_type = updates.discountType;
    if (updates.discountValue !== undefined) {
      payload.discount_value = updates.discountValue;
      if (updates.discountType === 'percent') payload.discount_percent = updates.discountValue;
    }
    if (updates.maxDiscountAmount !== undefined) payload.max_discount_amount = updates.maxDiscountAmount;
    if (updates.startDate !== undefined) payload.start_date = updates.startDate;
    if (updates.endDate !== undefined) payload.end_date = updates.endDate;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.label !== undefined) payload.label = updates.label;
    if (updates.daily_quantity_limit !== undefined) payload.daily_quantity_limit = updates.daily_quantity_limit;
    if (updates.per_customer_daily_limit !== undefined) payload.per_customer_daily_limit = updates.per_customer_daily_limit;
    if (updates.total_quantity_limit !== undefined) payload.total_quantity_limit = updates.total_quantity_limit;
    if (updates.limit_strategy !== undefined) payload.limit_strategy = updates.limit_strategy;
    
    if (updates.targetIds !== undefined || updates.subcategoryId !== undefined || updates.tagFilter !== undefined || updates.requiredTier !== undefined) {
      const metadata = {
        targetIds: updates.targetIds,
        subcategoryId: updates.subcategoryId,
        tagFilter: updates.tagFilter,
        requiredTier: updates.requiredTier
      };
      payload.description = JSON.stringify(metadata);
    }

    await supabase.from('offers').update(payload).eq('id', id).eq('branch_id', BRANCH_ID);
  } catch (err) { console.error('JSON/Storage Error:', err); }
};

export const deleteOfferInDb = async (id: string): Promise<void> => {
  // 1. Eliminar de Supabase settings y localStorage
  const currentOffers = await getCachedOffers();
  const nextOffers = currentOffers.filter(o => o.id !== id);
  await saveOffersToSettings(nextOffers);

  // 2. Intentar eliminación SQL
  try {
    await supabase.from('offers').delete().eq('id', id).eq('branch_id', BRANCH_ID);
  } catch (err) { console.error('JSON/Storage Error:', err); }
};

// ─── CUSTOMER PROFILES ──────────────────────────────────────────────────
export const fetchCustomerProfiles = async (): Promise<Record<string, CustomerProfile>> => {
  const { data, error } = await supabase.from('customer_profiles').select('*').eq('branch_id', BRANCH_ID);
  if (error) { console.error('Error fetching customer profiles:', error); return {}; }
  
  const profiles: Record<string, CustomerProfile> = {};
  data?.forEach((prof: any) => {
    const isFiscal = Boolean(
      (prof.cuit && String(prof.cuit).trim().length > 0) ||
      (prof.business_name && String(prof.business_name).trim().length > 0) ||
      (prof.tax_condition && prof.tax_condition !== 'Consumidor Final')
    );

    const rawFirst = (prof.nombre || prof.name || '').trim();
    const rawLast = (prof.apellido || prof.last_name || '').trim();
    let cleanFullName = rawFirst;
    if (rawLast && rawFirst) {
      if (!rawFirst.toLowerCase().includes(rawLast.toLowerCase())) {
        cleanFullName = `${rawFirst} ${rawLast}`;
      }
    } else if (!cleanFullName) {
      cleanFullName = rawLast;
    }

    profiles[prof.phone] = {
      ...prof,
      name: cleanFullName,
      nombre: cleanFullName,
      address: prof.address || prof.direccion || prof.fiscal_address || '',
      direccion: prof.direccion || prof.address || prof.fiscal_address || '',
      last_name: (rawLast && !cleanFullName.toLowerCase().includes(rawLast.toLowerCase())) ? rawLast : '',
      apellido: (rawLast && !cleanFullName.toLowerCase().includes(rawLast.toLowerCase())) ? rawLast : '',
      businessName: prof.business_name || '',
      business_name: prof.business_name || '',
      fiscalAddress: prof.fiscal_address || prof.address || prof.direccion || '',
      fiscal_address: prof.fiscal_address || prof.address || prof.direccion || '',
      taxCondition: prof.tax_condition || 'Consumidor Final',
      tax_condition: prof.tax_condition || 'Consumidor Final',
      documentType: prof.document_type || (prof.cuit ? 'CUIT' : 'DNI'),
      document_type: prof.document_type || (prof.cuit ? 'CUIT' : 'DNI'),
      cuit: prof.cuit || '',
      dni: prof.dni || '',
      birthday: prof.birthday || '',
      email: prof.email || '',
      isFiscal,
      is_fiscal: isFiscal,
    } as CustomerProfile;
  });
  return profiles;
};

export const sanitizeCustomerProfileForDb = (profile: any) => {
  const cleanDni = (profile.dni && profile.dni !== profile.phone) ? profile.dni : (profile.cuit || null);
  const nameVal = (profile.name || profile.nombre || '').trim();
  const rawLast = (profile.last_name || profile.apellido || '').trim();
  const lastNameToSave = (rawLast && !nameVal.toLowerCase().includes(rawLast.toLowerCase())) ? rawLast : null;

  const businessVal = profile.business_name || profile.businessName || '';
  const fiscalAddrVal = profile.fiscal_address || profile.fiscalAddress || profile.direccion || profile.address || '';
  const taxCondVal = profile.tax_condition || profile.taxCondition || 'Consumidor Final';
  const docTypeVal = profile.document_type || profile.documentType || (profile.cuit ? 'CUIT' : 'DNI');

  const payload: Record<string, any> = {
    branch_id: BRANCH_ID,
    phone: profile.phone,
    dni: cleanDni ? String(cleanDni).trim() : null,
    name: nameVal,
    nombre: nameVal,
    last_name: lastNameToSave,
    apellido: lastNameToSave,
    email: profile.email ? String(profile.email).trim() : null,
    address: profile.address || profile.direccion || fiscalAddrVal || null,
    direccion: profile.direccion || profile.address || fiscalAddrVal || null,
    birthday: profile.birthday ? String(profile.birthday).trim() : null,
    cuit: profile.cuit ? String(profile.cuit).trim() : null,
    business_name: businessVal ? String(businessVal).trim() : null,
    fiscal_address: fiscalAddrVal ? String(fiscalAddrVal).trim() : null,
    tax_condition: taxCondVal,
    document_type: docTypeVal,
    hasCurrentAccount: Boolean(profile.hasCurrentAccount),
    creditLimit: profile.creditLimit !== undefined && profile.creditLimit !== null ? Number(profile.creditLimit) : 50000,
    isManual: profile.isManual !== undefined ? Boolean(profile.isManual) : true,
    useCustomAccountLimits: Boolean(profile.useCustomAccountLimits),
    customDebtLimit: profile.customDebtLimit !== undefined && profile.customDebtLimit !== null ? Number(profile.customDebtLimit) : null,
    customDebtDays: profile.customDebtDays !== undefined && profile.customDebtDays !== null ? Number(profile.customDebtDays) : null,
    accountLimitNotes: profile.accountLimitNotes || null,
    updated_at: new Date().toISOString()
  };

  if (profile.id) payload.id = profile.id;
  if (profile.user_id) payload.user_id = profile.user_id;

  return payload;
};

const normalizePhone = (p: string): string => {
  let cleaned = (p || '').replace(/\D/g, '');
  if (cleaned.startsWith('54')) cleaned = cleaned.substring(2);
  return '+54' + cleaned;
};

export const upsertCustomerProfile = async (profile: CustomerProfile, oldPhone?: string): Promise<{ success: boolean; error?: any }> => {
  try {
    const payload = sanitizeCustomerProfileForDb(profile);
    const newPhone = normalizePhone(profile.phone);
    const prevPhone = oldPhone ? normalizePhone(oldPhone) : newPhone;
    payload.phone = newPhone;

    // Build unique list of phones to try matching (avoids .or() which breaks URL encoding of '+')
    const phonesToTry = Array.from(
      new Set([prevPhone, newPhone, profile.phone, oldPhone].filter(Boolean) as string[])
    );

    // 1. Try direct UPDATE with .eq() per phone variant (reliable URL-encoding of '+')
    for (const ph of phonesToTry) {
      const { data: updatedData, error: updateError } = await supabase
        .from('customer_profiles')
        .update(payload)
        .eq('phone', ph)
        .eq('branch_id', BRANCH_ID)
        .select('phone');

      if (updateError) {
        console.warn(`upsertCustomerProfile: update error for phone ${ph}:`, updateError);
        continue;
      }
      if (updatedData && updatedData.length > 0) {
        return { success: true };
      }
    }

    // 2. Fallback to upsert if profile did not exist previously
    const { error: upsertError } = await supabase.from('customer_profiles').upsert(
      payload,
      { onConflict: 'phone, branch_id' }
    );
    if (upsertError) {
      console.error('Error upserting customer profile in DB:', upsertError);
      return { success: false, error: upsertError };
    }
    return { success: true };
  } catch (err) {
    console.error('Exception in upsertCustomerProfile:', err);
    return { success: false, error: err };
  }
};

// ─── SETTINGS (Key-Value Store) ─────────────────────────────────────────
export const fetchSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .eq('branch_id', BRANCH_ID)
      .maybeSingle();
      
    if (!error && data?.value !== undefined && data.value !== null) {
      settingsRepository.setSetting(key, data.value).catch(() => {});
      return data.value as T;
    }

    if (error && error.code !== 'PGRST116') {
      console.error(`Error fetching setting ${key}:`, error);
    }
  } catch (err) {
    console.error(`Exception fetching setting ${key}:`, err);
  }

  // Fallback to offline local repository
  try {
    const cached = await settingsRepository.getSetting<T>(key, defaultValue);
    return cached;
  } catch {
    return defaultValue;
  }
};

export const saveSetting = async <T>(key: string, value: T): Promise<void> => {
  // 1. Guardar de inmediato en almacenamiento local / caché
  try {
    await settingsRepository.setSetting(key, value);
  } catch (err) {
    console.warn(`Error guardando ${key} en caché local:`, err);
  }

  // 2. Persistir en la base de datos Supabase
  const { error } = await supabase.from('settings').upsert(
    { key, branch_id: BRANCH_ID, value },
    { onConflict: 'key, branch_id' }
  );
  if (error) {
    console.error(`Error saving setting ${key} to Supabase:`, error);
    throw error;
  }
};

// ─── CATEGORIES ─────────────────────────────────────────────────────────
export const fetchCategories = async (forceRefresh = false): Promise<Category[]> => {
  const cacheKey = 'categories_tree';
  if (!forceRefresh) {
    const cached = catalogCache.get<Category[]>(cacheKey);
    if (cached && cached.length > 0) return cached;
  }

  // Selección estricta de columnas (sin SELECT *)
  const { data, error } = await supabase
    .from('categories')
    .select('id, title, description')
    .order('title', { ascending: true });

  if (error) { 
    console.error('Error fetching categories:', error); 
    return []; 
  }
  
  const result = data || [];
  catalogCache.set(cacheKey, result, TTL.CATEGORIES);
  return result;
};

export const insertCategory = async (category: Category): Promise<void> => {
  catalogCache.invalidateCategories();
  const { error } = await supabase.from('categories').insert(category);
  if (error) console.error('Error inserting category:', error);
};

export const updateCategoryInDb = async (id: string, updates: Partial<Category>): Promise<void> => {
  catalogCache.invalidateCategories();
  const { error } = await supabase.from('categories').update(updates).eq('id', id);
  if (error) console.error('Error updating category:', error);
};

export const deleteCategoryFromDb = async (id: string): Promise<void> => {
  catalogCache.invalidateCategories();
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) console.error('Error deleting category:', error);
};

// ─── SUBCATEGORIES ───────────────────────────────────────────────────────
export const fetchSubcategories = async (forceRefresh = false): Promise<Subcategory[]> => {
  const cacheKey = 'subcategories_all';
  if (!forceRefresh) {
    const cached = catalogCache.get<Subcategory[]>(cacheKey);
    if (cached && cached.length > 0) return cached;
  }

  // Selección estricta de columnas (sin SELECT *)
  const { data, error } = await supabase
    .from('subcategories')
    .select('id, category_id, title, description, sort_order')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) { 
    console.error('Error fetching subcategories:', error); 
    return []; 
  }

  const result = (data || []).map((s: any) => ({
    id: s.id,
    categoryId: s.category_id,
    title: s.title,
    description: s.description || '',
    sortOrder: s.sort_order ?? 0,
    createdAt: s.created_at
  }));

  catalogCache.set(cacheKey, result, TTL.CATEGORIES);
  return result;
};

export const insertSubcategory = async (subcategory: Subcategory): Promise<boolean> => {
  catalogCache.invalidateCategories();
  const payload = {
    id: subcategory.id,
    category_id: subcategory.categoryId,
    title: subcategory.title,
    description: subcategory.description || '',
    sort_order: subcategory.sortOrder ?? 0
  };

  const { error } = await supabase.from('subcategories').upsert(payload, { onConflict: 'id' });
  if (!error) return true;

  console.warn('⚠️ Supabase client insert subcategory error:', error);
  try {
    await api.post('/subcategories', payload, {
      headers: { 'Prefer': 'resolution=merge-duplicates' }
    });
    return true;
  } catch (axiosErr: any) {
    console.error('❌ Error inserting subcategory in Supabase:', axiosErr.response?.data || axiosErr.message || error);
    return false;
  }
};

export const updateSubcategoryInDb = async (id: string, updates: Partial<Subcategory>): Promise<void> => {
  catalogCache.invalidateCategories();
  const payload: any = {};
  if (updates.categoryId !== undefined) payload.category_id = updates.categoryId;
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;

  const { error } = await supabase.from('subcategories').update(payload).eq('id', id);
  if (error) console.error('Error updating subcategory:', error);
};

export const deleteSubcategoryFromDb = async (id: string): Promise<void> => {
  catalogCache.invalidateCategories();
  const { error } = await supabase.from('subcategories').delete().eq('id', id);
  if (error) console.error('Error deleting subcategory:', error);
};

