import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/seller_filter_bar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../data/models/product_model.dart';
import '../providers/products_provider.dart';
import '../widgets/status_badge.dart';

class ProductsListScreen extends ConsumerStatefulWidget {
  const ProductsListScreen(
      {super.key, this.statusQuery, this.syncWithRoute = false});
  final String? statusQuery;
  final bool syncWithRoute;

  @override
  ConsumerState<ProductsListScreen> createState() => _ProductsListScreenState();
}

class _ProductsListScreenState extends ConsumerState<ProductsListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _applyRoute();
  }

  @override
  void didUpdateWidget(covariant ProductsListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.statusQuery != widget.statusQuery) _applyRoute();
  }

  void _applyRoute() {
    if (!widget.syncWithRoute) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref
          .read(sellerProductsProvider.notifier)
          .setStatusFilter(productStatusFromQuery(widget.statusQuery));
    });
  }

  void _selectStatus(ProductStatus? status) {
    ref.read(sellerProductsProvider.notifier).setStatusFilter(status);
    if (widget.syncWithRoute) {
      context.go(status == null
          ? '/products'
          : '/products?status=${productStatusToApi(status)}');
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final state = ref.read(sellerProductsProvider);
    if (!state.isLoading &&
        state.error == null &&
        _scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200) {
      ref.read(sellerProductsProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sellerProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text("Produits"),
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Nouveau produit',
        onPressed: () => context.push('/products/new'),
        backgroundColor: TekaColors.tekaRed,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            const _ProductSearchField(),
            SellerFilterBar<ProductStatus>(
              selected: state.statusFilter,
              onSelected: _selectStatus,
              options: const [
                SellerFilterOption(null, 'Tous'),
                SellerFilterOption(ProductStatus.draft, 'Brouillons'),
                SellerFilterOption(ProductStatus.pendingReview, 'En attente'),
                SellerFilterOption(ProductStatus.active, 'Actifs'),
                SellerFilterOption(ProductStatus.rejected, 'Rejetés'),
                SellerFilterOption(ProductStatus.archived, 'Archivés'),
                SellerFilterOption(ProductStatus.suspended, 'Suspendus'),
              ],
            ),
            Expanded(
              child: state.isLoading
                  ? const SellerListLoading(label: 'Chargement des produits')
                  : RefreshIndicator(
                      onRefresh: ref
                          .read(sellerProductsProvider.notifier)
                          .loadProducts,
                      child: state.products.isEmpty
                          ? SellerListState(child: _message(state))
                          : _buildProductsList(context, state),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _message(ProductsListState state) {
    final notifier = ref.read(sellerProductsProvider.notifier);
    if (state.error != null) {
      return SellerListMessage(
        icon: Icons.cloud_off_outlined,
        title: 'Impossible de charger les produits',
        message: state.error!,
        actionLabel: 'Réessayer',
        onAction: notifier.loadProducts,
      );
    }
    if (state.search.isNotEmpty || state.statusFilter != null) {
      return SellerListMessage(
        icon: Icons.search_off_outlined,
        title: 'Aucun produit trouvé',
        message: 'Essayez une autre recherche ou un autre statut.',
        actionLabel: state.search.isNotEmpty
            ? 'Effacer la recherche'
            : 'Voir tous les produits',
        onAction: state.search.isNotEmpty
            ? () => notifier.setSearch('')
            : () => _selectStatus(null),
      );
    }
    return SellerListMessage(
      icon: Icons.inventory_2_outlined,
      title: 'Votre catalogue commence ici',
      message:
          'Ajoutez votre premier produit, puis ses photos avant de le soumettre pour révision.',
      actionLabel: 'Nouveau produit',
      onAction: () => context.push('/products/new'),
    );
  }

  Widget _buildProductsList(BuildContext context, ProductsListState state) {
    return ListView.builder(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      itemCount: state.products.length +
          (state.isLoadingMore || state.error != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (index < state.products.length) {
          return _ProductListItem(product: state.products[index]);
        }
        if (state.error != null) return _message(state);
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Center(
              child: CircularProgressIndicator(
            semanticsLabel: 'Chargement des produits suivants',
          )),
        );
      },
    );
  }
}

class _ProductListItem extends StatelessWidget {
  final SellerProductModel product;

  const _ProductListItem({required this.product});

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');

    return Card(
      color: TekaColors.background,
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: TekaColors.border),
      ),
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: () => context.push('/products/${product.id}'),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: 56,
                        height: 56,
                        child: product.coverImageUrl != null
                            ? Image.network(
                                product.coverImageUrl!,
                                fit: BoxFit.cover,
                                excludeFromSemantics: true,
                                errorBuilder: (_, __, ___) =>
                                    _placeholderImage(),
                                loadingBuilder: (_, child, progress) =>
                                    progress == null
                                        ? child
                                        : _placeholderImage(),
                              )
                            : _placeholderImage(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(product.title,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600, fontSize: 15),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 6),
                          Text('${formatFcNumber(product.priceCDFDisplay)} FC',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 15)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StatusBadge(status: product.status, compact: true),
                    if (product.cityName != null)
                      Text(product.cityName!,
                          style: const TextStyle(
                              fontSize: 12, color: TekaColors.mutedForeground)),
                    Text(dateFormat.format(product.createdAt),
                        style: const TextStyle(
                            fontSize: 12, color: TekaColors.mutedForeground)),
                  ],
                ),
              ],
            ),
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

/// Debounced search box (title / référence / id) feeding the products provider.
class _ProductSearchField extends ConsumerStatefulWidget {
  const _ProductSearchField();

  @override
  ConsumerState<_ProductSearchField> createState() =>
      _ProductSearchFieldState();
}

class _ProductSearchFieldState extends ConsumerState<_ProductSearchField> {
  late final TextEditingController _controller;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _controller =
        TextEditingController(text: ref.read(sellerProductsProvider).search);
  }

  void _submit(String value) {
    _debounce?.cancel();
    ref.read(sellerProductsProvider.notifier).setSearch(value.trim());
  }

  @override
  void dispose() {
    _controller.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(sellerProductsProvider.notifier).setSearch(value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<(String, int)>(
        sellerProductsProvider.select((s) => (s.search, s.searchResetVersion)),
        (previous, value) {
      final next = value.$1;
      if (_controller.text.trim() != next || previous?.$2 != value.$2) {
        _debounce?.cancel();
        _controller.value = TextEditingValue(
          text: next,
          selection: TextSelection.collapsed(offset: next.length),
        );
        setState(() {});
      }
    });
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: TextField(
        controller: _controller,
        onChanged: _onChanged,
        onSubmitted: _submit,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          labelText: 'Rechercher un produit',
          hintText: 'Nom, référence ou ID',
          prefixIcon: const Icon(Icons.search, size: 20),
          isDense: true,
          border: const OutlineInputBorder(),
          suffixIcon: _controller.text.isNotEmpty
              ? IconButton(
                  tooltip: 'Effacer la recherche',
                  icon: const Icon(Icons.clear, size: 20),
                  onPressed: () {
                    setState(_controller.clear);
                    _submit('');
                  },
                )
              : null,
        ),
      ),
    );
  }
}
