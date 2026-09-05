import { describe, expect, it } from 'vitest';
import { formatBytes, formatHours, formatNumber, formatPrice } from '../src/lib/format';

/** Intl använder hårt mellanslag – testerna normaliserar så de blir läsbara. */
const plain = (value: string) => value.replace(/ /g, ' ');

describe('formatPrice', () => {
  it('skriver kronor på svenskt vis utan decimaler', () => {
    expect(plain(formatPrice(349))).toBe('349 kr');
    expect(plain(formatPrice(5686))).toBe('5 686 kr');
    expect(plain(formatPrice(0))).toBe('0 kr');
  });

  it('avrundar ören bort', () => {
    expect(plain(formatPrice(198.6))).toBe('199 kr');
  });
});

describe('formatBytes', () => {
  it('växlar enhet efter storlek', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(plain(formatBytes(42025))).toBe('41 kB');
    expect(plain(formatBytes(100 * 1024 * 1024))).toBe('100 MB');
  });
});

describe('formatHours', () => {
  it('visar minuter under en timme', () => {
    expect(formatHours(0.5)).toBe('30 min');
  });

  it('visar timmar under ett dygn', () => {
    expect(plain(formatHours(6))).toBe('6 h');
    expect(plain(formatHours(11.5))).toBe('11,5 h');
  });

  it('visar dygn och timmar för långa jobb', () => {
    expect(formatHours(24)).toBe('1 d');
    expect(formatHours(42)).toBe('1 d 18 h');
  });
});

describe('formatNumber', () => {
  it('använder svenskt decimaltecken', () => {
    expect(formatNumber(4.7)).toBe('4,7');
  });
});
