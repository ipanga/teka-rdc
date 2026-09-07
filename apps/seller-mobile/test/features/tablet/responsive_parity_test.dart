import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The responsive foundation is duplicated on purpose, exactly like
/// `core/connectivity` and `core/network`: both Flutter apps ship their own
/// copy so neither depends on the other, and the copies must never diverge.
///
/// This test is the thing that actually enforces it. A change made in one app
/// and not mirrored into the other fails here, in CI, instead of surfacing
/// months later as two apps that classify the same width differently.
void main() {
  test('core/layout/responsive.dart is identical in both apps', () {
    final seller = File('lib/core/layout/responsive.dart');
    final buyer = File('../buyer-mobile/lib/core/layout/responsive.dart');

    expect(seller.existsSync(), isTrue, reason: seller.path);
    expect(buyer.existsSync(), isTrue, reason: buyer.path);

    expect(
      seller.readAsStringSync(),
      buyer.readAsStringSync(),
      reason: 'the two copies of the responsive foundation have drifted; '
          'mirror the change into both apps (see the file header)',
    );
  });
}
