import { Decimal } from '@prisma/client/runtime/library';
import {
  blendedRate,
  commissionFor,
  rateToUnits,
  unitsToRate,
} from './commission-math';

// Integer commission arithmetic — no floats anywhere in money math. Rounding
// is HALF-UP to the centime and pinned here so a change is a visible decision.
describe('commission-math', () => {
  it('rateToUnits maps Decimal(5,4) exactly to ten-thousandths', () => {
    expect(rateToUnits(new Decimal('0.1000'))).toBe(1000n);
    expect(rateToUnits('0.0825')).toBe(825n);
    expect(rateToUnits(0)).toBe(0n);
    expect(rateToUnits(1)).toBe(10000n);
  });

  it('rateToUnits rejects out-of-range or over-precise rates', () => {
    expect(() => rateToUnits(-0.01)).toThrow(RangeError);
    expect(() => rateToUnits(1.5)).toThrow(RangeError);
    expect(() => rateToUnits('0.12345')).toThrow(RangeError);
    expect(() => rateToUnits(NaN)).toThrow(RangeError);
  });

  it('unitsToRate round-trips', () => {
    expect(unitsToRate(825n).toString()).toBe('0.0825');
    expect(unitsToRate(rateToUnits('0.1')).toFixed(4)).toBe('0.1000');
  });

  it('commissionFor: exact when divisible', () => {
    expect(commissionFor(1_000_000n, 1000n)).toBe(100_000n); // 10% of 10.000 FC
    expect(commissionFor(0n, 1000n)).toBe(0n);
    expect(commissionFor(1_000_000n, 0n)).toBe(0n);
  });

  it('commissionFor rounds half-up on the centime', () => {
    // 333.333 × 0.10 = 33 333.3 → 33 333
    expect(commissionFor(333_333n, 1000n)).toBe(33_333n);
    // 5 × 0.10 = 0.5 → 1 (half-up)
    expect(commissionFor(5n, 1000n)).toBe(1n);
    // 4 × 0.10 = 0.4 → 0
    expect(commissionFor(4n, 1000n)).toBe(0n);
    // 15 × 0.0825 = 1.2375 → 1
    expect(commissionFor(15n, 825n)).toBe(1n);
    // 1 × 0.5 = 0.5 → 1
    expect(commissionFor(1n, 5000n)).toBe(1n);
  });

  it('commissionFor never uses floating point (large amounts stay exact)', () => {
    // 9 007 199 254 740 993 centimes is beyond Number's safe integer range.
    const big = 9_007_199_254_740_993n;
    expect(commissionFor(big, 1000n)).toBe(900_719_925_474_099n);
  });

  it('commissionFor rejects negative amounts', () => {
    expect(() => commissionFor(-1n, 1000n)).toThrow(RangeError);
  });

  it('blendedRate expresses a mixed commission as Decimal(5,4), half-up', () => {
    // 100 000 gross, 12 345 commission → 0.12345 → 0.1235 (half-up on 4th decimal)
    expect(blendedRate(12_345n, 100_000n).toFixed(4)).toBe('0.1235');
    expect(blendedRate(0n, 0n).toString()).toBe('0');
  });
});
