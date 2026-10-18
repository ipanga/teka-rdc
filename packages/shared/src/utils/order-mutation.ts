/**
 * Applies the authoritative result of a SUCCESSFUL order mutation (cancel,
 * reject, confirm, transition…) to the order a client already shows.
 *
 * Mutation endpoints return the updated order, but with a partial `include`
 * (e.g. the 5 latest status logs, trimmed item fields). Clients used to drop
 * that response and rely on a second GET; on an unreliable network that GET
 * can fail, leaving « Commande annulée » next to a stale « En attente » badge.
 *
 * Rules: only fields the server actually returned are copied, and only the
 * status / payment / audit ones — never stock, never anything computed here.
 * Everything else (items with product links, address snapshot, seller…) is
 * kept from `current`. Status logs are merged by id (newest first), so the
 * shorter list in the response never truncates the timeline. Anything that is
 * not an order-shaped object leaves `current` untouched.
 */
const AUTHORITATIVE_FIELDS = [
  'status',
  'paymentStatus',
  'cancellationReason',
  'cancelledBy',
  'deliveredAt',
  'returnedAt',
  'updatedAt',
] as const;

interface LogLike {
  id: string;
  createdAt: string;
}

function isLogArray(value: unknown): value is LogLike[] {
  return (
    Array.isArray(value) &&
    value.every(
      (l) => l && typeof l === 'object' && typeof (l as LogLike).id === 'string',
    )
  );
}

export function mergeOrderMutation<T extends object>(current: T, mutated: unknown): T {
  if (!mutated || typeof mutated !== 'object') return current;
  const source = mutated as Record<string, unknown>;
  if (typeof source.status !== 'string') return current;
  const target = current as Record<string, unknown>;
  if (typeof target.id === 'string' && typeof source.id === 'string' && source.id !== target.id) {
    return current; // a response for another order is never applied
  }

  const next: Record<string, unknown> = { ...target };
  for (const field of AUTHORITATIVE_FIELDS) {
    if (field in source && source[field] !== undefined) next[field] = source[field];
  }

  if (isLogArray(source.statusLogs)) {
    const previous = isLogArray(target.statusLogs) ? target.statusLogs : [];
    const byId = new Map<string, LogLike>();
    for (const log of previous) byId.set(log.id, log);
    for (const log of source.statusLogs) byId.set(log.id, { ...byId.get(log.id), ...log });
    next.statusLogs = [...byId.values()].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  }
  return next as T;
}
