import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import '../widgets/status_badge.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  bool _isSubmitting = false;
  bool _isArchiving = false;
  bool _busy = false; // withdraw / restore / duplicate in flight

  @override
  Widget build(BuildContext context) {
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return Scaffold(
      appBar: AppBar(
        title: Text("Produits"),
      ),
      body: productAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline,
                    size: 48, color: TekaColors.destructive),
                const SizedBox(height: 12),
                Text("Une erreur est survenue. Veuillez reessayer."),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(productDetailProvider(widget.productId)),
                  child: Text("Reessayer"),
                ),
              ],
            ),
          ),
        ),
        data: (product) => _buildContent(context, product),
      ),
    );
  }

  Widget _buildContent(
      BuildContext context, SellerProductModel product) {
    final priceFormat = NumberFormat('#,###', 'fr');
    final locale = 'fr';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Rejection reason banner
        if (product.status == ProductStatus.rejected &&
            product.rejectionReason != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: TekaColors.destructive.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                  color: TekaColors.destructive.withValues(alpha: 0.3)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.warning_amber_rounded,
                    color: TekaColors.destructive, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Motif du rejet",
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: TekaColors.destructive,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        product.rejectionReason!,
                        style: const TextStyle(
                          color: TekaColors.destructive,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Status & date
        Row(
          children: [
            StatusBadge(status: product.status),
            const Spacer(),
            Text(
              DateFormat('dd/MM/yyyy HH:mm', locale)
                  .format(product.createdAt),
              style: const TextStyle(
                  fontSize: 12, color: TekaColors.mutedForeground),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Title
        Text(
          product.title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 12),

        // Price
        Row(
          children: [
            Text(
              '${priceFormat.format(product.priceCDFDisplay)} CDF',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: TekaColors.tekaRed,
              ),
            ),
            if (product.priceUSDDisplay != null) ...[
              const SizedBox(width: 12),
              Text(
                '\$${product.priceUSDDisplay!.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 16,
                  color: TekaColors.mutedForeground,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),

        // Quantity & Condition
        Row(
          children: [
            const Icon(Icons.inventory_2_outlined,
                size: 16, color: TekaColors.mutedForeground),
            const SizedBox(width: 4),
            Text(
              'Quantite: ${product.quantity}',
              style: const TextStyle(
                  fontSize: 13, color: TekaColors.mutedForeground),
            ),
            const SizedBox(width: 16),
            const Icon(Icons.sell_outlined,
                size: 16, color: TekaColors.mutedForeground),
            const SizedBox(width: 4),
            Text(
              product.condition == ProductCondition.newItem
                  ? "Neuf"
                  : "Occasion",
              style: const TextStyle(
                  fontSize: 13, color: TekaColors.mutedForeground),
            ),
          ],
        ),
        const SizedBox(height: 4),

        // Category
        if (product.category != null)
          Row(
            children: [
              const Icon(Icons.category_outlined,
                  size: 16, color: TekaColors.mutedForeground),
              const SizedBox(width: 4),
              Text(
                product.category!.name,
                style: const TextStyle(
                    fontSize: 13, color: TekaColors.mutedForeground),
              ),
            ],
          ),
        const SizedBox(height: 16),

        // Description
        if (product.description.isNotEmpty) ...[
          const Divider(),
          const SizedBox(height: 8),
          Text(
            product.description,
            style: const TextStyle(fontSize: 14, height: 1.5),
          ),
          const SizedBox(height: 16),
        ],

        // Images section
        const Divider(),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              "Images",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(width: 8),
            Text(
              "${product.images.length}/${8} images",
              style: const TextStyle(
                  fontSize: 12, color: TekaColors.mutedForeground),
            ),
            const Spacer(),
            if (product.status == ProductStatus.draft ||
                product.status == ProductStatus.rejected)
              TextButton.icon(
                onPressed: () =>
                    context.push('/products/${product.id}/images'),
                icon: const Icon(Icons.edit, size: 16),
                label: Text("Ajouter"),
                style: TextButton.styleFrom(
                  foregroundColor: TekaColors.tekaRed,
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (product.images.isEmpty)
          Container(
            height: 100,
            decoration: BoxDecoration(
              color: TekaColors.muted,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Icon(Icons.image_outlined,
                  size: 40, color: TekaColors.mutedForeground),
            ),
          )
        else
          SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: product.images.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final img = product.images[index];
                return ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    img.thumbnailUrl ?? img.url,
                    width: 100,
                    height: 100,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 100,
                      height: 100,
                      color: TekaColors.muted,
                      child: const Icon(Icons.broken_image,
                          color: TekaColors.mutedForeground),
                    ),
                  ),
                );
              },
            ),
          ),
        const SizedBox(height: 16),

        // Specifications
        if (product.specifications.isNotEmpty) ...[
          const Divider(),
          const SizedBox(height: 8),
          Text(
            "Specifications",
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          ...product.specifications.map((spec) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    if (spec.attributeName != null) ...[
                      Text(
                        '${spec.attributeName}:',
                        style: const TextStyle(
                          fontWeight: FontWeight.w500,
                          color: TekaColors.mutedForeground,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Text(
                      spec.value,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 16),
        ],

        // Action buttons
        const Divider(),
        const SizedBox(height: 12),
        _buildActions(context, product),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildActions(
      BuildContext context, SellerProductModel product) {
    switch (product.status) {
      case ProductStatus.draft:
        return Column(
          children: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting
                    ? null
                    : () => _submitForReview(context, product),
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
                label: Text("Soumettre pour revision"),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () =>
                    context.push('/products/${product.id}/edit', extra: product),
                icon: const Icon(Icons.edit),
                label: Text("Modifier le produit"),
              ),
            ),
          ],
        );
      case ProductStatus.rejected:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () =>
                context.push('/products/${product.id}/edit', extra: product),
            icon: const Icon(Icons.edit),
            label: Text("Modifier le produit"),
          ),
        );
      case ProductStatus.active:
        return Column(
          children: [
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _isArchiving
                    ? null
                    : () => _archiveProduct(context, product),
                icon: _isArchiving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.archive_outlined),
                label: Text("Archiver"),
                style: OutlinedButton.styleFrom(
                  foregroundColor: TekaColors.destructive,
                  side: const BorderSide(color: TekaColors.destructive),
                ),
              ),
            ),
            const SizedBox(height: 8),
            _duplicateButton(product),
          ],
        );
      case ProductStatus.pendingReview:
        return Column(
          children: [
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _withdraw(product),
                icon: const Icon(Icons.undo),
                label: Text("Retirer de la revision"),
              ),
            ),
            const SizedBox(height: 8),
            _duplicateButton(product),
          ],
        );
      case ProductStatus.archived:
        return Column(
          children: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _busy ? null : () => _restore(product),
                icon: const Icon(Icons.unarchive_outlined),
                label: Text("Restaurer"),
              ),
            ),
            const SizedBox(height: 8),
            _duplicateButton(product),
          ],
        );
      case ProductStatus.suspended:
        return _duplicateButton(product);
    }
  }

  Widget _duplicateButton(SellerProductModel product) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: _busy ? null : () => _duplicate(product),
        icon: const Icon(Icons.copy_outlined),
        label: Text("Dupliquer"),
      ),
    );
  }

  Future<void> _withdraw(SellerProductModel product) async {
    setState(() => _busy = true);
    final p = await ref.read(sellerProductsProvider.notifier).withdraw(product.id);
    ref.invalidate(productDetailProvider(widget.productId));
    if (mounted) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(p != null ? "Produit retiré" : "Une erreur est survenue."),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _restore(SellerProductModel product) async {
    setState(() => _busy = true);
    final p = await ref.read(sellerProductsProvider.notifier).restore(product.id);
    ref.invalidate(productDetailProvider(widget.productId));
    if (mounted) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(p != null ? "Produit restauré" : "Une erreur est survenue."),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _duplicate(SellerProductModel product) async {
    setState(() => _busy = true);
    final p = await ref.read(sellerProductsProvider.notifier).duplicate(product.id);
    if (mounted) {
      setState(() => _busy = false);
      if (p != null) {
        context.pushReplacement('/products/${p.id}');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text("Une erreur est survenue."),
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  Future<void> _submitForReview(
      BuildContext context, SellerProductModel product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Soumettre pour revision"),
        content: Text("Voulez-vous soumettre ce produit pour revision ? Il sera examine par notre equipe."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text("Soumettre pour revision"),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isSubmitting = true);
    try {
      await ref.read(productsRepositoryProvider).submitForReview(product.id);
      ref.invalidate(productDetailProvider(widget.productId));
      ref.invalidate(sellerProductsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Produit soumis pour revision"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez reessayer."),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _archiveProduct(
      BuildContext context, SellerProductModel product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Archiver"),
        content: Text("Voulez-vous archiver ce produit ? Il ne sera plus visible par les acheteurs."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text("Archiver"),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isArchiving = true);
    try {
      await ref.read(productsRepositoryProvider).archiveProduct(product.id);
      ref.invalidate(sellerProductsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Produit archive"),
            behavior: SnackBarBehavior.floating,
          ),
        );
        context.go('/products');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez reessayer."),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isArchiving = false);
    }
  }
}
