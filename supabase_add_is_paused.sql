-- ==============================================================================
-- Migración: Soporte para Pausar Productos (is_paused)
-- ==============================================================================
-- Ejecutar este script en Supabase SQL Editor.
-- Agrega la columna is_paused a la tabla products y crea un índice B-Tree
-- para optimizar los filtros de stock crítico y catálogo.

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- Si había registros existentes con valor nulo, los normalizamos a false
UPDATE public.products 
SET is_paused = false 
WHERE is_paused IS NULL;

-- Índice para consultas rápidas sobre productos activos vs pausados
CREATE INDEX IF NOT EXISTS idx_products_is_paused 
ON public.products(is_paused);
