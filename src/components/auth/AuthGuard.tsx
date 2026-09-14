import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { PermissionKey } from '../../types/permissions.types';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredPermission?: PermissionKey;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children, requiredPermission }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, initialized, loading, hasPermission, employeeProfile, signOut } = useAuthStore();

  useEffect(() => {
    if (initialized && !loading && !session) {
      // Redirigir al login guardando la ruta intentada
      navigate('/admin/login', { replace: true, state: { from: location.pathname } });
    }
  }, [initialized, loading, session, navigate, location.pathname]);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-outline-variant/10 flex flex-col items-center gap-6 max-w-sm w-full text-center animate-in zoom-in-95 duration-300">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            <span className="material-symbols-outlined text-[24px] text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse">
              shield_lock
            </span>
          </div>
          <div>
            <h3 className="font-black text-lg text-on-background">Verificando Credenciales</h3>
            <p className="text-xs text-on-surface-variant mt-1 font-semibold">Cargando sesión y permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  // 1. Sin sesión activa
  if (!session) {
    return null;
  }

  // 2. PROTECCIÓN CRÍTICA DE ACCESO A ADMIN:
  // Si el usuario tiene sesión en Supabase (ej. cliente registrado) pero NO es un empleado registrado,
  // se le deniega el acceso a todo el panel administrativo.
  if (!employeeProfile) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans p-6">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-red-100 flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
            <span className="material-symbols-outlined text-[32px]">admin_panel_settings</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-on-background">Acceso Restringido</h3>
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
              El panel administrativo es de uso exclusivo para el personal autorizado de <strong>Martina Supermercado</strong>. Tu cuenta actual no posee un perfil de empleado activo asignado.
            </p>
          </div>
          <div className="flex gap-3 mt-4 w-full">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="flex-1 px-5 py-2.5 bg-surface-container text-on-surface rounded-xl font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer"
            >
              Ir a la Tienda
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate('/admin/login', { replace: true });
              }}
              className="flex-1 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
            >
              Cambiar Cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Empleado con cuenta desactivada
  if (!employeeProfile.active) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans p-8">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-amber-100 flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-[32px]">person_off</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-on-background">Cuenta Inactiva</h3>
            <p className="text-sm text-on-surface-variant mt-2">
              Tu cuenta de empleado ha sido desactivada por la administración. Comunícate con tu encargado.
            </p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate('/admin/login', { replace: true });
            }}
            className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
          >
            Cerrar Sesión / Cambiar Cuenta
          </button>
        </div>
      </div>
    );
  }

  // 4. Verificación de permisos específicos de la ruta
  const isPrivileged = employeeProfile.role === 'owner' || employeeProfile.role === 'super_admin';

  if (!isPrivileged && requiredPermission) {
    // Restricción especial para empleados comunes sobre clientes
    if (employeeProfile.role === 'employee' && requiredPermission.startsWith('customers.')) {
      return (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans p-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-red-100 flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
              <span className="material-symbols-outlined text-[32px]">block</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-on-background">Acceso Denegado</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                No tienes los permisos necesarios para acceder a este módulo. Contacta con tu administrador.
              </p>
            </div>
            <button
              onClick={() => navigate('/admin', { replace: true })}
              className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
            >
              Volver al Dashboard
            </button>
          </div>
        </div>
      );
    }

    if (!hasPermission(requiredPermission)) {
      return (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans p-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-red-100 flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
              <span className="material-symbols-outlined text-[32px]">lock</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-on-background">Módulo Restringido</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                Tu rol no dispone de autorización para la acción <code className="text-xs bg-surface-container px-1.5 py-0.5 rounded font-mono">{requiredPermission}</code>.
              </p>
            </div>
            <button
              onClick={() => navigate('/admin', { replace: true })}
              className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
            >
              Volver al Dashboard
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
