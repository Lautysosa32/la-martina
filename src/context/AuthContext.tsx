import React, { createContext, useContext, useState, useEffect } from 'react';

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

interface User {
  name: string;
  phone: string;
  address: string;
  orders: Order[];
}

interface AuthContextType {
  user: User | null;
  updateUser: (data: Partial<User>) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  // Cargar usuario de localStorage al inicio
  useEffect(() => {
    const savedUser = localStorage.getItem('la-martina-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      // Usuario inicial de prueba para que no aparezca vacío
      const guestUser: User = {
        name: 'Invitado',
        phone: '',
        address: '',
        orders: []
      };
      setUser(guestUser);
    }
  }, []);

  // Guardar cada vez que cambie
  useEffect(() => {
    if (user) {
      localStorage.setItem('la-martina-user', JSON.stringify(user));
    }
  }, [user]);

  const updateUser = (data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null);
  };

  const addOrder = (order: Order) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        orders: [order, ...prev.orders]
      };
    });
  };

  const updateOrderStatus = (orderId: string, status: Order['status']) => {
    setUser(prev => {
      if (!prev) return null;
      return {
        ...prev,
        orders: prev.orders.map(o => o.id === orderId ? { ...o, status } : o)
      };
    });
  };

  return (
    <AuthContext.Provider value={{ user, updateUser, addOrder, updateOrderStatus, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
