import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/models/order_model.dart';
import '../../data/orders_repository.dart';
import '../order_status_ui.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_action_buttons.dart';
import '../widgets/order_status_badge.dart';

/// One order, as the seller needs it: number and status, the next step in
/// the Teka-managed workflow, the items to prepare, the money, then the
/// history. The seller's transition lives in the bottom bar; when the order
/// is in Teka's hands the bar is replaced by a neutral waiting line, never by
/// silence.
///
/// Reached from the list (push), the Action Center (list → push) and a
/// notification tap (push from wherever the app was) — one screen,
/// `AdaptiveLeading` keeps an exit either way.
class OrderDetailScreen extends ConsumerWidget {
  final String orderId;

  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(sellerOrderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
        title: const Text('Détail de la commande'),
      ),
      body: orderAsync.when(
        // Keep the last order on screen while a revision refetches it: the
        // seller is often mid-read when a push arrives.
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        loading: () => const OrderDetailSkeleton(),
        error: (e, _) => SellerListState(
          child: SellerListMessage(
            icon: Icons.cloud_off_outlined,
            title: 'Impossible de charger la commande',
            message: friendlyErrorMessage(e),
            actionLabel: 'Réessayer',
            onAction: () => ref.invalidate(sellerOrderDetailProvider(orderId)),
          ),
        ),
        data: (order) => _OrderDetailContent(order: order, orderId: orderId),
      ),
    );
  }
}

class _OrderDetailContent extends ConsumerStatefulWidget {
  final SellerOrderModel order;
  final String orderId;

  const _OrderDetailContent({required this.order, required this.orderId});

  @override
  ConsumerState<_OrderDetailContent> createState() =>
      _OrderDetailContentState();
}

class _OrderDetailContentState extends ConsumerState<_OrderDetailContent> {
  bool _busy = false;

  /// The order as the transition response returned it, shown until the
  /// provider's refetch lands. Without it the bar kept the OLD button for
  /// the whole round-trip of the detail request (5–7 s on the dev API), and
  /// a second tap opened a stale dialog.
  SellerOrderModel? _justChanged;

