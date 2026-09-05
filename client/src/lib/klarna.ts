/**
 * Klarnas JS-SDK laddas först när kassan öppnas, så att resten av butiken inte
 * betalar för skriptet. Typerna nedan täcker bara det vi faktiskt anropar.
 */
const SDK_URL = 'https://x.klarnacdn.net/kp/lib/v1/api.js';

interface AuthorizeResult {
  approved: boolean;
  show_form: boolean;
  authorization_token?: string;
  error?: { invalid_fields?: string[] };
}

interface KlarnaPayments {
  init: (options: { client_token: string }) => void;
  load: (
    options: { container: string; payment_method_category?: string },
    data: Record<string, unknown>,
    callback: (result: { show_form: boolean; error?: unknown }) => void,
  ) => void;
  authorize: (
    options: { payment_method_category?: string },
    data: Record<string, unknown>,
    callback: (result: AuthorizeResult) => void,
  ) => void;
}

declare global {
  interface Window {
    Klarna?: { Payments: KlarnaPayments };
  }
}

let loader: Promise<KlarnaPayments> | null = null;

export function loadKlarna(): Promise<KlarnaPayments> {
  if (window.Klarna?.Payments) return Promise.resolve(window.Klarna.Payments);
  if (loader) return loader;

  loader = new Promise<KlarnaPayments>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.Klarna?.Payments) resolve(window.Klarna.Payments);
      else reject(new Error('Klarna kunde inte initieras'));
    });
    script.addEventListener('error', () => {
      loader = null;
      reject(new Error('Klarnas betalskript kunde inte laddas'));
    });
    if (!existing) document.head.appendChild(script);
  });

  return loader;
}

export function authorize(
  payments: KlarnaPayments,
  category: string | undefined,
  data: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    payments.authorize({ payment_method_category: category }, data, (result) => {
      if (result.approved && result.authorization_token) {
        resolve(result.authorization_token);
        return;
      }
      reject(
        new Error(
          result.show_form
            ? 'Klarna kunde inte godkänna betalningen. Kontrollera uppgifterna och försök igen.'
            : 'Klarna nekade betalningen. Välj ett annat betalsätt.',
        ),
      );
    });
  });
}
