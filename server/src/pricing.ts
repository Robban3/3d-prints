import { materialById, qualityById } from "./data/materials.ts";
import type { CustomQuoteRequest, QuoteBreakdown } from "./types.ts";

/** Materialpris i kronor per kubikcentimeter faktiskt utskjuten plast. */
const MATERIAL_PRICE_PER_CM3 = 2.4;
/** Maskintid debiteras per timme och täcker el, slitage och övervakning. */
const MACHINE_RATE_PER_HOUR = 55;
/** Startavgift per order som täcker slicing, uppstart och kvalitetskontroll. */
const SETUP_FEE = 95;
/** Efterbearbetning (stödborttagning, slipning, polering) per enhet. */
const POST_PROCESSING_PER_UNIT = 85;
/** Expressorder produceras först i kön. */
const RUSH_FACTOR = 0.4;
/** Ett normalstort objekt printar ungefär så här många cm³ per timme. */
const THROUGHPUT_CM3_PER_HOUR = 16;
const MIN_ORDER_VALUE = 149;

export const QUOTE_LIMITS = {
  volumeCm3: { min: 1, max: 8000 },
  infill: { min: 5, max: 100 },
  quantity: { min: 1, max: 500 },
} as const;

/** Volymrabatt i procent utifrån antal – trappas i steg. */
export function volumeDiscountRate(quantity: number): number {
  if (quantity >= 100) return 0.25;
  if (quantity >= 50) return 0.18;
  if (quantity >= 20) return 0.12;
  if (quantity >= 10) return 0.08;
  if (quantity >= 5) return 0.04;
  return 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Räknar fram ett pris för ett kundunikt printjobb. Modellen är avsiktligt
 * enkel och förutsägbar: material + maskintid + påslag, med volymrabatt på
 * allt utom startavgiften.
 */
export function calculateQuote(request: CustomQuoteRequest): QuoteBreakdown {
  const material = materialById.get(request.material);
  const quality = qualityById.get(request.quality);
  if (!material) throw new Error(`Okänt material: ${request.material}`);
  if (!quality) throw new Error(`Okänd kvalitet: ${request.quality}`);

  const quantity = Math.max(1, Math.round(request.quantity));
  const infillRatio = request.infill / 100;

  // Skalet kostar alltid material, fyllningen skalar med fyllnadsgraden.
  const shellShare = 0.35;
  const effectiveVolume =
    request.volumeCm3 * (shellShare + (1 - shellShare) * infillRatio);

  const materialCost =
    effectiveVolume * MATERIAL_PRICE_PER_CM3 * material.priceFactor;
  const printHoursPerUnit =
    (effectiveVolume / THROUGHPUT_CM3_PER_HOUR) * quality.timeFactor;
  const machineCost = printHoursPerUnit * MACHINE_RATE_PER_HOUR;
  const postProcessingCost = request.postProcessing
    ? POST_PROCESSING_PER_UNIT
    : 0;

  const unitBase = materialCost + machineCost + postProcessingCost;
  const discountRate = volumeDiscountRate(quantity);
  const discountedUnit = unitBase * (1 - discountRate);

  const lineTotal = discountedUnit * quantity;
  const rushSurcharge = request.rush
    ? (lineTotal + SETUP_FEE) * RUSH_FACTOR
    : 0;
  const rawTotal = lineTotal + SETUP_FEE + rushSurcharge;
  const total = Math.max(MIN_ORDER_VALUE, rawTotal);

  const estimatedPrintHours = printHoursPerUnit * quantity;
  const productionDays = Math.ceil(estimatedPrintHours / 14);
  const estimatedDeliveryDays = request.rush
    ? Math.max(2, productionDays + 1)
    : Math.max(4, productionDays + 3);

  return {
    materialCost: round(materialCost),
    machineCost: round(machineCost),
    setupFee: SETUP_FEE,
    postProcessingCost,
    rushSurcharge: round(rushSurcharge),
    volumeDiscount: round(unitBase * discountRate * quantity),
    unitPrice: round(discountedUnit),
    total: Math.round(total),
    estimatedPrintHours: round(estimatedPrintHours),
    estimatedDeliveryDays,
  };
}
