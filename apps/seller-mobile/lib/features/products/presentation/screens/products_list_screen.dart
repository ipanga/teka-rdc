import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/product_model.dart';
import '../providers/products_provider.dart';
import '../widgets/status_badge.dart';

class ProductsListScreen extends ConsumerStatefulWidget {
  const ProductsListScreen({super.key});

  @override
  ConsumerState<ProductsListScreen> createState() =>
      _ProductsListScreenState();
}

class _ProductsListScreenState extends ConsumerState<ProductsListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(sellerProductsProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(sellerProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.productsTitle),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/products/new'),
        backgroundColor: TekaColors.tekaRed,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          _buildFilterChips(context, l10n, state),
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.products.isEmpty
                    ? _buildErrorState(context, l10n, state.error!)
                    : state.products.isEmpty
                        ? _buildEmptyState(context, l10n)
                        : _buildProductsList(context, l10n, state),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(
      BuildContext context, AppLocalizations l10n, ProductsListState state) {
    final filters = <_FilterItem>[
      _FilterItem(null, l10n.allStatuses),
      _FilterItem(ProductStatus.draft, l10n.statusDraft),
      _FilterItem(ProductStatus.pendingReview, l10n.statusPendingReview),
      _FilterItem(ProductStatus.active, l10n.statusActive),
      _FilterItem(ProductStatus.rejected, l10n.statusRejected),
      _FilterItem(ProductStatus.archived, l10n.statusArchived),
    ];

    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = state.statusFilter == filter.status;
          return FilterChip(
            label: Text(filter.label),
            selected: isSelected,
            selectedColor: TekaColors.tekaRed.withValues(alpha: 0.15),
            checkmarkColor: TekaColors.tekaRed,
            onSelected: (_) {
              ref
                  .read(sellerProductsProvider.notifier)
                  .setStatusFilter(filter.status);
            },
          );
        },
      ),
    );
  }

  Widget _buildErrorState(
      BuildContext context, AppLocalizations l10n, String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: TekaColors.destructive),
            const SizedBox(height: 12),
            Text(
              l10n.authGenericError,
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () =>
                  ref.read(sellerProductsProvider.notifier).loadProducts(),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.loadMore),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, AppLocalizations l10n) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inventory_2_outlined,
                size: 64, color: TekaColors.mutedForeground.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              l10n.noProducts,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => context.push('/products/new'),
              icon: const Icon(Icons.add),
              label: Text(l10n.newProduct),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductsList(
      BuildContext context, AppLocalizations l10n, ProductsListState state) {
    return RefreshIndicator(
      onRefresh: () =>
          ref.read(sellerProductsProvider.notifier).loadProducts(),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.products.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.products.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final product = state.products[index];
          return _ProductListItem(product: product);
        },
      ),
    );
  }
}

class _ProductListItem extends StatelessWidget {
  final SellerProductModel product;

  const _ProductListItem({required this.product});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final dateFormat = DateFormat('dd/MM/yyyy', l10n.localeName);
    final priceFormat = NumberFormat('#,###', 'fr');

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: TekaColors.border),
      ),
      child: InkWell(
        onTap: () => context.push('/products/${product.id}'),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: product.coverImageUrl != null
                      ? Image.network(
                          product.coverImageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _placeholderImage(),
                          loadingBuilder: (_, child, loadingProgress) {
                            if (loadingProgress == null) return child;
                            return _placeholderImage();
                          },
                        )
                      : _placeholderImage(),
                ),
              ),
              const SizedBox(width: 12),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.getLocalizedTitle(l10n.localeName),
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${priceFormat.format(product.priceCDFDisplay)} CDF',
                      style: TextStyle(
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        StatusBadge(
                            status: product.status, compact: true),
                        const Spacer(),
                        Text(
                          dateFormat.format(product.createdAt),
                          style: const TextStyle(
                            fontSize: 11,
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right,
                  size: 20, color: TekaColors.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholderImage() {
    return Container(
      color: TekaColors.muted,
      child: const Icon(
        Icons.image_outlined,
        color: TekaColors.mutedForeground,
        size: 28,
      ),
    );
  }
}

class _FilterItem {
  final ProductStatus? status;
  final String label;

  const _FilterItem(this.status, this.label);
}
