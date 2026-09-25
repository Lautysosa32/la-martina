import { Request, Response, NextFunction } from 'express';
import { FiscalRepository } from '../db/fiscalRepository';

const fiscalRepo = new FiscalRepository();

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface AuthenticatedEmployee {
  id: string;
  user_id: string;
  role: 'super_admin' | 'owner' | 'admin' | 'employee' | string;
  active: boolean;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  employee?: AuthenticatedEmployee;
}

/**
 * Middleware que verifica el token JWT de Supabase y comprueba que el usuario
 * sea un empleado ACTIVO registrado en la base de datos.
 * Bloquea completamente accesos anónimos y clientes (customer).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  // Si no hay token de autenticación en cabecera ni query param:
  // Se permite el paso exclusivamente para streaming/descarga de PDFs de comprobantes
  // (el endpoint de PDF valida de forma estricta que el comprobante esté AUTORIZADO con CAE oficial)
  if (!token) {
    if (req.path.includes('/pdf') && req.method === 'GET') {
      return next();
    }

    res.status(401).json({
      success: false,
      error: 'Acceso no autorizado: Se requiere token de autenticación Bearer.'
    });
    return;
  }

  try {
    const supabase = fiscalRepo.getClient(token);
    
    // 1. Validar el token con Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({
        success: false,
        error: 'Sesión inválida, expirada o revocada. Inicie sesión nuevamente.'
      });
      return;
    }

    // 2. Verificar que el usuario corresponda a un empleado activo
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, user_id, role, active, name')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (empError || !employee) {
      res.status(403).json({
        success: false,
        error: 'Acceso denegado: Se requieren credenciales de empleado activo del comercio.'
      });
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email
    };

    (req as AuthenticatedRequest).employee = {
      id: employee.id,
      user_id: employee.user_id,
      role: employee.role,
      active: employee.active,
      name: employee.name
    };

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Error interno de validación de credenciales: ${err.message}`
    });
  }
}

/**
 * Middleware que comprueba que el empleado autenticado posea uno de los roles autorizados.
 * Los roles 'owner' y 'super_admin' siempre tienen autorización irrestricta.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const emp = (req as AuthenticatedRequest).employee;

    if (!emp) {
      res.status(401).json({
        success: false,
        error: 'Autenticación requerida antes de verificar roles.'
      });
      return;
    }

    const isPrivileged = emp.role === 'owner' || emp.role === 'super_admin' || emp.role === 'admin';
    const roleAliases: Record<string, string[]> = {
      admin: ['admin', 'owner', 'super_admin'],
      cajero: ['cajero', 'cashier', 'admin', 'owner', 'super_admin'],
      cashier: ['cajero', 'cashier', 'admin', 'owner', 'super_admin'],
      repositor: ['repositor', 'employee', 'cajero', 'admin', 'owner', 'super_admin'],
      employee: ['repositor', 'employee', 'cajero', 'admin', 'owner', 'super_admin'],
    };

    const hasPermission = allowedRoles.some(allowed => {
      if (emp.role === allowed) return true;
      const aliases = roleAliases[allowed];
      return aliases ? aliases.includes(emp.role) : false;
    });

    if (isPrivileged || hasPermission) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: `Acceso denegado: El rol '${emp.role}' no cuenta con permisos suficientes para esta operación fiscal.`
    });
  };
}
