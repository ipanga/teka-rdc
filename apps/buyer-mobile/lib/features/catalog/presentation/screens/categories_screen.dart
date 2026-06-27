import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../data/category_images.dart';
import '../../data/models/category_model.dart';
import '../providers/catalog_provider.dart';

/// "Categories" bottom-nav tab — a browse-all list of the top-level catalog
/// categories with subcategory previews. Tapping a row opens the listing
/// (`/categories/:id`) as a full-screen route with its own back button.
class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Catégories')),
      body: categories.when(
        data: (cats) => cats.isEmpty
            ? _CategoriesEmpty(onBrowse: () => context.go('/'))
            : RefreshIndicator(
                color: TekaColors.tekaRed,
                onRefresh: () async {
                  ref.invalidate(categoriesProvider);
                  await ref
                      .read(categoriesProvider.future)
                      .catchError((_) => <CategoryModel>[]);
                },
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: cats.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) =>
                      _CategoryOverviewCard(category: cats[index]),
                ),
              ),
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (_, __) => AppErrorState(
          message: 'Impossible de charger les catégories.',
          onRetry: () => ref.invalidate(categoriesProvider),
        ),
      ),
    );
  }
}

class _CategoryOverviewCard extends StatelessWidget {
  final CategoryModel category;
  const _CategoryOverviewCard({required this.category});

  @override
  Widget build(BuildContext context) {
    final asset = categoryImageAsset(category.slug);
    final subcategories = category.subcategories.take(4).toList();

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push(
          '/categories/${category.id}',
          extra: {'categoryName': category.name},
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: TekaColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(16),
                ),
                clipBehavior: Clip.antiAlias,
                alignment: Alignment.center,
                child: asset != null
                    ? Padding(
                        padding: const EdgeInsets.all(10),
                        child: Image.asset(asset, fit: BoxFit.contain),
                      )
                    : Text(
                        category.emoji ?? '📦',
                        style: const TextStyle(fontSize: 30),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            category.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${category.productCount}',
                          style:
                              Theme.of(context).textTheme.labelMedium?.copyWith(
                                    color: TekaColors.mutedForeground,
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (subcategories.isEmpty)
                      const Text(
                        'Voir les produits',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: TekaColors.mutedForeground,
                          fontSize: 12,
                        ),
                      )
                    else
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: subcategories
                            .map(
                              (sub) => _SubcategoryChip(
                                label: sub.name,
                                onTap: () => context.push(
                                  '/categories/${sub.id}',
                                  extra: {'categoryName': sub.name},
                                ),
                              ),
                            )
                            .toList(),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right,
                color: TekaColors.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubcategoryChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SubcategoryChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 130),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: TekaColors.tekaRedSubtle,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: TekaColors.tekaRed,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _CategoriesEmpty extends StatelessWidget {
  final VoidCallback onBrowse;
  const _CategoriesEmpty({required this.onBrowse});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.grid_view_outlined,
                size: 72, color: TekaColors.mutedForeground),
            const SizedBox(height: 16),
            Text(
              'Aucune catégorie disponible',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: onBrowse,
              child: const Text('Retour à l\'accueil'),
            ),
          ],
        ),
      ),
    );
  }
}
