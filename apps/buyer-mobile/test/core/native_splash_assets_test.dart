import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

({int width, int height}) _pngSize(String path) {
  final bytes = File(path).readAsBytesSync();
  expect(bytes.length, greaterThanOrEqualTo(24), reason: '$path is truncated');
  final data = ByteData.sublistView(bytes, 16, 24);
  return (
    width: data.getUint32(0, Endian.big),
    height: data.getUint32(4, Endian.big),
  );
}

void main() {
  test('native splash configuration uses compact platform-native branding', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();

    expect(pubspec, contains('image: assets/brand/splash_logo.png'));
    expect(pubspec, contains('icon_background_color: "#C8102E"'));
    expect(pubspec, isNot(contains('image: assets/brand/logo_teka_cd.png')));
  });

  test('source and generated iOS splash images retain density resolution', () {
    expect(
        _pngSize('assets/brand/splash_logo.png'), (width: 1200, height: 1200));

    const iosImages = {
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png': 300,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png': 600,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png': 900,
    };

    for (final entry in iosImages.entries) {
      expect(_pngSize(entry.key), (width: entry.value, height: entry.value));
    }
  });

  test('Android 12 launch themes keep the icon visible in light and dark mode',
      () {
    for (final path in const [
      'android/app/src/main/res/values-v31/styles.xml',
      'android/app/src/main/res/values-night-v31/styles.xml',
    ]) {
      final xml = File(path).readAsStringSync();
      expect(xml, contains('windowSplashScreenBackground">#FFFFFF'));
      expect(xml, contains('windowSplashScreenIconBackgroundColor">#C8102E'));
      expect(xml, contains('@drawable/android12splash'));
    }
  });

  test('Android 13+ explicitly prefers the icon over an empty splash', () {
    for (final path in const [
      'android/app/src/main/res/values-v33/styles.xml',
      'android/app/src/main/res/values-night-v33/styles.xml',
    ]) {
      final xml = File(path).readAsStringSync();
      expect(xml, contains('windowSplashScreenBehavior">icon_preferred'));
      expect(xml, contains('windowSplashScreenIconBackgroundColor">#C8102E'));
      expect(xml, contains('@drawable/android12splash'));
    }
  });
}
