import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppearanceProvider } from '../src/lib/appearance';
import { ThemeManager } from '../src/components/admin/ThemeManager';
import { ThemePreviewBar } from '../src/components/ThemePreviewBar';
import { fetchAdminAppearance, fetchAppearance, saveAppearance } from '../src/lib/api';

vi.mock('../src/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/api')>(),
  fetchAppearance: vi.fn(), fetchAdminAppearance: vi.fn(), saveAppearance: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchAppearance).mockResolvedValue({ appearance: { theme: 'nordic' } });
  vi.mocked(fetchAdminAppearance).mockResolvedValue({ appearance: { theme: 'nordic' } });
  vi.mocked(saveAppearance).mockResolvedValue({ appearance: { theme: 'studio' } });
});
afterEach(() => { vi.clearAllMocks(); delete document.documentElement.dataset.theme; });

function panel() {
  render(<MemoryRouter><AppearanceProvider><ThemePreviewBar /><ThemeManager token="test-admin" onUnauthorized={vi.fn()} /></AppearanceProvider></MemoryRouter>);
}

describe('design och teman', () => {
  it('förhandsvisar lokalt och återgår till aktivt tema utan att spara', async () => {
    const user = userEvent.setup();
    panel();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Färgglad formstudio/ })).toBeEnabled());
    await user.click(screen.getByRole('radio', { name: /Färgglad formstudio/ }));
    await user.click(screen.getByRole('button', { name: 'Förhandsvisa' }));
    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(screen.getByText(/Syns bara för dig/)).toBeInTheDocument();
    expect(saveAppearance).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Avsluta förhandsvisning' }));
    expect(document.documentElement.dataset.theme).toBe('nordic');
  });

  it('aktiverar det valda temat och avslutar förhandsvisningen efter serversvar', async () => {
    const user = userEvent.setup();
    panel();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Färgglad formstudio/ })).toBeEnabled());
    await user.click(screen.getByRole('radio', { name: /Färgglad formstudio/ }));
    await user.click(screen.getByRole('button', { name: 'Förhandsvisa' }));
    await user.click(screen.getByRole('button', { name: 'Aktivera tema' }));
    await screen.findByText('Färgglad formstudio är nu aktivt för alla besökare.');
    expect(saveAppearance).toHaveBeenCalledWith('test-admin', 'studio');
    expect(document.documentElement.dataset.theme).toBe('studio');
    expect(screen.queryByRole('button', { name: 'Avsluta förhandsvisning' })).not.toBeInTheDocument();
  });

  it('behåller det publicerade temat och visar fel när sparandet misslyckas', async () => {
    vi.mocked(saveAppearance).mockRejectedValue(new Error('Kunde inte spara temat.'));
    const user = userEvent.setup();
    panel();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Mörk designbutik/ })).toBeEnabled());
    await user.click(screen.getByRole('radio', { name: /Mörk designbutik/ }));
    await user.click(screen.getByRole('button', { name: 'Aktivera tema' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte spara temat.');
    expect(document.documentElement.dataset.theme).toBe('nordic');
  });
});
