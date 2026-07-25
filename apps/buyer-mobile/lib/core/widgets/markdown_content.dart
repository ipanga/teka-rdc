import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/teka_colors.dart';

/// Lightweight Markdown renderer for CMS content pages (`/v1/content/:slug`).
///
/// Deliberately dependency-free (no `flutter_markdown`) to keep the bundle
/// small for low-end DRC devices. Supports the subset the CMS actually uses:
/// `##`/`###` headings, `-`/`*` bullet lists, `1.` ordered lists, blank-line
/// paragraphs, inline `**bold**`, and tappable `[label](url)` links
/// (`tel:` / `mailto:` / `https:` / `wa.me`). Anything else renders as plain
/// text. Mirrors what buyer-web renders via `react-markdown`.
class MarkdownContent extends StatefulWidget {
  final String data;

  const MarkdownContent(this.data, {super.key});

  @override
  State<MarkdownContent> createState() => _MarkdownContentState();
}

class _MarkdownContentState extends State<MarkdownContent> {
  /// Tap recognizers created for inline links; disposed with the widget.
  final List<TapGestureRecognizer> _recognizers = [];

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _launch(String url) async {
    final uri = Uri.tryParse(url.trim());
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Best-effort — a missing handler (e.g. no dialer) shouldn't crash the page.
    }
  }

  @override
  Widget build(BuildContext context) {
    // Recognizers are rebuilt on each build; clear the previous batch first.
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();

    final lines = widget.data.replaceAll('\r\n', '\n').split('\n');
    final blocks = <Widget>[];
    var paragraph = <String>[];
    var bullets = <String>[];
    var ordered = <String>[];

    void flushParagraph() {
      if (paragraph.isEmpty) return;
      blocks.add(_paragraph(context, paragraph.join(' ')));
      paragraph = [];
    }

    void flushBullets() {
      if (bullets.isEmpty) return;
      blocks.add(_list(context, bullets, ordered: false));
      bullets = [];
    }

    void flushOrdered() {
      if (ordered.isEmpty) return;
      blocks.add(_list(context, ordered, ordered: true));
      ordered = [];
    }

    void flushAll() {
      flushParagraph();
      flushBullets();
      flushOrdered();
    }

    for (final raw in lines) {
      final line = raw.trimRight();
      final trimmed = line.trim();

      if (trimmed.isEmpty) {
        flushAll();
        continue;
      }

      final heading = RegExp(r'^(#{1,6})\s+(.*)$').firstMatch(trimmed);
      if (heading != null) {
        flushAll();
        blocks.add(_heading(context, heading.group(1)!.length, heading.group(2)!));
        continue;
      }

      final bullet = RegExp(r'^[-*]\s+(.*)$').firstMatch(trimmed);
      if (bullet != null) {
        flushParagraph();
        flushOrdered();
        bullets.add(bullet.group(1)!);
        continue;
      }

      final orderedItem = RegExp(r'^\d+\.\s+(.*)$').firstMatch(trimmed);
      if (orderedItem != null) {
        flushParagraph();
        flushBullets();
        ordered.add(orderedItem.group(1)!);
        continue;
      }

      // Regular text — accumulate into the current paragraph.
      flushBullets();
      flushOrdered();
      paragraph.add(trimmed);
    }
    flushAll();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: blocks,
    );
  }

  Widget _heading(BuildContext context, int level, String text) {
    final theme = Theme.of(context).textTheme;
    final style = (level <= 2 ? theme.titleLarge : theme.titleMedium)?.copyWith(
      fontWeight: FontWeight.bold,
      color: TekaColors.foreground,
    );
    return Padding(
      padding: EdgeInsets.only(top: blocksTopSpacing, bottom: 8),
      child: Text.rich(TextSpan(children: _inline(text, style)), style: style),
    );
  }

  double get blocksTopSpacing => 18;

  Widget _paragraph(BuildContext context, String text) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: TekaColors.foreground,
          height: 1.6,
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text.rich(TextSpan(children: _inline(text, style)), style: style),
    );
  }

  Widget _list(BuildContext context, List<String> items, {required bool ordered}) {
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: TekaColors.foreground,
          height: 1.6,
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8, top: 1),
                    child: Text(
                      ordered ? '${i + 1}.' : '•',
                      style: style?.copyWith(
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text.rich(
                      TextSpan(children: _inline(items[i], style)),
                      style: style,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Parses inline `**bold**` and `[label](url)` into spans.
  List<InlineSpan> _inline(String text, TextStyle? base) {
    final spans = <InlineSpan>[];
    final pattern = RegExp(r'\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*');
    var last = 0;

    for (final m in pattern.allMatches(text)) {
      if (m.start > last) {
        spans.add(TextSpan(text: text.substring(last, m.start)));
      }
      if (m.group(1) != null) {
        final label = m.group(1)!;
        final url = m.group(2)!;
        final recognizer = TapGestureRecognizer()..onTap = () => _launch(url);
        _recognizers.add(recognizer);
        spans.add(TextSpan(
          text: label,
          style: base?.copyWith(
            color: TekaColors.tekaRed,
            fontWeight: FontWeight.w600,
            decoration: TextDecoration.underline,
            decorationColor: TekaColors.tekaRed,
          ),
          recognizer: recognizer,
        ));
      } else {
        spans.add(TextSpan(
          text: m.group(3),
          style: base?.copyWith(fontWeight: FontWeight.w700),
        ));
      }
      last = m.end;
    }
    if (last < text.length) {
      spans.add(TextSpan(text: text.substring(last)));
    }
    return spans;
  }
}
