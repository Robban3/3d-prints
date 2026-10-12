import { useRef, useState } from 'react';
import { ProductArt } from '../ProductArt';
import { ApiError, uploadProductImage } from '../../lib/api';
import { TextAreaField, TextField } from '../Field';
import { formatPrice } from '../../lib/format';
import type {
  ArtShape,
  ArtTone,
  Category,
  Material,
  Product,
  ProductDraft,
  ProductParameter,
} from '../../types';

const SHAPES: Array<{ id: ArtShape; name: string }> = [
  { id: 'planter', name: 'Kruka' },
  { id: 'spiralVase', name: 'Vas' },
  { id: 'moonLamp', name: 'Lampa' },
  { id: 'headphoneStand', name: 'Hörlursställ' },
  { id: 'organizer', name: 'Organiserare' },
  { id: 'penHolder', name: 'Pennställ' },
  { id: 'spiceShelf', name: 'Hylla' },
  { id: 'diceTower', name: 'Torn' },
  { id: 'coffeeDripper', name: 'Tratt' },
  { id: 'phoneStand', name: 'Ställ' },
  { id: 'wallHook', name: 'Krok' },
  { id: 'cableClip', name: 'Klämmor' },
  { id: 'gearFidget', name: 'Kugghjul' },
  { id: 'dragon', name: 'Figur' },
  { id: 'christmasTree', name: 'Julgran' },
  { id: 'ornamentBall', name: 'Julkula' },
  { id: 'starBurst', name: 'Stjärna' },
  { id: 'nameOrnament', name: 'Namnring' },
  { id: 'giftBox', name: 'Presentask' },
];

const TONES: Array<{ id: ArtTone; name: string }> = [
  { id: 'benvit', name: 'Benvit' },
  { id: 'grafit', name: 'Grafit' },
  { id: 'stal', name: 'Stål' },
  { id: 'bla', name: 'Blå' },
  { id: 'gran', name: 'Gran' },
  { id: 'vinrod', name: 'Vinröd' },
];

const AXES: Array<{ id: '' | 'width' | 'depth' | 'height'; name: string }> = [
  { id: '', name: 'Inget mått' },
  { id: 'width', name: 'Bredd' },
  { id: 'depth', name: 'Djup' },
  { id: 'height', name: 'Höjd' },
];

/** Ett nytt mått börjar som en bredd mellan 100 och 400 mm. */
function emptyParameter(): ProductParameter {
  return {
    id: '',
    name: '',
    unit: 'mm',
    min: 100,
    max: 400,
    step: 10,
    default: 200,
    pricePerUnit: 1,
    axis: 'width',
  };
}

export function emptyDraft(categoryId: string): ProductDraft {
  return {
    slug: '',
    name: '',
    tagline: '',
    description: '',
    category: categoryId as Product['category'],
    price: 299,
    material: 'pla',
    finish: 'Matte',
    printTimeHours: 6,
    dimensions: { width: 100, depth: 100, height: 120 },
    weightGrams: 150,
    colors: ['Matt svart'],
    sizes: [],
    highlights: [],
    stock: 10,
    rating: 0,
    reviewCount: 0,
    featured: false,
    published: true,
    art: { shape: 'planter', tone: 'benvit' },
  };
}

