import type { AnyOrder, ProductionPlan } from './types.ts';
import { ValidationError } from './validation.ts';

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