  @override
  void didUpdateWidget(covariant _OrderDetailContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.order != widget.order) _justChanged = null;
  }

  @override
  Widget build(BuildContext context) {
    final order = _justChanged ?? widget.order;
    final theme = Theme.of(context).textTheme;
    final ui = OrderStatusUi.of(order.status);
    final dateFormat = DateFormat('dd/MM/yyyy · HH:mm', 'fr');

    return Column(
      children: [
        Expanded(
          child: ReadableColumn(
            padding: EdgeInsets.zero,
            child: ListView(
              padding: const EdgeInsets.all(TekaSpacing.md),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text('Commande ${order.orderNumber}',
                          style: theme.titleLarge),
                    ),
                    const SizedBox(width: TekaSpacing.xs),
                    OrderStatusBadge(status: order.status),
                  ],
                ),
                const SizedBox(height: TekaSpacing.xxs),
                Text(dateFormat.format(order.createdAt),
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.mutedForeground)),
                const SizedBox(height: TekaSpacing.md),
                _NextStep(ui: ui),
                const SizedBox(height: TekaSpacing.md),
                _SectionCard(
                  title:
                      '${order.items.length} article${order.items.length == 1 ? '' : 's'} à préparer',
                  icon: Icons.shopping_bag_outlined,
                  children: [
                    for (var i = 0; i < order.items.length; i++) ...[
                      if (i > 0) const SizedBox(height: TekaSpacing.sm),
                      _ItemRow(item: order.items[i]),
                    ],
                  ],
                ),
                const SizedBox(height: TekaSpacing.sm),
                _SectionCard(
                  title: 'Acheteur',
                  icon: Icons.person_outline,
                  children: [
                    if (order.buyer != null)
                      Text(order.buyer!.fullName, style: theme.bodyMedium),
                    if (order.deliveryAddress?.town case final town?)
                      Text(
                        'Livraison assurée par Teka · $town',
                        style: theme.bodySmall
                            ?.copyWith(color: TekaColors.neutralForeground),
                      ),
                    if (order.buyerNote case final note?
                        when note.trim().isNotEmpty) ...[
                      const SizedBox(height: TekaSpacing.xs),
                      Text('Note de l’acheteur', style: theme.labelMedium),
                      Text(note, style: theme.bodyMedium),
                    ],
                  ],
                ),
                const SizedBox(height: TekaSpacing.sm),
                _SectionCard(
                  title: 'Montant de la commande',
                  icon: Icons.receipt_outlined,
                  children: [
                    _MoneyRow('Sous-total',
                        '${formatFcNumber(order.subtotalCDFDisplay)} FC'),
                    _MoneyRow('Frais de livraison',
                        '${formatFcNumber(order.deliveryFeeCDFDisplay)} FC'),
                    const Divider(height: TekaSpacing.md),
                    _MoneyRow('Total payé par l’acheteur',
                        '${formatFcNumber(order.totalCDFDisplay)} FC',
                        emphasis: true),
                    if (order.totalUSDDisplay != null)
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                            '\$${order.totalUSDDisplay!.toStringAsFixed(2)} USD',
                            style: theme.bodySmall?.copyWith(
                                color: TekaColors.mutedForeground)),
                      ),
                    const SizedBox(height: TekaSpacing.xxs),
                    Text(
                      _paymentLine(order),
                      style: theme.bodySmall
                          ?.copyWith(color: TekaColors.neutralForeground),
                    ),
                  ],
                ),
                // No « à recevoir » on a cancelled or returned order: there
                // is no sale to estimate.
                if (order.status != OrderStatus.cancelled &&
                    order.status != OrderStatus.returned &&
                    order.financials != null) ...[
                  const SizedBox(height: TekaSpacing.sm),
                  _SectionCard(
                    title: order.financials!.isFinal
                        ? 'Votre rémunération'
                        : 'Votre rémunération (estimation)',
                    icon: Icons.account_balance_wallet_outlined,
                    children: [
                      _MoneyRow('Revenu (produits)',
                          formatCDF(order.financials!.grossCDF)),
                      _MoneyRow(
                          'Commission Teka (${order.financials!.commissionPercent} %)',
                          '− ${formatCDF(order.financials!.commissionCDF)}'),
                      const Divider(height: TekaSpacing.md),
                      _MoneyRow('Montant à recevoir',
                          formatCDF(order.financials!.netCDF),
                          emphasis: true),
                      if (!order.financials!.isFinal) ...[
                        const SizedBox(height: TekaSpacing.xxs),
                        Text(
                          'À la livraison, ce montant entre dans la fenêtre de retour de 2 jours avant de devenir disponible.',
                          style: theme.bodySmall
                              ?.copyWith(color: TekaColors.mutedForeground),
                        ),
                      ],
                    ],
                  ),
                ],
                if (order.statusLogs.isNotEmpty) ...[
                  const SizedBox(height: TekaSpacing.sm),
                  _SectionCard(
                    title: 'Historique',
                    icon: Icons.timeline,
                    children: [_Timeline(logs: order.statusLogs)],
                  ),
                ],
                const SizedBox(height: TekaSpacing.xl),
              ],
            ),
          ),
        ),
        _BottomBar(
          order: order,
          busy: _busy,
          onConfirm: () => _transition(
            title: 'Confirmer la commande',
            body:
                'L’acheteur sera informé et la commande passera en préparation. Vous ne pourrez plus la refuser ensuite.',
            actionLabel: 'Confirmer la commande',
            action: () => ref
                .read(sellerOrdersRepositoryProvider)
                .confirmOrder(order.id),
          ),
          onReject: () => _reject(order),
          onProcess: () => _transition(
            title: 'Commencer la préparation',
            body:
                'La commande passe « En préparation ». Marquez-la prête pour collecte une fois le colis emballé.',
            actionLabel: 'Commencer la préparation',
            action: () => ref
                .read(sellerOrdersRepositoryProvider)
                .processOrder(order.id),
          ),
          onReadyForPickup: () => _transition(
            title: 'Marquer prête pour collecte',
            body:
                'Teka viendra collecter le colis et l’acheteur sera informé. Cette étape est définitive : la commande passe sous la responsabilité de Teka.',
            actionLabel: 'Marquer prête pour collecte',
            action: () => ref
                .read(sellerOrdersRepositoryProvider)
                .markReadyForPickup(order.id),
          ),
        ),
      ],
    );
  }

  static String _paymentLine(SellerOrderModel order) {
    if (order.status == OrderStatus.cancelled ||
        order.status == OrderStatus.returned) {
      return 'Paiement à la livraison · aucun encaissement';
    }
    final paid = switch (order.paymentStatus?.toUpperCase()) {
      'COMPLETED' || 'PAID' => 'encaissé par Teka',
      _ => 'encaissé par Teka à la livraison',
    };
    return 'Paiement à la livraison · $paid';
  }

  /// One confirmation dialog for every transition, stating what will happen.
  /// The dialog's own button is guarded against a double tap: a second pop
  /// would close the detail screen itself.
  Future<bool> _confirmDialog({
    required String title,
    required String body,
    required String actionLabel,
    bool destructive = false,
    Widget? extra,
  }) async {
    var popped = false;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: extra == null
            ? Text(body)
            : Column(mainAxisSize: MainAxisSize.min, children: [
                Text(body),
                const SizedBox(height: TekaSpacing.sm),
                extra,
              ]),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () {
              if (popped) return;
              popped = true;
              Navigator.pop(ctx, true);
            },
            style: destructive
                ? ElevatedButton.styleFrom(
                    backgroundColor: TekaColors.destructive)
                : null,
            child: Text(actionLabel),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _transition({
    required String title,
    required String body,
    required String actionLabel,
    required Future<SellerOrderModel> Function() action,
  }) async {
    if (_busy) return;
    // Captured BEFORE the dialog: if a push refreshes the order while the
    // seller reads the dialog, the refusal that follows is a stale one.
    final before = (_justChanged ?? widget.order).status;
    final ok = await _confirmDialog(
        title: title, body: body, actionLabel: actionLabel);
    if (!ok || !mounted) return;
    await _run(action, before: before, success: 'Commande mise à jour.');
  }

  /// Runs a transition: the bar is busy meanwhile; on success the detail,
  /// the list, the Action Center and the Commandes badge all refetch through
  /// the orders revision the repository bumps. On failure the order is
  /// refetched anyway: if its status changed under the seller's feet (the
  /// API refuses the transition with a 400), the screen says so instead of
  /// showing a stale button; otherwise the API's own French message is shown
  /// and the seller can retry.
  Future<void> _run(Future<SellerOrderModel> Function() action,
      {required OrderStatus before, required String success}) async {
    setState(() => _busy = true);
    try {
      final changed = await action();
      // The repository bumped the orders revision (detail, Action Center,
      // Commandes badge). The list is a StateNotifier that keeps the seller's
      // page and scroll, so it is refreshed explicitly.
      ref.read(sellerOrdersProvider.notifier).refresh();
      if (!mounted) return;
      // Show the new status now; the refetch reconciles the rest.
      setState(() => _justChanged = widget.order.withTransition(changed));
      showAppSnackbar(context,
          message: success, tone: AppSnackbarTone.success);
    } catch (e) {
      if (!mounted) return;
      final message = friendlyErrorMessage(e);
      SellerOrderModel? fresh;
      try {
        fresh = await ref
            .refresh(sellerOrderDetailProvider(widget.orderId).future);
      } catch (_) {
        // The failure message below already covers an unreachable API.
      }
      if (!mounted) return;
      if (fresh != null && fresh.status != before) {
        showAppSnackbar(context,
            message:
                'Le statut de cette commande a changé entre-temps : la fiche a été actualisée.',
            tone: AppSnackbarTone.warning);
      } else {
        showAppSnackbar(context,
            message: message, tone: AppSnackbarTone.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject(SellerOrderModel current) async {
    if (_busy) return;
    final order = _justChanged ?? current;
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => const _RejectDialog(),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;
    await _run(
      () => ref
          .read(sellerOrdersRepositoryProvider)
          .rejectOrder(order.id, reason.trim()),
      before: order.status,
      success: 'Commande refusée. L’acheteur a été informé.',
    );
  }
}

/// Refusal needs a reason (the API requires one and the buyer reads it); the
/// button stays disabled until there is one, and a double tap cannot pop
/// twice.
class _RejectDialog extends StatefulWidget {
  const _RejectDialog();

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  // Owned here: the dialog route outlives the awaiting caller by one
  // dismiss animation, so a caller-owned controller was disposed while the
  // field was still on screen.
  final _controller = TextEditingController();
  bool _popped = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasReason = _controller.text.trim().isNotEmpty;
    return AlertDialog(
      title: const Text('Refuser la commande'),
      // Scrollable: with the keyboard up on a short phone at 1.5× the
      // explanation and the field do not fit in one column.
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'La commande sera annulée définitivement, le stock restitué et l’acheteur informé du motif.'),
            const SizedBox(height: TekaSpacing.sm),
            TextField(
              controller: _controller,
              maxLines: 3,
              autofocus: true,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Motif du refus',
                hintText: 'Ex. : article en rupture de stock',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: hasReason
              ? () {
                  if (_popped) return;
                  _popped = true;
                  Navigator.pop(context, _controller.text);
                }
              : null,
          style:
              ElevatedButton.styleFrom(backgroundColor: TekaColors.destructive),
          child: const Text('Refuser la commande'),
        ),
      ],
    );
  }
}

/// Bottom bar: the seller's buttons while a transition is theirs, a neutral
/// waiting line while the order is in Teka's hands, nothing once terminal.
class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.order,
    required this.busy,
    required this.onConfirm,
    required this.onReject,
    required this.onProcess,
    required this.onReadyForPickup,
  });
  final SellerOrderModel order;
  final bool busy;
  final VoidCallback onConfirm;
  final VoidCallback onReject;
  final VoidCallback onProcess;
  final VoidCallback onReadyForPickup;

  @override
  Widget build(BuildContext context) {
    final ui = OrderStatusUi.of(order.status);
    final Widget? child;
    if (ui.sellerActionRequired) {
      child = OrderActionButtons(
        status: order.status,
        busy: busy,
        onConfirm: onConfirm,
        onReject: onReject,
        onProcess: onProcess,
        onReadyForPickup: onReadyForPickup,
      );
    } else if (order.status == OrderStatus.readyForTekaPickup) {
      child = Row(children: [
        const Icon(Icons.schedule_outlined,
            color: TekaColors.neutralForeground),
        const SizedBox(width: TekaSpacing.sm),
        Expanded(
          child: Text('En attente de collecte par Teka',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(color: TekaColors.neutralForeground)),
        ),
      ]);
    } else {
      child = null;
    }
    if (child == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(TekaSpacing.md),
      decoration: const BoxDecoration(
        color: TekaColors.background,
        border: Border(top: BorderSide(color: TekaColors.border)),
      ),
      child: SafeArea(top: false, child: ReadableBottomBar(child: child)),
    );
  }
}

