/**
 * Date-window resolution for admin reports.
 *
 * Three things this fixes, all of which were wrong before:
 *
 * 1. **Timezone.** Teka operates in Haut-Katanga and Lualaba, i.e.
 *    Africa/Lubumbashi = CAT = UTC+2, with no DST ever. Bucketing a report day
 *    in UTC puts every 22:00–00:00 local delivery on the *previous* day, which
 *    is visible and wrong to an admin reading yesterday's sales.
 *
 * 2. **Boundary.** The previous helper did `new Date(dateTo)` then
 *    `setHours(23, 59, 59, 999)` — server-local, so the window silently moved
 *    with the container's TZ, and anything landing in the final millisecond of
 *    the day was dropped. A half-open `[gte, lt)` window has no such hole and
 *    is timezone-explicit.
 *
 * 3. **Consistency.** Range endpoints and day buckets now derive from the same
 *    offset, so a total can never disagree with the sum of its own daily rows.
 *
 * Deliberate divergence: `AdminStatsService` still buckets its dashboard trends
 * in raw UTC. It is NOT retrofitted here — doing so would change numbers that
 * are already on screen and shipped, which belongs in its own change.
 *
 * A fixed offset is exact for this timezone, so no date library is introduced
 * (the repo has none — no date-fns, luxon or dayjs anywhere).
 */

/** Africa/Lubumbashi — CAT, UTC+2, no daylight saving. */
export const REPORT_TZ_OFFSET = '+02:00';

/** A half-open date window: `gte <= x < lt`. */
export interface ReportWindow {
  gte?: Date;
  lt?: Date;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Narrows an incoming date to its `YYYY-MM-DD` part.
 *
 * admin-web sends `<input type="date">` values, which are already date-only,
 * but a full ISO timestamp is accepted too: taking the calendar date keeps the
 * "a report day is a CAT day" rule unambiguous rather than half-honouring an
 * instant the caller probably did not mean.
 */
function toDateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const head = value.slice(0, 10);
  return DATE_ONLY.test(head) ? head : undefined;
}

/** The calendar day after `YYYY-MM-DD`, without drifting across month ends. */
function nextDay(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Midnight CAT on the given calendar day, as an absolute instant. */
function startOfDayCat(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00${REPORT_TZ_OFFSET}`);
}

/**
 * Builds the half-open window for a report query.
 *
 * `dateTo` is INCLUSIVE to the caller — an admin picking 30 June expects
 * 30 June's orders — so `lt` is midnight CAT on 1 July.
 */
export function resolveWindow(dateFrom?: string, dateTo?: string): ReportWindow {
  const from = toDateOnly(dateFrom);
  const to = toDateOnly(dateTo);

  const window: ReportWindow = {};
  if (from) window.gte = startOfDayCat(from);
  if (to) window.lt = startOfDayCat(nextDay(to));
  return window;
}

/**
 * Wraps `resolveWindow` as a Prisma filter on one date column, or `{}` when
 * neither bound was supplied (so the caller can spread it unconditionally).
 *
 * The column matters: an order *ledger* is keyed on `createdAt` (when it was
 * placed), while anything counting completed sales must key on `deliveredAt`
 * — that is the moment `markDelivered()` recognises the revenue.
 */
export function windowFilterFor<F extends string>(
  field: F,
  dateFrom?: string,
  dateTo?: string,
): Record<F, ReportWindow> | Record<string, never> {
  const window = resolveWindow(dateFrom, dateTo);
  if (!window.gte && !window.lt) return {};
  return { [field]: window } as Record<F, ReportWindow>;
}
