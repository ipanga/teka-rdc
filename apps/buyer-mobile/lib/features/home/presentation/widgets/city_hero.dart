import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../city/data/city_hero_images.dart';
import '../../../city/presentation/providers/city_provider.dart';

/// City hero for the mobile home — the buyer app's equivalent of the web city
/// landing hero. Shows the bundled city image when available, else an
/// accent-gradient (driven by `City.accentColor`), with the same city-templated
/// copy as the web ("Achetez en ligne à {city}"). Fully data-driven: a new town
/// gets a premium hero with no code change (gradient + templated copy), and an
/// image once one is bundled. Renders nothing until a town is selected.
class CityHero extends ConsumerWidget {
  const CityHero({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final city = ref.watch(cityProvider).selectedCity;
    if (city == null) return const SizedBox.shrink();

    final asset = cityHeroImageAsset(city.slug);
    final (accent, _) = TekaColors.cityAccent(city.accentColor);
    final accentDark = Color.lerp(accent, Colors.black, 0.45)!;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 196,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Background: bundled city image, or an accent gradient fallback.
              if (asset != null)
                Image.asset(asset, fit: BoxFit.cover)
              else
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [accent, accentDark],
                    ),
                  ),
                ),
              // Legibility scrim (darkest on the left where the copy sits).
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Colors.black87, Colors.black26],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Town badge.
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        "Livraison à ${city.name}",
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      "Achetez en ligne à ${city.name}",
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      "Découvrez les meilleurs produits disponibles à ${city.name} avec livraison locale rapide.",
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 12.5,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => context.push('/search'),
                      style: FilledButton.styleFrom(
                        backgroundColor: TekaColors.tekaRed,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 10,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        "Decouvrir les produits",
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