/// « Prochaine étape » strip: the managed workflow in one sentence, coloured
/// by the status tone. Attention while the seller must act, neutral or info
/// while Teka works, success / destructive at the end.
class _NextStep extends StatelessWidget {
  const _NextStep({required this.ui});
  final OrderStatusUi ui;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final background = Color.alphaBlend(
        ui.color.withValues(alpha: 0.08), TekaColors.background);
    return Semantics(
      container: true,
      label: '${ui.sellerActionRequired ? 'Votre action' : 'Étape'} : ${ui.step}',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.all(TekaSpacing.sm),
          decoration: BoxDecoration(
              color: background, borderRadius: TekaRadius.mdAll),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ui.sellerActionRequired ? Icons.flag_outlined : ui.icon,
                size: 20, color: ui.color),
            const SizedBox(width: TekaSpacing.xs),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ui.stepHeading,
                        style: theme.labelMedium?.copyWith(color: ui.color)),
                    const SizedBox(height: 2),
                    Text(ui.step, style: theme.bodyMedium),
                  ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard(
      {required this.title, required this.icon, required this.children});
  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(TekaSpacing.sm),
        decoration: BoxDecoration(
          color: TekaColors.background,
          borderRadius: TekaRadius.lgAll,
          border: Border.all(color: TekaColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Row(children: [
                Icon(icon, size: 16, color: TekaColors.mutedForeground),
                const SizedBox(width: TekaSpacing.xxs),
                Expanded(
                  child: Text(title,
                      style: Theme.of(context)
                          .textTheme
                          .labelMedium
                          ?.copyWith(color: TekaColors.mutedForeground)),
                ),
              ]),
            ),
            const SizedBox(height: TekaSpacing.xs),
            ...children,
          ],
        ),
      );
}

