import { localDB } from '../db';
import { LocalCustomer } from '../types';

export const customerRepository = {
  /**
   * Obtiene todos los clientes cacheados localmente
   */
  async getAllCustomers(): Promise<LocalCustomer[]> {
    try {
      return await localDB.customers_cache.toArray();
    } catch (err) {
      console.error('Error fetching all customers from cache:', err);
      return [];
    }
  },

  /**
   * Busca clientes en la base local por DNI, teléfono o nombre
   */
  async searchCustomers(query: string, limit: number = 8): Promise<LocalCustomer[]> {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    try {
      const all = await localDB.customers_cache.toArray();
      return all
        .filter(c => {
          const matchPhone = (c.phone || '').toLowerCase().includes(clean);
          const matchDni = (c.dni || '').toLowerCase().includes(clean);
          const matchName = (c.name || '').toLowerCase().includes(clean);
          return matchPhone || matchDni || matchName;
        })
        .slice(0, limit);
    } catch (err) {
      console.error('Error searching customers locally:', err);
      return [];
    }
  },

  /**
   * Busca cliente por teléfono
   */
  async getCustomerByPhone(phone: string): Promise<LocalCustomer | undefined> {
    const clean = phone.trim();
    if (!clean) return undefined;
    try {
      return await localDB.customers_cache.where('phone').equals(clean).first();
    } catch (err) {
      console.error('Error getting customer by phone:', err);
      return undefined;
    }
  },

  /**
   * Busca cliente por DNI
   */
  async getCustomerByDni(dni: string): Promise<LocalCustomer | undefined> {
    const clean = dni.trim();
    if (!clean) return undefined;
    try {
      return await localDB.customers_cache.where('dni').equals(clean).first();
    } catch (err) {
      console.error('Error getting customer by DNI:', err);
      return undefined;
    }
  },

  /**
   * Guarda o actualiza un lote de clientes en IndexedDB
   */
  async saveCustomers(customers: LocalCustomer[]): Promise<void> {
    if (!customers || customers.length === 0) return;
    try {
      await localDB.customers_cache.bulkPut(customers);
    } catch (err) {
      console.error('Error bulk saving customers to cache:', err);
    }
  },

  /**
   * Incrementa la deuda local del cliente ante una venta a Cuenta Corriente offline
   */
  async increaseCustomerDebt(phone: string, additionalDebt: number): Promise<void> {
    try {
      const cust = await this.getCustomerByPhone(phone);
      if (cust) {
        cust.currentDebt = (cust.currentDebt || 0) + additionalDebt;
        cust.updated_at = new Date().toISOString();
        await localDB.customers_cache.put(cust);
      }
    } catch (err) {
      console.error('Error increasing customer local debt:', err);
    }
  }
};
