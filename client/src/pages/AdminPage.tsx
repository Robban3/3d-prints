import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { OrderManager } from '../components/admin/OrderManager';
import { ProductManager } from '../components/admin/ProductManager';
import { CategoryManager } from '../components/admin/CategoryManager';
import { MaterialManager } from '../components/admin/MaterialManager';
import { CatalogTransfer } from '../components/admin/CatalogTransfer';
import { HistoryView } from '../components/admin/HistoryView';
import { ThemeManager } from '../components/admin/ThemeManager';
import { AdminSignIn } from '../components/admin/AdminSignIn';
import { PrintFileLibrary } from '../components/admin/PrintFileLibrary';
import { PrivacyManager } from '../components/admin/PrivacyManager';
import { ApiError, adminLogout, fetchAdminCategories, fetchAdminMaterials, fetchAdminStatus } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { Category, Material } from '../types';

const STORAGE_KEY = 'formlabb.admin.token';

type Tab = 'oversikt' | 'ordrar' | 'produkter' | 'filer' | 'kategorier' | 'material' | 'import' | 'historik' | 'teman' | 'gdpr';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'oversikt', label: 'Översikt' },
  { id: 'ordrar', label: 'Ordrar' },
  { id: 'produkter', label: 'Produkter' },
  { id: 'filer', label: 'Printfiler' },
  { id: 'gdpr', label: 'GDPR' },
  { id: 'kategorier', label: 'Kategorier' },
  { id: 'material', label: 'Material' },
  { id: 'import', label: 'Import/export' },
  { id: 'historik', label: 'Historik' },
  { id: 'teman', label: 'Design & teman' },
];

/**
 * Verkstadens panel använder en HttpOnly-sessionscookie. En äldre nyckel
 * kan återanvändas för första kontoaktiveringen och tas sedan bort.
 */
export function AdminPage() {
  const [authRevision, setAuthRevision] = useState(0);
  const status = useAsync(() => fetchAdminStatus(), [authRevision]);
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [signInError, setSignInError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tab: Tab = tabs.find((entry) => entry.id === params.get('vy'))?.id ?? 'oversikt';
  function setTab(next: Tab) {
    const updated = new URLSearchParams(params);
    updated.set('vy', next);
    setParams(updated, { replace: true });
  }
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

  async function signOut() {
    try { await adminLogout(); } catch { setSignInError('Kunde inte logga ut. Kontrollera anslutningen och försök igen.'); return; }
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nyckeln försvinner ändå vid omladdning.
    }
    setToken('');
    setAuthRevision(value => value + 1);
    setCategories([]);
    setMaterials([]);
  }

  function signedIn() {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Inloggningen använder cookie. */ }
    setToken('session');
    setSignInError(null);
    setAuthRevision(value => value + 1);
  }

  useEffect(() => {
    if (status.data?.authenticated) setToken('session');
  }, [status.data]);

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

  if (status.loading && !status.data) return <section className="section container"><p role="status">Hämtar inloggning…</p></section>;
  if (status.error && !status.data) return <section className="section container"><p className="notice notice-error" role="alert">{status.error}</p></section>;
  if (status.data && (!status.data.passwordConfigured || !token || window.location.hash.includes('aterstall='))) {
    return <AdminSignIn email={status.data.email} setup={!status.data.passwordConfigured} bootstrapKey={token} recoveryByEmail={status.data.recoveryByEmail} onSignedIn={signedIn} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Verkstaden"
        title="Adminpanel"
        text="Hantera ordrar, sortiment och kategorier."
        aside={
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Logga ut
          </button>
        }
      />

      {signInError && <p className="container notice notice-error" role="alert">{signInError}</p>}
      <section className="section admin-section">
        <div className="container admin-layout">
          <aside className="admin-sidebar" aria-label="Adminmeny">
            <span className="admin-sidebar-title">Verkstaden</span>
            <nav className="admin-sidebar-nav" aria-label="Adminvyer">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={tab === entry.id ? 'page' : undefined}
                className={`admin-sidebar-link${tab === entry.id ? ' is-active' : ''}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
            </nav>
            <Link className="admin-sidebar-shop" to="/">← Till webbutiken</Link>
          </aside>

          <div className="admin-content">

          {tab === 'ordrar' && <OrderManager token={token} onUnauthorized={signOut} />}
          {tab === 'oversikt' && <OrderManager token={token} onUnauthorized={signOut} overview />}
          {tab === 'filer' && <PrintFileLibrary token={token} />}
          {tab === 'gdpr' && <PrivacyManager token={token} />}
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
          {tab === 'import' && (
            <CatalogTransfer token={token} onImported={() => void loadCategories()} />
          )}
          {tab === 'historik' && <HistoryView token={token} />}
          {tab === 'teman' && <ThemeManager token={token} onUnauthorized={signOut} />}
          </div>
        </div>
      </section>
    </>
  );
}
