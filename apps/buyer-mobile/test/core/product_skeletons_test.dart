import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/core/widgets/product_skeletons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shimmer becomes a static placeholder when motion is disabled',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Scaffold(
            body: ShimmerBox(width: 120, height: 20),
          ),
        ),
      ),
    );

    final container = tester.widget<Container>(
      find.descendant(
        of: find.byType(ShimmerBox),
        matching: find.byType(Container),
      ),
    );
    final decoration = container.decoration! as BoxDecoration;

    expect(decoration.color, TekaColors.surfaceMuted);
    expect(decoration.gradient, isNull);
    expect(tester.takeException(), isNull);
  });
}
