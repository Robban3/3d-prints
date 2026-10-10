import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  deleteCampaign,
  fetchAdminContent,
  moveCampaign,
  saveCampaign,
  saveHero,
} from '../../lib/api';
import { formatDate } from '../../lib/format';
import { MEDIA_LIMIT_HINT, MediaField } from './MediaField';
import type { Campaign, CampaignLayout, HeroContent, Media } from '../../types';

/**
 * Startsidan i panelen: heron och kampanjblocken.
 *
 * Adresserna valideras på servern – interna sökvägar eller https – så ett
 * felaktigt fält kommer tillbaka som ett meddelande här i stället för att
 * sparas.
 */

type HeroDraft = {
  eyebrow: string;
  title: string;
  highlight: string;
  text: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  media?: Media;
  poster?: Media;
  autoplay: boolean;
};

type CampaignDraft = {
  title: string;
  text: string;
  cta: { label: string; href: string };
  media?: Media;
  layout: CampaignLayout;
  discountCode: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

const blankCampaign: CampaignDraft = {
  title: '',
  text: '',
  cta: { label: '', href: '' },
  layout: 'banner',
  discountCode: '',
  startsAt: '',
  endsAt: '',
  active: true,
};

function dayValue(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function heroDraft(hero: HeroContent): HeroDraft {
  return {
    eyebrow: hero.eyebrow,
    title: hero.title,
    highlight: hero.highlight,
    text: hero.text,
    primary: { ...hero.primary },
    secondary: hero.secondary ? { ...hero.secondary } : { label: '', href: '' },
    media: hero.media,
    poster: hero.poster,
    autoplay: hero.autoplay,
  };
}

function campaignDraft(campaign: Campaign): CampaignDraft {
  return {
    title: campaign.title,
    text: campaign.text,
    cta: campaign.cta ? { ...campaign.cta } : { label: '', href: '' },
    media: campaign.media,
    layout: campaign.layout,
    discountCode: campaign.discountCode ?? '',
    startsAt: dayValue(campaign.startsAt),
    endsAt: dayValue(campaign.endsAt),
    active: campaign.active,
  };
}

export function ContentManager({ token }: { token: string }) {
  const [hero, setHero] = useState<HeroDraft | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [draft, setDraft] = useState<CampaignDraft>(blankCampaign);
  const [editing, setEditing] = useState<string | null>(null);
  const [heroErrors, setHeroErrors] = useState<Record<string, string>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const content = await fetchAdminContent(token);
      setHero(heroDraft(content.hero));
      setCampaigns([...content.campaigns].sort((a, b) => a.order - b.order));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Innehållet kunde inte hämtas.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitHero(event: React.FormEvent) {
    event.preventDefault();
    if (!hero) return;
    setBusy(true);
    setHeroErrors({});
    setMessage('');
    setSaved('');
    try {
      await saveHero(token, hero);
      setSaved('Heron är sparad och syns på startsidan.');
    } catch (error) {
      if (error instanceof ApiError) {
        setHeroErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Heron kunde inte sparas.');
      }
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    setDraft(blankCampaign);
    setEditing(null);
    setDraftErrors({});
  }

  async function submitCampaign(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDraftErrors({});
    setMessage('');
    try {
      await saveCampaign(token, draft, editing ?? undefined);
      resetDraft();
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setDraftErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage('Kampanjen kunde inte sparas.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function move(campaign: Campaign, direction: 'upp' | 'ned') {
    setBusy(true);
    try {
      const result = await moveCampaign(token, campaign.id, direction);
      setCampaigns([...result.campaigns].sort((a, b) => a.order - b.order));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Ordningen kunde inte ändras.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(`Ta bort kampanjen "${campaign.title}"?`)) return;
    setBusy(true);
    try {
      await deleteCampaign(token, campaign.id);
      if (editing === campaign.id) resetDraft();
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Kampanjen kunde inte tas bort.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 420 }} />;
  if (!hero) return <p className="notice notice-error">{message || 'Innehållet saknas.'}</p>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      {message && <p className="notice notice-error">{message}</p>}

      <form className="panel" onSubmit={submitHero} noValidate>
        <h3 style={{ marginTop: 0 }}>Heron</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Lämnas mediet tomt ritas den genererade scenen, precis som i dag.
        </p>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="hero-eyebrow">Överrad (valfritt)</label>
            <input
              id="hero-eyebrow"
              className="input"
              value={hero.eyebrow}
              onChange={(event) => setHero({ ...hero, eyebrow: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="hero-title">Rubrik</label>
            <input
              id="hero-title"
              className="input"
              value={hero.title}
              onChange={(event) => setHero({ ...hero, title: event.target.value })}
            />
            {heroErrors.title && <span className="error">{heroErrors.title}</span>}
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="hero-highlight">Rad med accentfärg (valfritt)</label>
          <input
            id="hero-highlight"
            className="input"
            value={hero.highlight}
            onChange={(event) => setHero({ ...hero, highlight: event.target.value })}
          />
          <span className="field-hint">Visas under rubriken i blått. Töm för att dölja den.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="hero-text">Text</label>
          <textarea
            id="hero-text"
            rows={3}
            value={hero.text}
            onChange={(event) => setHero({ ...hero, text: event.target.value })}
          />
          {heroErrors.text && <span className="error">{heroErrors.text}</span>}
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="hero-primary-label">Huvudknapp</label>
            <input
              id="hero-primary-label"
              className="input"
              placeholder="Utforska produkter"
              value={hero.primary.label}
              onChange={(event) =>
                setHero({ ...hero, primary: { ...hero.primary, label: event.target.value } })
              }
            />
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="/produkter"
              value={hero.primary.href}
              onChange={(event) =>
                setHero({ ...hero, primary: { ...hero.primary, href: event.target.value } })
              }
            />
            {heroErrors.primary && <span className="error">{heroErrors.primary}</span>}
          </div>
          <div className="field">
            <label htmlFor="hero-secondary-label">Andra knappen (valfritt)</label>
            <input
              id="hero-secondary-label"
              className="input"
              placeholder="Beställ din egen print"
              value={hero.secondary.label}
              onChange={(event) =>
                setHero({ ...hero, secondary: { ...hero.secondary, label: event.target.value } })
              }
            />
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="/egen-print"
              value={hero.secondary.href}
              onChange={(event) =>
                setHero({ ...hero, secondary: { ...hero.secondary, href: event.target.value } })
              }
            />
            {heroErrors.secondary && <span className="error">{heroErrors.secondary}</span>}
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <MediaField
            label="Bild eller video"
            hint={MEDIA_LIMIT_HINT}
            value={hero.media}
            error={heroErrors.media}
            onChange={(media) =>
              setHero({ ...hero, media, poster: media ? hero.poster : undefined })
            }
          />
          {hero.media?.kind === 'video' && (
            <MediaField
              label="Stillbild bakom videon"
              hint="Visas innan videon börjat spela, och i stället för den vid minskad rörelse."
              imagesOnly
              value={hero.poster}
              error={heroErrors.poster}
              onChange={(poster) => setHero({ ...hero, poster })}
            />
          )}
        </div>

        {hero.media?.kind === 'video' && (
          <label className="checkbox" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={hero.autoplay}
              onChange={(event) => setHero({ ...hero, autoplay: event.target.checked })}
            />
            <span>
              <strong>Spela automatiskt i loop</strong>
              <span>
                Ljudlöst, som en rörlig bakgrund. Besökare som bett om minskad rörelse får
                stillbilden och en spelknapp i stället.
              </span>
            </span>
          </label>
        )}

        {saved && (
          <p className="notice notice-success" style={{ marginTop: 14 }}>
            {saved}
          </p>
        )}

        <button type="submit" className="btn" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? 'Sparar…' : 'Spara heron'}
        </button>
      </form>

      <form className="panel" onSubmit={submitCampaign} noValidate>
        <h3 style={{ marginTop: 0 }}>{editing ? 'Ändra kampanjen' : 'Ny kampanj'}</h3>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="kampanj-rubrik">Rubrik</label>
            <input
              id="kampanj-rubrik"
              className="input"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            {draftErrors.title && <span className="error">{draftErrors.title}</span>}
          </div>
          <div className="field">
            <label htmlFor="kampanj-layout">Placering</label>
            <select
              id="kampanj-layout"
              className="input"
              value={draft.layout}
              onChange={(event) =>
                setDraft({ ...draft, layout: event.target.value as CampaignLayout })
              }
            >
              <option value="banner">Bred banner under heron</option>
              <option value="kort">Kort i raden under kategorierna</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="kampanj-text">Text</label>
          <textarea
            id="kampanj-text"
            rows={2}
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          />
          {draftErrors.text && <span className="error">{draftErrors.text}</span>}
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="kampanj-knapp">Knapp (valfritt)</label>
            <input
              id="kampanj-knapp"
              className="input"
              placeholder="Se kampanjen"
              value={draft.cta.label}
              onChange={(event) =>
                setDraft({ ...draft, cta: { ...draft.cta, label: event.target.value } })
              }
            />
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="/produkter"
              value={draft.cta.href}
              onChange={(event) =>
                setDraft({ ...draft, cta: { ...draft.cta, href: event.target.value } })
              }
            />
            {draftErrors.cta && <span className="error">{draftErrors.cta}</span>}
          </div>
          <div className="field">
            <label htmlFor="kampanj-kod">Rabattkod att visa (valfritt)</label>
            <input
              id="kampanj-kod"
              className="input"
              placeholder="HOST20"
              value={draft.discountCode}
              onChange={(event) =>
                setDraft({ ...draft, discountCode: event.target.value.toUpperCase() })
              }
            />
            <span className="field-hint">
              Skriv koden som finns i fliken Rabatter. Den visas bara – den skapas inte här.
            </span>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="kampanj-start">Visas från (valfritt)</label>
            <input
              id="kampanj-start"
              className="input"
              type="date"
              value={draft.startsAt}
              onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
            />
            {draftErrors.startsAt && <span className="error">{draftErrors.startsAt}</span>}
          </div>
          <div className="field">
            <label htmlFor="kampanj-slut">Visas till (valfritt)</label>
            <input
              id="kampanj-slut"
              className="input"
              type="date"
              value={draft.endsAt}
              onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
            />
            {draftErrors.endsAt && <span className="error">{draftErrors.endsAt}</span>}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <MediaField
            label="Bild eller video (valfritt)"
            value={draft.media}
            error={draftErrors.media}
            onChange={(media) => setDraft({ ...draft, media })}
          />
        </div>

        <label className="checkbox" style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          <span>
            <strong>Aktiv</strong>
            <span>Avstängda kampanjer ligger kvar här men syns inte i butiken.</span>
          </span>
        </label>

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Sparar…' : editing ? 'Spara ändringen' : 'Skapa kampanjen'}
          </button>
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={resetDraft}>
              Avbryt
            </button>
          )}
        </div>
      </form>

      {campaigns.length === 0 ? (
        <p className="muted">Inga kampanjer än.</p>
      ) : (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Kampanjer</h3>
          <ul className="campaign-list">
            {campaigns.map((campaign, index) => (
              <li key={campaign.id}>
                <div className="campaign-list-main">
                  <strong>{campaign.title}</strong>
                  {!campaign.active && <span className="pill pill-off">Avstängd</span>}
                  <span className="pill">{campaign.layout === 'banner' ? 'Banner' : 'Kort'}</span>
                  {campaign.discountCode && <span className="pill">{campaign.discountCode}</span>}
                  <br />
                  <span className="dim" style={{ fontSize: '0.82rem' }}>
                    {campaign.text}
                    {campaign.startsAt && ` · från ${formatDate(campaign.startsAt)}`}
                    {campaign.endsAt && ` · till ${formatDate(campaign.endsAt)}`}
                  </span>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy || index === 0}
                    aria-label={`Flytta ${campaign.title} uppåt`}
                    onClick={() => void move(campaign, 'upp')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy || index === campaigns.length - 1}
                    aria-label={`Flytta ${campaign.title} nedåt`}
                    onClick={() => void move(campaign, 'ned')}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => {
                      setDraft(campaignDraft(campaign));
                      setEditing(campaign.id);
                      setDraftErrors({});
                    }}
                  >
                    Ändra
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy}
                    onClick={() => void remove(campaign)}
                  >
                    Ta bort
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
