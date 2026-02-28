import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final pageAsync = ref.watch(contentPageProvider(slug));

    return Scaffold(
      appBar: AppBar(
        title: pageAsync.when(
          data: (page) => Text(page.localizedTitle(locale)),
          loading: () => Text(l10n.contentPages),
          error: (_, __) => Text(l10n.contentPages),
        ),
      ),
      body: pageAsync.when(
        data: (page) {
          final content = page.localizedContent(locale);

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
                    l10n.pageNotFound,
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
                  page.localizedTitle(locale),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: TekaColors.foreground,
                      ),
                ),
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 16),
                // Render content as text paragraphs
                // Split by double newlines for paragraph breaks
                ..._buildContentParagraphs(context, content),
              ],
            ),
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 64,
                  color: TekaColors.mutedForeground,
                ),
                const SizedBox(height: 16),
                Text(
                  l10n.authGenericError,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: TekaColors.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => ref.invalidate(contentPageProvider(slug)),
                  icon: const Icon(Icons.refresh),
                  label: Text(l10n.backToHome),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildContentParagraphs(BuildContext context, String content) {
    final paragraphs = content.split(RegExp(r'\n\s*\n'));
    final widgets = <Widget>[];

    for (int i = 0; i < paragraphs.length; i++) {
      final paragraph = paragraphs[i].trim();
      if (paragraph.isEmpty) continue;

      // Check if it looks like a heading (starts with # or is all uppercase short text)
      if (paragraph.startsWith('#')) {
        final level = paragraph.indexOf(RegExp(r'[^#]'));
        final headingText = paragraph.substring(level).trim();
        widgets.add(
          Padding(
            padding: EdgeInsets.only(top: i > 0 ? 16 : 0, bottom: 8),
            child: Text(
              headingText,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
          ),
        );
      } else {
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              paragraph,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: TekaColors.foreground,
                    height: 1.6,
                  ),
            ),
          ),
        );
      }
    }

    return widgets;
  }
}
