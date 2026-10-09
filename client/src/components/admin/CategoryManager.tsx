import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  createCategory,
  deleteCategory,
  fetchAdminCategories,
  updateCategory,
} from '../../lib/api';
import type { AdminCategory } from '../../types';

interface Props {
  token: string;
  onChanged: () => void;
}

const blank = { id: '', name: '', description: '' };

export function CategoryManager({ token, onChanged }: Props) {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminCategories(token);
      setCategories(result.categories);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta kategorierna');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      if (editingId) {
        await updateCategory(token, editingId, { name: draft.name, description: draft.description });
        setMessage(`${draft.name} är uppdaterad.`);
      } else {
        await createCategory(token, { name: draft.name, description: draft.description });
        setMessage(`${draft.name} är tillagd.`);
      }
      setDraft(blank);
      setEditingId(null);
      await load();
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setError(caught.message);
      } else {
        setError('Kategorin kunde inte sparas.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: AdminCategory) {
    setSaving(true);
    setError(null);
    try {
      await deleteCategory(token, category.id);
      setMessage(`${category.name} är borttagen.`);
      await load();
      onChanged();
    } catch (caught) {
      // Servern vägrar om kategorin fortfarande har produkter i sig.
      setError(
        caught instanceof ApiError
          ? (caught.fields.id ?? caught.message)
          : 'Kategorin kunde inte tas bort.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2>Kategorier</h2>
      {message && <p className="notice notice-success">{message}</p>}
      {error && <p className="notice notice-error">{error}</p>}

      <div className="stack" style={{ gap: 10, marginBottom: 22 }}>
        {categories?.map((category) => (
          <div className="admin-row" key={category.id}>
            <div className="admin-row-main">
              <strong>{category.name}</strong>
              <span className="dim">{category.description}</span>
            </div>
            <div className="admin-row-meta">
              <span className="badge">
                {category.productCount} {category.productCount === 1 ? 'produkt' : 'produkter'}
              </span>
              <span className="dim mono" style={{ fontSize: '0.8rem' }}>
                {category.id}
              </span>
            </div>
            <div className="admin-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditingId(category.id);
                  setDraft({
                    id: category.id,
                    name: category.name,
                    description: category.description,
                  });
                }}
              >
                Redigera
              </button>
              <button
                type="button"
                className="btn-quiet"
                disabled={saving || category.productCount > 0}
                title={
                  category.productCount > 0
                    ? 'Flytta produkterna först'
                    : 'Ta bort kategorin'
                }
                onClick={() => void remove(category)}
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
          void save();
        }}
      >
        <h3>{editingId ? `Redigera ${draft.name || editingId}` : 'Ny kategori'}</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="kategorinamn">Namn</label>
            <input
              id="kategorinamn"
              className="input"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {errors.name && <span className="error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="kategoribeskrivning">Beskrivning</label>
            <input
              id="kategoribeskrivning"
              className="input"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            {errors.description && <span className="error">{errors.description}</span>}
          </div>
        </div>
        {errors.id && <span className="error">{errors.id}</span>}
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Sparar…' : editingId ? 'Spara ändringar' : 'Lägg till kategori'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setEditingId(null);
                setDraft(blank);
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
