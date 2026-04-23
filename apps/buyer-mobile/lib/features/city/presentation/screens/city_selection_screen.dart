import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/city_model.dart';
import '../providers/city_provider.dart';

class CitySelectionScreen extends ConsumerWidget {
  const CitySelectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final cityState = ref.watch(cityProvider);
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const SizedBox(height: 48),
              // City icon
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: TekaColors.tekaRed.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.location_city_rounded,
                  size: 40,
                  color: TekaColors.tekaRed,
                ),
              ),
              const SizedBox(height: 24),
              // Title
              Text(
                l10n.selectCity,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: TekaColors.foreground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              // Description
              Text(
                l10n.selectCityDescription,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              cityState.error!,
              style: TextStyle(color: TekaColors.mutedForeground),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () {
                ref.read(cityProvider.notifier).fetchCities();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Reessayer'),
              style: FilledButton.styleFrom(
                backgroundColor: TekaColors.tekaRed,
              ),
            ),
          ],
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

    // Group cities by province
    final grouped = <String, List<CityModel>>{};
    for (final city in cityState.cities) {
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
                    if (context.mounted) {
                      context.go('/');
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: isSelected
            ? TekaColors.tekaRed.withOpacity(0.05)
            : TekaColors.background,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              border: Border.all(
                color: isSelected ? TekaColors.tekaRed : TekaColors.border,
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
                    color: isSelected
                        ? TekaColors.tekaRed.withOpacity(0.1)
                        : TekaColors.muted,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.location_on_outlined,
                    color: isSelected
                        ? TekaColors.tekaRed
                        : TekaColors.mutedForeground,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    city.getLocalizedName(locale),
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight:
                              isSelected ? FontWeight.w600 : FontWeight.w500,
                          color: isSelected
                              ? TekaColors.tekaRed
                              : TekaColors.foreground,
                        ),
                  ),
                ),
                if (isSelected)
                  const Icon(
                    Icons.check_circle,
                    color: TekaColors.tekaRed,
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
