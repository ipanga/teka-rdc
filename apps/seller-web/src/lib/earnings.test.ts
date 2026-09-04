import { describe, expect, it } from 'vitest';
import { EARNING_STATE_LABELS, earningStateOf, formatCommissionRate } from './earnings';

describe('formatCommissionRate (defect 12: "0.1%" was shown for a 10 % rate)', () => {
  it('renders a Decimal(5,4) fraction as a French percent', () => {
    expect(formatCommissionRate('0.1')).toBe('10 %');
    expect(formatCommissionRate('0.1000')).toBe('10 %');
    expect(formatCommissionRate('0.0825')).toBe('8,25 %');
    expect(formatCommissionRate('0.125')).toBe('12,5 %');
    expect(formatCommissionRate('0')).toBe('0 %');
    expect(formatCommissionRate(null)).toBe('—');
    expect(formatCommissionRate('abc')).toBe('—');
  });
});

describe('earning state labels', () => {
  it('uses the API state and only calls an earning « Disponible » when it is', () => {
    expect(EARNING_STATE_LABELS[earningStateOf({ state: 'HELD', isPaid: false })]).toBe('En attente (retour possible)');
    expect(EARNING_STATE_LABELS[earningStateOf({ state: 'RESERVED', isPaid: false })]).toBe('Réservé (virement en cours)');
    expect(EARNING_STATE_LABELS[earningStateOf({ state: 'REVERSED', isPaid: false })]).toBe('Annulé');
    expect(EARNING_STATE_LABELS[earningStateOf({ state: 'AVAILABLE', isPaid: false })]).toBe('Disponible');
  });
  it('falls back to the isPaid split for responses without a state (older API)', () => {
    expect(earningStateOf({ isPaid: true })).toBe('PAID');
    expect(earningStateOf({ isPaid: false, state: 'BOGUS' })).toBe('AVAILABLE');
  });
});
