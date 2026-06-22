/// Bundled city hero images, keyed by city slug. Mirrors the web hero images in
/// `apps/buyer-web/public/hero/`, but bundled because the web paths
/// (`/hero/<slug>.webp`) are web-relative and can't load in the Flutter app.
/// A city without a bundled hero falls back to an accent-gradient hero (see
/// `CityHero`) — so the experience stays premium + data-driven for new towns.
///
/// To add a city hero image: drop `assets/hero/<slug>.jpg`, add one line, and
/// keep the `pubspec.yaml` `assets/hero/` entry.
const Map<String, String> _cityHeroImages = {
  'lubumbashi': 'assets/hero/lubumbashi.jpg',
  'kolwezi': 'assets/hero/kolwezi.jpg',
};

String? cityHeroImageAsset(String? slug) {
  if (slug == null) return null;
  return _cityHeroImages[slug];
}
