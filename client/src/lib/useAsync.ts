import { useEffect, useState } from 'react';
import { ApiError } from './api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Kör en asynkron laddning och håller reda på laddnings- och feltillstånd.
 * Svar från en förfrågan som hunnit bli inaktuell kastas bort.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loader()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof ApiError ? error.message : 'Kunde inte hämta data';
        setState({ data: null, loading: false, error: message });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
