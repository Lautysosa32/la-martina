import React, { useState, useEffect } from 'react';
import { useAdmin, HeroBanner, defaultHeroBanners, DeliveryTimeSlot, defaultDeliveryTimeSlots } from '../../context/AdminContext';
import type { AutoCashCloseConfig, FiscalBusinessConfig } from '../../context/AdminContext';
import { billingService, FiscalStatusResult } from '../../services/billing.service';
import { useScrollLock } from '../../utils/useScrollLock';
import { fetchSetting, saveSetting } from '../../services/admin.service';
import { ReplenishmentConfig, defaultReplenishmentConfig, validateReplenishmentConfig } from '../../utils/replenishment';
import { useProductStore } from '../../stores/useProductStore';
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  cuenta_corriente: 'Cuenta Corriente',
};

export const Settings: React.FC = () => {
  const {
    ticketConfig, updateTicketConfig,
    fiscalConfig, updateFiscalConfig,
    currentAccountConfig, updateCurrentAccountConfig,
    storeStatus, updateStoreStatus,
    autoCashCloseConfig, updateAutoCashCloseConfig,
    generalConfig, updateGeneralConfig,
    heroBanners, addHeroBanner, updateHeroBanner, deleteHeroBanner, reorderHeroBanners, toggleHeroBannerActive,
    deliveryTimeSlots, updateDeliveryTimeSlots
  } = useAdmin();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'ticket' | 'general' | 'banners' | 'clients' | 'fiscal' | 'inventory'>('general');

  // Hero Banners management state
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [bannerForm, setBannerForm] = useState<Omit<HeroBanner, 'id' | 'order'>>({
    imageUrl: '',
    title: '',
    subtitle: '',
    badge: '',
    linkUrl: '',
    linkLabel: '',
    linkExternal: false,
    active: true
  });
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Delivery Time Slots management state (Clientes)
  const [slotsForm, setSlotsForm] = useState<DeliveryTimeSlot[]>(deliveryTimeSlots || defaultDeliveryTimeSlots);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState<{
    label: string;
    sub: string;
    icon: string;
    enabled: boolean;
    mode: 'asap' | 'today' | 'tomorrow';
    cutoffTime: string;
    startTime: string;
    endTime: string;
    freeShipping: boolean;
  }>({
    label: '',
    sub: '',
    icon: 'schedule',
    enabled: true,
    mode: 'today',
    cutoffTime: '13:30',
    startTime: '09:00',
    endTime: '21:00',
    freeShipping: false
  });

  useScrollLock(isBannerModalOpen || isSlotModalOpen);

  // Local state mirrors config for form editing
  const [form, setForm] = useState({ ...ticketConfig });
  const [fiscalForm, setFiscalForm] = useState<FiscalBusinessConfig>({ ...fiscalConfig });
  const [arcaStatus, setArcaStatus] = useState<FiscalStatusResult | null>(null);
  const [isLoadingArcaStatus, setIsLoadingArcaStatus] = useState(false);
  const [arcaStatusError, setArcaStatusError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ ...currentAccountConfig });
  const [storeForm, setStoreForm] = useState({ ...storeStatus });
  const [autoCloseForm, setAutoCloseForm] = useState<AutoCashCloseConfig>({ enabled: false, time: '22:00' });
  const [generalForm, setGeneralForm] = useState({ ...generalConfig });
  interface ReplenishmentFormState {
    enabled: boolean;
    historyWeeks: string;
    coverageDays: string;
    anticipationDays: string;
    marginLow: string;
    marginMedium: string;
    marginHigh: string;
    thresholdComplete: string;
    thresholdPartial: string;
  }
  const [replenishmentForm, setReplenishmentForm] = useState<ReplenishmentFormState>({
    enabled: defaultReplenishmentConfig.enabled,
    historyWeeks: String(defaultReplenishmentConfig.historyWeeks),
    coverageDays: String(defaultReplenishmentConfig.coverageDays),
    anticipationDays: String(defaultReplenishmentConfig.anticipationDays),
    marginLow: String(defaultReplenishmentConfig.marginLow),
    marginMedium: String(defaultReplenishmentConfig.marginMedium),
    marginHigh: String(defaultReplenishmentConfig.marginHigh),
    thresholdComplete: String(defaultReplenishmentConfig.thresholdComplete),
    thresholdPartial: String(defaultReplenishmentConfig.thresholdPartial),
  });

  const handleReplenishmentChange = (key: keyof Omit<ReplenishmentFormState, 'enabled'>, rawValue: string) => {
    // Permitir campo vacío temporal o solo dígitos positivos
    if (rawValue === '' || /^\d+$/.test(rawValue)) {
      setReplenishmentForm(prev => ({
        ...prev,
        [key]: rawValue
      }));
    }
  };

  const handleReplenishmentBlur = (key: keyof Omit<ReplenishmentFormState, 'enabled'>, defaultVal: number) => {
    setReplenishmentForm(prev => {
      const current = prev[key];
      if (current === '' || isNaN(Number(current))) {
        return { ...prev, [key]: String(defaultVal) };
      }
      return { ...prev, [key]: String(parseInt(current, 10)) };
    });
  };
  const [simulatedKm, setSimulatedKm] = useState<number>(3);

  // Certificados ARCA
  const [crtFile, setCrtFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [isUploadingCerts, setIsUploadingCerts] = useState(false);
  const [certUploadError, setCertUploadError] = useState<string | null>(null);
  const [certUploadSuccess, setCertUploadSuccess] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [isArcaGuideOpen, setIsArcaGuideOpen] = useState(false);

  const handleCopyCommand = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => {
      setCopiedCommand(null);
    }, 2500);
  };

  const handleUploadCertificates = async () => {
    if (!crtFile || !keyFile) {
      setCertUploadError('Debés seleccionar ambos archivos (.crt y .key)');
      return;
    }
    setIsUploadingCerts(true);
    setCertUploadError(null);
    setCertUploadSuccess(null);
    try {
      const crtContent = await crtFile.text();
      const keyContent = await keyFile.text();
      const res = await billingService.uploadCertificates(crtContent, keyContent, fiscalForm.environment === 'production');
      if (res.success) {
        setCertUploadSuccess(res.message || 'Certificados subidos con éxito');
        setCrtFile(null);
        setKeyFile(null);
        checkArcaConnection();
      } else {
        setCertUploadError(res.error || 'Error al subir certificados');
      }
    } catch (err: any) {
      setCertUploadError('Error de lectura: ' + err.message);
    } finally {
      setIsUploadingCerts(false);
    }
  };

  const checkArcaConnection = async () => {
    setIsLoadingArcaStatus(true);
    setArcaStatusError(null);
    try {
      const status = await billingService.checkStatus();
      setArcaStatus(status);
    } catch (err: any) {
      setArcaStatusError(err?.response?.data?.error || err.message || 'No se pudo conectar con el servidor backend de ARCA');
    } finally {
      setIsLoadingArcaStatus(false);
    }
  };

  const [newBlockedPhone, setNewBlockedPhone] = useState('');
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    tienda: true,
    cobertura: true,
    horarios: true,
    cuentas: true,
    seguridad: true,
    cierre: true,
    notificaciones: true,
    inventory: true
  });

  const togglePanel = (key: string) => {
    setOpenPanels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    setOpenPanels({
      tienda: true,
      cobertura: true,
      horarios: true,
      cuentas: true,
      seguridad: true,
      cierre: true,
      notificaciones: true
    });
  };

  const collapseAll = () => {
    setOpenPanels({});
  };

  useEffect(() => {
    setForm(ticketConfig);
  }, [ticketConfig]);

  useEffect(() => {
    fetchSetting<ReplenishmentConfig>('inventory_replenishment_config', defaultReplenishmentConfig)
      .then(conf => {
        setReplenishmentForm({
          enabled: conf.enabled,
          historyWeeks: String(conf.historyWeeks),
          coverageDays: String(conf.coverageDays),
          anticipationDays: String(conf.anticipationDays),
          marginLow: String(conf.marginLow),
          marginMedium: String(conf.marginMedium),
          marginHigh: String(conf.marginHigh),
          thresholdComplete: String(conf.thresholdComplete),
          thresholdPartial: String(conf.thresholdPartial),
        });
      })
      .catch(err => console.error('Error fetching replenishment config', err));
  }, []);

  useEffect(() => {
    if (fiscalConfig) {
      setFiscalForm(fiscalConfig);
    }
  }, [fiscalConfig]);

  useEffect(() => {
    if (activeSection === 'fiscal' && !arcaStatus && !isLoadingArcaStatus) {
      checkArcaConnection();
    }
  }, [activeSection]);

  useEffect(() => {
    setAccountForm(currentAccountConfig);
  }, [currentAccountConfig]);

  useEffect(() => {
    setStoreForm(storeStatus);
  }, [storeStatus]);

  useEffect(() => {
    setAutoCloseForm(autoCashCloseConfig);
  }, [autoCashCloseConfig]);

  useEffect(() => {
    setGeneralForm(generalConfig);
  }, [generalConfig]);

  useEffect(() => {
    if (deliveryTimeSlots && deliveryTimeSlots.length > 0) {
      setSlotsForm(deliveryTimeSlots);
    }
  }, [deliveryTimeSlots]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (activeSection === 'ticket') {
        await updateTicketConfig(form);
      } else if (activeSection === 'fiscal') {
        await updateFiscalConfig(fiscalForm);
      } else if (activeSection === 'general') {
        await Promise.all([
          updateCurrentAccountConfig(accountForm),
          updateAutoCashCloseConfig(autoCloseForm),
          updateGeneralConfig(generalForm)
        ]);
      } else if (activeSection === 'clients') {
        await Promise.all([
          updateStoreStatus(storeForm),
          updateGeneralConfig(generalForm),
          updateDeliveryTimeSlots(slotsForm)
        ]);
      } else if (activeSection === 'inventory') {
        const parsedConfig: ReplenishmentConfig = {
          enabled: Boolean(replenishmentForm.enabled),
          historyWeeks: replenishmentForm.historyWeeks === '' ? NaN : Number(replenishmentForm.historyWeeks),
          coverageDays: replenishmentForm.coverageDays === '' ? NaN : Number(replenishmentForm.coverageDays),
          anticipationDays: replenishmentForm.anticipationDays === '' ? NaN : Number(replenishmentForm.anticipationDays),
          marginLow: replenishmentForm.marginLow === '' ? NaN : Number(replenishmentForm.marginLow),
          marginMedium: replenishmentForm.marginMedium === '' ? NaN : Number(replenishmentForm.marginMedium),
          marginHigh: replenishmentForm.marginHigh === '' ? NaN : Number(replenishmentForm.marginHigh),
          thresholdComplete: replenishmentForm.thresholdComplete === '' ? NaN : Number(replenishmentForm.thresholdComplete),
          thresholdPartial: replenishmentForm.thresholdPartial === '' ? NaN : Number(replenishmentForm.thresholdPartial),
        };

        if (
          isNaN(parsedConfig.historyWeeks) ||
          isNaN(parsedConfig.coverageDays) ||
          isNaN(parsedConfig.anticipationDays) ||
          isNaN(parsedConfig.marginLow) ||
          isNaN(parsedConfig.marginMedium) ||
          isNaN(parsedConfig.marginHigh) ||
          isNaN(parsedConfig.thresholdComplete) ||
          isNaN(parsedConfig.thresholdPartial)
        ) {
          throw new Error('Todos los campos deben contener un valor numérico válido.');
        }

        const errorMsg = validateReplenishmentConfig(parsedConfig);
        if (errorMsg) throw new Error(errorMsg);
        await saveSetting('inventory_replenishment_config', parsedConfig);
        useProductStore.getState().setReplenishmentConfig(parsedConfig);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error('Error al guardar configuración:', err);
      setSaveError(err?.message || 'Error al persistir la configuración en la base de datos');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (activeSection === 'ticket') {
      const defaults = {
        blankLinesTop: 0,
        blankLinesBottom: 2,
        headerText: 'Martina Supermercado',
        businessName: 'Minimarket & Supermercado',
        businessAddress: 'La Paz, Mendoza',
        businessPhone: '',
        businessCuit: '',
        footerMessage: '¡Gracias por su compra!',
        showLogo: false
      };
      setForm(defaults);
      updateTicketConfig(defaults);
    } else if (activeSection === 'fiscal') {
      const defaultFiscal: FiscalBusinessConfig = {
        businessName: 'LA MARTINA',
        fantasyName: 'Supermercado La Martina',
        cuit: '',
        taxCondition: 'Responsable Inscripto',
        grossIncome: '',
        startDate: '',
        fiscalAddress: '',
        postalCode: '',
        phone: '',
        defaultPointOfSale: 1
      };
      setFiscalForm(defaultFiscal);
      updateFiscalConfig(defaultFiscal);
    } else if (activeSection === 'general') {
      const defaultAccountConfig = {
        enabled: true,
        maxDebtAmount: 50000,
        maxDebtDays: 35,
        warnOnAmountLimit: true,
        warnOnTimeLimit: true,
        allowOverride: true,
      };
      setAccountForm(defaultAccountConfig);
      updateCurrentAccountConfig(defaultAccountConfig);

      const defaultAutoClose = { enabled: false, time: '22:00' };
      setAutoCloseForm(defaultAutoClose);
      updateAutoCashCloseConfig(defaultAutoClose);

      const defaultGeneralConfig = {
        suspendEmployeeNotifications: false,
        deliveryRadiusKm: 5,
        storeLat: -33.459009,
        storeLng: -67.551826,
        blockedPhones: [],
        shippingBaseCost: 1000,
        shippingCostPerKm: 400,
        freeShippingMinAmount: 0
      };
      setGeneralForm(defaultGeneralConfig);
      updateGeneralConfig(defaultGeneralConfig);
    } else if (activeSection === 'clients') {
      const defaultStoreStatus = {
        onlineSalesPaused: false,
        pauseReason: '',
        pausedAt: null,
        pausedBy: null,
        resumeMessage: '',
        allowBrowsingWhilePaused: true
      };
      setStoreForm(defaultStoreStatus);
      updateStoreStatus(defaultStoreStatus);

      const defaultShippingConfig = {
        ...generalForm,
        deliveryRadiusKm: 5,
        shippingBaseCost: 1000,
        shippingCostPerKm: 400,
        freeShippingMinAmount: 0
      };
      setGeneralForm(defaultShippingConfig);
      updateGeneralConfig(defaultShippingConfig);

      setSlotsForm(defaultDeliveryTimeSlots);
      updateDeliveryTimeSlots(defaultDeliveryTimeSlots);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Handlers para Franjas Horarias de Clientes
  const handleOpenCreateSlot = () => {
    setEditingSlotId(null);
    setSlotForm({
      label: '',
      sub: '',
      icon: 'schedule',
      enabled: true,
      mode: 'today',
      cutoffTime: '13:30',
      startTime: '09:00',
      endTime: '21:00',
      freeShipping: false
    });
    setIsSlotModalOpen(true);
  };

  const handleOpenEditSlot = (slot: DeliveryTimeSlot) => {
    setEditingSlotId(slot.id);
    let mode: 'asap' | 'today' | 'tomorrow' = 'today';
    if (slot.isTomorrow) mode = 'tomorrow';
    else if (!slot.cutoffTime && (slot.id === 'asap' || slot.endHour === undefined || slot.endHour >= 24)) mode = 'asap';

    let cutoff = slot.cutoffTime || '';
    if (!cutoff && slot.endHour !== undefined && slot.endHour < 24) {
      cutoff = `${String(slot.endHour).padStart(2, '0')}:${String(slot.endMin ?? 0).padStart(2, '0')}`;
    }

    setSlotForm({
      label: slot.label,
      sub: slot.sub,
      icon: slot.icon || 'schedule',
      enabled: slot.enabled !== false,
      mode,
      cutoffTime: cutoff || '13:30',
      startTime: slot.startTime || '09:00',
      endTime: slot.endTime || '21:00',
      freeShipping: Boolean(slot.freeShipping)
    });
    setIsSlotModalOpen(true);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotForm.label.trim()) {
      alert('Por favor ingresá un nombre o etiqueta para la opción de horario.');
      return;
    }

    const updatedSlot: DeliveryTimeSlot = {
      id: editingSlotId || `slot_${Date.now()}`,
      label: slotForm.label.trim(),
      sub: slotForm.sub.trim(),
      icon: slotForm.icon.trim() || 'schedule',
      enabled: slotForm.enabled,
      isTomorrow: slotForm.mode === 'tomorrow',
      cutoffTime: slotForm.mode === 'today' ? slotForm.cutoffTime : undefined,
      startTime: slotForm.mode === 'asap' ? slotForm.startTime : undefined,
      endTime: slotForm.mode === 'asap' ? slotForm.endTime : undefined,
      freeShipping: slotForm.freeShipping
    };

    let newSlots: DeliveryTimeSlot[];
    if (editingSlotId) {
      newSlots = slotsForm.map(s => s.id === editingSlotId ? updatedSlot : s);
    } else {
      newSlots = [...slotsForm, updatedSlot];
    }
    setSlotsForm(newSlots);
    updateDeliveryTimeSlots(newSlots);
    setIsSlotModalOpen(false);
    setBannerNotice(editingSlotId ? 'Horario de entrega actualizado' : 'Nuevo horario de entrega agregado');
    setTimeout(() => setBannerNotice(null), 2500);
  };

  const handleToggleSlotActive = (id: string) => {
    const next = slotsForm.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setSlotsForm(next);
    updateDeliveryTimeSlots(next);
  };

  const handleDeleteSlot = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este horario de entrega?')) {
      const next = slotsForm.filter(s => s.id !== id);
      setSlotsForm(next);
      updateDeliveryTimeSlots(next);
      setBannerNotice('Horario eliminado');
      setTimeout(() => setBannerNotice(null), 2500);
    }
  };

  const handleMoveSlot = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slotsForm.length) return;
    const next = [...slotsForm];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setSlotsForm(next);
    updateDeliveryTimeSlots(next);
  };

  const handleResetSlots = () => {
    if (window.confirm('¿Deseas restablecer los horarios a la configuración predeterminada?')) {
      setSlotsForm(defaultDeliveryTimeSlots);
      updateDeliveryTimeSlots(defaultDeliveryTimeSlots);
      setBannerNotice('Horarios de entrega restaurados por defecto');
      setTimeout(() => setBannerNotice(null), 2500);
    }
  };

  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleOpenCreateBanner = () => {
    setEditingBannerId(null);
    setBannerForm({
      imageUrl: '',
      title: '',
      subtitle: '',
      badge: '',
      linkUrl: '',
      linkLabel: '',
      linkExternal: false,
      active: true
    });
    setIsBannerModalOpen(true);
  };

  const handleOpenEditBanner = (banner: HeroBanner) => {
    setEditingBannerId(banner.id);
    setBannerForm({
      imageUrl: banner.imageUrl,
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      badge: banner.badge || '',
      linkUrl: banner.linkUrl || '',
      linkLabel: banner.linkLabel || '',
      linkExternal: Boolean(banner.linkExternal),
      active: banner.active
    });
    setIsBannerModalOpen(true);
  };

  const handleSaveBanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.imageUrl.trim()) {
      alert('Por favor ingresá la URL de la imagen para el banner.');
      return;
    }

    if (editingBannerId) {
      updateHeroBanner(editingBannerId, {
        imageUrl: bannerForm.imageUrl.trim(),
        title: bannerForm.title?.trim() || undefined,
        subtitle: bannerForm.subtitle?.trim() || undefined,
        badge: bannerForm.badge?.trim() || undefined,
        linkUrl: bannerForm.linkUrl?.trim() || undefined,
        linkLabel: bannerForm.linkLabel?.trim() || undefined,
        linkExternal: bannerForm.linkExternal,
        active: bannerForm.active
      });
      setBannerNotice('Banner actualizado con éxito');
    } else {
      addHeroBanner({
        imageUrl: bannerForm.imageUrl.trim(),
        title: bannerForm.title?.trim() || undefined,
        subtitle: bannerForm.subtitle?.trim() || undefined,
        badge: bannerForm.badge?.trim() || undefined,
        linkUrl: bannerForm.linkUrl?.trim() || undefined,
        linkLabel: bannerForm.linkLabel?.trim() || undefined,
        linkExternal: bannerForm.linkExternal,
        active: bannerForm.active
      });
      setBannerNotice('Nuevo banner agregado con éxito');
    }

    setIsBannerModalOpen(false);
    setTimeout(() => setBannerNotice(null), 3000);
  };

  const handleDeleteBanner = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este banner del carrusel?')) {
      deleteHeroBanner(id);
      setBannerNotice('Banner eliminado');
      setTimeout(() => setBannerNotice(null), 3000);
    }
  };

  const handleMoveBanner = (index: number, direction: 'up' | 'down') => {
    const list = [...(heroBanners && heroBanners.length > 0 ? heroBanners : defaultHeroBanners)];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    reorderHeroBanners(list);
    setBannerNotice('Orden de banners actualizado');
    setTimeout(() => setBannerNotice(null), 2500);
  };

  const handleResetBanners = () => {
    if (window.confirm('¿Deseas restaurar los banners a su configuración predeterminada?')) {
      reorderHeroBanners(defaultHeroBanners);
      setBannerNotice('Banners restablecidos por defecto');
      setTimeout(() => setBannerNotice(null), 2500);
    }
  };

  // Mock ticket for preview
  const mockItems = [
    { name: 'Aceite Oliva Extra Virgen 500ml', quantity: 1, price: 8500, finalPrice: 8500 },
    { name: 'Arroz Integral 1kg', quantity: 2, price: 2400, finalPrice: 2400 },
    { name: 'Gaseosa Cola 354ml', quantity: 3, price: 850, finalPrice: 720, offerLabel: '3x2' },
  ];
  const mockSubtotal = mockItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const mockTotal = mockItems.reduce((s, i) => s + i.finalPrice * i.quantity, 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-700 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {saved && (
          <div className="bg-green-100 border border-green-200 text-green-800 px-6 py-3 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top duration-300 shadow-sm">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            <p className="font-bold text-sm">Configuración guardada correctamente</p>
          </div>
        )}
        {bannerNotice && (
          <div className="bg-primary/10 border border-primary/20 text-primary px-6 py-3 rounded-2xl flex items-center gap-2 animate-in slide-in-from-top duration-300 shadow-sm">
            <span className="material-symbols-outlined text-primary">info</span>
            <p className="font-bold text-sm">{bannerNotice}</p>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSection('general')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'general' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          General
        </button>
        <button
          onClick={() => setActiveSection('clients')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'clients' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">storefront</span>
          Clientes / Tienda Online
        </button>
        <button
          onClick={() => setActiveSection('ticket')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'ticket' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          Personalizar Ticket
        </button>
        <button
          onClick={() => setActiveSection('fiscal')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'fiscal' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">account_balance</span>
          Facturación Fiscal (ARCA)
        </button>
        <button
          onClick={() => setActiveSection('banners')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'banners' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">view_carousel</span>
          Banners del Home
        </button>
        <button
          onClick={() => setActiveSection('inventory')}
          className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 ${activeSection === 'inventory' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-lowest'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
          Reposición de Inventario
        </button>
      </div>

      {activeSection === 'fiscal' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header Card con Estado de ARCA */}
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[28px]">account_balance</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-neutral-900">Configuración Fiscal y Facturación Electrónica</h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${arcaStatus?.config?.environment === 'production'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                      }`}>
                      {arcaStatus?.config?.environment === 'production' ? 'PRODUCCIÓN (OFICIAL)' : 'MODO HOMOLOGACIÓN (TESTING)'}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500 mt-1">
                    Gestioná los datos fiscales del emisor, punto de venta y conexión legal con ARCA para facturación con CAE.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto self-stretch sm:self-center">
                <button
                  type="button"
                  onClick={checkArcaConnection}
                  disabled={isLoadingArcaStatus}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-outline-variant/20 hover:bg-neutral-50 font-bold text-xs flex items-center justify-center gap-2 text-neutral-700 transition-all disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-[18px] ${isLoadingArcaStatus ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  {isLoadingArcaStatus ? 'Comprobando...' : 'Verificar ARCA'}
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isSaving ? 'sync' : 'save'}
                  </span>
                  {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            </div>

            {/* Diagnóstico rápido de ARCA */}
            {arcaStatus && (
              <div className="mt-6 pt-6 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50">
                  <span className={`w-3 h-3 rounded-full ${arcaStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <p className="text-[11px] font-bold text-neutral-500 uppercase">Servidores ARCA</p>
                    <p className="text-sm font-black text-neutral-800">{arcaStatus.connected ? 'En Línea / Operativo' : 'Sin Conexión'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50">
                  <span className={`w-3 h-3 rounded-full ${arcaStatus.certificate?.isValid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <div>
                    <p className="text-[11px] font-bold text-neutral-500 uppercase">Certificado Digital</p>
                    <p className="text-sm font-black text-neutral-800">
                      {arcaStatus.certificate?.isValid ? `Válido (${arcaStatus.certificate?.daysRemaining ?? '?'} días)` : 'No válido / Faltante'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50">
                  <span className="material-symbols-outlined text-neutral-400 text-[20px]">badge</span>
                  <div>
                    <p className="text-[11px] font-bold text-neutral-500 uppercase">CUIT Autorizado</p>
                    <p className="text-sm font-mono font-black text-neutral-800">{fiscalForm.cuit || arcaStatus.config?.cuit || 'Sin CUIT'}</p>
                  </div>
                </div>
              </div>
            )}

            {arcaStatusError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{arcaStatusError} (Asegurate de que el backend local esté ejecutándose en la PC).</span>
              </div>
            )}
          </div>

          {/* Formulario Principal de Datos Fiscales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Columna 1: Datos de Identificación Legal */}
            <div className="space-y-6">
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[20px]">domain</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Identificación de la Empresa</h3>
                      <p className="text-xs text-on-surface-variant">Datos formales registrados en la constancia de CUIT</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Razón Social (Titular o Sociedad) *
                    </label>
                    <input
                      type="text"
                      value={fiscalForm.businessName}
                      onChange={e => setFiscalForm(p => ({ ...p, businessName: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all uppercase"
                      placeholder="MARTINA SUPERMERCADO S.R.L."
                    />
                    <p className="text-[11px] text-neutral-400 mt-1">Nombre legal tal cual figura en ARCA / AFIP.</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Nombre de Fantasía (Comercio)
                    </label>
                    <input
                      type="text"
                      value={fiscalForm.fantasyName}
                      onChange={e => setFiscalForm(p => ({ ...p, fantasyName: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="Supermercado La Martina"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        CUIT del Emisor *
                      </label>
                      <input
                        type="text"
                        value={fiscalForm.cuit}
                        onChange={e => setFiscalForm(p => ({ ...p, cuit: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-mono font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="30718501234"
                        maxLength={11}
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">11 dígitos sin guiones ni espacios.</p>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Condición frente al IVA *
                      </label>
                      <select
                        value={fiscalForm.taxCondition}
                        onChange={e => setFiscalForm(p => ({ ...p, taxCondition: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      >
                        <option value="Responsable Inscripto">Responsable Inscripto</option>
                        <option value="Monotributo">Monotributo</option>
                        <option value="Exento">IVA Exento</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Parámetros de Facturación Electrónica */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[20px]">point_of_sale</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Punto de Venta Fiscal</h3>
                      <p className="text-xs text-on-surface-variant">Punto de venta asignado en ARCA para facturación electrónica</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Número de Punto de Venta (PV) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={fiscalForm.defaultPointOfSale}
                      onChange={e => setFiscalForm(p => ({ ...p, defaultPointOfSale: parseInt(e.target.value, 10) || 1 }))}
                      className="w-full sm:w-48 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-mono font-bold text-lg outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    />
                    <p className="text-xs text-neutral-500 mt-2">
                      Este número debe coincidir con el punto de venta que diste de alta en ARCA bajo la modalidad <span className="font-bold text-neutral-800">"Web Services"</span>.
                    </p>
                  </div>

                  <div className="border-t border-outline-variant/10 pt-4 mt-4">
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Entorno de Facturación *
                    </label>
                    <select
                      value={fiscalForm.environment || 'testing'}
                      onChange={e => setFiscalForm(p => ({ ...p, environment: e.target.value as 'testing' | 'production' }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all mb-4"
                    >
                      <option value="testing">Homologación (Testing / Pruebas)</option>
                      <option value="production">Producción (Oficial / Validez Legal)</option>
                    </select>

                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-amber-900 text-xs space-y-4">
                      <div className="flex items-center gap-2 font-bold">
                        <span className="material-symbols-outlined text-[18px] text-amber-700">admin_panel_settings</span>
                        Subir Certificados Digitales ARCA
                      </div>
                      <p className="leading-relaxed">
                        Seleccioná los archivos de certificado y clave privada correspondientes al entorno actual ({fiscalForm.environment === 'production' ? 'Producción' : 'Homologación'}).
                      </p>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold mb-1">Certificado (.crt)</label>
                          <input type="file" accept=".crt" onChange={e => setCrtFile(e.target.files?.[0] || null)} className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold mb-1">Clave Privada (.key)</label>
                          <input type="file" accept=".key" onChange={e => setKeyFile(e.target.files?.[0] || null)} className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200" />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleUploadCertificates}
                        disabled={isUploadingCerts || !crtFile || !keyFile}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 transition-colors"
                      >
                        {isUploadingCerts ? 'Subiendo...' : 'Subir Certificados'}
                      </button>

                      {certUploadError && <p className="text-rose-600 font-bold mt-2">{certUploadError}</p>}
                      {certUploadSuccess && <p className="text-emerald-600 font-bold mt-2">{certUploadSuccess}</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna 2: Domicilio y Datos Impositivos Provinciales */}
            <div className="space-y-6">
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg">Domicilio y Datos Fiscales</h3>
                      <p className="text-xs text-on-surface-variant">Información impresa en tickets y facturas PDF reglamentarias</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Domicilio Fiscal Declarado *
                    </label>
                    <input
                      type="text"
                      value={fiscalForm.fiscalAddress}
                      onChange={e => setFiscalForm(p => ({ ...p, fiscalAddress: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="Av. Libertador 1234, San Luis, Argentina"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Código Postal
                      </label>
                      <input
                        type="text"
                        value={fiscalForm.postalCode}
                        onChange={e => setFiscalForm(p => ({ ...p, postalCode: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="5700"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Teléfono de Contacto Fiscal
                      </label>
                      <input
                        type="text"
                        value={fiscalForm.phone}
                        onChange={e => setFiscalForm(p => ({ ...p, phone: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="(0266) 442-1234"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Nº de Ingresos Brutos (IIBB) *
                      </label>
                      <input
                        type="text"
                        value={fiscalForm.grossIncome}
                        onChange={e => setFiscalForm(p => ({ ...p, grossIncome: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-mono font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="901-123456-7"
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">Nº provincial o Convenio Multilateral.</p>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Inicio de Actividades *
                      </label>
                      <input
                        type="text"
                        value={fiscalForm.startDate}
                        onChange={e => setFiscalForm(p => ({ ...p, startDate: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="01/01/2024"
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">Formato DD/MM/AAAA.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vista Previa de la Cabecera Fiscal */}
              <div className="bg-neutral-900 text-white rounded-[2rem] p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">preview</span>
                    <h4 className="font-black text-sm uppercase tracking-wider">Vista Previa Cabecera Fiscal</h4>
                  </div>
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">Tique Fiscal Real</span>
                </div>

                <div className="bg-black/40 rounded-xl p-4 font-mono text-xs space-y-1 text-neutral-300">
                  <p className="font-bold text-white text-sm uppercase">{fiscalForm.fantasyName || 'SUPERMERCADO'}</p>
                  <p className="text-[11px] text-neutral-400">De: {fiscalForm.businessName || 'RAZÓN SOCIAL'}</p>
                  <div className="flex justify-between text-[11px] pt-1">
                    <span>CUIT: {fiscalForm.cuit || '00-00000000-0'}</span>
                    <span className="font-bold text-white">IVA: {fiscalForm.taxCondition === 'Responsable Inscripto' ? 'RI' : fiscalForm.taxCondition}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Ing.Br: {fiscalForm.grossIncome || '---'}</span>
                    <span>Fec.I.Act: {fiscalForm.startDate || '---'}</span>
                  </div>
                  <p className="text-[11px]">{fiscalForm.fiscalAddress || 'Domicilio Fiscal'}</p>
                  {fiscalForm.phone && <p className="text-[11px]">Tel: {fiscalForm.phone}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Acciones / Guardar Inferior */}
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[22px]">verified</span>
              </div>
              <div>
                <p className="font-black text-sm text-neutral-900">¿Terminaste de configurar tus datos fiscales?</p>
                <p className="text-xs text-neutral-500">Guardá para que se apliquen a todos los comprobantes, tickets térmicos y facturas ARCA.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="w-full sm:w-auto bg-surface-container-low border border-outline-variant/10 font-bold px-6 py-3.5 rounded-2xl text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto bg-primary text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">{isSaving ? 'sync' : 'save'}</span>
                {isSaving ? 'Guardando...' : 'Guardar Configuración Fiscal'}
              </button>
            </div>
          </div>

          {/* Guía Completa Paso a Paso para ARCA (Desplegable) */}
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden mt-6 transition-all">
            {/* Cabecera Desplegable */}
            <div
              onClick={() => setIsArcaGuideOpen(prev => !prev)}
              className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-lowest/70 transition-colors select-none"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                  <span className="material-symbols-outlined text-[28px]">verified_user</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-lg sm:text-xl text-neutral-900">
                      🔐 Cómo obtener el certificado .CRT y la clave .KEY de ARCA
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                      12 pasos
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Instructivo oficial para generar la firma digital con OpenSSL y habilitar la facturación electrónica oficial en La Martina.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                {/* Botón enlace al PDF oficial */}
                <a
                  href="https://www.arca.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  <span className="hidden md:inline">Manual Oficial</span> ARCA (PDF)
                  <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                </a>

                {/* Botón de toggle desplegable */}
                <button
                  type="button"
                  aria-expanded={isArcaGuideOpen}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-black rounded-xl text-xs transition-all"
                >
                  <span>{isArcaGuideOpen ? 'Ocultar Guía' : 'Ver Guía Completa'}</span>
                  <span className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${isArcaGuideOpen ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
              </div>
            </div>

            {/* Contenido Desplegable */}
            {isArcaGuideOpen && (
              <div className="p-6 sm:p-8 pt-0 border-t border-outline-variant/10 space-y-8 animate-fadeIn">
                {/* Sección: Antes de comenzar */}
                <div className="space-y-4 pt-6">
                  <h4 className="font-black text-base text-neutral-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">checklist</span>
                    Antes de comenzar
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 text-xs space-y-2 text-neutral-700">
                      <p className="font-black text-neutral-900 uppercase tracking-wider text-[11px] mb-2">Necesitás tener a mano:</p>
                      <ul className="space-y-1.5 list-disc list-inside">
                        <li><strong className="text-neutral-900">CUIT</strong> del supermercado o titular.</li>
                        <li><strong className="text-neutral-900">Clave Fiscal</strong> con acceso a los servicios de ARCA (Nivel 3).</li>
                        <li>Una computadora con <strong className="text-neutral-900">Windows</strong>.</li>
                        <li>Tener instalado <strong className="text-neutral-900">OpenSSL</strong> (más abajo te explicamos cómo instalarlo si no lo tenés).</li>
                        <li>El <strong className="text-neutral-900">Punto de Venta</strong> de facturación electrónica dado de alta en ARCA.</li>
                        <li>El sistema <strong className="text-neutral-900">La Martina</strong> abierto para cargar posteriormente los archivos.</li>
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-300/60 text-xs space-y-2 text-amber-950">
                      <div className="flex items-center gap-2 font-black text-amber-900 uppercase tracking-wider text-[11px]">
                        <span className="material-symbols-outlined text-[18px] text-amber-700">security</span>
                        Importante sobre la Seguridad
                      </div>
                      <p className="leading-relaxed">
                        El archivo <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono font-bold">.KEY</code> es la <strong>clave privada</strong> del comercio. No se debe enviar por WhatsApp, correo ni compartir con terceros.
                      </p>
                      <p className="leading-relaxed text-amber-900">
                        ARCA indica expresamente que debe conservarse porque es necesario junto con el certificado para firmar digitalmente cada comunicación.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lista detallada de los 12 Pasos */}
                <div className="space-y-6">
                  {/* Paso 1: OpenSSL y Qué hacer si no está instalado */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">1</span>
                      <h5 className="font-black text-neutral-900 text-sm">Instalar y comprobar OpenSSL</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Primero, abrí la consola de comandos de Windows:
                    </p>
                    <div className="bg-neutral-100 px-3 py-2 rounded-xl text-xs font-mono font-bold text-neutral-800">
                      Inicio → PowerShell
                    </div>
                    <p className="text-xs text-neutral-600">Comprobá si OpenSSL ya está instalado ejecutando:</p>
                    <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-3 rounded-xl font-mono text-xs">
                      <span>openssl version</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand('openssl version', 'cmd1')}
                        className="ml-3 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[11px] font-bold transition-colors"
                      >
                        {copiedCommand === 'cmd1' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-500">Si aparece un número de versión (ej: <code>OpenSSL 3.x...</code>), ¡perfecto! Podés continuar al <strong>Paso 2</strong>.</p>

                    {/* Explicación de QUÉ HACER si no está instalado */}
                    <div className="mt-4 p-4 rounded-xl bg-rose-50/80 border border-rose-200/80 space-y-3 text-xs text-rose-950">
                      <div className="flex items-center gap-2 font-black text-rose-900 uppercase tracking-wider text-[11px]">
                        <span className="material-symbols-outlined text-[18px] text-rose-600">help</span>
                        ¿Qué pasa si dice que 'openssl' no se reconoce como un comando?
                      </div>
                      <p className="leading-relaxed">
                        Significa que tu computadora Windows todavía no tiene instalado OpenSSL. Tenés dos formas muy sencillas de instalarlo en 2 minutos:
                      </p>

                      <div className="space-y-2 pt-1">
                        <div className="p-3 bg-white rounded-lg border border-rose-200">
                          <p className="font-bold text-neutral-900 text-xs mb-1">Opción A (La más rápida por comando en PowerShell):</p>
                          <p className="text-neutral-600 text-[11px] mb-2">Copiá y pegá cualquiera de estos comandos en tu PowerShell:</p>
                          <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-2.5 rounded-lg font-mono text-xs mb-2">
                            <span>winget install ShiningLight.OpenSSL</span>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand('winget install ShiningLight.OpenSSL', 'cmd_winget')}
                              className="ml-2 px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-bold"
                            >
                              {copiedCommand === 'cmd_winget' ? '¡Copiado!' : 'Copiar'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-2.5 rounded-lg font-mono text-xs">
                            <span>winget install Git.Git</span>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand('winget install Git.Git', 'cmd_git')}
                              className="ml-2 px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-bold"
                            >
                              {copiedCommand === 'cmd_git' ? '¡Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-rose-200">
                          <p className="font-bold text-neutral-900 text-xs mb-1">Opción B (Descargar el instalador visual .exe):</p>
                          <ul className="space-y-1 list-disc list-inside text-neutral-700 text-[11px]">
                            <li>
                              <strong>Git for Windows (Recomendado):</strong> Descargar desde <a href="https://git-scm.com/download/win" target="_blank" rel="noopener noreferrer" className="text-primary underline font-bold">git-scm.com/download/win</a>. Al instalarlo, incluye OpenSSL automáticamente.
                            </li>
                            <li>
                              <strong>Instalador Win64 OpenSSL:</strong> Descargar la versión <em>Win64 OpenSSL Light</em> desde <a href="https://slproweb.com/products/Win32OpenSSL.html" target="_blank" rel="noopener noreferrer" className="text-primary underline font-bold">slproweb.com</a>. Durante la instalación, seleccioná la opción <em>"The OpenSSL binaries (/bin) directory to Windows system PATH"</em>.
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-lg text-amber-900 text-[11px] font-medium">
                        <strong>⚠️ Muy importante:</strong> Después de terminar la instalación, <strong>cerrá la ventana de PowerShell y volvé a abrirla</strong> para que Windows reconozca el nuevo comando. Ejecutá de nuevo <code>openssl version</code> y verás que ya funciona.
                      </div>
                    </div>
                  </div>

                  {/* Paso 2 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">2</span>
                      <h5 className="font-black text-neutral-900 text-sm">Crear una carpeta para los certificados</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      En la terminal PowerShell, creá una carpeta donde guardaremos de forma prolija todos los archivos generados:
                    </p>
                    <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-3 rounded-xl font-mono text-xs">
                      <div>
                        <p>mkdir C:\ARCA</p>
                        <p>cd C:\ARCA</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand('mkdir C:\\ARCA ; cd C:\\ARCA', 'cmd2')}
                        className="ml-3 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[11px] font-bold transition-colors"
                      >
                        {copiedCommand === 'cmd2' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-500">Todos los archivos que vamos a generar quedarán en esa carpeta.</p>
                  </div>

                  {/* Paso 3 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">3</span>
                      <h5 className="font-black text-neutral-900 text-sm">Generar la clave privada .KEY</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Ejecutá el siguiente comando para generar una clave privada RSA de 2048 bits:
                    </p>
                    <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-3 rounded-xl font-mono text-xs">
                      <span>openssl genrsa -out MiClavePrivada.key 2048</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand('openssl genrsa -out MiClavePrivada.key 2048', 'cmd3')}
                        className="ml-3 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[11px] font-bold transition-colors"
                      >
                        {copiedCommand === 'cmd3' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-xs text-emerald-700 font-bold">
                      ✅ Esto genera: <code className="bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">MiClavePrivada.key</code>. Este es el archivo .KEY que posteriormente va a necesitar La Martina.
                    </p>
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                      <strong>⚠️ MUY IMPORTANTE: No perder este archivo.</strong> La clave privada se genera en la computadora y ARCA no entrega posteriormente otra copia de esa misma clave. El certificado .CRT que ARCA emita debe corresponder exactamente a esta clave.
                    </div>
                  </div>

                  {/* Paso 4 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">4</span>
                      <h5 className="font-black text-neutral-900 text-sm">Generar el archivo de solicitud .CSR</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Ahora necesitamos generar la solicitud de certificado (CSR) para presentársela a ARCA. En <code className="font-mono">serialNumber</code> debe colocarse literalmente <strong className="text-neutral-900">CUIT</strong>, un espacio y los 11 dígitos sin guiones.
                    </p>

                    {/* Comando adaptado a los datos del formulario */}
                    {(() => {
                      const cleanCuit = (fiscalForm.cuit || '').replace(/[^0-9]/g, '');
                      const cleanBusiness = fiscalForm.businessName?.trim();
                      const cleanSystem = fiscalForm.fantasyName?.trim();

                      const isComplete = Boolean(cleanBusiness && cleanCuit.length >= 10);

                      const displayBusiness = cleanBusiness || '[TU_RAZON_SOCIAL]';
                      const displaySystem = cleanSystem || (cleanBusiness || '[TU_NOMBRE_FANTASIA]');
                      const displayCuit = cleanCuit || '[CUIT_SIN_GUIONES]';

                      const dynamicCmd = `openssl req -new -key MiClavePrivada.key -subj "/C=AR/O=${displayBusiness}/CN=${displaySystem}/serialNumber=CUIT ${displayCuit}" -out MiPedidoCSR.csr`;

                      return (
                        <div className="space-y-3 pt-1">
                          {isComplete ? (
                            <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs space-y-1">
                              <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                                <span className="material-symbols-outlined text-[18px]">verified</span>
                                Datos oficiales vinculados desde "Identificación de la Empresa":
                              </div>
                              <div className="text-[11px] text-emerald-900 grid grid-cols-1 sm:grid-cols-3 gap-1 pt-1 font-mono">
                                <div><strong className="font-sans">Razón Social:</strong> {cleanBusiness}</div>
                                <div><strong className="font-sans">Sistema (CN):</strong> {cleanSystem || cleanBusiness}</div>
                                <div><strong className="font-sans">CUIT:</strong> {cleanCuit}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="material-symbols-outlined text-[18px] text-amber-700">info</span>
                                Personalización automática:
                              </div>
                              <p className="text-[11px] leading-relaxed">
                                Si completás arriba los datos oficiales en <strong>"Identificación de la Empresa"</strong> (Razón Social, Nombre de Fantasía y CUIT), este comando se adaptará en tiempo real. Si algún dato no fue ingresado, verás los corchetes <code>[...]</code> para completar.
                              </p>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500">
                              <span>Comando sugerido listo para PowerShell / Terminal:</span>
                              <span className="text-[10px] font-mono text-neutral-400">OpenSSL RSA 2048</span>
                            </div>
                            <div className="flex items-center justify-between bg-neutral-900 text-neutral-100 p-3 rounded-xl font-mono text-xs overflow-x-auto shadow-inner">
                              <span className="break-all">{dynamicCmd}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCommand(dynamicCmd, 'cmd4')}
                                className="ml-3 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {copiedCommand === 'cmd4' ? 'check' : 'content_copy'}
                                </span>
                                {copiedCommand === 'cmd4' ? '¡Copiado!' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <p className="text-xs text-neutral-600">
                      ⚠️ ARCA especifica que en <code className="font-mono font-bold text-neutral-800">serialNumber</code> debe colocarse la palabra <strong>CUIT</strong>, un espacio y los 11 dígitos reales sin guiones ni espacios.
                    </p>
                  </div>

                  {/* Paso 5 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">5</span>
                      <h5 className="font-black text-neutral-900 text-sm">Entrar al portal oficial de ARCA</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Ingresá a la web de ARCA con Clave Fiscal. En el menú de servicios interactivos, buscá e ingresá a:
                    </p>
                    <div className="bg-neutral-100 px-3 py-2 rounded-xl text-xs font-mono font-bold text-neutral-900">
                      Administración de Certificados Digitales
                    </div>
                    <p className="text-[11px] text-neutral-500">ARCA indica que los certificados de producción se gestionan mediante esta aplicación.</p>
                  </div>

                  {/* Paso 6 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">6</span>
                      <h5 className="font-black text-neutral-900 text-sm">Seleccionar el contribuyente</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Si la persona que ingresó administra varias empresas o representaciones, seleccioná en pantalla la empresa emisora de las facturas (por ejemplo: <strong className="text-neutral-900">{fiscalForm.businessName?.trim() || '[Tu Razón Social]'}</strong>).
                    </p>
                  </div>

                  {/* Paso 7 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">7</span>
                      <h5 className="font-black text-neutral-900 text-sm">Crear el certificado (Agregar Alias)</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Dentro de <em>Administración de Certificados Digitales</em>:
                    </p>
                    <ol className="text-xs text-neutral-700 space-y-1.5 list-decimal list-inside ml-1">
                      <li>Hacé clic en el botón <strong className="text-neutral-900">Agregar Alias</strong>.</li>
                      <li>Escribí un nombre identificatorio (ejemplo: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono font-bold">LaMartina-Produccion</code>).</li>
                      <li>Hacé clic en examinar/seleccionar archivo y subí el archivo <strong className="font-mono text-neutral-900">MiPedidoCSR.csr</strong> generado en el Paso 4 (ubicado en <code className="font-mono">C:\ARCA</code>).</li>
                      <li>Confirmá la operación. ARCA tomará ese CSR y emitirá el certificado digital asociado.</li>
                    </ol>
                  </div>

                  {/* Paso 8 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">8</span>
                      <h5 className="font-black text-neutral-900 text-sm">Descargar el certificado .CRT</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Una vez generado el certificado:
                    </p>
                    <ol className="text-xs text-neutral-700 space-y-1.5 list-decimal list-inside ml-1">
                      <li>Entrá al detalle del certificado recién creado.</li>
                      <li>Buscá la opción <strong className="text-neutral-900">Descargar</strong>.</li>
                      <li>Guardalo en tu carpeta <code className="font-mono font-bold">C:\ARCA</code>. El archivo se descargará con nombre similar a <code className="font-mono font-bold text-neutral-900">LaMartina-Produccion.crt</code>.</li>
                    </ol>
                    <p className="text-xs text-amber-700 font-bold">
                      🎯 Este es el segundo archivo que necesita La Martina para facturar legalmente.
                    </p>
                  </div>

                  {/* Paso 9 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">9</span>
                      <h5 className="font-black text-neutral-900 text-sm">Comprobar tus archivos generados</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      En tu carpeta <code className="font-mono font-bold">C:\ARCA</code> ahora tenés:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                        <p className="font-bold text-amber-900">🔑 Clave privada:</p>
                        <p className="font-mono text-neutral-800">MiClavePrivada.key</p>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                        <p className="font-bold text-emerald-900">📜 Certificado ARCA:</p>
                        <p className="font-mono text-neutral-800">LaMartina-Produccion.crt</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      (El archivo <code className="font-mono">MiPedidoCSR.csr</code> ya cumplió su función y no necesitás subirlo).
                    </p>
                  </div>

                  {/* Paso 10 */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">10</span>
                      <h5 className="font-black text-neutral-900 text-sm">Asociar el certificado al Web Service (Delegación)</h5>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                      <strong>⚠️ Paso fundamental:</strong> Obtener el .CRT no significa por sí solo que ya se pueda facturar. Tenés que autorizar a ese alias a emitir comprobantes en ARCA.
                    </div>
                    <ol className="text-xs text-neutral-700 space-y-1.5 list-decimal list-inside ml-1">
                      <li>En el portal de ARCA, entrá al servicio <strong className="text-neutral-900">Administrador de Relaciones de Clave Fiscal</strong>.</li>
                      <li>Hacé clic en <strong className="text-neutral-900">Nueva Relación</strong> → Buscar servicio → <strong className="text-neutral-900">ARCA</strong> → <strong className="text-neutral-900">WebServices</strong>.</li>
                      <li>Seleccioná los servicios correspondientes a La Martina:
                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1 font-mono text-[11px] text-neutral-800">
                          <li><strong>WSMTXCA</strong> (Facturación con detalle de artículos para Facturas A y B)</li>
                          <li><strong>WSFEv1</strong> (Facturación electrónica estándar / Facturas C)</li>
                        </ul>
                      </li>
                      <li>En <em>Representante</em>, seleccioná el Alias creado en el Paso 7 (<code className="font-mono font-bold">LaMartina-Produccion</code>).</li>
                      <li>Confirmá la delegación.</li>
                    </ol>
                  </div>

                  {/* Paso 11: Cómo verificar y dar de alta el Punto de Venta */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shrink-0">11</span>
                      <h5 className="font-black text-neutral-900 text-sm">Verificar o dar de alta el Punto de Venta en ARCA</h5>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      El punto de venta que se configure en La Martina tiene que coincidir con el punto de venta habilitado en ARCA específicamente para la modalidad <strong>Web Services</strong>.
                    </p>

                    <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-3 text-blue-950">
                      <div className="flex items-center gap-2 font-black text-blue-900 uppercase tracking-wider text-[11px]">
                        <span className="material-symbols-outlined text-[18px] text-blue-700">pin_drop</span>
                        Paso a paso para comprobarlo en el portal de ARCA:
                      </div>

                      <ol className="space-y-2 list-decimal list-inside text-neutral-800 leading-relaxed">
                        <li>
                          Ingresá a la web de ARCA con tu CUIT y Clave Fiscal.
                        </li>
                        <li>
                          Buscá e ingresá al servicio: <strong className="text-neutral-900">"Administración de Puntos de Venta y Domicilios"</strong>.
                          <span className="block text-[11px] text-neutral-500 ml-4 mt-0.5">
                            (Si no lo tenés habilitado, agregalo desde <em>Administrador de Relaciones de Clave Fiscal → Habilitar Servicio → ARCA → Servicios Interactivos</em>).
                          </span>
                        </li>
                        <li>
                          Seleccioná la empresa emisora (<strong className="text-neutral-900">{fiscalForm.businessName?.trim() || '[Tu Razón Social]'}</strong>).
                        </li>
                        <li>
                          Hacé clic en el botón <strong className="text-neutral-900">"A/B/M de Puntos de Venta"</strong>.
                        </li>
                        <li>
                          <strong>Revisá la lista de Puntos de Venta:</strong>
                          <div className="ml-4 mt-1 space-y-1">
                            <p>• Mirá la columna <strong>"Sistema"</strong>. Debe decir obligatoriamente <strong className="text-blue-900">"RECE para aplicativo y/o Web Services"</strong> o <strong className="text-blue-900">"Facturación Electrónica - Web Services"</strong>.</p>
                            <p>• Si ya tenés uno activo (por ejemplo el número <strong className="font-mono text-neutral-900">00001</strong> o <strong className="font-mono text-neutral-900">00002</strong>), ¡ese es tu número! Anotalo para colocarlo en La Martina (sin ceros adelante, ej: <strong className="text-primary font-bold">1</strong> o <strong className="text-primary font-bold">2</strong>).</p>
                          </div>
                        </li>
                        <li>
                          <strong>Si NO tenés un Punto de Venta Web Services, crealo ahora:</strong>
                          <div className="ml-4 mt-1 space-y-1 bg-white p-3 rounded-lg border border-blue-200">
                            <p>a. Hacé clic en <strong className="text-neutral-900">"Agregar"</strong> (abajo a la izquierda).</p>
                            <p>b. <strong>Número:</strong> Escribí el número correlativo que corresponda (ej: <code className="font-mono font-bold">1</code>, <code className="font-mono font-bold">2</code>, o <code className="font-mono font-bold">3</code>).</p>
                            <p>c. <strong>Nombre de Fantasía:</strong> Escribí el nombre del local (ej: <em>{fiscalForm.fantasyName?.trim() || fiscalForm.businessName?.trim() || 'La Martina'}</em>).</p>
                            <p className="text-rose-700 font-bold">
                              d. <strong>Sistema / Vinculación (CRÍTICO):</strong> Seleccioná <u>"Facturación Electrónica - Web Services"</u>.
                            </p>
                            <p className="text-[11px] text-rose-600">
                              ⚠️ NO elijas "Comprobantes en Línea" ni "Facturador Móvil". Esos modos son solo para facturar manualmente desde la página web de ARCA y NO admiten conexiones automáticas del software.
                            </p>
                            <p>e. <strong>Domicilio:</strong> Elegí el domicilio fiscal declarado de tu comercio.</p>
                            <p>f. Hacé clic en <strong>Aceptar</strong> y confirmá.</p>
                          </div>
                        </li>
                      </ol>

                      <div className="p-2.5 rounded-lg bg-emerald-100/70 border border-emerald-300 text-emerald-900 text-xs font-medium">
                        👉 <strong>Resultado:</strong> Si en ARCA tu punto de venta es el <strong className="font-mono">00001</strong>, en La Martina (arriba en esta pantalla) en el campo <strong>"Número de Punto de Venta (PV)"</strong> debés escribir <strong className="font-bold">1</strong>.
                      </div>
                    </div>
                  </div>

                  {/* Paso 12 */}
                  <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shrink-0">12</span>
                      <h5 className="font-black text-emerald-950 text-base">Cargar los certificados en La Martina</h5>
                    </div>
                    <p className="text-xs text-emerald-900 leading-relaxed">
                      ¡Llegaste al paso final! En el bloque de arriba en esta misma pantalla:
                    </p>
                    <div className="p-4 rounded-xl bg-white border border-emerald-200 text-xs space-y-2 text-neutral-800">
                      <p>1. Cambiá <strong>Entorno de Facturación</strong> a <strong className="text-emerald-700">Producción (Oficial / Validez Legal)</strong>.</p>
                      <p>2. En <strong>Certificado (.crt)</strong>, seleccioná tu archivo descargado: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono font-bold">LaMartina-Produccion.crt</code>.</p>
                      <p>3. En <strong>Clave Privada (.key)</strong>, seleccioná tu archivo generado: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono font-bold">MiClavePrivada.key</code>.</p>
                      <p>4. Presioná el botón <strong className="text-amber-800">Subir Certificados</strong>.</p>
                      <p>5. Hacé clic en <strong className="text-primary">Guardar Configuración Fiscal</strong> al final del formulario.</p>
                      <p>6. Presioná <strong className="text-neutral-900">Verificar ARCA</strong> arriba para comprobar la conexión activa con los servidores oficiales.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-700">
                      <span className="material-symbols-outlined text-[20px]">task_alt</span>
                      ¡A partir de ese momento, cada venta registrada emitirá automáticamente comprobante fiscal oficial en ARCA!
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>


        </div>
      )}

      {activeSection === 'ticket' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Column */}
          <div className="space-y-6">
            {/* Business Info */}
            <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-[20px]">store</span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg">Datos del Negocio</h3>
                    <p className="text-xs text-on-surface-variant">Información que aparece en el encabezado del ticket</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Nombre del Encabezado</label>
                  <input
                    type="text"
                    value={form.headerText}
                    onChange={e => setForm(p => ({ ...p, headerText: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="Martina Supermercado"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Descripción / Rubro</label>
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="Minimarket & Supermercado"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Dirección</label>
                    <input
                      type="text"
                      value={form.businessAddress}
                      onChange={e => setForm(p => ({ ...p, businessAddress: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="Calle 123, Ciudad"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Teléfono</label>
                    <input
                      type="text"
                      value={form.businessPhone}
                      onChange={e => setForm(p => ({ ...p, businessPhone: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      placeholder="261-1234567"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">CUIT / RFC</label>
                  <input
                    type="text"
                    value={form.businessCuit}
                    onChange={e => setForm(p => ({ ...p, businessCuit: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="20-12345678-9"
                  />
                </div>
              </div>
            </div>

            {/* Footer & Blank Lines */}
            <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-yellow-700 text-[20px]">format_line_spacing</span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg">Formato del Ticket</h3>
                    <p className="text-xs text-on-surface-variant">Mensaje final y espaciado</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Mensaje Final</label>
                  <textarea
                    value={form.footerMessage}
                    onChange={e => setForm(p => ({ ...p, footerMessage: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all resize-none"
                    placeholder="¡Gracias por su compra!"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Líneas en blanco al inicio</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={form.blankLinesTop}
                        onChange={e => setForm(p => ({ ...p, blankLinesTop: parseInt(e.target.value) }))}
                        className="flex-1 accent-primary"
                      />
                      <span className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-1 rounded-lg font-black text-sm w-10 text-center">{form.blankLinesTop}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Líneas en blanco al final</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={form.blankLinesBottom}
                        onChange={e => setForm(p => ({ ...p, blankLinesBottom: parseInt(e.target.value) }))}
                        className="flex-1 accent-primary"
                      />
                      <span className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-1 rounded-lg font-black text-sm w-10 text-center">{form.blankLinesBottom}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSave}
                className="w-full sm:flex-[2] bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar Configuración
              </button>
              <button
                onClick={handleReset}
                className="w-full sm:flex-1 bg-white border border-outline-variant/10 font-bold py-4 rounded-2xl text-on-surface-variant hover:bg-surface-container-lowest transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
            </div>
          </div>

          {/* Preview Column */}
          <div>
            <div className="sticky top-8">
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">preview</span>
                  <h3 className="font-black text-lg">Vista Previa del Ticket</h3>
                </div>
                <div className="p-6 flex justify-center">
                  <div className="bg-white border-2 border-dashed border-outline-variant/20 rounded-2xl p-6 w-[320px] font-mono text-xs shadow-inner">
                    {/* Blank lines top */}
                    {Array.from({ length: form.blankLinesTop }).map((_, i) => <br key={`top-${i}`} />)}

                    {/* Header */}
                    <div className="text-center border-b border-dashed border-black/30 pb-3 mb-3">
                      <div className="text-lg font-bold">{form.headerText || 'Martina Supermercado'}</div>
                      <div className="text-[10px] text-gray-500">{form.businessName}</div>
                      {form.businessAddress && <div className="text-[10px] text-gray-500">{form.businessAddress}</div>}
                      {form.businessPhone && <div className="text-[10px] text-gray-500">Tel: {form.businessPhone}</div>}
                      {form.businessCuit && <div className="text-[10px] text-gray-500">CUIT: {form.businessCuit}</div>}
                      <div className="text-[10px] mt-1">Ticket: #LOC-A1B2C</div>
                      <div className="text-[10px] text-gray-500">19/05/2026, 14:30</div>
                      <div className="text-[10px] text-gray-500">Atendido por: Admin</div>
                    </div>

                    {/* Items */}
                    <div className="border-b border-dashed border-black/30 pb-3 mb-3 space-y-2">
                      {mockItems.map((item, i) => (
                        <div key={i}>
                          <div className="font-bold text-[11px]">{item.name}</div>
                          <div className="flex justify-between text-[10px] text-gray-700">
                            <span>{item.quantity} x ${fmt(item.finalPrice)}</span>
                            <span>${fmt(item.finalPrice * item.quantity)}</span>
                          </div>
                          {item.offerLabel && (
                            <div className="text-[9px] text-gray-500 italic">▸ {item.offerLabel} (-${fmt((item.price - item.finalPrice) * item.quantity)})</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span>Subtotal</span>
                        <span>${fmt(mockSubtotal)}</span>
                      </div>
                      {mockSubtotal !== mockTotal && (
                        <div className="flex justify-between text-[11px] text-red-600">
                          <span>Descuento</span>
                          <span>-${fmt(mockSubtotal - mockTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[13px] font-bold border-t border-black pt-2 mt-2">
                        <span>TOTAL</span>
                        <span>${fmt(mockTotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Forma de pago</span>
                        <span>Efectivo</span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center border-t border-dashed border-black/30 pt-3 mt-3 text-[10px] text-gray-500">
                      <div>{form.footerMessage || '¡Gracias por su compra!'}</div>
                      <div>{form.headerText} — {form.businessAddress}</div>
                    </div>

                    {/* Blank lines bottom */}
                    {Array.from({ length: form.blankLinesBottom }).map((_, i) => <br key={`bot-${i}`} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'general' && (
        <div className="space-y-6">
          {/* Barra superior de control de paneles */}
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">view_agenda</span>
              Hacé clic en cualquier panel para expandir su configuración
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-bold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
              >
                Expandir todos
              </button>
              <span className="text-on-surface-variant/40">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-bold text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Contraer todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Columna Izquierda: Cuenta Corriente */}
            <div className="space-y-5">
              {/* 3. Cuenta Corriente */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cuentas')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      💳
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Límites de Cuenta Corriente</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${accountForm.enabled ? 'bg-blue-100 text-blue-800' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                          {accountForm.enabled ? 'Habilitado' : 'Desactivado'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Configuración global para ventas a cuenta y límites de crédito</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['cuentas'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cuentas'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                      <div>
                        <h4 className="font-bold text-sm">Habilitar Control de Límites</h4>
                        <p className="text-xs text-on-surface-variant">Activa o desactiva la validación de límites en la caja y checkout.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={accountForm.enabled} onChange={e => setAccountForm(p => ({ ...p, enabled: e.target.checked }))} className="sr-only peer" />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    {accountForm.enabled && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Límite Monetario ($)</label>
                            <input
                              type="number"
                              value={accountForm.maxDebtAmount}
                              onChange={e => setAccountForm(p => ({ ...p, maxDebtAmount: Number(e.target.value) }))}
                              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Límite Temporal (Días)</label>
                            <input
                              type="number"
                              value={accountForm.maxDebtDays}
                              onChange={e => setAccountForm(p => ({ ...p, maxDebtDays: Number(e.target.value) }))}
                              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.warnOnAmountLimit} onChange={e => setAccountForm(p => ({ ...p, warnOnAmountLimit: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Advertir por Límite Monetario</div>
                              <div className="text-xs text-on-surface-variant">Mostrar alerta si la compra supera el monto máximo permitido</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.warnOnTimeLimit} onChange={e => setAccountForm(p => ({ ...p, warnOnTimeLimit: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Advertir por Límite Temporal</div>
                              <div className="text-xs text-on-surface-variant">Mostrar alerta si el cliente tiene deudas previas vencidas</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                            <input type="checkbox" checked={accountForm.allowOverride} onChange={e => setAccountForm(p => ({ ...p, allowOverride: e.target.checked }))} className="w-5 h-5 accent-primary rounded" />
                            <div>
                              <div className="font-bold text-sm">Permitir Excepciones en Caja (Override)</div>
                              <div className="text-xs text-on-surface-variant">Permite al cajero continuar la venta bajo su responsabilidad</div>
                            </div>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Cierre Automático de Caja */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cierre')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-xl shrink-0">
                      ⏰
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Cierre Automático de Caja</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${autoCloseForm.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                          {autoCloseForm.enabled ? autoCloseForm.time : 'Inactivo'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Cierra la caja automáticamente todos los días a la hora configurada</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['cierre'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cierre'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-sm">Activar cierre automático</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">Si está activo, la caja se cerrará sola a la hora indicada</p>
                      </div>
                      <button
                        onClick={() => setAutoCloseForm(f => ({ ...f, enabled: !f.enabled }))}
                        className={`relative w-14 h-7 rounded-full transition-all duration-300 shrink-0 ${autoCloseForm.enabled ? 'bg-primary' : 'bg-outline-variant/30'
                          }`}
                      >
                        <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-all duration-300 ${autoCloseForm.enabled ? 'left-7' : 'left-0.5'
                          }`} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Hora del Cierre</label>
                      <input
                        type="time"
                        value={autoCloseForm.time}
                        onChange={e => setAutoCloseForm(f => ({ ...f, time: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-lg outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Columna Derecha: Seguridad & Notificaciones */}
            <div className="space-y-5">

              {/* 4. Teléfonos Bloqueados (Lista Negra) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('seguridad')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🚫
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Seguridad y Teléfonos Bloqueados</h3>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 shrink-0">
                          {generalForm.blockedPhones?.length || 0} bloqueados
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Lista negra de números que no pueden realizar pedidos</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['seguridad'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['seguridad'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Bloquear un nuevo teléfono</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ej: 2614421234"
                          value={newBlockedPhone}
                          onChange={e => setNewBlockedPhone(e.target.value)}
                          className="flex-1 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const clean = newBlockedPhone.replace(/\D/g, '');
                            if (!clean) return;
                            const current = generalForm.blockedPhones || [];
                            if (!current.includes(clean)) {
                              setGeneralForm(p => ({ ...p, blockedPhones: [...current, clean] }));
                            }
                            setNewBlockedPhone('');
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold px-5 py-3 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          Bloquear
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 block">
                        Números bloqueados actualmente ({generalForm.blockedPhones?.length || 0})
                      </label>
                      {(!generalForm.blockedPhones || generalForm.blockedPhones.length === 0) ? (
                        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10 text-center text-xs text-on-surface-variant">
                          No hay números en la lista negra.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {generalForm.blockedPhones.map(phone => (
                            <div key={phone} className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-200/40 text-xs font-bold">
                              <span className="flex items-center gap-2 text-red-900">
                                <span className="material-symbols-outlined text-[16px] text-red-500">phone_disabled</span>
                                {phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setGeneralForm(p => ({
                                    ...p,
                                    blockedPhones: (p.blockedPhones || []).filter(item => item !== phone)
                                  }));
                                }}
                                className="text-red-500 hover:text-red-700 bg-white hover:bg-red-100 px-3 py-1 rounded-lg border border-red-200 text-[10px] font-bold transition-all flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                Desbloquear
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Notificaciones a Empleados */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('notificaciones')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-orange-100 text-orange-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🔔
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Notificaciones a Empleados</h3>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${!generalForm.suspendEmployeeNotifications ? 'bg-orange-100 text-orange-800' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                          {!generalForm.suspendEmployeeNotifications ? 'Activas' : 'Pausadas'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Control general de notificaciones y alertas por WhatsApp</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['notificaciones'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['notificaciones'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                      <div>
                        <h4 className="font-bold text-sm">Habilitar notificaciones a empleados</h4>
                        <p className="text-xs text-on-surface-variant">Si está activo, se enviarán alertas de pedidos y bajo stock por WhatsApp.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={!generalForm.suspendEmployeeNotifications} onChange={e => setGeneralForm(p => ({ ...p, suspendEmployeeNotifications: !e.target.checked }))} className="sr-only peer" />
                        <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Barra de Acciones Global */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-base text-on-background">Guardar Cambios de Configuración</h4>
              <p className="text-xs text-on-surface-variant">Aplica todas las modificaciones realizadas en la configuración general.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleReset}
                className="w-full sm:w-auto bg-surface-container-low border border-outline-variant/10 font-bold px-6 py-3.5 rounded-2xl text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
              <button
                onClick={handleSave}
                className="w-full sm:w-auto bg-primary text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Guardar Configuración
              </button>
            </div>
          </div>

          {/* Ayuda y Documentación */}
          <div className="bg-blue-50/50 rounded-[2rem] border border-blue-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-blue-600 text-3xl">lightbulb</span>
              <div>
                <h4 className="font-black text-blue-900 text-xl">Ayuda y Documentación</h4>
                <p className="text-sm text-blue-800/70">Todo lo que necesitas saber sobre cómo funcionan estas configuraciones</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Notificaciones Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Notificaciones de WhatsApp</h5>
                <p className="text-sm text-blue-800">Al desactivarlas, los empleados no recibirán mensajes de nuevos pedidos ni los administradores recibirán alertas de stock. Útil para hacer pruebas o para fuera del horario comercial.</p>
              </div>

              {/* Cuenta Corriente Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Límites de Cuenta Corriente</h5>
                <p className="text-sm text-blue-800">Se aplican de forma <strong>global</strong>. Si un cliente necesita un límite diferente, debes ajustarlo de forma personalizada desde la pestaña de <em>Clientes</em>. Las excepciones permiten ignorar la alerta bajo responsabilidad del cajero.</p>
              </div>

              {/* Tienda Online Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">store_mall_directory</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Pausa de Ventas Online</h5>
                <p className="text-sm text-blue-800">Ideal al momento de actualizar precios de manera masiva. Al pausar las ventas online, el POS para ventas presenciales seguirá funcionando normalmente sin ninguna interrupción.</p>
              </div>

              {/* Cierre Automático Info */}
              <div className="bg-white/60 p-5 rounded-2xl border border-blue-100/50">
                <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                </div>
                <h5 className="font-black text-blue-900 mb-2">Cierre Automático</h5>
                <p className="text-sm text-blue-800">Requiere que el panel de administración esté abierto en el navegador a la hora configurada. El proceso utiliza la misma lógica que el cierre manual, y generará su reporte y ticket correspondiente.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= CLIENTES / TIENDA ONLINE SECTION ================= */}
      {activeSection === 'clients' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header de Sección Clientes */}
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-outline-variant/10 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[22px]">storefront</span>
                </div>
                <h3 className="font-black text-xl text-on-surface">Configuración para Clientes y Tienda Online</h3>
              </div>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl">
                Administrá el estado operativo de la tienda web (apertura o pausa de pedidos) y personalizá los horarios y franjas de entrega o retiro que pueden seleccionar los clientes en el checkout.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium bg-surface-container-low/50 px-5 py-2.5 rounded-2xl border border-outline-variant/10">
            <p className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">view_agenda</span>
              Hacé clic en cualquier panel para expandir o contraer su configuración
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-bold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
              >
                Expandir todos
              </button>
              <span className="text-on-surface-variant/40">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-bold text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Contraer todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Columna Izquierda: Franjas Horarias (Más ancha: 7 de 12 columnas) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Horarios de Entrega y Retiro (Desplegable) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('horarios')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-xl shrink-0">
                      <span className="material-symbols-outlined text-[24px]">schedule</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-base md:text-lg text-on-surface truncate">Horarios de Entrega</h4>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          {slotsForm.length} franjas
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">
                        Opciones para entrega o retiro en checkout
                      </p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['horarios'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['horarios'] && (
                  <div className="p-6 space-y-5 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    {/* Botones de acción rápida */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-outline-variant/10">
                      <span className="text-xs text-on-surface-variant font-medium">Configuración de opciones</span>
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={handleResetSlots}
                          className="px-3 py-1.5 rounded-xl border border-outline-variant/20 hover:bg-surface-container text-on-surface-variant font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                          title="Restablecer a las 4 opciones por defecto"
                        >
                          <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                          Por defecto
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenCreateSlot}
                          className="bg-primary text-white font-bold text-xs px-3.5 py-1.5 rounded-xl hover:bg-primary/90 shadow-sm flex items-center gap-1 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          Nueva Franja
                        </button>
                      </div>
                    </div>

                    {/* Lista de franjas horarias */}
                    <div className="space-y-3">
                      {slotsForm.length === 0 ? (
                        <div className="p-6 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/20 space-y-3">
                          <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">schedule</span>
                          <p className="text-xs font-bold text-on-surface">No hay horarios configurados</p>
                          <button
                            type="button"
                            onClick={handleResetSlots}
                            className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-primary/90 transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                            Restaurar por Defecto
                          </button>
                        </div>
                      ) : (
                        slotsForm.map((slot, index) => {
                          const isAsap = !slot.isTomorrow && !slot.cutoffTime && (slot.id === 'asap' || slot.endHour === undefined || slot.endHour >= 24);
                          const cutoff = slot.cutoffTime || (slot.endHour && slot.endHour < 24 ? `${String(slot.endHour).padStart(2, '0')}:${String(slot.endMin ?? 0).padStart(2, '0')}` : null);

                          return (
                            <div
                              key={slot.id}
                              className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${slot.enabled === false
                                ? 'opacity-60 bg-surface-container-lowest border-outline-variant/10'
                                : 'bg-white border-outline-variant/20 hover:border-primary/40 hover:shadow-sm'
                                }`}
                            >
                              {/* Fila Superior: Mover + Ícono + Label + Switch */}
                              <div className="flex items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  {/* Flechas mover */}
                                  <div className="flex flex-col -space-y-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSlot(index, 'up')}
                                      disabled={index === 0}
                                      className="w-5 h-4 flex items-center justify-center text-on-surface-variant/60 hover:text-primary hover:bg-primary/10 rounded disabled:opacity-20 cursor-pointer"
                                      title="Mover arriba"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">expand_less</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSlot(index, 'down')}
                                      disabled={index === slotsForm.length - 1}
                                      className="w-5 h-4 flex items-center justify-center text-on-surface-variant/60 hover:text-primary hover:bg-primary/10 rounded disabled:opacity-20 cursor-pointer"
                                      title="Mover abajo"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">expand_more</span>
                                    </button>
                                  </div>

                                  <div className="w-8 h-8 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[18px]">{slot.icon || 'schedule'}</span>
                                  </div>

                                  <div className="min-w-0">
                                    <h5 className="font-bold text-xs sm:text-sm text-on-surface truncate leading-tight">{slot.label}</h5>
                                    <p className="text-[11px] text-on-surface-variant font-medium truncate mt-0.5">{slot.sub}</p>
                                  </div>
                                </div>

                                {/* Switch activo */}
                                <label className="relative inline-flex items-center cursor-pointer shrink-0" title={slot.enabled !== false ? 'Desactivar opción' : 'Activar opción'}>
                                  <input
                                    type="checkbox"
                                    checked={slot.enabled !== false}
                                    onChange={() => handleToggleSlotActive(slot.id)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                                </label>
                              </div>

                              {/* Fila Inferior: Badges + Botones Editar/Borrar */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/10 text-xs">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {slot.freeShipping ? (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-green-100 text-green-800 border border-green-200 inline-flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                                      Gratis
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface-container text-on-surface-variant/70 border border-outline-variant/15">
                                      Estándar
                                    </span>
                                  )}

                                  {slot.isTomorrow ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 inline-flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[12px]">event</span>
                                      Mañana
                                    </span>
                                  ) : isAsap ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center gap-0.5" title="Horario de atención">
                                      <span className="material-symbols-outlined text-[12px]">storefront</span>
                                      {slot.startTime || '09:00'}-{slot.endTime || '21:00'}
                                    </span>
                                  ) : cutoff ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 inline-flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[12px]">alarm</span>
                                      Corte {cutoff}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditSlot(slot)}
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                                    title="Editar franja"
                                  >
                                    <span className="material-symbols-outlined text-[17px]">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSlot(slot.id)}
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    title="Eliminar franja"
                                  >
                                    <span className="material-symbols-outlined text-[17px]">delete</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Zona de Cobertura y Delivery (Desplegable - debajo de Horarios) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('cobertura')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      📍
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base md:text-lg text-on-surface truncate">Zona de Cobertura y Delivery</h3>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                          {generalForm.deliveryRadiusKm || 5} km
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Radio máximo de entrega y tarifas de envío</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['cobertura'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['cobertura'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">

                    {/* Tarifas de Envío Dinámico */}
                    <div className="bg-surface-container-lowest p-4 md:p-5 rounded-2xl border border-outline-variant/20 space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
                        <h4 className="text-sm font-black text-on-surface">Cálculo de Envío por Distancia</h4>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        El costo de envío se calcula automáticamente: <strong className="text-on-surface">Tarifa Base + (Distancia en Km × Costo por Km)</strong>.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                            Tarifa Base de Envío ($)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-sm">$</span>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={generalForm.shippingBaseCost ?? 1000}
                              onChange={e => setGeneralForm(p => ({ ...p, shippingBaseCost: parseFloat(e.target.value) || 0 }))}
                              className="w-full bg-white border border-outline-variant/20 rounded-xl pl-8 pr-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                              placeholder="1000"
                            />
                          </div>
                          <span className="text-[10px] text-on-surface-variant/80 mt-1 block">Costo fijo inicial de arranque</span>
                        </div>

                        <div>
                          <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                            Costo por Kilómetro Adicional ($ / km)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-sm">$</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={generalForm.shippingCostPerKm ?? 400}
                              onChange={e => setGeneralForm(p => ({ ...p, shippingCostPerKm: parseFloat(e.target.value) || 0 }))}
                              className="w-full bg-white border border-outline-variant/20 rounded-xl pl-8 pr-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                              placeholder="400"
                            />
                          </div>
                          <span className="text-[10px] text-on-surface-variant/80 mt-1 block">Se multiplica por los km hasta el cliente</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-outline-variant/10">
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                          Envío Gratis a partir de ($) <span className="normal-case font-normal text-on-surface-variant">(Opcional, 0 = desactivado)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="500"
                            value={generalForm.freeShippingMinAmount ?? 0}
                            onChange={e => setGeneralForm(p => ({ ...p, freeShippingMinAmount: parseFloat(e.target.value) || 0 }))}
                            className="w-full bg-white border border-outline-variant/20 rounded-xl pl-8 pr-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                            placeholder="0 para desactivar (Ej: 35000)"
                          />
                        </div>
                        <span className="text-[10px] text-on-surface-variant/80 mt-1 block">
                          {generalForm.freeShippingMinAmount && generalForm.freeShippingMinAmount > 0
                            ? `Los pedidos desde $${generalForm.freeShippingMinAmount.toLocaleString('es-AR')} tendrán envío 100% bonificado.`
                            : 'Envío gratis desactivado (se cobra siempre por distancia).'}
                        </span>
                      </div>

                      {/* Simulador Interactivo de Tarifas */}
                      <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/15">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">calculate</span>
                            Simulador de Tarifas en Vivo
                          </span>
                          <span className="text-xs font-bold text-on-surface font-mono bg-white px-2.5 py-0.5 rounded-lg border border-outline-variant/20 shadow-xs">
                            Distancia: {simulatedKm.toFixed(1)} km
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="20"
                          step="0.5"
                          value={simulatedKm}
                          onChange={e => setSimulatedKm(parseFloat(e.target.value) || 1)}
                          className="w-full h-2 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-[10px] text-on-surface-variant font-bold mt-1">
                          <span>0.5 km</span>
                          <span>10 km</span>
                          <span>20 km</span>
                        </div>

                        {/* Resultado de la simulación */}
                        <div className="mt-3 p-3 bg-white rounded-lg border border-outline-variant/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div>
                            <p className="text-[11px] text-on-surface-variant font-medium">
                              Fórmula: ${generalForm.shippingBaseCost || 0} + ({simulatedKm.toFixed(1)} km × ${generalForm.shippingCostPerKm || 0})
                            </p>
                            {simulatedKm > (generalForm.deliveryRadiusKm || 5) && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded mt-1 inline-block">
                                ⚠️ Supera el radio máximo de {generalForm.deliveryRadiusKm || 5} km (Se bloqueará para envío)
                              </span>
                            )}
                          </div>
                          <div className="text-right self-end sm:self-auto">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Costo Final Envío</span>
                            <span className="text-lg font-black text-primary">
                              ${Math.round((generalForm.shippingBaseCost || 0) + simulatedKm * (generalForm.shippingCostPerKm || 0)).toLocaleString('es-AR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Radio Máximo y Coordenadas del Local */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider">Radio Máximo de Cobertura</label>
                        <span className="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-lg">{generalForm.deliveryRadiusKm || 5} km</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="0.5"
                        value={generalForm.deliveryRadiusKm || 5}
                        onChange={e => setGeneralForm(p => ({ ...p, deliveryRadiusKm: parseFloat(e.target.value) || 5 }))}
                        className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-on-surface-variant font-bold mt-1">
                        <span>1 km</span>
                        <span>15 km</span>
                        <span>30 km</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-2">Los pedidos fuera de esta distancia se bloquearán para entrega a domicilio.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/10">
                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Latitud del Local</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={generalForm.storeLat ?? -33.459009}
                          onChange={e => setGeneralForm(p => ({ ...p, storeLat: parseFloat(e.target.value) || -33.459009 }))}
                          className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">Longitud del Local</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={generalForm.storeLng ?? -67.551826}
                          onChange={e => setGeneralForm(p => ({ ...p, storeLng: parseFloat(e.target.value) || -67.551826 }))}
                          className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Columna Derecha: Estado de la Tienda Online (Más compacta: 5 de 12 columnas) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Estado de la Tienda Online (Desplegable) */}
              <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => togglePanel('tienda')}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center text-xl shrink-0">
                      🏬
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-base md:text-lg text-on-surface truncate">Estado de la Tienda Online</h4>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 ${storeForm.onlineSalesPaused ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                          {storeForm.onlineSalesPaused ? 'Pausada' : 'Activa'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">Control de compras al público general</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 text-[26px] shrink-0 ${openPanels['tienda'] ? 'rotate-180 text-primary' : ''
                    }`}>
                    expand_more
                  </span>
                </button>

                {openPanels['tienda'] && (
                  <div className="p-6 space-y-6 border-t border-outline-variant/10 animate-in fade-in duration-200">
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border transition-all ${storeForm.onlineSalesPaused ? 'bg-red-50/50 border-red-200' : 'bg-green-50/50 border-green-200'
                      }`}>
                      <div>
                        <h4 className={`font-bold text-base ${storeForm.onlineSalesPaused ? 'text-red-700' : 'text-green-700'}`}>
                          {storeForm.onlineSalesPaused ? 'Compras Pausadas' : 'Compras Activas'}
                        </h4>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {storeForm.onlineSalesPaused
                            ? 'Los clientes no pueden finalizar compras online. El POS sigue funcionando.'
                            : 'Los clientes pueden comprar normalmente en la tienda web.'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={!storeForm.onlineSalesPaused}
                          onChange={e => {
                            const isPaused = !e.target.checked;
                            setStoreForm(p => ({
                              ...p,
                              onlineSalesPaused: isPaused,
                              pausedAt: isPaused ? new Date().toISOString() : null
                            }));
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-red-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
                      </label>
                    </div>

                    {storeForm.onlineSalesPaused && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                            Motivo de la Pausa (Visible para clientes)
                          </label>
                          <textarea
                            value={storeForm.pauseReason}
                            onChange={e => setStoreForm(p => ({ ...p, pauseReason: e.target.value }))}
                            rows={2}
                            className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all resize-none"
                            placeholder="Ej: Estamos actualizando precios. Volvemos en 30 minutos."
                          />
                        </div>
                        <label className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/20 cursor-pointer hover:bg-surface-container-low transition-colors">
                          <input
                            type="checkbox"
                            checked={storeForm.allowBrowsingWhilePaused}
                            onChange={e => setStoreForm(p => ({ ...p, allowBrowsingWhilePaused: e.target.checked }))}
                            className="w-5 h-5 accent-primary rounded"
                          />
                          <div>
                            <div className="font-bold text-sm">Permitir navegación de catálogo</div>
                            <div className="text-xs text-on-surface-variant">Si está activo, los clientes pueden ver productos pero no finalizar checkout.</div>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Barra de Guardar Cambios para Clientes */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm">
            <div className="flex-1 text-center sm:text-left">
              <h4 className="font-black text-base text-on-background">Guardar Configuración de Clientes</h4>
              <p className="text-xs text-on-surface-variant">Aplica el estado de la tienda online, la zona de cobertura y tarifas, y los horarios de entrega disponibles.</p>
              {saveError && (
                <p className="text-xs font-bold text-red-600 mt-1.5 flex items-center justify-center sm:justify-start gap-1.5 animate-in fade-in">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {saveError}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="w-full sm:w-auto bg-surface-container-low border border-outline-variant/10 font-bold px-6 py-3.5 rounded-2xl text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Restaurar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto bg-primary text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[20px] ${isSaving ? 'animate-spin' : ''}`}>
                  {isSaving ? 'progress_activity' : 'save'}
                </span>
                {isSaving ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= BANNERS DEL HOME SECTION ================= */}
      {activeSection === 'banners' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header de Banners */}
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-outline-variant/10 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[22px]">view_carousel</span>
                </div>
                <h3 className="font-black text-xl text-on-surface">Carrusel de Banners del Home</h3>
              </div>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl">
                Personalizá los carteles y promociones que ven los clientes al ingresar a la tienda online. Podés definir imágenes, textos y enlaces directos a categorías o secciones.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={handleResetBanners}
                className="px-4 py-2.5 rounded-xl border border-outline-variant/20 hover:bg-surface-container text-on-surface-variant font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Restablecer banners predeterminados de Martina Supermercado"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                Banners por Defecto
              </button>
              <button
                type="button"
                onClick={handleOpenCreateBanner}
                className="bg-primary text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl hover:bg-primary/90 shadow-md shadow-primary/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer ml-auto md:ml-0"
              >
                <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
                + Nuevo Banner
              </button>
            </div>
          </div>

          {/* Listado de Banners Actuales */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h4 className="font-black text-base text-on-surface flex items-center gap-2">
                <span>Banners Configurados</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-bold">
                  {(heroBanners && heroBanners.length > 0 ? heroBanners : defaultHeroBanners).length}
                </span>
              </h4>
              <span className="text-xs text-on-surface-variant font-medium">
                Los banners se muestran en el carrusel en este orden
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {(heroBanners && heroBanners.length > 0 ? heroBanners : defaultHeroBanners)
                .sort((a, b) => a.order - b.order)
                .map((banner, index, arr) => {
                  return (
                    <div
                      key={banner.id}
                      className={`bg-white rounded-2xl sm:rounded-3xl border transition-all p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs hover:shadow-md ${banner.active
                        ? 'border-outline-variant/15'
                        : 'border-outline-variant/10 opacity-60 bg-surface-container-lowest/50'
                        }`}
                    >
                      {/* Miniatura y Detalles */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                        {/* Preview miniatura */}
                        <div className="relative w-full sm:w-48 h-28 sm:h-28 rounded-2xl overflow-hidden bg-surface-container shrink-0 border border-outline-variant/20 shadow-inner group">
                          <img
                            src={banner.imageUrl}
                            alt={banner.title || 'Banner'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                            <span className="text-[10px] font-black text-white px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-xs">
                              Slide #{index + 1}
                            </span>
                          </div>
                          {banner.badge && (
                            <span className="absolute top-2 left-2 text-[9px] font-black text-white px-2 py-0.5 rounded-full bg-primary/90 backdrop-blur-xs">
                              {banner.badge}
                            </span>
                          )}
                        </div>

                        {/* Textos y metadata */}
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-black text-base text-on-surface truncate">
                              {banner.title || <span className="italic text-on-surface-variant font-normal">Sin título (solo imagen)</span>}
                            </h5>
                            {banner.active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100/80 px-2.5 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                                Visible
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                                Oculto
                              </span>
                            )}
                          </div>

                          {banner.subtitle && (
                            <p className="text-xs text-on-surface-variant line-clamp-1 max-w-lg">
                              {banner.subtitle}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant/80 pt-1">
                            {banner.linkUrl ? (
                              <span className="flex items-center gap-1 font-mono text-[11px] bg-surface-container-high px-2 py-0.5 rounded-md text-primary font-bold">
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                {banner.linkUrl}
                                {banner.linkExternal && ' ↗'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-on-surface-variant/60">
                                Sin redirección (solo informativo)
                              </span>
                            )}

                            {banner.linkLabel && (
                              <span className="text-[11px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-md">
                                Botón: "{banner.linkLabel}"
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botones de Control */}
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-outline-variant/10">
                        {/* Toggle activo */}
                        <button
                          type="button"
                          onClick={() => toggleHeroBannerActive(banner.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${banner.active
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                          title={banner.active ? 'Ocultar del Home' : 'Mostrar en el Home'}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {banner.active ? 'visibility' : 'visibility_off'}
                          </span>
                          <span className="hidden sm:inline">{banner.active ? 'Activo' : 'Oculto'}</span>
                        </button>

                        {/* Mover orden */}
                        <div className="flex items-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveBanner(index, 'up')}
                            className="p-2 hover:bg-surface-container text-on-surface-variant disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                            title="Subir posición"
                          >
                            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                          </button>
                          <button
                            type="button"
                            disabled={index === arr.length - 1}
                            onClick={() => handleMoveBanner(index, 'down')}
                            className="p-2 hover:bg-surface-container text-on-surface-variant disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors border-l border-outline-variant/20"
                            title="Bajar posición"
                          >
                            <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                          </button>
                        </div>

                        {/* Editar */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditBanner(banner)}
                          className="p-2.5 rounded-xl border border-outline-variant/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-on-surface font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                          title="Editar banner"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                          <span className="hidden sm:inline">Editar</span>
                        </button>

                        {/* Eliminar */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBanner(banner.id)}
                          className="p-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                          title="Eliminar banner"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Modal / Formulario de Creación y Edición */}
          {isBannerModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
              <div className="bg-white rounded-[2.5rem] max-w-3xl w-full border border-outline-variant/20 shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-6 sm:p-7 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-[24px]">
                        {editingBannerId ? 'edit_note' : 'add_photo_alternate'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-on-surface">
                        {editingBannerId ? 'Editar Banner del Home' : 'Crear Nuevo Banner'}
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Completá los datos del banner. Los textos y el enlace son totalmente opcionales.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBannerModalOpen(false)}
                    className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSaveBanner} className="p-6 sm:p-7 space-y-6">
                  {/* Vista Previa en Vivo */}
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Vista previa en vivo</span>
                      <span className="text-[10px] text-primary lowercase font-normal">Así se verá en la tienda</span>
                    </label>

                    <div className="relative w-full h-[180px] sm:h-[220px] rounded-2xl overflow-hidden shadow-md bg-surface-variant border border-outline-variant/20 flex items-center">
                      {bannerForm.imageUrl ? (
                        <img
                          src={bannerForm.imageUrl}
                          alt="Preview"
                          className="absolute inset-0 w-full h-full object-cover z-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200';
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/40 bg-surface-container-high">
                          <span className="material-symbols-outlined text-4xl mb-1">image</span>
                          <span className="text-xs font-bold">Ingresá una URL de imagen abajo para ver la vista previa</span>
                        </div>
                      )}

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent z-10" />

                      {/* Content preview */}
                      <div className="relative z-20 px-6 sm:px-8 max-w-xl text-white">
                        {bannerForm.badge && (
                          <span className="inline-flex items-center gap-1 bg-secondary-container text-on-secondary-container font-label-sm px-2.5 py-0.5 rounded-full mb-2 font-extrabold tracking-wider uppercase text-[10px] shadow-xs">
                            <span className="material-symbols-outlined text-[12px]">verified</span>
                            {bannerForm.badge}
                          </span>
                        )}
                        {bannerForm.title && (
                          <h4 className="font-display-xl text-lg sm:text-2xl font-black leading-tight mb-1 text-white line-clamp-1">
                            {bannerForm.title}
                          </h4>
                        )}
                        {bannerForm.subtitle && (
                          <p className="font-body-md text-xs sm:text-sm mb-3 opacity-90 text-white/90 line-clamp-2 max-w-md">
                            {bannerForm.subtitle}
                          </p>
                        )}
                        {bannerForm.linkLabel && (
                          <div className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-sm">
                            <span>{bannerForm.linkLabel}</span>
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campo URL de Imagen */}
                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      URL de la Imagen <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={bannerForm.imageUrl}
                      onChange={(e) => setBannerForm((p) => ({ ...p, imageUrl: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all font-mono"
                      placeholder="https://images.unsplash.com/..."
                    />

                    {/* Presets rápidos de imágenes recomendadas */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-on-surface-variant font-bold mr-1">Fotos sugeridas:</span>
                      {[
                        { label: 'Supermercado', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1600' },
                        { label: 'Carnicería', url: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&q=80&w=1600' },
                        { label: 'Verdulería', url: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&q=80&w=1600' },
                        { label: 'Bebidas', url: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&q=80&w=1600' },
                        { label: 'Delivery', url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&q=80&w=1600' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setBannerForm((p) => ({ ...p, imageUrl: preset.url }))}
                          className="text-[10px] font-bold bg-surface-container px-2.5 py-1 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                        >
                          + {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Título y Subtítulo (Opcionales) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Título Principal <span className="text-on-surface-variant/60 font-normal lowercase">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={bannerForm.title || ''}
                        onChange={(e) => setBannerForm((p) => ({ ...p, title: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="Ej: Ofertas de Fin de Semana"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                        Badge / Etiqueta <span className="text-on-surface-variant/60 font-normal lowercase">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={bannerForm.badge || ''}
                        onChange={(e) => setBannerForm((p) => ({ ...p, badge: e.target.value }))}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                        placeholder="Ej: 🔥 20% OFF o NUEVO"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                      Subtítulo Descriptivo <span className="text-on-surface-variant/60 font-normal lowercase">(opcional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={bannerForm.subtitle || ''}
                      onChange={(e) => setBannerForm((p) => ({ ...p, subtitle: e.target.value }))}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2.5 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all resize-none"
                      placeholder="Ej: Aprovechá los mejores cortes con hasta 20% de descuento en efectivo."
                    />
                  </div>

                  {/* Redirección / Link y Botón CTA */}
                  <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-4">
                    <h5 className="font-black text-sm text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">navigation</span>
                      Acción y Redirección al Hacer Click
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                          URL o Ruta de Destino <span className="text-on-surface-variant/60 font-normal lowercase">(opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={bannerForm.linkUrl || ''}
                          onChange={(e) => setBannerForm((p) => ({ ...p, linkUrl: e.target.value }))}
                          className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 font-mono text-xs outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                          placeholder="/category/carnes o https://instagram.com/..."
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                          Texto del Botón CTA <span className="text-on-surface-variant/60 font-normal lowercase">(opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={bannerForm.linkLabel || ''}
                          onChange={(e) => setBannerForm((p) => ({ ...p, linkLabel: e.target.value }))}
                          className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                          placeholder="Ej: Comprar Ahora o Ver Más"
                        />
                      </div>
                    </div>

                    {/* Accesos rápidos de rutas */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-on-surface-variant">Rutas rápidas:</span>
                      {[
                        { label: 'Almacén', path: '/category/almacen' },
                        { label: 'Bebidas', path: '/category/bebidas' },
                        { label: 'Carnes', path: '/category/carnes' },
                        { label: 'Lácteos', path: '/category/lacteos' },
                        { label: 'Limpieza', path: '/category/limpieza' },
                        { label: 'Perfumería', path: '/category/perfumeria' },
                        { label: 'Envíos / Delivery', path: '/delivery' },
                        { label: 'Calculadora en Local', path: '/calculadora-compras' },
                      ].map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => setBannerForm((p) => ({ ...p, linkUrl: item.path }))}
                          className="text-[10px] font-mono bg-white border border-outline-variant/20 px-2 py-0.5 rounded-md hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="linkExternal"
                        checked={bannerForm.linkExternal || false}
                        onChange={(e) => setBannerForm((p) => ({ ...p, linkExternal: e.target.checked }))}
                        className="w-4 h-4 rounded text-primary focus:ring-primary/20 cursor-pointer"
                      />
                      <label htmlFor="linkExternal" className="text-xs font-bold text-on-surface cursor-pointer select-none">
                        Abrir enlace en una nueva pestaña (recomendado para links externos como redes sociales)
                      </label>
                    </div>
                  </div>

                  {/* Switch Activo / Visible */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/15">
                    <div>
                      <p className="font-bold text-sm text-on-surface">Activo y visible en la tienda</p>
                      <p className="text-xs text-on-surface-variant">
                        Si está desactivado, el banner quedará guardado pero no se mostrará a los clientes.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bannerForm.active}
                        onChange={(e) => setBannerForm((p) => ({ ...p, active: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Botones de Acción */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/10">
                    <button
                      type="button"
                      onClick={() => setIsBannerModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl border border-outline-variant/20 hover:bg-surface-container font-bold text-sm text-on-surface-variant transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-primary text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-primary/90 shadow-md shadow-primary/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[20px]">check</span>
                      {editingBannerId ? 'Guardar Cambios' : 'Crear Banner'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Tips y Recomendaciones */}
          <div className="bg-blue-50/50 rounded-[2rem] border border-blue-100 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-blue-600 text-2xl">tips_and_updates</span>
              <div>
                <h4 className="font-black text-blue-900 text-base">Recomendaciones para los Banners</h4>
                <p className="text-xs text-blue-800/70">Consejos para que el carrusel de tu tienda se vea profesional</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-blue-900/90">
              <div className="bg-white/60 p-4 rounded-xl border border-blue-100/60">
                <p className="font-bold mb-1">📐 Proporción y Tamaño</p>
                <p className="text-blue-800">
                  Usá imágenes horizontales (aprox. 1600x600 px o proporción 16:9). El sistema las adaptará automáticamente en teléfonos y computadoras.
                </p>
              </div>

              <div className="bg-white/60 p-4 rounded-xl border border-blue-100/60">
                <p className="font-bold mb-1">🔗 Enlaces a Categorías</p>
                <p className="text-blue-800">
                  Vinculá tus banners con las categorías correspondientes (ej: <code className="bg-blue-100/80 px-1 py-0.5 rounded font-mono">/category/carnes</code>) para que los clientes compren con un solo click.
                </p>
              </div>

              <div className="bg-white/60 p-4 rounded-xl border border-blue-100/60">
                <p className="font-bold mb-1">🖼️ Banners con o sin Texto</p>
                <p className="text-blue-800">
                  Si tu imagen ya tiene el diseño y los textos incluidos, podés dejar los campos de título y subtítulo vacíos. La imagen se verá completa sin superposiciones.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

          {/* ================= REPOSICIÓN DE INVENTARIO ================= */}
          {activeSection === 'inventory' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-outline-variant/10 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="material-symbols-outlined text-primary text-[28px]">inventory_2</span>
                    <h2 className="text-xl font-black text-on-surface">Reposición Inteligente</h2>
                  </div>
                  <p className="text-sm text-on-surface-variant font-medium">
                    Parámetros para el cálculo de alertas de stock dinámico basados en el historial de ventas.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-outline-variant/10 shadow-sm space-y-7">
                {/* Encender / Apagar */}
                <div className="flex items-center justify-between p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15">
                  <div>
                    <h4 className="text-sm font-black text-on-surface">Habilitar cálculo dinámico</h4>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Si se desactiva, el dashboard utilizará el criterio de stock tradicional.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={replenishmentForm.enabled}
                      onChange={(e) => setReplenishmentForm(prev => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {/* Params */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                      Historial (semanas)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={replenishmentForm.historyWeeks}
                      onChange={(e) => handleReplenishmentChange('historyWeeks', e.target.value)}
                      onBlur={() => handleReplenishmentBlur('historyWeeks', defaultReplenishmentConfig.historyWeeks)}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    />
                    <p className="text-[10px] text-on-surface-variant leading-tight">Cuántas semanas hacia atrás se usan para promediar (4 a 52).</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                      Días de cobertura
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={replenishmentForm.coverageDays}
                      onChange={(e) => handleReplenishmentChange('coverageDays', e.target.value)}
                      onBlur={() => handleReplenishmentBlur('coverageDays', defaultReplenishmentConfig.coverageDays)}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    />
                    <p className="text-[10px] text-on-surface-variant leading-tight">Cantidad de días que la compra recomendada busca cubrir, según el ritmo de ventas y el margen de seguridad.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                      Anticipación para reposición (días)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={replenishmentForm.anticipationDays}
                      onChange={(e) => handleReplenishmentChange('anticipationDays', e.target.value)}
                      onBlur={() => handleReplenishmentBlur('anticipationDays', defaultReplenishmentConfig.anticipationDays)}
                      className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    />
                    <p className="text-[10px] text-on-surface-variant leading-tight">Con cuántos días de anticipación quieres enterarte de que un producto necesitará reposición para poder incluirlo en la próxima compra.</p>
                  </div>
                </div>

                {/* Márgenes */}
                <div className="space-y-5">
                  <div>
                    <h4 className="text-xs font-black text-on-surface uppercase tracking-wider border-b border-outline-variant/10 pb-2 mb-2">Márgenes de Seguridad</h4>
                    <p className="text-[11px] text-on-surface-variant">
                      El margen de seguridad se aplica sobre el promedio, compensando picos de demanda según cuán confiable sea el historial del producto.
                    </p>
                  </div>
                  
                  {/* Umbrales de Historial */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                        Umbral Historial Completo (sem)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={replenishmentForm.thresholdComplete}
                        onChange={(e) => handleReplenishmentChange('thresholdComplete', e.target.value)}
                        onBlur={() => handleReplenishmentBlur('thresholdComplete', defaultReplenishmentConfig.thresholdComplete)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                      <p className="text-[10px] text-on-surface-variant leading-tight">Semanas mínimas para considerar historial completo (margen bajo).</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                        Umbral Parcial (sem)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={replenishmentForm.thresholdPartial}
                        onChange={(e) => handleReplenishmentChange('thresholdPartial', e.target.value)}
                        onBlur={() => handleReplenishmentBlur('thresholdPartial', defaultReplenishmentConfig.thresholdPartial)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                      <p className="text-[10px] text-on-surface-variant leading-tight">Semanas mínimas para considerar historial parcial (margen medio).</p>
                    </div>
                  </div>

                  {/* Porcentajes de Margen */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                        Margen BAJO (%)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={replenishmentForm.marginLow}
                        onChange={(e) => handleReplenishmentChange('marginLow', e.target.value)}
                        onBlur={() => handleReplenishmentBlur('marginLow', defaultReplenishmentConfig.marginLow)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                        Margen MEDIO (%)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={replenishmentForm.marginMedium}
                        onChange={(e) => handleReplenishmentChange('marginMedium', e.target.value)}
                        onBlur={() => handleReplenishmentBlur('marginMedium', defaultReplenishmentConfig.marginMedium)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider block">
                        Margen ALTO (%)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={replenishmentForm.marginHigh}
                        onChange={(e) => handleReplenishmentChange('marginHigh', e.target.value)}
                        onBlur={() => handleReplenishmentBlur('marginHigh', defaultReplenishmentConfig.marginHigh)}
                        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                      />
                      <p className="text-[10px] text-on-surface-variant leading-tight">Para historial insuficiente.</p>
                    </div>
                  </div>
                </div>

                {saveError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <span>{saveError}</span>
                  </div>
                )}

                <div className="pt-6 border-t border-outline-variant/10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-primary text-white font-bold text-sm px-8 py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                    ) : (
                      <span className="material-symbols-outlined">save</span>
                    )}
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </div>
          )}


      {/* ================= MODAL CREAR / EDITAR FRANJA HORARIA ================= */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-outline-variant/10 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">{slotForm.icon || 'schedule'}</span>
                </div>
                <div>
                  <h3 className="font-black text-lg text-on-surface">
                    {editingSlotId ? 'Editar Franja Horaria' : 'Nueva Franja Horaria'}
                  </h3>
                  <p className="text-xs text-on-surface-variant">Configurá la opción disponible para el cliente en el checkout</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSlotModalOpen(false)}
                className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSlot} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Título / Etiqueta */}
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                  Nombre de la Opción *
                </label>
                <input
                  type="text"
                  required
                  value={slotForm.label}
                  onChange={e => setSlotForm(p => ({ ...p, label: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                  placeholder="Ej: Hoy al Mediodía o Hoy a la Tarde"
                />
              </div>

              {/* Subtítulo / Rango Horario */}
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                  Subtítulo o Aclaración de Horario *
                </label>
                <input
                  type="text"
                  required
                  value={slotForm.sub}
                  onChange={e => setSlotForm(p => ({ ...p, sub: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2.5 font-medium text-sm outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                  placeholder="Ej: 13:00 a 14:00 hs o 30-60 min"
                />
              </div>

              {/* Selector de Ícono */}
              <div>
                <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                  Ícono Representativo
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    { icon: 'bolt', label: 'Rayo' },
                    { icon: 'sunny', label: 'Mediodía' },
                    { icon: 'wb_twilight', label: 'Tarde' },
                    { icon: 'dark_mode', label: 'Noche' },
                    { icon: 'event', label: 'Mañana' },
                    { icon: 'schedule', label: 'Reloj' },
                    { icon: 'moped', label: 'Moto' },
                    { icon: 'storefront', label: 'Retiro' }
                  ].map(item => (
                    <button
                      key={item.icon}
                      type="button"
                      onClick={() => setSlotForm(p => ({ ...p, icon: item.icon }))}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${slotForm.icon === item.icon
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-surface-container-lowest border-outline-variant/20 text-on-surface hover:bg-surface-container-low'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px] p-2 bg-surface-container-lowest rounded-xl border border-outline-variant/20">
                    {slotForm.icon || 'schedule'}
                  </span>
                  <input
                    type="text"
                    value={slotForm.icon}
                    onChange={e => setSlotForm(p => ({ ...p, icon: e.target.value }))}
                    className="flex-1 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 ring-primary/10 transition-all"
                    placeholder="Nombre del ícono Material Symbol (ej: alarm, local_shipping)"
                  />
                </div>
              </div>

              {/* Modalidad de Disponibilidad */}
              <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                <label className="text-[11px] font-black text-on-surface uppercase tracking-wider block">
                  Tipo de Disponibilidad y Horario Límite
                </label>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-outline-variant/15 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="slotMode"
                      checked={slotForm.mode === 'asap'}
                      onChange={() => setSlotForm(p => ({ ...p, mode: 'asap' }))}
                      className="accent-primary mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs text-on-surface">Entrega Inmediata ("Lo antes posible")</p>
                      <p className="text-[11px] text-on-surface-variant">
                        Sujeto al horario comercial del supermercado (no 24 hs).
                      </p>

                      {slotForm.mode === 'asap' && (
                        <div className="mt-3 p-3 bg-white rounded-xl border border-outline-variant/20 space-y-2.5 animate-in fade-in">
                          <p className="text-[11px] font-bold text-on-surface">
                            Horario de Atención para Pedidos Inmediatos:
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider block mb-1">
                                Apertura (Desde)
                              </label>
                              <input
                                type="time"
                                value={slotForm.startTime}
                                onChange={e => setSlotForm(p => ({ ...p, startTime: e.target.value }))}
                                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-1.5 font-bold text-xs outline-none focus:border-primary"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider block mb-1">
                                Cierre (Hasta)
                              </label>
                              <input
                                type="time"
                                value={slotForm.endTime}
                                onChange={e => setSlotForm(p => ({ ...p, endTime: e.target.value }))}
                                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-1.5 font-bold text-xs outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/50 leading-tight">
                            ℹ️ Si el cliente entra a la tienda fuera de este horario ({slotForm.startTime} a {slotForm.endTime} hs), esta opción aparecerá deshabilitada avisando que el local está cerrado.
                          </p>
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-outline-variant/15 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="slotMode"
                      checked={slotForm.mode === 'today'}
                      onChange={() => setSlotForm(p => ({ ...p, mode: 'today' }))}
                      className="accent-primary mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs text-on-surface">Hoy con hora límite de corte</p>
                      <p className="text-[11px] text-on-surface-variant mb-2">
                        Si la hora actual supera este horario, la opción se mostrará deshabilitada para hoy.
                      </p>
                      {slotForm.mode === 'today' && (
                        <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                          <label className="text-xs font-bold text-on-surface shrink-0">Hora límite de corte:</label>
                          <input
                            type="time"
                            value={slotForm.cutoffTime}
                            onChange={e => setSlotForm(p => ({ ...p, cutoffTime: e.target.value }))}
                            className="bg-white border border-outline-variant/30 rounded-lg px-3 py-1.5 font-bold text-xs outline-none focus:border-primary"
                          />
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant/15 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="slotMode"
                      checked={slotForm.mode === 'tomorrow'}
                      onChange={() => setSlotForm(p => ({ ...p, mode: 'tomorrow' }))}
                      className="accent-primary"
                    />
                    <div>
                      <p className="font-bold text-xs text-on-surface">Para el día siguiente (Mañana)</p>
                      <p className="text-[11px] text-on-surface-variant">Ideal para pedidos programados de mañana. No se bloquea por la hora de hoy.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Costo de Envío para este Horario */}
              <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/15 space-y-3">
                <label className="text-[11px] font-black text-on-surface uppercase tracking-wider block">
                  Costo de Envío para este Horario
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-outline-variant/15 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="slotFreeShipping"
                      checked={!slotForm.freeShipping}
                      onChange={() => setSlotForm(p => ({ ...p, freeShipping: false }))}
                      className="accent-primary mt-0.5"
                    />
                    <div>
                      <p className="font-bold text-xs text-on-surface">Costo Ajustable Estándar</p>
                      <p className="text-[11px] text-on-surface-variant">
                        Se calcula según la distancia en km y la tarifa base de la tienda.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-outline-variant/15 hover:bg-surface-container-low cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="slotFreeShipping"
                      checked={slotForm.freeShipping}
                      onChange={() => setSlotForm(p => ({ ...p, freeShipping: true }))}
                      className="accent-primary mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-xs text-green-700">Envío Gratis / Bonificado</p>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-green-100 text-green-800">
                          Promo
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant">
                        El costo de entrega a domicilio para esta franja horaria será de $0 (sin costo para el cliente).
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Toggle Habilitado */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/15">
                <div>
                  <p className="font-bold text-xs text-on-surface">Opción habilitada</p>
                  <p className="text-[11px] text-on-surface-variant">Si está desactivada, no se mostrará a los clientes en el checkout.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slotForm.enabled}
                    onChange={e => setSlotForm(p => ({ ...p, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-3 pb-1 border-t border-outline-variant/10 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-outline-variant/20 hover:bg-surface-container font-bold text-xs text-on-surface-variant transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-primary text-white font-bold text-xs px-6 py-2.5 rounded-xl hover:bg-primary/90 shadow-md shadow-primary/20 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  {editingSlotId ? 'Guardar Cambios' : 'Crear Franja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
