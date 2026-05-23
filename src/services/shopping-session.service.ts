import api from '../lib/axios';
import {
  ShoppingSession,
  ShoppingSessionItem,
  CreateShoppingSessionInput,
  SupabaseShoppingSession,
  SupabaseShoppingSessionItem
} from '../types/shopping-session.types';

// Convert from frontend camelCase to Supabase snake_case
const toSupabaseSession = (input: Partial<ShoppingSession>): Partial<SupabaseShoppingSession> => {
  return {
    ...(input.id !== undefined && { id: input.id }),
    ...(input.code !== undefined && { code: input.code }),
    ...(input.branchId !== undefined && { branch_id: input.branchId }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.customerName !== undefined && { customer_name: input.customerName }),
    ...(input.customerPhone !== undefined && { customer_phone: input.customerPhone }),
    ...(input.subtotal !== undefined && { subtotal: input.subtotal }),
    ...(input.totalItems !== undefined && { total_items: input.totalItems }),
    ...(input.expiresAt !== undefined && { expires_at: input.expiresAt }),
    ...(input.createdAt !== undefined && { created_at: input.createdAt }),
    ...(input.confirmedAt !== undefined && { confirmed_at: input.confirmedAt }),
    ...(input.confirmedBy !== undefined && { confirmed_by: input.confirmedBy }),
  };
};

// Convert from Supabase snake_case to frontend camelCase
const toFrontendSession = (session: SupabaseShoppingSession): ShoppingSession => {
  return {
    id: session.id,
    code: session.code,
    branchId: session.branch_id,
    status: session.status,
    customerName: session.customer_name,
    customerPhone: session.customer_phone,
    subtotal: Number(session.subtotal),
    totalItems: session.total_items,
    expiresAt: session.expires_at,
    createdAt: session.created_at,
    confirmedAt: session.confirmed_at,
    confirmedBy: session.confirmed_by,
  };
};

const toFrontendSessionItem = (item: SupabaseShoppingSessionItem): ShoppingSessionItem => {
  return {
    id: item.id,
    sessionId: item.session_id,
    productId: item.product_id,
    barcode: item.barcode,
    name: item.name,
    image: item.image,
    price: Number(item.price),
    quantity: item.quantity,
    subtotal: Number(item.subtotal),
  };
};

const generateShortCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'LM-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const shoppingSessionService = {
  // Create a new shopping session (pre-compra) and its items
  async createShoppingSession(input: CreateShoppingSessionInput): Promise<{ session: ShoppingSession; items: ShoppingSessionItem[] }> {
    const code = generateShortCode();
    
    // Expires in 60 minutes
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    
    const sessionData = toSupabaseSession({
      code,
      branchId: input.branchId || 'main',
      status: 'pending',
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      subtotal: input.subtotal,
      totalItems: input.totalItems,
      expiresAt
    });

    // 1. Create the session header
    const sessionResponse = await api.post<SupabaseShoppingSession[]>('/shopping_sessions', sessionData, {
      headers: {
        'Prefer': 'return=representation'
      }
    });

    const createdSession = toFrontendSession(sessionResponse.data[0]);

    // 2. Prepare items data
    const itemsData = input.items.map(item => ({
      session_id: createdSession.id,
      product_id: item.productId || null,
      barcode: item.barcode || null,
      name: item.name,
      image: item.image || '',
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity
    }));

    // 3. Create items in bulk
    const itemsResponse = await api.post<SupabaseShoppingSessionItem[]>('/shopping_session_items', itemsData, {
      headers: {
        'Prefer': 'return=representation'
      }
    });

    const createdItems = itemsResponse.data.map(toFrontendSessionItem);

    return {
      session: createdSession,
      items: createdItems
    };
  },

  // Get shopping session details by code
  async getShoppingSessionByCode(code: string): Promise<ShoppingSession | null> {
    const response = await api.get<SupabaseShoppingSession[]>(`/shopping_sessions?code=eq.${code.toUpperCase().trim()}&select=*`);
    if (response.data.length === 0) return null;
    return toFrontendSession(response.data[0]);
  },

  // Get items of a specific shopping session
  async getShoppingSessionItems(sessionId: string): Promise<ShoppingSessionItem[]> {
    const response = await api.get<SupabaseShoppingSessionItem[]>(`/shopping_session_items?session_id=eq.${sessionId}&select=*`);
    return response.data.map(toFrontendSessionItem);
  },

  // Cancel a shopping session
  async cancelShoppingSession(sessionId: string): Promise<ShoppingSession> {
    const response = await api.patch<SupabaseShoppingSession[]>(`/shopping_sessions?id=eq.${sessionId}`, {
      status: 'cancelled'
    }, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendSession(response.data[0]);
  },

  // Confirm a shopping session when paid at check-out
  async confirmShoppingSession(sessionId: string, confirmedBy: string): Promise<ShoppingSession> {
    const response = await api.patch<SupabaseShoppingSession[]>(`/shopping_sessions?id=eq.${sessionId}`, {
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy
    }, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return toFrontendSession(response.data[0]);
  }
};
