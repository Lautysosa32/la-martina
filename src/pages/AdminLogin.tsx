import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const signIn = useAuthStore((state) => state.signIn);
  const session = useAuthStore((state) => state.session);
  const employeeProfile = useAuthStore((state) => state.employeeProfile);
  const initialized = useAuthStore((state) => state.initialized);

  useEffect(() => {
    if (initialized && session && employeeProfile) {
      navigate('/admin', { replace: true });
    }
  }, [initialized, session, employeeProfile, navigate]);

  const [failedAttempts, setFailedAttempts] = useState(() => {
    try {
      return parseInt(sessionStorage.getItem('lm_admin_failed_logins') || '0', 10);
    } catch (_) {
      return 0;
    }
  });
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Manejo del temporizador de bloqueo por fuerza bruta
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutRemaining > 0) {
      timer = setInterval(() => {
        setLockoutRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (lockoutRemaining > 0) {
      setError(`Demasiados intentos fallidos. Por seguridad, espera ${lockoutRemaining} segundos.`);
      return;
    }

    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: signInError } = await signIn(email.trim(), password);

      if (signInError) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        try { sessionStorage.setItem('lm_admin_failed_logins', String(nextAttempts)); } catch (_) { }

        if (nextAttempts >= 5) {
          setLockoutRemaining(60);
          setError('Demasiados intentos fallidos. El acceso ha sido bloqueado temporalmente por 60 segundos.');
        } else {
          setError('Correo o contraseña incorrectos. Por favor, verifica tus credenciales.');
        }
      } else if (data?.user) {
        setFailedAttempts(0);
        try { sessionStorage.removeItem('lm_admin_failed_logins'); } catch (_) { }
        navigate('/admin');
      }
    } catch (err: any) {
      setError('Ocurrió un error al conectar con el servidor. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative font-sans">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-outline-variant/10 relative z-10 w-full max-w-md p-8 sm:p-10 animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[32px] text-white">storefront</span>
          </div>
          <h1 className="text-2xl font-black text-on-background mb-1">Admin Portal</h1>
          <p className="text-sm font-medium text-on-surface-variant">Martina Supermercado</p>
        </div>

        {/* Info Banner when customer session is active */}
        {session && !employeeProfile && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0 mt-0.5">account_circle</span>
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-bold">Sesión de cliente activa</p>
              <p className="mt-0.5 text-amber-800">
                Iniciá sesión a continuación con tu cuenta de empleado para acceder al panel administrativo.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${error ? 'mb-6 max-h-24 opacity-100' : 'max-h-0 opacity-0'
            }`}
        >
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
            <p className="text-sm text-error font-bold">{error}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase ml-1">Correo Electrónico</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 text-on-background rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-on-surface-variant/50 font-medium"
                placeholder="admin@lamartina.com"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-on-surface-variant uppercase">Contraseña</label>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 text-on-background rounded-2xl py-3.5 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-on-surface-variant/50 font-medium"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-on-background transition-colors focus:outline-none"
                disabled={isSubmitting}
              >
                <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white font-black rounded-2xl py-4 transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-70 disabled:hover:bg-primary disabled:shadow-none mt-6 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <span>Ingresar al Dashboard</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
