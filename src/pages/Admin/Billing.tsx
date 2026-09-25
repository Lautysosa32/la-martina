import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import type { Invoice, BillingCustomer, InvoiceItem } from '../../context/AdminContext';
import { useScrollLock } from '../../utils/useScrollLock';
import { billingService, FiscalStatusResult } from '../../services/billing.service';
import { determineInvoiceType, validateCuit, recalculateFiscalInvoice } from '../../../server/services/arca/arcaTaxRules';
import { useProductStore } from '../../stores/useProductStore';
import { buildCreatorItemsFromOrders } from '../../utils/billingProductMapper';

type TabId = 'ventas' | 'globales' | 'clientes' | 'config';

export const Billing: React.FC = () => {
  const storeProducts = useProductStore(state => state.products);
  const fetchProducts = useProductStore(state => state.fetchProducts);

  useEffect(() => {
    if (storeProducts.length === 0) {
      fetchProducts();
    }
  }, [storeProducts.length, fetchProducts]);

  const {
    invoices,
    addInvoice,
    refreshInvoices,
    orders,
    customers,
    updateCustomerProfile,
    billingCustomers,
    addBillingCustomer,
    updateBillingCustomer,
    deleteBillingCustomer,
    fiscalConfig,
    formatCurrency
  } = useAdmin();

  const [headerPortal, setHeaderPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderPortal(document.getElementById('admin-header-portal'));
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>('ventas');
  const [searchQuery, setSearchQuery] = useState('');
  const [unbilledSearchQuery, setUnbilledSearchQuery] = useState('');
  const [showInvoiceDetail, setShowInvoiceDetail] = useState<Invoice | null>(null);
  const [showUnbilledModal, setShowUnbilledModal] = useState(false);
  const [enlargedQrUrl, setEnlargedQrUrl] = useState<string | null>(null);

  // ─── ESTADO DE CONEXIÓN FISCAL ARCA ──────────────────────────────
  const [arcaStatus, setArcaStatus] = useState<FiscalStatusResult | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const [res] = await Promise.all([
        billingService.checkStatus(),
        refreshInvoices()
      ]);
      setArcaStatus(res);
      if (res.connected) {
        setStatusNotification('Conexión con ARCA verificada exitosamente.');
      } else {
        setStatusNotification('Atención: Uno o más servicios de ARCA no responden.');
      }
    } catch (err: any) {
      console.error('[Billing checkConnection error]:', err);
      const msg = err.response?.data?.error || err.message || 'No se pudo establecer comunicación con el backend fiscal.';
      setStatusNotification(msg);
    } finally {
      setIsCheckingStatus(false);
      setTimeout(() => setStatusNotification(null), 5000);
    }
  }, [refreshInvoices]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Clientes Fiscales state
  const [showNewBillingCustomer, setShowNewBillingCustomer] = useState(false);
  const [bcForm, setBcForm] = useState<{
    name: string;
    cuit: string;
    address: string;
    phone: string;
    email: string;
    taxCondition: string;
    documentType: 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR';
    documentNumber: string;
    notes: string;
  }>({
    name: '',
    cuit: '',
    address: '',
    phone: '',
    email: '',
    taxCondition: 'Consumidor Final',
    documentType: 'DNI',
    documentNumber: '',
    notes: ''
  });
  const [editingBc, setEditingBc] = useState<string | null>(null);
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState<string>('');
  const [bcError, setBcError] = useState('');

  // Multi-ticket billing and Detailed Creator states
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [showDetailedCreator, setShowDetailedCreator] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authorizationStep, setAuthorizationStep] = useState<string>('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // ─── ESTADO PARA ARQUITECTURA NC / ND (MODELO PREPARADO) ─────────
  const [showNcNdPreparationModal, setShowNcNdPreparationModal] = useState<{
    invoice: Invoice;
    action: 'NC' | 'ND';
  } | null>(null);
  const [ncNdReason, setNcNdReason] = useState('Anulación total de la operación');
  const [ncNdNotes, setNcNdNotes] = useState('');

  // ─── ESTADOS PARA FACTURAS EXTERNAS Y AUDITORÍA DE NUMERACIÓN ─────
  const [salesFilter, setSalesFilter] = useState<'TODAS' | 'SISTEMA' | 'EXTERNAS' | 'VERIFICADAS' | 'PENDIENTES' | 'AUTORIZADAS' | 'RECHAZADAS' | 'NC' | 'ND'>('TODAS');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [showExternalModal, setShowExternalModal] = useState(false);
  const [extType, setExtType] = useState<string>('B');
  const [extPointOfSale, setExtPointOfSale] = useState<number>(1);
  const [extNumber, setExtNumber] = useState<number | ''>('');
  const [extDate, setExtDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [extClientName, setExtClientName] = useState<string>('Consumidor Final');
  const [extDocType, setExtDocType] = useState<'DNI' | 'CUIT' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR'>('DNI');
  const [extDocNumber, setExtDocNumber] = useState<string>('');
  const [extTaxCondition, setExtTaxCondition] = useState<string>('Consumidor Final');
  const [extSubtotalNet, setExtSubtotalNet] = useState<number | ''>('');
  const [extTaxes, setExtTaxes] = useState<number | ''>('');
  const [extTotal, setExtTotal] = useState<number | ''>('');
  const [extCae, setExtCae] = useState<string>('');
  const [extCaeExpiration, setExtCaeExpiration] = useState<string>('');
  const [extNotes, setExtNotes] = useState<string>('');
  const [extAttachmentUrl, setExtAttachmentUrl] = useState<string>('');
  const [extSaleId, setExtSaleId] = useState<string>('');
  const [isSavingExternal, setIsSavingExternal] = useState(false);
  const [externalSaveError, setExternalSaveError] = useState<string>('');
  const [isVerifyingExternalId, setIsVerifyingExternalId] = useState<string | null>(null);

  // Auditoría de Rango de Numeración
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeType, setRangeType] = useState<string>('B');
  const [rangePv, setRangePv] = useState<number>(1);
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(5);
  const [isCheckingRange, setIsCheckingRange] = useState(false);
  const [rangeReport, setRangeReport] = useState<any[] | null>(null);
  const [rangeError, setRangeError] = useState<string>('');

  // Bloquear scroll de fondo cuando haya algún modal abierto en Facturación
  const hasBillingModalOpen = !!showInvoiceDetail || showUnbilledModal || showNewBillingCustomer || showDetailedCreator || confirmModalOpen || !!enlargedQrUrl || !!showNcNdPreparationModal || showExternalModal || showRangeModal;
  useScrollLock(hasBillingModalOpen);

  const [detailedCreatorMode, setDetailedCreatorMode] = useState<'venta' | 'compra'>('venta');

  // Detailed creator form states
  const [creatorClientName, setCreatorClientName] = useState('');
  const [creatorClientCuit, setCreatorClientCuit] = useState('');
  const [creatorClientDocType, setCreatorClientDocType] = useState<'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR'>('DNI');
  const [creatorClientDocNumber, setCreatorClientDocNumber] = useState('');
  const [creatorClientAddress, setCreatorClientAddress] = useState('');
  const [creatorClientPhone, setCreatorClientPhone] = useState('');
  const [creatorClientEmail, setCreatorClientEmail] = useState('');
  const [creatorClientTaxCondition, setCreatorClientTaxCondition] = useState('Consumidor Final');
  const [creatorDate, setCreatorDate] = useState('');
  const [creatorPointOfSale, setCreatorPointOfSale] = useState(1);
  const [creatorNextNumber, setCreatorNextNumber] = useState<number | null>(null);
  const [creatorType, setCreatorType] = useState<'A' | 'B' | 'C'>('B');
  const [creatorTypeReason, setCreatorTypeReason] = useState('');
  const [creatorItems, setCreatorItems] = useState<InvoiceItem[]>([]);
  const [creatorPricesIncludeTax, setCreatorPricesIncludeTax] = useState(true);
  const [selectedBillingCustomerId, setSelectedBillingCustomerId] = useState('');
  const [creatorError, setCreatorError] = useState('');
  const [unknownOpId, setUnknownOpId] = useState<string | null>(null);

  // Filtros avanzados para Ventas No Facturadas
  const [unbilledDateFrom, setUnbilledDateFrom] = useState('');
  const [unbilledDateTo, setUnbilledDateTo] = useState('');
  const [unbilledMinAmount, setUnbilledMinAmount] = useState<number | ''>('');

  // Sincronizar número de comprobante sugerido cuando cambia el tipo o punto de venta
  const fetchNextVoucher = useCallback(async (pv: number, type: string) => {
    try {
      const res = await billingService.getLastVoucherNumber(pv, type);
      setCreatorNextNumber(res.nextNumber);
    } catch {
      setCreatorNextNumber(null);
    }
  }, []);

  // Filter unbilled POS sales with search filter by ID/Ticket, Customer, and Date
  const unbilledOrders = useMemo(() => {
    const saleOrders = orders.filter(o => {
      if (o.status === 'Cancelado') return false;
      return !invoices.find(i => {
        if (i.status === 'RECHAZADA') return false; // Las rechazadas siguen pendientes
        if (!i.saleId) return false;
        const ids = i.saleId.split(',').map(s => s.trim());
        return ids.includes(o.id) || (i.saleIds && i.saleIds.includes(o.id));
      });
    });

    return saleOrders.filter(o => {
      if (unbilledSearchQuery.trim()) {
        const q = unbilledSearchQuery.toLowerCase();
        const matchesId = o.id.toLowerCase().includes(q);
        const matchesCust = o.customer.toLowerCase().includes(q);
        const matchesDni = o.dni && o.dni.toLowerCase().includes(q);
        if (!matchesId && !matchesCust && !matchesDni) return false;
      }
      if (unbilledMinAmount !== '' && o.total < Number(unbilledMinAmount)) {
        return false;
      }
      return true;
    });
  }, [orders, invoices, unbilledSearchQuery, unbilledMinAmount]);

  // Validación de Consolidación de Ventas Múltiples
  const consolidationValidation = useMemo(() => {
    if (selectedSaleIds.length <= 1) {
      return { valid: true, error: null };
    }

    const selectedOrders = orders.filter(o => selectedSaleIds.includes(o.id));
    if (selectedOrders.length === 0) return { valid: true, error: null };

    // 1. Verificar si hay ventas canceladas
    const hasCancelled = selectedOrders.some(o => o.status === 'Cancelado');
    if (hasCancelled) {
      return { valid: false, error: 'No es posible consolidar ventas que han sido canceladas.' };
    }

    // 2. Verificar clientes
    const uniqueCustomers = Array.from(new Set(selectedOrders.map(o => (o.customer || '').trim().toLowerCase())));
    const uniqueDnis = Array.from(new Set(selectedOrders.map(o => (o.dni || '').trim())));

    // Si los DNI o clientes difieren y no son Consumidor Final genérico
    const isGenericCF = uniqueCustomers.every(c => c === 'consumidor final' || c === 'cliente mostrador' || c === '');
    if (!isGenericCF && (uniqueCustomers.length > 1 || uniqueDnis.filter(Boolean).length > 1)) {
      return {
        valid: false,
        error: 'Las ventas seleccionadas pertenecen a clientes diferentes. Solo pueden consolidarse ventas del mismo cliente.'
      };
    }

    return { valid: true, error: null };
  }, [selectedSaleIds, orders]);

  // Filter invoices for active tab, search query and salesFilter
  const filteredInvoices = useMemo(() => {
    let baseFiltered = invoices.filter(inv => (inv.direction || 'venta') === 'venta');

    if (activeTab === 'ventas') {
      if (salesFilter === 'SISTEMA') {
        baseFiltered = baseFiltered.filter(inv => inv.origin === 'ARCA_LOCAL' || !inv.origin);
      } else if (salesFilter === 'EXTERNAS') {
        baseFiltered = baseFiltered.filter(inv => inv.origin === 'EXTERNA_MANUAL');
      } else if (salesFilter === 'VERIFICADAS') {
        baseFiltered = baseFiltered.filter(inv => inv.status === 'VERIFICADA_EN_ARCA');
      } else if (salesFilter === 'PENDIENTES') {
        baseFiltered = baseFiltered.filter(inv => inv.status === 'REGISTRADA_EXTERNAMENTE');
      } else if (salesFilter === 'AUTORIZADAS') {
        baseFiltered = baseFiltered.filter(inv => inv.status === 'AUTORIZADA');
      } else if (salesFilter === 'RECHAZADAS') {
        baseFiltered = baseFiltered.filter(inv => inv.status === 'RECHAZADA');
      } else if (salesFilter === 'NC') {
        baseFiltered = baseFiltered.filter(inv => inv.type.startsWith('NC'));
      } else if (salesFilter === 'ND') {
        baseFiltered = baseFiltered.filter(inv => inv.type.startsWith('ND'));
      }
    }

    let result = baseFiltered;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = baseFiltered.filter(inv =>
        inv.folio.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        (inv.clientCuit && inv.clientCuit.toLowerCase().includes(q)) ||
        (inv.saleId && inv.saleId.toLowerCase().includes(q)) ||
        (inv.cae && inv.cae.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      const numA = Number(a.invoiceNumber) || (a.folio ? Number(a.folio.split('-').pop()) : 0) || 0;
      const numB = Number(b.invoiceNumber) || (b.folio ? Number(b.folio.split('-').pop()) : 0) || 0;
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });
  }, [invoices, activeTab, searchQuery, salesFilter, sortOrder]);

  // Detección reactiva de conflicto/duplicado en el formulario de Factura Externa
  const extConflict = useMemo(() => {
    if (!extNumber || isNaN(Number(extNumber))) return null;
    const num = Number(extNumber);
    const pv = Number(extPointOfSale) || 1;
    return invoices.find(inv => {
      const invPv = inv.pointOfSale || 1;
      const invNum = inv.invoiceNumber || 0;
      const invType = inv.type || inv.invoiceType || 'B';
      return invPv === pv && invType === extType && invNum === num;
    }) || null;
  }, [invoices, extNumber, extPointOfSale, extType]);

  const openExternalInvoiceModal = () => {
    setExtType('B');
    setExtPointOfSale(arcaStatus?.config.defaultPointOfSale || 1);
    setExtNumber('');
    setExtDate(new Date().toISOString().split('T')[0]);
    setExtClientName('Consumidor Final');
    setExtDocType('DNI');
    setExtDocNumber('');
    setExtTaxCondition('Consumidor Final');
    setExtSubtotalNet('');
    setExtTaxes('');
    setExtTotal('');
    setExtCae('');
    setExtCaeExpiration('');
    setExtNotes('');
    setExtAttachmentUrl('');
    setExtSaleId('');
    setExternalSaveError('');
    setShowExternalModal(true);
  };

  const openRangeModal = () => {
    setRangeType('B');
    setRangePv(arcaStatus?.config.defaultPointOfSale || 1);
    setRangeFrom(1);
    setRangeTo(5);
    setRangeReport(null);
    setRangeError('');
    setShowRangeModal(true);
  };

  const handleSaveExternalInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setExternalSaveError('');

    if (extConflict) {
      setExternalSaveError('Ya existe un comprobante registrado para este Punto de Venta, Tipo y Número.');
      return;
    }

    const num = Number(extNumber);
    if (!num || isNaN(num) || num <= 0) {
      setExternalSaveError('El número de comprobante es obligatorio y debe ser mayor a 0.');
      return;
    }

    const tot = Number(extTotal);
    if (isNaN(tot) || tot <= 0) {
      setExternalSaveError('El importe total es obligatorio y debe ser mayor a 0.');
      return;
    }

    if (!extClientName.trim()) {
      setExternalSaveError('La razón social o nombre del cliente es obligatoria.');
      return;
    }

    setIsSavingExternal(true);

    try {
      const res = await billingService.registerExternalInvoice({
        pointOfSale: Number(extPointOfSale) || 1,
        invoiceType: extType,
        invoiceNumber: num,
        date: extDate,
        customer: {
          name: extClientName.trim(),
          documentType: extDocType,
          documentNumber: extDocNumber.trim() || '0',
          cuit: extDocType === 'CUIT' ? extDocNumber.trim() : undefined,
          taxCondition: extTaxCondition
        },
        subtotalNet: extSubtotalNet !== '' ? Number(extSubtotalNet) : undefined,
        taxes: extTaxes !== '' ? Number(extTaxes) : undefined,
        total: tot,
        currency: 'PES',
        cae: extCae.trim() || undefined,
        caeExpirationDate: extCaeExpiration.trim() || undefined,
        notes: extNotes.trim() || undefined,
        attachmentUrl: extAttachmentUrl.trim() || undefined,
        saleIds: extSaleId ? [extSaleId] : undefined,
        requestedBy: 'Operador Mostrador'
      });

      if (!res.success) {
        setExternalSaveError(res.error || 'Error al registrar la factura externa.');
        setIsSavingExternal(false);
        return;
      }

      await refreshInvoices();
      setShowExternalModal(false);

      if (res.warning) {
        alert(`Factura externa Nº ${num} registrada exitosamente.\n\nADVERTENCIA:\n${res.warning}`);
      } else {
        alert(`Factura externa Nº ${num} registrada exitosamente.`);
      }

      if (res.invoice) {
        const fullInv = invoices.find(i => i.id === res.invoice.id) || {
          ...res.invoice,
          folio: `${String(res.invoice.point_of_sale || 1).padStart(4, '0')}-${String(res.invoice.invoice_number || num).padStart(8, '0')}`,
          clientName: extClientName,
          clientCuit: extDocNumber,
          type: extType as any,
          subtotal: Number(res.invoice.subtotal_net || 0),
          taxes: Number(res.invoice.taxes || 0),
          total: Number(res.invoice.total || tot),
          status: 'REGISTRADA_EXTERNAMENTE' as any,
          origin: 'EXTERNA_MANUAL' as any
        };
        setShowInvoiceDetail(fullInv as any);
      }
    } catch (err: any) {
      setExternalSaveError(err.message || 'Error inesperado al registrar.');
    } finally {
      setIsSavingExternal(false);
    }
  };

  const handleVerifyExternal = async (invoiceId: string) => {
    setIsVerifyingExternalId(invoiceId);
    try {
      const res = await billingService.verifyExternalInvoice(invoiceId, 'Operador');
      if (res.success && res.verified) {
        alert('✓ ¡Comprobante verificado y confirmado exitosamente en ARCA!');
        await refreshInvoices();
        if (showInvoiceDetail && showInvoiceDetail.id === invoiceId) {
          setShowInvoiceDetail(prev => prev ? {
            ...prev,
            status: 'VERIFICADA_EN_ARCA',
            cae: res.cae || prev.cae,
            caeExpirationDate: res.caeExpirationDate || prev.caeExpirationDate
          } : null);
        }
      } else {
        alert(res.message || 'El comprobante no pudo ser verificado en ARCA (no encontrado).');
      }
    } catch (err: any) {
      alert(`Error al verificar en ARCA: ${err.message}`);
    } finally {
      setIsVerifyingExternalId(null);
    }
  };

  const handleRunRangeAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRangeError('');
    setRangeReport(null);
    const from = Number(rangeFrom);
    const to = Number(rangeTo);

    if (isNaN(from) || isNaN(to) || from <= 0 || to < from) {
      setRangeError('El rango desde y hasta es inválido.');
      return;
    }

    if (to - from > 50) {
      setRangeError('El rango máximo de consulta simultánea es de 50 comprobantes.');
      return;
    }

    setIsCheckingRange(true);
    try {
      const res = await billingService.verifyRange(rangePv, rangeType, from, to);
      if (!res.success) {
        setRangeError(res.error || 'Error auditando rango de comprobantes.');
      } else {
        setRangeReport(res.report || []);
      }
    } catch (err: any) {
      setRangeError(err.message || 'Error de red al consultar ARCA.');
    } finally {
      setIsCheckingRange(false);
    }
  };

  const openCreatorForSales = (saleIdsToBill: string[]) => {
    setDetailedCreatorMode('venta');
    setSelectedSaleIds(saleIdsToBill);
    setShowUnbilledModal(false);

    const selectedOrders = orders.filter(o => saleIdsToBill.includes(o.id));
    if (selectedOrders.length === 0) return;

    // Resolver productos y consolidar ítems según prioridad estricta
    const consolidatedItems = buildCreatorItemsFromOrders(selectedOrders, storeProducts);
    setCreatorItems(consolidatedItems);

    // Pre-populate client if all tickets have the same customer/DNI
    const uniqueCustomers = Array.from(new Set(selectedOrders.map(o => o.customer).filter(Boolean)));
    const uniqueDnis = Array.from(new Set(selectedOrders.map(o => o.dni).filter(Boolean)));

    let defaultClientName = uniqueCustomers.length === 1 ? uniqueCustomers[0] : 'Consumidor Final';
    let defaultClientDoc = uniqueDnis.length === 1 ? uniqueDnis[0] : '';
    let matchedCustomer = billingCustomers.find(c =>
      (defaultClientDoc && (c.cuit === defaultClientDoc || c.documentNumber === defaultClientDoc)) ||
      (defaultClientName && c.name.toLowerCase() === defaultClientName.toLowerCase())
    );

    let customerCondition = 'Consumidor Final';

    if (matchedCustomer) {
      setSelectedBillingCustomerId(matchedCustomer.id);
      setCreatorClientName(matchedCustomer.name);
      setCreatorClientCuit(matchedCustomer.cuit);
      setCreatorClientDocType(matchedCustomer.documentType || (matchedCustomer.cuit ? 'CUIT' : 'DNI'));
      setCreatorClientDocNumber(matchedCustomer.documentNumber || matchedCustomer.cuit);
      setCreatorClientAddress(matchedCustomer.address);
      setCreatorClientPhone(matchedCustomer.phone);
      setCreatorClientEmail(matchedCustomer.email);
      setCreatorClientTaxCondition(matchedCustomer.taxCondition);
      customerCondition = matchedCustomer.taxCondition;
    } else {
      setSelectedBillingCustomerId('manual');
      setCreatorClientName(defaultClientName);
      setCreatorClientCuit(defaultClientDoc);
      setCreatorClientDocType(defaultClientDoc.length === 11 ? 'CUIT' : 'DNI');
      setCreatorClientDocNumber(defaultClientDoc);
      setCreatorClientAddress('');
      setCreatorClientPhone('');
      setCreatorClientEmail('');
      setCreatorClientTaxCondition('Consumidor Final');
    }

    // Determinar tipo de comprobante automáticamente según reglas fiscales de ARCA
    const taxRule = determineInvoiceType('Responsable Inscripto', customerCondition as any);
    setCreatorType(taxRule.invoiceType as 'A' | 'B' | 'C');
    setCreatorTypeReason(taxRule.reason);

    setCreatorPointOfSale(1);
    fetchNextVoucher(1, taxRule.invoiceType);

    const todayStr = new Date().toISOString().split('T')[0];
    setCreatorDate(todayStr);
    setCreatorPricesIncludeTax(true);
    setCreatorError('');
    setShowDetailedCreator(true);
  };

  // Recálculo fiscal usando la función canónica
  const creatorCalculations = useMemo(() => {
    return recalculateFiscalInvoice(creatorItems, creatorPricesIncludeTax);
  }, [creatorItems, creatorPricesIncludeTax]);

  // Actualizar tipo de comprobante al cambiar condición del cliente
  const handleCustomerTaxConditionChange = (condition: string) => {
    setCreatorClientTaxCondition(condition);
    const rule = determineInvoiceType('Responsable Inscripto', condition as any);
    setCreatorType(rule.invoiceType as 'A' | 'B' | 'C');
    setCreatorTypeReason(rule.reason);
    fetchNextVoucher(creatorPointOfSale, rule.invoiceType);
  };

  // ─── SOLICITAR AUTORIZACIÓN ARCA (FLUJO SEGURO) ───────────────────
  const handleInitiateAuthorization = () => {
    setCreatorError('');

    if (!creatorClientName.trim()) {
      setCreatorError('La razón social o nombre del cliente es obligatorio.');
      return;
    }

    if (creatorType === 'A') {
      const cuitValidation = validateCuit(creatorClientCuit || creatorClientDocNumber);
      if (!cuitValidation.valid) {
        setCreatorError(`Para emitir Factura A se exige un CUIT válido: ${cuitValidation.error}`);
        return;
      }
    }

    if (creatorItems.length === 0) {
      setCreatorError('Debe agregar al menos un ítem al comprobante.');
      return;
    }

    const hasInvalidItem = creatorItems.some(i => !i.description.trim() || i.quantity <= 0 || i.price < 0);
    if (hasInvalidItem) {
      setCreatorError('Todos los ítems deben tener descripción válida, cantidad mayor a 0 y precio positivo.');
      return;
    }

    if (detailedCreatorMode === 'venta') {
      const itemWithoutFiscalCode = creatorItems.find(i => !(i.codigoMtx || i.barcode || i.gtin || i.ean || '').trim());
      if (itemWithoutFiscalCode) {
        setCreatorError(`Falta el dato fiscal del producto en el ítem "${itemWithoutFiscalCode.description}": ARCA WSMTXCA exige código de barras / código de producto (GTIN/EAN). Complete el código fiscal del producto antes de autorizar.`);
        return;
      }
    }

    // Abrir modal de confirmación con resumen previo
    setConfirmModalOpen(true);
  };

  const handleConfirmAndAuthorize = async () => {
    setConfirmModalOpen(false);
    setIsAuthorizing(true);
    setAuthorizationStep('Validando reglas fiscales y conectando con ARCA...');

    try {
      setAuthorizationStep('Enviando solicitud al servicio fiscal WSMTXCA/WSFEv1...');

      const response = await billingService.authorizeInvoice({
        saleIds: selectedSaleIds,
        pointOfSale: creatorPointOfSale,
        invoiceType: creatorType,
        customer: {
          name: creatorClientName,
          documentType: creatorClientDocType,
          documentNumber: creatorClientDocNumber || creatorClientCuit,
          cuit: creatorClientCuit || undefined,
          taxCondition: creatorClientTaxCondition,
          address: creatorClientAddress,
          email: creatorClientEmail,
          phone: creatorClientPhone
        },
        items: creatorItems,
        pricesIncludeTax: creatorPricesIncludeTax,
        requestedBy: 'Operador Mostrador'
      });

      if (response.success && response.status === 'AUTORIZADA' && response.invoice) {
        setAuthorizationStep('¡Comprobante autorizado con CAE por ARCA!');
        
        // Agregar al estado global de facturas
        const authorizedInv = addInvoice({
          ...response.invoice,
          id: response.invoice.id,
          folio: `${String(response.invoice.pointOfSale).padStart(4, '0')}-${String(response.invoice.invoiceNumber).padStart(8, '0')}`,
          clientName: creatorClientName,
          clientCuit: creatorClientCuit || creatorClientDocNumber,
          direction: 'venta',
          status: 'AUTORIZADA',
          type: creatorType,
          saleId: selectedSaleIds.join(', ') || 'VENTA-POS',
          saleIds: selectedSaleIds,
          qrDataUrl: response.qrDataUrl
        });

        await refreshInvoices();

        setShowDetailedCreator(false);
        setSelectedSaleIds([]);
        setCreatorItems([]);
        
        // Abrir inmediatamente la factura autorizada para visualizar QR y PDF
        setShowInvoiceDetail(authorizedInv);
      } else if (response.status === 'ESTADO_DESCONOCIDO') {
        setUnknownOpId(response.operationId || null);
        setCreatorError(
          'Tiempo de espera agotado con ARCA. La operación quedó en ESTADO_DESCONOCIDO. Por seguridad fiscal, NO vuelva a presionar facturar. Utilice la opción de reconciliación para comprobar si ARCA emitió el CAE.'
        );
      } else {
        const errMsg = response.error ? `${response.error.title}: ${response.error.reason} (${response.error.suggestedAction})` : (response.message || 'La solicitud fue rechazada por ARCA.');
        setCreatorError(errMsg);
      }
    } catch (err: any) {
      setCreatorError(`Error técnico al comunicarse con el servidor fiscal: ${err.message}`);
    } finally {
      setIsAuthorizing(false);
      setAuthorizationStep('');
    }
  };

  const handleReconcile = async (operationId: string) => {
    try {
      const res = await billingService.reconcileOperation(operationId);
      if (res.status === 'AUTORIZADA') {
        alert('¡Comprobante recuperado con éxito desde ARCA!');
        await refreshInvoices();
        checkConnection();
      } else {
        alert(res.message || 'Estado reconciliado.');
        await refreshInvoices();
      }
    } catch (err: any) {
      alert(`Error al reconciliar: ${err.message}`);
    }
  };

  const handleSelectExistingCustomer = (id: string) => {
    setSelectedExistingCustomerId(id);
    if (!id) {
      setBcForm({
        name: '',
        cuit: '',
        address: '',
        phone: '',
        email: '',
        taxCondition: 'Consumidor Final',
        documentType: 'DNI',
        documentNumber: '',
        notes: ''
      });
      return;
    }
    const cust = customers.find(c => c.phone === id || c.id === id);
    if (cust) {
      setBcForm({
        name: cust.businessName || cust.name || '',
        cuit: cust.cuit || (cust.dni && cust.dni !== cust.phone ? cust.dni : ''),
        address: cust.fiscalAddress || cust.address || '',
        phone: cust.phone || '',
        email: cust.email || '',
        taxCondition: cust.taxCondition || 'Responsable Inscripto',
        documentType: (cust.documentType as any) || (cust.cuit ? 'CUIT' : 'DNI'),
        documentNumber: cust.cuit || cust.dni || '',
        notes: cust.accountLimitNotes || ''
      });
    }
  };

  const handleSaveBc = () => {
    setBcError('');
    if (!bcForm.name.trim()) {
      setBcError('El nombre o razón social es obligatorio.');
      return;
    }

    if (bcForm.cuit.trim()) {
      const cuitCheck = validateCuit(bcForm.cuit);
      if (!cuitCheck.valid && bcForm.taxCondition === 'Responsable Inscripto') {
        setBcError(`CUIT inválido para Responsable Inscripto: ${cuitCheck.error}`);
        return;
      }
    }

    if (editingBc) {
      updateBillingCustomer(editingBc, bcForm);
      setEditingBc(null);
    } else if (selectedExistingCustomerId) {
      const targetCust = customers.find(c => c.phone === selectedExistingCustomerId || c.id === selectedExistingCustomerId);
      if (targetCust) {
        updateCustomerProfile(targetCust.phone, {
          name: bcForm.name,
          businessName: bcForm.name,
          cuit: bcForm.cuit,
          documentType: bcForm.documentType as any,
          documentNumber: bcForm.documentNumber || bcForm.cuit,
          taxCondition: bcForm.taxCondition,
          fiscalAddress: bcForm.address,
          phone: bcForm.phone || targetCust.phone,
          email: bcForm.email,
          accountLimitNotes: bcForm.notes,
          isFiscal: true
        });
      }
    } else {
      addBillingCustomer(bcForm);
    }

    setSelectedExistingCustomerId('');
    setBcForm({
      name: '',
      cuit: '',
      address: '',
      phone: '',
      email: '',
      taxCondition: 'Consumidor Final',
      documentType: 'DNI',
      documentNumber: '',
      notes: ''
    });
    setShowNewBillingCustomer(false);
  };

  const handleExportCSV = () => {
    const targetDirection = 'venta';
    const headers = ['Folio', 'Fecha', 'PuntoVenta', 'Cliente/Proveedor', 'CUIT', 'Subtotal', 'Impuestos', 'Total', 'Tipo', 'CAE', 'VtoCAE', 'Estado'];
    const rows = filteredInvoices.map(inv => [
      inv.folio,
      inv.date,
      inv.pointOfSale || '0001',
      inv.clientName,
      inv.clientCuit,
      inv.subtotal,
      inv.taxes,
      inv.total,
      inv.type,
      inv.cae,
      inv.caeExpirationDate,
      inv.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `facturas_${targetDirection}_la_martina_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'ventas', label: 'Ventas Facturadas', icon: 'receipt_long' },
    { id: 'globales', label: 'Resumen Mensual', icon: 'summarize' },
    { id: 'clientes', label: 'Clientes Fiscales', icon: 'badge' },
    { id: 'config', label: 'Configuración Fiscal', icon: 'settings' }
  ];

  const fmt = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '0,00';
    const num = typeof n === 'number' ? n : Number(n);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatShortDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const parts = dateStr.split(',');
    if (parts.length >= 2) {
      const datePart = parts[0].trim();
      const timePart = parts[1].trim().split(':').slice(0, 2).join(':');
      return `${datePart} ${timePart}`;
    }
    return dateStr.substring(0, 16);
  };

  // Resumen mensual detallado
  const monthlySummary = useMemo(() => {
    const map: Record<string, { count: number; subtotal: number; taxes: number; total: number; authorized: number; rejected: number; typeA: number; typeB: number; typeC: number }> = {};
    invoices.forEach(inv => {
      const d = inv.date.split(',')[0] || inv.date;
      const parts = d.trim().split(/[-/]/);
      const key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : d;
      if (!map[key]) map[key] = { count: 0, subtotal: 0, taxes: 0, total: 0, authorized: 0, rejected: 0, typeA: 0, typeB: 0, typeC: 0 };
      map[key].count++;
      
      // Solo computar comprobantes formalmente autorizados con CAE otorgado por ARCA
      if (inv.status === 'AUTORIZADA' && Boolean(inv.cae)) {
        map[key].authorized++;
        map[key].subtotal += (inv.subtotalNet ?? inv.subtotal);
        map[key].taxes += inv.taxes;
        map[key].total += inv.total;
        if (inv.type === 'A') map[key].typeA++;
        if (inv.type === 'B') map[key].typeB++;
        if (inv.type === 'C') map[key].typeC++;
      } else if (inv.status === 'RECHAZADA') {
        map[key].rejected++;
      }
    });
    return Object.entries(map).map(([month, data]) => ({ month, ...data }));
  }, [invoices]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full">
      {/* Header Portal Buttons */}
      {headerPortal && createPortal(
        <div className="flex gap-3 items-center">
          {activeTab === 'ventas' && (
            <>
              <button
                onClick={openRangeModal}
                className="flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold px-4 py-2 rounded-full transition-colors border border-outline-variant/20 shadow-sm text-xs cursor-pointer"
                title="Auditar secuencia de comprobantes contra ARCA"
              >
                <span className="material-symbols-outlined text-[16px]">pin</span>
                Verificar Numeración
              </button>
              <button
                onClick={openExternalInvoiceModal}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-full transition-colors shadow-lg shadow-amber-600/20 text-xs cursor-pointer"
                title="Registrar comprobante manual emitido por fuera del sistema"
              >
                <span className="material-symbols-outlined text-[16px]">post_add</span>
                + Registrar Factura Externa
              </button>
            </>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-full transition-colors shadow-sm text-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Exportar CSV
          </button>
        </div>,
        headerPortal
      )}

      {/* ─── TARJETA PRINCIPAL: ESTADO DE CONEXIÓN FISCAL ARCA ─────────── */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              arcaStatus?.connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              <span className="material-symbols-outlined text-3xl">
                {arcaStatus?.connected ? 'verified' : 'sync_problem'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-on-background">FACTURACIÓN ELECTRÓNICA ARCA</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  arcaStatus?.config.environment === 'production'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-purple-100 text-purple-800 border border-purple-200'
                }`}>
                  {arcaStatus?.config.environment === 'production' ? 'PRODUCCIÓN' : 'TESTING (HOMOLOGACIÓN)'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                Servicio Principal: <span className="font-bold text-primary">WSMTXCA</span> (ítems detallados) • Fallback: <span className="font-bold">WSFEv1</span> • CUIT: <span className="font-mono font-bold">{arcaStatus?.config.cuit || '30712345678'}</span>
              </p>
            </div>
          </div>

          {/* Badges de Conectividad y Certificado */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/10 text-xs">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Punto de Venta</span>
              <span className="font-black text-on-background">PV {String(arcaStatus?.config.defaultPointOfSale || 1).padStart(4, '0')}</span>
            </div>

            <div className="bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/10 text-xs">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase block">Certificado X.509</span>
              <span className={`font-black ${arcaStatus?.certificate.isValid ? 'text-green-700' : 'text-amber-700'}`}>
                {arcaStatus?.certificate.isValid ? 'Válido' : 'No instalado / Simulado'}
              </span>
            </div>

            <button
              onClick={checkConnection}
              disabled={isCheckingStatus}
              className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold px-4 py-2.5 rounded-xl transition-all text-xs cursor-pointer disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[16px] ${isCheckingStatus ? 'animate-spin' : ''}`}>
                sync
              </span>
              {isCheckingStatus ? 'Verificando...' : 'Probar Conexión'}
            </button>
          </div>
        </div>

        {statusNotification && (
          <div className="mt-4 p-3 bg-primary/5 text-primary text-xs font-bold rounded-xl border border-primary/20 animate-in fade-in">
            {statusNotification}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-outline-variant/10 shadow-sm overflow-x-auto whitespace-nowrap w-full">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
            className={`shrink-0 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-lowest'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: VENTAS FACTURADAS ──────────────────────────────────── */}
      {activeTab === 'ventas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-grow max-w-md">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  type="text"
                  placeholder="Buscar por comprobante, CAE, cliente o venta..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10"
                />
              </div>
              <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">{filteredInvoices.length} registradas</span>
                <button
                  onClick={() => {
                    setUnbilledSearchQuery('');
                    setShowUnbilledModal(true);
                  }}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/95 text-white font-bold px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-primary/10 text-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  Buscar Ventas No Facturadas
                </button>
              </div>
            </div>

            {/* Sales Filter Pills */}
            <div className="flex flex-nowrap items-center gap-1.5 px-4 sm:px-6 py-3 border-b border-outline-variant/10 bg-surface-container-lowest overflow-x-auto whitespace-nowrap w-full">
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mr-2 shrink-0">Filtrar:</span>
              {(['TODAS', 'SISTEMA', 'EXTERNAS', 'VERIFICADAS', 'PENDIENTES', 'AUTORIZADAS', 'RECHAZADAS', 'NC', 'ND'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setSalesFilter(f)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    salesFilter === f
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {f === 'TODAS' ? 'Todas' : f === 'SISTEMA' ? 'Sistema' : f === 'EXTERNAS' ? 'Externas' : f === 'VERIFICADAS' ? 'Verificadas' : f === 'PENDIENTES' ? 'Pendientes' : f === 'AUTORIZADAS' ? 'Autorizadas' : f === 'RECHAZADAS' ? 'Rechazadas' : f === 'NC' ? 'Notas de Crédito' : 'Notas de Débito'}
                </button>
              ))}
            </div>

            {filteredInvoices.length > 0 ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-xs min-w-[960px]">
                  <thead>
                    <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                      <th
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="px-4 py-3 cursor-pointer select-none hover:bg-surface-container-low transition-colors group whitespace-nowrap"
                        title={`Clic para ordenar por número (${sortOrder === 'asc' ? 'Ascendente 1 → 9' : 'Descendente 9 → 1'})`}
                      >
                        <div className="flex items-center gap-1">
                          <span>Comprobante</span>
                          <span className="material-symbols-outlined text-[15px] text-primary">
                            {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">Origen</th>
                      <th className="px-4 py-3 whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-3 whitespace-nowrap">Cliente</th>
                      <th className="px-4 py-3 whitespace-nowrap">CUIT / DNI</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                      <th className="px-4 py-3 whitespace-nowrap">Estado</th>
                      <th className="px-4 py-3 whitespace-nowrap">CAE</th>
                      <th className="px-4 py-3 whitespace-nowrap">Vto. CAE</th>
                      <th className="px-4 py-3 text-center w-28 whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-black text-xs block">Factura {inv.type}</span>
                          <span className="text-[11px] font-mono text-on-surface-variant">
                            {inv.folio && !inv.folio.includes('undefined')
                              ? inv.folio
                              : (inv.pointOfSale || (inv as any).point_of_sale) && (inv.invoiceNumber || (inv as any).invoice_number)
                                ? `${String(inv.pointOfSale || (inv as any).point_of_sale).padStart(4, '0')}-${String(inv.invoiceNumber || (inv as any).invoice_number).padStart(8, '0')}`
                                : '0001-00000001'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {inv.origin === 'EXTERNA_MANUAL' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                              <span className="material-symbols-outlined text-[12px]">history_edu</span>
                              EXTERNA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200">
                              <span className="material-symbols-outlined text-[12px]">computer</span>
                              SISTEMA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-on-surface-variant font-mono whitespace-nowrap">
                          {formatShortDate(inv.date)}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-bold max-w-[150px] truncate whitespace-nowrap" title={inv.clientName}>
                          {inv.clientName}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-on-surface-variant whitespace-nowrap">
                          {inv.clientCuit || 'CF'}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-black text-primary text-right whitespace-nowrap">
                          ${fmt(inv.total)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === 'AUTORIZADA' && inv.cae
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : inv.status === 'VERIFICADA_EN_ARCA'
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : inv.status === 'REGISTRADA_EXTERNAMENTE'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : inv.status === 'RECHAZADA'
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : inv.status === 'ESTADO_DESCONOCIDO'
                                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                      : 'bg-surface-container-low text-on-surface-variant'
                          }`}>
                            {inv.status === 'REGISTRADA_EXTERNAMENTE'
                              ? 'PENDIENTE'
                              : inv.status === 'VERIFICADA_EN_ARCA'
                                ? 'VERIFICADA'
                                : (inv.status === 'AUTORIZADA' && !inv.cae ? 'PENDIENTE' : inv.status)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] font-mono font-bold whitespace-nowrap">
                          {inv.cae || <span className="text-on-surface-variant/40 italic font-normal">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-on-surface-variant font-medium whitespace-nowrap">
                          {inv.caeExpirationDate ? inv.caeExpirationDate.split('T')[0] : '-'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setShowInvoiceDetail(inv)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-surface-container-low hover:bg-primary hover:text-white text-on-surface-variant transition-all text-xs font-bold cursor-pointer shadow-sm"
                              title="Ver comprobante oficial"
                            >
                              <span className="material-symbols-outlined text-[15px]">visibility</span>
                              <span>Ver</span>
                            </button>
                            {inv.origin === 'EXTERNA_MANUAL' && inv.status !== 'VERIFICADA_EN_ARCA' && (
                              <button
                                onClick={() => handleVerifyExternal(inv.id)}
                                disabled={isVerifyingExternalId === inv.id}
                                className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white border border-amber-300 transition-all text-xs font-bold cursor-pointer shadow-sm disabled:opacity-50"
                                title="Consultar comprobante en ARCA"
                              >
                                <span className={`material-symbols-outlined text-[14px] ${isVerifyingExternalId === inv.id ? 'animate-spin' : ''}`}>
                                  sync
                                </span>
                                <span>{isVerifyingExternalId === inv.id ? '...' : 'Verificar'}</span>
                              </button>
                            )}
                            {inv.status === 'ESTADO_DESCONOCIDO' && unknownOpId && (
                              <button
                                onClick={() => handleReconcile(unknownOpId)}
                                className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-800 transition-all text-xs font-bold cursor-pointer shadow-sm"
                                title="Reconciliar Estado con ARCA"
                              >
                                <span className="material-symbols-outlined text-[14px]">refresh</span>
                                <span>Reconciliar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">receipt_long</span>
                <p className="text-on-surface-variant font-medium">No hay comprobantes de ventas emitidos aún</p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ─── TAB: RESUMEN MENSUAL ────────────────────────────────────── */}
      {activeTab === 'globales' && (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 border-b border-outline-variant/10">
            <h3 className="font-black text-lg">Resumen Fiscal Mensual</h3>
            <p className="text-xs text-on-surface-variant mt-1">Discriminación de facturación efectiva autorizada ante ARCA (los comprobantes rechazados se excluyen del cómputo impositivo).</p>
          </div>
          {monthlySummary.length > 0 ? (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                  <th className="px-6 py-4">Período</th>
                  <th className="px-6 py-4 text-center">Comprobantes</th>
                  <th className="px-6 py-4 text-center">Facturas A/B</th>
                  <th className="px-6 py-4 text-right">Neto Gravado</th>
                  <th className="px-6 py-4 text-right">IVA Liquidado</th>
                  <th className="px-6 py-4 text-right">Total Facturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {monthlySummary.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4 font-bold">{row.month}</td>
                    <td className="px-6 py-4 text-center font-black">
                      <span className="text-green-700">{row.authorized}</span>
                      {row.rejected > 0 && <span className="text-red-500 text-xs ml-1 font-normal">({row.rejected} rech.)</span>}
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-mono">
                      A: {row.typeA} | B: {row.typeB}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-on-surface-variant">${fmt(row.subtotal)}</td>
                    <td className="px-6 py-4 text-right font-bold text-on-surface-variant">${fmt(row.taxes)}</td>
                    <td className="px-6 py-4 text-right font-black text-primary">${fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="p-16 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">summarize</span>
              <p className="text-on-surface-variant font-medium">No hay datos de facturación aún</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: CLIENTES FISCALES ──────────────────────────────────── */}
      {activeTab === 'clientes' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowNewBillingCustomer(true);
                setEditingBc(null);
                setBcForm({
                  name: '',
                  cuit: '',
                  address: '',
                  phone: '',
                  email: '',
                  taxCondition: 'Consumidor Final',
                  documentType: 'DNI',
                  documentNumber: '',
                  notes: ''
                });
                setBcError('');
              }}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-full flex items-center gap-2 shadow-lg shadow-primary/20 transition-colors cursor-pointer text-xs"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Nuevo Cliente Fiscal
            </button>
          </div>
          <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
            {billingCustomers.length > 0 ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                  <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                    <th className="px-6 py-4">Razón Social</th>
                    <th className="px-6 py-4">Documento / CUIT</th>
                    <th className="px-6 py-4">Condición IVA</th>
                    <th className="px-6 py-4">Domicilio Fiscal</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4 w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {billingCustomers.map(bc => (
                    <tr key={bc.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4 font-bold text-sm">{bc.name}</td>
                      <td className="px-6 py-4 text-sm font-mono text-on-surface-variant">{bc.cuit || bc.documentNumber || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="bg-surface-container-low px-2 py-1 rounded-lg text-[10px] font-bold">{bc.taxCondition}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant">{bc.address || '-'}</td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant">{bc.phone || bc.email || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingBc(bc.id);
                              setBcForm({
                                name: bc.name,
                                cuit: bc.cuit,
                                address: bc.address,
                                phone: bc.phone,
                                email: bc.email,
                                taxCondition: bc.taxCondition,
                                documentType: bc.documentType || 'DNI',
                                documentNumber: bc.documentNumber || bc.cuit,
                                notes: bc.notes || ''
                              });
                              setShowNewBillingCustomer(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-primary hover:text-white text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            onClick={() => deleteBillingCustomer(bc.id)}
                            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-error hover:text-white text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="p-16 text-center">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">badge</span>
                <p className="text-on-surface-variant font-medium">No hay clientes fiscales dados de alta</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: CONFIGURACIÓN FISCAL ──────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm p-8 space-y-6 animate-in fade-in duration-300">
          <div className="border-b border-outline-variant/10 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-on-background">Parámetros Fiscales del Comercio</h3>
              <p className="text-xs text-on-surface-variant mt-1">Configuración oficial para la emisión de comprobantes electrónicos con ARCA.</p>
            </div>
            <Link
              to="/admin/settings"
              className="px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              Configurar Datos Fiscales
            </Link>
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Razón Social</label>
              <p className="font-bold text-sm text-on-background">{fiscalConfig?.businessName || 'MARTINA SUPERMERCADO S.R.L.'}</p>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">CUIT Emisor</label>
              <p className="font-bold text-sm font-mono text-primary">{fiscalConfig?.cuit || arcaStatus?.config.cuit || '30-71234567-8'}</p>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Condición frente al IVA</label>
              <p className="font-bold text-sm text-on-background">{fiscalConfig?.taxCondition || 'Responsable Inscripto'}</p>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Domicilio Fiscal</label>
              <p className="font-bold text-sm text-on-background">{fiscalConfig?.fiscalAddress || 'Av. Libertador 1234, San Luis'}</p>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Punto de Venta Activo</label>
              <p className="font-bold text-sm font-mono text-on-background">
                {String(fiscalConfig?.defaultPointOfSale || arcaStatus?.config?.defaultPointOfSale || 1).padStart(4, '0')} (Facturación Electrónica)
              </p>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Ambiente de Operación</label>
              <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${
                arcaStatus?.config.environment === 'production' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {arcaStatus?.config.environment || 'Testing'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: DETALLE Y VISUALIZADOR DE FACTURA AUTORIZADA ────────── */}
      {showInvoiceDetail && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInvoiceDetail(null)} />
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                }`}>
                  <span className="material-symbols-outlined">
                    {showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? 'history_edu' : 'verified'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black">
                      Factura {showInvoiceDetail.type} #{showInvoiceDetail.folio && !showInvoiceDetail.folio.includes('undefined')
                        ? showInvoiceDetail.folio
                        : `${String(showInvoiceDetail.pointOfSale || (showInvoiceDetail as any).point_of_sale || 1).padStart(4, '0')}-${String(showInvoiceDetail.invoiceNumber || (showInvoiceDetail as any).invoice_number || 1).padStart(8, '0')}`}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      showInvoiceDetail.origin === 'EXTERNA_MANUAL'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? 'ORIGEN: EXTERNA / MANUAL' : 'ORIGEN: SISTEMA'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {showInvoiceDetail.origin === 'EXTERNA_MANUAL'
                      ? (showInvoiceDetail.status === 'VERIFICADA_EN_ARCA' ? '✓ Factura externa confirmada y verificada en ARCA' : '⚠ Factura externa registrada localmente (pendiente de verificar en ARCA)')
                      : 'Comprobante Oficial Autorizado ante ARCA'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowInvoiceDetail(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-grow">
              {/* Sello Fiscal ARCA o Tarjeta Externa */}
              {showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? (
                <div className={`p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border ${
                  showInvoiceDetail.status === 'VERIFICADA_EN_ARCA'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`material-symbols-outlined text-3xl ${
                      showInvoiceDetail.status === 'VERIFICADA_EN_ARCA' ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {showInvoiceDetail.status === 'VERIFICADA_EN_ARCA' ? 'verified' : 'pending_actions'}
                    </span>
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-wider block ${
                        showInvoiceDetail.status === 'VERIFICADA_EN_ARCA' ? 'text-green-800' : 'text-amber-800'
                      }`}>
                        {showInvoiceDetail.status === 'VERIFICADA_EN_ARCA' ? 'ESTADO: VERIFICADA EN ARCA' : 'ESTADO: REGISTRADA EXTERNAMENTE (TALONARIO / CONTINGENCIA)'}
                      </span>
                      <p className="text-base font-mono font-black text-on-background">
                        CAE: {showInvoiceDetail.cae || <span className="italic text-on-surface-variant/60">Sin CAE informado</span>}
                      </p>
                      <p className="text-xs text-on-surface-variant font-medium">
                        Vencimiento CAE: {showInvoiceDetail.caeExpirationDate || '-'}
                      </p>
                      {showInvoiceDetail.verifiedAt && (
                        <p className="text-[11px] text-green-700 font-semibold mt-1">
                          Verificado el {new Date(showInvoiceDetail.verifiedAt).toLocaleString('es-AR')} por {showInvoiceDetail.verifiedBy || 'Sistema'}
                        </p>
                      )}
                    </div>
                  </div>

                  {showInvoiceDetail.status !== 'VERIFICADA_EN_ARCA' && (
                    <button
                      onClick={() => handleVerifyExternal(showInvoiceDetail.id)}
                      disabled={isVerifyingExternalId === showInvoiceDetail.id}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${isVerifyingExternalId === showInvoiceDetail.id ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      Consultar en ARCA
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-3xl text-green-600">shield_with_heart</span>
                    <div>
                      <span className="text-[10px] font-black text-green-800 uppercase tracking-wider block">AUTORIZADO POR ARCA (EX-AFIP)</span>
                      <p className="text-base font-mono font-black text-green-950">CAE: {showInvoiceDetail.cae || 'N/A'}</p>
                      <p className="text-xs text-green-800 font-medium">Vencimiento CAE: {showInvoiceDetail.caeExpirationDate || 'N/A'}</p>
                    </div>
                  </div>

                  {showInvoiceDetail.status === 'AUTORIZADA' && showInvoiceDetail.cae && showInvoiceDetail.qrDataUrl && (
                    <div
                      onClick={() => setEnlargedQrUrl(showInvoiceDetail.qrDataUrl || null)}
                      className="bg-white p-2.5 rounded-xl shadow-sm border border-green-200 shrink-0 flex flex-col items-center cursor-pointer hover:border-green-400 hover:shadow-md hover:scale-105 active:scale-95 transition-all group"
                      title="Tocar para agrandar código QR"
                    >
                      <div className="relative">
                        <img src={showInvoiceDetail.qrDataUrl} alt="QR Fiscal ARCA" className="w-24 h-24" />
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                          <span className="material-symbols-outlined text-green-700 bg-white/90 p-1 rounded-full text-xs shadow">zoom_in</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-center block text-on-surface-variant mt-1 group-hover:text-green-700 transition-colors flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[11px]">fullscreen</span>
                        Tocar para agrandar
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Receptor y Metadatos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { l: 'Tipo de Comprobante', v: `Factura ${showInvoiceDetail.type} (${showInvoiceDetail.invoiceTypeCode || (showInvoiceDetail.type === 'B' ? 6 : 1)})` },
                  { l: 'Punto de Venta', v: showInvoiceDetail.pointOfSale ? String(showInvoiceDetail.pointOfSale).padStart(4, '0') : '0001' },
                  { l: 'Número de Comprobante', v: showInvoiceDetail.invoiceNumber ? String(showInvoiceDetail.invoiceNumber).padStart(8, '0') : showInvoiceDetail.folio },
                  { l: 'Fecha de Emisión', v: showInvoiceDetail.date.split(',')[0] },
                  { l: 'Cliente / Receptor', v: showInvoiceDetail.clientName },
                  { l: 'CUIT / DNI', v: showInvoiceDetail.clientCuit || 'Consumidor Final' },
                  { l: 'Condición Fiscal', v: showInvoiceDetail.customerTaxCondition || 'Consumidor Final' },
                  { l: 'Origen Comprobante', v: showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? 'EXTERNA / MANUAL' : 'SISTEMA' },
                  { l: 'Estado Fiscal', v: showInvoiceDetail.status },
                  { l: 'Venta Asociada', v: showInvoiceDetail.saleId ? `#${showInvoiceDetail.saleId}` : 'No asociada' }
                ].map((item, i) => (
                  <div key={i} className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase">{item.l}</p>
                    <p className="font-bold text-xs truncate" title={item.v}>{item.v}</p>
                  </div>
                ))}
              </div>

              {/* Observaciones y Adjunto de Factura Externa */}
              {(showInvoiceDetail.notes || showInvoiceDetail.attachmentUrl) && (
                <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 space-y-2">
                  {showInvoiceDetail.notes && (
                    <div>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">Observaciones / Notas de Auditoría:</span>
                      <p className="text-xs text-on-surface whitespace-pre-wrap leading-relaxed">{showInvoiceDetail.notes}</p>
                    </div>
                  )}
                  {showInvoiceDetail.attachmentUrl && (
                    <div className="pt-1">
                      <a
                        href={showInvoiceDetail.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">attach_file</span>
                        Ver comprobante externo escaneado / adjunto
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de ítems si existen */}
              {showInvoiceDetail.items && showInvoiceDetail.items.length > 0 && (
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                  <div className="p-3 bg-surface-container-low border-b border-outline-variant/10">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">Conceptos Facturados</h4>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant/10 bg-surface-container-lowest">
                        <th className="px-4 py-2.5">Descripción</th>
                        <th className="px-4 py-2.5 text-center">Cant</th>
                        <th className="px-4 py-2.5 text-right">Precio Unit.</th>
                        <th className="px-4 py-2.5 text-center">IVA</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {showInvoiceDetail.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 font-bold">{item.description}</td>
                          <td className="px-4 py-2 text-center">{item.quantity}</td>
                          <td className="px-4 py-2 text-right font-semibold">${fmt(item.price)}</td>
                          <td className="px-4 py-2 text-center">{item.taxRate}%</td>
                          <td className="px-4 py-2 text-right font-black">${fmt(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totales */}
              <div className="flex justify-end">
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-2 w-72">
                  <div className="flex justify-between text-xs font-bold text-on-surface-variant">
                    <span>Subtotal Neto:</span>
                    <span>${fmt(showInvoiceDetail.subtotalNet ?? showInvoiceDetail.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-on-surface-variant">
                    <span>IVA Liquidado:</span>
                    <span>${fmt(showInvoiceDetail.taxes)}</span>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/10 flex justify-between items-center">
                    <span className="text-xs font-black text-on-background uppercase">TOTAL:</span>
                    <span className="text-xl font-black text-primary">${fmt(showInvoiceDetail.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-wrap gap-3 shrink-0">
              {showInvoiceDetail.origin === 'EXTERNA_MANUAL' ? (
                <>
                  {showInvoiceDetail.status !== 'VERIFICADA_EN_ARCA' && (
                    <button
                      onClick={() => handleVerifyExternal(showInvoiceDetail.id)}
                      disabled={isVerifyingExternalId === showInvoiceDetail.id}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-3 rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${isVerifyingExternalId === showInvoiceDetail.id ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      Consultar en ARCA
                    </button>
                  )}
                  {showInvoiceDetail.attachmentUrl && (
                    <a
                      href={showInvoiceDetail.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold px-4 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors border border-outline-variant/20"
                    >
                      <span className="material-symbols-outlined text-[18px]">attach_file</span>
                      Ver Archivo Adjunto
                    </a>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    billingService.openInvoicePdf(showInvoiceDetail.id);
                  }}
                  className="flex-1 min-w-[160px] bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-xs transition-colors shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  Ver / Descargar PDF Oficial
                </button>
              )}

              {/* Botones de Preparación de NC / ND (Arquitectura RG 1415 / ARCA) */}
              {showInvoiceDetail.status === 'AUTORIZADA' && showInvoiceDetail.direction === 'venta' && showInvoiceDetail.origin !== 'EXTERNA_MANUAL' && (
                <>
                  <button
                    onClick={() => {
                      setShowNcNdPreparationModal({
                        invoice: showInvoiceDetail,
                        action: 'NC'
                      });
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                    title="Emitir Nota de Crédito vinculada a esta factura"
                  >
                    <span className="material-symbols-outlined text-[18px]">remove_shopping_cart</span>
                    Emitir NC
                  </button>
                  <button
                    onClick={() => {
                      setShowNcNdPreparationModal({
                        invoice: showInvoiceDetail,
                        action: 'ND'
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                    title="Emitir Nota de Débito vinculada a esta factura"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_card</span>
                    Emitir ND
                  </button>
                </>
              )}

              <button
                onClick={() => setShowInvoiceDetail(null)}
                className="px-6 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE PREPARACIÓN DE NC / ND (ARQUITECTURA PREPARADA) ─── */}
      {showNcNdPreparationModal && (() => {
        const { invoice, action } = showNcNdPreparationModal;
        const isNc = action === 'NC';
        const docTitle = isNc ? `Nota de Crédito ${invoice.type}` : `Nota de Débito ${invoice.type}`;
        
        let arcaVoucherCode = 8;
        if (invoice.type === 'B') {
          arcaVoucherCode = isNc ? 8 : 7;
        } else if (invoice.type === 'A') {
          arcaVoucherCode = isNc ? 3 : 2;
        } else if (invoice.type === 'C') {
          arcaVoucherCode = isNc ? 13 : 12;
        }

        return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNcNdPreparationModal(null)} />
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isNc ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    <span className="material-symbols-outlined">{isNc ? 'remove_shopping_cart' : 'add_card'}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-on-background">
                      {isNc ? 'Emisión de Nota de Crédito' : 'Emisión de Nota de Débito'}
                    </h3>
                    <p className="text-xs text-on-surface-variant font-medium">
                      Comprobante de ajuste vinculado según normativa ARCA / AFIP (RG 1415)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNcNdPreparationModal(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 text-neutral-500 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-left flex-1">
                {/* Banner de fase de arquitectura */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-700 shrink-0 text-[20px]">architecture</span>
                  <div className="space-y-1">
                    <p className="font-bold">Módulo de Arquitectura y Modelo Fiscal Preparado</p>
                    <p className="leading-relaxed text-amber-800 text-[11px]">
                      De acuerdo a la directiva de desarrollo, la arquitectura de datos, validación y vinculación de comprobantes según RG 1415 se encuentra lista. La emisión real contra los Web Services WSMTXCA de ARCA está deshabilitada durante esta fase.
                    </p>
                  </div>
                </div>

                {/* Comprobante Asociado Obligatorio */}
                <div className="bg-[#f9f8f8] rounded-2xl p-5 border border-outline-variant/10 space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#8c8282] block">
                    Comprobante Asociado Requerido (Trazabilidad Fiscal)
                  </span>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">Comprobante Original</span>
                      <span className="font-bold text-neutral-800">
                        Factura {invoice.type} #{invoice.folio || `${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.invoiceNumber).padStart(8, '0')}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">CAE Original</span>
                      <span className="font-mono font-bold text-emerald-800">{invoice.cae || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">Punto de Venta Original</span>
                      <span className="font-mono font-bold text-neutral-800">{String(invoice.pointOfSale || 1).padStart(4, '0')}</span>
                    </div>
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">Número Comprobante Original</span>
                      <span className="font-mono font-bold text-neutral-800">{String(invoice.invoiceNumber || 1).padStart(8, '0')}</span>
                    </div>
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">Receptor / Cliente</span>
                      <span className="font-bold text-neutral-800">{invoice.clientName}</span>
                    </div>
                    <div>
                      <span className="text-[#8c8282] text-[10px] block font-bold uppercase">CUIT / Documento</span>
                      <span className="font-mono font-bold text-neutral-800">{invoice.clientCuit || 'Consumidor Final'}</span>
                    </div>
                  </div>
                </div>

                {/* Tipo de Comprobante a Generar */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-blue-800 uppercase block">Comprobante de Ajuste Determinado</span>
                    <p className="text-base font-black text-blue-950 mt-0.5">{docTitle}</p>
                    <p className="text-xs text-blue-700">Código oficial ARCA / WSMTXCA: <span className="font-mono font-bold">{arcaVoucherCode}</span></p>
                  </div>
                  <span className="text-xs bg-blue-200/80 text-blue-900 font-bold px-3 py-1 rounded-full">
                    Tipo {arcaVoucherCode}
                  </span>
                </div>

                {/* Formulario de Configuración de NC/ND */}
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-700 uppercase mb-1.5 block">
                      Motivo del Ajuste Fiscal
                    </label>
                    <select
                      value={ncNdReason}
                      onChange={e => setNcNdReason(e.target.value)}
                      className="w-full bg-[#f9f8f8] border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-neutral-800 outline-none"
                    >
                      <option value="Anulación total de la operación">Anulación total de la operación</option>
                      <option value="Devolución parcial de mercadería">Devolución parcial de mercadería</option>
                      <option value="Descuento o bonificación posterior">Descuento o bonificación posterior</option>
                      <option value="Corrección de importe / diferencia de precio">Corrección de importe / diferencia de precio</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-neutral-700 uppercase mb-1.5 block">
                      Observaciones / Justificación Fiscal
                    </label>
                    <textarea
                      rows={2}
                      value={ncNdNotes}
                      onChange={e => setNcNdNotes(e.target.value)}
                      placeholder="Ingrese el detalle o motivo de la nota de ajuste para el registro contable..."
                      className="w-full bg-[#f9f8f8] border border-neutral-200 rounded-xl p-3 text-xs font-medium text-neutral-800 outline-none resize-none"
                    />
                  </div>

                  {/* Resumen de Importe */}
                  <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 flex justify-between items-center text-xs">
                    <span className="text-neutral-600 font-bold">Importe Total del Comprobante Original:</span>
                    <span className="text-base font-black text-neutral-900">${fmt(invoice.total)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNcNdPreparationModal(null)}
                  className="flex-1 py-3.5 font-bold text-neutral-600 hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-[2] bg-neutral-300 text-neutral-500 font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  <span>Autorizar en ARCA (Próximamente)</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── MODAL: CREADOR Y AUTORIZACIÓN ARCA ────────────────────────── */}
      {showDetailedCreator && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isAuthorizing && setShowDetailedCreator(false)} />
          <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">receipt</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">
                    {detailedCreatorMode === 'venta' ? 'Emisión de Factura Electrónica ARCA' : 'Registrar Factura de Compra'}
                  </h3>
                  <p className="text-xs text-on-surface-variant font-medium">
                    {detailedCreatorMode === 'venta'
                      ? 'Autorización directa mediante Web Service WSMTXCA/WSFEv1'
                      : 'Carga de comprobante de proveedor para crédito fiscal'}
                  </p>
                </div>
              </div>
              {!isAuthorizing && (
                <button
                  onClick={() => setShowDetailedCreator(false)}
                  className="w-10 h-10 rounded-full hover:bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>

            {/* Content */}
            <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-grow">
              {creatorError && (
                <div className="bg-red-50 text-red-800 text-xs font-bold p-4 rounded-2xl border border-red-200 animate-in fade-in flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-600 shrink-0 text-xl">error</span>
                  <div className="space-y-1">
                    <p>{creatorError}</p>
                    {unknownOpId && (
                      <button
                        onClick={() => handleReconcile(unknownOpId)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-lg font-black mt-2 cursor-pointer transition-colors inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">sync</span>
                        Reconciliar Estado con ARCA Ahora
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Banner de Determinación Fiscal Automática */}
              {detailedCreatorMode === 'venta' && (
                <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary">gavel</span>
                    <div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-wider block">DETERMINACIÓN FISCAL REGLAMENTARIA</span>
                      <p className="text-xs font-bold text-on-background">{creatorTypeReason}</p>
                    </div>
                  </div>
                  <span className="bg-primary text-white font-black text-xs px-3 py-1 rounded-xl uppercase tracking-wider">
                    Factura {creatorType}
                  </span>
                </div>
              )}

              {/* Cliente y Metadatos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10">
                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-primary tracking-wider">Datos del Cliente Fiscal</h4>
                    <select
                      value={selectedBillingCustomerId}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedBillingCustomerId(val);
                        if (val !== 'manual' && val !== '') {
                          const bc = billingCustomers.find(b => b.id === val);
                          const cust = customers.find(c => c.phone === val || c.id === val || c.cuit === val);
                          const name = bc?.name || cust?.businessName || cust?.name || '';
                          const cuit = bc?.cuit || cust?.cuit || '';
                          const docType = bc?.documentType || cust?.documentType || (cuit ? 'CUIT' : 'DNI');
                          const docNum = bc?.documentNumber || cuit || cust?.dni || '';
                          const address = bc?.address || cust?.fiscalAddress || cust?.address || '';
                          const phone = bc?.phone || cust?.phone || '';
                          const email = bc?.email || cust?.email || '';
                          const taxCond = bc?.taxCondition || cust?.taxCondition || 'Consumidor Final';

                          setCreatorClientName(name);
                          setCreatorClientCuit(cuit);
                          setCreatorClientDocType(docType);
                          setCreatorClientDocNumber(docNum);
                          setCreatorClientAddress(address);
                          setCreatorClientPhone(phone);
                          setCreatorClientEmail(email);
                          handleCustomerTaxConditionChange(taxCond);
                        }
                      }}
                      className="bg-surface-container-low text-xs border-none rounded-xl px-3 py-1.5 font-bold outline-none cursor-pointer text-on-surface"
                    >
                      <option value="manual">-- Seleccionar Cliente Registrado --</option>
                      {billingCustomers.length > 0 && (
                        <optgroup label="Clientes Fiscales">
                          {billingCustomers.map(bc => (
                            <option key={bc.id} value={bc.id}>{bc.name} ({bc.taxCondition})</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Todos los Clientes">
                        {customers.map(c => (
                          <option key={c.phone} value={c.phone}>
                            {c.name} {c.cuit ? `[CUIT: ${c.cuit}]` : c.dni ? `[DNI: ${c.dni}]` : ''} ({c.taxCondition || 'CF'})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Razón Social / Nombre *</label>
                      <input
                        type="text"
                        value={creatorClientName}
                        onChange={e => setCreatorClientName(e.target.value)}
                        placeholder="Nombre completo o Razón Social"
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Condición frente al IVA *</label>
                      <select
                        value={creatorClientTaxCondition}
                        onChange={e => handleCustomerTaxConditionChange(e.target.value)}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                      >
                        <option>Consumidor Final</option>
                        <option>Responsable Inscripto</option>
                        <option>Monotributista</option>
                        <option>Exento</option>
                        <option>No Categorizado</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo de Documento</label>
                      <select
                        value={creatorClientDocType}
                        onChange={e => setCreatorClientDocType(e.target.value as any)}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                      >
                        <option value="DNI">DNI (Documento Nacional de Identidad)</option>
                        <option value="CUIT">CUIT (Clave Única de Identificación Tributaria)</option>
                        <option value="CUIL">CUIL</option>
                        <option value="PASAPORTE">Pasaporte</option>
                        <option value="SIN_IDENTIFICAR">Sin Identificar (Consumidor Final)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Número de Documento / CUIT</label>
                      <input
                        type="text"
                        value={creatorClientDocNumber || creatorClientCuit}
                        onChange={e => {
                          setCreatorClientDocNumber(e.target.value);
                          setCreatorClientCuit(e.target.value);
                        }}
                        placeholder="20123456789"
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Metadatos Fiscales (Punto de Venta y Próximo Folio ARCA) */}
                <div className="space-y-4 border-l border-outline-variant/10 pl-6">
                  <h4 className="text-xs font-black uppercase text-primary tracking-wider">Numeración Fiscal</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Punto de Venta</label>
                      <select
                        value={creatorPointOfSale}
                        onChange={e => {
                          const pv = parseInt(e.target.value, 10);
                          setCreatorPointOfSale(pv);
                          fetchNextVoucher(pv, creatorType);
                        }}
                        className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2 text-xs outline-none font-bold"
                      >
                        <option value={1}>0001 - Facturación Electrónica</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">
                        Próximo Folio Sugerido (Sincronizado)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={creatorNextNumber ? `${String(creatorPointOfSale).padStart(4, '0')}-${String(creatorNextNumber).padStart(8, '0')}` : 'Consultando ARCA...'}
                        className="w-full bg-surface-container-low/50 border-none rounded-xl px-3 py-2 text-xs font-mono font-black text-primary cursor-not-allowed"
                      />
                      <span className="text-[9px] text-on-surface-variant italic block mt-0.5">El número se asigna correlativamente por ARCA al autorizar.</span>
                    </div>

                    <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between">
                      <span className="text-xs font-bold">Precios incluyen IVA</span>
                      <input
                        type="checkbox"
                        checked={creatorPricesIncludeTax}
                        onChange={e => setCreatorPricesIncludeTax(e.target.checked)}
                        className="accent-primary w-4 h-4 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalle de Artículos */}
              <div className="bg-surface-container-lowest p-6 rounded-[2rem] border border-outline-variant/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-primary tracking-wider">Detalle de Conceptos Fiscales</h4>
                  <span className="text-[10px] font-black text-on-surface-variant bg-surface-container-low px-2 py-1 rounded-lg">
                    {creatorItems.length} {creatorItems.length === 1 ? 'artículo' : 'artículos'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant/10">
                        <th className="py-2 px-3">Descripción</th>
                        <th className="py-2 px-3 text-center w-20">Cant</th>
                        <th className="py-2 px-3 text-center w-20">Unidad</th>
                        <th className="py-2 px-3 text-right w-28">Precio</th>
                        <th className="py-2 px-3 text-center w-20">IVA %</th>
                        <th className="py-2 px-3 text-right w-28">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {creatorItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <div className="font-bold">{item.description}</div>
                            <div className="text-[10px] font-mono mt-0.5">
                              {item.barcode || item.codigoMtx ? (
                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  EAN: {item.barcode || item.codigoMtx}
                                </span>
                              ) : (
                                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  ⚠️ Sin código fiscal MTX
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">{item.quantity}</td>
                          <td className="py-2 px-3 text-center text-on-surface-variant">{item.unit || 'un'}</td>
                          <td className="py-2 px-3 text-right">${fmt(item.price)}</td>
                          <td className="py-2 px-3 text-center font-bold">{item.taxRate}%</td>
                          <td className="py-2 px-3 text-right font-black">${fmt(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Desglose impositivo */}
                <div className="flex justify-end pt-4 border-t border-outline-variant/10">
                  <div className="w-80 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-on-surface-variant">
                      <span>Subtotal Neto Gravado:</span>
                      <span>${fmt(creatorCalculations.subtotalNet)}</span>
                    </div>
                    {creatorCalculations.vatBreakdown.map((vb, i) => (
                      <div key={i} className="flex justify-between text-xs font-medium text-on-surface-variant">
                        <span>IVA {vb.vatRate}% (Base: ${fmt(vb.baseAmount)}):</span>
                        <span>${fmt(vb.vatAmount)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-outline-variant/10 flex justify-between items-center">
                      <span className="text-xs font-black text-on-background uppercase">TOTAL GENERAL:</span>
                      <span className="text-2xl font-black text-primary">${fmt(creatorCalculations.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer con Botón de Autorización */}
            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex gap-3 shrink-0">
              <button
                onClick={() => setShowDetailedCreator(false)}
                disabled={isAuthorizing}
                className="flex-1 py-4 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleInitiateAuthorization}
                disabled={isAuthorizing}
                className="flex-[2] bg-primary hover:bg-primary/95 text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                {isAuthorizing ? 'Autorizando con ARCA...' : 'Solicitar autorización ARCA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: RESUMEN PREVIO Y CONFIRMACIÓN ──────────────────────── */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModalOpen(false)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 p-8 space-y-6 animate-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl">fact_check</span>
              </div>
              <h3 className="text-xl font-black text-on-background">Confirmar Emisión Fiscal</h3>
              <p className="text-xs text-on-surface-variant">
                Se enviará la solicitud de autorización a ARCA con el detalle de los productos y se solicitará el CAE correspondiente.
              </p>
            </div>

            <div className="bg-surface-container-low p-5 rounded-2xl space-y-3 text-xs font-medium border border-outline-variant/10">
              <div className="flex justify-between items-center pb-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Comprobante a emitir:</span>
                <span className="font-black text-primary bg-primary/10 px-2 py-0.5 rounded text-[11px]">
                  Factura {creatorType} (Pto. {String(creatorPointOfSale).padStart(4, '0')} - Nº {String(creatorNextNumber || 2).padStart(8, '0')})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Cliente receptor:</span>
                <span className="font-bold">{creatorClientName || 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Identificación fiscal:</span>
                <span className="font-bold">{creatorClientDocNumber || creatorClientCuit || 'Sin identificar'} ({creatorClientDocType})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Condición IVA:</span>
                <span className="font-bold">{creatorClientTaxCondition}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Cantidad de ítems:</span>
                <span className="font-bold">{creatorItems.length} {creatorItems.length === 1 ? 'producto' : 'productos'} ({creatorItems.reduce((acc, i) => acc + (i.quantity || 0), 0)} un.)</span>
              </div>
              
              <div className="pt-2 border-t border-outline-variant/10 space-y-1.5">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal Neto Gravado:</span>
                  <span className="font-bold font-mono">${fmt(creatorCalculations?.subtotalNet)}</span>
                </div>
                {creatorCalculations?.vatBreakdown?.map((vb, i) => (
                  <div key={i} className="flex justify-between text-on-surface-variant text-[11px]">
                    <span>IVA {vb.vatRate}% (Base: ${fmt(vb.baseAmount)}):</span>
                    <span className="font-bold font-mono">${fmt(vb.vatAmount)}</span>
                  </div>
                ))}
                {!creatorCalculations?.vatBreakdown?.length && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>IVA Liquidado:</span>
                    <span className="font-bold font-mono">${fmt(creatorCalculations?.taxes)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-outline-variant/15 flex justify-between items-center text-sm">
                  <span className="font-black text-on-background uppercase tracking-wider">Total a Facturar:</span>
                  <span className="font-black text-primary text-lg font-mono">${fmt(creatorCalculations?.total)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmAndAuthorize}
                className="flex-[2] bg-primary hover:bg-primary/95 text-white font-black py-3 rounded-2xl shadow-lg shadow-primary/20 text-xs transition-all active:scale-95 cursor-pointer"
              >
                Confirmar y Emitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: VENTAS NO FACTURADAS ────────────────────────────── */}
      {showUnbilledModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowUnbilledModal(false); setSelectedSaleIds([]); }} />
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">find_in_page</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">Ventas No Facturadas</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Seleccioná una o más ventas de caja para emitir la factura electrónica correspondiente</p>
                </div>
              </div>
              <button
                onClick={() => { setShowUnbilledModal(false); setSelectedSaleIds([]); }}
                className="w-10 h-10 rounded-full hover:bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Filtros */}
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex flex-col sm:flex-row gap-4 shrink-0">
              <div className="relative flex-grow">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  type="text"
                  placeholder="Buscar ticket por ID o Cliente..."
                  value={unbilledSearchQuery}
                  onChange={e => setUnbilledSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 text-sm outline-none focus:ring-2 ring-primary/10"
                />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <input
                  type="number"
                  placeholder="Monto Mínimo $"
                  value={unbilledMinAmount}
                  onChange={e => setUnbilledMinAmount(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-36 bg-surface-container-low border-none rounded-2xl px-4 py-3 text-xs outline-none focus:ring-2 ring-primary/10 font-bold"
                />
              </div>
            </div>

            {/* Banner de Validación de Consolidación */}
            {!consolidationValidation.valid && (
              <div className="mx-6 mt-4 p-4 bg-red-50 text-red-800 text-xs font-bold rounded-2xl border border-red-200 flex items-center gap-3 animate-in fade-in">
                <span className="material-symbols-outlined text-red-600 text-xl shrink-0">warning</span>
                <span>{consolidationValidation.error}</span>
              </div>
            )}

            {/* Lista de Ventas */}
            <div className="p-6 flex-grow overflow-y-auto no-scrollbar space-y-3">
              {unbilledOrders.length > 0 ? (
                unbilledOrders.map(o => {
                  const isSelected = selectedSaleIds.includes(o.id);
                  return (
                    <div
                      key={o.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedSaleIds(prev => prev.filter(id => id !== o.id));
                        } else {
                          setSelectedSaleIds(prev => [...prev, o.id]);
                        }
                      }}
                      className={`bg-surface-container-lowest border p-4 rounded-2xl flex items-center justify-between hover:border-primary/50 transition-all shadow-sm cursor-pointer ${
                        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-outline-variant/10'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setSelectedSaleIds(prev => [...prev, o.id]);
                            } else {
                              setSelectedSaleIds(prev => prev.filter(id => id !== o.id));
                            }
                          }}
                          className="accent-primary w-4.5 h-4.5 rounded cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-surface-container-low text-on-surface-variant font-black text-[10px] uppercase px-2 py-0.5 rounded">
                              Ticket #{o.id}
                            </span>
                            <span className="text-xs font-bold text-on-surface-variant">{o.paymentMethod}</span>
                          </div>
                          <p className="text-sm font-black text-on-background mt-0.5">{o.customer}</p>
                          <p className="text-[11px] text-on-surface-variant font-medium">
                            {o.date} • {o.items.length} {o.items.length === 1 ? 'producto' : 'productos'} {o.dni && `• DNI: ${o.dni}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-base font-black text-primary">${formatCurrency(o.total)}</p>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            openCreatorForSales([o.id]);
                          }}
                          className="bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase px-4 py-2 rounded-xl flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Facturar
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-5xl mb-3">search_off</span>
                  <p className="text-sm text-on-surface-variant italic">No se encontraron ventas pendientes de facturación.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center shrink-0">
              {selectedSaleIds.length > 0 ? (
                <div className="flex items-center justify-between w-full">
                  <div>
                    <span className="text-xs font-bold text-on-surface-variant">
                      {selectedSaleIds.length} {selectedSaleIds.length === 1 ? 'venta seleccionada' : 'ventas seleccionadas'}
                    </span>
                    <p className="text-sm font-black text-primary">
                      Total: ${formatCurrency(orders.filter(o => selectedSaleIds.includes(o.id)).reduce((acc, curr) => acc + curr.total, 0))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedSaleIds([])}
                      className="px-4 py-2 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                    >
                      Deseleccionar
                    </button>
                    <button
                      disabled={!consolidationValidation.valid}
                      onClick={() => openCreatorForSales(selectedSaleIds)}
                      className="bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl shadow-lg shadow-primary/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Facturar Seleccionadas
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end w-full">
                  <button
                    onClick={() => setShowUnbilledModal(false)}
                    className="px-6 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: NUEVO / EDITAR CLIENTE FISCAL ────────────────────── */}
      {showNewBillingCustomer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewBillingCustomer(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest">
              <h3 className="text-lg font-black">{editingBc ? 'Editar' : 'Nuevo'} Cliente Fiscal</h3>
            </div>

            <div className="p-8 space-y-4 max-h-[65vh] overflow-y-auto no-scrollbar">
              {bcError && (
                <p className="bg-red-50 text-red-700 text-xs font-bold p-3 rounded-xl border border-red-100">{bcError}</p>
              )}

              {!editingBc && (
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 space-y-1.5">
                  <label className="text-[10px] font-black text-primary uppercase block">
                    Vincular con cliente existente (Opcional)
                  </label>
                  <select
                    value={selectedExistingCustomerId}
                    onChange={e => handleSelectExistingCustomer(e.target.value)}
                    className="w-full bg-white border border-primary/20 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">-- Crear nuevo cliente independiente --</option>
                    {customers.map(c => (
                      <option key={c.phone} value={c.phone}>
                        {c.name} ({c.phone}) {c.cuit ? `[CUIT: ${c.cuit}]` : c.dni ? `[DNI: ${c.dni}]` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-on-surface-variant font-medium">
                    Si seleccionás un cliente existente, los datos fiscales se guardarán directamente en su perfil único de cliente.
                  </p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Razón Social / Nombre *</label>
                <input
                  type="text"
                  value={bcForm.name}
                  onChange={e => setBcForm({ ...bcForm, name: e.target.value })}
                  placeholder="Empresa S.A. o Nombre del Cliente"
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Condición IVA *</label>
                  <select
                    value={bcForm.taxCondition}
                    onChange={e => setBcForm({ ...bcForm, taxCondition: e.target.value })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                  >
                    <option>Consumidor Final</option>
                    <option>Responsable Inscripto</option>
                    <option>Monotributista</option>
                    <option>Exento</option>
                    <option>No Categorizado</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo Documento</label>
                  <select
                    value={bcForm.documentType}
                    onChange={e => setBcForm({ ...bcForm, documentType: e.target.value as any })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                  >
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="SIN_IDENTIFICAR">Sin Identificar</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Número de CUIT / DNI</label>
                <input
                  type="text"
                  value={bcForm.cuit}
                  onChange={e => setBcForm({ ...bcForm, cuit: e.target.value, documentNumber: e.target.value })}
                  placeholder="20123456789"
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Domicilio Fiscal</label>
                <input
                  type="text"
                  value={bcForm.address}
                  onChange={e => setBcForm({ ...bcForm, address: e.target.value })}
                  placeholder="Av. San Martín 456"
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Teléfono</label>
                  <input
                    type="text"
                    value={bcForm.phone}
                    onChange={e => setBcForm({ ...bcForm, phone: e.target.value })}
                    placeholder="2664-123456"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Email</label>
                  <input
                    type="email"
                    value={bcForm.email}
                    onChange={e => setBcForm({ ...bcForm, email: e.target.value })}
                    placeholder="cliente@empresa.com"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-outline-variant/10 flex gap-3 bg-surface-container-lowest">
              <button
                onClick={() => setShowNewBillingCustomer(false)}
                className="flex-1 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveBc}
                className="flex-[2] bg-primary hover:bg-primary/95 text-white font-black py-3 rounded-2xl text-xs shadow-lg shadow-primary/20 transition-all cursor-pointer"
              >
                Guardar Cliente Fiscal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: QR FISCAL ARCA EN TAMAÑO GRANDE ──────────────────── */}
      {enlargedQrUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setEnlargedQrUrl(null)} />
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 p-8 space-y-5 animate-in zoom-in-95 text-center flex flex-col items-center">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-2xl">qr_code_2</span>
                <span className="text-xs font-black uppercase tracking-wider text-green-800">QR Oficial ARCA</span>
              </div>
              <button
                onClick={() => setEnlargedQrUrl(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 cursor-pointer text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-white p-4 rounded-3xl border-2 border-green-200 shadow-inner flex items-center justify-center">
              <img src={enlargedQrUrl} alt="Código QR Fiscal ARCA Oficial" className="w-64 h-64 sm:w-72 sm:h-72 object-contain" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-black text-on-background">Escanear para Verificación Fiscal</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Apuntá con la cámara de tu teléfono para acceder directamente a la constancia oficial del comprobante en el portal de ARCA.
              </p>
            </div>

            <button
              onClick={() => setEnlargedQrUrl(null)}
              className="w-full py-3 bg-surface-container-high hover:bg-surface-container-highest font-bold text-xs rounded-2xl transition-colors cursor-pointer text-on-surface"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {/* ─── MODAL: REGISTRAR FACTURA EXTERNA / MANUAL ────────────────── */}
      {showExternalModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSavingExternal && setShowExternalModal(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">post_add</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">Registrar Factura Externa / Manual</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Talonario papel, contingencia u otro sistema fiscal</p>
                </div>
              </div>
              <button
                onClick={() => !isSavingExternal && setShowExternalModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 cursor-pointer text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveExternalInvoice} className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-grow">
              {/* Aviso legal y operativo */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-700 text-xl shrink-0 mt-0.5">info</span>
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  <strong>AVISO OPERATIVO:</strong> Esta operación <u>NO emite</u> una factura ante ARCA. Solo registra un comprobante emitido externamente en la base local para control interno, auditoría y trazabilidad de la numeración.
                </p>
              </div>

              {/* Alerta reactiva de duplicado */}
              {extConflict && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 animate-in fade-in">
                  <span className="material-symbols-outlined text-red-600 text-xl shrink-0 mt-0.5">block</span>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wide">Comprobante Duplicado Detectado</h5>
                    <p className="text-xs mt-0.5 leading-relaxed font-semibold">
                      Ya existe un comprobante registrado con PV {extPointOfSale} Factura {extType} Nº {extNumber} (Folio #{extConflict.folio} - {extConflict.clientName}). La operación está bloqueada.
                    </p>
                  </div>
                </div>
              )}

              {externalSaveError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
                  {externalSaveError}
                </div>
              )}

              {/* Tipo, Punto de Venta y Número */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo Comprobante *</label>
                  <select
                    value={extType}
                    onChange={e => setExtType(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                  >
                    <option value="B">Factura B (Consumidor Final)</option>
                    <option value="A">Factura A (Responsable Inscripto)</option>
                    <option value="C">Factura C</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Punto de Venta *</label>
                  <input
                    type="number"
                    min="1"
                    value={extPointOfSale}
                    onChange={e => setExtPointOfSale(Number(e.target.value))}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Número Comprobante *</label>
                  <input
                    type="number"
                    min="1"
                    value={extNumber}
                    onChange={e => setExtNumber(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 4"
                    required
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-black font-mono focus:ring-2 ring-primary/20"
                  />
                </div>
              </div>

              {/* Fecha y Datos del Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Fecha de Emisión *</label>
                  <input
                    type="date"
                    value={extDate}
                    onChange={e => setExtDate(e.target.value)}
                    required
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-semibold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Cliente / Razón Social *</label>
                  <input
                    type="text"
                    value={extClientName}
                    onChange={e => setExtClientName(e.target.value)}
                    placeholder="Consumidor Final o Empresa S.A."
                    required
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                  />
                </div>
              </div>

              {/* Documento y Condición IVA */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo Documento</label>
                  <select
                    value={extDocType}
                    onChange={e => setExtDocType(e.target.value as any)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-semibold"
                  >
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="SIN_IDENTIFICAR">Sin Identificar</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Número Documento / CUIT</label>
                  <input
                    type="text"
                    value={extDocNumber}
                    onChange={e => setExtDocNumber(e.target.value)}
                    placeholder="0 o número fiscal"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Condición IVA</label>
                  <select
                    value={extTaxCondition}
                    onChange={e => setExtTaxCondition(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-semibold"
                  >
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Monotributista">Monotributista</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
              </div>

              {/* Importes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Subtotal / Neto ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extSubtotalNet}
                    onChange={e => setExtSubtotalNet(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-2 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">IVA / Impuestos ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extTaxes}
                    onChange={e => setExtTaxes(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full bg-white border border-outline-variant/20 rounded-xl px-4 py-2 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-primary uppercase mb-1 block">Total Facturado ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={extTotal}
                    onChange={e => setExtTotal(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    required
                    className="w-full bg-white border-2 border-primary/30 rounded-xl px-4 py-2 text-xs outline-none font-black font-mono text-primary text-base"
                  />
                </div>
              </div>

              {/* CAE y Vencimiento CAE opcionales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">
                    CAE Informado <span className="text-on-surface-variant/50 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    value={extCae}
                    onChange={e => setExtCae(e.target.value)}
                    placeholder="14 dígitos si fue emitida electrónicamente"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">
                    Vencimiento CAE <span className="text-on-surface-variant/50 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={extCaeExpiration}
                    onChange={e => setExtCaeExpiration(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              {/* Venta Asociada y Archivo Adjunto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">
                    Vincular a Venta del Sistema <span className="text-on-surface-variant/50 font-normal">(Opcional)</span>
                  </label>
                  <select
                    value={extSaleId}
                    onChange={e => setExtSaleId(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none truncate"
                  >
                    <option value="">Ninguna venta vinculada</option>
                    {unbilledOrders.slice(0, 30).map(o => (
                      <option key={o.id} value={o.id}>
                        Venta #{o.id} - ${fmt(o.total)} ({o.customer || 'Mostrador'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">
                    Enlace de Archivo Adjunto / Escaneo <span className="text-on-surface-variant/50 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="url"
                    value={extAttachmentUrl}
                    onChange={e => setExtAttachmentUrl(e.target.value)}
                    placeholder="https://... / scan.pdf"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Observaciones / Motivo de Contingencia</label>
                <textarea
                  value={extNotes}
                  onChange={e => setExtNotes(e.target.value)}
                  placeholder="Ej. Talonario manual papel por corte de suministro eléctrico / sistema anterior."
                  rows={2}
                  className="w-full bg-surface-container-low border-none rounded-xl p-3 text-xs outline-none"
                />
              </div>

              <div className="pt-2 border-t border-outline-variant/10 flex gap-3">
                <button
                  type="button"
                  disabled={isSavingExternal}
                  onClick={() => setShowExternalModal(false)}
                  className="flex-1 py-3 font-bold text-on-surface-variant hover:bg-black/5 rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingExternal || Boolean(extConflict)}
                  className="flex-[2] bg-amber-600 hover:bg-amber-700 text-white font-black py-3 rounded-2xl text-xs shadow-lg shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isSavingExternal ? 'animate-spin' : ''}`}>
                    {isSavingExternal ? 'sync' : 'save'}
                  </span>
                  {isSavingExternal ? 'Registrando comprobante...' : 'Registrar Comprobante Externo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: AUDITORÍA DE NUMERACIÓN Y RANGOS CONTRA ARCA ───────── */}
      {showRangeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isCheckingRange && setShowRangeModal(false)} />
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-800 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined">pin</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-background">Auditoría de Numeración de Comprobantes</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Verificación secuencial entre ARCA y la base de datos local</p>
                </div>
              </div>
              <button
                onClick={() => !isCheckingRange && setShowRangeModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 cursor-pointer text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-grow">
              {/* Formulario de Parámetros de Rango */}
              <form onSubmit={handleRunRangeAudit} className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/10 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-blue-700 text-lg shrink-0 mt-0.5">policy</span>
                  <p className="text-xs text-blue-900 leading-relaxed">
                    Esta herramienta consulta en <strong>modo lectura</strong> los comprobantes en ARCA para conciliar con los registros locales. <u>NO emite comprobantes</u> ni altera la numeración.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Tipo</label>
                    <select
                      value={rangeType}
                      onChange={e => setRangeType(e.target.value)}
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    >
                      <option value="B">Factura B</option>
                      <option value="A">Factura A</option>
                      <option value="C">Factura C</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Punto de Venta</label>
                    <input
                      type="number"
                      min="1"
                      value={rangePv}
                      onChange={e => setRangePv(Number(e.target.value))}
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Desde Nº</label>
                    <input
                      type="number"
                      min="1"
                      value={rangeFrom}
                      onChange={e => setRangeFrom(Number(e.target.value))}
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block">Hasta Nº</label>
                    <input
                      type="number"
                      min="1"
                      value={rangeTo}
                      onChange={e => setRangeTo(Number(e.target.value))}
                      className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none"
                    />
                  </div>
                </div>

                {rangeError && (
                  <p className="bg-red-50 text-red-700 text-xs font-bold p-3 rounded-xl border border-red-200">
                    {rangeError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isCheckingRange}
                    className="bg-primary hover:bg-primary/95 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${isCheckingRange ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    {isCheckingRange ? 'Consultando en ARCA...' : 'Ejecutar Auditoría'}
                  </button>
                </div>
              </form>

              {/* Tabla de Resultados de Auditoría */}
              {rangeReport && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-on-background tracking-wider">
                      Resultados del Rango ({rangeReport.length} comprobantes evaluados)
                    </h4>
                  </div>

                  <div className="border border-outline-variant/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-container-lowest text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant/10">
                          <th className="px-4 py-3">Nº</th>
                          <th className="px-4 py-3">ARCA</th>
                          <th className="px-4 py-3">Base Local</th>
                          <th className="px-4 py-3">Origen</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3">Observación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {rangeReport.map((item, idx) => {
                          const num = item.voucherNumber ?? item.number ?? (idx + 1);
                          const inArca = item.existsInArca ?? item.arcaExists ?? false;
                          const inDb = item.existsInDb ?? item.localExists ?? false;
                          const orig = item.origin ?? item.localOrigin;
                          const stat = item.status ?? item.localStatus;
                          const obs = item.observation || 'OK';

                          return (
                            <tr key={num} className="hover:bg-surface-container-lowest transition-colors">
                              <td className="px-4 py-3 font-mono font-black">#{String(num).padStart(8, '0')}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  inArca ? 'bg-green-100 text-green-800' : 'bg-surface-container-low text-on-surface-variant'
                                }`}>
                                  {inArca ? 'Existe' : 'No en ARCA'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  inDb ? 'bg-blue-100 text-blue-800' : 'bg-red-50 text-red-700'
                                }`}>
                                  {inDb ? 'Existe' : 'No Registrada'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold">
                                {orig === 'EXTERNA_MANUAL' ? (
                                  <span className="text-amber-800 font-bold">EXTERNA</span>
                                ) : orig === 'ARCA_LOCAL' ? (
                                  <span className="text-blue-800 font-bold">SISTEMA</span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-[11px] font-mono">
                                  {stat === 'REGISTRADA_EXTERNAMENTE' ? 'PENDIENTE' : stat === 'VERIFICADA_EN_ARCA' ? 'VERIFICADA' : (stat || '-')}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold">
                                <span className={`inline-flex items-center gap-1 ${
                                  obs === 'OK'
                                    ? 'text-green-700 font-bold'
                                    : obs === 'SOLO_LOCAL'
                                      ? 'text-amber-700 font-bold'
                                      : obs.includes('FALTANTE')
                                        ? 'text-red-600 font-bold'
                                        : 'text-amber-700 font-bold'
                                }`}>
                                  {obs === 'SOLO_LOCAL' ? 'Solo en Base Local' : obs}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-end shrink-0">
              <button
                onClick={() => setShowRangeModal(false)}
                className="px-6 py-2.5 font-bold text-on-surface-variant hover:bg-black/5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
