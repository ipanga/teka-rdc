import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../product_status_ui.dart';
import '../providers/products_provider.dart';
import '../widgets/product_card.dart';
import '../widgets/status_badge.dart';

/// One product, as the seller needs it: what state it is in and what to do
/// next (strip), what a buyer pays today, stock, photos, then the content.
/// Lifecycle actions (submit / withdraw / restore / duplicate / archive) are
/// the API's; nothing is added or removed here.
class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return Scaffold(
      appBar: AppBar(
        // Reached via go('/products/:id') right after a product is created
        // (stack replaced) — AdaptiveLeading falls back to the products list.
        leading: const AdaptiveLeading(fallbackLocation: '/products'),
        title: const Text('Détail du produit'),
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: productAsync.when(
          skipLoadingOnRefresh: true,
          loading: () => const ProductDetailSkeleton(),
          error: (e, _) => SellerListState(
            child: SellerListMessage(
              icon: Icons.cloud_off_outlined,
              title: 'Impossible de charger le produit',
              message: friendlyErrorMessage(e),
              actionLabel: 'Réessayer',
              onAction: () =>
                  ref.invalidate(productDetailProvider(widget.productId)),
            ),
          ),
          // Pull-to-refresh: an admin's approval or rejection arrives without
          // any seller action.
          data: (product) => RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(productDetailProvider(widget.productId));
              await ref.read(productDetailProvider(widget.productId).future);
            },
            child: _buildContent(context, product),
          ),
        ),
      ),
    );
  }

  static bool _canManageImages(ProductStatus status) =>
      status == ProductStatus.draft ||
      status == ProductStatus.rejected ||
      status == ProductStatus.active;

  Widget _buildContent(BuildContext context, SellerProductModel product) {
    final theme = Theme.of(context).textTheme;
    final ui = ProductStatusUi.of(product.status);
    final images = List<ProductImageModel>.from(product.images)
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    final canManage = _canManageImages(product.status);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(TekaSpacing.md),
      children: [
        Text(product.title, style: theme.titleLarge),
        const SizedBox(height: TekaSpacing.xs),
        StatusBadge(status: product.status),
        const SizedBox(height: TekaSpacing.md),
        _StatusStrip(ui: ui, reason: product.rejectionReason),
        const SizedBox(height: TekaSpacing.md),
        _Card(children: [
          PriceLine(
              price: product.priceCDFDisplay,
              promo: product.discountPriceCDFDisplay,
              large: true),
          if (product.priceUSDDisplay != null)
            Text('\$${product.priceUSDDisplay!.toStringAsFixed(2)} USD',
                style: theme.bodySmall
                    ?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xs),
          StockLabel(quantity: product.quantity),
          if (product.category != null || product.cityName != null) ...[
            const SizedBox(height: TekaSpacing.xxs),
            Text(
              [
                if (product.category != null) product.category!.name,
                if (product.cityName != null) product.cityName!,
              ].join(' · '),
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.neutralForeground),
            ),
          ],
        ]),
        const SizedBox(height: TekaSpacing.sm),
        _Card(
          title: 'Photos · ${images.length} / 8',
          trailing: canManage
              ? TextButton.icon(
                  onPressed: () =>
                      context.push('/products/${product.id}/images'),
                  icon:
                      const Icon(Icons.add_photo_alternate_outlined, size: 18),
                  label: Text(images.isEmpty ? 'Ajouter' : 'Gérer'),
                )
              : null,
          children: [
            if (images.isEmpty)
              _EmptyPhotos(
                onTap: canManage
                    ? () => context.push('/products/${product.id}/images')
                    : null,
              )
            else
              SizedBox(
                height: 96,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: images.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(width: TekaSpacing.xs),
                  itemBuilder: (context, index) => Stack(children: [
                    ProductThumbnail(
                        url: images[index].thumbnailUrl ?? images[index].url,
                        size: 96),
                    if (index == 0)
                      Positioned(
                        left: TekaSpacing.xxs,
                        right: TekaSpacing.xxs,
                        bottom: TekaSpacing.xxs,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: TekaSpacing.xs, vertical: 2),
                              decoration: BoxDecoration(
                                color: TekaColors.foreground
                                    .withValues(alpha: 0.75),
                                borderRadius: TekaRadius.pillAll,
                              ),
                              child: Text('Couverture',
                                  style: theme.labelSmall?.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
          ],
        ),
        if (product.description.trim().isNotEmpty) ...[
          const SizedBox(height: TekaSpacing.sm),
          _Card(title: 'Description', children: [
            Text(product.description, style: theme.bodyMedium),
          ]),
        ],
        if (product.specifications.isNotEmpty) ...[
          const SizedBox(height: TekaSpacing.sm),
          _Card(title: 'Caractéristiques', children: [
            for (final spec in product.specifications)
              Padding(
                padding: const EdgeInsets.only(bottom: TekaSpacing.xxs),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (spec.attributeName != null)
                        SizedBox(
                          width: 120,
                          child: Text(spec.attributeName!,
                              style: theme.bodySmall?.copyWith(
                                  color: TekaColors.mutedForeground)),
                        ),
                      Expanded(
                          child: Text(spec.value, style: theme.bodyMedium)),
                    ]),
              ),
          ]),
        ],
        const SizedBox(height: TekaSpacing.lg),
        _buildActions(context, product),
        const SizedBox(height: TekaSpacing.xl),
      ],
    );
  }

  Widget _buildActions(BuildContext context, SellerProductModel product) {
    void edit() => context.push('/products/${product.id}/edit', extra: product);
    final duplicate = _ActionButton(
      label: 'Dupliquer',
      icon: Icons.copy_outlined,
      outlined: true,
      busy: _busy,
      onPressed: () => _duplicate(product),
    );
    final buttons = switch (product.status) {
      ProductStatus.draft => [
          _ActionButton(
            label: 'Soumettre pour révision',
            icon: Icons.send_outlined,
            busy: _busy,
            onPressed: () => _submitForReview(product),
          ),
          _ActionButton(
            label: 'Modifier le produit',
            icon: Icons.edit_outlined,
            outlined: true,
            busy: _busy,
            onPressed: edit,
          ),
        ],
      ProductStatus.rejected => [
          _ActionButton(
            label: 'Corriger et resoumettre',
            icon: Icons.edit_outlined,
            busy: _busy,
            onPressed: edit,
          ),
        ],
      ProductStatus.active => [
          _ActionButton(
            label: 'Modifier le produit',
            icon: Icons.edit_outlined,
            busy: _busy,
            onPressed: edit,
          ),
          _ActionButton(
            label: 'Archiver',
            icon: Icons.archive_outlined,
            outlined: true,
            destructive: true,
            busy: _busy,
            onPressed: () => _archiveProduct(product),
          ),
          duplicate,
        ],
      ProductStatus.pendingReview => [
          _ActionButton(
            label: 'Retirer de la révision',
            icon: Icons.undo,
            outlined: true,
            busy: _busy,
            onPressed: () => _withdraw(product),
          ),
          duplicate,
        ],
      ProductStatus.archived => [
          _ActionButton(
            label: 'Restaurer',
            icon: Icons.unarchive_outlined,
            busy: _busy,
            onPressed: () => _restore(product),
          ),
          duplicate,
        ],
      ProductStatus.suspended => [duplicate],
    };
    return Column(children: [
      for (var i = 0; i < buttons.length; i++) ...[
        if (i > 0) const SizedBox(height: TekaSpacing.xs),
        buttons[i],
      ],
    ]);
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw(SellerProductModel product) => _run(() async {
        final p = await ref
            .read(sellerProductsProvider.notifier)
            .withdraw(product.id);
        ref.invalidate(productDetailProvider(widget.productId));
        if (!mounted) return;
        showAppSnackbar(context,
            message: p != null
                ? 'Produit retiré de la révision : il repasse en brouillon.'
                : 'Impossible de retirer le produit. Réessayez.',
            tone: p != null ? AppSnackbarTone.success : AppSnackbarTone.error);
      });

  Future<void> _restore(SellerProductModel product) => _run(() async {
        final p =
            await ref.read(sellerProductsProvider.notifier).restore(product.id);
        ref.invalidate(productDetailProvider(widget.productId));
        if (!mounted) return;
        showAppSnackbar(context,
            message: p != null
                ? 'Produit restauré en brouillon.'
                : 'Impossible de restaurer le produit. Réessayez.',
            tone: p != null ? AppSnackbarTone.success : AppSnackbarTone.error);
      });

  Future<void> _duplicate(SellerProductModel product) => _run(() async {
        final p = await ref
            .read(sellerProductsProvider.notifier)
            .duplicate(product.id);
        if (!mounted) return;
        if (p != null) {
          context.pushReplacement('/products/${p.id}');
        } else {
          showAppSnackbar(context,
              message: 'Impossible de dupliquer le produit. Réessayez.',
              tone: AppSnackbarTone.error);
        }
      });

  Future<bool> _confirm({
    required String title,
    required String body,
    required String actionLabel,
    bool destructive = false,
  }) async {
    var popped = false;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Annuler')),
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

  Future<void> _submitForReview(SellerProductModel product) async {
    // Pre-flight: the API refuses a submission with zero images. Point the
    // seller at the photos instead of a round-trip.
    if (product.images.isEmpty) {
      showAppSnackbar(context,
          message: 'Ajoutez au moins une photo avant de soumettre le produit.',
          tone: AppSnackbarTone.warning);
      return;
    }
    final ok = await _confirm(
      title: 'Soumettre pour révision',
      body:
          'Teka examinera la fiche avant sa mise en ligne. Pendant la révision, vous pourrez la retirer mais pas la modifier.',
      actionLabel: 'Soumettre',
    );
    if (!ok || !mounted) return;
    await _run(() async {
      try {
        await ref.read(productsRepositoryProvider).submitForReview(product.id);
        ref.invalidate(productDetailProvider(widget.productId));
        ref.read(sellerProductsProvider.notifier).loadProducts();
        if (mounted) {
          showAppSnackbar(context,
              message: 'Produit soumis. Teka vous informera de la décision.',
              tone: AppSnackbarTone.success);
        }
      } catch (e) {
        if (mounted) {
          // The API's contextual French reason (missing image, price ≤ 0…).
          showAppSnackbar(context,
              message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
        }
      }
    });
  }

  Future<void> _archiveProduct(SellerProductModel product) async {
    final ok = await _confirm(
      title: 'Archiver ce produit ?',
      body:
          'Il disparaît de votre boutique et les acheteurs ne le verront plus. Vous pourrez le restaurer plus tard.',
      actionLabel: 'Archiver',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _run(() async {
      try {
        await ref.read(productsRepositoryProvider).archiveProduct(product.id);
        ref.read(sellerProductsProvider.notifier).loadProducts();
        if (mounted) {
          showAppSnackbar(context,
              message: 'Produit archivé.', tone: AppSnackbarTone.neutral);
          context.go('/products');
        }
      } catch (e) {
        if (mounted) {
          showAppSnackbar(context,
              message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
        }
      }
    });
  }
}

/// « Correction requise / En ligne / … » strip with the step sentence and,
/// for a refused product, Teka's seller-facing reason (the API sends only
/// `rejectionReason`; no admin-only note exists on this payload).
class _StatusStrip extends StatelessWidget {
  const _StatusStrip({required this.ui, this.reason});
  final ProductStatusUi ui;
  final String? reason;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final background = Color.alphaBlend(
        ui.color.withValues(alpha: 0.08), TekaColors.background);
    final hasReason = reason != null && reason!.trim().isNotEmpty;
    return Semantics(
      container: true,
      label: '${ui.heading}. ${ui.step}${hasReason ? ' Motif : $reason' : ''}',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.all(TekaSpacing.sm),
          decoration:
              BoxDecoration(color: background, borderRadius: TekaRadius.mdAll),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ui.icon, size: 20, color: ui.color),
            const SizedBox(width: TekaSpacing.xs),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ui.heading,
                        style: theme.labelMedium?.copyWith(color: ui.color)),
                    const SizedBox(height: 2),
                    Text(ui.step, style: theme.bodyMedium),
                    if (hasReason) ...[
                      const SizedBox(height: TekaSpacing.xs),
                      Text('Motif indiqué par Teka', style: theme.labelMedium),
                      Text(reason!, style: theme.bodyMedium),
                    ],
                  ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({this.title, this.trailing, required this.children});
  final String? title;
  final Widget? trailing;
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
            if (title != null) ...[
              Row(children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(title!,
                        style: Theme.of(context)
                            .textTheme
                            .labelMedium
                            ?.copyWith(color: TekaColors.mutedForeground)),
                  ),
                ),
                if (trailing != null) trailing!,
              ]),
              const SizedBox(height: TekaSpacing.xs),
            ],
            ...children,
          ],
        ),
      );
}

