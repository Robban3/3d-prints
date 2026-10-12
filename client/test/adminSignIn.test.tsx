import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSignIn } from '../src/components/admin/AdminSignIn';
import { adminForgot, adminLogin, adminSetup } from '../src/lib/api';
vi.mock('../src/lib/api', () => ({ adminForgot: vi.fn(), adminLogin: vi.fn(), adminSetup: vi.fn(), adminReset: vi.fn() }));
beforeEach(() => { vi.mocked(adminLogin).mockResolvedValue({}); vi.mocked(adminSetup).mockResolvedValue({}); vi.mocked(adminForgot).mockResolvedValue({}); });
afterEach(() => vi.clearAllMocks());
it('loggar in med epost och lösenord först efter serverns godkännande', async () => {
  const user = userEvent.setup(), done = vi.fn();
  render(<AdminSignIn email="admin@formlabb.se" setup={false} bootstrapKey="" recoveryByEmail={false} onSignedIn={done} />);
  await user.type(screen.getByLabelText('Lösenord'), 'test-only-long-password');
  await user.click(screen.getByRole('button', { name: 'Logga in' }));
  expect(adminLogin).toHaveBeenCalledWith('admin@formlabb.se', 'test-only-long-password'); expect(done).toHaveBeenCalledOnce();
});
it('behåller inloggningsformuläret vid fel lösenord', async () => {
  vi.mocked(adminLogin).mockRejectedValue(new Error('Fel e-postadress eller lösenord.'));
  const user = userEvent.setup(), done = vi.fn();
  render(<AdminSignIn email="admin@formlabb.se" setup={false} bootstrapKey="" recoveryByEmail={false} onSignedIn={done} />);
  await user.type(screen.getByLabelText('Lösenord'), 'incorrect-password'); await user.click(screen.getByRole('button', { name: 'Logga in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fel e-postadress'); expect(done).not.toHaveBeenCalled();
});
it('kräver matchande lösenord vid första aktivering', async () => {
  const user = userEvent.setup();
  render(<AdminSignIn email="admin@formlabb.se" setup bootstrapKey="test-bootstrap" recoveryByEmail={false} onSignedIn={vi.fn()} />);
  await user.type(screen.getByLabelText('Välj lösenord'), 'test-long-password-one'); await user.type(screen.getByLabelText('Bekräfta lösenord'), 'test-long-password-two');
  await user.click(screen.getByRole('button', { name: 'Aktivera konto' }));
  expect(screen.getByRole('alert')).toHaveTextContent('stämmer inte överens'); expect(adminSetup).not.toHaveBeenCalled();
});
it('begär återställning och visar lokal utkorg utan att logga in', async () => {
  const user = userEvent.setup(), done = vi.fn();
  render(<AdminSignIn email="admin@formlabb.se" setup={false} bootstrapKey="" recoveryByEmail={false} onSignedIn={done} />);
  await user.click(screen.getByRole('button', { name: 'Glömt lösenord?' })); await user.click(screen.getByRole('button', { name: 'Skicka återställningslänk' }));
  expect(adminForgot).toHaveBeenCalledWith('admin@formlabb.se'); expect(await screen.findByRole('status')).toHaveTextContent('server/data/utkorg'); expect(done).not.toHaveBeenCalled();
});
