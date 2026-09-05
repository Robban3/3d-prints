export type MaterialId = 'pla' | 'petg' | 'abs' | 'tpu' | 'resin';
export type PrintQuality = 'utkast' | 'standard' | 'fin' | 'ultrafin';
export type CategoryId = 'inredning' | 'kontor' | 'kok' | 'prylar' | 'tillbehor';
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
  highlights: string[];
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  art: { shape: ArtShape; tone: ArtTone };
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
}

export type OrderStatus = 'mottagen' | 'i_produktion' | 'skickad' | 'levererad';

export interface ShopOrder {
  id: string;
  type: 'shop';
  createdAt: string;
  status: OrderStatus;
  customer: CustomerDetails;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  total: number;
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
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  description: string;
  quote: QuoteBreakdown;
  total: number;
}

export type AnyOrder = ShopOrder | CustomOrder;
