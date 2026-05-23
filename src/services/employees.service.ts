import { supabase } from '../lib/supabase';
import api from '../lib/axios';
import { Employee, PermissionKey, PermissionsOverride, UserRole } from '../types/permissions.types';
import { ROLE_PERMISSIONS } from '../config/permissions';

// API URL ya configurada en lib/axios.ts
export const employeesService = {
  // Obtiene el perfil de empleado actual (usado durante el login)
  async getCurrentEmployeeProfile(userId: string): Promise<Employee | null> {
    try {
      const response = await api.get(`/employees`, {
        params: {
          user_id: `eq.${userId}`,
          select: '*'
        }
      });
      return response.data?.[0] || null;
    } catch (error) {
      console.error("Error obteniendo perfil de empleado:", error);
      return null;
    }
  },

  // Obtiene todos los empleados (para el panel de Admin)
  async getAllEmployees(): Promise<Employee[]> {
    const response = await api.get(`/employees?select=*&order=created_at.desc`);
    return response.data;
  },

  // Crea el registro del empleado en la tabla (Legacy/Manual)
  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    const response = await api.post(`/employees`, data, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data[0];
  },

  // Crea el empleado invocando la Edge Function (Genera User en Auth + Row en tabla)
  async createEmployeeThroughFunction(data: any): Promise<Employee> {
    const { data: responseData, error } = await supabase.functions.invoke('create-employee', {
      body: data
    });

    if (error) {
      // Intentamos extraer el mensaje de error de la Edge Function devuelto en custom context
      let errorMessage = error.message;
      try {
        const context = await error.context?.json?.();
        if (context && context.error) {
          errorMessage = context.error;
        }
      } catch (e) {
        // Fallback para mensajes de error crudos de axios/fetch
        if (error.message.includes('No autorizado: Token inválido')) {
          errorMessage = 'Token de sesión inválido. Por favor recarga la página o vuelve a iniciar sesión.';
        }
      }
      throw new Error(errorMessage || 'Error desconocido al invocar la función');
    }

    return responseData;
  },

  // Actualiza datos de un empleado
  async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
    const response = await api.patch(`/employees?id=eq.${id}`, updates, {
      headers: {
        'Prefer': 'return=representation'
      }
    });
    return response.data[0];
  },

  // Desactiva un empleado (Soft delete)
  async deactivateEmployee(id: string): Promise<Employee> {
    return this.updateEmployee(id, { active: false });
  },

  // Activa un empleado
  async activateEmployee(id: string): Promise<Employee> {
    return this.updateEmployee(id, { active: true });
  },

  // Actualiza explícitamente los overrides de permisos
  async updateEmployeePermissions(id: string, overrides: PermissionsOverride): Promise<Employee> {
    return this.updateEmployee(id, { permissions_override: overrides });
  },

  // ==========================================
  // HELPERS DE PERMISOS
  // ==========================================

  // Obtiene permisos base por rol
  getRolePermissions(role: UserRole): PermissionKey[] {
    return ROLE_PERMISSIONS[role] || [];
  },

  // Calcula permisos efectivos: (Base de Rol - Deny) + Allow
  getEffectivePermissions(role: UserRole, overrides?: PermissionsOverride): PermissionKey[] {
    const basePermissions = new Set<PermissionKey>(this.getRolePermissions(role));
    
    if (!overrides) {
      return Array.from(basePermissions);
    }

    // Quitar los denegados
    if (Array.isArray(overrides.deny)) {
      overrides.deny.forEach(p => basePermissions.delete(p));
    }

    // Agregar los permitidos
    if (Array.isArray(overrides.allow)) {
      overrides.allow.forEach(p => basePermissions.add(p));
    }

    return Array.from(basePermissions) as PermissionKey[];
  }
};
