import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Dashboard } from '../components/admin/Dashboard';
import { OrderManager } from '../components/admin/OrderManager';
import { ReviewManager } from '../components/admin/ReviewManager';
import { ProductManager } from '../components/admin/ProductManager';
import { CategoryManager } from '../components/admin/CategoryManager';
import { MaterialManager } from '../components/admin/MaterialManager';
import { CatalogTransfer } from '../components/admin/CatalogTransfer';
import { HistoryView } from '../components/admin/HistoryView';
import { ApiError, fetchAdminCategories, fetchAdminMaterials, fetchAdminStatus } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { Category, Material } from '../types';
import { useDocumentMeta } from '../lib/meta';

const STORAGE_KEY = 'formlabb.admin.token';

type Tab =
  | 'oversikt'
  | 'ordrar'
  | 'produkter'
  | 'kategorier'
  | 'material'
  | 'omdomen'
  | 'import'
  | 'historik';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'oversikt', label: 'Översikt' },
  { id: 'ordrar', label: 'Ordrar' },
  { id: 'produkter', label: 'Produkter' },
  { id: 'kategorier', label: 'Kategorier' },
  { id: 'material', label: 'Material' },
  { id: 'omdomen', label: 'Omdömen' },
  { id: 'import', label: 'Import/export' },
  { id: 'historik', label: 'Historik' },
];

/**
 * Verkstadens panel: ordrar, sortiment och kategorier. Nyckeln ligger i
 * sessionStorage, så den försvinner när fliken stängs.
 */
export function AdminPage() {
  useDocumentMeta({
    title: 'Verkstaden',
    description: 'Panelen för ordrar, katalog och omdömen.',
    noindex: true,
  });
  const status = useAsync(() => fetchAdminStatus(), []);
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('oversikt');
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Kategorier och material behövs i produktformuläret och hämtas en nivå upp.
  const loadCategories = useCallback(async () => {
    if (!token) return;
    try {
      const [categoryResult, materialResult] = await Promise.all([
        fetchAdminCategories(token),
        fetchAdminMaterials(token),
      ]);
      setCategories(categoryResult.categories);
      setMaterials(materialResult.materials);
      setSignInError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setSignInError(caught.message);
        signOut();
      }
    }
  }, [token]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function signOut() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nyckeln försvinner ändå vid omladdning.
    }
    setToken('');
    setCategories([]);
    setMaterials([]);
  }

  function signIn(event: React.FormEvent) {
    event.preventDefault();
    const key = input.trim();
    if (!key) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Utan lagring lever nyckeln i minnet under sidans livstid.
    }
    setToken(key);
    setInput('');
  }

  if (status.data && !status.data.enabled) {
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Adminläget är avstängt"
          text="Servern startades utan ADMIN_TOKEN, så den här vyn är inte tillgänglig."
        />
        <section className="section">
          <div className="container receipt">
            <div className="panel">
              <p className="muted" style={{ marginBottom: 0 }}>
                Sätt en nyckel på minst 16 tecken i <code>ADMIN_TOKEN</code> och starta om servern
                för att aktivera panelen.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Logga in"
          text="Ange adminnyckeln för att se ordrar och sortiment."
        />
        <section className="section">
          <div className="container receipt">
            <form className="panel" onSubmit={signIn}>
              <div className="field">
                <label htmlFor="adminToken">Adminnyckel</label>
                <input
                  id="adminToken"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              </div>
              {signInError && (
                <p className="notice notice-error" style={{ marginTop: 14 }}>
                  {signInError}
                </p>
              )}
              <button
                type="submit"
                className="btn"
                style={{ marginTop: 16 }}
                disabled={!input.trim()}
              >
                Logga in
              </button>
            </form>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Verkstaden"
        title="Adminpanel"
        text="Hantera ordrar, sortiment och kategorier."
        aside={
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Logga ut
          </button>
        }
      />

      <section className="section">
        <div className="container">
          <div className="admin-tabs" role="tablist" aria-label="Adminvyer">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className="admin-tab"
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'oversikt' && <Dashboard token={token} />}
          {tab === 'ordrar' && <OrderManager token={token} onUnauthorized={signOut} />}
          {tab === 'produkter' && (
            <ProductManager
              token={token}
              categories={categories}
              materials={materials}
              onChanged={() => void loadCategories()}
            />
          )}
          {tab === 'kategorier' && (
            <CategoryManager token={token} onChanged={() => void loadCategories()} />
          )}
          {tab === 'material' && (
            <MaterialManager token={token} onChanged={() => void loadCategories()} />
          )}
          {tab === 'omdomen' && <ReviewManager token={token} />}
          {tab === 'import' && (
            <CatalogTransfer token={token} onImported={() => void loadCategories()} />
          )}
          {tab === 'historik' && <HistoryView token={token} />}
        </div>
      </section>
    </>
  );
}
