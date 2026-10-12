import { useEffect, useState } from 'react';

/**
 * Följer systemets inställning för minskad rörelse. Används för att inte
 * autospela video för någon som bett om att slippa rörliga bilder.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Äldre implementationer saknar addEventListener på en MediaQueryList.
    if (typeof query.addEventListener !== 'function') return;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
