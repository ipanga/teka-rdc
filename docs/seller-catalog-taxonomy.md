# Seller Catalog Taxonomy — leaf-category invariant

**Started:** 2026-09-02
**Surfaces:** `apps/api`, `apps/seller-web` (seller-mobile needed no change)
**Status:** Phase 1 complete on `fix/leaf-category-invariant`; PR #615 open against `develop`, not merged
**Scope note:** Phase 1 only. Workstreams B (search analytics), C (sales analytics) and D (CSV) are
deliberately NOT started — see "Next phase".

## Reported defect

While editing the quantity of a men's shirt, Seller Mobile showed **« Type de peau »** under
*Caractéristiques du produit*.

Product: <https://teka.cd/lubumbashi/lot-de-2-chemises-de-bureau-pour-homme-en-coton-a-manches-longues-bleu-et-noir-h0d799>

## Diagnosis (production, via the public browse API — no DB access)

| Field | Value |
|---|---|
| Product ID | `1a07d699-f9d5-42da-aa23-b999bc84ef37` (`shortCode` `h0d799`) |
| Status | ACTIVE |
| categoryId | `13000000-…-000000000501` = **`Mode > Homme`** — an INTERMEDIATE node |
| Ancestry | `Mode › Homme` (2 levels; a leaf product would show 3) |
| Leaf? | No — 8 children, all with 0 products |
| Specifications | 3, referencing `14000000-…-0000000401 01/02/03` |

Those three attribute ids belong to **`Électroménager > Cuisine`** (`Taille`/`Couleur`/`Matière`), so the
shirt's real values (`M` / `Bleu` / `Coton`) render in **no** seller form. `Type de peau` is **not**
attached to the product — it is served to the *form* because `Mode > Homme` carries it.

Legacy rows still sitting on intermediate nodes:

| Node | Rows |
|---|---|
| `Mode > Homme` | `Type`, **`Type de peau`** |
| `Mode > Enfants` | `Type`, **`Type de cheveux`** |
| `Électroménager > Cuisine` | `Taille`, `Couleur`, `Matière` |
| `Beauté & Santé > Beauté` | `Type`, `Conditionnement` |

## Root cause

The 3-level taxonomy attaches attributes to the **leaf** and expects products to link to the leaf. That
was documented in `getCategoryAttributes`' own docblock and **enforced nowhere** — not on
product↔category assignment, not on attribute serving. This is NOT the July 2026 parent-chain merge bug,
which is intact; every leaf's attribute set is correct.

**Second defect found while tracing it:** `update()` deleted *every* `ProductSpecification` for the
product whenever `specifications` was present. Any caller omitting the invisible legacy rows destroyed
them.

## Fixed

- `ProductsService.assertLeafCategory` — `create()` always; `update()` **only when `categoryId`
  changes**, so legacy products stay editable. Hard 400 naming the category; **never guesses a child**
  (« Homme » holds shirts, trousers and shoes alike).
- `getCategoryAttributes` returns `[]` for an intermediate node.
- `update()` clears only ids the API would serve for the target category (leaf-only) ∪ those the payload
  names. Foreign/legacy rows are preserved. Dead `specOps` binding removed.
- seller-web `CategoryCombobox`: leaves only are selectable; branches remain in the flattened list so a
  legacy category still displays, plus an in-component warning.
- seller-mobile: **no change needed** — its `CategorySelector` already selected leaves only. seller-web
  was the divergence.

## Validation actually performed

Local reproduction in the **dev** DB (dev mirrors prod exactly: same `Type de peau` on `Mode > Homme`,
same foreign `Taille/Couleur/Matière` on `Électroménager > Cuisine`): a product on `Mode > Homme` whose
specs reference the kitchen attribute rows.

**API (local, dev DB) — all passed**
- `getCategoryAttributes(Mode > Homme)` → `[]`
- `getCategoryAttributes(Chemises)` → `Taille, Couleur, Matière`
- `POST` product on `Mode > Homme` → 400 « Homme » est une catégorie intermédiaire…
- `POST` on the `Chemises` leaf → 201
- `PATCH { quantity: 11 }` on the legacy product → 200, and **all 3 hidden specs survived** (verified in DB)

**Seller Web (Chrome, localhost:5100) — all passed**
- Legacy product edit page loads, no crash; « Type de peau » gone → "Aucune caractéristique pour cette catégorie"
- Category field shows « Mode › Homme » + the legacy warning
- Search "homme" lists only leaves (T-shirts, Chemises, …); `Mode › Homme` absent
- Create + `Beauté & Santé › Soins Personnels › Soins du corps` → `Type de peau`, `Volume`, `Date d'expiration`
- Category change → `Électronique › Informatique › Moniteurs` → attributes refresh to `Taille écran`, `Résolution`, `Garantie`

**Seller Mobile (iPhone 17 Pro, iOS 26.5) — partial**
Built, installed (`com.tootiye.tekaseller.dev`) and launched against the local API; login screen renders,
no crash. **Interactive flows were NOT driven**: no `idb`/`cliclick`, and `osascript` returns
`not allowed assistive access (-1719)`, so taps/typing cannot be automated. Its 42 tests pass and no
seller-mobile code changed.

## Gates

API **271 → 287 unit** (16 added), **118 e2e**, `pnpm type-check` clean across 5 projects.
seller-web has **no test framework** (no `test` script), so no component test was added — introducing one
for a single test was judged out of scope.

## Deliberately NOT done

- **No production data touched.** The shirt keeps its wrong category.
- **No migration.** Production has ≥3 ACTIVE products on intermediate nodes (`Mode > Homme`,
  `Supermarché > Boissons`, `Supermarché > Entretien Maison`). `productCount` only counts buyer-visible
  products, so non-ACTIVE ones are unknown without DB access. None is auto-repairable.

## Next phase

Full production audit of affected products (incl. non-ACTIVE) → classified remediation → only then
Workstreams B/C/D, extending `SearchQuery` / `SearchSynonym` / `/v1/admin/reports` rather than building
parallel subsystems.

**Note:** `Supermarché > Boissons` carries the same defect *invisibly* — its legacy rows (`Volume`,
`Type`) look plausible, so no one will report it.
