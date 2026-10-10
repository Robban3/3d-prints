import type { Material, MaterialProperties } from './types.ts';

/**
 * Materialguiden: tre frågor om hur delen ska användas, och ett
 * rekommenderat material.
 *
 * Materialsidan listar egenskaper, men kunden måste själv översätta "ska sitta
 * i bilen på sommaren" till PETG. Det här gör översättningen.
 *
 * Uträkningen är ren och går på materialens egna egenskaper, som redigeras i
 * panelen. Ett nytt material som får egenskaper blir alltså med i guiden utan
 * att något här behöver ändras.
 */

export type Place = 'inomhus' | 'utomhus' | 'varmt';
export type Load = 'dekor' | 'daglig' | 'last';
export type Flex = 'styv' | 'nagot' | 'mjuk';

export interface GuideAnswers {
  place: Place;
  load: Load;
  flex: Flex;
}

export interface GuideResult {
  material: Material;
  /** 0–100, där 100 är en perfekt träff på alla tre svaren. */
  score: number;
  /** Varför materialet passar. */
  reasons: string[];
  /** Vad kunden ändå bör veta om det. */
  warnings: string[];
}

/** Temperaturen delen behöver tåla, utifrån var den ska sitta. */
const REQUIRED_TEMP: Record<Place, number> = {
  inomhus: 40,
  utomhus: 60,
  // En bil i sommarsol blir varmare än de flesta tror.
  varmt: 80,
};

const REQUIRED_STRENGTH: Record<Load, number> = {
  dekor: 1,
  daglig: 3,
  last: 4,
};

/** Böjligheten kunden bett om, som ett spann i materialens skala. */
const WANTED_FLEX: Record<Flex, { min: number; max: number }> = {
  styv: { min: 1, max: 2 },
  nagot: { min: 2, max: 3 },
  mjuk: { min: 4, max: 5 },
};

export function hasProperties(material: Material): material is Material & {
  properties: MaterialProperties;
} {
  return material.properties !== undefined;
}

/**
 * Varje svar kan ge upp till en tredjedel av poängen. Ett material som inte
 * klarar kravet tappar i proportion till hur långt ifrån det ligger, så
 * ordningen mellan två otillräckliga material fortfarande säger något.
 */
function scoreFor(
  properties: MaterialProperties,
  answers: GuideAnswers,
): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Värme och väder.
  const needed = REQUIRED_TEMP[answers.place];
  let heat = Math.min(1, properties.maxTempC / needed);
  if (properties.maxTempC >= needed) {
    reasons.push(`Tål ${properties.maxTempC} °C, vilket räcker med marginal.`);
  } else {
    warnings.push(
      `Tål bara ${properties.maxTempC} °C. Delen kan deformeras där du tänkt placera den.`,
    );
  }
  if (answers.place === 'utomhus') {
    if (properties.outdoor) reasons.push('Tål fukt och UV, så den kan stå ute året om.');
    else {
      warnings.push('Bryts ned av fukt och sol och håller inte utomhus över tid.');
      heat *= 0.4;
    }
  }

  // Hållfasthet.
  const strengthNeeded = REQUIRED_STRENGTH[answers.load];
  const strength = Math.min(1, properties.strength / strengthNeeded);
  if (properties.strength >= strengthNeeded) {
    if (answers.load === 'last') reasons.push('Styv och stark nog att bära last.');
    else if (answers.load === 'daglig') reasons.push('Håller för daglig användning.');
  } else {
    warnings.push('Kan gå sönder under den belastning du beskriver.');
  }
  if (answers.load === 'dekor' && properties.detail >= 4) {
    reasons.push('Återger små detaljer, så ytan blir fin.');
  }

  // Böjlighet.
  const wanted = WANTED_FLEX[answers.flex];
  const distance =
    properties.flexibility < wanted.min
      ? wanted.min - properties.flexibility
      : properties.flexibility > wanted.max
        ? properties.flexibility - wanted.max
        : 0;
  const flex = Math.max(0, 1 - distance / 4);
  if (distance === 0) {
    if (answers.flex === 'mjuk') reasons.push('Böjlig och gummiliknande.');
    else if (answers.flex === 'styv') reasons.push('Styv och måttstabil.');
    else reasons.push('Ger lite efter utan att kännas mjuk.');
  } else if (properties.flexibility > wanted.max) {
    warnings.push('Mjukare än du bett om – delen kommer att ge efter.');
  } else {
    warnings.push('Styvare än du bett om.');
  }

  // Detaljnivån väger in som en bonus när valet annars står och väger.
  const detail = properties.detail / 5;
  const score = (heat + strength + flex) / 3;
  return {
    score: Math.round((score * 0.94 + detail * 0.06) * 100),
    reasons,
    warnings,
  };
}

/**
 * Rekommenderar material, bäst först. Material utan egenskaper utesluts – vi
 * gissar inte om något vi inte vet.
 */
export function recommendMaterials(materials: Material[], answers: GuideAnswers): GuideResult[] {
  return materials
    .filter(hasProperties)
    .map((material) => ({ material, ...scoreFor(material.properties, answers) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Lika bra på egenskaperna: då får priset avgöra.
        a.material.priceFactor - b.material.priceFactor ||
        a.material.name.localeCompare(b.material.name, 'sv'),
    );
}
