-- =======================================================
-- LA MARTINA - SCRIPT DE BASE DE DATOS PARA EMPLEADOS (RBAC)
-- =======================================================

-- 1. Crear tabla de Empleados
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    branch_id TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    permissions_override JSONB NOT NULL DEFAULT '{"allow": [], "deny": []}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para employees
DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- =======================================================
-- SEGURIDAD A NIVEL DE FILA (RLS)
-- =======================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Política 1: Lectura
-- Todos los usuarios autenticados pueden ver la lista de empleados.
-- Esto es necesario para que en los pedidos se vea quién los preparó o en la caja quién la operó.
CREATE POLICY "Empleados visibles para usuarios autenticados" 
ON public.employees 
FOR SELECT 
TO authenticated 
USING (true);

-- Política 2: Inserción
-- Solo usuarios autenticados (Idealmente validado como owner/admin en el backend, 
-- pero para permitir crear el primer owner, lo dejaremos como authenticated + check en UI por ahora, 
-- o mejor: cualquier autenticado puede insertar si su rol en DB es owner/admin)
-- NOTA: Para no bloquear el desarrollo inicial, permitiremos la inserción a administradores.
CREATE POLICY "Solo administradores pueden insertar empleados"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.employees e 
        WHERE e.user_id = auth.uid() AND e.role IN ('super_admin', 'owner', 'admin')
    )
    -- Y agregamos esta excepción para el primer usuario (si la tabla está vacía)
    OR NOT EXISTS (SELECT 1 FROM public.employees)
);

-- Política 3: Actualización
CREATE POLICY "Solo administradores pueden actualizar empleados"
ON public.employees
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.employees e 
        WHERE e.user_id = auth.uid() AND e.role IN ('super_admin', 'owner', 'admin')
    )
);

-- Política 4: Eliminación (Soft delete recomendado usando 'active = false')
CREATE POLICY "Solo administradores pueden eliminar empleados"
ON public.employees
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.employees e 
        WHERE e.user_id = auth.uid() AND e.role IN ('super_admin', 'owner')
    )
);