class _EmptyPhotos extends StatelessWidget {
  const _EmptyPhotos({this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final body = Container(
      height: 96,
      decoration: const BoxDecoration(
          color: TekaColors.muted, borderRadius: TekaRadius.mdAll),
      child: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(
              onTap != null
                  ? Icons.add_photo_alternate_outlined
                  : Icons.image_outlined,
              size: 32,
              color: TekaColors.neutralForeground),
          const SizedBox(height: TekaSpacing.xxs),
          Text(onTap != null ? 'Ajouter des photos' : 'Aucune photo',
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.neutralForeground)),
        ]),
      ),
    );
    if (onTap == null) return body;
    return Semantics(
      button: true,
      label: 'Ajouter des photos',
      child: ExcludeSemantics(
        child:
            InkWell(onTap: onTap, borderRadius: TekaRadius.mdAll, child: body),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.outlined = false,
    this.destructive = false,
    this.busy = false,
  });
  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final bool outlined;
  final bool destructive;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    // Own row so a long French label wraps at 1.5× instead of overflowing
    // the button (`.icon` constructors put the label in an unbounded Row).
    final child = Row(mainAxisSize: MainAxisSize.min, children: [
      if (busy && !outlined)
        const SizedBox(
            width: 16,
            height: 16,
            child:
                CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
      else
        Icon(icon, size: 18),
      const SizedBox(width: TekaSpacing.xs),
      Flexible(child: Text(label, textAlign: TextAlign.center)),
    ]);
    final press = busy ? null : onPressed;
    return SizedBox(
      width: double.infinity,
      child: outlined
          ? OutlinedButton(
              onPressed: press,
              style: destructive
                  ? OutlinedButton.styleFrom(
                      foregroundColor: TekaColors.destructiveForeground,
                      side: const BorderSide(color: TekaColors.destructive))
                  : null,
              child: child,
            )
          : ElevatedButton(onPressed: press, child: child),
    );
  }
}

