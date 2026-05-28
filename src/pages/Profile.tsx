import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../stores/useAuthStore';
import { useCart } from '../context/CartContext';
import { useAdmin } from '../context/AdminContext';
import { useNavigate } from 'react-router-dom';
import { MapSelector } from '../components/MapSelector';

export const Profile: React.FC = () => {
  const { 
    user, 
    updateUser, 
    isAuthenticated, 
    isCustomer, 
    signUpCustomer, 
    signInCustomer, 
    signOutCustomer, 
    loading: authLoading 
  } = useAuth();
  const { addItem } = useCart();
  const { customers, orders, toggleCurrentAccount } = useAdmin();
  const navigate = useNavigate();
  
  const [isEditing, setIsEditing] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showCCModal, setShowCCModal] = useState(false);
  const [selectedCCDate, setSelectedCCDate] = useState<string | null>(null);
  const [ccError, setCcError] = useState<string | null>(null);

  // Customer Auth Flow States
  const [continueAsGuest, setContinueAsGuest] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states for login/signup
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // Map & Address states (for profile address)
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLabel, setAddressLabel] = useState<string>(user?.address || '');
  const [addressHouseNumber, setAddressHouseNumber] = useState<string>('');
  const [addressReference, setAddressReference] = useState<string>('');
  const [addressNotes, setAddressNotes] = useState<string>('');

  const currentCustomer = useMemo(() => {
    if (!user?.phone) return null;
    return customers.find(c => c.phone.replace(/\s+/g, '') === user.phone.replace(/\s+/g, ''));
  }, [customers, user?.phone]);

  const ccOrders = useMemo(() => {
    if (!user?.phone) return [];
    return orders.filter(o =>
      o.phone.replace(/\s+/g, '') === user.phone.replace(/\s+/g, '') &&
      o.paymentMethod === 'cuenta_corriente' &&
      o.status !== 'Cancelado'
    ).sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      return tsB - tsA;
    });
  }, [orders, user?.phone]);

  const ccByDate = useMemo(() => {
    const groups: Record<string, typeof ccOrders> = {};
    ccOrders.forEach(o => {
      const date = o.date.split(',')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(o);
    });
    return Object.entries(groups).map(([date, items]) => ({
      date,
      total: items.reduce((s, i) => s + i.total, 0),
      isPaid: items.every(i => i.paymentStatus === 'Pagado'),
      orders: items
    }));
  }, [ccOrders]);

  const handleRepeatOrder = (items: any[]) => {
    items.forEach(item => {
      addItem(item);
    });
    navigate('/cart');
  };

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || ''
  });

  // Sync edit form when user details change
  React.useEffect(() => {
    setFormData({
      name: user?.name || '',
      phone: user?.phone || '',
      address: user?.address || ''
    });
  }, [user?.name, user?.phone, user?.address]);

  const handleSave = () => {
    // Build address string from map fields
    const builtAddress = addressCoords
      ? `${addressLabel}${addressHouseNumber ? ' Nº ' + addressHouseNumber : ''}${addressReference ? ' (' + addressReference + ')' : ''}`
      : formData.address;
    updateUser({
      ...formData,
      address: builtAddress,
      // Save coordinates if a map location was selected
      address_lat: addressCoords?.lat ?? null,
      address_lng: addressCoords?.lng ?? null,
    });
    setIsEditing(false);
  };

  const handleLocationSelected = (lat: number, lng: number, address: string) => {
    setAddressCoords({ lat, lng });
    setAddressLabel(address);
    setIsMapModalOpen(false);
  };

  // Auth Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!phone || !password) {
      setErrorMsg('Por favor, completa celular y contraseña.');
      return;
    }

    const res = await signInCustomer(phone, password);
    if (res.error) {
      setErrorMsg('Celular o contraseña incorrectos. Revisa e intenta de nuevo.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!phone || !password || !name) {
      setErrorMsg('Por favor, completa celular, contraseña y nombre.');
      return;
    }

    const res = await signUpCustomer(phone, password, name, lastName, email);
    if (res.error) {
      setErrorMsg(res.error.message || 'Error en el registro. Intenta de nuevo.');
    }
  };

  // ─── Render Auth UI ───
  if (!isAuthenticated && !continueAsGuest) {
    return (
      <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 flex flex-col items-center justify-center min-h-[75vh] animate-in fade-in duration-500">
        
        {/* Main Auth Grid */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-stretch">
          
          {/* Left Column: Benefits (Visual hook) */}
          <div className="md:col-span-6 flex flex-col justify-center space-y-6 bg-primary/5 rounded-[2.5rem] p-8 border border-primary/10 text-left">
            <div>
              <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full uppercase tracking-wider">Martina Club</span>
              <h2 className="text-2xl md:text-3xl font-black text-on-background mt-3 mb-1">¡Comprá con más beneficios!</h2>
              <p className="text-sm text-on-surface-variant">Unite gratis para acceder a funciones premium en nuestra tienda.</p>
            </div>

            <div className="space-y-4">
              {[
                { icon: 'history', title: 'Historial de Pedidos', desc: 'Revisá tus compras pasadas y repetilas al instante.' },
                { icon: 'favorite', title: 'Tus Favoritos', desc: 'Guardá tus productos favoritos en la nube para no perderlos.' },
                { icon: 'location_on', title: 'Direcciones Guardadas', desc: 'Configurá tus casas u oficinas en el mapa para checkouts en 1 clic.' },
                { icon: 'local_offer', title: 'Descuentos Especiales', desc: 'Promociones personalizadas para clientes registrados.' }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="w-10 h-10 bg-white text-primary rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-outline-variant/10">
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-on-surface leading-tight">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-tight mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Interactive Login/Signup Card */}
          <div className="md:col-span-6 bg-white p-6 md:p-8 rounded-[2.5rem] border border-outline-variant/20 shadow-xl flex flex-col relative overflow-hidden justify-between">
            {authLoading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div>
              {/* Tab selector */}
              <div className="flex bg-surface-container-low p-1 rounded-2xl mb-8 border border-outline-variant/5">
                <button
                  onClick={() => { setAuthTab('login'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${authTab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  INICIAR SESIÓN
                </button>
                <button
                  onClick={() => { setAuthTab('register'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${authTab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  REGISTRARME
                </button>
              </div>

              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top-1 duration-200">
                  <span className="material-symbols-outlined text-red-600 text-[18px]">error</span>
                  <p className="text-xs text-red-700 font-bold leading-tight">{errorMsg}</p>
                </div>
              )}

              {/* Login Form */}
              {authTab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">WhatsApp / Celular</label>
                    <div className="relative flex items-center bg-[#fcf9f8] border border-outline-variant/30 rounded-xl focus-within:border-primary transition-all overflow-hidden">
                      <span className="material-symbols-outlined pl-4 text-on-surface-variant text-[20px] shrink-0">call</span>
                      <span className="pl-2 pr-1.5 text-on-surface font-semibold text-sm shrink-0 border-r border-outline-variant/20 mr-2">+54</span>
                      <input
                        required
                        type="tel"
                        placeholder="261 455 6677"
                        value={phone.startsWith('+54') ? phone.substring(3) : (phone.startsWith('54') ? phone.substring(2) : phone)}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          setPhone(val ? '+54' + val : '');
                        }}
                        className="w-full bg-transparent py-3 pr-4 outline-none font-semibold text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Contraseña</label>
                    <div className="relative">
                      <input
                        required
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl pl-11 pr-4 py-3 outline-none focus:border-primary transition-all font-semibold"
                      />
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">lock</span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 transition-all text-sm mt-6"
                  >
                    INGRESAR
                  </button>
                </form>
              ) : (
                /* Registration Form */
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Nombre *</label>
                      <input
                        required
                        type="text"
                        placeholder="Juan"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Apellido</label>
                      <input
                        type="text"
                        placeholder="Pérez"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-all font-semibold text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">WhatsApp / Celular *</label>
                    <div className="relative flex items-center bg-[#fcf9f8] border border-outline-variant/30 rounded-xl focus-within:border-primary transition-all overflow-hidden">
                      <span className="material-symbols-outlined pl-3 text-on-surface-variant text-[18px] shrink-0">call</span>
                      <span className="pl-1.5 pr-1.5 text-on-surface font-semibold text-xs shrink-0 border-r border-outline-variant/20 mr-1.5">+54</span>
                      <input
                        required
                        type="tel"
                        placeholder="261 455 6677"
                        value={phone.startsWith('+54') ? phone.substring(3) : (phone.startsWith('54') ? phone.substring(2) : phone)}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          setPhone(val ? '+54' + val : '');
                        }}
                        className="w-full bg-transparent py-3 pr-4 outline-none font-semibold text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Email (Opcional)</label>
                    <div className="relative">
                      <input
                        type="email"
                        placeholder="juan@ejemplo.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary transition-all font-semibold text-xs"
                      />
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">mail</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Contraseña *</label>
                    <div className="relative">
                      <input
                        required
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-[#fcf9f8] border border-outline-variant/30 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-primary transition-all font-semibold text-xs"
                      />
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">lock</span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-primary/20 transition-all text-xs mt-4 uppercase tracking-wider"
                  >
                    CREAR CUENTA
                  </button>
                </form>
              )}
            </div>

            <div className="mt-8 border-t border-outline-variant/10 pt-6 text-center">
              <button
                type="button"
                onClick={() => setContinueAsGuest(true)}
                className="text-on-surface-variant text-xs hover:text-primary font-bold transition-all underline decoration-dashed underline-offset-4"
              >
                Continuar como invitado sin cuenta
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ─── Render Logged in / Guest Profile view ───
  return (
    <div className="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-8 animate-in fade-in duration-700">
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[25px] font-bold text-on-background">Mi Perfil</h1>
            {isCustomer ? (
              <span className="text-[9px] font-black tracking-widest bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase">MIEMBRO CLUB</span>
            ) : (
              <span className="text-[9px] font-black tracking-widest bg-surface-container-high text-on-surface-variant border border-outline-variant/20 px-2 py-0.5 rounded-full uppercase">MODO INVITADO</span>
            )}
          </div>
          <p className="text-on-surface-variant text-base">Gestioná tus datos y revisá tus pedidos anteriores.</p>
        </div>

        {!isAuthenticated && (
          <button
            onClick={() => setContinueAsGuest(false)}
            className="self-start md:self-auto bg-primary hover:bg-primary/90 text-white font-bold px-6 py-3 rounded-2xl shadow-md transition-all text-xs flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            INICIAR SESIÓN / CREAR CUENTA
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Datos Personales */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm relative overflow-hidden">
            {authLoading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Mis Datos</h2>
              {/* Clientes autenticados solo pueden editar la dirección */}
              {(!isCustomer || !isAuthenticated) && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-primary text-sm font-bold hover:underline"
                >
                  {isEditing ? 'Cancelar' : 'Editar'}
                </button>
              )}
              {isCustomer && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-primary/70 text-xs font-bold hover:underline"
                >
                  {isEditing ? 'Cancelar' : 'Editar dirección'}
                </button>
              )}
            </div>

            <div className="space-y-4">

              {/* Aviso de campos bloqueados para clientes autenticados */}
              {isCustomer && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                  <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5 shrink-0">lock</span>
                  <p className="text-[11px] text-amber-700 leading-snug">
                    <span className="font-bold">Nombre y celular</span> solo pueden modificarse desde el panel de administración. Contactá al local si necesitás actualizarlos.
                  </p>
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Nombre Completo</label>
                {isEditing && !isCustomer ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2 outline-none focus:border-primary font-semibold"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-on-surface">{user?.name || 'No especificado'}</p>
                  </div>
                )}
              </div>

              {/* Teléfono */}
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">WhatsApp / Teléfono</label>
                {isEditing && !isCustomer ? (
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2 outline-none focus:border-primary font-semibold"
                  />
                ) : (
                  <p className="font-semibold text-on-surface">{user?.phone || 'No especificado'}</p>
                )}
              </div>

              {/* Dirección — selector de mapa */}
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Dirección Predeterminada</label>
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Botón de mapa */}
                    {addressCoords ? (
                      <div className="bg-green-50/60 border border-green-200 rounded-2xl p-3 flex justify-between items-center gap-3">
                        <div className="flex gap-2.5 items-center min-w-0">
                          <span className="material-symbols-outlined text-green-600 shrink-0 text-2xl">location_on</span>
                          <div className="min-w-0">
                            <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Ubicación seleccionada</p>
                            <p className="font-bold text-xs text-on-surface truncate leading-tight mt-0.5">{addressLabel}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMapModalOpen(true)}
                          className="bg-white hover:bg-green-50 border border-green-200 text-green-700 font-bold px-3 py-2 rounded-xl text-[10px] transition-all shrink-0"
                        >
                          CAMBIAR
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsMapModalOpen(true)}
                        className="w-full bg-primary/5 hover:bg-primary/10 border border-dashed border-primary/30 text-primary rounded-2xl p-4 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                      >
                        <span className="material-symbols-outlined text-2xl">add_location_alt</span>
                        SELECCIONAR UBICACIÓN EN MAPA
                      </button>
                    )}

                    {/* Campos adicionales solo si se eligió ubicación */}
                    {addressCoords && (
                      <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                        <input
                          type="text"
                          placeholder="Número de casa / Altura / Lote"
                          value={addressHouseNumber}
                          onChange={e => setAddressHouseNumber(e.target.value)}
                          className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2.5 outline-none focus:border-primary font-semibold text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Referencia visual (ej: portón negro, esquina)"
                          value={addressReference}
                          onChange={e => setAddressReference(e.target.value)}
                          className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2.5 outline-none focus:border-primary font-semibold text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Aclaración adicional (opcional)"
                          value={addressNotes}
                          onChange={e => setAddressNotes(e.target.value)}
                          className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2.5 outline-none focus:border-primary text-sm"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="font-medium text-sm text-on-surface-variant">{user?.address || 'No especificada'}</p>
                )}
              </div>

              {isEditing && (
                <button
                  onClick={handleSave}
                  className="w-full bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary/90 transition-all text-xs tracking-wider"
                >
                  GUARDAR CAMBIOS
                </button>
              )}

              {/* Ocultar botón Editar si es cliente (no hay nada editable excepto dirección) */}
              {isAuthenticated && (
                <button
                  onClick={signOutCustomer}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3.5 rounded-xl mt-6 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider border border-red-100"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Cerrar Sesión
                </button>
              )}
            </div>
          </div>

          {/* Sección de Cuenta Corriente (si habilitada) */}
          {currentCustomer?.hasCurrentAccount && (
            <div className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm animate-in zoom-in-95 duration-500">
              <div className="flex items-center gap-3 mb-4 text-primary">
                <span className="material-symbols-outlined text-[28px]">menu_book</span>
                <h2 className="text-lg font-bold text-on-background">Cuenta Corriente</h2>
              </div>

              <div className="bg-surface-container-low rounded-2xl p-4 mb-5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Deuda Pendiente</p>
                <p className={`text-2xl font-black ${currentCustomer.currentDebt > 0 ? 'text-error' : 'text-green-600'}`}>
                  ${currentCustomer.currentDebt.toLocaleString('es-AR')}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setShowCCModal(true)}
                  className="w-full bg-primary/10 text-primary font-bold py-3 rounded-xl hover:bg-primary/20 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                  Revisar cuenta corriente
                </button>

                <button
                  onClick={() => {
                    const res = toggleCurrentAccount(currentCustomer.phone);
                    if (!res.success) setCcError(res.message || 'Error al modificar cuenta');
                  }}
                  className="w-full text-on-surface-variant font-bold py-3 rounded-xl hover:bg-surface-container-high transition-all text-[11px] uppercase tracking-widest"
                >
                  Deshabilitar cuenta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Historial de Pedidos */}
        <div className="md:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-on-background">Historial de Pedidos</h2>

          {user?.orders && user.orders.length > 0 ? (
            <div className="space-y-4">
              {user.orders.map((order) => {
                const isExpanded = expandedOrderId === order.id;

                return (
                  <div key={order.id} className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden transition-all duration-300">
                    {/* Header del Pedido */}
                    <div
                      className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-lowest transition-colors ${isExpanded ? 'bg-surface-container-lowest border-b border-outline-variant/10' : ''}`}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-primary-container/20 text-primary'}`}>
                          <span className="material-symbols-outlined">shopping_bag</span>
                        </div>
                        <div>
                          <p className="font-bold">Pedido #{order.id}</p>
                          <p className="text-on-surface-variant text-sm">{order.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 flex-1">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total</p>
                          <p className="font-bold text-primary">${order.total.toLocaleString('es-AR')}</p>
                        </div>
                        <div className={`px-3 py-1 text-[11px] font-bold rounded-full ${order.status === 'Entregado' ? 'bg-green-100 text-green-700' :
                            order.status === 'En Camino' ? 'bg-purple-100 text-purple-700' :
                              order.status === 'Preparando' ? 'bg-orange-100 text-orange-600' :
                                order.status === 'Cancelado' ? 'bg-red-100 text-red-600' :
                                  'bg-blue-100 text-blue-600'
                          }`}>
                          {order.status}
                        </div>
                        <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${isExpanded ? 'rotate-90 text-primary' : ''}`}>
                          chevron_right
                        </span>
                      </div>
                    </div>

                    {/* Detalle Expandido */}
                    {isExpanded && (
                      <div className="p-6 bg-surface-container-lowest/50 animate-in slide-in-from-top-2 duration-300">
                        <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4">Productos del pedido</h4>
                        <div className="space-y-4">
                          {order.items.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-lg p-1 border border-outline-variant/10">
                                  <img src={item.image} alt="" aria-hidden="true" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{item.name}</p>
                                  <p className="text-[11px] text-on-surface-variant">{item.quantity} x ${(item.price ?? 0).toLocaleString('es-AR')}</p>
                                </div>
                              </div>
                              <p className="text-sm font-bold">${(item.price * item.quantity).toLocaleString('es-AR')}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 pt-6 border-t border-outline-variant/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Entrega en</h4>
                            <div className="flex items-start gap-2">
                              <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
                              <p className="text-xs text-on-surface font-medium">{order.address || 'No especificada'}</p>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Horario</h4>
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                              <p className="text-xs text-on-surface font-medium">{order.deliveryTime || 'Lo antes posible'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-outline-variant/10 space-y-2">
                          <div className="flex justify-between items-center text-sm font-medium">
                            <span className="text-on-surface-variant">Subtotal</span>
                            <span className="text-on-background">${(order.total + (order.discount || 0)).toLocaleString('es-AR')}</span>
                          </div>
                          {order.discount !== undefined && order.discount > 0 && (
                            <div className="flex justify-between items-center text-sm font-medium text-error">
                              <span>Descuento ({order.discountLabel || 'Oferta'})</span>
                              <span>-${(order.discount).toLocaleString('es-AR')}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-outline-variant/5">
                            <span className="text-sm font-bold text-on-surface-variant">Total del Pedido</span>
                            <span className="text-lg font-bold text-primary">${order.total.toLocaleString('es-AR')}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRepeatOrder(order.items)}
                          className="w-full mt-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all text-sm shadow-md flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[20px]">refresh</span>
                          Repetir Pedido
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4">history</span>
              <p className="text-on-surface-variant">Todavía no has realizado ningún pedido.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals para Cuenta Corriente */}
      {showCCModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowCCModal(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                <h3 className="text-xl font-bold">Detalle Cuenta Corriente</h3>
              </div>
              <button onClick={() => setShowCCModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Gasto Histórico (CC)</p>
                  <p className="text-lg font-black text-on-background">${ccOrders.reduce((s, o) => s + o.total, 0).toLocaleString('es-AR')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Deuda Pendiente</p>
                  <p className="text-lg font-black text-error">${(currentCustomer?.currentDebt ?? 0).toLocaleString('es-AR')}</p>
                </div>
              </div>

              <h4 className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest mb-2">Movimientos por día</h4>
              <div className="space-y-3">
                {ccByDate.length > 0 ? ccByDate.map((group, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedCCDate(selectedCCDate === group.date ? null : group.date)}
                    className="bg-white border border-outline-variant/10 rounded-2xl p-4 cursor-pointer hover:border-primary/30 transition-all group"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">{group.date}</p>
                        <p className="text-[10px] text-on-surface-variant">{group.orders.length} {group.orders.length === 1 ? 'operación' : 'operaciones'}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className={`text-sm font-black ${group.isPaid ? 'text-green-600' : 'text-error'}`}>
                            ${group.total.toLocaleString('es-AR')}
                          </p>
                          <p className={`text-[9px] font-bold uppercase ${group.isPaid ? 'text-green-600' : 'text-error'}`}>
                            {group.isPaid ? 'Saldado' : 'Pendiente'}
                          </p>
                        </div>
                        <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${selectedCCDate === group.date ? 'rotate-90' : ''}`}>chevron_right</span>
                      </div>
                    </div>

                    {selectedCCDate === group.date && (
                      <div className="mt-4 pt-4 border-t border-outline-variant/5 space-y-3 animate-in slide-in-from-top-2 duration-300">
                        {group.orders.map(order => (
                          <div key={order.id} className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/10">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] font-black text-primary">#{order.id}</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${order.paymentStatus === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {order.paymentStatus === 'Pagado' ? 'SALDADO' : (order.paidAmount && order.paidAmount > 0 ? 'PAGO PARCIAL' : 'PENDIENTE')}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {order.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span className="text-on-surface-variant">{item.quantity}x {item.name}</span>
                                  <span className="font-bold">${(item.price * item.quantity).toLocaleString('es-AR')}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 pt-2 border-t border-dashed border-outline-variant/20 flex flex-col items-end">
                              <div className="flex justify-between w-full">
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase">Total Pedido</span>
                                <span className="text-xs font-bold text-on-background">${order.total.toLocaleString('es-AR')}</span>
                              </div>
                              {order.paidAmount !== undefined && order.paidAmount > 0 && order.paymentStatus !== 'Pagado' && (
                                  <>
                                    <div className="flex justify-between w-full mt-1">
                                      <span className="text-[10px] font-bold text-green-600 uppercase">Abonado</span>
                                      <span className="text-xs font-bold text-green-600">-${order.paidAmount.toLocaleString('es-AR')}</span>
                                    </div>
                                    <div className="flex justify-between w-full mt-1 pt-1 border-t border-outline-variant/5">
                                      <span className="text-[10px] font-black text-error uppercase">Resta Pagar</span>
                                      <span className="text-sm font-black text-error">${(order.total - order.paidAmount).toLocaleString('es-AR')}</span>
                                    </div>
                                  </>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-on-surface-variant">No hay movimientos en tu cuenta corriente.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-surface-container-low border-t border-outline-variant/10">
              <button
                onClick={() => setShowCCModal(false)}
                className="w-full bg-on-surface text-white font-bold py-3.5 rounded-2xl hover:bg-on-surface/90 transition-all shadow-md"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Error Cuenta Corriente */}
      {ccError && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCcError(null)} />
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative z-10 p-8 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-[32px]">warning</span>
            </div>
            <h3 className="text-xl font-black text-on-background mb-2">Acción Denegada</h3>
            <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">{ccError}</p>
            <button
              onClick={() => setCcError(null)}
              className="w-full bg-on-surface text-white font-bold py-4 rounded-2xl shadow-lg shadow-black/10 transition-transform active:scale-[0.98]"
            >
              Entendido
            </button>
          </div>
        </div>,
        document.body
      )}
      {/* Modal del Mapa de Dirección */}
      {isMapModalOpen && (
        <MapSelector
          initialLat={addressCoords?.lat}
          initialLng={addressCoords?.lng}
          onClose={() => setIsMapModalOpen(false)}
          onLocationSelected={handleLocationSelected}
        />
      )}
    </div>
  );
};
