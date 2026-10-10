export type MaterialId = 'pla' | 'petg' | 'abs' | 'tpu' | 'resin';
export type PrintQuality = 'utkast' | 'standard' | 'fin' | 'ultrafin';
export type CategoryId =
  | 'inredning'
  | 'kontor'
  | 'kok'
  | 'prylar'
  | 'tillbehor'
  | 'julpynt-personligt'
  | 'jul-dekorationer'
  | 'julklappar';
export type ArtShape =
  | 'planter'
  | 'headphoneStand'
  | 'organizer'
  | 'dragon'
  | 'moonLamp'
  | 'penHolder'
  | 'wallHook'
  | 'coffeeDripper'
  | 'diceTower'
  | 'phoneStand'
  | 'cableClip'
  | 'spiralVase'
  | 'gearFidget'
  | 'spiceShelf'
  | 'christmasTree'
  | 'ornamentBall'
  | 'starBurst'
  | 'nameOrnament'
  | 'giftBox';

export type ArtTone = 'grafit' | 'benvit' | 'stal' | 'bla' | 'gran' | 'vinrod';

/** Mätbara egenskaper som materialguiden väger. Skalorna går från 1 till 5. */
export interface MaterialProperties {
  maxTempC: number;
  strength: number;
  flexibility: number;
  detail: number;
  outdoor: boolean;
}

export interface Material {
  id: MaterialId;
  name: string;
  priceFactor: number;
  /** Densitet i g/cm³. Saknas den räknas vikten som för PLA. */
  densityGramsPerCm3?: number;
  /** Saknas de kan materialet inte rekommenderas av guiden. */
  properties?: MaterialProperties;
  description: string;
  traits: string[];
}

/** Uppmätt geometri från en uppladdad modellfil. Speglar serverns ModelAnalysis. */
export interface ModelAnalysis {
  format: 'stl' | 'obj' | '3mf';
  volumeCm3: number;
  surfaceAreaCm2: number;
  bounds: { width: number; depth: number; height: number };
  triangles: number;
  openEdges: number | null;
  nonManifoldEdges: number | null;
  watertight: boolean | null;
  invertedNormals: boolean;
  fitsBuildPlate: boolean;
  warnings: ModelWarning[];
}

export interface ModelWarning {
  code:
    | 'inte-tat'
    | 'icke-manifold'
    | 'for-stor'
    | 'misstankt-liten'
    | 'inverterade-normaler'
    | 'tom-volym'
    | 'tung-mesh'
    | 'flera-delar';
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface Quality {
  id: PrintQuality;
  name: string;
  layerHeightMm: number;
  timeFactor: number;
  description: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
}

export interface SizeOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ProductParameter {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  pricePerUnit: number;
  axis?: 'width' | 'depth' | 'height';
  description?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  price: number;
  material: MaterialId;
  finish: string;
  printTimeHours: number;
  dimensions: { width: number; depth: number; height: number };
  weightGrams: number;
  colors: string[];
  sizes?: SizeOption[];
  /** Mått kunden får ställa in själv. Priset räknas alltid om av servern. */
  parameters?: ProductParameter[];
  highlights: string[];
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  /** Opublicerade produkter syns bara i adminpanelen. */
  published?: boolean;
  art: { shape: ArtShape; tone: ArtTone };
  image?: { id: string; url: string; fileName: string };
}

export interface ShopConfig {
  materials: Material[];
  qualities: Quality[];
  categories: Category[];
  quoteLimits: {
    volumeCm3: { min: number; max: number };
    infill: { min: number; max: number };
    quantity: { min: number; max: number };
  };
  shipping: { options: ShippingOption[]; defaultId: string };
  upload: { maxBytes: number; extensions: string[] };
  payment: { provider: 'klarna'; live: boolean };
}

export interface PaymentSession {
  clientToken: string;
  paymentMethodCategories: Array<{ identifier: string; name: string }>;
  /** True när servern saknar Klarna-nycklar och ingen riktig betalning sker. */
  test: boolean;
}

export interface PaymentDetails {
  provider: 'klarna';
  reference?: string;
  status: 'auktoriserad' | 'avvaktar' | 'obetald';
  fraudStatus?: string;
  test: boolean;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  size: number;
  url: string;
  /** Uppmätt geometri, när formatet gick att läsa. */
  analysis?: ModelAnalysis;
  /** Varför uppmätningen inte gick att göra. */
  analysisError?: string;
}

export interface QuoteRequest {
  material: MaterialId;
  quality: PrintQuality;
  volumeCm3: number;
  infill: number;
  quantity: number;
  rush: boolean;
  postProcessing: boolean;
}

export interface QuoteBreakdown {
  materialCost: number;
  machineCost: number;
  setupFee: number;
  postProcessingCost: number;
  rushSurcharge: number;
  volumeDiscount: number;
  unitPrice: number;
  total: number;
  estimatedPrintHours: number;
  estimatedDeliveryDays: number;
  estimatedWeightGrams: number;
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone?: string;
  address: string;
  postalCode: string;
  city: string;
  note?: string;
}

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  color: string;
  size?: string;
  parameters?: Record<string, number>;
  parameterText?: string;
}

