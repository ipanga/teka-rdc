import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/navigation/pending_route.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/city_model.dart';
import '../providers/city_provider.dart';

class CitySelectionScreen extends ConsumerStatefulWidget {
  const CitySelectionScreen({super.key});

  @override
  ConsumerState<CitySelectionScreen> createState() =>
      _CitySelectionScreenState();
}

class _CitySelectionScreenState extends ConsumerState<CitySelectionScreen> {
  // Search query — keeps the picker usable as the town list grows (10 / 50+).
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final cityState = ref.watch(cityProvider);
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      backgroundColor: TekaColors.surfaceMuted,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 28),
              // City icon
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: TekaColors.tekaRed.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.location_city_rounded,
                  size: 30,
                  color: TekaColors.tekaRed,
                ),
              ),
              const SizedBox(height: 16),
              // Title
              Text(
                "Choisissez votre ville",
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: TekaColors.foreground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              // Description
              Text(
                "Pour voir les produits disponibles",
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                      height: 1.25,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              // Search field
              TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: "Rechercher une ville…",
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // City list
              Expanded(
                child: _buildCityList(
                  context,
                  ref,
                  cityState,
                  locale,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCityList(
    BuildContext context,
    WidgetRef ref,
    CityState cityState,
    String locale,
  ) {
    if (cityState.isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          color: TekaColors.tekaRed,
          strokeWidth: 2,
        ),
      );
    }

    if (cityState.error != null) {
      return Center(
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: TekaColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline,
                size: 40,
                color: TekaColors.tekaRed,
              ),
              const SizedBox(height: 12),
              Text(
                'Impossible de charger les villes.',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: TekaColors.foreground,
                      fontWeight: FontWeight.w700,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Vérifiez votre connexion puis réessayez.',
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 13,
                  height: 1.3,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () {
                  ref.read(cityProvider.notifier).fetchCities();
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Réessayer'),
                style: FilledButton.styleFrom(
                  backgroundColor: TekaColors.tekaRed,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (cityState.cities.isEmpty) {
      return Center(
        child: Text(
          'Aucune ville disponible',
          style: TextStyle(color: TekaColors.mutedForeground),
        ),
      );
    }

    // Filter by the search query (name or province), then group by province.
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? cityState.cities
        : cityState.cities
            .where((c) =>
                c.name.toLowerCase().contains(q) ||
                c.province.toLowerCase().contains(q))
            .toList();

    if (filtered.isEmpty) {
      return Center(
        child: Text(
          "Aucune ville trouvée",
          style: TextStyle(color: TekaColors.mutedForeground),
        ),
      );
    }

    final grouped = <String, List<CityModel>>{};
    for (final city in filtered) {
      grouped.putIfAbsent(city.province, () => []).add(city);
    }

    final provinces = grouped.keys.toList()..sort();

    return ListView.builder(
      itemCount: provinces.length,
      itemBuilder: (context, index) {
        final province = provinces[index];
        final cities = grouped[province]!;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (index > 0) const SizedBox(height: 16),
            // Province header
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                province,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: TekaColors.mutedForeground,
                      letterSpacing: 0.5,
                    ),
              ),
            ),
            // City cards
            ...cities.map((city) => _CityCard(
                  city: city,
                  locale: locale,
                  isSelected: cityState.selectedCity?.id == city.id,
                  onTap: () async {
                    await ref.read(cityProvider.notifier).selectCity(city);
                    if (!context.mounted) return;
                    context.go('/');
                    // A notification tap or a shared link that arrived before
                    // the town was chosen (PR D): open it now, on top of home
                    // so Back returns to the app rather than to nothing.
                    final pending = ref.read(pendingRouteProvider);
                    if (pending != null) {
                      ref.read(pendingRouteProvider.notifier).state = null;
                      context.push(pending);
                    }
                  },
                )),
          ],
        );
      },
    );
  }
}

class _CityCard extends StatelessWidget {
  final CityModel city;
  final String locale;
  final bool isSelected;
  final VoidCallback onTap;

  const _CityCard({
    required this.city,
    required this.locale,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Town accent: each city shows its own colour from its data-driven
    // accentColor (copper / cobalt / brand-red default) so the town identity
    // reads at a glance.
    final (accent, accentSubtle) = TekaColors.cityAccent(city.accentColor);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: isSelected ? accentSubtle : TekaColors.background,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              border: Border.all(
                color: isSelected ? accent : TekaColors.border,
                width: isSelected ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: accentSubtle,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.location_on_outlined,
                    color: accent,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    city.name,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight:
                              isSelected ? FontWeight.w600 : FontWeight.w500,
                          color: isSelected ? accent : TekaColors.foreground,
                        ),
                  ),
                ),
                if (isSelected)
                  Icon(
                    Icons.check_circle,
                    color: accent,
                    size: 24,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
