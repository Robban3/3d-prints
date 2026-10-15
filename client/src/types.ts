export type MaterialId = string;
export type ThemeId = 'nordic' | 'studio' | 'gallery' | 'workshop' | 'halloween' | 'forest' | 'coastal';
export interface Appearance { theme: ThemeId }
export type PrintQuality = string;
export type CategoryId = string;
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
  | 'nexoVase'
  | 'gearFidget'
  | 'spiceShelf';

export type ArtTone = 'grafit' | 'benvit' | 'stal' | 'bla';

export interface Material {
  id: MaterialId;
  name: string;
  priceFactor: number;
  description: string;
  traits: string[];
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
  dimensions?: { width: number; depth: number; height: number };
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  price: number;
  discountPercent?: number;
  saleReferencePrice?: number;
  material: MaterialId;
  finish: string;
  printTimeHours: number;
  dimensions: { width: number; depth: number; height: number };
  weightGrams: number;
  colors: string[];
  sizes?: SizeOption[];
  optionLabel?: string;
  highlights: string[];
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  /** Opublicerade produkter syns bara i adminpanelen. */
  published?: boolean;
  specificationsPending?: boolean;
  dimensionsEstimated?: boolean;
  dimensionsNote?: string;
  art: { shape: ArtShape; tone: ArtTone };
  image?: { id: string; url: string; fileName: string };
  variantImages?: Array<{ color: string; size?: string; image: { id: string; url: string; fileName: string } }>;
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
  shipping: { fee: number; freeThreshold: number };
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
  personalization?: string;
}

export type OrderStatus = 'mottagen' | 'i_produktion' | 'skickad' | 'levererad' | 'avbruten';

export interface StatusEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface ShopOrder {
  production?: ProductionPlan;
  id: string;
  type: 'shop';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
  payment?: PaymentDetails;
  history: StatusEvent[];
}

export interface CustomOrder {
  production?: ProductionPlan;
  id: string;
  type: 'custom';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  request: QuoteRequest;
  projectName: string;
  fileId?: string;
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

export interface ProductionPlan {
  machine: string;
  plannedDate: string;
  dueDate: string;
  estimatedHours: number | null;
  notes: string;
  modelIds: string[];
  revision: number;
}

export interface AdminCategory extends Category {
  productCount: number;
}

export interface AdminMaterial extends Material {
  productCount: number;
}

/** Produktformulärets form – samma fält som Product, men utan id. */
export type ProductDraft = Omit<Product, 'id'>;

export interface AuditEntry {
  at: string;
  action: 'skapad' | 'ändrad' | 'borttagen' | 'importerad' | 'status';
  entity: 'produkt' | 'kategori' | 'material' | 'kvalitet' | 'order' | 'tema';
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
