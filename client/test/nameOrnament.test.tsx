import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProductPage } from '../src/pages/ProductPage';
import { CartProvider, useCart } from '../src/lib/cart';
import { fetchProduct } from '../src/lib/api';
import { normalizeOrnamentName, ornamentNameError, ornamentGreetingError } from '../src/lib/ornamentName';
import { ProductCard } from '../src/components/ProductCard';
import type { Product } from '../src/types';

vi.mock('../src/lib/api', () => ({ fetchProduct: vi.fn() }));
const product: Product = { id: 'ornament', slug: 'namnornament', name: 'Personligt namnornament', tagline: 'Med ditt namn', description: 'Personligt ornament.', category: 'jul', price: 149, material: 'pla', finish: 'Matt', colors: ['Benvit'], highlights: [], stock: 25, rating: 0, reviewCount: 0, featured: false, dimensions: { width: 100, depth: 5, height: 115 }, weightGrams: 20, printTimeHours: 1, art: { shape: 'gearFidget', tone: 'benvit' } };
function CartProof() { return <output data-testid="cart-items">{JSON.stringify(useCart().items)}</output>; }

it('visar namnet direkt, kräver ett namn och håller isär personliga exemplar i varukorgen', async () => {
  vi.mocked(fetchProduct).mockResolvedValue({ product, related: [] });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/produkter/namnornament']}><CartProvider><Routes><Route path="/produkter/:slug" element={<ProductPage />} /></Routes><CartProof /></CartProvider></MemoryRouter>);
  const input = await screen.findByLabelText('Namn på ornamentet');
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Skriv namnet');
  expect(JSON.parse(screen.getByTestId('cart-items').textContent!)).toHaveLength(0);
  await user.type(input, 'Åsa');
  expect(screen.getByRole('img', { name: /Förhandsvisning.*Åsa/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  await user.clear(input); await user.type(input, 'Hugo');
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  const items = JSON.parse(screen.getByTestId('cart-items').textContent!);
  expect(items.map((item: { personalization: string }) => item.personalization)).toEqual(['Åsa', 'Hugo']);
  expect(items.map((item: { quantity: number }) => item.quantity)).toEqual([1, 2]);
});

it('stöder svenska namn och avvisar markup, styrtecken och för lång text', () => {
  for (const name of ['Åsa', 'Éloïse', 'Anna-Lisa', "O'Connor", 'Mary Jane', 'A\u030Asa']) expect(ornamentNameError(name)).toBeNull();
  expect(normalizeOrnamentName('  A\u030Asa   Marie ')).toBe('Åsa Marie');
  for (const name of ['', ' '.repeat(8), '<script>', 'Emma\u0000', 'A'.repeat(25), '123', '🎄']) expect(ornamentNameError(name)).not.toBeNull();
});

it('förhandsvisar två egna rader på Vår första jul och sparar båda i varukorgen', async () => {
  vi.mocked(fetchProduct).mockResolvedValue({ product: { ...product, slug: 'var-forsta-jul', name: 'Vår första jul' }, related: [] });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/produkter/var-forsta-jul']}><CartProvider><Routes><Route path="/produkter/:slug" element={<ProductPage />} /></Routes><CartProof /></CartProvider></MemoryRouter>);
  const upper = await screen.findByLabelText('Text på övre raden');
  const lower = screen.getByLabelText('Text på nedre raden');
  expect(upper).toHaveValue('Vår första'); expect(lower).toHaveValue('jul');
  await user.clear(upper); await user.type(upper, 'Emma & Hugo');
  await user.clear(lower); await user.type(lower, 'Jul 2026');
  expect(screen.getByRole('img', { name: /Förhandsvisning.*Emma & Hugo Jul 2026/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  expect(JSON.parse(screen.getByTestId('cart-items').textContent!)[0].personalization).toBe('Emma & Hugo / Jul 2026');
});

it('leder till personliga val från produktkortet och validerar hälsningens båda rader', () => {
  render(<MemoryRouter><CartProvider><ProductCard product={product} /></CartProvider></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Välj personlig text till Personligt namnornament' })).toHaveAttribute('href', '/produkter/namnornament');
  expect(ornamentGreetingError('Emma & Hugo / Jul 2026')).toBeNull();
  expect(ornamentGreetingError('Å'.repeat(24) + ' / ' + 'Ö'.repeat(24))).toBeNull();
  for (const text of ['bara en rad', ' / jul', 'God jul / ', '<script> / jul', 'x'.repeat(25) + ' / jul']) expect(ornamentGreetingError(text)).not.toBeNull();
});
