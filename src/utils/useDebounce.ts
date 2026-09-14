import { useState, useEffect } from 'react';

/**
 * Hook para aplicar debounce a un valor (ej. input de búsqueda).
 * Retrasa la emisión del valor actualizado hasta que transcurre el tiempo especificado.
 *
 * @param value Valor a retrasar (ej. texto que escribe el usuario)
 * @param delay Tiempo de espera en milisegundos (por defecto 350ms)
 * @returns Valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
