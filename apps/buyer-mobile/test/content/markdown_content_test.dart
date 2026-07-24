import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/widgets/markdown_content.dart';

void main() {
  group('MarkdownContent (CMS content renderer)', () {
    Future<void> pump(WidgetTester tester, String data) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: SingleChildScrollView(child: MarkdownContent(data))),
        ),
      );
    }

    testWidgets('renders headings, paragraphs, bold and list items as text',
        (tester) async {
      await pump(
        tester,
        '## Besoin d\'aide ?\n\nNotre équipe est **disponible**.\n\n- Premier point\n- Second point',
      );

      // Heading + paragraph text present.
      expect(find.text('Besoin d\'aide ?'), findsOneWidget);
      // Bullets rendered with a marker.
      expect(find.text('•'), findsNWidgets(2));
      expect(find.textContaining('Premier point'), findsOneWidget);
      expect(find.textContaining('Second point'), findsOneWidget);
    });

    testWidgets('ordered lists render numeric markers', (tester) async {
      await pump(tester, '1. Étape une\n2. Étape deux');
      expect(find.text('1.'), findsOneWidget);
      expect(find.text('2.'), findsOneWidget);
    });

    testWidgets('inline [label](url) becomes a tappable span', (tester) async {
      await pump(
        tester,
        'Écrivez à [contact@teka.cd](mailto:contact@teka.cd) pour toute question.',
      );

      // Find a RichText whose spans include a recognizer on the link label.
      final richTexts = tester.widgetList<RichText>(find.byType(RichText));
      var foundTappableLink = false;
      for (final rt in richTexts) {
        rt.text.visitChildren((span) {
          if (span is TextSpan &&
              span.text == 'contact@teka.cd' &&
              span.recognizer is TapGestureRecognizer) {
            foundTappableLink = true;
          }
          return true;
        });
      }
      expect(foundTappableLink, isTrue,
          reason: 'the [label](url) link should carry a tap recognizer');
    });
  });
}
