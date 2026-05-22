import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { employeesService } from '../../services/employees.service';
import { Employee } from '../../types/permissions.types';
import { PermissionGuard } from '../../components/auth/PermissionGuard';

export const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalNode(document.getElementById('admin-header-portal'));
  }, []);
  
  // Extendemos el tipo para incluir password que usará la Edge Function
  const [formData, setFormData] = useState<Partial<Employee> & { password?: string }>({
    user_id: '',
    email: '',
    name: '',
    role: 'employee',
    active: true,
    password: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await employeesService.getAllEmployees();
        setEmployees(data || []);
      } catch (err: any) {
        setError('Error al cargar empleados: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1400px]">
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

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest text-left text-[11px] font-black text-on-surface-variant uppercase tracking-wider">
                  <th className="p-6">Empleado</th>
                  <th className="p-6">Rol</th>
                  <th className="p-6">Estado</th>
                  <th className="p-6">Fecha Creación</th>
                  <th className="p-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-surface-container-lowest transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-background">{emp.name}</p>
                          <p className="text-xs text-on-surface-variant">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-surface-container-low text-on-surface text-xs font-bold rounded-lg uppercase tracking-wider">
                        {emp.role}
                      </span>
                    </td>
                    <td className="p-6">
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
                    <td className="p-6 text-sm text-on-surface-variant">
                      {new Date(emp.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-6 text-right">
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
                    </td>
                  </tr>
                ))}
                
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[48px] opacity-20 mb-4 block">group</span>
                      <p className="text-sm font-bold">No hay empleados registrados</p>
                      <p className="text-xs mt-1">Crea un empleado desde el botón "Nuevo Empleado"</p>
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
                const data = await employeesService.getAllEmployees();
                setEmployees(data || []);
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
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  disabled={!!editingEmployee}
                />
                {editingEmployee && <p className="text-[10px] text-on-surface-variant mt-1 ml-1">El email no se puede cambiar luego de creado.</p>}
              </div>

              {!editingEmployee && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Contraseña Temporal</label>
                  <input 
                    type="text" 
                    required={!editingEmployee}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Contraseña inicial para el usuario"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1 ml-1">Rol</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value as any})}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
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
                  className="w-4 h-4 rounded text-primary focus:ring-primary"
                />
                <label htmlFor="emp-active" className="text-sm font-bold cursor-pointer">Cuenta Activa</label>
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
    </div>
  );
};