/// First paint: title, chip, strip, price card, a photo strip and two
/// content cards — static blocks, announced once.
class ProductDetailSkeleton extends StatelessWidget {
  const ProductDetailSkeleton({super.key});

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
              crossAxisAlignment: CrossAxisAlignment.start, children: children),
        );
    return Semantics(
      label: 'Chargement du produit',
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(TekaSpacing.md),
          children: [
            const SkeletonBlock(width: 260, height: 22),
            const SizedBox(height: TekaSpacing.xs),
            const SkeletonBlock(width: 90, height: 26, pill: true),
            const SizedBox(height: TekaSpacing.md),
            const SkeletonBlock(width: double.infinity, height: 56),
            const SizedBox(height: TekaSpacing.md),
            card(const [
              SkeletonBlock(width: 140, height: 24),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 90, height: 14),
            ]),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 100, height: 12),
              SizedBox(height: TekaSpacing.xs),
              Wrap(
                  spacing: TekaSpacing.xs,
                  runSpacing: TekaSpacing.xs,
                  children: [
                    SkeletonBlock(width: 96, height: 96),
                    SkeletonBlock(width: 96, height: 96),
                    SkeletonBlock(width: 96, height: 96),
                  ]),
            ]),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 100, height: 12),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: double.infinity, height: 14),
              SizedBox(height: TekaSpacing.xxs),
              SkeletonBlock(width: 220, height: 14),
            ]),
          ],
        ),
      ),
    );
  }
}
