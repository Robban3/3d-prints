import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ContentError,
  DEFAULT_CAMPAIGNS,
  DEFAULT_HERO,
  findCampaign,
  homeContent,
  moveCampaign,
  parseCampaignInput,
  parseHeroInput,
  parseHref,
  parseMedia,
  publicHomeContent,
  removeCampaign,
  resetContent,
  saveCampaign,
  saveHero,
} from '../src/content.ts';
import { generateUploadId, writeMeta } from '../src/uploads.ts';

let dir: string;
const previousContent = process.env.CONTENT_STORE;
const previousUploads = process.env.UPLOAD_DIR;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-innehall-'));
  process.env.CONTENT_STORE = join(dir, 'startsida.json');
  process.env.UPLOAD_DIR = join(dir, 'uploads');
  // Skriver filen, så testerna utgår från en butik som redan sparat sitt
  // innehåll. Kampanjen som följer med bygget testas för sig.
  await resetContent();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (previousContent === undefined) delete process.env.CONTENT_STORE;
  else process.env.CONTENT_STORE = previousContent;
  if (previousUploads === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previousUploads;
});

/** Lägger upp en fil i uppladdningskatalogen och svarar med dess id. */
async function upload(extension: string, kind: 'image' | 'video'): Promise<string> {
  const id = generateUploadId();
  await writeMeta({
    id,
    kind,
    originalName: `hero${extension}`,
    extension,
    size: 1024,
    createdAt: new Date().toISOString(),
    claimedBy: null,
  });
  return id;
}

const heroInput = {
  title: 'Printat i Sverige',
  text: 'Egna produkter och dina egna filer, printade på beställning.',
  primary: { label: 'Till butiken', href: '/produkter' },
};

const campaignInput = {
  title: 'Höstkampanj',
  text: '20 % på allt i oktober.',
};

describe('parseHref', () => {
  it('släpper igenom interna sökvägar', () => {
    assert.equal(parseHref('/produkter'), '/produkter');
    assert.equal(parseHref('/produkter?kategori=kok'), '/produkter?kategori=kok');
  });

  it('släpper igenom https-adresser', () => {
    assert.equal(parseHref('https://formlabb.se/kampanj'), 'https://formlabb.se/kampanj');
  });

  it('avvisar javascript: och data:', () => {
    // En adminredigerbar länk är annars en väg in för skript på sidan.
    assert.equal(parseHref('javascript:alert(1)'), undefined);
    assert.equal(parseHref('JavaScript:alert(1)'), undefined);
    assert.equal(parseHref('data:text/html,<script>'), undefined);
  });

  it('avvisar http och protokollrelativa adresser', () => {
    assert.equal(parseHref('http://formlabb.se'), undefined);
    assert.equal(parseHref('//evil.example'), undefined);
  });

  it('avvisar tomma värden', () => {
    assert.equal(parseHref(''), undefined);
    assert.equal(parseHref('   '), undefined);
    assert.equal(parseHref(undefined), undefined);
  });
});

describe('standardinnehåll', () => {
  it('ger samma text som stod i koden innan heron blev redigerbar', async () => {
    const content = await homeContent();
    assert.equal(content.hero.title, DEFAULT_HERO.title);
    assert.equal(content.hero.primary.href, '/produkter');
    assert.deepEqual(content.campaigns, []);
  });

  it('fyller i saknade fält från standarden när filen är ofullständig', async () => {
    await writeFile(process.env.CONTENT_STORE!, JSON.stringify({ hero: { title: 'Bara titel' } }));
    const content = await homeContent();
    assert.equal(content.hero.title, 'Bara titel');
    assert.equal(content.hero.primary.label, DEFAULT_HERO.primary.label);
  });

  it('tål en trasig fil', async () => {
    await writeFile(process.env.CONTENT_STORE!, 'det här är inte json');
    assert.equal((await homeContent()).hero.title, DEFAULT_HERO.title);
  });
});

