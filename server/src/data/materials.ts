import type { Material, QualityLevel } from '../types.ts';

export const materials: Material[] = [
  {
    id: 'pla',
    name: 'PLA',
    priceFactor: 1,
    densityGramsPerCm3: 1.24,
    properties: { maxTempC: 55, strength: 3, flexibility: 1, detail: 4, outdoor: false },
    description:
      'Vårt standardmaterial. Styvt, måttstabilt och tillverkat av förnybar råvara. Perfekt för inredning och dekor.',
    traits: ['Biobaserad', 'Hög detaljnivå', 'Tål upp till 55 °C'],
  },
  {
    id: 'petg',
    name: 'PETG',
    priceFactor: 1.25,
    densityGramsPerCm3: 1.27,
    properties: { maxTempC: 75, strength: 4, flexibility: 2, detail: 3, outdoor: true },
    description:
      'Segare än PLA och tål både fukt och UV. Ett bra val för prylar som används dagligen eller står utomhus.',
    traits: ['Slagtålig', 'Fukttålig', 'Tål upp till 75 °C'],
  },
  {
    id: 'abs',
    name: 'ABS',
    priceFactor: 1.35,
    densityGramsPerCm3: 1.04,
    properties: { maxTempC: 95, strength: 4, flexibility: 2, detail: 3, outdoor: false },
    description:
      'Klassisk teknisk plast med hög värmetålighet. Kan efterbearbetas med acetonpolering för blank yta.',
    traits: ['Värmetålig', 'Slipbar', 'Tål upp till 95 °C'],
  },
  {
    id: 'tpu',
    name: 'TPU (flexibel)',
    priceFactor: 1.6,
    densityGramsPerCm3: 1.21,
    properties: { maxTempC: 70, strength: 3, flexibility: 5, detail: 2, outdoor: true },
    description:
      'Gummiliknande material med shore 95A. Används för packningar, greppytor och stötdämpande detaljer.',
    traits: ['Flexibel', 'Nötningstålig', 'Halkfri yta'],
  },
  {
    id: 'resin',
    name: 'Resin (SLA)',
    priceFactor: 2.1,
    densityGramsPerCm3: 1.15,
    properties: { maxTempC: 60, strength: 2, flexibility: 1, detail: 5, outdoor: false },
    description:
      'Fotopolymer för miniatyrer och prototyper där varje detalj syns. Lagerhöjd ned till 0,025 mm.',
    traits: ['Extrem detaljnivå', 'Slät yta', 'Efterhärdas i UV'],
  },
];

export const materialById = new Map(materials.map((m) => [m.id, m]));

export const qualities: QualityLevel[] = [
  {
    id: 'utkast',
    name: 'Utkast',
    layerHeightMm: 0.32,
    timeFactor: 0.65,
    description: 'Snabb prototyp där ytan inte spelar roll.',
  },
  {
    id: 'standard',
    name: 'Standard',
    layerHeightMm: 0.2,
    timeFactor: 1,
    description: 'Vår vanligaste inställning – bra balans mellan yta och tid.',
  },
  {
    id: 'fin',
    name: 'Fin',
    layerHeightMm: 0.12,
    timeFactor: 1.6,
    description: 'Släta ytor och mjuka rundningar på synliga detaljer.',
  },
  {
    id: 'ultrafin',
    name: 'Ultrafin',
    layerHeightMm: 0.08,
    timeFactor: 2.4,
    description: 'Maximal detaljnivå för miniatyrer och smycken.',
  },
];

export const qualityById = new Map(qualities.map((q) => [q.id, q]));
