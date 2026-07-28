import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/commerce_header.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../../city/presentation/providers/city_provider.dart';
import '../providers/catalog_provider.dart';
import '../widgets/product_card.dart';

/// Dedicated discount-discovery screen: products with an active seller-set
/// promotion, town-scoped via the city provider. Reached from the home
/// "Promotions" section's "Voir tout".
class PromotionsScreen extends ConsumerWidget {
  const PromotionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cityId = ref.watch(cityProvider).selectedCity?.id;
    final params = BrowseProductsParams(onPromotion: true, cityId: cityId);
    final state = ref.watch(browseProductsProvider(params));

    Widget body;
    if (state.isLoading && state.products.isEmpty) {
      body = ProductGridSkeleton(
        count: 6,
        mainAxisExtent: productCardGridExtent(
          context,
          variant: ProductCardVariant.catalog,
        ),
      );
    } else if (state.products.isEmpty) {
      body = ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Center(
              child: Text(
                state.error ??
                    "Aucune promotion en cours pour le moment. Revenez bientôt !",
                textAlign: TextAlign.center,
                style: const TextStyle(color: TekaColors.mutedForeground),
              ),
            ),
          ),
        ],
      );
    } else {
      body = GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisExtent: productCardGridExtent(
            context,
            variant: ProductCardVariant.catalog,
          ),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: state.products.length,
        itemBuilder: (context, index) =>
            ProductCard(product: state.products[index]),
      );
    }

    return Scaffold(
      appBar: const CommerceAppBar(
        searchLabel: 'Rechercher dans Teka...',
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(browseProductsProvider(params).notifier).refresh(),
        child: body,
      ),
    );
  }
}
