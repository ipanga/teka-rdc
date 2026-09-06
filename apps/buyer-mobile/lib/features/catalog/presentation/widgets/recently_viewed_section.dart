import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/product_model.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/recently_viewed_store.dart';
import 'product_card.dart';

/// "Vus récemment" horizontal strip (Phase D / D-3b). Reads the client-local
/// SharedPreferences history. `excludeId` drops the current product on the PDP
/// so it doesn't list itself. Renders nothing when empty.
class RecentlyViewedSection extends ConsumerWidget {
  final String? excludeId;

  const RecentlyViewedSection({super.key, this.excludeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A4: the history is wiped on logout / account switch; rebuild on every
    // session change so the section reflects the disk, not a stale frame.
    ref.watch(authProvider.select((s) => s.status));
    final List<BrowseProductModel> items = ref
        .read(recentlyViewedStoreProvider)
        .getAll()
        .where((p) => p.id != excludeId)
        .toList(growable: false);

    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Vus récemment",
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: productCardRowExtent(
            context,
            variant: ProductCardVariant.discovery,
            itemWidth: 150,
          ),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) => SizedBox(
              width: 150,
              child: ProductCard(
                product: items[i],
                variant: ProductCardVariant.discovery,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
