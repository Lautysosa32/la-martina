import api from '../lib/axios';

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
  async getProfileByUserId(userId: string): Promise<CustomerProfile | null> {
    try {
      const response = await api.get<CustomerProfile[]>(`/customer_profiles?user_id=eq.${userId}&select=*`);
      if (response.data.length === 0) return null;
      return response.data[0];
    } catch (error) {
      console.error('Error fetching customer profile:', error);
      return null;
    }
  },

  async getProfileByPhone(phone: string): Promise<CustomerProfile | null> {
    try {
      // Clean phone for lookup
      const response = await api.get<CustomerProfile[]>(`/customer_profiles?phone=eq.${encodeURIComponent(phone)}&select=*`);
      if (response.data.length === 0) return null;
      return response.data[0];
    } catch (error) {
      console.error('Error fetching customer profile by phone:', error);
      return null;
    }
  },

  async createProfile(profile: CreateCustomerProfileInput): Promise<CustomerProfile> {
    const response = await api.post<CustomerProfile[]>('/customer_profiles', profile, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data[0];
  },

  async updateProfile(id: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile> {
    const response = await api.patch<CustomerProfile[]>(`/customer_profiles?id=eq.${id}`, updates, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data[0];
  }
};
