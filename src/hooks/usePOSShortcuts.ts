import { useEffect, useRef } from 'react';

export interface UsePOSShortcutsOptions {
  /** Input principal de búsqueda / escáner de productos (F1) */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Input de búsqueda de cliente por DNI (F3) */
  customerDniInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Input de cantidad del producto o búsqueda (F8 o *) */
  quantityInputRef?: React.RefObject<HTMLInputElement | null>;

  /** Callback para F2: Cobrar / Abrir modal de cobro */
  onCheckout?: () => void;
  /** Callback para F4: Limpiar carrito / Nueva venta limpia */
  onClearCart?: () => void;
  /** Callback para F5: Crear nueva hoja (venta en espera) */
  onNewTab?: () => void;
  /** Callback para F6: Alternar entre hojas/pestañas activas */
  onToggleTab?: () => void;
  /** Callback para F9: Abrir modal de aplicar descuento */
  onOpenDiscount?: () => void;
  /** Callback para ESC: Cerrar modales activos o quitar foco */
  onCloseModalsOrBlur?: () => void;
  /** Callback para Ctrl+P: Reimprimir último ticket emitido */
  onReprintLastTicket?: () => void;

  /** Permite activar/desactivar globalmente los atajos (por defecto true) */
  enabled?: boolean;
}

/**
 * Hook para gestionar atajos de teclado globales en el Punto de Venta (POS).
 * Intercepta teclas de función y combinaciones clave con e.preventDefault()
 * para neutralizar las acciones nativas del navegador (F1 ayuda, F3 buscar, F5 recargar, F6 barra de URLs, Ctrl+P imprimir).
 */
export function usePOSShortcuts({
  searchInputRef,
  customerDniInputRef,
  quantityInputRef,
  onCheckout,
  onClearCart,
  onNewTab,
  onToggleTab,
  onOpenDiscount,
  onCloseModalsOrBlur,
  onReprintLastTicket,
  enabled = true,
}: UsePOSShortcutsOptions) {
  // Mantener referencias actualizadas de los callbacks para evitar recrear el listener en cada render
  const callbacksRef = useRef({
    onCheckout,
    onClearCart,
    onNewTab,
    onToggleTab,
    onOpenDiscount,
    onCloseModalsOrBlur,
    onReprintLastTicket,
  });

  useEffect(() => {
    callbacksRef.current = {
      onCheckout,
      onClearCart,
      onNewTab,
      onToggleTab,
      onOpenDiscount,
      onCloseModalsOrBlur,
      onReprintLastTicket,
    };
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ─────────────────────────────────────────────────────────────
      // 1. HARDWARE / TICKETS
      // ─────────────────────────────────────────────────────────────
      // Ctrl + P / Cmd + P: Reimprimir último ticket
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onReprintLastTicket?.();
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // 2. MANEJO DE FOCO (INPUTS)
      // ─────────────────────────────────────────────────────────────
      // F1: Foco en input principal de productos (evita Ayuda del navegador)
      if (e.key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        if (searchInputRef?.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        return;
      }

      // F2: Cobrar (abrir modal de pago)
      if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onCheckout?.();
        return;
      }

      // F3: Foco en input de DNI de cliente (evita Buscar en la página de Chrome/Brave)
      if (e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        if (customerDniInputRef?.current) {
          customerDniInputRef.current.focus();
          customerDniInputRef.current.select();
        }
        return;
      }

      // F4: Limpiar carrito actual
      if (e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onClearCart?.();
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // 3. OPERACIÓN DE CAJA
      // ─────────────────────────────────────────────────────────────
      // F5: Nueva hoja / poner venta en espera (CRÍTICO: evita recarga de página del navegador)
      if (e.key === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onNewTab?.();
        return;
      }

      // F6: Alternar entre hojas/pestañas activas (evita foco en barra de direcciones del navegador)
      if (e.key === 'F6') {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onToggleTab?.();
        return;
      }

      // F8 o Asterisco (*): Foco en input de Cantidad
      if (e.key === 'F8' || e.key === '*') {
        // Si es asterisco y ya estamos en un input escribiendo texto que no sea comando, podemos evaluarlo
        // pero en POS el asterisco se usa típicamente para saltar a cantidad (ej: 3 * producto)
        e.preventDefault();
        e.stopPropagation();
        if (quantityInputRef?.current) {
          quantityInputRef.current.focus();
          quantityInputRef.current.select();
        }
        return;
      }

      // F9: Aplicar Descuento (abrir modal)
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onOpenDiscount?.();
        return;
      }

      // ESC: Cerrar modales activos o quitar foco de inputs
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();

        // Quitar foco si hay un input activo
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        callbacksRef.current.onCloseModalsOrBlur?.();
        return;
      }
    };

    // Registrar listener en capture phase para interceptar antes de que otros elementos detengan la propagación
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, searchInputRef, customerDniInputRef, quantityInputRef]);
}
