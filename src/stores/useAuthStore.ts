import React from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { Employee, PermissionKey } from '../types/permissions.types'
import { employeesService } from '../services/employees.service'
import { customersService, CustomerProfile } from '../services/customers.service'

export interface Order {
  id: string;
  date: string;
  total: number;
  itemsCount: number;
  status: 'Nuevo' | 'Preparando' | 'En Camino' | 'Entregado' | 'Cancelado' | 'Procesando';
  address?: string;
  deliveryTime?: string;
  items: any[];
  phone?: string;
  discount?: number;
  discountLabel?: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address_label?: string | null;
  delivery_house_number?: string | null;
  delivery_reference?: string | null;
  delivery_notes?: string | null;
  delivery_method?: 'retiro' | 'envio';
}

export interface GuestProfile {
  name: string;
  phone: string;
  address: string;
  address_lat?: number | null;
  address_lng?: number | null;
  orders: Order[];
}

interface AuthState {
  // Supabase Auth
  user: SupabaseUser | null
  session: Session | null
  loading: boolean
  initialized: boolean

  initializeAuth: () => void
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>
  signOut: () => Promise<void>

  // Guest Profile (Storefront user)
  guestProfile: GuestProfile
  updateUser: (data: Partial<GuestProfile>) => void
  addOrder: (order: Order) => void
  updateOrderStatus: (orderId: string, status: Order['status']) => void

  // Admin / Employee RBAC
  employeeProfile: Employee | null
  permissions: PermissionKey[]
  hasPermission: (permission: PermissionKey) => boolean
  hasAnyPermission: (permissions: PermissionKey[]) => boolean
  hasAllPermissions: (permissions: PermissionKey[]) => boolean

  // Customer Auth (Fase 2)
  customerProfile: CustomerProfile | null
  signUpCustomer: (phone: string, password: string, name: string, lastName?: string, email?: string) => Promise<{ data: any; error: any }>
  signInCustomer: (phone: string, password: string) => Promise<{ data: any; error: any }>
  signOutCustomer: () => Promise<void>
  updateCustomerProfileInDb: (updates: Partial<CustomerProfile>) => Promise<boolean>
}

// Clean and format phone for Argentine standards and synthetic emails
export const formatArgentinePhone = (phone: string): { cleanPhone: string; displayPhone: string } => {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('54')) {
    digits = digits.substring(2);
  }
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  return {
    cleanPhone: '54' + digits,
    displayPhone: '+54' + digits
  };
};