interface Props {
  draft: ProductDraft;
  categories: Category[];
  /** Hämtas från katalogen, så nytillagda material dyker upp direkt. */
  materials: Material[];
  errors: Record<string, string>;
  saving: boolean;
  onChange: (patch: Partial<ProductDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** Redigerar en lista med korta texter, t.ex. färger eller höjdpunkter. */
function ListEditor({
  label,
  values,
  placeholder,
  error,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  error?: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...values, value]);
    setDraft('');
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chip-row">
        {values.map((value, index) => (
          <span className="chip" key={`${value}-${index}`}>
            {value}
            <button
              type="button"
              className="chip-remove"
              aria-label={`Ta bort ${value}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={add}>
          Lägg till
        </button>
      </div>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function ProductForm({
  draft,
  categories,
  materials,
  errors,
  saving,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const sizes = draft.sizes ?? [];
  const parameters = draft.parameters ?? [];
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setImageError('');
    try {
      const image = await uploadProductImage(file).promise;
      onChange({ image });
    } catch (caught) {
      setImageError(caught instanceof ApiError ? caught.message : 'Bilden kunde inte laddas upp.');
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  function setSize(
    index: number,
    patch: Partial<{ id: string; name: string; priceDelta: number }>,
  ) {
    const next = sizes.map((size, i) => (i === index ? { ...size, ...patch } : size));
    onChange({ sizes: next });
  }

  function setParameter(index: number, patch: Partial<ProductParameter>) {
    onChange({
      parameters: parameters.map((parameter, i) =>
        i === index ? { ...parameter, ...patch } : parameter,
      ),
    });
  }

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="admin-form-grid">
        <div className="stack">
          <h3>Grunduppgifter</h3>
          <TextField
            label="Namn"
            name="produktnamn"
            value={draft.name}
            error={errors.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <TextField
            label="Webbadress"
            name="slug"
            value={draft.slug}
            error={errors.slug}
            hint="Lämnas tomt så härleds den ur namnet."
            onChange={(event) => onChange({ slug: event.target.value })}
          />
          <TextField
            label="Säljande rad"
            name="tagline"
            value={draft.tagline}
            error={errors.tagline}
            onChange={(event) => onChange({ tagline: event.target.value })}
          />
          <TextAreaField
            label="Beskrivning"
            name="beskrivning"
            value={draft.description}
            error={errors.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />

          <div className="grid-2">
            <div className="field">
              <label htmlFor="kategori">Kategori</label>
              <select
                id="kategori"
                className="select"
                style={{ width: '100%' }}
                value={draft.category}
                onChange={(event) =>
                  onChange({ category: event.target.value as Product['category'] })
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category && <span className="error">{errors.category}</span>}
            </div>
            <div className="field">
              <label htmlFor="material">Material</label>
              <select
                id="material"
                className="select"
                style={{ width: '100%' }}
                value={draft.material}
                onChange={(event) =>
                  onChange({ material: event.target.value as Product['material'] })
                }
              >
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
              </select>
              {errors.material && <span className="error">{errors.material}</span>}
            </div>
          </div>

          <div className="grid-2">
            <TextField
              label="Pris (kr)"
              name="pris"
              type="number"
              min={1}
              value={draft.price}
              error={errors.price}
              onChange={(event) => onChange({ price: Number(event.target.value) })}
            />
            <TextField
              label="Ytfinish"
              name="finish"
              value={draft.finish}
              hint="Visas efter materialet, t.ex. ”PLA Silk”."
              onChange={(event) => onChange({ finish: event.target.value })}
            />
          </div>

          <ListEditor
            label="Färger"
            values={draft.colors}
            placeholder="t.ex. Matt svart"
            error={errors.colors}
            onChange={(colors) => onChange({ colors })}
          />
          <ListEditor
            label="Höjdpunkter"
            values={draft.highlights}
            placeholder="t.ex. Skarvfri yta"
            onChange={(highlights) => onChange({ highlights })}
          />
        </div>

        <div className="stack">
          <h3>Bild</h3>
          {draft.image ? (
            <div className="admin-image-preview">
              <img src={draft.image.url} alt="" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>
                  {draft.image.fileName}
                </strong>
                <span className="dim" style={{ fontSize: '0.82rem' }}>
                  Visas i stället för den ritade illustrationen.
                </span>
              </span>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => onChange({ image: undefined })}
              >
                Ta bort
              </button>
            </div>
          ) : (
            <>
              <div className="admin-art-preview">
                <ProductArt shape={draft.art.shape} tone={draft.art.tone} title="Förhandsvisning" />
              </div>
              <input
                ref={imageInput}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif"
                hidden
                onChange={(event) => void pickImage(event.target.files?.[0])}
              />
              <div className="row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={uploading}
                  onClick={() => imageInput.current?.click()}
                >
                  {uploading ? 'Laddar upp…' : 'Ladda upp foto'}
                </button>
                <span className="field-hint">
                  Utan foto ritas illustrationen nedan. JPG, PNG, WEBP eller AVIF, max 8 MB.
                </span>
              </div>
              {imageError && <span className="error">{imageError}</span>}
            </>
          )}
          <div className="grid-2">
            <div className="field">
              <label htmlFor="form">Form</label>
              <select
                id="form"
                className="select"
                style={{ width: '100%' }}
                value={draft.art.shape}
                onChange={(event) =>
                  onChange({ art: { ...draft.art, shape: event.target.value as ArtShape } })
                }
              >
                {SHAPES.map((shape) => (
                  <option key={shape.id} value={shape.id}>
                    {shape.name}
                  </option>
                ))}
              </select>
              {errors['art.shape'] && <span className="error">{errors['art.shape']}</span>}
            </div>
            <div className="field">
              <label htmlFor="yta">Yta</label>
              <select
                id="yta"
                className="select"
                style={{ width: '100%' }}
                value={draft.art.tone}
                onChange={(event) =>
                  onChange({ art: { ...draft.art, tone: event.target.value as ArtTone } })
                }
              >
                {TONES.map((tone) => (
                  <option key={tone.id} value={tone.id}>
                    {tone.name}
                  </option>
                ))}
              </select>
              {errors['art.tone'] && <span className="error">{errors['art.tone']}</span>}
            </div>
          </div>

          <h3 style={{ marginTop: 10 }}>Specifikation</h3>
          <div className="grid-3">
            <TextField
              label="Bredd (mm)"
              name="bredd"
              type="number"
              value={draft.dimensions.width}
              error={errors['dimensions.width']}
              onChange={(event) =>
                onChange({ dimensions: { ...draft.dimensions, width: Number(event.target.value) } })
              }
            />
            <TextField
              label="Djup (mm)"
              name="djup"
              type="number"
              value={draft.dimensions.depth}
              error={errors['dimensions.depth']}
              onChange={(event) =>
                onChange({ dimensions: { ...draft.dimensions, depth: Number(event.target.value) } })
              }
            />
            <TextField
              label="Höjd (mm)"
              name="hojd"
              type="number"
              value={draft.dimensions.height}
              error={errors['dimensions.height']}
              onChange={(event) =>
                onChange({
                  dimensions: { ...draft.dimensions, height: Number(event.target.value) },
                })
              }
            />
          </div>
          <div className="grid-3">
            <TextField
              label="Vikt (g)"
              name="vikt"
              type="number"
              value={draft.weightGrams}
              error={errors.weightGrams}
              onChange={(event) => onChange({ weightGrams: Number(event.target.value) })}
            />
            <TextField
              label="Printtid (h)"
              name="printtid"
              type="number"
              step="0.5"
              value={draft.printTimeHours}
              error={errors.printTimeHours}
              onChange={(event) => onChange({ printTimeHours: Number(event.target.value) })}
            />
            <TextField
              label="Lager (st)"
              name="lager"
              type="number"
              min={0}
              value={draft.stock}
              error={errors.stock}
              onChange={(event) => onChange({ stock: Number(event.target.value) })}
            />
          </div>

          <h3 style={{ marginTop: 10 }}>Storlekar</h3>
          <p className="field-hint" style={{ marginTop: -6 }}>
            Lämna tomt om produkten bara finns i en storlek. Pristillägget läggs på grundpriset.
          </p>
          {sizes.map((size, index) => (
            <div className="size-row" key={index}>
              <input
                className="input"
                placeholder="Namn, t.ex. Stor"
                value={size.name}
                onChange={(event) => setSize(index, { name: event.target.value })}
              />
              <input
                className="input"
                type="number"
                placeholder="± kr"
                value={size.priceDelta}
                onChange={(event) => setSize(index, { priceDelta: Number(event.target.value) })}
              />
              <span className="dim" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                {formatPrice(draft.price + (size.priceDelta || 0))}
              </span>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => onChange({ sizes: sizes.filter((_, i) => i !== index) })}
              >
                Ta bort
              </button>
            </div>
          ))}
          {Object.keys(errors)
            .filter((key) => key.startsWith('sizes.'))
            .map((key) => (
              <span className="error" key={key}>
                {errors[key]}
              </span>
            ))}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifySelf: 'start' }}
            onClick={() => onChange({ sizes: [...sizes, { id: '', name: '', priceDelta: 0 }] })}
          >
            Lägg till storlek
          </button>

          <h3 style={{ marginTop: 10 }}>Valbara mått</h3>
          <p className="field-hint" style={{ marginTop: -6 }}>
            Låter kunden ställa in måttet själv. Standardmåttet ingår i grundpriset; varje
            millimeter därifrån kostar priset per enhet, åt båda hållen. Kopplar du måttet till en
            axel skrivs produktens mått om efter kundens val.
          </p>
          {parameters.map((parameter, index) => (
            <div className="parameter-row" key={index}>
              <div className="parameter-grid">
                <TextField
                  label="Namn"
                  name={`parameter-namn-${index}`}
                  value={parameter.name}
                  onChange={(event) => setParameter(index, { name: event.target.value })}
                />
                <TextField
                  label="Enhet"
                  name={`parameter-enhet-${index}`}
                  value={parameter.unit}
                  onChange={(event) => setParameter(index, { unit: event.target.value })}
                />
                <TextField
                  label="Minst"
                  name={`parameter-min-${index}`}
                  type="number"
                  value={parameter.min}
                  onChange={(event) => setParameter(index, { min: Number(event.target.value) })}
                />
                <TextField
                  label="Mest"
                  name={`parameter-max-${index}`}
                  type="number"
                  value={parameter.max}
                  onChange={(event) => setParameter(index, { max: Number(event.target.value) })}
                />
                <TextField
                  label="Steg"
                  name={`parameter-steg-${index}`}
                  type="number"
                  value={parameter.step}
                  onChange={(event) => setParameter(index, { step: Number(event.target.value) })}
                />
                <TextField
                  label="Standard"
                  name={`parameter-standard-${index}`}
                  type="number"
                  value={parameter.default}
                  onChange={(event) => setParameter(index, { default: Number(event.target.value) })}
                />
                <TextField
                  label="Kr per enhet"
                  name={`parameter-pris-${index}`}
                  type="number"
                  step="0.1"
                  value={parameter.pricePerUnit}
                  onChange={(event) =>
                    setParameter(index, { pricePerUnit: Number(event.target.value) })
                  }
                />
                <div className="field">
                  <label htmlFor={`parameter-axel-${index}`}>Styr måttet</label>
                  <select
                    id={`parameter-axel-${index}`}
                    className="input"
                    value={parameter.axis ?? ''}
                    onChange={(event) =>
                      setParameter(index, {
                        ...(event.target.value
                          ? { axis: event.target.value as ProductParameter['axis'] }
                          : { axis: undefined }),
                      })
                    }
                  >
                    {AXES.map((axis) => (
                      <option key={axis.id} value={axis.id}>
                        {axis.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <TextField
                label="Hjälptext till kunden"
                name={`parameter-hjalp-${index}`}
                value={parameter.description ?? ''}
                onChange={(event) => setParameter(index, { description: event.target.value })}
              />
              <div className="spread">
                <span className="dim" style={{ fontSize: '0.82rem' }}>
                  {parameter.min} {parameter.unit} ger{' '}
                  {formatPrice(
                    Math.max(
                      0,
                      draft.price + (parameter.min - parameter.default) * parameter.pricePerUnit,
                    ),
                  )}
                  , {parameter.max} {parameter.unit} ger{' '}
                  {formatPrice(
                    Math.max(
                      0,
                      draft.price + (parameter.max - parameter.default) * parameter.pricePerUnit,
                    ),
                  )}
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => onChange({ parameters: parameters.filter((_, i) => i !== index) })}
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
          {Object.keys(errors)
            .filter((key) => key.startsWith('parameters.'))
            .map((key) => (
              <span className="error" key={key}>
                {errors[key]}
              </span>
            ))}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifySelf: 'start' }}
            onClick={() => onChange({ parameters: [...parameters, emptyParameter()] })}
          >
            Lägg till mått
          </button>

          <h3 style={{ marginTop: 10 }}>Synlighet</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.published !== false}
              onChange={(event) => onChange({ published: event.target.checked })}
            />
            <span>
              <strong>Publicerad</strong>
              <span>Opublicerade produkter syns bara här i panelen.</span>
            </span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(event) => onChange({ featured: event.target.checked })}
            />
            <span>
              <strong>Utvald</strong>
              <span>Kan lyftas fram bland de populära på startsidan.</span>
            </span>
          </label>
        </div>
      </div>

      <div className="row" style={{ marginTop: 22 }}>
        <button type="submit" className="btn btn-lg" disabled={saving}>
          {saving ? 'Sparar…' : 'Spara produkt'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
