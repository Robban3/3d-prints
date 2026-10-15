import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CustomOrderPage } from '../src/pages/CustomOrderPage';
import { fetchQuote } from '../src/lib/api';

vi.mock('../src/lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/api')>(),
  fetchConfig: vi.fn().mockResolvedValue({ upload: { extensions: ['.stl'], maxBytes: 100000000 }, materials: [], qualities: [] }),
  fetchQuote: vi.fn().mockRejectedValue(new Error('Testpris saknas')),
}));

it('för över modellfil och rätt utskriftsinställningar till beställningen', async () => {
  render(<MemoryRouter initialEntries={[{ pathname: '/egen-print', state: {
    uploaded: { id: 'generated-model', fileName: 'formlabb-litofan-test.stl', size: 1234 },
    lithophane: { volumeCm3: 18.276, name: 'Litofan från foto', description: 'Vit PLA och fin lagerhöjd.' },
  } }]}><CustomOrderPage /></MemoryRouter>);
  expect(screen.getByDisplayValue('Litofan från foto')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Vit PLA och fin lagerhöjd.')).toBeInTheDocument();
  expect(screen.getByText('formlabb-litofan-test.stl')).toBeInTheDocument();
  await waitFor(() => expect(fetchQuote).toHaveBeenCalledWith(expect.objectContaining({ material: 'pla', quality: 'fin', infill: 100, volumeCm3: 18.3, quantity: 1 })));
});