export type OrderStatus = 'mottagen' | 'i_produktion' | 'skickad' | 'levererad' | 'avbruten';

export interface StatusEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface ShopOrder {
  id: string;
  type: 'shop';
  /** Beräknad printtid för hela ordern, summerad när ordern lades. */
  productionHours?: number;
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  /** Fraktalternativet kunden valde. Saknas på ordrar lagda före fraktvalen. */
  shippingOption?: { id: string; name: string };
  /** Rabatten som faktiskt drogs av. */
  discount?: { code: string; label: string; amount: number };
  total: number;
  payment?: PaymentDetails;
  history: StatusEvent[];
}

export interface CustomOrder {
  id: string;
  type: 'custom';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  request: QuoteRequest;
  projectName: string;
  fileId?: string;
  model?: ModelAnalysis;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  description: string;
  quote: QuoteBreakdown;
  total: number;
  payment?: PaymentDetails;
  history: StatusEvent[];
}

export type AnyOrder = ShopOrder | CustomOrder;

/* ---------- Materialguiden ---------- */

export type GuidePlace = 'inomhus' | 'utomhus' | 'varmt';
export type GuideLoad = 'dekor' | 'daglig' | 'last';
export type GuideFlex = 'styv' | 'nagot' | 'mjuk';

export interface GuideAnswers {
  place: GuidePlace;
  load: GuideLoad;
  flex: GuideFlex;
}

export interface GuideResult {
  material: Material;
  /** 0–100, där 100 är en perfekt träff på alla tre svaren. */
  score: number;
  reasons: string[];
  warnings: string[];
}

/* ---------- Sparade offerter ---------- */

export interface SavedQuote {
  id: string;
  createdAt: string;
  expiresAt: string;
  projectName: string;
  description: string;
  request: QuoteRequest;
  /** Priset som gällde när offerten sparades. */
  quote: QuoteBreakdown;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  model?: ModelAnalysis;
  email?: string;
}

/** Underlaget till en ny beställning av ett jobb som redan gjorts. */
export interface ReorderDraft {
  projectName: string;
  description: string;
  request: QuoteRequest;
  customer: CustomerDetails;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  analysis?: ModelAnalysis;
  /** Filen fanns på ordern men gick inte att kopiera. */
  fileMissing: boolean;
}

/* ---------- Startsidan ---------- */

/** Uppladdad bild eller video, eller en fil som följer med bygget. */
export interface Media {
  kind: 'image' | 'video';
  /** Uppladdningens id, eller tomt för en fil som följer med bygget. */
  id: string;
  url: string;
  fileName: string;
}

export interface LinkTarget {
  label: string;
  href: string;
}

export interface HeroContent {
  eyebrow: string;
  title: string;
  /** Raden under titeln som får accentfärg. */
  highlight: string;
  text: string;
  primary: LinkTarget;
  secondary?: LinkTarget;
  /** Saknas mediet ritas den genererade scenen i stället. */
  media?: Media;
  /** Stillbild bakom videon innan den börjat spela. */
  poster?: Media;
  autoplay: boolean;
}

export type CampaignLayout = 'banner' | 'kort';

export interface Campaign {
  id: string;
  /** Liten rad ovanför rubriken, som JULKOLLEKTIONEN. */
  eyebrow?: string;
  title: string;
  text: string;
  cta?: LinkTarget;
  media?: Media;
  layout: CampaignLayout;
  discountCode?: string;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  order: number;
}

export interface HomeContent {
  hero: HeroContent;
  campaigns: Campaign[];
}

/* ---------- Frakt och rabatter ---------- */

export interface ShippingOption {
  id: string;
  name: string;
  description: string;
  fee: number;
  /** Fri frakt från och med det här ordervärdet. Saknas = aldrig fri. */
  freeOver?: number;
  days: string;
}

