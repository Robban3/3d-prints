import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { PrintFileLibrary } from '../src/components/admin/PrintFileLibrary';
import { downloadPrintFile, fetchPrintFiles, uploadPrintFile, movePrintFile, saveFileFolder } from '../src/lib/api';

vi.mock('../src/lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/api')>(), fetchPrintFiles: vi.fn(), downloadPrintFile: vi.fn(), uploadPrintFile: vi.fn(), movePrintFile: vi.fn(), saveFileFolder: vi.fn() }));

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

it('moves an existing file by drag and drop and uploads several files into the selected folder', async () => {
  const file = { id: 'own', fileName: 'underdel.stl', source: 'own' as const, size: 100, createdAt: '2026-10-14T10:00:00Z', orderId: null, folderId: null as string | null };
  const folder = { id: 'folder-1', name: 'Julgranskula' };
  vi.mocked(fetchPrintFiles).mockResolvedValue({ files: [file], folders: [folder] });
  vi.mocked(movePrintFile).mockImplementation(async () => {
    vi.mocked(fetchPrintFiles).mockResolvedValue({ files: [{ ...file, folderId: folder.id }], folders: [folder] });
    return { ok: true };
  });
  vi.mocked(uploadPrintFile).mockResolvedValue(undefined);
  render(<PrintFileLibrary token="session" />);
  const target = (await screen.findByRole('button', { name: /^Julgranskula/ })).closest('.file-folder')!;
  fireEvent.drop(target, { dataTransfer: { files: [], getData: () => 'own' } });
  await waitFor(() => expect(movePrintFile).toHaveBeenCalledWith('session', 'own', folder.id));
  const user = userEvent.setup();
  await screen.findByText('Filen är flyttad.');
  await user.click(screen.getByRole('button', { name: /^Julgranskula/ }));
  const a = new File(['solid a'], 'overdel.stl', { type: 'application/octet-stream' });
  const b = new File(['solid b'], 'lucka.stl', { type: 'application/octet-stream' });
  fireEvent.drop(screen.getByText('Dra och släpp en eller flera printfiler här').closest('.file-upload-zone')!, { dataTransfer: { files: [a, b], getData: () => '' } });
  await waitFor(() => expect(uploadPrintFile).toHaveBeenCalledWith('session', b, folder.id));
  expect(uploadPrintFile).toHaveBeenCalledWith('session', a, folder.id);
});

it('creates a named folder and opens it', async () => {
  vi.mocked(fetchPrintFiles).mockResolvedValueOnce({ files: [], folders: [] }).mockResolvedValue({ files: [], folders: [{ id: 'new', name: 'Ny modell' }] });
  vi.mocked(saveFileFolder).mockResolvedValue({ folder: { id: 'new', name: 'Ny modell' } });
  const user = userEvent.setup(); render(<PrintFileLibrary token="session" />);
  await screen.findByRole('button', { name: /^Alla filer/ });
  await user.type(screen.getByLabelText('Mappnamn'), 'Ny modell');
  await user.click(screen.getByRole('button', { name: 'Skapa mapp' }));
  await waitFor(() => expect(saveFileFolder).toHaveBeenCalledWith('session', 'Ny modell', undefined));
  expect(await screen.findByRole('button', { name: /^Ny modell/ })).toHaveAttribute('aria-current', 'page');
});
