import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/markdown_content.dart';
import '../../data/content_repository.dart';
import '../../data/models/content_page_model.dart';

final contentPageProvider =
    FutureProvider.family<ContentPageModel, String>((ref, slug) {
  final repository = ref.read(contentRepositoryProvider);
  return repository.getPage(slug);
});

class ContentPageScreen extends ConsumerWidget {
  final String slug;

  const ContentPageScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pageAsync = ref.watch(contentPageProvider(slug));

    return Scaffold(
      appBar: AppBar(
        title: pageAsync.when(
          data: (page) => Text(page.title),
          loading: () => Text("Pages"),
          error: (_, __) => Text("Pages"),
        ),
      ),
      body: pageAsync.when(
        data: (page) {
          final content = page.content;

          if (content.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.article_outlined,
                    size: 64,
                    color: TekaColors.mutedForeground,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    "Page non trouvée",
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: TekaColors.mutedForeground,
                        ),
                  ),
                ],
              ),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  page.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: TekaColors.foreground,
                      ),
                ),
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 16),
                // Render CMS Markdown (headings, lists, bold, tappable links).
                MarkdownContent(content),
              ],
            ),
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (error, _) => AppErrorState(
          message: 'Impossible de charger cette page.',
          onRetry: () => ref.invalidate(contentPageProvider(slug)),
        ),
      ),
    );
  }
}
