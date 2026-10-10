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
  /**
   * Rabattkoden kunden skrivit in. Bara koden sparas – vad den är värd beror på
   * varukorgens innehåll och räknas alltid ut av servern.
   */
  discountCode: string;
  shippingOptionId: string;
  add: (item: Omit<CartItem, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  setDiscountCode: (code: string) => void;
  setShippingOptionId: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'formlabb.cart.v1';
/** Rabattkod och fraktval ligger för sig, så den gamla varukorgsnyckeln består. */
const CHOICES_KEY = 'formlabb.cart.choices.v1';
const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

interface Choices {
  discountCode: string;
  shippingOptionId: string;
}

const noChoices: Choices = { discountCode: '', shippingOptionId: '' };

function readChoices(): Choices {
  try {
    const raw = window.localStorage.getItem(CHOICES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return noChoices;
    const record = parsed as Partial<Choices>;
    return {
      discountCode: typeof record.discountCode === 'string' ? record.discountCode : '',
      shippingOptionId: typeof record.shippingOptionId === 'string' ? record.shippingOptionId : '',
    };
  } catch {
    return noChoices;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStorage);
  const [choices, setChoices] = useState<Choices>(readChoices);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Privat läge eller full lagring – varukorgen lever då bara i minnet.
    }
  }, [items]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
    } catch {
      // Samma sak här: valen lever i minnet om lagringen inte går att skriva.
    }
  }, [choices]);

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

  const setDiscountCode = useCallback((discountCode: string) => {
    setChoices((current) => ({ ...current, discountCode }));
  }, []);

  const setShippingOptionId = useCallback((shippingOptionId: string) => {
    setChoices((current) => ({ ...current, shippingOptionId }));
  }, []);

  // En lagd order ska inte lämna kvar sin rabattkod till nästa köp.
  const clear = useCallback(() => {
    setItems([]);
    setChoices(noChoices);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return {
      items,
      itemCount,
      subtotal,
      discountCode: choices.discountCode,
      shippingOptionId: choices.shippingOptionId,
      add,
      setQuantity,
      remove,
      setDiscountCode,
      setShippingOptionId,
      clear,
    };
  }, [items, choices, add, setQuantity, remove, setDiscountCode, setShippingOptionId, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart måste användas inuti CartProvider');
  return context;
}
