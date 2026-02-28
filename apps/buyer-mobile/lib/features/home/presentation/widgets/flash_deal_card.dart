import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../data/models/flash_deal_model.dart';

class FlashDealCard extends StatefulWidget {
  final FlashDealModel deal;

  const FlashDealCard({super.key, required this.deal});

  @override
  State<FlashDealCard> createState() => _FlashDealCardState();
}

class _FlashDealCardState extends State<FlashDealCard> {
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _remaining = widget.deal.timeRemaining;
    _startCountdown();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final remaining = widget.deal.timeRemaining;
      if (remaining == Duration.zero) {
        _countdownTimer?.cancel();
      }
      setState(() => _remaining = remaining);
    });
  }

  String _formatDuration(Duration d) {
    final hours = d.inHours.toString().padLeft(2, '0');
    final minutes = (d.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final deal = widget.deal;
    final product = deal.product;
    final imageUrl = product.firstImageUrl;
    final originalPrice = formatCDF(product.priceCDF);
    final discountedPrice = formatCDF(deal.discountedPriceCentimes.toString());

    return GestureDetector(
      onTap: () => context.push('/products/${product.id}'),
      child: Container(
        width: 150,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: TekaColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image with discount badge
            Stack(
              children: [
                SizedBox(
                  height: 120,
                  width: double.infinity,
                  child: imageUrl != null
                      ? Image.network(
                          imageUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _imagePlaceholder(),
                          loadingBuilder: (_, child, progress) {
                            if (progress == null) return child;
                            return _imagePlaceholder();
                          },
                        )
                      : _imagePlaceholder(),
                ),
                // Discount badge
                if (deal.discountPercent != null && deal.discountPercent! > 0)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: TekaColors.tekaRed,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '-${deal.discountPercent}%',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
              ],
            ),

            // Content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Product title
                    Text(
                      product.localizedTitle(locale),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: TekaColors.foreground,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const Spacer(),

                    // Discounted price
                    Text(
                      discountedPrice,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: TekaColors.tekaRed,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const SizedBox(height: 2),

                    // Original price (crossed out)
                    Text(
                      originalPrice,
                      style: const TextStyle(
                        fontSize: 11,
                        color: TekaColors.mutedForeground,
                        decoration: TextDecoration.lineThrough,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),

                    const SizedBox(height: 4),

                    // Countdown timer
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: TekaColors.foreground.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.timer_outlined,
                            size: 12,
                            color: TekaColors.tekaRed,
                          ),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              _formatDuration(_remaining),
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: TekaColors.foreground,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _imagePlaceholder() {
    return Container(
      color: TekaColors.muted,
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          size: 32,
          color: TekaColors.mutedForeground,
        ),
      ),
    );
  }
}
