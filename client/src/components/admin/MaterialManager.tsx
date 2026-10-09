import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  deleteMaterial,
  deleteQuality,
  fetchAdminMaterials,
  saveMaterial,
  saveQuality,
} from '../../lib/api';
import type { AdminMaterial, Material, Quality } from '../../types';

interface Props {
  token: string;
  onChanged: () => void;
}

const blankMaterial: Material = {
  id: '',
  name: '',
  priceFactor: 1,
  description: '',
  traits: [],
};

const blankQuality: Quality = {
  id: '',
  name: '',
  layerHeightMm: 0.2,
  timeFactor: 1,
  description: '',
};

/**
 * Material och kvalitetsnivåer styr priset på kundunika printjobb, så en
 * ändring här slår igenom direkt i offertberäkningen.
 */
export function MaterialManager({ token, onChanged }: Props) {
  const [materials, setMaterials] = useState<AdminMaterial[] | null>(null);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [material, setMaterial] = useState<Material>(blankMaterial);
  const [materialIsNew, setMaterialIsNew] = useState(true);
  const [quality, setQuality] = useState<Quality>(blankQuality);
  const [qualityIsNew, setQualityIsNew] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminMaterials(token);
      setMaterials(result.materials);
      setQualities(result.qualities);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta materialen');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitMaterial() {
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      await saveMaterial(token, material, materialIsNew);
      setMessage(`${material.name} är sparat.`);
      setMaterial(blankMaterial);
      setMaterialIsNew(true);
      await load();
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setError(caught.message);
      } else {
        setError('Materialet kunde inte sparas.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitQuality() {
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      await saveQuality(token, quality, qualityIsNew);
      setMessage(`${quality.name} är sparad.`);
      setQuality(blankQuality);
      setQualityIsNew(true);
      await load();
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setError(caught.message);
      } else {
        setError('Kvalitetsnivån kunde inte sparas.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeMaterial(entry: AdminMaterial) {
    setSaving(true);
    try {
      await deleteMaterial(token, entry.id);
      setMessage(`${entry.name} är borttaget.`);
      await load();
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.fields.id ?? caught.message)
          : 'Materialet kunde inte tas bort.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeQuality(entry: Quality) {
    setSaving(true);
    try {
      await deleteQuality(token, entry.id);
      setMessage(`${entry.name} är borttagen.`);
      await load();
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.fields.id ?? caught.message)
          : 'Kvalitetsnivån kunde inte tas bort.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2>Material</h2>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        Prisfaktorn jämförs med PLA som ligger på 1,0. En ändring slår igenom direkt på priset
        för kundunika printjobb.
      </p>
      {message && <p className="notice notice-success">{message}</p>}
      {error && <p className="notice notice-error">{error}</p>}

      <div className="stack" style={{ gap: 10, marginBottom: 22 }}>
        {materials?.map((entry) => (
          <div className="admin-row" key={entry.id}>
            <div className="admin-row-main">
              <strong>{entry.name}</strong>
              <span className="dim">{entry.description}</span>
            </div>
            <div className="admin-row-meta">
              <span className="badge badge-accent">
                ×{entry.priceFactor.toString().replace('.', ',')}
              </span>
              <span className="badge">
                {entry.productCount} {entry.productCount === 1 ? 'produkt' : 'produkter'}
              </span>
            </div>
            <div className="admin-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setMaterial({ ...entry });
                  setMaterialIsNew(false);
                }}
              >
                Redigera
              </button>
              <button
                type="button"
                className="btn-quiet"
                disabled={saving || entry.productCount > 0}
                title={entry.productCount > 0 ? 'Byt material på produkterna först' : undefined}
                onClick={() => void removeMaterial(entry)}
              >
                Ta bort
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMaterial();
        }}
      >
        <h3>{materialIsNew ? 'Nytt material' : `Redigera ${material.name || material.id}`}</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="materialnamn">Namn</label>
            <input
              id="materialnamn"
              className="input"
              value={material.name}
              onChange={(event) => setMaterial({ ...material, name: event.target.value })}
            />
            {errors.name && <span className="error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="prisfaktor">Prisfaktor</label>
            <input
              id="prisfaktor"
              className="input"
              type="number"
              step="0.05"
              min="0.1"
              value={material.priceFactor}
              onChange={(event) =>
                setMaterial({ ...material, priceFactor: Number(event.target.value) })
              }
            />
            {errors.priceFactor && <span className="error">{errors.priceFactor}</span>}
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="materialbeskrivning">Beskrivning</label>
          <input
            id="materialbeskrivning"
            className="input"
            value={material.description}
            onChange={(event) => setMaterial({ ...material, description: event.target.value })}
          />
          {errors.description && <span className="error">{errors.description}</span>}
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="egenskaper">Egenskaper (kommaseparerat)</label>
          <input
            id="egenskaper"
            className="input"
            value={material.traits.join(', ')}
            placeholder="Slagtålig, Fukttålig"
            onChange={(event) =>
              setMaterial({
                ...material,
                traits: event.target.value
                  .split(',')
                  .map((trait) => trait.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        {errors.id && <span className="error">{errors.id}</span>}
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Sparar…' : materialIsNew ? 'Lägg till material' : 'Spara ändringar'}
          </button>
          {!materialIsNew && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setMaterial(blankMaterial);
                setMaterialIsNew(true);
              }}
            >
              Avbryt
            </button>
          )}
        </div>
      </form>

      <h2 style={{ marginTop: 34 }}>Utskriftskvalitet</h2>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        Tidsfaktorn säger hur mycket längre jobbet tar jämfört med standard, och styr maskintiden
        i offerten.
      </p>

      <div className="stack" style={{ gap: 10, marginBottom: 22 }}>
        {qualities.map((entry) => (
          <div className="admin-row" key={entry.id}>
            <div className="admin-row-main">
              <strong>{entry.name}</strong>
              <span className="dim">{entry.description}</span>
            </div>
            <div className="admin-row-meta">
              <span className="badge">
                {entry.layerHeightMm.toString().replace('.', ',')} mm
              </span>
              <span className="badge badge-accent">
                ×{entry.timeFactor.toString().replace('.', ',')} tid
              </span>
            </div>
            <div className="admin-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setQuality({ ...entry });
                  setQualityIsNew(false);
                }}
              >
                Redigera
              </button>
              <button
                type="button"
                className="btn-quiet"
                disabled={saving}
                onClick={() => void removeQuality(entry)}
              >
                Ta bort
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuality();
        }}
      >
        <h3>{qualityIsNew ? 'Ny kvalitetsnivå' : `Redigera ${quality.name || quality.id}`}</h3>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="kvalitetsnamn">Namn</label>
            <input
              id="kvalitetsnamn"
              className="input"
              value={quality.name}
              onChange={(event) => setQuality({ ...quality, name: event.target.value })}
            />
            {errors.name && <span className="error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="lagerhojd">Lagerhöjd (mm)</label>
            <input
              id="lagerhojd"
              className="input"
              type="number"
              step="0.01"
              value={quality.layerHeightMm}
              onChange={(event) =>
                setQuality({ ...quality, layerHeightMm: Number(event.target.value) })
              }
            />
            {errors.layerHeightMm && <span className="error">{errors.layerHeightMm}</span>}
          </div>
          <div className="field">
            <label htmlFor="tidsfaktor">Tidsfaktor</label>
            <input
              id="tidsfaktor"
              className="input"
              type="number"
              step="0.05"
              value={quality.timeFactor}
              onChange={(event) =>
                setQuality({ ...quality, timeFactor: Number(event.target.value) })
              }
            />
            {errors.timeFactor && <span className="error">{errors.timeFactor}</span>}
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="kvalitetsbeskrivning">Beskrivning</label>
          <input
            id="kvalitetsbeskrivning"
            className="input"
            value={quality.description}
            onChange={(event) => setQuality({ ...quality, description: event.target.value })}
          />
          {errors.description && <span className="error">{errors.description}</span>}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Sparar…' : qualityIsNew ? 'Lägg till nivå' : 'Spara ändringar'}
          </button>
          {!qualityIsNew && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setQuality(blankQuality);
                setQualityIsNew(true);
              }}
            >
              Avbryt
            </button>
          )}
        </div>
      </form>
    </>
  );
}
