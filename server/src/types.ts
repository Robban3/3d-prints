export type MaterialId = 'pla' | 'petg' | 'abs' | 'tpu' | 'resin';

export interface Material {
  id: MaterialId;
  name: string;
  /** Prisfaktor jämfört med PLA (1.0). */
  priceFactor: number;
  description: string;
  /** Egenskaper som visas i UI:t. */
  traits: string[];
}

export interface ProductVariantOption {
  id: string;
  name: string;
  /** Tillägg på grundpriset i kronor. */
  priceDelta: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  /** Grundpris i kronor inkl. moms. */
  price: number;
  material: MaterialId;
  /** Ytfinish som visas tillsammans med materialet, t.ex. ”PLA Matte”. */
  finish: string;
  /** Ungefärlig printtid i timmar, används för leveransbesked. */
  printTimeHours: number;
  dimensions: { width: number; depth: number; height: number };
  weightGrams: number;
  colors: string[];
  sizes?: ProductVariantOption[];
  highlights: string[];
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  /** Nyckel till den genererade SVG-illustrationen. */
  art: { shape: ArtShape; tone: ArtTone };
}

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
  | 'spiceShelf';

/** Ytan produkten visas i – motsvarar hur den faktiskt printas. */
export type ArtTone = 'grafit' | 'benvit' | 'stal' | 'bla';

export type CategoryId = 'inredning' | 'kontor' | 'kok' | 'prylar' | 'tillbehor';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
}

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  color: string;
  size?: string;
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

export type OrderStatus = 'mottagen' | 'i_produktion' | 'skickad' | 'levererad';

export interface PaymentDetails {
  provider: 'klarna';
  /** Klarnas ordernummer, som kunden ser i Klarna-appen. Saknas i testläge. */
  reference?: string;
  status: 'auktoriserad' | 'avvaktar' | 'obetald';
  fraudStatus?: string;
  /** True när ordern lades utan Klarna-nycklar, dvs. i testläge. */
  test: boolean;
}

export interface Order {
  id: string;
  type: 'shop';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  lines: OrderLine[];
  shipping: number;
  subtotal: number;
  total: number;
  payment?: PaymentDetails;
}

export type PrintQuality = 'utkast' | 'standard' | 'fin' | 'ultrafin';

export interface CustomQuoteRequest {
  material: MaterialId;
  quality: PrintQuality;
  /** Modellens uppskattade volym i kubikcentimeter. */
  volumeCm3: number;
  /** Fyllnadsgrad i procent, 5-100. */
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

export interface CustomOrder {
  id: string;
  type: 'custom';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  request: CustomQuoteRequest;
  projectName: string;
  /** Id för den uppladdade modellfilen, om kunden bifogade en. */
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  description: string;
  quote: QuoteBreakdown;
  total: number;
  payment?: PaymentDetails;
}

export type AnyOrder = Order | CustomOrder;
