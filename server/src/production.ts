import type { AnyOrder, ProductionPlan } from './types.ts';
import { ValidationError } from './validation.ts';

export interface ProductionCheck { id: string; label: string; status: 'ok' | 'missing' | 'review'; detail: string }

/** Checks saved data only. Does not claim that slicing, payment capture or a test print happened. */
export function productionChecks(order: AnyOrder, files: Array<{ id: string; present: boolean }>): ProductionCheck[] {
  const plan = order.production;
  const requiredFiles = [...(plan?.modelIds ?? []), ...(order.type === 'custom' && order.fileId ? [order.fileId] : [])];
  const hasArticles = order.type === 'custom' ? /^FL-K-\d{4,}$/.test(order.articleNumber ?? '') : order.lines.length > 0 && order.lines.every(line => /^FL-P-\d{4,}-\d{3,}$/.test(line.articleNumber ?? ''));
  const dimensions = order.type === 'custom' ? undefined : order.lines.every(line => line.productionSpecs && Object.values(line.productionSpecs.dimensions).every(value => Number.isFinite(value) && value > 0));
  return [
    { id: 'articles', label: 'Artikelnummer', status: hasArticles ? 'ok' : 'missing', detail: hasArticles ? 'Ordern har sparade artikelnummer.' : 'Artikelnummer saknas på en eller flera äldre orderrader.' },
    { id: 'files', label: 'Kopplade modellfiler', status: requiredFiles.length && requiredFiles.every(id => files.some(file => file.id === id && file.present)) ? 'ok' : 'missing', detail: requiredFiles.length ? `${requiredFiles.filter(id => files.some(file => file.id === id && file.present)).length} av ${requiredFiles.length} kopplade filer finns och har rätt storlek.` : 'Koppla modellfil till det sparade produktionskortet.' },
    { id: 'machine', label: 'Vald skrivare', status: plan?.machine ? 'ok' : 'missing', detail: plan?.machine || 'Välj vilken skrivare jobbet ska köras på.' },
    { id: 'hours', label: 'Planerad printtid', status: plan?.estimatedHours && plan.estimatedHours > 0 ? 'ok' : 'missing', detail: plan?.estimatedHours ? `${plan.estimatedHours} timmar planerade; kontrollera mot slicern.` : 'Spara printtid från rätt slicerprofil.' },
    { id: 'specs', label: 'Mått och material', status: order.type === 'custom' || !dimensions || order.lines.some(line => line.productionSpecs?.estimated) ? 'review' : 'ok', detail: order.type === 'custom' ? `Kundjobb: ${order.request.material.toUpperCase()}, ${order.request.quality}, ${order.request.quantity} st. Mått måste kontrolleras i modellen.` : dimensions ? 'Mått och material är sparade på ordern. Preliminära värden måste kontrolleras mot modellen och slicern.' : 'Äldre order saknar en fullständig kopia av produktionsspecifikationerna.' },
    { id: 'payment', label: 'Betalningskontroll', status: 'review', detail: order.payment?.test ? 'Testläge: ingen betalning har genomförts.' : order.payment?.status === 'auktoriserad' ? 'Auktorisering finns; skarp debitering måste verifieras separat.' : 'Ingen verifierad debitering finns i orderunderlaget.' },
    { id: 'physical', label: 'Slutlig verkstadskontroll', status: 'review', detail: 'Kontrollera orientering, stöd, filament, passform och provutskrift. Denna datakontroll godkänner inte automatiskt modellen för produktion.' },
  ];
}

export function publicOrder<T extends AnyOrder>(order: T): Omit<T, 'production'> {
  const { production, ...visible } = order;
  return visible;
}

export function parseProduction(input: unknown): Omit<ProductionPlan, 'revision'> {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const errors: Record<string, string> = {};
  function text(key: string, max: number) {
    const value = raw[key] ?? '';
    if (typeof value !== 'string' || value.length > max) { errors[`production.${key}`] = `Ange text med högst ${max} tecken.`; return ''; }
    return value.trim();
  }
  const machine = text('machine', 100), notes = text('notes', 2000);
  function date(key: string) {
    const value = text(key, 10);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors[`production.${key}`] = 'Ange ett giltigt datum.';
    return value;
  }
  const plannedDate = date('plannedDate'), dueDate = date('dueDate');
  if (plannedDate && dueDate && dueDate < plannedDate) errors['production.dueDate'] = 'Klardatum kan inte ligga före startdatum.';
  const estimatedHours = raw.estimatedHours ?? null;
  if (estimatedHours !== null && (typeof estimatedHours !== 'number' || !Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 20000)) errors['production.estimatedHours'] = 'Ange 0–20 000 timmar.';
  const ids = raw.modelIds ?? [];
  if (!Array.isArray(ids) || ids.length > 10 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id))) errors['production.modelIds'] = 'Välj högst tio printfiler från biblioteket.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { machine, notes, plannedDate, dueDate, estimatedHours: estimatedHours as number | null, modelIds: [...new Set(ids as string[])] };
}