// Initialize guest profile from localStorage
const loadGuestProfile = (): GuestProfile => {
  try {
    const saved = localStorage.getItem('la-martina-user');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Error cargando perfil de invitado", e);
  }
  return { name: 'Invitado', phone: '', address: '', orders: [] };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  employeeProfile: null,
  customerProfile: null,
  permissions: [],

  hasPermission: (permission) => {
    return get().permissions.includes(permission);
  },
  hasAnyPermission: (permissions) => {
    const userPerms = get().permissions;
    return permissions.some(p => userPerms.includes(p));
  },
  hasAllPermissions: (permissions) => {
    const userPerms = get().permissions;
    return permissions.every(p => userPerms.includes(p));
  },

  guestProfile: loadGuestProfile(),

  initializeAuth: () => {
    console.log("🔄 Inicializando Auth de Supabase...");
    
    const timeoutId = setTimeout(() => {
      if (!get().initialized) {
        console.warn("⚠️ Forzando inicialización de Auth por timeout...");
        set({ loading: false, initialized: true });
      }
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.error("❌ Error al obtener sesión inicial:", error.message);
      }
      
      let employeeProfile = null;
      let customerProfile = null;
      let permissions: PermissionKey[] = [];
      
      if (session?.user) {
        employeeProfile = await employeesService.getCurrentEmployeeProfile(session.user.id);
        if (employeeProfile) {
          permissions = employeesService.getEffectivePermissions(employeeProfile.role, employeeProfile.permissions_override);
        } else {
          // If not employee, it's a storefront customer
          customerProfile = await customersService.getProfileByUserId(session.user.id);
        }
      }

      clearTimeout(timeoutId);
      set({ 
        session, 
        user: session?.user ?? null,
        employeeProfile,
        customerProfile,
        permissions,
        loading: false,
        initialized: true
      });
    }).catch(err => {
      console.error("❌ Error inesperado en getSession:", err);
      clearTimeout(timeoutId);
      set({ loading: false, initialized: true });
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log(`🔔 Evento de Auth Supabase: ${_event}`);
      
      let employeeProfile = get().employeeProfile;
      let customerProfile = get().customerProfile;
      let permissions = get().permissions;

      if (session?.user) {
        // Resolve role
        if (!employeeProfile || employeeProfile.user_id !== session.user.id) {
          employeeProfile = await employeesService.getCurrentEmployeeProfile(session.user.id);
          if (employeeProfile) {
            permissions = employeesService.getEffectivePermissions(employeeProfile.role, employeeProfile.permissions_override);
            customerProfile = null;
          } else {
            permissions = [];
            customerProfile = await customersService.getProfileByUserId(session.user.id);
          }
        }
      } else {
        employeeProfile = null;
        customerProfile = null;
        permissions = [];
      }

      set({ 
        session, 
        user: session?.user ?? null,
        employeeProfile,
        customerProfile,
        permissions,
        loading: false
      });
    });
  },

  signIn: async (email, password) => {
    console.log(`⏳ Intentando iniciar sesión con: ${email}`);
    set({ loading: true });
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("❌ Error en signIn:", error);
      set({ loading: false });
    } else {
      set({ user: data.user, session: data.session, customerProfile: null });

      let employeeProfile = await employeesService.getCurrentEmployeeProfile(data.user.id);
      let permissions: PermissionKey[] = [];
      if (employeeProfile) {
        permissions = employeesService.getEffectivePermissions(employeeProfile.role, employeeProfile.permissions_override);
      }
      set({ employeeProfile, permissions, loading: false });
    }

    return { data, error };
  },

  signOut: async () => {
    console.log("⏳ Cerrando sesión...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("❌ Error al cerrar sesión:", error.message);
    } else {
      set({ user: null, session: null, employeeProfile: null, customerProfile: null, permissions: [] });
    }
  },

  // Customer authentication implementation (Fase 2)
  signUpCustomer: async (phone, password, name, lastName = '', email = '') => {
    console.log(`⏳ Registrando cliente con celular: ${phone}`);
    set({ loading: true });

    const { cleanPhone, displayPhone } = formatArgentinePhone(phone);
    const syntheticEmail = `${cleanPhone}@lamartina.com`;

    console.log(`📧 Email sintético para registro: "${syntheticEmail}"`);

    const { data, error } = await supabase.auth.signUp({
      email: syntheticEmail,
      password,
      options: {
        data: {
          phone: displayPhone,
          name,
          last_name: lastName
        }
      }
    });

    if (error) {
      console.error("❌ Error al registrar en Supabase Auth:", error.message, error.status);
      set({ loading: false });
      return { data, error };
    }

    // Caso: el usuario ya existía (Supabase devuelve user pero sin session cuando el email está sin confirmar)
    if (data.user && !data.session) {
      console.warn("⚠️ Usuario creado pero sin sesión activa. Posiblemente la confirmación de email está habilitada en Supabase, o el usuario ya existía.");
      // Intentamos hacer login directo para obtener la sesión
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password
      });
      if (loginError) {
        console.error("❌ Error al iniciar sesión automáticamente tras registro:", loginError.message);
        set({ loading: false });
        // No retornamos error, el usuario se creó OK. Lo invitamos a iniciar sesión
        return { data, error: null };
      }
      if (loginData.user && loginData.session) {
        console.log("✅ Login automático exitoso después del registro");
        data.user = loginData.user;
        data.session = loginData.session;
      }
    }

    if (data.user && data.session) {
      // Sesión activa: guardar en store y crear perfil
      set({
        user: data.user,
        session: data.session,
        employeeProfile: null,
        permissions: []
      });

      try {
        // Usar supabase directamente (no axios) para garantizar que el token JWT está disponible
        const { data: profileData, error: profileError } = await supabase
          .from('customer_profiles')
          .insert({
            user_id: data.user.id,
            phone: displayPhone,
            name,
            last_name: lastName || null,
            email: email || null,
            active: true
          })
          .select()
          .single();

        if (profileError) {
          console.error("❌ Error creando perfil en customer_profiles:", profileError.message, profileError.details, profileError.hint);
        } else {
          console.log("✅ Perfil de cliente creado exitosamente:", profileData);
          set({ customerProfile: profileData });
        }
      } catch (err) {
        console.error("❌ Excepción al crear perfil customer_profiles:", err);
      }
      set({ loading: false });
    } else {
      console.warn("⚠️ Registro completado pero sin sesión. El usuario deberá iniciar sesión manualmente.");
      set({ loading: false });
    }

    return { data, error };
  },

  signInCustomer: async (phone, password) => {
    set({ loading: true });

    const { cleanPhone } = formatArgentinePhone(phone);
    const syntheticEmail = `${cleanPhone}@lamartina.com`;

    console.log(`🔑 Intentando login -> Email: "${syntheticEmail}"`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password
    });

    if (error) {
      console.error("❌ Error de Supabase Auth en signInCustomer:", error.message, "| Código:", error.status);
      set({ loading: false });
      return { data, error };
    }

    if (data.user && data.session) {
      // Buscar perfil usando supabase directamente (no axios) para evitar problemas de token
      const { data: profileData } = await supabase
        .from('customer_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle();

      console.log("✅ Login exitoso. Perfil encontrado:", profileData);

      set({
        user: data.user,
        session: data.session,
        customerProfile: profileData ?? null,
        employeeProfile: null,
        permissions: [],
        loading: false
      });
    } else {
      set({ loading: false });
    }

    return { data, error };
  },

  signOutCustomer: async () => {
    console.log("⏳ Cerrando sesión de cliente...");
    set({ loading: true });
    await supabase.auth.signOut();
    set({ 
      user: null, 
      session: null, 
      customerProfile: null, 
      employeeProfile: null, 
      permissions: [],
      loading: false 
    });
  },

  updateCustomerProfileInDb: async (updates) => {
    const profile = get().customerProfile;
    const session = get().session;
    if (!session?.user) return false;

    try {
      if (profile) {
        console.log('📝 Actualizando perfil en DB:', updates);
        const { data, error } = await supabase
          .from('customer_profiles')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', profile.id)
          .select()
          .single();

        if (error) {
          console.error('❌ Error al actualizar perfil:', error.message, error.details);
          return false;
        }
        console.log('✅ Perfil actualizado correctamente:', data);
        set({ customerProfile: data });
      } else {
        // Si no existe el perfil, lo creamos al vuelo
        const { data, error } = await supabase
          .from('customer_profiles')
          .insert({
            user_id: session.user.id,
            phone: updates.phone || session.user.user_metadata?.phone || '+54',
            name: updates.name || session.user.user_metadata?.name || 'Cliente',
            last_name: updates.last_name || null,
            email: updates.email || session.user.email || null,
            active: true
          })
          .select()
          .single();

        if (error) {
          console.error('❌ Error al crear perfil al vuelo:', error.message);
          return false;
        }
        set({ customerProfile: data });
      }
      return true;
    } catch (e) {
      console.error('❌ Excepción en updateCustomerProfileInDb:', e);
      return false;
    }
  },

  updateUser: (data) => {
    set((state) => {
      const updated = { ...state.guestProfile, ...data };
      localStorage.setItem('la-martina-user', JSON.stringify(updated));
      return { guestProfile: updated };
    });
  },

  addOrder: (order) => {
    set((state) => {
      const updated = { ...state.guestProfile, orders: [order, ...state.guestProfile.orders] };
      localStorage.setItem('la-martina-user', JSON.stringify(updated));
      return { guestProfile: updated };
    });
  },

  updateOrderStatus: (orderId, status) => {
    set((state) => {
      const updated = { 
        ...state.guestProfile, 
        orders: state.guestProfile.orders.map(o => o.id === orderId ? { ...o, status } : o) 
      };
      localStorage.setItem('la-martina-user', JSON.stringify(updated));
      return { guestProfile: updated };
    });
  }
}));

