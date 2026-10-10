import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { hasProperties, recommendMaterials } from '../src/materialGuide.ts';
import { materials } from '../src/data/materials.ts';
import type { GuideAnswers } from '../src/materialGuide.ts';
import type { Material } from '../src/types.ts';

function top(answers: GuideAnswers, list: Material[] = materials): string {
  return recommendMaterials(list, answers)[0]!.material.name;
}

function resultFor(name: string, answers: GuideAnswers) {
  return recommendMaterials(materials, answers).find((entry) => entry.material.name === name)!;
}

describe('hasProperties', () => {
  it('känner igen material som guiden kan väga', () => {
    for (const material of materials) assert.ok(hasProperties(material), material.id);
  });

  it('utesluter material utan egenskaper i stället för att gissa', () => {
    const okänt: Material = {
      id: 'okant',
      name: 'Okänt',
      priceFactor: 1,
      description: 'Ett material utan angivna egenskaper.',
      traits: [],
    };
    assert.equal(hasProperties(okänt), false);
    const results = recommendMaterials([...materials, okänt], {
      place: 'inomhus',
      load: 'dekor',
      flex: 'styv',
    });
    assert.equal(
      results.some((entry) => entry.material.id === 'okant'),
      false,
    );
  });

  it('svarar med en tom lista när inget material har egenskaper', () => {
    assert.deepEqual(recommendMaterials([], { place: 'inomhus', load: 'dekor', flex: 'styv' }), []);
  });
});

describe('rekommendationer', () => {
  it('väljer det värmetåligaste för en varm plats med last', () => {
    assert.equal(top({ place: 'varmt', load: 'last', flex: 'styv' }), 'ABS');
  });

  it('väljer ett väderbeständigt material för utomhusbruk', () => {
    assert.equal(top({ place: 'utomhus', load: 'daglig', flex: 'styv' }), 'PETG');
  });

  it('väljer det mest detaljrika för dekor inomhus', () => {
    assert.equal(top({ place: 'inomhus', load: 'dekor', flex: 'styv' }), 'Resin (SLA)');
  });

  it('väljer det böjliga när kunden vill ha mjukt', () => {
    assert.equal(top({ place: 'inomhus', load: 'daglig', flex: 'mjuk' }), 'TPU (flexibel)');
  });

  it('sorterar bäst först', () => {
    const results = recommendMaterials(materials, {
      place: 'varmt',
      load: 'last',
      flex: 'styv',
    });
    for (let i = 1; i < results.length; i += 1) {
      assert.ok(results[i - 1]!.score >= results[i]!.score);
    }
  });

  it('ger varje material en poäng mellan 0 och 100', () => {
    for (const answers of [
      { place: 'inomhus', load: 'dekor', flex: 'styv' },
      { place: 'varmt', load: 'last', flex: 'mjuk' },
      { place: 'utomhus', load: 'daglig', flex: 'nagot' },
    ] satisfies GuideAnswers[]) {
      for (const result of recommendMaterials(materials, answers)) {
        assert.ok(
          result.score >= 0 && result.score <= 100,
          `${result.material.id}: ${result.score}`,
        );
      }
    }
  });

  it('låter priset avgöra mellan två likvärdiga material', () => {
    const billigt: Material = {
      id: 'billigt',
      name: 'Billigt',
      priceFactor: 0.5,
      description: 'Samma egenskaper som dyrt, lägre pris.',
      traits: [],
      properties: { maxTempC: 55, strength: 3, flexibility: 1, detail: 4, outdoor: false },
    };
    const dyrt: Material = { ...billigt, id: 'dyrt', name: 'Dyrt', priceFactor: 3 };
    const results = recommendMaterials([dyrt, billigt], {
      place: 'inomhus',
      load: 'dekor',
      flex: 'styv',
    });
    assert.equal(results[0]!.material.id, 'billigt');
  });
});

describe('förklaringar', () => {
  it('säger varför materialet räcker till värmen', () => {
    const abs = resultFor('ABS', { place: 'varmt', load: 'last', flex: 'styv' });
    assert.ok(abs.reasons.some((reason) => reason.includes('95 °C')));
    assert.deepEqual(abs.warnings, []);
  });

  it('varnar när materialet inte tål värmen', () => {
    const pla = resultFor('PLA', { place: 'varmt', load: 'last', flex: 'styv' });
    assert.ok(pla.warnings.some((warning) => warning.includes('55 °C')));
    assert.ok(pla.warnings.some((warning) => warning.includes('deformeras')));
  });

  it('varnar för material som inte håller utomhus', () => {
    const resin = resultFor('Resin (SLA)', { place: 'utomhus', load: 'dekor', flex: 'styv' });
    assert.ok(resin.warnings.some((warning) => warning.includes('fukt och sol')));
  });

  it('nämner väderbeständigheten som ett skäl', () => {
    const petg = resultFor('PETG', { place: 'utomhus', load: 'daglig', flex: 'styv' });
    assert.ok(petg.reasons.some((reason) => reason.includes('UV')));
  });

  it('varnar när materialet är för svagt för belastningen', () => {
    const resin = resultFor('Resin (SLA)', { place: 'inomhus', load: 'last', flex: 'styv' });
    assert.ok(resin.warnings.some((warning) => warning.includes('sönder')));
  });

  it('varnar när materialet är mjukare än kunden bett om', () => {
    const tpu = resultFor('TPU (flexibel)', { place: 'inomhus', load: 'dekor', flex: 'styv' });
    assert.ok(tpu.warnings.some((warning) => warning.includes('Mjukare')));
  });

  it('varnar när materialet är styvare än kunden bett om', () => {
    const pla = resultFor('PLA', { place: 'inomhus', load: 'dekor', flex: 'mjuk' });
    assert.ok(pla.warnings.some((warning) => warning.includes('Styvare')));
  });

  it('nämner detaljnivån när delen bara ska se fin ut', () => {
    const resin = resultFor('Resin (SLA)', { place: 'inomhus', load: 'dekor', flex: 'styv' });
    assert.ok(resin.reasons.some((reason) => reason.includes('detaljer')));
  });

  it('ger det bästa materialet skäl och inga varningar', () => {
    for (const answers of [
      { place: 'varmt', load: 'last', flex: 'styv' },
      { place: 'utomhus', load: 'daglig', flex: 'styv' },
      { place: 'inomhus', load: 'daglig', flex: 'mjuk' },
    ] satisfies GuideAnswers[]) {
      const best = recommendMaterials(materials, answers)[0]!;
      assert.ok(best.reasons.length > 0, JSON.stringify(answers));
      assert.deepEqual(best.warnings, [], `${best.material.name}: ${best.warnings.join(' ')}`);
    }
  });
});
