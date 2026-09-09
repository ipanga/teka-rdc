import { describe, expect, it } from 'vitest';
import {
  coolingOffNotice,
  destinationChanged,
  formatAvailableAt,
  hasSavedDestination,
  isCoolingOff,
  validateDestinationDraft,
} from './payout-destination';

const saved = {
  payoutMethod: 'M_PESA',
  payoutPhone: '+243970000001',
  changedAt: null,
  payoutsAvailableAt: null,
};

describe('S12 payout destination helpers', () => {
  it('cooling-off is true only while payoutsAvailableAt is in the future', () => {
    const now = Date.parse('2026-09-09T10:00:00Z');
    expect(isCoolingOff(null, now)).toBe(false);
    expect(isCoolingOff('2026-09-09T09:59:59Z', now)).toBe(false);
    expect(isCoolingOff('2026-09-10T10:00:00Z', now)).toBe(true);
    expect(isCoolingOff('not-a-date', now)).toBe(false);
  });

  it('the notice names the reopen time in French, Lubumbashi time, and is null when open', () => {
    const now = Date.parse('2026-09-09T10:00:00Z');
    expect(coolingOffNotice(null, now)).toBeNull();
    const text = coolingOffNotice('2026-09-10T08:05:00Z', now);
    expect(text).toMatch(/^Destination modifiée récemment/);
    expect(text).toContain('10 septembre 2026');
    expect(text).toContain('10:05'); // 08:05 UTC = 10:05 in Lubumbashi
    expect(formatAvailableAt('2026-09-10T08:05:00Z')).toBe('10 septembre 2026 à 10:05');
  });

  it('only a real change needs the password; an unchanged destination validates without one', () => {
    expect(destinationChanged(saved, { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })).toBe(false);
    expect(destinationChanged(saved, { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243970000001' })).toBe(true);
    expect(destinationChanged(null, { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' })).toBe(true);
    expect(validateDestinationDraft(saved, { payoutMethod: 'M_PESA', payoutPhone: '+243970000001' }, '')).toBeNull();
    expect(validateDestinationDraft(saved, { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002' }, '')).toMatch(/mot de passe est requis/);
    expect(validateDestinationDraft(saved, { payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000002' }, 'x')).toBeNull();
  });

  it('refuses a bad operator or phone before anything is sent', () => {
    expect(validateDestinationDraft(saved, { payoutMethod: 'CASH', payoutPhone: '+243970000001' }, 'x')).toMatch(/opérateur/);
    expect(validateDestinationDraft(saved, { payoutMethod: 'M_PESA', payoutPhone: '0970000001' }, 'x')).toMatch(/\+243XXXXXXXXX/);
  });

  it('a destination counts as saved only with both fields', () => {
    expect(hasSavedDestination(saved)).toBe(true);
    expect(hasSavedDestination({ ...saved, payoutPhone: null })).toBe(false);
    expect(hasSavedDestination(null)).toBe(false);
  });
});
