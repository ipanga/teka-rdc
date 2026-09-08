import 'package:flutter/material.dart';
import '../../../core/theme/teka_colors.dart';
import '../data/models/order_model.dart';

/// One source for how an order status reads to the seller (Seller UX PR C,
/// 2026-09-08): the chip, the filter bar, the timeline, the empty states and
/// the « next step » strip all derive from here, so a label can never drift
/// between the list and the detail (three copies before this file).
///
/// Colour is the STATUS semantics — attention while the seller must act,
/// in-progress while Teka moves the parcel, success / destructive / neutral at
/// the end — never brand red. The Teka-managed lifecycle
/// (`docs/order-workflow.md`): the seller confirms, prepares and hands the
/// parcel to Teka; Teka collects, delivers and collects the cash.
class OrderStatusUi {
  const OrderStatusUi._({
    required this.label,
    required this.icon,
    required this.color,
    required this.filterLabel,
    required this.step,
    this.actionLabel,
  });

  /// Chip and timeline wording (« En attente », « Livrée »…).
  final String label;
  final IconData icon;

  /// Foreground tone; the chip blends it at 8 % for its background (contrast
  /// pinned ≥ 4.5:1 in `seller_lists_test`).
  final Color color;

  /// Filter-bar wording (plural, since it names a bucket).
  final String filterLabel;

  /// What happens next, in the seller's words — shown on the detail so the
  /// managed workflow is explicit even when there is no button.
  final String step;

  /// Short imperative shown on the card while the seller must act.
  final String? actionLabel;

  /// True for the three statuses the seller drives.
  bool get sellerActionRequired => actionLabel != null;

  /// Cancelled, returned, delivered: nothing more will happen to this order.
  bool get isTerminal =>
      this == of(OrderStatus.delivered) ||
      this == of(OrderStatus.cancelled) ||
      this == of(OrderStatus.returned);

  /// Heading of the « next step » strip.
  String get stepHeading => sellerActionRequired
      ? 'Votre action'
      : isTerminal
          ? 'Commande clôturée'
          : 'Prise en charge par Teka';

  static OrderStatusUi of(OrderStatus status) => switch (status) {
        OrderStatus.pending => const OrderStatusUi._(
            label: 'En attente',
            icon: Icons.hourglass_empty,
            color: TekaColors.warningForeground,
            filterLabel: 'À confirmer',
            step: 'Confirmez ou refusez cette commande.',
            actionLabel: 'À confirmer',
          ),
        OrderStatus.confirmed => const OrderStatusUi._(
            label: 'Confirmée',
            icon: Icons.check_circle_outline,
            color: TekaColors.warningForeground,
            filterLabel: 'À préparer',
            step: 'Préparez les articles, puis signalez le début de la préparation.',
            actionLabel: 'À préparer',
          ),
        OrderStatus.processing => const OrderStatusUi._(
            label: 'En préparation',
            icon: Icons.inventory_2_outlined,
            color: TekaColors.warningForeground,
            filterLabel: 'En préparation',
            step: 'Une fois le colis emballé, marquez-le prêt pour la collecte Teka.',
            actionLabel: 'À finaliser',
          ),
        OrderStatus.readyForTekaPickup => const OrderStatusUi._(
            label: 'Prête pour collecte',
            icon: Icons.local_shipping_outlined,
            color: TekaColors.neutralForeground,
            filterLabel: 'Prêtes pour collecte',
            step: 'En attente de collecte par Teka. Rien à faire de votre côté.',
          ),
        OrderStatus.receivedAtTeka => const OrderStatusUi._(
            label: 'Reçue par Teka',
            icon: Icons.warehouse_outlined,
            color: TekaColors.infoForeground,
            filterLabel: 'Reçues par Teka',
            step: 'Teka a réceptionné le colis et organise la livraison.',
          ),
        OrderStatus.shipped => const OrderStatusUi._(
            label: 'Expédiée',
            icon: Icons.local_shipping_outlined,
            color: TekaColors.infoForeground,
            filterLabel: 'Expédiées (ancien statut)',
            step: 'Teka assure la livraison à l’acheteur.',
          ),
        OrderStatus.outForDelivery => const OrderStatusUi._(
            label: 'En livraison',
            icon: Icons.delivery_dining,
            color: TekaColors.infoForeground,
            filterLabel: 'En livraison',
            step: 'Teka livre le colis et encaisse le paiement.',
          ),
        OrderStatus.delivered => const OrderStatusUi._(
            label: 'Livrée',
            icon: Icons.check_circle,
            color: TekaColors.successForeground,
            filterLabel: 'Livrées',
            step:
                'Livrée et encaissée par Teka. Le montant devient disponible après la fenêtre de retour.',
          ),
        OrderStatus.cancelled => const OrderStatusUi._(
            label: 'Annulée',
            icon: Icons.cancel_outlined,
            color: TekaColors.destructiveForeground,
            filterLabel: 'Annulées',
            step: 'Commande annulée. Le stock a été restitué.',
          ),
        OrderStatus.returned => const OrderStatusUi._(
            label: 'Retournée',
            icon: Icons.undo,
            color: TekaColors.neutralForeground,
            filterLabel: 'Retournées',
            step: 'Retour accepté par Teka.',
          ),
      };

  /// Timeline / chip label from an API status string (status logs carry the
  /// raw enum). Unknown values fall back to `parseOrderStatus`'s default.
  static String labelOf(String apiStatus) =>
      of(parseOrderStatus(apiStatus)).label;
}

/// Filter-bar order: the seller's own steps first, then Teka's, then the
/// terminal states, then the legacy SHIPPED bucket kept for old rows.
const orderFilterOrder = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.processing,
  OrderStatus.readyForTekaPickup,
  OrderStatus.receivedAtTeka,
  OrderStatus.outForDelivery,
  OrderStatus.delivered,
  OrderStatus.cancelled,
  OrderStatus.returned,
  OrderStatus.shipped,
];

/// Empty-state copy for a filter. Null status = all orders.
({String title, String message}) orderEmptyCopy(OrderStatus? status) {
  switch (status) {
    case null:
      return (
        title: 'Aucune commande pour le moment',
        message:
            'Vos nouvelles commandes apparaîtront ici pour être confirmées et préparées.',
      );
    case OrderStatus.pending:
      return (
        title: 'Aucune commande à confirmer',
        message: 'Les nouvelles commandes apparaîtront ici.',
      );
    case OrderStatus.confirmed:
      return (
        title: 'Aucune commande à préparer',
        message: 'Les commandes confirmées apparaîtront ici.',
      );
    case OrderStatus.processing:
      return (
        title: 'Aucune commande en préparation',
        message: 'Les colis en cours d’emballage apparaîtront ici.',
      );
    case OrderStatus.readyForTekaPickup:
      return (
        title: 'Aucune commande prête pour collecte',
        message: 'Les colis en attente du passage de Teka apparaîtront ici.',
      );
    default:
      return (
        title: 'Aucune commande dans ce statut',
        message: 'Choisissez un autre statut pour consulter vos commandes.',
      );
  }
}
