/// Bundled top-category illustration assets, keyed by category slug. Mirrors the
/// web `lib/category-images.ts`. The 7 top categories are a fixed taxonomy, so
/// bundling beats a network fetch (instant, works offline, no per-icon round-trip
/// on DRC 2G/3G). Subcategories / future categories without an asset fall back
/// to the emoji.
///
/// To add a category image: drop `assets/categories/<slug>.png`, add one line,
/// and keep the `pubspec.yaml` `assets/categories/` entry.
const Map<String, String> _categoryImages = {
  'supermarche': 'assets/categories/supermarche.png',
  'telephones-et-accessoires': 'assets/categories/telephones-et-accessoires.png',
  'electromenager': 'assets/categories/electromenager.png',
  'mode': 'assets/categories/mode.png',
  'beaute-et-sante': 'assets/categories/beaute-et-sante.png',
  'construction-et-bricolage': 'assets/categories/construction-et-bricolage.png',
  'automobile-et-moto': 'assets/categories/automobile-et-moto.png',
};

String? categoryImageAsset(String? slug) {
  if (slug == null) return null;
  return _categoryImages[slug];
}
