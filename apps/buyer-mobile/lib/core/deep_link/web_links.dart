import '../config/flavor.dart';
import '../../features/catalog/data/models/product_model.dart';

/// Builds the canonical, shareable web URL for a product — the same URL the
/// website + the deep-link association files recognise, so a shared link opens
/// the app when installed (Android App Links / iOS Universal Links) and the
/// website otherwise. Mirrors buyer-web `lib/urls.ts` productHref:
/// `${webBaseUrl}/{citySlug}/{slug}-{shortCode}`.
///
/// Falls back gracefully when fields are missing — the website 308-redirects a
/// bare identifier to its canonical URL.
String? productWebUrl(ProductDetailModel product) {
  final base = FlavorConfig.instance.webBaseUrl;
  final tail = _productTail(product);
  if (tail == null) return null;
  final city = product.citySlug;
  if (city != null && city.isNotEmpty) return '$base/$city/$tail';
  return '$base/$tail';
}

String? _productTail(ProductDetailModel p) {
  final slug = p.slug;
  final code = p.shortCode;
  if (slug != null && slug.isNotEmpty && code != null && code.isNotEmpty) {
    return '$slug-$code';
  }
  if (code != null && code.isNotEmpty) return code;
  if (slug != null && slug.isNotEmpty) return slug;
  // A database UUID is a resolver token, not a buyer-facing public URL.
  // Refuse to share it when the API has not supplied a slug or short code.
  return null;
}
