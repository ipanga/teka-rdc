import { describe, expect, it } from 'vitest';
import {
  describeEffective,
  formatRatePercent,
  parsePercentInput,
  rateToApiNumber,
  rateToPercentInput,
  rateToUnits,
  unitsToRate,
} from './commission';

describe('rate ↔ units (Decimal(5,4) fractions, integer math)', () => {
  it('parses API fraction strings exactly', () => {
    expect(rateToUnits('0.0825')).toBe(825);
    expect(rateToUnits('0.1')).toBe(1000);
    expect(rateToUnits('0.1000')).toBe(1000);
    expect(rateToUnits('0')).toBe(0);
    expect(rateToUnits('1')).toBe(10000);
    expect(rateToUnits(0.05)).toBe(500);
  });
  it('rejects garbage, negatives, > 1 and > 4 decimals', () => {
    expect(rateToUnits(null)).toBeNull();
    expect(rateToUnits('abc')).toBeNull();
    expect(rateToUnits('-0.1')).toBeNull();
    expect(rateToUnits('1.0001')).toBeNull();
    expect(rateToUnits('0.12345')).toBeNull();
  });
  it('round-trips through unitsToRate without float drift', () => {
    for (const u of [0, 1, 825, 1000, 1234, 9999, 10000]) {
      expect(rateToUnits(unitsToRate(u))).toBe(u);
    }
    expect(unitsToRate(825)).toBe('0.0825');
    expect(unitsToRate(1000)).toBe('0.1');
    expect(unitsToRate(10000)).toBe('1');
  });
});

describe('formatRatePercent (French)', () => {
  it('formats with a comma and no trailing zeros', () => {
    expect(formatRatePercent('0.0825')).toBe('8,25 %');
    expect(formatRatePercent('0.1')).toBe('10 %');
    expect(formatRatePercent('0.105')).toBe('10,5 %');
    expect(formatRatePercent('0')).toBe('0 %');
    expect(formatRatePercent('1')).toBe('100 %');
    expect(formatRatePercent(null)).toBe('—');
  });
  it('prefills the percent input from a fraction', () => {
    expect(rateToPercentInput('0.0825')).toBe('8,25');
    expect(rateToPercentInput('0.1')).toBe('10');
    expect(rateToPercentInput(null)).toBe('');
  });
});

describe('parsePercentInput (operator types a percentage)', () => {
  it('accepts comma or dot, 0–100, ≤ 2 decimals, and yields the exact API fraction', () => {
    expect(parsePercentInput('8,25')).toEqual({ rate: '0.0825', units: 825 });
    expect(parsePercentInput('8.25')).toEqual({ rate: '0.0825', units: 825 });
    expect(parsePercentInput(' 10 ')).toEqual({ rate: '0.1', units: 1000 });
    expect(parsePercentInput('0')).toEqual({ rate: '0', units: 0 });
    expect(parsePercentInput('100')).toEqual({ rate: '1', units: 10000 });
    expect(parsePercentInput('0,5')).toEqual({ rate: '0.005', units: 50 });
  });
  it('rejects empty, negative, > 100, > 2 decimals and non-numeric input', () => {
    expect(parsePercentInput('')).toHaveProperty('error');
    expect(parsePercentInput('-5')).toHaveProperty('error');
    expect(parsePercentInput('100,01')).toEqual({ error: 'Le taux ne peut pas dépasser 100 %.' });
    expect(parsePercentInput('8,255')).toHaveProperty('error');
    expect(parsePercentInput('dix')).toHaveProperty('error');
    expect(parsePercentInput('NaN')).toHaveProperty('error');
    expect(parsePercentInput('1e2')).toHaveProperty('error');
  });
  it('the API number has at most 4 decimals', () => {
    const r = parsePercentInput('8,25');
    if ('error' in r) throw new Error(r.error);
    expect(rateToApiNumber(r.rate)).toBe(0.0825);
    expect(String(rateToApiNumber(r.rate)).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('describeEffective — no ambiguous percentages', () => {
  it('seller override: says it is specific and that category/default do not apply', () => {
    const s = describeEffective({ overrideRate: '0.05', platformDefaultRate: '0.1', effectiveRate: '0.05', effectiveSource: 'SELLER', activeCategoryOverrides: 3 });
    expect(s).toContain('5 %');
    expect(s).toContain('taux spécifique');
    expect(s).not.toContain('10 %');
  });
  it('platform default: names the default and the category exception when there is one', () => {
    const none = describeEffective({ overrideRate: null, platformDefaultRate: '0.1', effectiveRate: '0.1', effectiveSource: 'GLOBAL', activeCategoryOverrides: 0 });
    expect(none).toContain('taux par défaut de la plateforme, 10 %');
    expect(none).not.toContain('Exception');
    const one = describeEffective({ overrideRate: null, platformDefaultRate: '0.1', effectiveRate: '0.1', effectiveSource: 'GLOBAL', activeCategoryOverrides: 1 });
    expect(one).toContain('1 catégorie a un taux propre');
    const many = describeEffective({ overrideRate: null, platformDefaultRate: '0.1', effectiveRate: '0.1', effectiveSource: 'GLOBAL', activeCategoryOverrides: 2 });
    expect(many).toContain('2 catégories ont un taux propre');
  });
  it('nothing configured: never fabricates a rate', () => {
    const s = describeEffective({ overrideRate: null, platformDefaultRate: null, effectiveRate: null, effectiveSource: null, activeCategoryOverrides: 0 });
    expect(s).toContain('Aucun taux par défaut');
    expect(s).not.toMatch(/\d+ %/);
  });
});
