import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ContentManager } from '../components/admin/ContentManager';
import { Dashboard } from '../components/admin/Dashboard';
import { DiscountManager } from '../components/admin/DiscountManager';
import { OrderManager } from '../components/admin/OrderManager';
import { ProductionQueue } from '../components/admin/ProductionQueue';
import { ReviewManager } from '../components/admin/ReviewManager';
import { ProductManager } from '../components/admin/ProductManager';
import { CategoryManager } from '../components/admin/CategoryManager';
import { MaterialManager } from '../components/admin/MaterialManager';
import { CatalogTransfer } from '../components/admin/CatalogTransfer';
import { HistoryView } from '../components/admin/HistoryView';
import { UserManager } from '../components/admin/UserManager';
import {
  ApiError,
  adminLogin,
  adminLogout,
  fetchAdminCategories,
  fetchAdminMaterials,
  fetchAdminMe,
  fetchAdminStatus,
} from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { roleLabels } from '../types';
import type { Actor, Category, Material, Permission } from '../types';
import { useDocumentMeta } from '../lib/meta';

const STORAGE_KEY = 'formlabb.admin.token';

type Tab =
  | 'oversikt'
  | 'startsida'
  | 'ordrar'
  | 'produktion'
  | 'produkter'
  | 'kategorier'
  | 'material'
  | 'omdomen'
  | 'rabatter'
  | 'import'
  | 'historik'
  | 'anvandare';

/**
 * Flikarna och vad som krävs för att se dem. `null` betyder att det räcker att
 * vara inloggad – historiken är öppen för alla, för den är hela poängen med att
 * veta vem som gjorde vad.
 */
const tabs: Array<{ id: Tab; label: string; needs: Permission | null }> = [
  { id: 'oversikt', label: 'Översikt', needs: 'statistik' },
  { id: 'startsida', label: 'Startsida', needs: 'innehall' },
  { id: 'ordrar', label: 'Ordrar', needs: 'ordrar' },
  { id: 'produktion', label: 'Produktion', needs: 'produktion' },
  { id: 'produkter', label: 'Produkter', needs: 'katalog' },
  { id: 'kategorier', label: 'Kategorier', needs: 'katalog' },
  { id: 'material', label: 'Material', needs: 'katalog' },
  { id: 'omdomen', label: 'Omdömen', needs: 'innehall' },
  { id: 'rabatter', label: 'Rabatter', needs: 'innehall' },
  { id: 'import', label: 'Import/export', needs: 'katalog' },
  { id: 'historik', label: 'Historik', needs: null },
  { id: 'anvandare', label: 'Användare', needs: 'anvandare' },
];

