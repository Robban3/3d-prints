import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Product } from '../types';

export interface CartItem {
  key: string;
  productId: string;
  slug: string;
  name: string;
  unitPrice: number;
  quantity: number;
  color: string;
  size?: string;
  sizeName?: string;
  art: Product['art'];
  image?: Product['image'];
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  add: (item: Omit<CartItem, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'formlabb.cart.v1';
const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is CartItem =>
      item && typeof item === 'object' &&
      ['key', 'productId', 'slug', 'name', 'color'].every(field => typeof item[field] === 'string' && item[field].length > 0) &&
      Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99 &&
      Number.isFinite(item.unitPrice) && item.unitPrice >= 0 &&
      item.art && typeof item.art.shape === 'string' && typeof item.art.tone === 'string' &&
      (item.size === undefined || typeof item.size === 'string')
    ) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStorage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Privat läge eller full lagring – varukorgen lever då bara i minnet.
    }
  }, [items]);

  const add = useCallback((item: Omit<CartItem, 'key'>) => {
    // Samma produkt i samma färg och storlek slås ihop till en rad.
    const key = [item.productId, item.color, item.size ?? '-'].join('|');
    setItems((current) => {
      const existing = current.find((entry) => entry.key === key);
      if (existing) {
        return current.map((entry) =>
          entry.key === key
            ? {
                ...entry,
                image: item.image,
                unitPrice: item.unitPrice,
                name: item.name,
                quantity: Math.min(99, entry.quantity + item.quantity),
              }
            : entry,
        );
      }
      return [...current, { ...item, key }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((entry) => entry.key !== key)
        : current.map((entry) =>
            entry.key === key ? { ...entry, quantity: Math.min(99, quantity) } : entry,
          ),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return { items, itemCount, subtotal, add, setQuantity, remove, clear };
  }, [items, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart måste användas inuti CartProvider');
  return context;
}
