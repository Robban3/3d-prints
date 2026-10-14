import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { parseProduction, publicOrder } from '../src/production.ts';
import { ValidationError } from '../src/validation.ts';
import type { AnyOrder } from '../src/types.ts';

it('rejects impossible planning dates, excessive notes and invalid hours', () => {
  for (const input of [{ plannedDate: '2026-02-30' }, { plannedDate: '2026-10-20', dueDate: '2026-10-19' }, { notes: 'x'.repeat(2001) }, { estimatedHours: Infinity }, { estimatedHours: -1 }, { modelIds: ['../secret'] }]) assert.throws(() => parseProduction(input), ValidationError);
  assert.equal(parseProduction({ machine: ' Bambu 1 ', estimatedHours: 3.5 }).machine, 'Bambu 1');
});
it('omits all production details from customer-visible orders', () => {
  const order = { id: 'TEST', production: { notes: 'Internal-only', machine: 'Printer', revision: 1 } } as AnyOrder;
  assert.deepEqual(publicOrder(order), { id: 'TEST' });
});
