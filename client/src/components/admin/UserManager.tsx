import { useCallback, useEffect, useState } from 'react';
import { ApiError, createUser, deleteUser, fetchUsers, updateUser } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { roleLabels } from '../../types';
import type { Actor, Permission, Role, User } from '../../types';

/**
 * Användare och roller. Bara ägaren kommer hit.
 *
 * Rollerna är få med flit: tre som betyder något är lättare att förvalta än
 * tjugo kryssrutor som ingen orkar hålla rätt på. Vad varje roll får göra
 * kommer från servern, så listan här kan inte påstå något annat än sanningen.
 */

const ROLE_ORDER: Role[] = ['agare', 'verkstad', 'redaktor'];

const permissionLabels: Record<Permission, string> = {
  ordrar: 'Ordrar',
  produktion: 'Produktion',
  katalog: 'Katalog',
  innehall: 'Innehåll',
  statistik: 'Statistik',
  anvandare: 'Användare',
};

interface Draft {
  email: string;
  name: string;
  role: Role;
  password: string;
}

const blank: Draft = { email: '', name: '', role: 'verkstad', password: '' };

export function UserManager({ token, me }: { token: string; me: Actor }) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Record<Role, Permission[]> | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<User | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsers(token);
      setUsers(data.users);
      setRoles(data.roles);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Användarna kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setDraft(blank);
    setEditing(null);
    setErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      if (editing) {
        await updateUser(token, editing.id, {
          name: draft.name,
          role: draft.role,
          // Ett tomt fält betyder att lösenordet lämnas som det är.
          ...(draft.password ? { password: draft.password } : {}),
        });
      } else {
        await createUser(token, draft);
      }
      reset();
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Användaren kunde inte sparas.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    setBusy(true);
    setMessage('');
    try {
      await updateUser(token, user.id, { active: !user.active });
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Ändringen gick inte igenom.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: User) {
    if (!window.confirm(`Ta bort ${user.name}? Kontot går inte att få tillbaka.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await deleteUser(token, user.id);
      if (editing?.id === user.id) reset();
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Kontot kunde inte tas bort.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      {message && <p className="notice notice-error">{message}</p>}

      {me.key && (
        <p className="notice">
          Du är inloggad med startnyckeln. Skapa en ägare här – så fort det finns en användare
          slutar nyckeln fungera, och då är det personer som loggar in, inte en delad hemlighet.
        </p>
      )}

      {loading && <div className="skeleton" style={{ height: 160 }} />}

      {users.map((user) => (
        <div className="admin-row" key={user.id}>
          <div className="queue-printer">
            <span className="stat-label">{roleLabels[user.role]}</span>
          </div>
          <div className="admin-row-main">
            <strong>
              {user.name}
              {user.id === me.id ? ' (du)' : ''}
            </strong>
            <span className="dim">{user.email}</span>
            <span className="dim">
              Skapad {formatDate(user.createdAt)}
              {user.lastLoginAt
                ? ` · senast inne ${formatDate(user.lastLoginAt)}`
                : ' · aldrig inne'}
            </span>
          </div>
          <div className="admin-row-meta">
            {user.active ? (
              <span className="badge badge-accent">Aktiv</span>
            ) : (
              <span className="badge badge-warn">Avstängd</span>
            )}
          </div>
          <div className="admin-row-actions">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                setEditing(user);
                setDraft({ email: user.email, name: user.name, role: user.role, password: '' });
                setErrors({});
              }}
            >
              Ändra
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={busy}
              onClick={() => void toggleActive(user)}
            >
              {user.active ? 'Stäng av' : 'Släpp in'}
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={busy || user.id === me.id}
              onClick={() => void remove(user)}
            >
              Ta bort
            </button>
          </div>
        </div>
      ))}

      <form className="panel" onSubmit={submit} noValidate>
        <h3 style={{ marginTop: 0 }}>{editing ? `Ändra ${editing.name}` : 'Ny användare'}</h3>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="anvandare-namn">Namn</label>
            <input
              id="anvandare-namn"
              className="input"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {errors.name && <span className="error">{errors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="anvandare-mejl">Mejladress</label>
            <input
              id="anvandare-mejl"
              className="input"
              type="email"
              autoComplete="off"
              // Adressen är kontots identitet och ligger fast efteråt.
              disabled={editing !== null}
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
            {errors.email && <span className="error">{errors.email}</span>}
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="anvandare-roll">Roll</label>
            <select
              id="anvandare-roll"
              className="input"
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {roles
                ? `Får: ${roles[draft.role].map((entry) => permissionLabels[entry]).join(', ')}`
                : ' '}
            </span>
            {errors.role && <span className="error">{errors.role}</span>}
          </div>

          <div className="field">
            <label htmlFor="anvandare-losenord">Lösenord</label>
            <input
              id="anvandare-losenord"
              className="input"
              type="password"
              autoComplete="new-password"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
            />
            <span className="field-hint">
              {editing
                ? 'Lämna tomt för att behålla det nuvarande. Ett nytt loggar ut personens sessioner.'
                : 'Minst 12 tecken. Längd hjälper mer än krångliga tecken.'}
            </span>
            {errors.password && <span className="error">{errors.password}</span>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Sparar…' : editing ? 'Spara' : 'Skapa användare'}
          </button>
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>
              Avbryt
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
