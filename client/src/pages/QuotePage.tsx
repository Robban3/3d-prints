import { Link, useNavigate, useParams } from 'react-router';
import { ModelPanel } from '../components/ModelPanel';
import { PageHeader } from '../components/PageHeader';
import { QuoteSummary } from '../components/QuoteSummary';
import { fetchSavedQuote } from '../lib/api';
import { formatDate, formatPrice } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useDocumentMeta } from '../lib/meta';
import type { CustomOrderPrefill } from '../lib/prefill';

/**
 * En sparad offert, öppnad från sin länk.
 *
 * Priset räknas också om mot dagens siffror. Har något ändrats sedan offerten
 * sparades står det här – det är sämre att tiga om det och visa ett annat pris
 * i kassan.
 */
export function QuotePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => fetchSavedQuote(id), [id]);

  useDocumentMeta({
    title: data ? `Offert på ${data.quote.projectName}` : 'Din offert',
    description: 'Den sparade offerten på ditt printjobb.',
    noindex: true,
  });

  if (loading) {
    return (
      <div className="container section">
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader
          eyebrow="Offert"
          title="Offerten finns inte"
          text="Länken kan ha skrivits fel, eller så har offerten gått ut. Räkna fram en ny – det tar en minut."
        />
        <section className="section">
          <div className="container center">
            <Link className="btn btn-lg" to="/egen-print">
              Räkna ut ett nytt pris
            </Link>
          </div>
        </section>
      </>
    );
  }

  const { quote: saved, current, changed } = data;
  // Det är dagens pris som gäller om kunden beställer nu.
  const payable = current ?? saved.quote;

  function order() {
    const prefill: CustomOrderPrefill = {
      projectName: saved.projectName,
      description: saved.description,
      request: saved.request,
      notice: `Hämtat från din sparade offert, uträknad ${formatDate(saved.createdAt)}.`,
      ...(saved.fileId && saved.fileName && saved.fileUrl
        ? {
            uploaded: {
              id: saved.fileId,
              fileName: saved.fileName,
              url: saved.fileUrl,
              size: saved.fileSize ?? 0,
              ...(saved.model ? { analysis: saved.model } : {}),
            },
          }
        : {}),
    };
    navigate('/egen-print', { state: prefill });
  }

  return (
    <>
      <PageHeader
        eyebrow="Offert"
        title={saved.projectName}
        text={`Uträknad ${formatDate(saved.createdAt)}. Gäller till ${formatDate(saved.expiresAt)}.`}
      />
      <section className="section">
        <div className="container cart-layout">
          <div className="stack" style={{ gap: 22 }}>
            {changed && current && (
              <p className="notice notice-error">
                Priset har ändrats sedan offerten sparades: {formatPrice(saved.quote.total)} då,{' '}
                {formatPrice(current.total)} i dag. Det är dagens pris som gäller om du beställer
                nu.
              </p>
            )}

            {saved.description && (
              <div className="panel">
                <h2>Så här beskrev du jobbet</h2>
                <p className="muted" style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>
                  {saved.description}
                </p>
              </div>
            )}

            <div className="panel">
              <h2>Modellen</h2>
              {saved.fileName ? (
                <ModelPanel
                  fileName={saved.fileName}
                  fileUrl={saved.fileUrl}
                  fileSize={saved.fileSize}
                  model={saved.model}
                />
              ) : (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Ingen fil bifogades. Volymen i offerten är den som angavs för hand.
                </p>
              )}
            </div>

            <div className="panel panel-tight">
              <h3>Vad ingår</h3>
              <table className="spec-table">
                <tbody>
                  <tr>
                    <th>Material</th>
                    <td>{saved.request.material.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <th>Kvalitet</th>
                    <td>{saved.request.quality}</td>
                  </tr>
                  <tr>
                    <th>Volym / fyllnad</th>
                    <td>
                      {saved.request.volumeCm3} cm³ · {saved.request.infill} %
                    </td>
                  </tr>
                  <tr>
                    <th>Antal</th>
                    <td>{saved.request.quantity} st</td>
                  </tr>
                  <tr>
                    <th>Efterbearbetning</th>
                    <td>{saved.request.postProcessing ? 'Ja' : 'Nej'}</td>
                  </tr>
                  <tr>
                    <th>Express</th>
                    <td>{saved.request.rush ? 'Ja' : 'Nej'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <aside className="panel sticky-panel">
            <h2>Ditt pris</h2>
            <QuoteSummary quote={payable} quantity={saved.request.quantity} />

            <button type="button" className="btn btn-block btn-lg" onClick={order}>
              Beställ den här offerten
            </button>
            <p className="dim" style={{ fontSize: '0.82rem', marginTop: 12, marginBottom: 0 }}>
              Du fyller i leveransuppgifterna i nästa steg. Länken går att skicka vidare till den
              som ska godkänna köpet.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
