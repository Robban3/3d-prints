import type {
  ArtShape,
  ArtTone,
  Category,
  Material,
  MaterialProperties,
  Product,
  ProductVariantOption,
  QualityLevel,
} from './types.ts';

/**
 * Validering av det som matas in i adminpanelen. Samma regler gäller oavsett om
 * en produkt skapas eller ändras, och felen pekas ut per fält så att formuläret
 * kan visa dem där de hör hemma.
 */
export class ProductInputError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Kontrollera fälten');
    this.name = 'ProductInputError';
    this.fields = fields;
  }
}

export const ART_SHAPES: ArtShape[] = [
  'planter',
  'headphoneStand',
  'organizer',
  'dragon',
  'moonLamp',
  'penHolder',
  'wallHook',
  'coffeeDripper',
  'diceTower',
  'phoneStand',
  'cableClip',
  'spiralVase',
  'gearFidget',
  'spiceShelf',
  'christmasTree',
  'ornamentBall',
  'starBurst',
  'nameOrnament',
];

export const ART_TONES: ArtTone[] = ['grafit', 'benvit', 'stal', 'bla', 'gran', 'vinrod'];

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Sant när fältet faktiskt fyllts i. Kan inte uttryckas med text(), som ger
 * tom sträng för allt som inte är en sträng – inklusive tal.
 */
function given(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter((entry) => entry.length > 0);
}

/** Gör en webbadressvänlig variant av ett namn, med svenska tecken översatta. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseSizes(
  value: unknown,
  errors: Record<string, string>,
): ProductVariantOption[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    errors.sizes = 'Storlekarna kunde inte tolkas.';
    return undefined;
  }
  if (value.length === 0) return undefined;

  const sizes: ProductVariantOption[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const raw = asRecord(entry);
    const name = text(raw.name);
    const id = text(raw.id) || slugify(name);
    const priceDelta = num(raw.priceDelta ?? 0);

    if (!name) {
      errors[`sizes.${index}.name`] = 'Storleken behöver ett namn.';
      return;
    }
    if (!id) {
      errors[`sizes.${index}.id`] = 'Storleken behöver ett id.';
      return;
    }
    if (seen.has(id)) {
      errors[`sizes.${index}.id`] = 'Två storlekar kan inte ha samma id.';
      return;
    }
    if (!Number.isFinite(priceDelta)) {
      errors[`sizes.${index}.priceDelta`] = 'Pristillägget måste vara ett tal.';
      return;
    }
    seen.add(id);
    sizes.push({ id, name, priceDelta: Math.round(priceDelta) });
  });

  return sizes.length > 0 ? sizes : undefined;
}

export interface ProductInputOptions {
  /** Kategorierna som finns just nu – produkten måste höra till en av dem. */
  categoryIds: string[];
  /** Materialen som finns just nu. */
  materialIds: string[];
}

/**
 * Läser ett helt produktobjekt ur indata. Används både vid skapande och vid
 * ändring; vid ändring skickar klienten hela produkten tillbaka.
 */
