import 'package:flutter/material.dart';
import '../../orders/data/models/order_stats.dart';
import '../../products/data/products_repository.dart';
import '../../verification/data/verification_repository.dart';

/// Action Center — what the seller must do, from the API's own semantics
/// (Seller UX PR B, 2026-09-08). Pure: no widgets, no providers, so the
/// mapping and the ordering are unit-tested on their own.
///
/// Sources of truth, and what in each of them is a seller ACTION:
///
/// * `GET /v1/sellers/orders/stats` — the seller drives
///   `PENDING → CONFIRMED → PROCESSING → READY_FOR_TEKA_PICKUP`
///   (`SellerOrdersService`). Three statuses need the seller; everything
///   from `READY_FOR_TEKA_PICKUP` on belongs to Teka ops and is tracked, not
///   asked for.
/// * `GET /v1/sellers/products/stats` — only `REJECTED` can be fixed by the
///   seller (edit + resubmit). `SUSPENDED` is an admin takedown the seller
///   cannot lift; `DRAFT` / `PENDING_REVIEW` are the seller's own pace or
///   Teka's review.
/// * `GET /v1/sellers/verification` — `REJECTED` (resubmit) or a live
///   rejected document. `NOT_SUBMITTED` is optional (the badge is a trust
///   signal, the shop is active), `PENDING_REVIEW` / `VERIFIED` need nothing.
/// * Payouts — deliberately absent. `docs/payouts.md`: « No payout state
///   requires anything from the seller »; a rejected payout releases the
///   earnings and is announced by a notification, and the destination is
///   entered on the request form itself.
enum ActionPriority {
  /// A buyer is waiting on the seller right now (confirm, prepare).
  immediate,

  /// Must be done soon, but nobody is blocked this minute (finish a
  /// preparation, fix a rejected listing, redo a rejected verification).
  soon,
}

/// How the row is coloured. State, never brand red: an order to confirm is
/// « attention », a rejection is « rejected ». Ordering is by priority.
enum ActionTone { attention, rejected }

/// Fixed identities; their declaration order is the order INSIDE a priority.
enum ActionKind {
  ordersToConfirm,
  ordersToPrepare,
  ordersToFinish,
  productsRejected,
  verificationRejected,
}

class ActionItem {
  final ActionKind kind;
  final ActionPriority priority;
  final ActionTone tone;

  /// Shown in the pill. Null for a single task (« redo the verification »)
  /// which is displayed with its icon instead of a « 1 ».
  final int? count;
  final String title;
  final String subtitle;
  final IconData icon;

  /// Destination; query strings carry the list filter the row promises.
  final String route;

  const ActionItem({
    required this.kind,
    required this.priority,
    required this.tone,
    required this.count,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.route,
  });

  /// What this row contributes to « N actions en attente ».
  int get pendingCount => count ?? 1;
}

/// True when the seller has to resubmit something.
bool verificationNeedsAction(VerificationStatusModel status) {
  if (status.verificationStatus.toUpperCase() == 'REJECTED') return true;
  for (final d in status.documents) {
    if (d.status.toUpperCase() == 'REJECTED') return true;
  }
  return false;
}

/// Builds the list for the sources that are AVAILABLE (a null source is
/// still loading or failed and is reported by its own row, never as
/// « nothing to do »). Sorted by [ActionPriority] then [ActionKind].
List<ActionItem> buildActionItems({
  SellerOrderStats? orders,
  ProductStats? products,
  VerificationStatusModel? verification,
}) {
  final items = <ActionItem>[];
  if (orders != null) {
    if (orders.pending > 0) {
      items.add(ActionItem(
        kind: ActionKind.ordersToConfirm,
        priority: ActionPriority.immediate,
        tone: ActionTone.attention,
        count: orders.pending,
        title: 'Commandes à confirmer',
        subtitle: 'Acceptez ou refusez les nouvelles commandes.',
        icon: Icons.receipt_long_outlined,
        route: '/orders?status=PENDING',
      ));
    }
    if (orders.confirmed > 0) {
      items.add(ActionItem(
        kind: ActionKind.ordersToPrepare,
        priority: ActionPriority.immediate,
        tone: ActionTone.attention,
        count: orders.confirmed,
        title: 'Commandes à préparer',
        subtitle: 'Commencez la préparation des articles.',
        icon: Icons.inventory_2_outlined,
        route: '/orders?status=CONFIRMED',
      ));
    }
    if (orders.processing > 0) {
      items.add(ActionItem(
        kind: ActionKind.ordersToFinish,
        priority: ActionPriority.soon,
        tone: ActionTone.attention,
        count: orders.processing,
        title: 'Préparations à terminer',
        subtitle: 'Signalez les colis prêts pour la collecte Teka.',
        icon: Icons.local_shipping_outlined,
        route: '/orders?status=PROCESSING',
      ));
    }
  }
  if (products != null && products.rejected > 0) {
    items.add(ActionItem(
      kind: ActionKind.productsRejected,
      priority: ActionPriority.soon,
      tone: ActionTone.rejected,
      count: products.rejected,
      title: 'Produits à corriger',
      subtitle: 'Consultez le motif du rejet avant de modifier la fiche.',
      icon: Icons.edit_note_outlined,
      route: '/products?status=REJECTED',
    ));
  }
  if (verification != null && verificationNeedsAction(verification)) {
    items.add(const ActionItem(
      kind: ActionKind.verificationRejected,
      priority: ActionPriority.soon,
      tone: ActionTone.rejected,
      count: null,
      title: 'Vérification à refaire',
      subtitle:
          'Soumettez de nouveaux documents pour relancer la vérification.',
      icon: Icons.verified_outlined,
      route: '/profile/verification',
    ));
  }
  items.sort((a, b) {
    final byPriority = a.priority.index.compareTo(b.priority.index);
    return byPriority != 0 ? byPriority : a.kind.index.compareTo(b.kind.index);
  });
  return items;
}

/// Sum of every row's [ActionItem.pendingCount].
int totalPending(List<ActionItem> items) =>
    items.fold(0, (n, item) => n + item.pendingCount);
