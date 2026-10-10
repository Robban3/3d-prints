import { describe, expect, it } from 'vitest';
import { sharedNext } from '../src/lib/bulk';

describe('sharedNext', () => {
  it('är tom utan markerade ordrar', () => {
    expect(sharedNext([])).toEqual([]);
  });

  it('ger en ensam orders egna steg', () => {
    expect(sharedNext([{ next: ['i_produktion', 'avbruten'] }])).toEqual([
      'i_produktion',
      'avbruten',
    ]);
  });

  it('behåller bara det alla kan', () => {
    expect(
      sharedNext([{ next: ['i_produktion', 'avbruten'] }, { next: ['skickad', 'avbruten'] }]),
    ).toEqual(['avbruten']);
  });

  it('ger inget alls när ordrarna står på olika ställen', () => {
    expect(sharedNext([{ next: ['i_produktion'] }, { next: ['levererad'] }])).toEqual([]);
  });

  it('en order utan nästa steg stoppar hela urvalet', () => {
    expect(sharedNext([{ next: ['skickad'] }, { next: [] }])).toEqual([]);
  });

  it('behåller ordningen från den första ordern', () => {
    expect(
      sharedNext([{ next: ['i_produktion', 'avbruten'] }, { next: ['avbruten', 'i_produktion'] }]),
    ).toEqual(['i_produktion', 'avbruten']);
  });
});