export function parseProductInput(
  input: unknown,
  options: ProductInputOptions,
): Omit<Product, 'id'> {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const name = text(raw.name);
  if (name.length < 2) errors.name = 'Produkten behöver ett namn.';

  const slug = text(raw.slug) || slugify(name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = 'Webbadressen får bara innehålla små bokstäver, siffror och bindestreck.';
  }

  const tagline = text(raw.tagline);
  if (tagline.length < 3) errors.tagline = 'Skriv en kort säljande rad.';

  const description = text(raw.description);
  if (description.length < 20) errors.description = 'Beskriv produkten med minst 20 tecken.';

  const category = text(raw.category);
  if (!options.categoryIds.includes(category)) {
    errors.category = 'Välj en kategori som finns.';
  }

  const price = num(raw.price);
  if (!(price >= 1 && price <= 100000)) {
    errors.price = 'Priset ska vara mellan 1 och 100 000 kr.';
  }

  const material = text(raw.material);
  if (!options.materialIds.includes(material)) errors.material = 'Välj ett material som finns.';

  const finish = text(raw.finish) || 'Matte';

  const printTimeHours = num(raw.printTimeHours);
  if (!(printTimeHours > 0 && printTimeHours <= 500)) {
    errors.printTimeHours = 'Printtiden ska vara mellan 0 och 500 timmar.';
  }

  const dimensionsRaw = asRecord(raw.dimensions);
  const dimensions = {
    width: num(dimensionsRaw.width),
    depth: num(dimensionsRaw.depth),
    height: num(dimensionsRaw.height),
  };
  for (const [key, value] of Object.entries(dimensions)) {
    if (!(value > 0 && value <= 2000)) {
      errors[`dimensions.${key}`] = 'Måttet ska vara mellan 1 och 2000 mm.';
    }
  }

  const weightGrams = num(raw.weightGrams);
  if (!(weightGrams > 0 && weightGrams <= 50000)) {
    errors.weightGrams = 'Vikten ska vara mellan 1 och 50 000 gram.';
  }

  const colors = stringList(raw.colors);
  if (colors.length === 0) errors.colors = 'Ange minst en färg.';

  const sizes = parseSizes(raw.sizes, errors);
  const highlights = stringList(raw.highlights);

  const stock = Math.round(num(raw.stock ?? 0));
  if (!(Number.isFinite(stock) && stock >= 0 && stock <= 100000)) {
    errors.stock = 'Lagersaldot ska vara mellan 0 och 100 000.';
  }

  const rating = num(raw.rating ?? 0);
  if (!(rating >= 0 && rating <= 5)) errors.rating = 'Betyget ska vara mellan 0 och 5.';

  const reviewCount = Math.round(num(raw.reviewCount ?? 0));
  if (!(Number.isFinite(reviewCount) && reviewCount >= 0)) {
    errors.reviewCount = 'Antalet omdömen kan inte vara negativt.';
  }

  // Bilden är valfri; saknas den ritas den genererade illustrationen i stället.
  const imageRaw = asRecord(raw.image);
  const imageId = text(imageRaw.id);
  let image: Product['image'];
  if (imageId) {
    if (!/^[0-9a-f]{32}$/.test(imageId)) {
      errors['image.id'] = 'Bilden kunde inte kopplas. Ladda upp den igen.';
    } else {
      image = {
        id: imageId,
        url: `/api/uploads/${imageId}`,
        fileName: text(imageRaw.fileName).slice(0, 200) || 'produktbild',
      };
    }
  }

  const art = asRecord(raw.art);
  const shape = text(art.shape);
  const tone = text(art.tone);
  if (!ART_SHAPES.includes(shape as ArtShape)) errors['art.shape'] = 'Välj en form som finns.';
  if (!ART_TONES.includes(tone as ArtTone)) errors['art.tone'] = 'Välj en yta som finns.';

  if (Object.keys(errors).length > 0) throw new ProductInputError(errors);

  return {
    slug,
    name,
    tagline,
    description,
    category: category as Product['category'],
    price: Math.round(price),
    material: material as Product['material'],
    finish,
    printTimeHours,
    dimensions: {
      width: Math.round(dimensions.width),
      depth: Math.round(dimensions.depth),
      height: Math.round(dimensions.height),
    },
    weightGrams: Math.round(weightGrams),
    colors,
    ...(sizes ? { sizes } : {}),
    highlights,
    stock,
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    featured: raw.featured === true,
    published: raw.published !== false,
    ...(image ? { image } : {}),
    art: { shape: shape as ArtShape, tone: tone as ArtTone },
  };
}

export function parseCategoryInput(input: unknown, existingId?: string): Category {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const name = text(raw.name);
  if (name.length < 2) errors.name = 'Kategorin behöver ett namn.';

  // Vid ändring ligger id:t fast; vid skapande härleds det ur namnet.
  const id = existingId ?? (text(raw.id) || slugify(name));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    errors.id = 'Id:t får bara innehålla små bokstäver, siffror och bindestreck.';
  }

  const description = text(raw.description);
  if (description.length < 5) errors.description = 'Beskriv kategorin kort.';

  if (Object.keys(errors).length > 0) throw new ProductInputError(errors);

  return { id: id as Category['id'], name, description };
}

