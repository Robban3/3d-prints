import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProductPage } from '../src/pages/ProductPage';
import { CartProvider, useCart } from '../src/lib/cart';
import { fetchProduct } from '../src/lib/api';
import type { Product } from '../src/types';

vi.mock('../src/lib/api', () => ({ fetchProduct: vi.fn() }));
const image = (id: string) => ({ id, url: `/${id}.webp`, fileName: `${id}-visualisering.webp` });
const product: Product = { id: 'dragon', slug: 'flexi-drake', name: 'Flexi drake', tagline: 'Drake', description: 'En drake.', category: 'prylar', price: 249, material: 'pla', finish: 'Silk', printTimeHours: 2, dimensions: { width: 100, depth: 100, height: 100 }, weightGrams: 100, colors: ['Silk koppar', 'Silk lila'], sizes: [{ id: 'mini', name: 'Mini', priceDelta: 0 }, { id: 'stor', name: 'Stor', priceDelta: 100 }], highlights: [], stock: 20, rating: 0, reviewCount: 0, featured: false, art: { shape: 'dragon', tone: 'benvit' }, image: image('copper'), variantImages: [{ color: 'Silk lila', size: 'mini', image: image('purple-mini') }, { color: 'Silk lila', size: 'stor', image: image('purple-large') }] };
function CartProof() { return <output data-testid="cart-proof">{JSON.stringify(useCart().items)}</output>; }
it('byter bild vid färg- och storleksval och sparar vald bild i varukorgen', async () => {
  window.localStorage.clear();
  vi.mocked(fetchProduct).mockResolvedValue({ product: { ...product, dimensionsEstimated: true, specificationsPending: true, weightGrams: 0, printTimeHours: 0, sizes: product.sizes?.map(size => ({ ...size, dimensions: size.id === 'mini' ? { width: 47, depth: 160, height: 60 } : { width: 110, depth: 380, height: 140 } })) }, related: [] });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/produkter/flexi-drake']}><CartProvider><Routes><Route path="/produkter/:slug" element={<ProductPage />} /></Routes><CartProof /></CartProvider></MemoryRouter>);
  const photo = await screen.findByRole('img', { name: 'Flexi drake' });
  expect(photo).toHaveAttribute('src', '/copper.webp');
  expect(screen.getByText('Ca 47 × 160 × 60 mm')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Silk lila' }));
  expect(photo).toHaveAttribute('src', '/purple-mini.webp');
  await user.click(screen.getByRole('button', { name: /Stor/ }));
  expect(photo).toHaveAttribute('src', '/purple-large.webp');
  expect(screen.getByText('Ca 110 × 380 × 140 mm')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  await waitFor(() => expect(screen.getByTestId('cart-proof')).toHaveTextContent('purple-large'));
  expect(screen.getByTestId('cart-proof')).toHaveTextContent('Silk lila');
});

it('väljer ornament med och utan årtal och sparar utförandet i varukorgen', async () => {
  window.localStorage.clear();
  const ornament = { ...product, name: 'Julkula med namn', colors: ['Benvit'], optionLabel: 'Årtal', sizes: [{ id: 'utan-artal', name: 'Utan årtal', priceDelta: 0 }, { id: 'med-artal', name: 'Med årtal (2026)', priceDelta: 0 }], variantImages: [{ color: 'Benvit', size: 'utan-artal', image: image('without-year') }, { color: 'Benvit', size: 'med-artal', image: image('with-year') }] };
  vi.mocked(fetchProduct).mockResolvedValue({ product: ornament, related: [] });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/produkter/julkula-med-namn']}><CartProvider><Routes><Route path="/produkter/:slug" element={<ProductPage />} /></Routes><CartProof /></CartProvider></MemoryRouter>);
  const photo = await screen.findByRole('img', { name: 'Julkula med namn' });
  await waitFor(() => expect(photo).toHaveAttribute('src', '/without-year.webp'));
  expect(screen.getByText('Årtal')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Med årtal/ }));
  expect(photo).toHaveAttribute('src', '/with-year.webp');
  await user.click(screen.getByRole('button', { name: 'Lägg i varukorg' }));
  await waitFor(() => expect(screen.getByTestId('cart-proof')).toHaveTextContent('Med årtal (2026)'));
});
