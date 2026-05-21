import React, { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { data, error: signInError } = await signIn(email, password);
      
      if (signInError) {
        console.error("Detalle de error en AdminLogin:", signInError);
        
        // Manejo de errores específicos de Supabase
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Correo o contraseña incorrectos.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Debes confirmar tu correo electrónico antes de iniciar sesión.');
        } else {
          setError(`Error de autenticación: ${signInError.message}`);
        }
      } else if (data?.user) {
        navigate('/admin');
      }
    } catch (err: any) {
      console.error("Error inesperado en AdminLogin:", err);
      setError(err?.message || 'Ocurrió un error inesperado al conectar con el servidor.');
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
          <p className="text-sm font-medium text-on-surface-variant">La Martina Supermercado</p>
        </div>

        {/* Error Message */}
        <div 
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            error ? 'mb-6 max-h-24 opacity-100' : 'max-h-0 opacity-0'
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
