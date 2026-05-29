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
  const { data, error } = await supabase.from('orders').select('*').eq('branch_id', BRANCH_ID).order('timestamp', { ascending: false });
  if (error) { console.error('Error fetching orders:', error); return []; }
  return data || [];
};

export const insertOrder = async (order: AdminOrder): Promise<void> => {
  const dbOrder = {
    id: order.id,
    branch_id: BRANCH_ID,
    date: order.date,
    timestamp: order.timestamp || Date.now(),
    customer: order.customer,
    phone: order.phone,
    address: order.address,
    deliveryTime: order.deliveryTime,
    method: order.method,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    total: order.total,
    items: order.items,
    discount: order.discount,
    discountLabel: order.discountLabel,
    delivery_lat: order.delivery_lat,
    delivery_lng: order.delivery_lng,
    delivery_address_label: order.delivery_address_label,
    delivery_house_number: order.delivery_house_number,
    delivery_reference: order.delivery_reference,
    delivery_notes: order.delivery_notes,
    delivery_method: order.delivery_method
  };
  const { error } = await supabase.from('orders').insert(dbOrder);
  if (error) console.error('Error inserting order:', error);
};

export const updateOrderInDb = async (id: string, updates: Partial<AdminOrder>): Promise<void> => {
  // Strip non-schema properties if they exist in updates
  const dbUpdates = { ...updates };
  delete dbUpdates.dni;
  delete dbUpdates.paidAmount;
  delete dbUpdates.source;
  delete dbUpdates.discountOfferId;
  delete dbUpdates.was_limit_override;
  delete dbUpdates.override_reason;
  
  const { error } = await supabase.from('orders').update(dbUpdates).eq('id', id).eq('branch_id', BRANCH_ID);
  if (error) console.error('Error updating order:', error);
};

// ─── CASH MOVEMENTS ─────────────────────────────────────────────────────
export const fetchCashMovements = async (): Promise<CashMovement[]> => {
  const { data, error } = await supabase.from('cash_movements').select('*').eq('branch_id', BRANCH_ID).order('timestamp', { ascending: false });
  if (error) { console.error('Error fetching cash movements:', error); return []; }
  return data || [];
};

export const insertCashMovement = async (movement: CashMovement): Promise<void> => {
  const { error } = await supabase.from('cash_movements').insert({ ...movement, branch_id: BRANCH_ID });
  if (error) console.error('Error inserting cash movement:', error);
};

// ─── CASH CLOSES ────────────────────────────────────────────────────────
export const fetchCashCloses = async (): Promise<CashClose[]> => {
  const { data, error } = await supabase.from('cash_closes').select('*').eq('branch_id', BRANCH_ID).order('timestamp', { ascending: false });
  if (error) { console.error('Error fetching cash closes:', error); return []; }
  return data || [];
};

export const insertCashClose = async (close: CashClose): Promise<void> => {
  const { error } = await supabase.from('cash_closes').insert({ ...close, branch_id: BRANCH_ID });
  if (error) console.error('Error inserting cash close:', error);
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
  const dbProfile = { ...profile, branch_id: BRANCH_ID, dni: profile.dni || profile.phone }; // Ensure DNI is present as it's the PK
  const { error } = await supabase.from('customer_profiles').upsert(
    dbProfile,
    { onConflict: 'dni' }
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