/** Rabatten som servern räknat fram för den aktuella varukorgen. */
export interface AppliedDiscount {
  code: string;
  label: string;
  amount: number;
  freeShipping: boolean;
}

export type DiscountKind = 'procent' | 'kronor';

/** Rabattkoden som den redigeras i panelen. */
export interface DiscountCode {
  code: string;
  description: string;
  kind: DiscountKind;
  value: number;
  minSubtotal: number;
  startsAt?: string;
  endsAt?: string;
  maxUses: number;
  uses: number;
  freeShipping: boolean;
  active: boolean;
  createdAt: string;
}

/* ---------- Omdömen ---------- */

export interface Review {
  id: string;
  createdAt: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  /** Satt när mejladressen finns på en order med produkten. */
  verifiedPurchase: boolean;
  /** Verkstadens svar, som visas under omdömet. */
  reply?: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** Antal omdömen per betyg, 1 till 5. */
  distribution: Record<number, number>;
}

export type ReviewStatus = 'väntar' | 'publicerad' | 'avslagen';

/** Omdömet som panelen ser det – med adress, status och produktnamn. */
export interface AdminReview extends Review {
  productId: string;
  productName: string;
  email: string;
  status: ReviewStatus;
  moderatedAt?: string;
}

/* ---------- Översikt ---------- */

export interface DayBucket {
  date: string;
  revenue: number;
  orders: number;
}

export interface Bestseller {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface LowStockItem {
  productId: string;
  name: string;
  stock: number;
  watchers: number;
}

export interface DashboardStats {
  revenue: {
    total: number;
    period: number;
    byDay: DayBucket[];
    byMonth: DayBucket[];
  };
  orders: {
    total: number;
    active: number;
    cancelled: number;
    shop: number;
    custom: number;
    averageValue: number;
    byStatus: Record<OrderStatus, number>;
    waitingToStart: number;
  };
  bestsellers: Bestseller[];
  lowStock: LowStockItem[];
  pendingReviews: number;
  peakRevenue: number;
}

export interface AdminCategory extends Category {
  productCount: number;
}

export interface AdminMaterial extends Material {
  productCount: number;
}

/** Produktformulärets form – samma fält som Product, men utan id. */
export type ProductDraft = Omit<Product, 'id'>;

/* ---------- Produktionskö och filament ---------- */

export interface JobMaterial {
  material: MaterialId;
  color: string;
  grams: number;
}

export interface QueueJob {
  orderId: string;
  type: 'shop' | 'custom';
  label: string;
  customer: string;
  createdAt: string;
  status: 'mottagen' | 'i_produktion';
  running: boolean;
  rush: boolean;
  hours: number;
  remainingHours: number;
  materials: JobMaterial[];
  printer: number;
  position: number;
  startsAt: string;
  readyAt: string;
  waitingHours: number;
}

export interface ProductionQueue {
  jobs: QueueJob[];
  printers: number;
  hours: number;
  running: number;
  waiting: number;
  readyAt?: string;
  demand: JobMaterial[];
}

export interface Spool {
  id: string;
  material: MaterialId;
  color: string;
  grams: number;
  totalGrams: number;
  addedAt: string;
  note?: string;
}

export interface FilamentShortage {
  material: MaterialId;
  color: string;
  needed: number;
  available: number;
}

export interface FilamentConsumption {
  orderId: string;
  at: string;
  items: JobMaterial[];
  shortfall: number;
}

/** Kundens plats i kön, som den visas på orderspårningen. */
export interface QueuePlace {
  position: number;
  jobs: number;
  startsAt: string;
  readyAt: string;
}

export interface AuditEntry {
  at: string;
  action: 'skapad' | 'ändrad' | 'borttagen' | 'importerad' | 'status';
  entity:
    | 'produkt'
    | 'kategori'
    | 'material'
    | 'kvalitet'
    | 'order'
    | 'omdöme'
    | 'rabattkod'
    | 'startsida'
    | 'kampanj'
    | 'filament';
  entityId: string;
  summary: string;
  changed?: string[];
}

export interface ImportRow {
  index: number;
  name: string;
  status: 'skapad' | 'ändrad' | 'fel';
  errors?: Record<string, string>;
}

export interface ImportResult {
  applied: boolean;
  rows: ImportRow[];
  ok: number;
  failed: number;
  created?: number;
  updated?: number;
}
