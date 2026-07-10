import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from '../../context/AdminContext';
import type { Expense, ExpenseType, ExpensePaymentMethod } from '../../types/expense.types';
import {
  EXPENSE_TYPE_LABELS,
  EXPENSE_TYPE_ICONS,
  EXPENSE_PAYMENT_METHOD_LABELS,
} from '../../types/expense.types';
import { AdminPeriodSelector, getPeriodRange } from '../../components/AdminPeriodSelector';
import { useAuthStore } from '../../stores/useAuthStore';
import { employeesService } from '../../services/employees.service';
import { Employee } from '../../types/permissions.types';

const EXPENSE_TYPES: ExpenseType[] = [
  'mercaderia', 'proveedor', 'sueldos', 'alquiler',
  'impuestos', 'retiro', 'combustible', 'mantenimiento',
  'administrativo', 'otros',
];

const PAYMENT_METHODS: { id: ExpensePaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'Efectivo', icon: 'payments' },
  { id: 'transfer', label: 'Transferencia', icon: 'account_balance' },
  { id: 'card', label: 'Tarjeta', icon: 'credit_card' },
  { id: 'cuenta_corriente', label: 'Cta. Corriente', icon: 'menu_book' },
];

const emptyForm = {
  type: 'mercaderia' as ExpenseType,
  supplier_name: '',
  amount: '',
  payment_method: 'cash' as ExpensePaymentMethod,
  description: '',
  observations: '',
  created_by: '',
  expense_date: new Date().toISOString().split('T')[0],
};

const getSupplierFieldConfig = (type: ExpenseType) => {
  switch (type) {
    case 'mercaderia':
      return { label: 'Lugar de Compra / Establecimiento', placeholder: 'Ej: Distribuidora Norte, Mayorista...' };
    case 'proveedor':
      return { label: 'Proveedor', placeholder: 'Ej: Coca-Cola, Arcor...' };
    case 'sueldos':
      return { label: 'Empleado / Destinatario', placeholder: 'Ej: Juan Pérez...' };
    case 'alquiler':
      return { label: 'Propietario / Inmobiliaria', placeholder: 'Ej: Propietario Belgrano...' };
    case 'impuestos':
      return { label: 'Ente Recaudador / Impuesto', placeholder: 'Ej: AFIP, Municipalidad...' };
    case 'retiro':
      return { label: 'Dueño / Socio', placeholder: 'Ej: Lautaro...' };
    case 'combustible':
      return { label: 'Estación de Servicio', placeholder: 'Ej: YPF, Shell...' };
    case 'mantenimiento':
      return { label: 'Técnico / Proveedor', placeholder: 'Ej: Electricista, Plomero...' };
    case 'administrativo':
      return { label: 'Proveedor / Destino', placeholder: 'Ej: Librería, Correo...' };
    default:
      return { label: 'Destinatario / Entidad', placeholder: 'Ej: Banco, Aseguradora...' };
  }
};

