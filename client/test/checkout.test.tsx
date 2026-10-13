import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CartProvider, useCart } from '../src/lib/cart';
import { CheckoutPage } from '../src/pages/CheckoutPage';
import { createPaymentSession, placeOrder } from '../src/lib/api';

vi.mock('../src/lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/api')>(),
  fetchConfig: vi.fn().mockResolvedValue({ shipping: { fee: 59, freeThreshold: 699 } }),
  createPaymentSession: vi.fn(), placeOrder: vi.fn(),
}));

function ChangeCart() {
  const cart = useCart();
  return <button onClick={() => cart.setQuantity(cart.items[0]!.key, 2)}>Ändra antal</button>;
}

describe('kassans aktuella pris och betalsession', () => {
  it('visar serverpriset och spärrar beställning medan en ändrad varukorg laddar', async () => {
    localStorage.setItem('formlabb.cart.v1', JSON.stringify([{ key: 'p|Vit|-', productId: 'p', slug: 'produkt', name: 'Produkt', color: 'Vit', quantity: 1, unitPrice: 1, art: { shape: 'planter', tone: 'benvit' } }]));
    let complete!: (value: Awaited<ReturnType<typeof createPaymentSession>>) => void;
    vi.mocked(createPaymentSession).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    vi.mocked(placeOrder).mockResolvedValue({ order: { id: 'TEST' } as any, accessToken: 'token' });
    render(<MemoryRouter><CartProvider><CheckoutPage /><ChangeCart /></CartProvider></MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Slutför beställning' });
    expect(button).toBeDisabled();
    const session = { clientToken: 'mock', paymentMethodCategories: [], test: true };
    await act(async () => complete({ session, amount: 45800, summary: { lines: [{ productId: 'p', name: 'Produkt', color: 'Vit', quantity: 1, unitPrice: 399 }], subtotal: 399, shipping: 59, total: 458 } }));
    expect(screen.getByText('458 kr')).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ändra antal' }));
    expect(button).toBeDisabled();
    fireEvent.click(button); expect(placeOrder).not.toHaveBeenCalled();
    await act(async () => complete({ session, amount: 79800, summary: { lines: [{ productId: 'p', name: 'Produkt', color: 'Vit', quantity: 2, unitPrice: 399 }], subtotal: 798, shipping: 0, total: 798 } }));
    fireEvent.click(button);
    await waitFor(() => expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ expectedTotal: 798, lines: [expect.objectContaining({ quantity: 2 })] })));
  });
});
