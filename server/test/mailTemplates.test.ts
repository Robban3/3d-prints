import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TEMPLATES,
  TemplateError,
  allTemplates,
  placeholders,
  render,
  renderTemplate,
  resetTemplate,
  resetTemplateCache,
  saveTemplate,
  templateFor,
  templateSpec,
  validate,
} from '../src/mailTemplates.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'formlabb-mallar-'));
  process.env.MAIL_TEMPLATE_STORE = join(dir, 'mejlmallar.json');
  resetTemplateCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.MAIL_TEMPLATE_STORE;
  resetTemplateCache();
});

describe('mallarna i koden', () => {
  it('använder bara platshållare de själva räknar upp', () => {
    for (const template of TEMPLATES) {
      const used = [...placeholders(template.subject), ...placeholders(template.body)];
      for (const name of used) {
        assert.ok(
          template.variables.includes(name),
          `${template.id} använder {{${name}}} som inte står i variables`,
        );
      }
    }
  });

  it('har unika id:n', () => {
    const ids = TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('templateSpec hittar rätt och säger nej till resten', () => {
    assert.equal(templateSpec('offert')?.name, 'Sparad offert');
    assert.equal(templateSpec('finns-inte'), undefined);
  });
});

describe('render', () => {
  it('sätter in värdena', () => {
    assert.equal(render('Hej {{kund}}!', { kund: 'Anna' }), 'Hej Anna!');
    assert.equal(render('{{ kund }} och {{kund}}', { kund: 'Bo' }), 'Bo och Bo');
  });

  it('en platshållare utan värde blir tom, inte kvar som klamrar', () => {
    assert.equal(render('Hej {{kund}}!', {}), 'Hej !');
  });

  it('tål svenska tecken i namnet', () => {
    assert.equal(render('{{går}}', { går: 'ja' }), 'ja');
  });

  it('placeholders listar det som används', () => {
    assert.deepEqual(placeholders('{{a}} och {{ b }} men inte { c }'), ['a', 'b']);
  });
});

describe('spara en mall', () => {
  it('ändrad text går ut i brevet', async () => {
    await saveTemplate('status_skickad', {
      subject: 'Paketet är skickat, {{ordernummer}}',
      body: 'Hej {{kund}}, paketet är på väg. Följ det här: {{lank}}',
    });
    const rendered = await renderTemplate('status_skickad', {
      kund: 'Anna',
      ordernummer: 'S-1',
      lank: 'https://exempel.se',
    });
    assert.equal(rendered.subject, 'Paketet är skickat, S-1');
    assert.match(rendered.text, /Hej Anna, paketet är på väg/);
  });

  it('överlever en omstart', async () => {
    await saveTemplate('offert', {
      subject: 'Offert på {{projekt}}',
      body: 'Här kommer offerten på {{projekt}}. Pris: {{pris}}.',
    });
    resetTemplateCache();
    assert.equal((await templateFor('offert')).subject, 'Offert på {{projekt}}');
  });

  it('avvisar en platshållare som inte finns', async () => {
    await assert.rejects(
      () =>
        saveTemplate('status_skickad', {
          subject: 'Skickad',
          body: 'Hej {{kudn}}, nu är den på väg till dig någonstans.',
        }),
      TemplateError,
    );
  });

  it('avvisar tom ämnesrad och för kort brev', async () => {
    await assert.rejects(() => saveTemplate('offert', { subject: '', body: 'x' }), TemplateError);
    await assert.rejects(
      () => saveTemplate('offert', { subject: 'Hej hej', body: 'kort' }),
      TemplateError,
    );
  });

  it('en okänd mall går inte att spara', async () => {
    await assert.rejects(
      () => saveTemplate('finns-inte', { subject: 'Hej hej', body: 'x'.repeat(30) }),
      TemplateError,
    );
  });

  it('pekar ut vilka platshållare som finns', async () => {
    try {
      await saveTemplate('lagerbesked', {
        subject: 'Åter i lager',
        body: 'Nu finns {{produktnamn}} igen, hör gärna av dig om något.',
      });
      assert.fail('förväntade TemplateError');
    } catch (error) {
      assert.ok(error instanceof TemplateError);
      assert.match(error.fields.body ?? '', /produktnamn/);
      assert.match(error.fields.body ?? '', /produkt, saldo, lank/);
    }
  });
});

describe('utgångsläget', () => {
  it('en orörd mall är inte markerad som ändrad', async () => {
    const templates = await allTemplates();
    assert.ok(templates.every((template) => !template.custom));
    assert.equal(templates.length, TEMPLATES.length);
  });

  it('en sparad text som är lika med utgångsläget räknas inte som ändring', async () => {
    const spec = templateSpec('offert')!;
    const saved = await saveTemplate('offert', { subject: spec.subject, body: spec.body });
    assert.equal(saved.custom, false);
  });

  it('går att lägga tillbaka', async () => {
    const spec = templateSpec('offert')!;
    await saveTemplate('offert', {
      subject: 'Något annat helt och hållet',
      body: 'En helt annan text som ändå är tillräckligt lång.',
    });
    const back = await resetTemplate('offert');
    assert.equal(back?.custom, false);
    assert.equal(back?.subject, spec.subject);
    assert.equal((await templateFor('offert')).body, spec.body);
  });

  it('resetTemplate ger undefined för en mall som inte finns', async () => {
    assert.equal(await resetTemplate('finns-inte'), undefined);
  });

  it('visar både den gällande och den ursprungliga texten', async () => {
    await saveTemplate('lagerbesked', {
      subject: 'Nu finns {{produkt}}',
      body: 'Den står i hyllan igen. {{saldo}} Beställ här: {{lank}}',
    });
    const view = (await allTemplates()).find((template) => template.id === 'lagerbesked')!;
    assert.equal(view.custom, true);
    assert.ok(view.savedAt);
    assert.equal(view.subject, 'Nu finns {{produkt}}');
    assert.equal(view.defaultSubject, templateSpec('lagerbesked')!.subject);
  });
});

describe('validate', () => {
  it('trimmar och godkänner', () => {
    const spec = templateSpec('offert')!;
    const result = validate(spec, {
      subject: '  Offert på {{projekt}}  ',
      body: '  Här kommer offerten på {{projekt}}.  ',
    });
    assert.equal(result.subject, 'Offert på {{projekt}}');
    assert.match(result.body, /^Här/);
  });

  it('avvisar fel typ', () => {
    const spec = templateSpec('offert')!;
    assert.throws(() => validate(spec, { subject: 42, body: null }), TemplateError);
  });
});
