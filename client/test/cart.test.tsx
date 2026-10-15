import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from '../src/lib/cart';
import type { CartItem } from '../src/lib/cart';

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

const base: Omit<CartItem, 'key'> = {
  productId: 'p-001',
  slug: 'terra-vaxtkruka',
  name: 'Terra växtkruka',
  unitPrice: 349,
  quantity: 1,
  color: 'Grafit',
  size: 'mellan',
  sizeName: 'Mellan',
  art: { shape: 'planter', tone: 'benvit' },
};

function setup() {
  return renderHook(() => useCart(), { wrapper });
}

describe('varukorgen', () => {
  it('ignorerar trasiga sparade rader utan att krascha eller visa NaN', () => {
    localStorage.setItem('formlabb.cart.v1', JSON.stringify([null, {}, { ...base, key: 'ok', quantity: -1 }, { ...base, key: 'ok' }]));
    const { result } = setup();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.subtotal).toBe(349);
  });
  it('uppdaterar gammalt pris när en variant läggs till igen', () => {
    const { result } = setup();
    act(() => result.current.add(base));
    act(() => result.current.add({ ...base, unitPrice: 399 }));
    expect(result.current.subtotal).toBe(798);
  });
  it('börjar tom', () => {
    const { result } = setup();
    expect(result.current.items).toHaveLength(0);
    expect(result.current.itemCount).toBe(0);
    expect(result.current.subtotal).toBe(0);
  });

  it('lägger till en rad och räknar summan', () => {
    const { result } = setup();
    act(() => result.current.add({ ...base, quantity: 2 }));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotal).toBe(698);
  });

  it('slår ihop samma produkt i samma färg och storlek', () => {
    const { result } = setup();
    act(() => result.current.add({ ...base, quantity: 1 }));
    act(() => result.current.add({ ...base, quantity: 2 }));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.quantity).toBe(3);
  });

  it('håller isär olika färger och storlekar', () => {
    const { result } = setup();
    act(() => result.current.add(base));
    act(() => result.current.add({ ...base, color: 'Salvia' }));
    act(() => result.current.add({ ...base, size: 'stor', sizeName: 'Stor' }));
    expect(result.current.items).toHaveLength(3);
  });

  it('uppdaterar bilden när samma variant läggs till igen', () => {
    const { result } = setup();
    act(() => result.current.add(base));
    const image = { id: 'updated', url: '/updated.webp', fileName: 'updated.webp' };
    act(() => result.current.add({ ...base, image }));
    expect(result.current.items[0]?.image).toEqual(image);
    expect(result.current.items[0]?.quantity).toBe(2);
  });

  it('taket är 99 exemplar per rad', () => {
    const { result } = setup();
    act(() => result.current.add({ ...base, quantity: 60 }));
    act(() => result.current.add({ ...base, quantity: 60 }));
    expect(result.current.items[0]?.quantity).toBe(99);
    act(() => result.current.setQuantity(result.current.items[0]!.key, 500));
    expect(result.current.items[0]?.quantity).toBe(99);
  });

  it('tar bort raden när antalet går till noll', () => {
    const { result } = setup();
    act(() => result.current.add(base));
    act(() => result.current.setQuantity(result.current.items[0]!.key, 0));
    expect(result.current.items).toHaveLength(0);
  });

  it('tömmer hela varukorgen', () => {
    const { result } = setup();
    act(() => result.current.add(base));
    act(() => result.current.add({ ...base, color: 'Salvia' }));
    act(() => result.current.clear());
    expect(result.current.items).toHaveLength(0);
  });

  it('räknar summan över flera rader med olika pris', () => {
    const { result } = setup();
    act(() => result.current.add({ ...base, quantity: 2 }));
    act(() => result.current.add({ ...base, color: 'Salvia', unitPrice: 599, quantity: 1 }));
    expect(result.current.subtotal).toBe(349 * 2 + 599);
    expect(result.current.itemCount).toBe(3);
  });
});

describe('varukorgen och webbläsarlagringen', () => {
  it('behåller personliga textrader efter omladdning', () => {
    const personalization = 'Å'.repeat(24) + ' / ' + 'Ö'.repeat(24);
    const first = setup();
    act(() => first.result.current.add({ ...base, slug: 'var-forsta-jul', personalization }));
    first.unmount();
    const second = setup();
    expect(second.result.current.items[0]?.personalization).toBe(personalization);
  });
  it('överlever en omladdning', () => {
    const first = setup();
    act(() => first.result.current.add({ ...base, quantity: 2 }));
    first.unmount();

    const second = setup();
    expect(second.result.current.items).toHaveLength(1);
    expect(second.result.current.itemCount).toBe(2);
  });

  it('startar tom när lagringen innehåller skräp', () => {
    window.localStorage.setItem('formlabb.cart.v1', 'inte-json');
    const { result } = setup();
    expect(result.current.items).toHaveLength(0);
  });

  it('startar tom när lagringen innehåller fel form', () => {
    window.localStorage.setItem('formlabb.cart.v1', '{"inte":"en lista"}');
    const { result } = setup();
    expect(result.current.items).toHaveLength(0);
  });
});
