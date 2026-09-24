import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { employeesService } from '../../services/employees.service';
import { Employee } from '../../types/permissions.types';
import { PermissionGuard } from '../../components/auth/PermissionGuard';
import { useScrollLock } from '../../utils/useScrollLock';

type FilterType = 'todos' | 'activos' | 'inactivos' | 'administradores' | 'empleados' | 'dueños';
type SortField = 'name' | 'role' | 'active' | 'created_at';
type SortDirection = 'asc' | 'desc';

export const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  useScrollLock(showModal);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  // Search & Filter & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('todos');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    setPortalNode(document.getElementById('admin-header-portal'));
  }, []);
  
  // Extendemos el tipo para incluir password que usará la Edge Function
  const [formData, setFormData] = useState<Partial<Employee> & { password?: string }>({
    user_id: '',
    email: '',
    name: '',
    role: 'employee',
    phone: '',
    active: true,
    password: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empData, deliveryData] = await Promise.all([
        employeesService.getAllEmployees(),
        employeesService.getActiveDeliveryAssignment()
      ]);
      setEmployees(empData || []);
      if (deliveryData) {
        setActiveDeliveryId(deliveryData.employee_id);
      } else {
        setActiveDeliveryId(null);
      }
    } catch (err: any) {
      setError('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteEmployee = async (emp: Employee) => {
    setIsDeleting(true);
    try {
      await employeesService.deleteEmployee(emp.id);
      setEmployees(prev => prev.filter(e => e.id !== emp.id));
      setDeletingEmployee(null);
    } catch (err: any) {
      alert('Error al eliminar empleado: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const handleDeliveryChange = async (newEmployeeId: string) => {
    setDeliveryLoading(true);
    try {
      if (!newEmployeeId) {
        await employeesService.pauseDailyDelivery();
        setActiveDeliveryId(null);
      } else {
        await employeesService.assignDailyDelivery(newEmployeeId);
        setActiveDeliveryId(newEmployeeId);
        const { whatsappMessageService } = await import('../../services/whatsapp-message.service');
        const emp = employees.find(e => e.id === newEmployeeId);
        if (emp && emp.phone) {
          await whatsappMessageService.dispatchPendingDeliveryAlerts(emp.phone);
        }
      }
    } catch (err: any) {
      alert('Error al actualizar delivery: ' + err.message);
    } finally {
      setDeliveryLoading(false);
    }
  };

  const handleToggleDelivery = async (employeeId: string, isCurrentlyActive: boolean) => {
    try {
      if (isCurrentlyActive) {
        await employeesService.pauseDailyDelivery();
        setActiveDeliveryId(null);
      } else {
        await employeesService.assignDailyDelivery(employeeId);
        setActiveDeliveryId(employeeId);
        // Despachar los mensajes pendientes (Llamamos a whatsappService)
        const { whatsappMessageService } = await import('../../services/whatsapp-message.service');
        const emp = employees.find(e => e.id === employeeId);
        if (emp && emp.phone) {
          await whatsappMessageService.dispatchPendingDeliveryAlerts(emp.phone);
        }
      }
    } catch (err: any) {
      alert('Error al actualizar delivery: ' + err.message);
    }
  };

  // Summary Stats calculations
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.active).length;
    const inactive = employees.filter(e => !e.active).length;
    const admins = employees.filter(e => e.role === 'admin' || e.role === 'super_admin').length;
    const regularEmployees = employees.filter(e => e.role === 'employee').length;
    const owners = employees.filter(e => e.role === 'owner').length;
    return { total, active, inactive, admins, regularEmployees, owners };
  }, [employees]);

  // Combined Search and Filter logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // 1. Search Query Match (Name, Email)
      const matchesSearch = searchQuery.trim() === '' || 
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Active Filter Match
      let matchesFilter = true;
      if (activeFilter === 'activos') {
        matchesFilter = emp.active;
      } else if (activeFilter === 'inactivos') {
        matchesFilter = !emp.active;
      } else if (activeFilter === 'administradores') {
        matchesFilter = emp.role === 'admin' || emp.role === 'super_admin';
      } else if (activeFilter === 'empleados') {
        matchesFilter = emp.role === 'employee';
      } else if (activeFilter === 'dueños') {
        matchesFilter = emp.role === 'owner';
      }

      return matchesSearch && matchesFilter;
    });
  }, [employees, searchQuery, activeFilter]);

  // Sorting logic
  const sortedEmployees = useMemo(() => {
    const items = [...filteredEmployees];
    items.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'role') {
        const roleOrder: Record<string, number> = { owner: 1, super_admin: 2, admin: 3, employee: 4 };
        const orderA = roleOrder[a.role] || 99;
        const orderB = roleOrder[b.role] || 99;
        comparison = orderA - orderB;
      } else if (sortField === 'active') {
        comparison = (a.active ? 1 : 0) - (b.active ? 1 : 0);
      } else if (sortField === 'created_at') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return items;
  }, [filteredEmployees, sortField, sortDirection]);

  // Toggle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return (
      <span className="material-symbols-outlined text-[12px] align-middle ml-1">
        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
      </span>
    );
  };

  const summaryCards = [
    { 
      label: 'Total de empleados', 
      value: stats.total, 
      subvalue: 'Usuarios registrados', 
      icon: 'groups', 
      color: 'bg-blue-50 text-blue-600', 
      border: 'border-blue-100' 
    },
    { 
      label: 'Estado de cuentas', 
      value: `${stats.active} Activos`, 
      subvalue: `${stats.inactive} Inactivos`, 
      icon: 'toggle_on', 
      color: 'bg-green-50 text-green-600', 
      border: 'border-green-100' 
    },
    { 
      label: 'Roles y Acceso', 
      value: `${stats.admins} Admins`, 
      subvalue: `${stats.regularEmployees} Empleados • ${stats.owners} Dueños`, 
      icon: 'shield_person', 
      color: 'bg-purple-50 text-purple-600', 
      border: 'border-purple-100' 
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700 max-w-[1400px]">
      {portalNode && createPortal(
        <PermissionGuard permission="employees.create">
          <button 
            onClick={() => {
              setEditingEmployee(null);
              setFormData({ user_id: '', email: '', name: '', role: 'employee', active: true, password: '' });
              setShowModal(true);
            }}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2 rounded-full transition-colors shadow-lg shadow-primary/20 text-xs"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            Nuevo Empleado
          </button>
        </PermissionGuard>,
        portalNode
      )}

      {error && (
        <div className="bg-red-50 text-error p-4 rounded-2xl border border-red-100 flex items-center gap-3">
          <span className="material-symbols-outlined">error</span>
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {summaryCards.map((card, i) => (
          <div key={i} className={`bg-white p-4 sm:p-5 rounded-2xl sm:rounded-[1.75rem] border ${card.border} shadow-sm flex flex-col gap-2.5 sm:gap-3 hover:shadow-md transition-shadow ${i === 2 ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${card.color} shrink-0`}>
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">{card.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider leading-tight mb-1 truncate">{card.label}</p>
              <p className="text-lg sm:text-xl font-black text-on-background truncate">{card.value}</p>
              <p className="text-[11px] sm:text-xs text-on-surface-variant mt-0.5 font-medium truncate">{card.subvalue}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
          {/* Search and Filters Bar */}
          <div className="p-4 sm:p-6 border-b border-outline-variant/10">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search input */}
              <div className="relative flex-1 min-w-0">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Buscar por nombre, apellido o email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 ring-primary/20 transition-all font-medium"
                />
              </div>

              {/* Delivery Assignment Selector */}
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-1.5 shrink-0">
                <span className={`material-symbols-outlined text-amber-600 text-[18px] ${deliveryLoading ? 'animate-spin' : ''}`}>
                  {deliveryLoading ? 'sync' : 'local_shipping'}
                </span>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-700">Delivery de Turno</span>
                  <select
                    value={activeDeliveryId || ''}
                    disabled={deliveryLoading}
                    onChange={e => handleDeliveryChange(e.target.value)}
                    className="bg-transparent border-none p-0 text-xs font-bold text-amber-900 focus:outline-none cursor-pointer pr-4"
                  >
                    <option value="">Sin delivery asignado</option>
                    {employees
                      .filter(e => e.active)
                      .map(e => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.role === 'admin' ? 'Admin' : e.role === 'owner' ? 'Dueño' : 'Empleado'})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Filters Select Dropdown */}
              <select
                value={activeFilter}
                onChange={e => setActiveFilter(e.target.value as FilterType)}
                className="bg-surface-container-low border-none rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 ring-primary/20 cursor-pointer font-bold text-on-surface-variant shrink-0"
              >
                <option value="todos">Todos los empleados</option>
                <option value="activos">Solo Activos</option>
                <option value="inactivos">Solo Inactivos</option>
                <option value="administradores">Solo Administradores</option>
                <option value="empleados">Solo Empleados</option>
                <option value="dueños">Solo Dueños</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest text-left text-[11px] font-black text-on-surface-variant uppercase tracking-wider select-none">
                  <th onClick={() => handleSort('name')} className="p-4 sm:p-6 cursor-pointer hover:text-primary transition-colors whitespace-nowrap">
                    Empleado {renderSortIndicator('name')}
                  </th>
                  <th onClick={() => handleSort('role')} className="p-4 sm:p-6 cursor-pointer hover:text-primary transition-colors whitespace-nowrap">
                    Rol {renderSortIndicator('role')}
                  </th>
                  <th onClick={() => handleSort('active')} className="p-4 sm:p-6 cursor-pointer hover:text-primary transition-colors whitespace-nowrap">
                    Estado {renderSortIndicator('active')}
                  </th>
                  <th onClick={() => handleSort('created_at')} className="p-4 sm:p-6 cursor-pointer hover:text-primary transition-colors whitespace-nowrap">
                    Fecha Creación {renderSortIndicator('created_at')}
                  </th>
                  <th className="p-4 sm:p-6 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {sortedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-surface-container-lowest transition-colors group">
                    <td className="p-4 sm:p-6 whitespace-nowrap">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-background truncate">{emp.name}</p>
                          <p className="text-xs text-on-surface-variant truncate">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 sm:p-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-surface-container-low text-on-surface text-xs font-bold rounded-lg uppercase tracking-wider">
                          {emp.role === 'admin' ? 'Administrador' : emp.role === 'owner' ? 'Dueño' : emp.role === 'employee' ? 'Empleado' : emp.role === 'super_admin' ? 'Super Admin' : emp.role}
                        </span>
                        {activeDeliveryId === emp.id && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 animate-pulse">
                            <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                            Delivery Activo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 sm:p-6 whitespace-nowrap">
                      {emp.active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-xs font-bold border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-4 sm:p-6 text-sm text-on-surface-variant whitespace-nowrap">
                      {new Date(emp.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="p-4 sm:p-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <PermissionGuard permission="employees.update">
                          <button 
                            onClick={() => {
                              setEditingEmployee(emp);
                              setFormData({ ...emp });
                              setShowModal(true);
                            }}
                            className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-xl"
                            title="Editar Empleado"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                        </PermissionGuard>
                        <PermissionGuard permission="employees.update">
                          <button 
                            onClick={() => setDeletingEmployee(emp)}
                            className="p-2 text-on-surface-variant hover:text-error transition-colors hover:bg-red-50 rounded-xl"
                            title="Eliminar Empleado"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </PermissionGuard>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {sortedEmployees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[48px] opacity-20 mb-4 block">group</span>
                      <p className="text-sm font-bold">No se encontraron empleados.</p>
                      <p className="text-xs mt-1">Intentá ajustando los filtros o la búsqueda.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Crear / Editar Empleado */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSaving && setShowModal(false)} />
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 p-8 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-on-background">
                {editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsSaving(true);
              try {
                if (editingEmployee) {
                  // Al editar solo enviamos datos a la BD
                  const updateData = { ...formData };
                  delete updateData.password;
                  await employeesService.updateEmployee(editingEmployee.id, updateData);
                } else {
                  // Al crear usamos la Edge Function
                  await employeesService.createEmployeeThroughFunction(formData);
                }
                await fetchData();
                setShowModal(false);
              } catch (err: any) {
                // Parse Axios error message
                const msg = err.response?.data?.error || err.message;
                alert('Error al guardar: ' + msg);
              } finally {
                setIsSaving(false);
              }
            }} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Nombre</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                  disabled={!!editingEmployee}
                />
                {editingEmployee && <p className="text-[10px] text-on-surface-variant mt-1 ml-1">El email no se puede cambiar luego de creado.</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Teléfono (WhatsApp)</label>
                <input 
                  type="text" 
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                  placeholder="Ej: 5491123456789"
                />
              </div>

              {!editingEmployee && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Contraseña Temporal</label>
                  <input 
                    type="text" 
                    required={!editingEmployee}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                    placeholder="Contraseña inicial para el usuario"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Rol</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value as any})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer font-bold"
                >
                  <option value="employee">Empleado Normal</option>
                  <option value="admin">Administrador</option>
                  <option value="owner">Dueño</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="checkbox" 
                  id="emp-active"
                  checked={formData.active}
                  onChange={(e) => setFormData({...formData, active: e.target.checked})}
                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="emp-active" className="text-sm font-bold cursor-pointer select-none">Cuenta Activa</label>
              </div>

              <div className="flex gap-3 pt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-[2] py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Guardar Empleado'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isDeleting && setDeletingEmployee(null)} />
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 p-8 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px] text-red-600">person_remove</span>
              </div>
              <div>
                <h3 className="text-lg font-black text-on-background">¿Eliminar empleado?</h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  Vas a eliminar permanentemente a <span className="font-bold text-on-background">{deletingEmployee.name}</span>.
                  <br />
                  <span className="text-xs text-on-surface-variant/70 mt-1 block">{deletingEmployee.email}</span>
                </p>
                <p className="text-xs text-red-600 font-bold mt-3 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
                  Esta acción no se puede deshacer. El usuario perderá acceso al panel de admin.
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingEmployee(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-xl transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteEmployee(deletingEmployee)}
                  disabled={isDeleting}
                  className="flex-[2] py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-200 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Eliminando...</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">delete_forever</span> Sí, eliminar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
