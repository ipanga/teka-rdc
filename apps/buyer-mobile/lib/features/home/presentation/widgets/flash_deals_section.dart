import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/flash_deal_provider.dart';
import 'flash_deal_card.dart';

class FlashDealsSection extends ConsumerWidget {
  const FlashDealsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final flashDealsAsync = ref.watch(flashDealsProvider);

    return flashDealsAsync.when(
      data: (deals) {
        if (deals.isEmpty) return const SizedBox.shrink();

        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Icon(
                    Icons.flash_on,
                    color: TekaColors.warning,
                    size: 22,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    l10n.flashDeals,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: TekaColors.foreground,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),

            // Horizontal list of deal cards
            SizedBox(
              height: 260,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: deals.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) => FlashDealCard(
                  deal: deals[index],
                ),
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
