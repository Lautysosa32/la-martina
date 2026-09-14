import { useEffect } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

/**
 * Hook que bloquea el scroll del body cuando condition es true.
 * Al desmontar o cuando condition cambia a false, desbloquea el scroll.
 */
export function useScrollLock(condition: boolean): void {
  useEffect(() => {
    if (!condition) return;

    lockScroll();

    return () => {
      unlockScroll();
    };
  }, [condition]);
}
