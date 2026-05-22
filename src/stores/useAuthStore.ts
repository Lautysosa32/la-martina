import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { Employee, PermissionKey } from '../types/permissions.types'
import { employeesService } from '../services/employees.service'

export interface Order {
  id: string;
  date: string;
  total: number;
  itemsCount: number;
  status: 'Nuevo' | 'Preparando' | 'En Camino' | 'Entregado' | 'Cancelado' | 'Procesando';
  address?: string;
  deliveryTime?: string;
  items: any[];
}

export interface GuestProfile {
  name: string;
  phone: string;
  address: string;
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
}

// Inicializar perfil de invitado desde localStorage
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
    
    // Timeout de seguridad en caso de que la red cuelgue
    const timeoutId = setTimeout(() => {
      if (!get().initialized) {
        console.warn("⚠️ Forzando inicialización de Auth por timeout...");
        set({ loading: false, initialized: true });
      }
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.error("❌ Error al obtener sesión inicial:", error.message);
      } else {
        console.log("✅ Sesión inicial verificada:", session ? `Usuario autenticado` : "No hay usuario autenticado");
      }
      
      let employeeProfile = null;
      let permissions: PermissionKey[] = [];
      
      if (session?.user) {
        employeeProfile = await employeesService.getCurrentEmployeeProfile(session.user.id);
        if (employeeProfile) {
          permissions = employeesService.getEffectivePermissions(employeeProfile.role, employeeProfile.permissions_override);
        }
      }

      clearTimeout(timeoutId);
      set({ 
        session, 
        user: session?.user ?? null,
        employeeProfile,
        permissions,
        loading: false,
        initialized: true
      });
    }).catch(err => {
      console.error("❌ Error inesperado en getSession:", err);
      clearTimeout(timeoutId);
      set({ loading: false, initialized: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log(`🔔 Evento de Auth Supabase: ${_event}`);
      
      let employeeProfile = get().employeeProfile;
      let permissions = get().permissions;

      if (session?.user && (!employeeProfile || employeeProfile.user_id !== session.user.id)) {
        employeeProfile = await employeesService.getCurrentEmployeeProfile(session.user.id);
        if (employeeProfile) {
          permissions = employeesService.getEffectivePermissions(employeeProfile.role, employeeProfile.permissions_override);
        } else {
          permissions = [];
        }
      } else if (!session) {
        employeeProfile = null;
        permissions = [];
      }

      set({ 
        session, 
        user: session?.user ?? null,
        employeeProfile,
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
      console.error("❌ Error devuelto por Supabase al hacer signIn:", error);
      set({ loading: false });
    } else {
      console.log("✅ Inicio de sesión exitoso. Cargando perfil de empleado...");
      // Guardar la sesión temporalmente para que axios pueda usar el token
      set({ user: data.user, session: data.session });

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
      console.log("✅ Sesión cerrada exitosamente");
      set({ user: null, session: null, employeeProfile: null, permissions: [] });
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

// Export a proxy hook to maintain compatibility with components that used useAuth()
export const useAuth = () => {
  const store = useAuthStore();
  return {
    user: store.guestProfile,
    updateUser: store.updateUser,
    addOrder: store.addOrder,
    updateOrderStatus: store.updateOrderStatus,
    isAuthenticated: !!store.session
  };
};