describe('parseHeroInput', () => {
  it('tar emot rubrik, text och knapp', async () => {
    const hero = await parseHeroInput(heroInput);
    assert.equal(hero.title, 'Printat i Sverige');
    assert.equal(hero.primary.href, '/produkter');
    assert.equal(hero.autoplay, true);
    assert.equal('media' in hero, false);
  });

  it('kräver rubrik och text', async () => {
    await assert.rejects(() => parseHeroInput({ ...heroInput, title: '' }), ContentError);
    await assert.rejects(() => parseHeroInput({ ...heroInput, text: 'kort' }), ContentError);
  });

  it('kräver en huvudknapp som går någonstans', async () => {
    await assert.rejects(() => parseHeroInput({ ...heroInput, primary: {} }), ContentError);
    await assert.rejects(
      () => parseHeroInput({ ...heroInput, primary: { label: 'Klicka', href: 'javascript:1' } }),
      (error: unknown) => {
        assert.ok(error instanceof ContentError);
        assert.match(error.fields.primary!, /intern sökväg/);
        return true;
      },
    );
  });

  it('låter den andra knappen vara tom', async () => {
    const hero = await parseHeroInput({ ...heroInput, secondary: { label: '', href: '' } });
    assert.equal('secondary' in hero, false);
  });

  it('bygger mediets adress av dess id, inte av det klienten skickar', async () => {
    const id = await upload('.mp4', 'video');
    const hero = await parseHeroInput({
      ...heroInput,
      media: { id, url: 'https://evil.example/sno.mp4', kind: 'image' },
    });
    assert.equal(hero.media?.url, `/api/uploads/${id}`);
    // Typen läses ur filändelsen, inte ur det som påstås.
    assert.equal(hero.media?.kind, 'video');
  });

  it('avvisar media som inte finns', async () => {
    await assert.rejects(
      () => parseHeroInput({ ...heroInput, media: { id: 'a'.repeat(32) } }),
      (error: unknown) => {
        assert.ok(error instanceof ContentError);
        assert.match(error.fields.media!, /hittar inte/);
        return true;
      },
    );
  });

  it('tar emot en bild som hero', async () => {
    const id = await upload('.webp', 'image');
    const hero = await parseHeroInput({ ...heroInput, media: { id } });
    assert.equal(hero.media?.kind, 'image');
  });

  it('kräver att stillbilden är en bild', async () => {
    const video = await upload('.mp4', 'video');
    const posterVideo = await upload('.webm', 'video');
    await assert.rejects(
      () => parseHeroInput({ ...heroInput, media: { id: video }, poster: { id: posterVideo } }),
      ContentError,
    );
  });

  it('tar bara emot en stillbild tillsammans med en video', async () => {
    const image = await upload('.png', 'image');
    const poster = await upload('.jpg', 'image');
    await assert.rejects(
      () => parseHeroInput({ ...heroInput, media: { id: image }, poster: { id: poster } }),
      (error: unknown) => {
        assert.ok(error instanceof ContentError);
        assert.match(error.fields.poster!, /tillsammans med en video/);
        return true;
      },
    );
  });

  it('tar emot video med stillbild', async () => {
    const video = await upload('.mp4', 'video');
    const poster = await upload('.jpg', 'image');
    const hero = await parseHeroInput({
      ...heroInput,
      media: { id: video },
      poster: { id: poster },
      autoplay: false,
    });
    assert.equal(hero.media?.kind, 'video');
    assert.equal(hero.poster?.kind, 'image');
    assert.equal(hero.autoplay, false);
  });

  it('sparar och läser tillbaka heron', async () => {
    await saveHero(await parseHeroInput(heroInput));
    assert.equal((await homeContent()).hero.title, 'Printat i Sverige');
  });
});

