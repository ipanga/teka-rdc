import { Decimal } from '@prisma/client/runtime/library';

/**
 * Integer commission arithmetic (no floating point — Rule: money is BigInt
 * centimes, rates are Decimal(5,4)).
 *
 * A Decimal(5,4) rate is exactly representable as an integer number of
 * ten-thousandths ("rate units", 0 … 10 000). Commission on an amount is then
 *   amount × units / 10 000
 * rounded HALF-UP to the centime: the remainder ≥ 5 000 / 10 000 rounds up.
 * Half-up is the documented convention (a 0.5-centime commission rounds to 1
 * centime in Teka's favour); tests pin it.
 */
export const RATE_SCALE = 10_000n;

/** Decimal(5,4) → integer ten-thousandths. Throws on anything outside [0, 1]. */
export function rateToUnits(rate: Decimal | string | number): bigint {
  const d = new Decimal(rate);
  if (d.isNaN() || !d.isFinite() || d.lt(0) || d.gt(1)) {
    throw new RangeError(`Taux de commission invalide : ${d.toString()}`);
  }
  const scaled = d.mul(Number(RATE_SCALE));
  if (!scaled.isInteger()) {
    throw new RangeError(
      `Taux de commission avec plus de 4 décimales : ${d.toString()}`,
    );
  }
  return BigInt(scaled.toFixed(0));
}

/** Integer ten-thousandths → Decimal(5,4). */
export function unitsToRate(units: bigint): Decimal {
  return new Decimal(units.toString()).div(Number(RATE_SCALE));
}

/** Commission (centimes) on `amountCDF` at `units` ten-thousandths, half-up. */
export function commissionFor(amountCDF: bigint, units: bigint): bigint {
  if (amountCDF < 0n) {
    throw new RangeError('Montant négatif pour le calcul de commission');
  }
  const numerator = amountCDF * units;
  const q = numerator / RATE_SCALE;
  const r = numerator % RATE_SCALE;
  return r * 2n >= RATE_SCALE ? q + 1n : q;
}

/**
 * Blended rate of a multi-line commission as Decimal(5,4), half-up on the 4th
 * decimal. Display-only: the per-line snapshot on OrderItem is the truth.
 */
export function blendedRate(commissionCDF: bigint, grossCDF: bigint): Decimal {
  if (grossCDF <= 0n) return new Decimal(0);
  const numerator = commissionCDF * RATE_SCALE;
  const q = numerator / grossCDF;
  const r = numerator % grossCDF;
  const units = r * 2n >= grossCDF ? q + 1n : q;
  return unitsToRate(units);
}