export const Expenses: React.FC = () => {
  const { expenses, addExpense, updateExpense, cancelExpense, payExpense, formatCurrency } = useAdmin();
  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  const [period, setPeriod] = useState('Este Mes');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.getElementById('admin-header-portal')); }, []);

  // Filters
  const [searchDesc, setSearchDesc] = useState('');
  const [searchSupplier, setSearchSupplier] = useState('');
  const [searchResponsible, setSearchResponsible] = useState('');
  const [filterType, setFilterType] = useState('todos');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Pay modal state
  const [payModalExpense, setPayModalExpense] = useState<Expense | null>(null);
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer'>('cash');

  // Employees for responsible selector
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    employeesService.getAllEmployees().then(data => setEmployees(data || [])).catch(() => {});
  }, []);

  // View modal
  const [viewExpense, setViewExpense] = useState<Expense | null>(null);

  // Period params
  const analyticsParams = useMemo(() => {
    return getPeriodRange(period, customRange);
  }, [period, customRange]);

  // Active expenses in period
  const activeExpenses = useMemo(() => {
    return expenses.filter(e => e.status === 'active');
  }, [expenses]);

  const filteredByPeriod = useMemo(() => {
    return activeExpenses.filter(e => {
      const ts = new Date(e.created_at).getTime();
      return ts >= analyticsParams.from && ts <= analyticsParams.to;
    });
  }, [activeExpenses, analyticsParams]);

  // Summary cards
  const summary = useMemo(() => {
    const total = filteredByPeriod.reduce((s, e) => s + e.amount, 0);
    const proveedores = filteredByPeriod.filter(e => e.type === 'proveedor' || e.type === 'mercaderia').reduce((s, e) => s + e.amount, 0);
    const sueldos = filteredByPeriod.filter(e => e.type === 'sueldos' || e.type === 'retiro').reduce((s, e) => s + e.amount, 0);
    const serviciosImpuestos = filteredByPeriod.filter(e => e.type === 'impuestos' || e.type === 'alquiler').reduce((s, e) => s + e.amount, 0);
    const otros = filteredByPeriod.filter(e => !['proveedor', 'mercaderia', 'sueldos', 'retiro', 'impuestos', 'alquiler'].includes(e.type)).reduce((s, e) => s + e.amount, 0);
    return { total, proveedores, sueldos, serviciosImpuestos, otros };
  }, [filteredByPeriod]);

  // Filtered table rows
  const tableRows = useMemo(() => {
    return filteredByPeriod.filter(e => {
      const descMatch = searchDesc === '' || (e.description || '').toLowerCase().includes(searchDesc.toLowerCase());
      const supplierMatch = searchSupplier === '' || (e.supplier_name || '').toLowerCase().includes(searchSupplier.toLowerCase());
      const responsibleMatch = searchResponsible === '' || e.created_by.toLowerCase().includes(searchResponsible.toLowerCase());
      const typeMatch = filterType === 'todos' || e.type === filterType;
      return descMatch && supplierMatch && responsibleMatch && typeMatch;
    }).sort((a, b) => new Date(b.last_activity_at || b.created_at).getTime() - new Date(a.last_activity_at || a.created_at).getTime());
  }, [filteredByPeriod, searchDesc, searchSupplier, searchResponsible, filterType]);

  // Open modal for new expense
  const openNew = () => {
    setEditingExpense(null);
    setFormData({ ...emptyForm, expense_date: new Date().toISOString().split('T')[0], created_by: employeeProfile?.name || '' });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setFormData({
      type: exp.type,
      supplier_name: exp.supplier_name || '',
      amount: String(exp.amount),
      payment_method: exp.payment_method,
      description: exp.description || '',
      observations: exp.observations || '',
      created_by: exp.created_by,
      expense_date: exp.expense_date,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(formData.amount);
    if (!parsedAmount || parsedAmount <= 0) { setFormError('El monto debe ser mayor a 0.'); return; }
    if (!formData.created_by.trim()) { setFormError('El responsable es obligatorio.'); return; }
    setIsSaving(true);

    if (editingExpense) {
      updateExpense(editingExpense.id, {
        type: formData.type,
        supplier_name: formData.supplier_name || undefined,
        amount: parsedAmount,
        payment_method: formData.payment_method,
        description: formData.description || undefined,
        observations: formData.observations || undefined,
        created_by: formData.created_by,
        expense_date: formData.expense_date,
      });
    } else {
      addExpense({
        branch_id: 'main',
        type: formData.type,
        supplier_name: formData.supplier_name || undefined,
        amount: parsedAmount,
        payment_method: formData.payment_method,
        description: formData.description || undefined,
        observations: formData.observations || undefined,
        created_by: formData.created_by,
        expense_date: formData.expense_date,
        status: 'active',
      });

    }

    setIsSaving(false);
    setShowModal(false);
  };

  const handleCancel = (exp: Expense) => {
    if (!window.confirm(`¿Eliminar el egreso "${EXPENSE_TYPE_LABELS[exp.type]}" de $${formatCurrency(exp.amount)}? No se puede deshacer.`)) return;
    cancelExpense(exp.id);
  };

  const summaryCards = [
    { label: 'Total Egresos', value: summary.total, icon: 'arrow_circle_down', color: 'bg-rose-50 text-rose-600', border: 'border-rose-100' },
    { label: 'Proveedores y Mercadería', value: summary.proveedores, icon: 'local_shipping', color: 'bg-orange-50 text-orange-600', border: 'border-orange-100' },
    { label: 'Sueldos y Retiros', value: summary.sueldos, icon: 'badge', color: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
    { label: 'Alquiler e Impuestos', value: summary.serviciosImpuestos, icon: 'bolt', color: 'bg-purple-50 text-purple-600', border: 'border-purple-100' },
    { label: 'Otros Gastos', value: summary.otros, icon: 'more_horiz', color: 'bg-surface-container text-on-surface-variant', border: 'border-outline-variant/20' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px]">
      {/* Portal: Period Selector */}
      <AdminPeriodSelector period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} />

      {/* Portal: New Expense Button */}
      {portalTarget && createPortal(
        <button
          onClick={openNew}
          id="btn-nuevo-egreso"
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-full transition-all shadow-lg shadow-rose-600/20 text-xs shrink-0 ml-4"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Nuevo Egreso
        </button>,
        portalTarget
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryCards.map((card, i) => (
          <div key={i} className={`bg-white p-5 rounded-[1.75rem] border ${card.border} shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
              <span className="material-symbols-outlined text-[22px]">{card.icon}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider leading-tight mb-1">{card.label}</p>
              <p className="text-lg font-black text-on-background">${formatCurrency(card.value)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Table */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-6 border-b border-outline-variant/10">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="text-sm font-bold text-on-surface-variant bg-surface-container-low px-4 py-2.5 rounded-xl shrink-0 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              {tableRows.length} {tableRows.length === 1 ? 'registro' : 'registros'}
            </div>
            <div className="relative flex-1 min-w-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">local_shipping</span>
              <input
                type="text"
                placeholder="Buscar por proveedor..."
                value={searchSupplier}
                onChange={e => setSearchSupplier(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 ring-primary/20 transition-all"
              />
            </div>
            <div className="relative flex-1 min-w-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">person</span>
              <input
                type="text"
                placeholder="Buscar por responsable..."
                value={searchResponsible}
                onChange={e => setSearchResponsible(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 ring-primary/20 transition-all"
              />
            </div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-surface-container-low border-none rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 ring-primary/20 cursor-pointer font-bold text-on-surface-variant shrink-0"
            >
              <option value="todos">Todas las categorías</option>
              {EXPENSE_TYPES.map(t => (
                <option key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <div className="text-sm font-black text-rose-600 bg-rose-50 border border-rose-100 px-4 py-2.5 rounded-xl shrink-0 flex items-center gap-1.5 ml-auto">
              <span className="material-symbols-outlined text-[18px]">payments</span>
              Total: ${formatCurrency(tableRows.reduce((s, e) => s + e.amount, 0))}
            </div>
          </div>
        </div>

        {/* Table - Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/10">
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4">Estado / Cancelación</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">arrow_circle_down</span>
                    <p className="text-on-surface-variant font-medium">No hay egresos en este período</p>
                    <p className="text-on-surface-variant/60 text-xs mt-1">Usá el botón "Nuevo Egreso" para registrar uno.</p>
                  </td>
                </tr>
              ) : tableRows.map(exp => (
                <tr key={exp.id} className="hover:bg-surface-container-lowest transition-colors group">
                  <td className="px-6 py-4 text-on-surface-variant">
                    <div>
                      <p className="font-bold text-on-background">{new Date(exp.expense_date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                      <p className="text-[10px] text-on-surface-variant">{new Date(exp.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{EXPENSE_TYPE_ICONS[exp.type]}</span>
                      <span className="font-bold text-on-background">{EXPENSE_TYPE_LABELS[exp.type]}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{exp.supplier_name || '—'}</td>
                  <td className="px-6 py-4 text-on-surface-variant max-w-[180px] truncate">{exp.description || '—'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold self-start ${
                        exp.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                        exp.payment_method === 'transfer' ? 'bg-purple-50 text-purple-700' :
                        exp.payment_method === 'card' ? 'bg-blue-50 text-blue-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {EXPENSE_PAYMENT_METHOD_LABELS[exp.payment_method]}
                      </span>
                      {exp.payment_method === 'cuenta_corriente' && (
                        <span className={`text-[9px] font-black uppercase tracking-wider ${exp.payment_status === 'pending' ? 'text-orange-600' : 'text-green-600'}`}>
                          {exp.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {exp.payment_method === 'cuenta_corriente' ? (
                      exp.payment_status === 'paid' ? (
                        <div className="text-[10px]">
                          <p className="font-bold text-on-background">El {new Date(exp.cancellation_date!).toLocaleDateString('es-AR')}</p>
                          <p className="text-on-surface-variant flex items-center gap-1 mt-0.5">
                            Con <span className={`font-black ${exp.cancellation_method === 'cash' ? 'text-green-700' : exp.cancellation_method === 'transfer' ? 'text-purple-700' : 'text-blue-700'}`}>{EXPENSE_PAYMENT_METHOD_LABELS[exp.cancellation_method!]}</span>
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-on-surface-variant italic">Aún no pagado</span>
                      )
                    ) : (
                      <span className="text-[10px] text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant font-medium">{exp.created_by}</td>
                  <td className="px-6 py-4 text-right font-black text-rose-600">${formatCurrency(exp.amount)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {exp.payment_method === 'cuenta_corriente' && exp.payment_status === 'pending' && (
                        <button
                          onClick={() => setPayModalExpense(exp)}
                          className="w-8 h-8 rounded-xl bg-orange-100 hover:bg-orange-200 flex items-center justify-center transition-colors text-orange-700"
                          title="Saldar Deuda"
                        >
                          <span className="material-symbols-outlined text-[18px]">payments</span>
                        </button>
                      )}
                      <button
                        onClick={() => setViewExpense(exp)}
                        className="w-8 h-8 rounded-xl hover:bg-surface-container-low flex items-center justify-center transition-colors text-on-surface-variant"
                        title="Ver detalle"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
                      <button
                        onClick={() => openEdit(exp)}
                        className="w-8 h-8 rounded-xl hover:bg-primary/10 flex items-center justify-center transition-colors text-primary"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleCancel(exp)}
                        className="w-8 h-8 rounded-xl hover:bg-error/10 flex items-center justify-center transition-colors text-error"
                        title="Eliminar"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-outline-variant/10">
          {tableRows.length === 0 ? (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">arrow_circle_down</span>
              <p className="text-on-surface-variant font-medium text-sm">No hay egresos en este período</p>
            </div>
          ) : tableRows.map(exp => (
            <div key={exp.id} className="p-4 flex items-center justify-between gap-3">
              <div className="w-10 h-10 shrink-0 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">{EXPENSE_TYPE_ICONS[exp.type]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-background truncate">{EXPENSE_TYPE_LABELS[exp.type]}</p>
                <p className="text-xs text-on-surface-variant truncate">{exp.description || exp.supplier_name || exp.created_by}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{new Date(exp.expense_date + 'T12:00:00').toLocaleDateString('es-AR')}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-rose-600">${formatCurrency(exp.amount)}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  exp.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                  exp.payment_method === 'transfer' ? 'bg-purple-50 text-purple-700' :
                  'bg-blue-50 text-blue-700'
                }`}>{EXPENSE_PAYMENT_METHOD_LABELS[exp.payment_method]}</span>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => openEdit(exp)} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                </button>
                <button onClick={() => handleCancel(exp)} className="w-7 h-7 rounded-lg bg-error/10 text-error flex items-center justify-center">
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>


      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSaving && setShowModal(false)} />
          <div className="bg-white w-full md:max-w-2xl rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl relative z-10 animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-300 flex flex-col max-h-[92dvh]">
            {/* Header */}
            <div className="flex justify-between items-center px-8 pt-8 pb-4 shrink-0">
              <div>
                <h3 className="text-xl font-black text-on-background">{editingExpense ? 'Editar Egreso' : 'Nuevo Egreso'}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Completá los datos del egreso</p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Form */}
            <div className="overflow-y-auto flex-1 px-8 pb-4 space-y-5">
              {/* Type */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Tipo de Egreso</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {EXPENSE_TYPES.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, type: t }))}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center ${formData.type === t ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-low'}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{EXPENSE_TYPE_ICONS[t]}</span>
                      <span className="text-[9px] font-black leading-tight">{EXPENSE_TYPE_LABELS[t]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Amount */}
                <div>
                  <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-on-surface-variant/40">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 pl-10 pr-4 text-lg font-black outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all"
                    />
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Fecha</label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={e => setFormData(f => ({ ...f, expense_date: e.target.value }))}
                    className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 font-bold outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Método de Pago</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, payment_method: m.id }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${formData.payment_method === m.id ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-outline-variant/15 text-on-surface-variant hover:bg-surface-container-low'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                      <span className="text-[9px] font-black">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Proveedor / Dinámico */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                  {getSupplierFieldConfig(formData.type).label}
                </label>
                {formData.type === 'sueldos' ? (
                  <select
                    value={formData.supplier_name}
                    onChange={e => {
                      const emp = employees.find(em => em.name === e.target.value);
                      setFormData(f => ({
                        ...f,
                        supplier_name: e.target.value,
                        // Auto-fill description if empty or matches previous auto pattern
                        description: emp && (!f.description || f.description.startsWith('Pago de sueldo -'))
                          ? `Pago de sueldo - ${emp.name}`
                          : f.description,
                      }));
                    }}
                    className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all cursor-pointer"
                  >
                    <option value="">Seleccionar empleado...</option>
                    {employees
                      .filter(e => e.active)
                      .map(e => {
                        const roleLabel = e.role === 'owner' ? 'Dueño'
                          : e.role === 'admin' || e.role === 'super_admin' ? 'Admin'
                          : 'Empleado';
                        return (
                          <option key={e.id} value={e.name}>{e.name} — {roleLabel}</option>
                        );
                      })}
                    {formData.supplier_name && !employees.find(e => e.name === formData.supplier_name) && (
                      <option value={formData.supplier_name}>{formData.supplier_name}</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={e => setFormData(f => ({ ...f, supplier_name: e.target.value }))}
                    placeholder={getSupplierFieldConfig(formData.type).placeholder}
                    className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all"
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Descripción</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ej: Facturas de luz y gas de julio"
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all"
                />
              </div>

              {/* Observations */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Observaciones</label>
                <textarea
                  value={formData.observations}
                  onChange={e => setFormData(f => ({ ...f, observations: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 text-sm font-medium outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all resize-none"
                />
              </div>

              {/* Responsible */}
              <div>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Responsable</label>
                <select
                  value={formData.created_by}
                  onChange={e => setFormData(f => ({ ...f, created_by: e.target.value }))}
                  className="w-full bg-surface-container-lowest border-2 border-outline-variant/20 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all cursor-pointer"
                >
                  <option value="">Seleccionar responsable...</option>
                  {employees
                    .filter(e => e.active && (e.role === 'owner' || e.role === 'admin' || e.role === 'super_admin'))
                    .map(e => (
                      <option key={e.id} value={e.name}>{e.name} ({e.role === 'owner' ? 'Dueño' : 'Admin'})</option>
                    ))}
                  {/* Fallback: allow manual input */}
                  {formData.created_by && !employees.find(e => e.name === formData.created_by) && (
                    <option value={formData.created_by}>{formData.created_by}</option>
                  )}
                </select>
              </div>

              {formError && (
                <div className="bg-red-50 text-error text-sm font-bold p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-outline-variant/10 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isSaving}
                className="flex-1 py-4 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] py-4 bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                {isSaving ? 'Guardando...' : editingExpense ? 'Actualizar Egreso' : 'Guardar Egreso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewExpense && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewExpense(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 p-8 animate-in zoom-in-95 duration-300 space-y-5">
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">{EXPENSE_TYPE_ICONS[viewExpense.type]}</span>
              </div>
              <button onClick={() => setViewExpense(null)} className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div>
              <h3 className="text-2xl font-black text-on-background">{EXPENSE_TYPE_LABELS[viewExpense.type]}</h3>
              <p className="text-3xl font-black text-rose-600 mt-1">${formatCurrency(viewExpense.amount)}</p>
            </div>
            <div className="space-y-3 divide-y divide-outline-variant/10">
              {[
                { label: 'Fecha', value: new Date(viewExpense.expense_date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) },
                { label: 'Método de pago', value: EXPENSE_PAYMENT_METHOD_LABELS[viewExpense.payment_method] },
                viewExpense.supplier_name ? { label: getSupplierFieldConfig(viewExpense.type).label.replace(' (opcional)', ''), value: viewExpense.supplier_name } : null,
                viewExpense.description ? { label: 'Descripción', value: viewExpense.description } : null,
                viewExpense.observations ? { label: 'Observaciones', value: viewExpense.observations } : null,
                { label: 'Responsable', value: viewExpense.created_by },
                { label: 'Registrado', value: new Date(viewExpense.created_at).toLocaleString('es-AR') },
              ].filter(Boolean).map((row: any) => (
                <div key={row.label} className="flex justify-between items-start pt-3 gap-4">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider shrink-0">{row.label}</span>
                  <span className="text-sm font-bold text-on-background text-right">{row.value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setViewExpense(null)} className="w-full py-4 bg-surface-container-low font-bold rounded-2xl hover:bg-surface-container transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Pay Modal for CC Expenses */}
      {payModalExpense && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPayModalExpense(null)} />
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 p-8 animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-black text-on-background mb-2 text-center">Saldar Egreso</h3>
            <p className="text-sm text-on-surface-variant text-center mb-6">
              Confirmá el método con el que pagaste este egreso de <span className="font-bold text-rose-600">${formatCurrency(payModalExpense.amount)}</span>.
            </p>

            <div className="space-y-4 mb-8">
              <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">Método de Cancelación</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash' as const, label: 'Efectivo', icon: 'payments' },
                  { id: 'card' as const, label: 'Tarjeta', icon: 'credit_card' },
                  { id: 'transfer' as const, label: 'Transf.', icon: 'account_balance' }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPayMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${payMethod === m.id ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-low'}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                    <span className="text-[10px] font-bold">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  payExpense(payModalExpense.id, payMethod);
                  setPayModalExpense(null);
                }}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-transform active:scale-[0.98]"
              >
                Confirmar Pago
              </button>
              <button
                onClick={() => setPayModalExpense(null)}
                className="w-full text-on-surface-variant font-bold py-4 rounded-2xl hover:bg-surface-container-low transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
