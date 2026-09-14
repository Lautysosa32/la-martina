import api from '../lib/axios';
import { supabase } from '../lib/supabase';

export interface CustomerProfile {
  id: string;
  user_id: string;
  phone: string;
  name: string;
  last_name: string | null;
  email: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  branch_id: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCustomerProfileInput {
  user_id: string;
  phone: string;
  name: string;
  last_name?: string;
  email?: string;
  address?: string;
  address_lat?: number | null;
  address_lng?: number | null;
  branch_id?: string;
}

export const customersService = {
  async getProfileByUserId(userId: string, fallbackPhone?: string): Promise<CustomerProfile | null> {
    try {
      // 1. Try direct Supabase query by user_id
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) return data as CustomerProfile;

      // 2. If not found and a fallback phone or synthetic email exists, try searching by phone
      if (fallbackPhone) {
        const cleanDigits = fallbackPhone.replace(/\D/g, '');
        if (cleanDigits.length >= 8) {
          const { data: byPhone } = await supabase
            .from('customer_profiles')
            .select('*')
            .ilike('phone', `%${cleanDigits.slice(-8)}%`)
            .maybeSingle();
          if (byPhone) {
            // Update user_id to link it properly
            supabase.from('customer_profiles').update({ user_id: userId }).eq('id', byPhone.id).then();
            return byPhone as CustomerProfile;
          }
        }
      }

      // 3. Fallback via Axios REST endpoint
      const response = await api.get<CustomerProfile[]>(`/customer_profiles?user_id=eq.${userId}&select=*`);
      if (response.data && response.data.length > 0) return response.data[0];

      return null;
    } catch (error) {
      console.error('Error fetching customer profile:', error);
      return null;
    }
  },

  async getProfileByPhone(phone: string): Promise<CustomerProfile | null> {
    try {
      const cleanDigits = phone.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .ilike('phone', `%${cleanDigits.slice(-8)}%`)
        .maybeSingle();

      if (!error && data) return data as CustomerProfile;

      const response = await api.get<CustomerProfile[]>(`/customer_profiles?phone=eq.${encodeURIComponent(phone)}&select=*`);
      if (response.data && response.data.length > 0) return response.data[0];
      return null;
    } catch (error) {
      console.error('Error fetching customer profile by phone:', error);
      return null;
    }
  },

  async createProfile(profile: CreateCustomerProfileInput): Promise<CustomerProfile> {
    try {
      const { data, error } = await supabase
        .from('customer_profiles')
        .insert({
          ...profile,
          branch_id: profile.branch_id || 'main',
          active: true
        })
        .select()
        .single();

      if (!error && data) return data as CustomerProfile;
    } catch (_) {}

    const response = await api.post<CustomerProfile[]>('/customer_profiles', profile, {
      headers: { 'Prefer': 'return=representation' }
    });
    return response.data[0];
  },

  async updateProfile(id: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile> {
    try {
      const { data, error } = await supabase
        .from('customer_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) return data as CustomerProfile;
    } catch (_) {}

    const response = await api.patch<CustomerProfile[]>(`/customer_profiles?id=eq.${id}`, updates, {
      headers: { 'Prefer': 'return=representation' }
    });
    return response.data[0];
  }
};
