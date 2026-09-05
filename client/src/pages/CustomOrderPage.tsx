import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CustomerForm } from '../components/CustomerForm';
import { UploadDropzone } from '../components/UploadDropzone';
import { PageHeader } from '../components/PageHeader';
import { TextAreaField, TextField } from '../components/Field';
import { ApiError, fetchConfig, fetchQuote, placeCustomOrder } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatHours, formatPrice } from '../lib/format';
import type {
  CustomerDetails,
  MaterialId,
  PrintQuality,
  QuoteBreakdown,
  QuoteRequest,
  UploadedFile,
} from '../types';

/** Fallback tills /api/config svarat – servern är källan för de riktiga gränserna. */
const DEFAULT_ACCEPTED = ['.stl', '.obj', '.3mf', '.step', '.stp', '.f3d'];
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

const emptyCustomer: CustomerDetails = {
  name: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  note: '',
};

/**
 * Volymen är det som styr priset mest, och de flesta kunder vet inte sin
 * modells volym i cm³. De här referenserna gör siffran begriplig.
 */
const volumePresets = [
  { label: 'Nyckelring', volume: 8 },
  { label: 'Reservdel', volume: 45 },
  { label: 'Kaffekopp', volume: 120 },
  { label: 'Hjälmstorlek', volume: 900 },
];