// Export a proxy hook to maintain compatibility with storefront components
export const useAuth = () => {
  const store = useAuthStore();
  const isCustomer = !!store.session && !store.employeeProfile;
  const isEmployee = !!store.session && !!store.employeeProfile;

  // Retrieve matching storefront orders from the derived database (localStorage + filter by phone)
  // This guarantees perfect history matching without complex synchronization logic!
  const customerOrders = React.useMemo(() => {
    const activePhone = isCustomer && store.customerProfile ? store.customerProfile.phone : store.guestProfile.phone;
    if (!activePhone) return isCustomer ? [] : store.guestProfile.orders;
    
    // Fetch all admin orders from localStorage to get the full global history, and filter by phone!
    try {
      const globalOrdersStr = localStorage.getItem('la-martina-admin-orders');
      if (globalOrdersStr) {
        const globalOrders: Order[] = JSON.parse(globalOrdersStr);
        const clean = (p: string) => p.replace(/\D/g, '');
        const targetClean = clean(activePhone);
        
        return globalOrders
          .filter(o => clean(o.phone || '') === targetClean)
          .map(o => ({
            id: o.id,
            date: o.date,
            total: o.total,
            itemsCount: o.itemsCount || (o.items ? o.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 0),
            status: o.status,
            address: o.address,
            deliveryTime: o.deliveryTime,
            items: o.items || [],
            discount: o.discount,
            discountLabel: o.discountLabel,
          }));
      }
    } catch (err) {
      console.error("Error extracting customer orders from local store", err);
    }
    
    return store.guestProfile.orders;
  }, [store.customerProfile, store.guestProfile, isCustomer]);

  // Memoizar el objeto "user" para evitar referencias nuevas en cada render que causen bucles infinitos en useEffect
  const derivedUser = React.useMemo(() => {
    return isCustomer && store.customerProfile ? {
      name: `${store.customerProfile.name} ${store.customerProfile.last_name || ''}`.trim(),
      phone: store.customerProfile.phone,
      address: store.customerProfile.address || '',
      address_lat: store.customerProfile.address_lat ?? null,
      address_lng: store.customerProfile.address_lng ?? null,
      orders: customerOrders
    } : {
      ...store.guestProfile,
      orders: customerOrders
    };
  }, [store.customerProfile, store.guestProfile, isCustomer, customerOrders]);

  return {
    user: derivedUser,
    
    updateUser: (updates: Partial<GuestProfile>) => {
      if (isCustomer && store.customerProfile) {
        // Map GuestProfile updates to CustomerProfile
        const dbUpdates: Partial<CustomerProfile> = {};
        if (updates.name) {
          const parts = updates.name.split(' ');
          dbUpdates.name = parts[0];
          dbUpdates.last_name = parts.slice(1).join(' ') || null;
        }
        if (updates.address !== undefined) dbUpdates.address = updates.address;
        if (updates.phone) dbUpdates.phone = updates.phone;
        // Forward coordinates if provided
        if (updates.address_lat !== undefined) dbUpdates.address_lat = updates.address_lat;
        if (updates.address_lng !== undefined) dbUpdates.address_lng = updates.address_lng;
        
        store.updateCustomerProfileInDb(dbUpdates);
      } else {
        store.updateUser(updates);
      }
    },
    
    addOrder: store.addOrder,
    updateOrderStatus: store.updateOrderStatus,
    isAuthenticated: isCustomer,
    isCustomer,
    isEmployee,
    employeeProfile: store.employeeProfile,
    customerProfile: store.customerProfile,
    signUpCustomer: store.signUpCustomer,
    signInCustomer: store.signInCustomer,
    signOutCustomer: store.signOutCustomer,
    loading: store.loading
  };
};