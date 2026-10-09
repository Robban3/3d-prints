import { useState } from 'react';
import { ProductArt } from '../ProductArt';
import { TextAreaField, TextField } from '../Field';
import { formatPrice } from '../../lib/format';
import type { ArtShape, ArtTone, Category, Product, ProductDraft } from '../../types';

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
];

const TONES: Array<{ id: ArtTone; name: string }> = [
  { id: 'benvit', name: 'Benvit' },
  { id: 'grafit', name: 'Grafit' },
  { id: 'stal', name: 'Stål' },
  { id: 'bla', name: 'Blå' },
];

const MATERIALS = [
  { id: 'pla', name: 'PLA' },
  { id: 'petg', name: 'PETG' },
  { id: 'abs', name: 'ABS' },
  { id: 'tpu', name: 'TPU' },
  { id: 'resin', name: 'Resin' },
];

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
  errors,
  saving,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const sizes = draft.sizes ?? [];

  function setSize(index: number, patch: Partial<{ id: string; name: string; priceDelta: number }>) {
    const next = sizes.map((size, i) => (i === index ? { ...size, ...patch } : size));
    onChange({ sizes: next });
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
                {MATERIALS.map((material) => (
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
          <div className="admin-art-preview">
            <ProductArt shape={draft.art.shape} tone={draft.art.tone} title="Förhandsvisning" />
          </div>
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
                onChange({ dimensions: { ...draft.dimensions, height: Number(event.target.value) } })
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
