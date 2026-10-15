import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ProductCard } from '../src/components/ProductCard';
import { ProductManager } from '../src/components/admin/ProductManager';
import { ShopPage } from '../src/pages/ShopPage';
import { CartProvider, useCart } from '../src/lib/cart';
import { fetchProducts, fetchAdminProducts, updateProduct } from '../src/lib/api';
import type { Product } from '../src/types';
vi.mock('../src/lib/api', async original => ({ ...await original<typeof import('../src/lib/api')>(), fetchProducts: vi.fn(), fetchAdminProducts: vi.fn(), updateProduct: vi.fn(), fetchConfig: vi.fn().mockResolvedValue({ materials: [], categories: [] }) }));
const product: Product = { id: 'p', slug: 'test', name: 'Fyndprodukt', tagline: 'En produkt', description: 'En beskrivning av produkten.', category: 'inredning', price: 349, material: 'pla', finish: 'Matt', colors: ['Benvit'], dimensions: { width: 100, depth: 100, height: 100 }, weightGrams: 100, printTimeHours: 1, stock: 20, rating: 0, reviewCount: 0, featured: false, highlights: [], art: { shape: 'planter', tone: 'benvit' }, discountPercent: 20, saleReferencePrice: 299 };
function CartProof() { return <output data-testid="cart">{JSON.stringify(useCart().items)}</output>; }
it('visar rabatten och tidigare lägsta pris och sparar rätt pris i varukorgen', async () => {
  render(<MemoryRouter><CartProvider><ProductCard product={product} /><CartProof /></CartProvider></MemoryRouter>);
  expect(screen.getByText('239 kr')).toBeInTheDocument(); expect(screen.getByText('299 kr').tagName).toBe('DEL');
  expect(screen.getByText('Tidigare lägsta pris (30 dagar)')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Lägg Fyndprodukt i varukorgen' }));
  expect(JSON.parse(screen.getByTestId('cart').textContent!)[0].unitPrice).toBe(239);
});
it('visar enbart aktiva fynd och har ett tydligt tomläge', async () => {
  vi.mocked(fetchProducts).mockResolvedValue({ products: [product, { ...product, id: 'normal', name: 'Vanlig produkt', discountPercent: 0 }], total: 2 });
  render(<MemoryRouter><CartProvider><ShopPage bargains /></CartProvider></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Fyndprodukt' })).toBeInTheDocument();
  expect(screen.queryByText('Vanlig produkt')).not.toBeInTheDocument();
});
it('låter admin välja Fyndhörnan och spara rabatt och verifierat referenspris från produktfliken', async () => {
  vi.mocked(fetchAdminProducts).mockResolvedValue({ products: [{ ...product, discountPercent: 0, saleReferencePrice: undefined }], total: 1 });
  vi.mocked(updateProduct).mockResolvedValue({ product });
  const user = userEvent.setup();
  render(<MemoryRouter><CartProvider><ProductManager token="test" categories={[{ id: 'inredning', name: 'Inredning', description: '' }]} materials={[{ id: 'pla', name: 'PLA', description: '', traits: [], priceFactor: 1 }]} onChanged={() => {}} /></CartProvider></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Redigera' }));
  await user.click(screen.getByRole('checkbox', { name: 'Visa produkten i Fyndhörnan' }));
  expect(screen.getByLabelText('Rabatt (%)')).toHaveValue(20);
  await user.type(screen.getByLabelText('Tidigare lägsta pris (kr)'), '299');
  await user.click(screen.getByRole('button', { name: /Spara/ }));
  await waitFor(() => expect(updateProduct).toHaveBeenCalledWith('test', 'p', expect.objectContaining({ discountPercent: 20, saleReferencePrice: 299 })));
});