describe('kampanjer', () => {
  it('skapar en kampanj med ett eget id', async () => {
    const campaign = await parseCampaignInput(campaignInput);
    assert.ok(campaign.id.length > 10);
    assert.equal(campaign.layout, 'banner');
    assert.equal(campaign.active, true);
    assert.equal(campaign.order, 0);
  });

  it('behåller id och ordning när en kampanj ändras', async () => {
    const first = await parseCampaignInput(campaignInput);
    const updated = await parseCampaignInput(
      { ...campaignInput, title: 'Nytt namn' },
      {
        ...first,
        order: 3,
      },
    );
    assert.equal(updated.id, first.id);
    assert.equal(updated.order, 3);
  });

  it('kräver rubrik och text', async () => {
    await assert.rejects(() => parseCampaignInput({ ...campaignInput, title: '' }), ContentError);
    await assert.rejects(() => parseCampaignInput({ ...campaignInput, text: '' }), ContentError);
  });

  it('normaliserar rabattkoden', async () => {
    const campaign = await parseCampaignInput({ ...campaignInput, discountCode: ' host 20 ' });
    assert.equal(campaign.discountCode, 'HOST20');
  });

  it('kräver ett giltigt fönster', async () => {
    await assert.rejects(
      () => parseCampaignInput({ ...campaignInput, startsAt: '2026-12-01', endsAt: '2026-11-01' }),
      ContentError,
    );
  });

  it('sparar, hittar och tar bort', async () => {
    const campaign = await saveCampaign(await parseCampaignInput(campaignInput));
    assert.equal((await findCampaign(campaign.id))?.title, 'Höstkampanj');
    assert.equal((await removeCampaign(campaign.id))?.id, campaign.id);
    assert.equal(await findCampaign(campaign.id), undefined);
    assert.equal(await removeCampaign(campaign.id), undefined);
  });

  it('skriver över en kampanj i stället för att lägga till en till', async () => {
    const campaign = await saveCampaign(await parseCampaignInput(campaignInput));
    await saveCampaign({ ...campaign, title: 'Ändrad' });
    const content = await homeContent();
    assert.equal(content.campaigns.length, 1);
    assert.equal(content.campaigns[0]!.title, 'Ändrad');
  });
});

describe('publicHomeContent', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');

  async function add(over: Record<string, unknown>) {
    return saveCampaign(await parseCampaignInput({ ...campaignInput, ...over }));
  }

  it('visar bara aktiva kampanjer', async () => {
    await add({ title: 'Syns' });
    await add({ title: 'Avstängd', active: false });
    const campaigns = (await publicHomeContent(now)).campaigns;
    assert.deepEqual(
      campaigns.map((campaign) => campaign.title),
      ['Syns'],
    );
  });

  it('håller schemalagda kampanjer borta tills de börjar', async () => {
    await add({ title: 'Senare', startsAt: '2026-11-01' });
    assert.deepEqual((await publicHomeContent(now)).campaigns, []);
  });

  it('plockar bort kampanjer som gått ut', async () => {
    await add({ title: 'Förr', endsAt: '2026-09-01' });
    assert.deepEqual((await publicHomeContent(now)).campaigns, []);
  });

  it('visar en kampanj inom sitt fönster', async () => {
    await add({ title: 'Nu', startsAt: '2026-10-01', endsAt: '2026-10-31' });
    assert.equal((await publicHomeContent(now)).campaigns.length, 1);
  });

  it('sorterar efter ordning', async () => {
    await add({ title: 'Andra', order: 2 });
    await add({ title: 'Första', order: 1 });
    assert.deepEqual(
      (await publicHomeContent(now)).campaigns.map((campaign) => campaign.title),
      ['Första', 'Andra'],
    );
  });

  it('tar med heron även utan kampanjer', async () => {
    assert.equal((await publicHomeContent(now)).hero.title, DEFAULT_HERO.title);
  });
});

