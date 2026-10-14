import { expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderManager } from '../src/components/admin/OrderManager';
import { fetchAdminOrders, fetchOperations, fetchPrintFiles, saveProduction } from '../src/lib/api';
import type { CustomOrder } from '../src/types';

vi.mock('../src/lib/api', async original => ({ ...await original<typeof import('../src/lib/api')>(), fetchAdminOrders: vi.fn(), fetchOperations: vi.fn(), fetchPrintFiles: vi.fn(), saveProduction: vi.fn() }));
const order: CustomOrder = { id: 'C-TEST', type: 'custom', createdAt: '2026-10-14T08:00:00Z', status: 'mottagen', customer: { name: 'Testkund', email: 'test@example.invalid', address: 'Testgatan', postalCode: '12345', city: 'Teststad' }, request: { material: 'pla', quality: 'standard', volumeCm3: 120, infill: 20, quantity: 1, rush: false, postProcessing: false }, projectName: 'Kamerafäste', description: 'Modell för en kamera', quote: { estimatedPrintHours: 3.6 } as CustomOrder['quote'], total: 275, history: [] };

it('filters the workshop and saves a production card with its revision', async () => {
  vi.mocked(fetchAdminOrders).mockResolvedValue({ orders: [{ ...order, next: ['i_produktion', 'avbruten'] }, { ...order, id: 'C-CLOSED', status: 'levererad', next: [] }], total: 2 });
  vi.mocked(fetchPrintFiles).mockResolvedValue({ files: [] });
  vi.mocked(fetchOperations).mockResolvedValue({ emailConfigured: false, paymentConfigured: false, paymentEnvironment: 'test', storage: 'r2' });
  vi.mocked(saveProduction).mockImplementation(async (_token, _id, plan) => ({ order: { ...order, production: { ...plan, revision: 1 } }, next: ['i_produktion', 'avbruten'] }));
  const user = userEvent.setup();
  render(<OrderManager token="session" overview onUnauthorized={vi.fn()} />);
  await screen.findByText('C-TEST');
  expect(screen.queryByText('C-CLOSED')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Väntar betalning 1/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Testa e-post till support@formlabb.se' })).toBeDisabled();
  const card = within(screen.getByTestId('production-C-TEST'));
  await user.click(card.getByText('Produktionskort · filer och planering'));
  await user.type(card.getByLabelText('Maskin'), 'Bambu 1');
  await user.type(card.getByLabelText(/Interna anteckningar/), 'Kontrollera passformen');
  await user.click(card.getByRole('button', { name: 'Spara produktionskort' }));
  await waitFor(() => expect(saveProduction).toHaveBeenCalledWith('session', 'C-TEST', expect.objectContaining({ machine: 'Bambu 1', notes: 'Kontrollera passformen', estimatedHours: 3.6 }), 0));
  await screen.findByText('Produktionskortet är sparat.');
  await user.type(screen.getByRole('searchbox'), 'saknas');
  expect(screen.queryByText('C-TEST')).not.toBeInTheDocument();
});
