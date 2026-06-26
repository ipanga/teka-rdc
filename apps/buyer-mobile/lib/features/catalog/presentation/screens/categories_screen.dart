import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../data/models/category_model.dart';
import '../providers/catalog_provider.dart';
import '../widgets/category_circle.dart';

/// "Categories" bottom-nav tab — a browse-all grid of the top-level catalog
/// categories. Tapping a tile opens the city-scoped listing (`/categories/:id`,
/// a full-screen route with its own back button). Reuses [categoriesProvider]
/// (same data as the home strip) and [CategoryCircle] (same tile + nav).
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
                child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  physics: const AlwaysScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisExtent: 132,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 20,
                  ),
                  itemCount: cats.length,
                  itemBuilder: (context, index) =>
                      CategoryCircle(category: cats[index]),
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
