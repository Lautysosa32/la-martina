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
  timestamp?: number;
  total: number;
  itemsCount: number;
  status: 'Nuevo' | 'Preparando' | 'Listo' | 'En Camino' | 'Entregado' | 'Cancelado' | 'Procesando';
  address?: string;
  deliveryTime?: string;
  items: any[];
  phone?: string;
  dni?: string;
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
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.name === 'Invitado') {
        parsed.name = '';
      }
      return parsed;
    }
  } catch (e) {
    console.error("Error cargando perfil de invitado", e);
  }
  return { name: '', phone: '', address: '', orders: [] };
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
      
      // Set session first so axios interceptors have access to the token for API calls
      if (session) {
        set({ session, user: session.user });
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

      if (session) {
        set({ session, user: session.user });
      }

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

    let { data, error } = await supabase.auth.signUp({
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

    if (error && error.message.toLowerCase().includes('already registered')) {
      console.warn("⚠️ Usuario ya registrado en Auth.");
      set({ loading: false });
      return { 
        data: null, 
        error: new Error('Este número de celular ya tiene una cuenta registrada. Por favor, selecciona "Iniciar Sesión".') 
      };
    } else if (error) {
      console.error("❌ Error al registrar en Supabase Auth:", error.message, error.status);
      set({ loading: false });
      return { data, error };
    }

    // Caso: el usuario ya existía o confirmación pendiente
    if (data.user && !data.session) {
      console.warn("⚠️ Usuario creado pero sin sesión activa. Posiblemente la confirmación de email está habilitada en Supabase.");
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
          .maybeSingle();

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
    const isCustomer = !!get().session && !get().employeeProfile;
    if (isCustomer) {
      get().updateCustomerProfileInDb({
        address: data.address,
        address_lat: data.address_lat,
        address_lng: data.address_lng,
        name: data.name,
        phone: data.phone
      }).catch(console.error);
    }

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

  const [dbOrders, setDbOrders] = React.useState<Order[]>([]);

  React.useEffect(() => {
    const activePhone = isCustomer && store.customerProfile ? store.customerProfile.phone : store.guestProfile.phone;
    if (!activePhone) {
      setDbOrders([]);
      return;
    }

    let isMounted = true;

    const fetchCustomerOrdersFromSupabase = async () => {
      try {
        const clean = (p: string) => p.replace(/\D/g, '');
        const targetClean = clean(activePhone);

        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('branch_id', 'main')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!isMounted) return;

        if (data) {
          const filtered = data
            .filter(o => {
              const oClean = clean(o.phone || '');
              if (!oClean || !targetClean) return false;
              return oClean === targetClean ||
                (targetClean.length >= 8 && oClean.endsWith(targetClean.slice(-8))) ||
                (oClean.length >= 8 && targetClean.endsWith(oClean.slice(-8)));
            })
            .map(o => ({
              id: o.id,
              date: o.date,
              timestamp: o.timestamp || (o.created_at ? new Date(o.created_at).getTime() : undefined),
              total: o.total,
              itemsCount: o.itemsCount || (o.order_items ? o.order_items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : (o.items ? o.items.length : 0)),
              status: o.status,
              address: (o.address || '')
                .replace(/\s*\[GEO:[-\d.]+,[-\d.]+\]/g, '')
                .replace(/\[ALTURA:([^\]]+)\]/g, 'Nº $1')
                .replace(/\[REF:([^\]]+)\]/g, '($1)')
                .replace(/\[NOTAS:([^\]]+)\]/g, '')
                .replace(/\s+/g, ' ')
                .trim(),
              deliveryTime: o.delivery_time || o.deliveryTime,
              items: (o.order_items && o.order_items.length > 0)
                ? o.order_items.map((item: any) => ({
                    id: item.product_id || item.id,
                    name: item.name,
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 1),
                    image: item.image
                  }))
                : (o.items || []),
              discount: o.discount,
              discountLabel: o.discount_label || o.discountLabel,
            }));
          setDbOrders(filtered);
        }
      } catch (err) {
        console.error("Error fetching customer orders from Supabase:", err);
      }
    };

    fetchCustomerOrdersFromSupabase();

    const channel = supabase.channel(`customer_orders_${activePhone}_${Math.random().toString(36).substring(2, 9)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchCustomerOrdersFromSupabase();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [store.customerProfile, store.guestProfile.phone, isCustomer]);

  // Combine and deduplicate orders from localStorage (guestProfile.orders) and Supabase (dbOrders)
  const customerOrders = React.useMemo(() => {
    const localOrders = store.guestProfile.orders || [];
    const map = new Map<string, Order>();

    // First insert Supabase orders
    dbOrders.forEach(o => map.set(o.id, o));

    // Then merge with local orders (preserving items and details if local has richer data or recent offline state)
    localOrders.forEach(o => {
      const existing = map.get(o.id);
      if (!existing) {
        map.set(o.id, o);
      } else {
        const mergedItems = (existing.items && existing.items.length > 0)
          ? existing.items
          : (o.items && o.items.length > 0 ? o.items : []);
        map.set(o.id, {
          ...o,
          ...existing,
          items: mergedItems
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      return (b.id > a.id ? 1 : -1);
    });
  }, [dbOrders, store.guestProfile.orders]);

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
      name: store.guestProfile.name === 'Invitado' ? '' : (store.guestProfile.name || ''),
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