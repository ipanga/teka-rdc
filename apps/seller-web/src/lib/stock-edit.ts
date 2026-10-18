/**
 * Stock edit payload for `PATCH /v1/sellers/products/:id`.
 *
 * The quantity a seller types is ABSOLUTE ("I have N"), while orders and
 * cancellations move the stored stock meanwhile. Sending the value the form
 * was loaded with as `expectedQuantity` lets the API refuse (409) an edit
 * based on a stale number instead of silently overwriting a sale or a
 * cancellation restock; an unchanged field (`quantity === expectedQuantity`)
 * writes nothing at all. The API stays the only place that computes stock.
 */
export function stockEditFields(
  entered: number,
  loaded: number | null | undefined,
): { quantity: number; expectedQuantity?: number } {
  return typeof loaded === 'number'
    ? { quantity: entered, expectedQuantity: loaded }
    : { quantity: entered };
}

/** The API's « stock changed meanwhile » refusal. */
export function isStockConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { status?: unknown }).status === 409
  );
}
