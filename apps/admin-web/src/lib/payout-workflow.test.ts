import { describe, expect, it } from 'vitest';
import {
  ACTION_META,
  PAYOUT_STATUSES,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  allowedActions,
  describeActionError,
  methodLabel,
  rejectLabel,
  validateReason,
  validateReference,
} from './payout-workflow';

describe('allowedActions mirrors the API state machine', () => {
  it('REQUESTED: approve or reject only (no payment possible before authorization)', () => {
    expect(allowedActions('REQUESTED')).toEqual(['approve', 'reject']);
  });
  it('APPROVED: start the transfer, mark paid, or reject', () => {
    expect(allowedActions('APPROVED')).toEqual(['process', 'complete', 'reject']);
  });
  it('PROCESSING: mark paid or reject (D1 — a failed transfer is not a dead end)', () => {
    expect(allowedActions('PROCESSING')).toEqual(['complete', 'reject']);
    expect(rejectLabel('PROCESSING')).toBe('Transfert échoué');
  });
  it('terminal states expose no action at all', () => {
    for (const s of TERMINAL_STATUSES) expect(allowedActions(s)).toEqual([]);
    expect(allowedActions('WHATEVER')).toEqual([]);
  });
  it('every status has a distinct label and approval is never worded as payment', () => {
    const labels = PAYOUT_STATUSES.map((s) => STATUS_LABELS[s]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(STATUS_LABELS.APPROVED.toLowerCase()).not.toContain('payé');
    expect(STATUS_LABELS.PROCESSING.toLowerCase()).not.toContain('payé');
    expect(STATUS_LABELS.COMPLETED).toBe('Payé');
  });
  it('actions map to the API endpoints', () => {
    expect(Object.values(ACTION_META).map((a) => a.endpoint)).toEqual(['approve', 'process', 'complete', 'reject']);
  });
});

describe('validation mirrors the DTOs', () => {
  it('reason: 5–500 chars after trim', () => {
    expect(validateReason('   ')).toMatch(/au moins 5/);
    expect(validateReason('abcd')).toMatch(/au moins 5/);
    expect(validateReason('  Numéro erroné ')).toBeNull();
    expect(validateReason('x'.repeat(501))).toMatch(/trop longue/);
  });
  it('reference: required, ≤ 200 chars', () => {
    expect(validateReference('')).toMatch(/requise/);
    expect(validateReference('  ')).toMatch(/requise/);
    expect(validateReference('MPESA-ABC123')).toBeNull();
    expect(validateReference('x'.repeat(201))).toMatch(/trop longue/);
  });
});

describe('describeActionError', () => {
  it('409 is a stale/concurrent state → refresh, never assume success', () => {
    const r = describeActionError({ status: 409, message: 'Impossible de finaliser un retrait avec le statut "COMPLETED" (payé).' });
    expect(r.stale).toBe(true);
    expect(r.message).toContain('COMPLETED');
    expect(r.message).toContain('actualisé');
  });
  it('404 is stale too', () => {
    expect(describeActionError({ status: 404 }).stale).toBe(true);
  });
  it('other errors keep the API message and are not stale', () => {
    const r = describeActionError({ status: 400, message: 'La raison du rejet doit contenir au moins 5 caractères' });
    expect(r.stale).toBe(false);
    expect(r.message).toMatch(/5 caractères/);
    expect(describeActionError(new Error('boom')).message).toBe('boom');
  });
});

describe('methodLabel', () => {
  it('maps the API enum values and falls back to the raw value', () => {
    expect(methodLabel('M_PESA')).toBe('M-Pesa (Vodacom)');
    expect(methodLabel('AIRTEL_MONEY')).toBe('Airtel Money');
    expect(methodLabel('ORANGE_MONEY')).toBe('Orange Money');
    expect(methodLabel('CASH')).toBe('CASH');
    expect(methodLabel(null)).toBe('—');
  });
});