export function CustomOrderPage() {
  const navigate = useNavigate();
  const config = useAsync(() => fetchConfig(), []);
  const location = useLocation();

  const [request, setRequest] = useState<QuoteRequest>({
    material: 'pla',
    quality: 'standard',
    volumeCm3: 120,
    infill: 20,
    quantity: 1,
    rush: false,
    postProcessing: false,
  });
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  // En fil som laddades upp på startsidan följer med hit via navigeringen.
  const carried = (location.state as { uploaded?: UploadedFile } | null)?.uploaded ?? null;
  const [uploaded, setUploaded] = useState<UploadedFile | null>(carried);
  const [uploading, setUploading] = useState(false);
  const [customer, setCustomer] = useState<CustomerDetails>(emptyCustomer);

  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prisförslaget hämtas från servern så att butiken och kassan alltid räknar lika.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      fetchQuote(request)
        .then((result) => {
          if (!active) return;
          setQuote(result.quote);
          setQuoteError(null);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setQuote(null);
          setQuoteError(error instanceof ApiError ? error.message : 'Kunde inte räkna ut priset');
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [request]);

  const accepted = config.data?.upload.extensions ?? DEFAULT_ACCEPTED;
  const maxBytes = config.data?.upload.maxBytes ?? DEFAULT_MAX_BYTES;
  const materials = config.data?.materials ?? [];
  const qualities = config.data?.qualities ?? [];
  const limits = config.data?.quoteLimits;

  const selectedMaterial = useMemo(
    () => materials.find((entry) => entry.id === request.material),
    [materials, request.material],
  );

  function patch(update: Partial<QuoteRequest>) {
    setRequest((current) => ({ ...current, ...update }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});
    try {
      const result = await placeCustomOrder({
        customer,
        request,
        projectName,
        description,
        fileId: uploaded?.id,
      });
      navigate(`/order/${result.order.id}`, { state: { order: result.order } });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError('Något gick fel. Försök igen.');
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Egen print"
        title="Beställ ditt eget printjobb"
        text="Fyll i vad du vill ha printat så räknar vi fram pris och leveranstid direkt. Vi tar emot allt från en enda reservdel till serier på hundratals delar."
      />
      <section className="section">
        <div className="container">
          <form className="cart-layout" onSubmit={submit} noValidate>
            <div className="stack" style={{ gap: 22 }}>
              <div className="panel">
                <h2>1. Din modell</h2>
                <div className="stack">
                  <TextField
                    label="Projektnamn"
                    name="projectName"
                    placeholder="t.ex. Fäste till kameran"
                    value={projectName}
                    error={errors.projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />

                  <div className="field">
                    <span className="field-label">Modellfil (valfritt)</span>
                    <UploadDropzone
                      accepted={accepted}
                      maxBytes={maxBytes}
                      uploaded={uploaded}
                      onUploaded={setUploaded}
                      onBusyChange={setUploading}
                      error={errors.fileId}
                    />
                  </div>

                  <TextAreaField
                    label="Beskriv jobbet"
                    name="description"
                    placeholder="Vad ska det användas till? Finns det mått eller ytor som måste stämma exakt? Har du ingen fil – beskriv vad du vill ha så återkommer vi med ett ritförslag."
                    value={description}
                    error={errors.description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="panel">
                <h2>2. Material och kvalitet</h2>
                <div className="stack" style={{ gap: 22 }}>
                  <div>
                    <span className="field-label">Material</span>
                    <div className="option-cards" style={{ marginTop: 8 }}>
                      {materials.map((material) => (
                        <button
                          key={material.id}
                          type="button"
                          className="option-card"
                          aria-pressed={request.material === material.id}
                          onClick={() => patch({ material: material.id as MaterialId })}
                        >
                          <strong>{material.name}</strong>
                          <span>
                            {material.priceFactor === 1
                              ? 'Grundpris'
                              : `×${material.priceFactor.toString().replace('.', ',')} materialpris`}
                          </span>
                        </button>
                      ))}
                    </div>
                    {selectedMaterial && (
                      <p className="field-hint" style={{ marginTop: 10 }}>
                        {selectedMaterial.description} · {selectedMaterial.traits.join(' · ')}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="field-label">Utskriftskvalitet</span>
                    <div className="option-cards" style={{ marginTop: 8 }}>
                      {qualities.map((quality) => (
                        <button
                          key={quality.id}
                          type="button"
                          className="option-card"
                          aria-pressed={request.quality === quality.id}
                          onClick={() => patch({ quality: quality.id as PrintQuality })}
                        >
                          <strong>{quality.name}</strong>
                          <span>
                            {quality.layerHeightMm.toString().replace('.', ',')} mm lager ·{' '}
                            {quality.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel">
                <h2>3. Storlek och antal</h2>
                <div className="stack" style={{ gap: 22 }}>
                  <div className="field">
                    <label htmlFor="volume">
                      Ungefärlig volym: <strong>{request.volumeCm3} cm³</strong>
                    </label>
                    <input
                      id="volume"
                      type="range"
                      min={limits?.volumeCm3.min ?? 1}
                      max={1500}
                      step={1}
                      value={request.volumeCm3}
                      onChange={(event) => patch({ volumeCm3: Number(event.target.value) })}
                    />
                    <div className="chip-row">
                      {volumePresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="chip"
                          aria-pressed={request.volumeCm3 === preset.volume}
                          onClick={() => patch({ volumeCm3: preset.volume })}
                        >
                          {preset.label} ≈ {preset.volume} cm³
                        </button>
                      ))}
                    </div>
                    <span className="field-hint">
                      Vet du inte volymen? Välj ungefär rätt storlek – vi mäter filen och hör av oss
                      innan produktion om priset ändras.
                    </span>
                    {errors.volumeCm3 && <span className="error">{errors.volumeCm3}</span>}
                  </div>

                  <div className="field">
                    <label htmlFor="infill">
                      Fyllnadsgrad: <strong>{request.infill} %</strong>
                    </label>
                    <input
                      id="infill"
                      type="range"
                      min={limits?.infill.min ?? 5}
                      max={limits?.infill.max ?? 100}
                      step={5}
                      value={request.infill}
                      onChange={(event) => patch({ infill: Number(event.target.value) })}
                    />
                    <span className="field-hint">
                      15–25 % räcker för dekor. Välj 60 % eller mer för delar som ska bära last.
                    </span>
                  </div>

                  <div className="grid-2">
                    <TextField
                      label="Antal"
                      name="quantity"
                      type="number"
                      min={1}
                      max={limits?.quantity.max ?? 500}
                      value={request.quantity}
                      error={errors.quantity}
                      hint="Volymrabatt från 5 st."
                      onChange={(event) =>
                        patch({
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                  </div>

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={request.postProcessing}
                      onChange={(event) => patch({ postProcessing: event.target.checked })}
                    />
                    <span>
                      <strong>Efterbearbetning (+85 kr/st)</strong>
                      <span>Stödmaterial bort, slipning och polering av synliga ytor.</span>
                    </span>
                  </label>

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={request.rush}
                      onChange={(event) => patch({ rush: event.target.checked })}
                    />
                    <span>
                      <strong>Express (+40 %)</strong>
                      <span>Ditt jobb går först i kön och skickas så snart det är klart.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="panel">
                <h2>4. Dina uppgifter</h2>
                <CustomerForm
                  value={customer}
                  errors={errors}
                  onChange={(update) => setCustomer((current) => ({ ...current, ...update }))}
                  noteLabel="Övrigt att tänka på (valfritt)"
                  notePlaceholder="Deadline, leveransadress som avviker, faktureringsuppgifter…"
                />
              </div>
            </div>

            <aside className="panel sticky-panel">
              <h2>Ditt pris</h2>
              {quoteError && <p className="notice notice-error">{quoteError}</p>}
              {quote && (
                <>
                  <div className="price" style={{ fontSize: '2.4rem', margin: '8px 0 4px' }}>
                    {formatPrice(quote.total)}
                  </div>
                  <p className="dim" style={{ fontSize: '0.86rem' }}>
                    {request.quantity} st · {formatPrice(quote.unitPrice)} per styck inkl. moms
                  </p>

                  <div style={{ margin: '18px 0' }}>
                    <div className="summary-row">
                      <span>Material ({selectedMaterial?.name})</span>
                      <span>{formatPrice(quote.materialCost)}/st</span>
                    </div>
                    <div className="summary-row">
                      <span>Maskintid</span>
                      <span>{formatPrice(quote.machineCost)}/st</span>
                    </div>
                    {quote.postProcessingCost > 0 && (
                      <div className="summary-row">
                        <span>Efterbearbetning</span>
                        <span>{formatPrice(quote.postProcessingCost)}/st</span>
                      </div>
                    )}
                    {quote.volumeDiscount > 0 && (
                      <div className="summary-row discount">
                        <span>Volymrabatt</span>
                        <span>−{formatPrice(quote.volumeDiscount)}</span>
                      </div>
                    )}
                    <div className="summary-row">
                      <span>Startavgift</span>
                      <span>{formatPrice(quote.setupFee)}</span>
                    </div>
                    {quote.rushSurcharge > 0 && (
                      <div className="summary-row">
                        <span>Expresstillägg</span>
                        <span>{formatPrice(quote.rushSurcharge)}</span>
                      </div>
                    )}
                    <div className="summary-row total">
                      <span>Att betala</span>
                      <span>{formatPrice(quote.total)}</span>
                    </div>
                  </div>

                  <div className="notice">
                    <strong>Beräknad printtid:</strong> {formatHours(quote.estimatedPrintHours)}
                    <br />
                    <strong>Leverans:</strong> {quote.estimatedDeliveryDays} arbetsdagar
                  </div>
                </>
              )}

              {submitError && (
                <p className="notice notice-error" style={{ marginTop: 16 }}>
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-block btn-lg"
                style={{ marginTop: 18 }}
                disabled={submitting || uploading}
              >
                {submitting ? 'Skickar…' : uploading ? 'Väntar på filen…' : 'Skicka beställning'}
              </button>
              <p className="dim" style={{ fontSize: '0.82rem', marginTop: 12, marginBottom: 0 }}>
                Du binder dig inte förrän vi bekräftat filen. Vi hör av oss inom en arbetsdag om
                något behöver justeras innan print.
              </p>
            </aside>
          </form>
        </div>
      </section>
    </>
  );
}