function readToken(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Verkstadens panel. Token ligger i sessionStorage, så den försvinner när
 * fliken stängs; vem den hör till och vad den får göra avgör servern, och
 * panelen frågar efter det vid varje inloggning.
 */
export function AdminPage() {
  useDocumentMeta({
    title: 'Verkstaden',
    description: 'Panelen för ordrar, katalog och omdömen.',
    noindex: true,
  });
  const status = useAsync(() => fetchAdminStatus(), []);
  const [token, setToken] = useState(readToken);
  const [me, setMe] = useState<Actor | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [useKey, setUseKey] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('oversikt');
  const [categories, setCategories] = useState<Category[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  const forget = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Token försvinner ändå vid omladdning.
    }
    setToken('');
    setMe(null);
    setPermissions([]);
    setCategories([]);
    setMaterials([]);
  }, []);

  const remember = useCallback((value: string) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Utan lagring lever token i minnet under sidans livstid.
    }
    setToken(value);
  }, []);

  // Vem är inne? Svaret kommer från servern, inte från vad panelen tror.
  useEffect(() => {
    if (!token) return;
    let current = true;
    void (async () => {
      try {
        const result = await fetchAdminMe(token);
        if (!current) return;
        setMe(result.user);
        setPermissions(result.permissions);
        setSignInError(null);
      } catch (caught) {
        if (!current) return;
        setSignInError(caught instanceof ApiError ? caught.message : 'Inloggningen gäller inte.');
        forget();
      }
    })();
    return () => {
      current = false;
    };
  }, [token, forget]);

  // Kategorier och material behövs i produktformuläret och hämtas en nivå upp.
  const loadCategories = useCallback(async () => {
    if (!token || !permissions.includes('katalog')) return;
    try {
      const [categoryResult, materialResult] = await Promise.all([
        fetchAdminCategories(token),
        fetchAdminMaterials(token),
      ]);
      setCategories(categoryResult.categories);
      setMaterials(materialResult.materials);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setSignInError(caught.message);
        forget();
      }
    }
  }, [token, permissions, forget]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // Första fliken man får se är den första man faktiskt har behörighet till.
  const visible = tabs.filter((entry) => entry.needs === null || permissions.includes(entry.needs));
  useEffect(() => {
    if (visible.length === 0) return;
    if (!visible.some((entry) => entry.id === tab)) setTab(visible[0]!.id);
  }, [visible, tab]);

  async function signOut() {
    const current = token;
    forget();
    try {
      await adminLogout(current);
    } catch {
      // Sessionen är borta här hur som helst; servern städar den vid utgång.
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSignInError(null);
    try {
      if (useKey) {
        // Startnyckeln är ingen inloggning: den prövas direkt mot /admin/me.
        const value = key.trim();
        await fetchAdminMe(value);
        remember(value);
        setKey('');
      } else {
        const session = await adminLogin(email.trim(), password);
        remember(session.token);
        setMe(session.user);
        setPermissions(session.permissions);
        setPassword('');
      }
    } catch (caught) {
      setSignInError(
        caught instanceof ApiError ? caught.message : 'Inloggningen gick inte igenom.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (status.data && !status.data.enabled) {
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Adminläget är avstängt"
          text="Servern startades utan ADMIN_TOKEN och har inga användare, så den här vyn är inte tillgänglig."
        />
        <section className="section">
          <div className="container receipt">
            <div className="panel">
              <p className="muted" style={{ marginBottom: 0 }}>
                Sätt en startnyckel på minst 16 tecken i <code>ADMIN_TOKEN</code> och starta om
                servern. Logga in med nyckeln, skapa den första ägaren – då slutar nyckeln gälla och
                det är personer som loggar in i stället.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (!token || !me) {
    const bootstrap = status.data?.bootstrap === true;
    return (
      <>
        <PageHeader
          eyebrow="Verkstaden"
          title="Logga in"
          text={
            bootstrap
              ? 'Det finns inga användare ännu. Logga in med startnyckeln och skapa den första ägaren.'
              : 'Logga in med din mejladress för att se ordrar och sortiment.'
          }
        />
        <section className="section">
          <div className="container receipt">
            <form className="panel" onSubmit={signIn}>
              {useKey ? (
                <div className="field">
                  <label htmlFor="adminKey">Startnyckel</label>
                  <input
                    id="adminKey"
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <span className="field-hint">
                    Nyckeln ur <code>ADMIN_TOKEN</code>. Den slutar gälla så fort den första
                    användaren finns.
                  </span>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="adminEmail">Mejladress</label>
                    <input
                      id="adminEmail"
                      className="input"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="field" style={{ marginTop: 14 }}>
                    <label htmlFor="adminPassword">Lösenord</label>
                    <input
                      id="adminPassword"
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </>
              )}

              {signInError && (
                <p className="notice notice-error" style={{ marginTop: 14 }}>
                  {signInError}
                </p>
              )}

              <div className="row" style={{ marginTop: 16 }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={busy || (useKey ? !key.trim() : !email.trim() || !password)}
                >
                  {busy ? 'Loggar in…' : 'Logga in'}
                </button>
                {bootstrap && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setUseKey(!useKey);
                      setSignInError(null);
                    }}
                  >
                    {useKey ? 'Logga in med mejladress' : 'Använd startnyckeln'}
                  </button>
                )}
              </div>
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
        text={`Inloggad som ${me.name} · ${roleLabels[me.role]}`}
        aside={
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Logga ut
          </button>
        }
      />

      <section className="section">
        <div className="container">
          <div className="admin-tabs" role="tablist" aria-label="Adminvyer">
            {visible.map((entry) => (
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
          {tab === 'startsida' && <ContentManager token={token} />}
          {tab === 'ordrar' && <OrderManager token={token} onUnauthorized={forget} />}
          {tab === 'produktion' && <ProductionQueue token={token} />}
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
          {tab === 'rabatter' && <DiscountManager token={token} />}
          {tab === 'import' && (
            <CatalogTransfer token={token} onImported={() => void loadCategories()} />
          )}
          {tab === 'historik' && <HistoryView token={token} />}
          {tab === 'anvandare' && <UserManager token={token} me={me} />}
        </div>
      </section>
    </>
  );
}
