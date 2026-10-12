import { useEffect, useState } from 'react';
import { ApiError, checkDiscount } from './api';
import { orderLines } from './totals';
import type { CartItem } from './cart';
import type { AppliedDiscount } from '../types';

export interface DiscountState {
  discount: AppliedDiscount | null;
  error: string;
  checking: boolean;
}

/**
 * Håller rabatten i takt med varukorgen. Ändras innehållet är den tidigare
 * uträknade rabatten inte längre sann – en kod med lägsta ordervärde kan ha
 * slutat gälla – så koden prövas om mot servern.
 */
export function useDiscount(code: string, items: CartItem[]): DiscountState {
  const [state, setState] = useState<DiscountState>({
    discount: null,
    error: '',
    checking: false,
  });

  // Nyckeln fångar allt som kan ändra vad koden är värd.
  const key = `${code}|${items.map((item) => `${item.key}x${item.quantity}`).join(',')}`;

  useEffect(() => {
    if (!code || items.length === 0) {
      setState({ discount: null, error: '', checking: false });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, checking: true }));

    checkDiscount(code, orderLines(items))
      .then((result) => {
        if (active) setState({ discount: result.discount, error: '', checking: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          discount: null,
          error: error instanceof ApiError ? error.message : 'Koden kunde inte prövas.',
          checking: false,
        });
      });

    return () => {
      active = false;
    };
    // Raderna jämförs genom nyckeln ovan, inte genom objektidentitet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
