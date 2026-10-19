import { useCallback, useEffect, useState } from 'react';
import { ProductImage } from '../ProductImage';
import { ProductForm, emptyDraft } from './ProductForm';
import {
  ApiError,
  createProduct,
  deleteProduct,
  fetchAdminProducts,
  updateProduct,
} from '../../lib/api';
import { ProductPrice } from '../ProductPrice';
import type { Category, Material, Product, ProductDraft } from '../../types';

/** Produkten utan id, som formuläret arbetar med. */
function toDraft(product: Product): ProductDraft {
  return {
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    price: product.price,
    discountPercent: product.discountPercent ?? 0,
    saleReferencePrice: product.saleReferencePrice,
    material: product.material,
    finish: product.finish,
    printTimeHours: product.printTimeHours,
    dimensions: { ...product.dimensions },
    weightGrams: product.weightGrams,
    colors: [...product.colors],
    sizes: product.sizes ? product.sizes.map((size) => ({ ...size })) : [],
    highlights: [...product.highlights],
    stock: product.stock,
    rating: product.rating,
    reviewCount: product.reviewCount,
    featured: product.featured,
    published: product.published !== false,
    specificationsPending: product.specificationsPending,
    dimensionsEstimated: product.dimensionsEstimated,
    dimensionsNote: product.dimensionsNote,
    productionEstimated: product.productionEstimated,
    productionNote: product.productionNote,
    optionLabel: product.optionLabel,
    art: { ...product.art },
    ...(product.image ? { image: { ...product.image } } : {}),
    variantImages: product.variantImages?.map(variant => ({ ...variant, image: { ...variant.image } })),
  };
}

interface Props {
  token: string;
  categories: Category[];
  materials: Material[];
  onChanged: () => void;
}

/** Listan över produkter, med formuläret öppet vid redigering. */
export function ProductManager({ token, categories, materials, onChanged }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: ProductDraft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onlyBargains, setOnlyBargains] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchAdminProducts(token);
      setProducts(result.products);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Kunde inte hämta produkterna');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setErrors({});
    setMessage(null);
    setEditing({ id: null, draft: emptyDraft(categories[0]?.id ?? 'inredning') });
  }

  function startEdit(product: Product) {
    setErrors({});
    setMessage(null);
    setEditing({ id: product.id, draft: toDraft(product) });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const result = editing.id
        ? await updateProduct(token, editing.id, editing.draft)
        : await createProduct(token, editing.draft);
      setMessage(
        editing.id
          ? `${result.product.name} är uppdaterad.`
          : `${result.product.name} är tillagd i katalogen.`,
      );
      setEditing(null);
      await load();
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fields);
        setError(caught.message);
      } else {
        setError('Produkten kunde inte sparas.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: Product) {
    setSaving(true);
    setError(null);
    try {
      await deleteProduct(token, product.id);
      setMessage(`${product.name} är borttagen. Lagda ordrar påverkas inte.`);
      setConfirmDelete(null);
      await load();
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Produkten kunde inte tas bort.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{editing.id ? 'Redigera produkt' : 'Ny produkt'}</h2>
        </div>
        {editing.id && <p className="dim">Grundnummer: {products?.find(product => product.id === editing.id)?.articleNumber ?? 'Tilldelas automatiskt'}. Artikelnumren skapas av systemet och behålls när produkten redigeras.</p>}
        {error && <p className="notice notice-error">{error}</p>}
        <ProductForm
          draft={editing.draft}
          categories={categories}
          materials={materials}
          errors={errors}
          saving={saving}
          onChange={(patch) =>
            setEditing((current) =>
              current ? { ...current, draft: { ...current.draft, ...patch } } : current,
            )
          }
          onSave={() => void save()}
          onCancel={() => setEditing(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          Produkter {products ? <span className="dim">({products.length})</span> : null}
        </h2>
        <button type="button" className="btn" onClick={startNew}>
          Ny produkt
        </button>
      </div>

      {message && <p className="notice notice-success">{message}</p>}
      {error && <p className="notice notice-error">{error}</p>}
      {!products && !error && <div className="skeleton" style={{ aspectRatio: 'auto', height: 200 }} />}
      <label className="checkbox" style={{ marginBottom: 16 }}><input type="checkbox" checked={onlyBargains} onChange={event => setOnlyBargains(event.target.checked)} />Visa endast Fyndhörnan</label>

      <div className="stack" style={{ gap: 10 }}>
        {products?.filter(product => !onlyBargains || (product.discountPercent ?? 0) > 0).map((product) => (
          <div className="admin-row" key={product.id}>
            <div className="admin-row-art">
              <ProductImage product={product} />
            </div>
            <div className="admin-row-main">
              <strong>{product.name}</strong>
              {product.articleNumber && <span className="dim">Grundnummer: {product.articleNumber}</span>}
              {!!product.articles?.length && <details><summary>Artikelnummer för {product.articles.length} utföranden</summary><ul>{product.articles.map(article => <li key={article.articleNumber}><strong>{article.articleNumber}</strong> · {article.color}{article.size ? ` · ${product.sizes?.find(size => size.id === article.size)?.name ?? article.size}` : ''}</li>)}</ul></details>}
              <span className="dim">
                {product.material.toUpperCase()} {product.finish} ·{' '}
                {categories.find((category) => category.id === product.category)?.name ??
                  product.category}
              </span>
            </div>
            <div className="admin-row-meta">
              <span className="badge">{product.stock} i lager</span>
              {product.published === false && <span className="badge badge-warn">Utkast</span>}
              {product.featured && <span className="badge badge-accent">Utvald</span>}
              {(product.discountPercent ?? 0) > 0 && <span className="badge badge-accent">Fyndhörnan · −{product.discountPercent} %</span>}
              <ProductPrice product={product} />
            </div>
            <div className="admin-row-actions">
              {confirmDelete === product.id ? (
                <>
                  <span className="dim" style={{ fontSize: '0.84rem' }}>
                    Ta bort?
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => void remove(product)}
                  >
                    Ja, ta bort
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Avbryt
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(product)}>
                    Redigera
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => {
                    startEdit(product);
                    setEditing({ id: product.id, draft: { ...toDraft(product), discountPercent: product.discountPercent || 20 } });
                  }}>Fyndhörnan</button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => setConfirmDelete(product.id)}
                  >
                    Ta bort
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
