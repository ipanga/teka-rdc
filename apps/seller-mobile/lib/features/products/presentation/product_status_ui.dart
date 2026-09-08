import 'package:flutter/material.dart';
import '../../../core/theme/teka_colors.dart';
import '../data/models/product_model.dart';

/// One source for how a product status reads to the seller (Seller UX PR D,
/// 2026-09-08): chip, filter bar, detail strip and empty states. The statuses
/// are the API's `ProductStatus` enum — nothing is invented here.
///
/// Tone is the status semantics: neutral for the seller's own drafts and
/// archives, warning while Teka reviews, success when live, destructive when
/// rejected or suspended. Brand red on none.
class ProductStatusUi {
  const ProductStatusUi._({
    required this.label,
    required this.icon,
    required this.color,
    required this.filterLabel,
    required this.heading,
    required this.step,
    this.actionLabel,
  });

  final String label;
  final IconData icon;
  final Color color;
  final String filterLabel;

  /// Strip heading on the detail.
  final String heading;

  /// What the status means and what happens next, in the seller's words.
  final String step;

  /// Short imperative on the card when the seller must fix something.
  final String? actionLabel;

  bool get sellerActionRequired => actionLabel != null;

  static ProductStatusUi of(ProductStatus status) => switch (status) {
        ProductStatus.draft => const ProductStatusUi._(
            label: 'Brouillon',
            icon: Icons.edit_note,
            color: TekaColors.neutralForeground,
            filterLabel: 'Brouillons',
            heading: 'Brouillon',
            step:
                'Invisible pour les acheteurs. Ajoutez au moins une photo, puis soumettez le produit pour révision.',
          ),
        ProductStatus.pendingReview => const ProductStatusUi._(
            label: 'En révision',
            icon: Icons.hourglass_empty,
            color: TekaColors.warningForeground,
            filterLabel: 'En révision',
            heading: 'En cours de révision',
            step:
                'Teka examine la fiche. Vous serez informé de la décision ; aucune action n’est requise.',
          ),
        ProductStatus.active => const ProductStatusUi._(
            label: 'En ligne',
            icon: Icons.check_circle_outline,
            color: TekaColors.successForeground,
            filterLabel: 'En ligne',
            heading: 'En ligne',
            step:
                'Visible par les acheteurs. Le prix, la promotion et le stock se mettent à jour immédiatement.',
          ),
        ProductStatus.rejected => const ProductStatusUi._(
            label: 'Refusé',
            icon: Icons.cancel_outlined,
            color: TekaColors.destructiveForeground,
            filterLabel: 'À corriger',
            heading: 'Correction requise',
            step:
                'Teka a refusé la fiche. Corrigez les points indiqués, puis soumettez-la de nouveau.',
            actionLabel: 'À corriger',
          ),
        ProductStatus.archived => const ProductStatusUi._(
            label: 'Archivé',
            icon: Icons.archive_outlined,
            color: TekaColors.neutralForeground,
            filterLabel: 'Archivés',
            heading: 'Archivé',
            step:
                'Masqué de votre boutique par vous. Restaurez-le pour le remettre en brouillon.',
          ),
        ProductStatus.suspended => const ProductStatusUi._(
            label: 'Suspendu',
            icon: Icons.block,
            color: TekaColors.destructiveForeground,
            filterLabel: 'Suspendus',
            heading: 'Suspendu par Teka',
            step:
                'Retiré de la vente par Teka. Cette fiche ne peut pas être modifiée ; dupliquez-la pour repartir d’une copie.',
          ),
      };
}

/// Filter-bar order: what needs the seller first, then the rest.
const productFilterOrder = [
  ProductStatus.rejected,
  ProductStatus.draft,
  ProductStatus.pendingReview,
  ProductStatus.active,
  ProductStatus.archived,
  ProductStatus.suspended,
];

/// Empty-state copy for the list. Null status = no filter.
({String title, String message}) productEmptyCopy(ProductStatus? status) {
  switch (status) {
    case null:
      return (
        title: 'Votre catalogue commence ici',
        message:
            'Ajoutez votre premier produit, puis ses photos avant de le soumettre pour révision.',
      );
    case ProductStatus.rejected:
      return (
        title: 'Aucun produit à corriger',
        message: 'Les fiches refusées par Teka apparaîtront ici.',
      );
    case ProductStatus.draft:
      return (
        title: 'Aucun brouillon',
        message: 'Les fiches non encore soumises apparaîtront ici.',
      );
    case ProductStatus.pendingReview:
      return (
        title: 'Aucun produit en révision',
        message: 'Les fiches soumises à Teka apparaîtront ici.',
      );
    case ProductStatus.active:
      return (
        title: 'Aucun produit en ligne',
        message: 'Les fiches approuvées et visibles apparaîtront ici.',
      );
    case ProductStatus.archived:
      return (
        title: 'Aucun produit archivé',
        message: 'Les fiches que vous masquez apparaîtront ici.',
      );
    case ProductStatus.suspended:
      return (
        title: 'Aucun produit suspendu',
        message: 'Les fiches retirées par Teka apparaîtraient ici.',
      );
  }
}

/// Derived on display, never stored (`docs/architecture.md`, per-product
/// discounts): `round((price − promo) / price × 100)`.
int? discountPercent(int priceCDF, int? discountCDF) {
  if (discountCDF == null || priceCDF <= 0 || discountCDF >= priceCDF) {
    return null;
  }
  return ((priceCDF - discountCDF) / priceCDF * 100).round();
}
