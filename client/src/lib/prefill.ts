import type { CustomerDetails, QuoteRequest, UploadedFile } from '../types';

/**
 * Det som kan skickas med till beställningsformuläret för att fylla i det i
 * förväg: från en sparad offert, eller från en order som beställs igen.
 *
 * Skickas genom routerns navigeringstillstånd, inte genom adressen – det är
 * kunduppgifter och hör inte i en länk.
 */
export interface CustomOrderPrefill {
  uploaded?: UploadedFile;
  request?: QuoteRequest;
  projectName?: string;
  description?: string;
  customer?: CustomerDetails;
  /** Rad som förklarar varför formuläret redan är fyllt. */
  notice?: string;
}