/// Money rows: label muted, amount in foreground — colour marks state, never
/// money. [emphasis] for the row the seller reads first.
class _MoneyRow extends StatelessWidget {
  const _MoneyRow(this.label, this.value, {this.emphasis = false});
  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Text(label,
              style: emphasis
                  ? theme.titleSmall
                  : theme.bodyMedium
                      ?.copyWith(color: TekaColors.mutedForeground)),
        ),
        const SizedBox(width: TekaSpacing.sm),
        Text(value,
            textAlign: TextAlign.end,
            style: emphasis
                ? theme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
                : theme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final OrderItemModel item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final total = Text('${formatFcNumber(item.totalCDFDisplay)} FC',
        style: theme.bodyMedium?.copyWith(fontWeight: FontWeight.w700));
    final quantity = Text(
        'Quantité : ${item.quantity} × ${formatFcNumber(item.unitPriceCDFDisplay)} FC',
        style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground));
    final thumbnail = ClipRRect(
      borderRadius: TekaRadius.smAll,
      child: SizedBox(
        width: 56,
        height: 56,
        child: item.productImage == null
            ? const _ImagePlaceholder()
            : Image.network(
                item.productImage!,
                fit: BoxFit.cover,
                cacheWidth: 168,
                errorBuilder: (_, __, ___) => const _ImagePlaceholder(),
                loadingBuilder: (_, child, progress) =>
                    progress == null ? child : const _ImagePlaceholder(),
              ),
      ),
    );
    return LayoutBuilder(builder: (context, constraints) {
      // A 320 px phone at 1.5× cannot hold thumbnail, title and a bold line
      // total side by side: the total moves under the quantity, right-aligned.
      final narrow = constraints.maxWidth < 300 ||
          MediaQuery.textScalerOf(context).scale(1) > 1.3;
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        thumbnail,
        const SizedBox(width: TekaSpacing.sm),
        Expanded(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.productTitle,
                    style:
                        theme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                quantity,
                if (narrow) ...[
                  const SizedBox(height: 2),
                  Align(alignment: Alignment.centerRight, child: total),
                ],
              ]),
        ),
        if (!narrow) ...[const SizedBox(width: TekaSpacing.xs), total],
      ]);
    });
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();
  @override
  Widget build(BuildContext context) => const ColoredBox(
        color: TekaColors.muted,
        child: Icon(Icons.image_outlined,
            color: TekaColors.mutedForeground, size: 24),
      );
}

