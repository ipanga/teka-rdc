import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

/// Guards `ios/Runner/PrivacyInfo.xcprivacy`.
///
/// App Review rejected buyer-mobile 0.1.4 under guideline 5.1.2(i) because the
/// App Store Connect privacy labels declared Crash Data / Other Diagnostic Data
/// / Device ID as "used to track you" while the app shipped no App Tracking
/// Transparency prompt. The app does not track — the labels were wrong — and
/// this manifest is the binary-side declaration that backs the corrected
/// labels.
///
/// If someone later adds an ad SDK, an attribution SDK, or flips a data type to
/// tracking, this test fails *before* another rejection does. Kept dependency-
/// free (string assertions, no XML package) so it costs nothing to run.
void main() {
  final file = File('ios/Runner/PrivacyInfo.xcprivacy');
  late String xml;

  setUpAll(() {
    expect(
      file.existsSync(),
      isTrue,
      reason: 'ios/Runner/PrivacyInfo.xcprivacy is missing. Apple ships the app '
          'without a privacy manifest if it is absent — re-add it and run '
          'scripts/ios-add-privacy-manifest.rb to wire it into the target.',
    );
    xml = file.readAsStringSync();
  });

  group('PrivacyInfo.xcprivacy — the app must not declare tracking', () {
    test('NSPrivacyTracking is false', () {
      expect(
        RegExp(r'<key>NSPrivacyTracking</key>\s*<false\s*/>').hasMatch(xml),
        isTrue,
        reason: 'NSPrivacyTracking must be <false/>. Setting it true commits '
            'the app to an ATT prompt (guideline 5.1.2(i)).',
      );
    });

    test('NSPrivacyTrackingDomains is empty', () {
      expect(
        RegExp(r'<key>NSPrivacyTrackingDomains</key>\s*<array\s*/>').hasMatch(xml),
        isTrue,
        reason: 'Any domain listed here is declared as contacted for tracking, '
            'which requires an ATT prompt. It must stay empty.',
      );
    });

    test('no collected data type is marked as used for tracking', () {
      // Every NSPrivacyCollectedDataTypeTracking key must be followed by <false/>.
      final matches = RegExp(
        r'<key>NSPrivacyCollectedDataTypeTracking</key>\s*<(true|false)\s*/>',
      ).allMatches(xml);

      expect(matches, isNotEmpty,
          reason: 'expected at least one declared data type');

      final tracking =
          matches.where((m) => m.group(1) == 'true').length;
      expect(tracking, 0,
          reason: '$tracking data type(s) declare tracking. Apple then requires '
              'an AppTrackingTransparency prompt before any collection.');
    });

    test('every declared data type carries the three required keys', () {
      final types =
          RegExp(r'<key>NSPrivacyCollectedDataType</key>').allMatches(xml).length;
      final linked =
          RegExp(r'<key>NSPrivacyCollectedDataTypeLinked</key>').allMatches(xml).length;
      final trackingKeys =
          RegExp(r'<key>NSPrivacyCollectedDataTypeTracking</key>').allMatches(xml).length;
      final purposes =
          RegExp(r'<key>NSPrivacyCollectedDataTypePurposes</key>').allMatches(xml).length;

      expect(linked, types, reason: 'every type needs a Linked key');
      expect(trackingKeys, types, reason: 'every type needs a Tracking key');
      expect(purposes, types, reason: 'every type needs a Purposes key');
    });

    test('declares no advertising or IDFA data type', () {
      // These are the types that force an ATT prompt.
      for (final banned in const [
        'NSPrivacyCollectedDataTypeAdvertisingData',
        'NSPrivacyCollectedDataTypeDeviceIDForAdvertising',
      ]) {
        expect(xml.contains(banned), isFalse,
            reason: '$banned implies advertising use — the app has no ad SDK.');
      }
    });
  });
}
