# Delivery Fees & Currency Display (FC)

_Last updated 2026-06-28._

## Money storage convention

- **All monetary amounts are stored in MINOR units as `BigInt`**: CDF in **centimes** (1 CDF = 100
  centimes), USD in **cents** (1 USD = 100 cents). Applies to `Product.priceCDF/priceUSD`,
  `discountPrice*`, `OrderItem` prices, `Order` totals, `Transaction` amounts, and `DeliveryZone.feeCDF/feeUSD`.
- `BigInt` is serialized to JSON as a **string** via the `BigInt.prototype.toJSON` polyfill in
  `apps/api/src/main.ts`. Clients parse these strings; never do float math on money.
- **Forms accept MAJOR units** and convert at the edge: the seller product form and the admin delivery-zone
  form multiply by 100 on submit and divide by 100 on load. (The delivery-zone form was fixed 2026-06-28 — it
  previously sent raw input, storing fees 100× too small.)

## Currency display: "FC", not "CDF"

DRC users call the Congolese Franc **FC**. The **user-facing label is "FC"** everywhere (web + mobile +
emails + notifications). The ISO code `'CDF'` and all `*CDF` field/column names are **kept unchanged** in
code and the database.

- `Intl.NumberFormat({ style: 'currency', currency: 'CDF' })` *renders the literal "CDF"*, so formatters were
  changed to output a plain number + `" FC"` (web `formatCDF`, mobile `price_formatter.dart` `symbol:'FC'`).
- USD keeps its existing display (`"$US"`), e.g. `1,20 $US`.
- JSON-LD `priceCurrency: 'CDF'` (buyer-web product pages) **stays ISO** — required for valid structured data
  / SEO.
- Example formatting: `30 000 FC`, `90 000 FC`, `1,20 $US`.

## Delivery-fee calculation rule

Single source of truth: `CheckoutService.resolveDeliveryFee()` → `DeliveryZonesService.estimateFee()`, used
by **both** `checkout()` (charge) and `quote()` (preview) so the previewed fee always equals the charged fee.

1. **Origin (`fromTown`)** = the seller's city name (`SellerProfile.cityId → City.name`, falling back to
   `location`, then `'Lubumbashi'`).
2. **Destination (`toTown`)** = the buyer's city name (`Address.cityId → City.name`, falling back to the
   free-form `Address.town`). Resolving via city means a commune-level town (e.g. "Ruashi") still maps to its
   city ("Lubumbashi").
3. **Match** an active `DeliveryZone` on `(fromTown, toTown)` — **trim + case-insensitive**.
4. If found → charge `feeCDF`/`feeUSD`. The fee is snapshotted on the order (`Order.deliveryFeeCDF`).

### No matching zone → BLOCK (no silent default)

If no active zone covers the route, `estimateFee` returns `{ found: false }` (it no longer charges a 5000 CDF
default). Then:

- `checkout()` throws a friendly French `BadRequestException`:
  _"Aucune zone de livraison disponible pour cette adresse. Veuillez vérifier votre ville de livraison."_ — the
  order is **not created** (never undercharged).
- `quote()` returns `deliveryAvailable: false` (overall + per-seller). Buyer-web and buyer-mobile **disable the
  "Confirmer la commande" button** and show the block message — they never display a misleading "Gratuit" on
  failure.

### Multi-seller carts

The cart is **grouped by seller**; checkout creates **one Order per seller**, each with its own delivery fee
(per-seller origin city). Delivery is computed and charged per seller group — multi-origin carts are never
undercharged. `quote()` returns a `sellerQuotes[]` breakdown plus summed totals.

## Operational notes (prod)

- **Zone coverage:** every active-city route (Lubumbashi/Kolwezi, intra + inter, + Likasi for the future) must
  have an active `DeliveryZone` row, or those orders are blocked. Manage at `admin.teka.cd/dashboard/delivery-zones`.
- **Audit any 100×-off rows:** zones entered via the old (pre-2026-06-28) admin form may have stored whole
  francs as centimes (100× too small). Open each in "Modifier" — the value should read as whole FC (e.g. `3000`,
  not `300000`). Correct and re-save if needed.
