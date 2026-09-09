import '../data/models/category_model.dart';

final _uuidRe = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

/// True when [identifier] is the category's internal id (what the browse
/// APIs expect), false when it is a public slug (what web URLs, banners and
/// deep links carry — `/{ville}/categorie/{slug}`).
bool isCategoryUuid(String identifier) => _uuidRe.hasMatch(identifier);

/// Finds a node anywhere in the 3-level tree by id OR slug.
///
/// A7 (2026-09-06): the category screen only matched on id, so a slug from a
/// web link reached the browse API as `categoryId=<slug>` → 400 and a
/// generic title. Slugs are unique in the taxonomy; ids are matched first so
/// a slug that happens to look like an id can never shadow one.
CategoryModel? findCategoryNode(List<CategoryModel> tree, String identifier) {
  final wanted = identifier.trim();
  if (wanted.isEmpty) return null;
  final byId = _find(tree, (c) => c.id == wanted);
  if (byId != null) return byId;
  final lower = wanted.toLowerCase();
  return _find(tree, (c) => c.slug != null && c.slug!.toLowerCase() == lower);
}

CategoryModel? _find(List<CategoryModel> cats, bool Function(CategoryModel) test) {
  for (final c in cats) {
    if (test(c)) return c;
    final found = _find(c.subcategories, test);
    if (found != null) return found;
  }
  return null;
}
