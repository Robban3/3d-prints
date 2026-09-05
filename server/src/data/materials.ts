import type { Material, PrintQuality } from '../types.ts';

export const materials: Material[] = [
  {
    id: 'pla',
    name: 'PLA',
    priceFactor: 1,
    description:
      'Vårt standardmaterial. Styvt, måttstabilt och tillverkat av förnybar råvara. Perfekt för inredning och dekor.',
    traits: ['Biobaserad', 'Hög detaljnivå', 'Tål upp till 55 °C'],
  },
  {
    id: 'petg',
    name: 'PETG',
    priceFactor: 1.25,
    description:
      'Segare än PLA och tål både fukt och UV. Ett bra val för prylar som används dagligen eller står utomhus.',
    traits: ['Slagtålig', 'Fukttålig', 'Tål upp till 75 °C'],
  },
  {
    id: 'abs',
    name: 'ABS',
    priceFactor: 1.35,
    description:
      'Klassisk teknisk plast med hög värmetålighet. Kan efterbearbetas med acetonpolering för blank yta.',
    traits: ['Värmetålig', 'Slipbar', 'Tål upp till 95 °C'],
  },
  {
    id: 'tpu',
    name: 'TPU (flexibel)',
    priceFactor: 1.6,
    description:
      'Gummiliknande material med shore 95A. Används för packningar, greppytor och stötdämpande detaljer.',
    traits: ['Flexibel', 'Nötningstålig', 'Halkfri yta'],
  },
  {
    id: 'resin',
    name: 'Resin (SLA)',
    priceFactor: 2.1,
    description:
      'Fotopolymer för miniatyrer och prototyper där varje detalj syns. Lagerhöjd ned till 0,025 mm.',
    traits: ['Extrem detaljnivå', 'Slät yta', 'Efterhärdas i UV'],
  },
];

export const materialById = new Map(materials.map((m) => [m.id, m]));

export const qualities: Array<{
  id: PrintQuality;
  name: string;
  layerHeightMm: number;
  /** Faktor på maskintiden – finare lager tar längre tid. */
  timeFactor: number;
  description: string;
}> = [
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