/// The order's real history: one entry per `statusLog`, oldest first, the
/// dot in that status's own tone. Nothing is invented — no future milestone,
/// no « expected » step.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.logs});
  final List<OrderStatusLogModel> logs;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final dateFormat = DateFormat('dd/MM/yyyy · HH:mm', 'fr');
    return Column(children: [
      for (var i = 0; i < logs.length; i++)
        Builder(builder: (context) {
          final log = logs[i];
          final isLast = i == logs.length - 1;
          final ui = OrderStatusUi.of(log.toOrderStatus);
          return IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                width: 24,
                child: Column(children: [
                  Container(
                    width: 10,
                    height: 10,
                    margin: const EdgeInsets.only(top: 4),
                    decoration:
                        BoxDecoration(shape: BoxShape.circle, color: ui.color),
                  ),
                  if (!isLast)
                    Expanded(
                        child: Container(width: 2, color: TekaColors.border)),
                ]),
              ),
              const SizedBox(width: TekaSpacing.xs),
              Expanded(
                child: Padding(
                  padding:
                      EdgeInsets.only(bottom: isLast ? 0 : TekaSpacing.sm),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(ui.label,
                            style: isLast
                                ? theme.titleSmall
                                : theme.bodyMedium?.copyWith(
                                    color: TekaColors.neutralForeground)),
                        Text(dateFormat.format(log.createdAt),
                            style: theme.bodySmall
                                ?.copyWith(color: TekaColors.mutedForeground)),
                        if (log.note case final note?
                            when note.trim().isNotEmpty)
                          Text(note,
                              style: theme.bodySmall?.copyWith(
                                  fontStyle: FontStyle.italic,
                                  color: TekaColors.mutedForeground)),
                      ]),
                ),
              ),
            ]),
          );
        }),
    ]);
  }
}

