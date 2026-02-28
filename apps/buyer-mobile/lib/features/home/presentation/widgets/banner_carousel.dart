import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/banner_model.dart';
import '../providers/banner_provider.dart';

class BannerCarousel extends ConsumerStatefulWidget {
  const BannerCarousel({super.key});

  @override
  ConsumerState<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends ConsumerState<BannerCarousel>
    with WidgetsBindingObserver {
  final PageController _pageController = PageController();
  Timer? _autoAdvanceTimer;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _stopAutoAdvance();
    _pageController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _stopAutoAdvance();
    } else if (state == AppLifecycleState.resumed) {
      _startAutoAdvance(ref.read(bannersProvider).valueOrNull?.length ?? 0);
    }
  }

  void _startAutoAdvance(int totalPages) {
    _stopAutoAdvance();
    if (totalPages <= 1) return;
    _autoAdvanceTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) {
        if (!mounted || !_pageController.hasClients) return;
        final nextPage = (_currentPage + 1) % totalPages;
        _pageController.animateToPage(
          nextPage,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut,
        );
      },
    );
  }

  void _stopAutoAdvance() {
    _autoAdvanceTimer?.cancel();
    _autoAdvanceTimer = null;
  }

  void _onBannerTap(BuildContext context, BannerModel banner) {
    final linkType = banner.linkType;
    final linkTarget = banner.linkTarget;

    if (linkType == null || linkTarget == null || linkTarget.isEmpty) return;

    switch (linkType) {
      case 'product':
        context.push('/products/$linkTarget');
      case 'category':
        context.push('/categories/$linkTarget');
      case 'url':
        // External URLs: do nothing in mobile for now
        // Could integrate url_launcher if needed
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bannersAsync = ref.watch(bannersProvider);

    return bannersAsync.when(
      data: (banners) {
        if (banners.isEmpty) return const SizedBox.shrink();

        // Start auto-advance once banners are loaded
        if (_autoAdvanceTimer == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _startAutoAdvance(banners.length);
          });
        }

        final locale = Localizations.localeOf(context).languageCode;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 180,
              child: PageView.builder(
                controller: _pageController,
                itemCount: banners.length,
                onPageChanged: (index) {
                  setState(() => _currentPage = index);
                },
                itemBuilder: (context, index) {
                  final banner = banners[index];
                  return GestureDetector(
                    onTap: () => _onBannerTap(context, banner),
                    child: _BannerSlide(
                      banner: banner,
                      locale: locale,
                    ),
                  );
                },
              ),
            ),
            if (banners.length > 1)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _DotIndicators(
                  count: banners.length,
                  currentIndex: _currentPage,
                ),
              ),
          ],
        );
      },
      loading: () => const SizedBox(
        height: 180,
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _BannerSlide extends StatelessWidget {
  final BannerModel banner;
  final String locale;

  const _BannerSlide({
    required this.banner,
    required this.locale,
  });

  @override
  Widget build(BuildContext context) {
    final title = banner.localizedTitle(locale);
    final subtitle = banner.localizedSubtitle(locale);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: TekaColors.muted,
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(
            banner.imageUrl,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              color: TekaColors.muted,
              child: const Center(
                child: Icon(
                  Icons.image_outlined,
                  size: 48,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ),
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                color: TekaColors.muted,
                child: const Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              );
            },
          ),
          // Gradient overlay for text readability
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black54,
                  ],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (title.isNotEmpty)
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        shadows: [
                          Shadow(
                            offset: Offset(0, 1),
                            blurRadius: 3,
                            color: Colors.black26,
                          ),
                        ],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  if (subtitle != null && subtitle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DotIndicators extends StatelessWidget {
  final int count;
  final int currentIndex;

  const _DotIndicators({
    required this.count,
    required this.currentIndex,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (index) {
        final isActive = index == currentIndex;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: isActive ? 20 : 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            color: isActive ? TekaColors.tekaRed : TekaColors.border,
          ),
        );
      }),
    );
  }
}
