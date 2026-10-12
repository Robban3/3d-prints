import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CustomerForm } from '../components/CustomerForm';
import { ModelFacts } from '../components/ModelFacts';
import { ModelViewer } from '../components/ModelViewer';
import { UploadDropzone } from '../components/UploadDropzone';
import { PageHeader } from '../components/PageHeader';
import { QuoteSummary } from '../components/QuoteSummary';
import { TextAreaField, TextField } from '../components/Field';
import { ApiError, fetchConfig, fetchQuote, placeCustomOrder, saveQuote } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type {
  CustomerDetails,
  MaterialId,
  PrintQuality,
  QuoteBreakdown,
  QuoteRequest,
  UploadedFile,
} from '../types';
import { useDocumentMeta } from '../lib/meta';
import type { CustomOrderPrefill } from '../lib/prefill';

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
  useDocumentMeta({
    title: 'Beställ eget printjobb',
    description:
      'Ladda upp din STL, OBJ eller 3MF. Vi mäter upp modellen, visar den i 3D och räknar fram pris och leveranstid direkt.',
  });
  const navigate = useNavigate();
  const config = useAsync(() => fetchConfig(), []);
  const location = useLocation();

  // Startsidan skickar med en uppladdad fil; en sparad offert och en
  // ombeställning skickar med hela formuläret.
  const prefill = (location.state as CustomOrderPrefill | null) ?? {};

  const [request, setRequest] = useState<QuoteRequest>(
    prefill.request ?? {
      material: 'pla',
      quality: 'standard',
      volumeCm3: 120,
      infill: 20,
      quantity: 1,
      rush: false,
      postProcessing: false,
    },
  );
  const [projectName, setProjectName] = useState(prefill.projectName ?? '');
  const [description, setDescription] = useState(prefill.description ?? '');
  const [uploaded, setUploaded] = useState<UploadedFile | null>(prefill.uploaded ?? null);
  // Filen ligger kvar i webbläsaren så att 3D-vyn slipper hämta hem den igen.
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [customer, setCustomer] = useState<CustomerDetails>(prefill.customer ?? emptyCustomer);

  // Att spara offerten är ett eget steg, så siffrorna går att skicka vidare
  // till den som ska godkänna köpet.
  const [shareEmail, setShareEmail] = useState(prefill.customer?.email ?? '');
  const [savedUrl, setSavedUrl] = useState('');
  const [savedMailed, setSavedMailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prisförslaget hämtas från servern så att butiken och kassan alltid räknar lika.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      fetchQuote(request, uploaded?.id)
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
  }, [request, uploaded?.id]);

  const accepted = config.data?.upload.extensions ?? DEFAULT_ACCEPTED;
  const maxBytes = config.data?.upload.maxBytes ?? DEFAULT_MAX_BYTES;
  const materials = config.data?.materials ?? [];
  const qualities = config.data?.qualities ?? [];
  const limits = config.data?.quoteLimits;
  // Är filen uppmätt är det dess volym som gäller, så reglaget döljs.
  const measured = uploaded?.analysis;

  const selectedMaterial = useMemo(
    () => materials.find((entry) => entry.id === request.material),
    [materials, request.material],
  );

  function patch(update: Partial<QuoteRequest>) {
    setRequest((current) => ({ ...current, ...update }));
  }

  async function share() {
    setSaving(true);
    setSaveError('');
    setSavedUrl('');
    try {
      const result = await saveQuote({
        request,
        projectName,
        description,
        fileId: uploaded?.id,
        ...(shareEmail.trim() ? { email: shareEmail.trim() } : {}),
      });
      setSavedUrl(`${window.location.origin}${result.path}`);
      setSavedMailed(Boolean(result.mail?.delivered));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setSaveError(error.message);
      } else {
        setSaveError('Offerten kunde inte sparas. Försök igen.');
      }
    } finally {
      setSaving(false);
    }
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
          {prefill.notice && (
            <p className="notice notice-success" style={{ marginBottom: 20 }}>
              {prefill.notice} Ändra det du vill innan du skickar.
            </p>
          )}
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
                      onFileChosen={setPickedFile}
                      onBusyChange={setUploading}
                      error={errors.fileId}
                    />
                  </div>

                  {uploaded && (
                    <div className="model-preview">
                      <ModelViewer
                        file={pickedFile}
                        url={uploaded.url}
                        fileName={uploaded.fileName}
                      />
                      {measured ? (
                        <ModelFacts analysis={measured} />
                      ) : (
                        <p className="notice">
                          {uploaded.analysisError ??
                            'Det här formatet mäter vi upp för hand. Välj ungefär rätt storlek nedan – vi hör av oss med exakt pris innan produktion.'}
                        </p>
                      )}
                    </div>
                  )}

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
                  {measured ? (
                    <div className="field">
                      <span className="field-label">Volym</span>
                      <p className="measured-volume">
                        <strong>
                          {measured.volumeCm3.toLocaleString('sv-SE', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          cm³
                        </strong>
                        <span>uppmätt ur {uploaded?.fileName}</span>
                      </p>
                      <span className="field-hint">
                        Vi räknar på filens riktiga volym, så du behöver inte uppskatta något. Byt
                        fil om du vill prissätta en annan modell.
                      </span>
                      {errors.volumeCm3 && <span className="error">{errors.volumeCm3}</span>}
                    </div>
                  ) : (
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
                        Ladda upp en fil så mäter vi volymen exakt. Utan fil: välj ungefär rätt
                        storlek, vi hör av oss innan produktion om priset ändras.
                      </span>
                      {errors.volumeCm3 && <span className="error">{errors.volumeCm3}</span>}
                    </div>
                  )}

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
                <QuoteSummary
                  quote={quote}
                  quantity={request.quantity}
                  materialName={selectedMaterial?.name}
                />
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

              <div className="share-quote">
                {savedUrl ? (
                  <>
                    <strong>Offerten är sparad.</strong>
                    <p className="dim" style={{ fontSize: '0.84rem', margin: '4px 0 10px' }}>
                      {savedMailed
                        ? 'Vi har mejlat länken till dig. Den gäller i 30 dagar.'
                        : 'Länken gäller i 30 dagar och går att skicka vidare.'}
                    </p>
                    <input
                      className="input"
                      readOnly
                      value={savedUrl}
                      onFocus={(event) => event.target.select()}
                      aria-label="Länk till din offert"
                    />
                  </>
                ) : (
                  <>
                    <strong>Behöver någon annan godkänna?</strong>
                    <p className="dim" style={{ fontSize: '0.84rem', margin: '4px 0 10px' }}>
                      Spara offerten bakom en egen länk som går att återkomma till eller skicka
                      vidare.
                    </p>
                    <input
                      className="input"
                      type="email"
                      placeholder="Mejla länken till (valfritt)"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      aria-label="Mejladress för offerten"
                    />
                    {errors.email && <span className="error">{errors.email}</span>}
                    {saveError && !errors.email && <span className="error">{saveError}</span>}
                    <button
                      type="button"
                      className="btn btn-ghost btn-block"
                      style={{ marginTop: 10 }}
                      disabled={saving || uploading || !quote}
                      onClick={() => void share()}
                    >
                      {saving ? 'Sparar…' : 'Spara offerten'}
                    </button>
                  </>
                )}
              </div>
            </aside>
          </form>
        </div>
      </section>
    </>
  );
}
