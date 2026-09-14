let lockCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';

export function lockScroll(): void {
  if (typeof document === 'undefined') return;

  lockCount++;
  if (lockCount === 1) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;

    // Calcular ancho de barra de scroll para evitar saltos de layout en escritorio
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
  }
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
  }
}
