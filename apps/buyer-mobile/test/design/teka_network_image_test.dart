import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/core/widgets/product_skeletons.dart';
import 'package:buyer_mobile/core/widgets/teka_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// One remote-image treatment (UX/UI polish phase, 2026-09-07).
///
/// The app had seven network-image call sites and six different
/// loading/failure looks, two of them bypassing the cache entirely — which is
/// why a 404'd home banner rendered as a dead grey block. These tests pin the
/// two states a buyer actually sees.
Future<void> _pump(WidgetTester tester, Widget child,
    {double width = 200, double height = 200}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(width: width, height: height, child: child),
        ),
      ),
    ),
  );
}

void main() {
  _fallbackContrast();

  testWidgets('a null url renders the fallback, never an empty box',
      (tester) async {
    await _pump(tester, const TekaNetworkImage(url: null));
    expect(find.byIcon(Icons.image_outlined), findsOneWidget);
  });

  testWidgets('an empty or blank url is treated as no image', (tester) async {
    for (final url in <String>['', '   ']) {
      await _pump(tester, TekaNetworkImage(url: url));
      expect(find.byIcon(Icons.image_outlined), findsOneWidget,
          reason: 'url "$url"');
    }
  });

  testWidgets('the fallback icon and caption are configurable',
      (tester) async {
    await _pump(
      tester,
      const TekaNetworkImage(
        url: null,
        fallbackIcon: Icons.image_not_supported_outlined,
        fallbackIconSize: 44,
        fallbackLabel: 'Image indisponible',
      ),
    );
    expect(find.byIcon(Icons.image_not_supported_outlined), findsOneWidget);
    expect(find.text('Image indisponible'), findsOneWidget);
    expect(tester.widget<Icon>(find.byType(Icon)).size, 44);
  });

  testWidgets('no caption is shown unless asked for — thumbnails have no room',
      (tester) async {
    await _pump(tester, const TekaNetworkImage(url: null), width: 56,
        height: 56);
    expect(find.byType(Text), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a real url starts on the shared shimmer, not a blank panel',
      (tester) async {
    // The network layer is stubbed out in tests, so the widget stays in its
    // placeholder state — which is exactly the state under test.
    await _pump(tester, const TekaNetworkImage(url: 'https://example.test/a.jpg'));
    await tester.pump();
    expect(find.byType(ShimmerBox), findsOneWidget);
  });

  testWidgets('an unbounded width still lays out — a horizontal shelf',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            height: 120,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SizedBox(
                width: 160,
                child: TekaNetworkImage(url: 'https://example.test/a.jpg'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a decorative thumbnail stays out of the semantics tree',
      (tester) async {
    final handle = tester.ensureSemantics();
    await _pump(tester, const TekaNetworkImage(url: 'https://example.test/a.jpg'));
    await tester.pump();
    expect(find.bySemanticsLabel('https://example.test/a.jpg'), findsNothing);
    handle.dispose();
  });
}

/// Contrast guard for the banner fallback (measured on the emulator: white
/// title on the light fallback came out at 2.82:1, below AA).
void _fallbackContrast() {
  test('a dark fallback surface keeps overlaid white text AA-legible', () {
    double contrastWithWhite(Color background) =>
        1.05 / (background.computeLuminance() + 0.05);

    // The banner passes the foreground neutral.
    expect(contrastWithWhite(TekaColors.foreground),
        greaterThanOrEqualTo(4.5));
    // …and the default light surface is deliberately NOT used behind white
    // text, which is why the option exists.
    expect(contrastWithWhite(TekaColors.surfaceMuted), lessThan(4.5));
  });
}
