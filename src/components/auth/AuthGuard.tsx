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
  const { session, initialized, loading, hasPermission, employeeProfile } = useAuthStore();

  useEffect(() => {
    if (initialized && !loading && !session) {
      // Redirigir al login guardando la ruta intentada (opcional para UX avanzado)
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

  if (!session) {
    return null;
  }

  // Verificación de permiso específico para una ruta
  if (requiredPermission && employeeProfile && employeeProfile.role !== 'owner' && employeeProfile.role !== 'super_admin') {
    // Bloquear acceso absoluto a clientes para empleados comunes
    if (employeeProfile.role === 'employee' && requiredPermission.startsWith('customers.')) {
      return (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans p-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-red-100 flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-red-500 text-[32px]">block</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-on-background">Acceso Denegado</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                No tienes los permisos necesarios para acceder a este módulo. Contacta con tu administrador.
              </p>
            </div>
            <button 
              onClick={() => navigate('/admin', { replace: true })}
              className="mt-4 px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
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
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-red-500 text-[32px]">block</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-on-background">Acceso Denegado</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                No tienes los permisos necesarios para acceder a este módulo. Contacta con tu administrador.
              </p>
            </div>
            <button 
              onClick={() => navigate('/admin', { replace: true })}
              className="mt-4 px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
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
