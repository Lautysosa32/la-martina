import { supabase } from '../lib/supabase';
import { 
  AdminOrder, CashMovement, CashClose, Offer, 
  CustomerProfile, TicketConfig, CurrentAccountConfig, 
  StoreStatus, CashRegister, Invoice, BillingCustomer 
} from '../context/AdminContext';

const BRANCH_ID = 'main';

// ─── ORDERS ─────────────────────────────────────────────────────────────
export const fetchOrders = async (): Promise<AdminOrder[]> => {
  const { data, error } = await supabase.from('orders').select('*').eq('branch_id', BRANCH_ID).order('timestamp', { ascending: false });
  if (error) { console.error('Error fetching orders:', error); return []; }
  return data || [];
};

export const insertOrder = async (order: AdminOrder): Promise<void> => {
  const { error } = await supabase.from('orders').insert({ ...order, branch_id: BRANCH_ID });
  if (error) console.error('Error inserting order:', error);
};

export const updateOrderInDb = async (id: string, updates: Partial<AdminOrder>): Promise<void> => {
  const { error } = await supabase.from('orders').update(updates).eq('id', id).eq('branch_id', BRANCH_ID);
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
  const { data, error } = await supabase.from('cash_closes').select('*').eq('branch_id', BRANCH_ID).order('created_at', { ascending: false });
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
    profiles[prof.dni || prof.phone] = prof as CustomerProfile;
  });
  return profiles;
};

export const upsertCustomerProfile = async (profile: CustomerProfile): Promise<void> => {
  // Uses DNI as primary key, or phone if DNI is not reliable. Supabase uses 'dni' as PK.
  const { error } = await supabase.from('customer_profiles').upsert(
    { ...profile, branch_id: BRANCH_ID },
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
