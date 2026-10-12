import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { PrintFileLibrary } from '../src/components/admin/PrintFileLibrary';
import { downloadPrintFile, fetchPrintFiles, uploadPrintFile } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({ fetchPrintFiles: vi.fn(), downloadPrintFile: vi.fn(), uploadPrintFile: vi.fn() }));

it('finds customer files by order number and downloads the chosen file using admin authentication', async () => {
  const own = { id: 'own', fileName: 'egen.stl', source: 'own' as const, size: 100, createdAt: '2026-10-12T10:00:00Z', orderId: null };
  const customer = { ...own, id: 'customer', fileName: 'kund.3mf', source: 'customer' as const, orderId: 'C2026-ABCD', projectName: 'Kundprojekt' };
  vi.mocked(fetchPrintFiles).mockResolvedValue({ files: [own, customer] });
  vi.mocked(downloadPrintFile).mockResolvedValue(undefined);
  const user = userEvent.setup(); render(<PrintFileLibrary token="session" />);
  await screen.findByText('kund.3mf');
  await user.type(screen.getByLabelText('Sök fil, projekt eller ordernummer'), 'ABCD');
  expect(screen.queryByText('egen.stl')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Hämta fil' }));
  await waitFor(() => expect(downloadPrintFile).toHaveBeenCalledWith('session', customer));
  await user.clear(screen.getByLabelText('Sök fil, projekt eller ordernummer'));
  await user.selectOptions(screen.getByLabelText('Visa'), 'own');
  expect(screen.queryByText('kund.3mf')).not.toBeInTheDocument();
  expect(screen.getByText('egen.stl')).toBeInTheDocument();
  expect(uploadPrintFile).not.toHaveBeenCalled();
});
