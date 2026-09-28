import { supabase } from '../lib/supabase';
import api from '../lib/axios';
import { Employee, PermissionKey, PermissionsOverride, UserRole } from '../types/permissions.types';
import { ROLE_PERMISSIONS } from '../config/permissions';

// API URL ya configurada en lib/axios.ts
export const employeesService = {
  // Obtiene el perfil de empleado actual (usado durante el login)
  async getCurrentEmployeeProfile(userId: string, email?: string, phone?: string): Promise<Employee | null> {
    try {
      // 1. Intentar por user_id directo
      const { data: byUserId, error: errUserId } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (byUserId) return byUserId;

      // 2. Si no se encontró por user_id, buscar por email real si no es sintético
      if (email && !email.endsWith('@lamartina.com')) {
        const { data: byEmail } = await supabase
          .from('employees')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (byEmail) {
          if (!byEmail.user_id) {
            await supabase.from('employees').update({ user_id: userId }).eq('id', byEmail.id);
            byEmail.user_id = userId;
          }
          return byEmail;
        }
      }

      // 3. Si tiene teléfono, buscar coincidencia en empleados
      if (phone) {
        const cleanP = phone.replace(/\D/g, '');
        if (cleanP.length >= 8) {
          const { data: allEmps } = await supabase
            .from('employees')
            .select('*')
            .not('phone', 'is', null);

          if (allEmps) {
            const matched = allEmps.find(e => {
              const eClean = (e.phone || '').replace(/\D/g, '');
              return eClean && (eClean === cleanP || eClean.endsWith(cleanP.slice(-8)) || cleanP.endsWith(eClean.slice(-8)));
            });

            if (matched) {
              if (!matched.user_id) {
                await supabase.from('employees').update({ user_id: userId }).eq('id', matched.id);
                matched.user_id = userId;
              }
              return matched;
            }
          }
        }
      }

      // Fallback a API axios si fuera necesario
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

  // Elimina permanentemente un empleado de la tabla (Hard delete)
  async deleteEmployee(id: string): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw new Error(error.message);
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
  },

  // ==========================================
  // DELIVERY ASSIGNMENT
  // ==========================================

  // Obtiene la asignación de delivery activa para el día actual
  async getActiveDeliveryAssignment() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_delivery_assignments')
        .select('*, employee:employees(*)')
        .eq('date', today)
        .eq('status', 'active')
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error("Error obteniendo asignación de delivery:", error);
      }
      return data || null;
    } catch (error) {
      console.error("Excepción obteniendo asignación de delivery:", error);
      return null;
    }
  },

  // Asigna a un empleado como delivery, pausando o sobreescribiendo el anterior
  async assignDailyDelivery(employeeId: string, employeePhone?: string | null) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Pausar todas las asignaciones activas de hoy
      await supabase
        .from('daily_delivery_assignments')
        .update({ status: 'paused' })
        .eq('date', today)
        .eq('status', 'active');

      // 2. Crear nueva asignación activa
      const { data, error } = await supabase
        .from('daily_delivery_assignments')
        .insert({
          date: today,
          employee_id: employeeId,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      // 3. (Opcional) Acá deberíamos llamar al servicio de WhatsApp para liberar los mensajes
      // pending_delivery_assignment. Lo haremos en la capa superior o usando el servicio de WhatsApp.
      
      return data;
    } catch (error) {
      console.error("Error asignando delivery diario:", error);
      throw error;
    }
  },

  // Pausa el delivery actual
  async pauseDailyDelivery() {
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_delivery_assignments')
        .update({ status: 'paused' })
        .eq('date', today)
        .eq('status', 'active');
      return true;
    } catch (error) {
      console.error("Error pausando delivery:", error);
      return false;
    }
  }
};
