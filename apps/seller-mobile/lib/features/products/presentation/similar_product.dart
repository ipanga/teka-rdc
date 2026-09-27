import '../data/models/attribute_model.dart';
import '../data/models/product_model.dart';

/// « Ajouter un autre produit similaire » (Seller Catalogue Speed-up).
///
/// The values a new product may start from, taken from one of the seller's
/// own products. It is only a starting point for the ordinary create form:
/// the new product goes through the normal authenticated
/// `POST /v1/sellers/products`, so it gets its own id, short code, status and
/// timestamps from the server. The source product is never written to.
///
/// What carries over, on purpose:
/// - the category (product type) and the brand;
/// - characteristics whose attribute is a SELECT/MULTISELECT and whose value
///   is still one of the category's current options. Choices such as
///   « Type de lessive = Poudre » usually hold across a shelf of products.
///
/// What does not carry over:
/// - free-text, numeric and date characteristics (weight, volume, size,
///   expiry), which are variant-specific;
/// - title, description, prices, promotion, stock, images, and every id.
///
/// The previous FC price is kept only so the form can show it as a hint.
class ProductFormPrefill {
  final String sourceTitle;
  final String categoryId;
  final String? brandId;

  /// Candidate values keyed by attributeId. Filtered by [similarProductSpecs]
  /// once the category's attributes are known.
  final Map<String, String> specCandidates;

  /// Display-only hint (« Prix du produit précédent »). Never submitted
  /// unless the seller taps « Reprendre ».
  final int? previousPriceCDF;

  const ProductFormPrefill({
    required this.sourceTitle,
    required this.categoryId,
    this.brandId,
    this.specCandidates = const {},
    this.previousPriceCDF,
  });

  factory ProductFormPrefill.fromProduct(SellerProductModel p) {
    return ProductFormPrefill(
      sourceTitle: p.title,
      categoryId: p.categoryId,
      brandId: p.brandId,
      specCandidates: {
        for (final s in p.specifications)
          if (s.attributeId != null && s.value.trim().isNotEmpty)
            s.attributeId!: s.value,
      },
      previousPriceCDF: p.priceCDFDisplay > 0 ? p.priceCDFDisplay : null,
    );
  }
}

/// Keeps only the candidate values that are safe to reuse: those on the
/// category's current SELECT/MULTISELECT attributes, where every chosen value
/// is still an offered option.
Map<String, String> similarProductSpecs(
  List<AttributeModel> attributes,
  Map<String, String> candidates,
) {
  final out = <String, String>{};
  for (final attr in attributes) {
    final value = candidates[attr.id];
    if (value == null || value.isEmpty) continue;
    switch (attr.type) {
      case 'SELECT':
        if (attr.options.contains(value)) out[attr.id] = value;
      case 'MULTISELECT':
        final parts = value.split(',');
        if (parts.every(attr.options.contains)) out[attr.id] = value;
      default:
        break; // TEXT / NUMERIC / dates: variant-specific, never copied.
    }
  }
  return out;
}
