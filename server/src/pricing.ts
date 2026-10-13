import { findMaterial, findQuality } from './catalog.ts';
import type { CustomQuoteRequest, Material, QualityLevel, QuoteBreakdown } from './types.ts';

/** Maskintid debiteras per timme och täcker el, slitage och övervakning. */
const MACHINE_RATE_PER_HOUR = 50;
/** Startavgift per order som täcker slicing, uppstart och kvalitetskontroll. */
const SETUP_FEE = 95;
/** Ett normalstort objekt printar ungefär så här många cm³ per timme. */
const THROUGHPUT_CM3_PER_HOUR = 16;

export const QUOTE_LIMITS = {
  volumeCm3: { min: 1, max: 8000 },
  infill: { min: 5, max: 100 },
  quantity: { min: 1, max: 500 },
} as const;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Räknar fram ett pris för ett kundunikt printjobb. Modellen är avsiktligt
 * enkel och förutsägbar: 50 kr per printtimme och 95 kr per order.
 * Material ingår; inga rabatter eller tillval ändrar timpriset.
 *
 * Material och kvalitet skickas in i stället för att slås upp här, så att
 * matematiken förblir ren och går att testa med vilka faktorer som helst.
 * Använd quoteFor() när värdena ska hämtas ur katalogen.
 */
export function calculateQuote(
  request: CustomQuoteRequest,
  _material: Material,
  quality: QualityLevel,
): QuoteBreakdown {
  const quantity = Math.max(1, Math.round(request.quantity));
  const infillRatio = request.infill / 100;

  // Skalet kostar alltid material, fyllningen skalar med fyllnadsgraden.
  const shellShare = 0.35;
  const effectiveVolume = request.volumeCm3 * (shellShare + (1 - shellShare) * infillRatio);

  const printHoursPerUnit = (effectiveVolume / THROUGHPUT_CM3_PER_HOUR) * quality.timeFactor;
  const machineCost = printHoursPerUnit * MACHINE_RATE_PER_HOUR;
  const total = machineCost * quantity + SETUP_FEE;

  const estimatedPrintHours = printHoursPerUnit * quantity;
  const productionDays = Math.ceil(estimatedPrintHours / 14);
  const estimatedDeliveryDays = request.rush
    ? Math.max(2, productionDays + 1)
    : Math.max(4, productionDays + 3);

  return {
    materialCost: 0,
    machineCost: round(machineCost),
    setupFee: SETUP_FEE,
    postProcessingCost: 0,
    rushSurcharge: 0,
    volumeDiscount: 0,
    unitPrice: round(machineCost),
    total: Math.round(total),
    estimatedPrintHours: round(estimatedPrintHours),
    estimatedDeliveryDays,
  };
}

/** Hämtar material och kvalitet ur katalogen och räknar fram priset. */
export async function quoteFor(request: CustomQuoteRequest): Promise<QuoteBreakdown> {
  const [material, quality] = await Promise.all([
    findMaterial(request.material),
    findQuality(request.quality),
  ]);
  if (!material) throw new Error(`Okänt material: ${request.material}`);
  if (!quality) throw new Error(`Okänd kvalitet: ${request.quality}`);
  return calculateQuote(request, material, quality);
}
