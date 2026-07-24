-- Prune product attributes attached to NON-LEAF categories.
--
-- Attributes must attach per product type (the leaf of the Category tree).
-- Rows attached to a parent/subcategory node used to leak into every
-- descendant's seller form via the old parent-walk in
-- BrowseService.getCategoryAttributes (now fixed to leaf-only). This is the
-- data side of that fix: it removes the actual contamination (e.g. a cooker
-- "Type"/"Nombre de feux" attribute created on the "Informatique" subcategory
-- that showed up on every monitor form) plus any stale attributes left on old
-- deactivated category nodes by earlier taxonomy versions.
--
-- SAFE + backward-compatible:
--   * A product-type leaf has no children, so its attributes are never touched.
--   * Only NON-LEAF attributes that NO product actually used are deleted. Any
--     attribute referenced by a product_specification (a legacy product saved a
--     value for it) is PRESERVED — the data stays intact, and the leaf-only
--     fetch simply stops offering that attribute in new/edit forms. This also
--     avoids the product_specifications_attributeId_fkey violation.
-- Idempotent: re-running is a no-op once no unreferenced non-leaf rows remain.
--
-- ROLLBACK: this deletes rows; there is no automatic undo. If needed, restore
-- the affected product_attributes rows from a pre-migration backup. Deleted
-- rows are, by definition, unused attributes that could never be correctly
-- fetched after the leaf-only code change.

DO $$
DECLARE
  victim_count integer;
BEGIN
  SELECT count(*)
    INTO victim_count
    FROM product_attributes pa
   WHERE EXISTS (SELECT 1 FROM categories ch
                  WHERE ch."parentCategoryId" = pa."categoryId")
     AND NOT EXISTS (SELECT 1 FROM product_specifications ps
                      WHERE ps."attributeId" = pa.id);

  RAISE NOTICE 'Pruning % unreferenced product_attributes rows on non-leaf categories', victim_count;

  DELETE FROM product_attributes pa
   WHERE EXISTS (SELECT 1 FROM categories ch
                  WHERE ch."parentCategoryId" = pa."categoryId")
     AND NOT EXISTS (SELECT 1 FROM product_specifications ps
                      WHERE ps."attributeId" = pa.id);
END $$;