describe('moveCampaign', () => {
  async function three() {
    const a = await saveCampaign(
      await parseCampaignInput({ ...campaignInput, title: 'Kampanj A', order: 0 }),
    );
    const b = await saveCampaign(
      await parseCampaignInput({ ...campaignInput, title: 'Kampanj B', order: 1 }),
    );
    const c = await saveCampaign(
      await parseCampaignInput({ ...campaignInput, title: 'Kampanj C', order: 2 }),
    );
    return { a, b, c };
  }

  it('flyttar en kampanj uppåt', async () => {
    const { b } = await three();
    const campaigns = await moveCampaign(b.id, -1);
    assert.deepEqual(
      campaigns.map((campaign) => campaign.title),
      ['Kampanj B', 'Kampanj A', 'Kampanj C'],
    );
  });

  it('flyttar en kampanj nedåt', async () => {
    const { a } = await three();
    const campaigns = await moveCampaign(a.id, 1);
    assert.deepEqual(
      campaigns.map((campaign) => campaign.title),
      ['Kampanj B', 'Kampanj A', 'Kampanj C'],
    );
  });

  it('skriver om ordningstalen till en tät följd', async () => {
    const { c } = await three();
    const campaigns = await moveCampaign(c.id, -1);
    assert.deepEqual(
      campaigns.map((campaign) => campaign.order),
      [0, 1, 2],
    );
  });

  it('gör ingenting i kanterna', async () => {
    const { a, c } = await three();
    assert.equal((await moveCampaign(a.id, -1)).length, 3);
    assert.equal((await moveCampaign(c.id, 1)).length, 3);
    const titles = (await homeContent()).campaigns
      .sort((x, y) => x.order - y.order)
      .map((campaign) => campaign.title);
    assert.deepEqual(titles, ['Kampanj A', 'Kampanj B', 'Kampanj C']);
  });

  it('tål ett id som inte finns', async () => {
    await three();
    assert.equal((await moveCampaign('finns-inte', 1)).length, 3);
  });
});

describe('kampanjen som följer med', () => {
  it('finns innan någon rört startsidan', async () => {
    // Ingen innehållsfil alls: det är då utgångsvärdena gäller.
    process.env.CONTENT_STORE = join(dir, 'finns-inte', 'startsida.json');
    const content = await publicHomeContent(new Date('2026-10-10T12:00:00.000Z'));
    assert.equal(content.campaigns.length, 1);
    assert.equal(content.campaigns[0]!.eyebrow, 'Julkollektionen');
    assert.equal(content.campaigns[0]!.title, 'En jul med personlig prägel');
    assert.match(content.campaigns[0]!.cta?.href ?? '', /^\/produkter\?kategori=/);
  });

  it('kommer inte tillbaka när butiken tagit bort den', async () => {
    const campaign = await saveCampaign(await parseCampaignInput(campaignInput));
    await removeCampaign(campaign.id);
    // En tom lista är ett val, inte ett saknat värde.
    assert.deepEqual((await homeContent()).campaigns, []);
  });

  it('överlever en rundtur genom valideringen', async () => {
    const seeded = DEFAULT_CAMPAIGNS[0]!;
    const saved = await parseCampaignInput(seeded, seeded);
    assert.equal(saved.media?.url, '/kampanjer/julkollektionen.jpg');
    assert.equal(saved.media?.kind, 'image');
    assert.equal(saved.eyebrow, 'Julkollektionen');
  });
});

describe('media som följer med bygget', () => {
  it('godtar en intern bildsökväg utan uppladdnings-id', async () => {
    const media = await parseMedia({ id: '', url: '/kampanjer/jul.jpg' });
    assert.equal(media?.kind, 'image');
    assert.equal(media?.id, '');
    assert.equal(media?.fileName, 'jul.jpg');
  });

  it('läser typen ur filändelsen', async () => {
    assert.equal((await parseMedia({ id: '', url: '/kampanjer/loop.mp4' }))?.kind, 'video');
  });

  it('avvisar adresser som pekar bort från butiken', async () => {
    for (const url of [
      '//evil.example/x.jpg',
      'https://evil.example/x.jpg',
      'javascript:alert(1)',
      '/../../etc/passwd.jpg',
    ]) {
      assert.equal(await parseMedia({ id: '', url }), undefined, url);
    }
  });

  it('avvisar uppladdningarnas eget område, som kräver id', async () => {
    assert.equal(await parseMedia({ id: '', url: '/api/uploads/abc' }), undefined);
  });

  it('avvisar format vi inte visar', async () => {
    assert.equal(await parseMedia({ id: '', url: '/kampanjer/skript.svg' }), undefined);
    assert.equal(await parseMedia({ id: '', url: '/kampanjer/fil.pdf' }), undefined);
  });

  it('svarar undefined för tom adress och tomt id', async () => {
    assert.equal(await parseMedia({ id: '', url: '' }), undefined);
    assert.equal(await parseMedia({}), undefined);
  });
});
