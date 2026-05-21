import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'

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

  guestProfile: loadGuestProfile(),

  initializeAuth: () => {
    console.log("🔄 Inicializando Auth de Supabase...");
    
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("❌ Error al obtener sesión inicial:", error.message);
      } else {
        console.log("✅ Sesión inicial verificada:", session ? `Usuario autenticado` : "No hay usuario autenticado");
      }
      
      set({ 
        session, 
        user: session?.user ?? null,
        loading: false,
        initialized: true
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log(`🔔 Evento de Auth Supabase: ${_event}`);
      set({ 
        session, 
        user: session?.user ?? null,
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
      console.log("✅ Inicio de sesión exitoso.");
      set({ user: data.user, session: data.session, loading: false });
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
      set({ user: null, session: null });
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