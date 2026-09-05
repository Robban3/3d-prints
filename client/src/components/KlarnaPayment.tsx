import { useEffect, useRef, useState } from 'react';
import { loadKlarna } from '../lib/klarna';
import { Icon } from '../components/Icon';
import type { PaymentSession } from '../types';

interface Props {
  session: PaymentSession | null;
  loading: boolean;
  error: string | null;
}

const CONTAINER_ID = 'klarna-payments-container';

/**
 * Renderar Klarnas betalwidget. Utan nycklar svarar servern med en session
 * märkt som test, och då visas en tydlig platshållare i stället för widgeten –
 * flödet fungerar men ingen riktig betalning sker.
 */
export function KlarnaPayment({ session, loading, error }: Props) {
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const initialised = useRef<string | null>(null);

  useEffect(() => {
    if (!session || session.test) return;
    if (initialised.current === session.clientToken) return;
    initialised.current = session.clientToken;

    let active = true;
    loadKlarna()
      .then((payments) => {
        if (!active) return;
        payments.init({ client_token: session.clientToken });
        payments.load(
          {
            container: `#${CONTAINER_ID}`,
            payment_method_category: session.paymentMethodCategories[0]?.identifier,
          },
          {},
          (result) => {
            if (active && !result.show_form) {
              setWidgetError('Klarna kan inte erbjuda något betalsätt för den här ordern.');
            }
          },
        );
      })
      .catch((caught: unknown) => {
        if (active)
          setWidgetError(caught instanceof Error ? caught.message : 'Klarna kunde inte laddas');
      });

    return () => {
      active = false;
    };
  }, [session]);

  return (
    <div className="panel">
      <h2>Betalning</h2>

      {loading && <div className="skeleton" style={{ aspectRatio: 'auto', height: 120 }} />}
      {(error || widgetError) && <p className="notice notice-error">{error ?? widgetError}</p>}

      {session?.test && (
        <div className="klarna-placeholder">
          <span className="klarna-mark" aria-hidden="true">
            Klarna
          </span>
          <div>
            <strong>Testläge</strong>
            <p>
              Klarnas widget visas här när butiken har API-nycklar. Just nu läggs ordern utan att
              någon betalning genomförs, och du får en betalningslänk via e-post i stället.
            </p>
          </div>
        </div>
      )}

      <div id={CONTAINER_ID} />

      {!session?.test && !loading && (
        <p className="dim" style={{ fontSize: '0.82rem', marginTop: 12, marginBottom: 0 }}>
          <Icon name="shield" size={13} /> Betalningen hanteras av Klarna. Inga betaluppgifter
          lagras hos oss.
        </p>
      )}
    </div>
  );
}
