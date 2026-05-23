import React, { ReactNode } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { PermissionKey } from '../../types/permissions.types';

interface PermissionGuardProps {
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  requireAll?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Componente que muestra u oculta elementos de la UI según los permisos del usuario activo.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  permissions,
  requireAll = false,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, employeeProfile } = useAuthStore();

  // Si no hay perfil, denegar (excepto en modo de desarrollo para facilitar pruebas locales)
  if (!employeeProfile) {
    if (import.meta.env.DEV) {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  }

  // Super admins y dueños no necesitan validación extra de UI (por seguridad y conveniencia)
  // aunque el store ya les da todos los permisos.
  if (employeeProfile.role === 'super_admin' || employeeProfile.role === 'owner') {
    return <>{children}</>;
  }

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    if (requireAll) {
      hasAccess = hasAllPermissions(permissions);
    } else {
      hasAccess = hasAnyPermission(permissions);
    }
  } else {
    // Si no se pasó ningún permiso requerido, se permite el acceso por defecto
    hasAccess = true;
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
};