/// First paint of the detail: header, next-step strip, two item rows, a money
/// block and an action bar, all static blocks (no shimmer). Announced once
/// to assistive tech.
class OrderDetailSkeleton extends StatelessWidget {
  const OrderDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget card(List<Widget> children) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(TekaSpacing.sm),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children),
        );
    return Semantics(
      label: 'Chargement de la commande',
      liveRegion: true,
      child: ExcludeSemantics(
        child: Column(children: [
          Expanded(
            child: ReadableColumn(
              padding: EdgeInsets.zero,
              child: ListView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.all(TekaSpacing.md),
                children: [
                  const Row(children: [
                    Expanded(child: SkeletonBlock(width: 220, height: 20)),
                    SizedBox(width: TekaSpacing.xs),
                    SkeletonBlock(width: 96, height: 26, pill: true),
                  ]),
                  const SizedBox(height: TekaSpacing.xs),
                  const SkeletonBlock(width: 120, height: 12),
                  const SizedBox(height: TekaSpacing.md),
                  const SkeletonBlock(width: double.infinity, height: 56),
                  const SizedBox(height: TekaSpacing.md),
                  card([
                    const SkeletonBlock(width: 140, height: 12),
                    const SizedBox(height: TekaSpacing.sm),
                    for (var i = 0; i < 2; i++) ...[
                      if (i > 0) const SizedBox(height: TekaSpacing.sm),
                      const Row(children: [
                        SkeletonBlock(width: 56, height: 56),
                        SizedBox(width: TekaSpacing.sm),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SkeletonBlock(width: 200, height: 14),
                                SizedBox(height: TekaSpacing.xs),
                                SkeletonBlock(width: 120, height: 12),
                              ]),
                        ),
                      ]),
                    ],
                  ]),
                  const SizedBox(height: TekaSpacing.sm),
                  card([
                    const SkeletonBlock(width: 160, height: 12),
                    const SizedBox(height: TekaSpacing.sm),
                    for (var i = 0; i < 3; i++) ...[
                      if (i > 0) const SizedBox(height: TekaSpacing.xs),
                      const Row(children: [
                        Expanded(child: SkeletonBlock(width: 120, height: 14)),
                        SkeletonBlock(width: 90, height: 14),
                      ]),
                    ],
                  ]),
                  const SizedBox(height: TekaSpacing.sm),
                  card([
                    const SkeletonBlock(width: 100, height: 12),
                    const SizedBox(height: TekaSpacing.sm),
                    for (var i = 0; i < 3; i++) ...[
                      if (i > 0) const SizedBox(height: TekaSpacing.sm),
                      const Row(children: [
                        SkeletonBlock(width: 10, height: 10, pill: true),
                        SizedBox(width: TekaSpacing.sm),
                        SkeletonBlock(width: 140, height: 12),
                      ]),
                    ],
                  ]),
                ],
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(TekaSpacing.md),
            decoration: const BoxDecoration(
              color: TekaColors.background,
              border: Border(top: BorderSide(color: TekaColors.border)),
            ),
            child: const SafeArea(
              top: false,
              child: ReadableBottomBar(
                  child: SkeletonBlock(width: double.infinity, height: 44)),
            ),
          ),
        ]),
      ),
    );
  }
}
