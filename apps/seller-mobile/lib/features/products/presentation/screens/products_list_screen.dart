import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/seller_filter_bar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../data/models/product_model.dart';
import '../product_status_ui.dart';
import '../providers/products_provider.dart';
import '../widgets/product_card.dart';
import '../../../../core/layout/responsive.dart';

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
      floatingActionButton: FloatingActionButton.extended(
        tooltip: 'Nouveau produit',
        onPressed: () => context.push('/products/new'),
        backgroundColor: TekaColors.tekaRed,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nouveau produit'),
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: SafeArea(
          top: false,
          bottom: false,
          child: Column(
            children: [
              const _ProductSearchField(),
              SellerFilterBar<ProductStatus>(
                selected: state.statusFilter,
                onSelected: _selectStatus,
                // Labels and order from ProductStatusUi — the same source
                // as the chip, the detail strip and the Action Center.
                options: [
                  const SellerFilterOption(null, 'Tous'),
                  for (final status in productFilterOrder)
                    SellerFilterOption(
                        status, ProductStatusUi.of(status).filterLabel),
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
    if (state.search.isNotEmpty) {
      return SellerListMessage(
        icon: Icons.search_off_outlined,
        title: 'Aucun produit pour « ${state.search} »',
        message: 'Vérifiez l’orthographe ou essayez un autre mot.',
        actionLabel: 'Effacer la recherche',
        onAction: () => notifier.setSearch(''),
      );
    }
    final copy = productEmptyCopy(state.statusFilter);
    if (state.statusFilter != null) {
      return SellerListMessage(
        icon: Icons.inventory_2_outlined,
        title: copy.title,
        message: copy.message,
        actionLabel: 'Voir tous les produits',
        onAction: () => _selectStatus(null),
      );
    }
    return SellerListMessage(
      icon: Icons.inventory_2_outlined,
      title: copy.title,
      message: copy.message,
      actionLabel: 'Nouveau produit',
      onAction: () => context.push('/products/new'),
    );
  }

  Widget _buildProductsList(BuildContext context, ProductsListState state) {
    return ListView.builder(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md, TekaSpacing.xs, TekaSpacing.md, 96),
      itemCount: state.products.length +
          (state.isLoadingMore || state.error != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (index < state.products.length) {
          return ProductCard(product: state.products[index]);
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
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xxs),
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
