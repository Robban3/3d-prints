import { expect, it, vi } from 'vitest';

it('kan ladda Klarna på nytt efter att skriptet misslyckats', async () => {
  vi.resetModules();
  const { loadKlarna } = await import('../src/lib/klarna');
  const first = loadKlarna();
  const rejected = expect(first).rejects.toThrow('betalskript');
  const script = document.querySelector<HTMLScriptElement>('script[src*="klarnacdn"]')!;
  script.dispatchEvent(new Event('error')); await rejected;
  const next = loadKlarna();
  const replacement = document.querySelector<HTMLScriptElement>('script[src*="klarnacdn"]')!;
  expect(replacement).not.toBe(script);
  window.Klarna = { Payments: { init: vi.fn(), load: vi.fn(), authorize: vi.fn() } };
  replacement.dispatchEvent(new Event('load'));
  await expect(next).resolves.toBe(window.Klarna.Payments);
  replacement.remove(); delete window.Klarna;
});