export function parseMaterialInput(input: unknown, existingId?: string): Material {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const name = text(raw.name);
  if (name.length < 1) errors.name = 'Materialet behöver ett namn.';

  const id = existingId ?? (text(raw.id) || slugify(name));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    errors.id = 'Id:t får bara innehålla små bokstäver, siffror och bindestreck.';
  }

  const priceFactor = num(raw.priceFactor);
  if (!(priceFactor >= 0.1 && priceFactor <= 20)) {
    errors.priceFactor = 'Prisfaktorn ska vara mellan 0,1 och 20.';
  }

  const description = text(raw.description);
  if (description.length < 10) errors.description = 'Beskriv materialet kort.';

  // Densiteten är frivillig. Lämnas den tom räknar vi vikten som för PLA.
  const density = given(raw.densityGramsPerCm3) ? num(raw.densityGramsPerCm3) : undefined;
  if (density !== undefined && !(density >= 0.5 && density <= 5)) {
    errors.densityGramsPerCm3 = 'Densiteten ska vara mellan 0,5 och 5 g/cm³.';
  }

  const traits = Array.isArray(raw.traits)
    ? raw.traits.map((entry) => text(entry)).filter((entry) => entry.length > 0)
    : [];

  // Egenskaperna är frivilliga, men anges de måste alla fem vara med – ett
  // halvt ifyllt material kan inte vägas mot kundens behov.
  const properties = parseMaterialProperties(raw.properties, errors);

  if (Object.keys(errors).length > 0) throw new ProductInputError(errors);

  return {
    id,
    name,
    priceFactor: Math.round(priceFactor * 100) / 100,
    ...(properties ? { properties } : {}),
    ...(density === undefined ? {} : { densityGramsPerCm3: Math.round(density * 100) / 100 }),
    description,
    traits,
  };
}

export function parseQualityInput(input: unknown, existingId?: string): QualityLevel {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const name = text(raw.name);
  if (name.length < 1) errors.name = 'Kvalitetsnivån behöver ett namn.';

  const id = existingId ?? (text(raw.id) || slugify(name));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    errors.id = 'Id:t får bara innehålla små bokstäver, siffror och bindestreck.';
  }

  const layerHeightMm = num(raw.layerHeightMm);
  if (!(layerHeightMm > 0 && layerHeightMm <= 2)) {
    errors.layerHeightMm = 'Lagerhöjden ska vara mellan 0 och 2 mm.';
  }

  const timeFactor = num(raw.timeFactor);
  if (!(timeFactor >= 0.1 && timeFactor <= 20)) {
    errors.timeFactor = 'Tidsfaktorn ska vara mellan 0,1 och 20.';
  }

  const description = text(raw.description);
  if (description.length < 5) errors.description = 'Beskriv nivån kort.';

  if (Object.keys(errors).length > 0) throw new ProductInputError(errors);

  return {
    id,
    name,
    layerHeightMm: Math.round(layerHeightMm * 1000) / 1000,
    timeFactor: Math.round(timeFactor * 100) / 100,
    description,
  };
}

/** Skalorna i materialguiden går från 1 till 5, temperaturen i grader. */
function parseMaterialProperties(
  input: unknown,
  errors: Record<string, string>,
): MaterialProperties | undefined {
  if (input === undefined || input === null) return undefined;
  const raw = asRecord(input);

  // Ett tomt objekt betyder att egenskaperna inte angetts.
  const filled = ['maxTempC', 'strength', 'flexibility', 'detail'].filter((key) => given(raw[key]));
  if (filled.length === 0) return undefined;
  if (filled.length < 4) {
    errors.properties = 'Fyll i alla fyra egenskaper, eller lämna dem helt tomma.';
    return undefined;
  }

  const maxTempC = num(raw.maxTempC);
  if (!(maxTempC >= 20 && maxTempC <= 400)) {
    errors.properties = 'Temperaturen ska vara mellan 20 och 400 °C.';
    return undefined;
  }

  const scales = {
    strength: num(raw.strength),
    flexibility: num(raw.flexibility),
    detail: num(raw.detail),
  };
  for (const [key, value] of Object.entries(scales)) {
    if (!(Number.isInteger(value) && value >= 1 && value <= 5)) {
      errors.properties = `${key} ska vara ett heltal mellan 1 och 5.`;
      return undefined;
    }
  }

  return {
    maxTempC: Math.round(maxTempC),
    strength: scales.strength,
    flexibility: scales.flexibility,
    detail: scales.detail,
    outdoor: raw.outdoor === true,
  };
}
