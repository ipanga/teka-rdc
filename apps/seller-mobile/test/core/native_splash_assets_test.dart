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
  test('native splash uses compact seller branding without fullscreen', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();

    expect(pubspec, contains('image: assets/brand/splash_logo.png'));
    expect(pubspec, contains('icon_background_color: "#1A1A1A"'));
    expect(pubspec, contains('fullscreen: false'));
    expect(pubspec, isNot(contains('image: assets/brand/logo_teka_cd.png')));
  });

  test('source and generated iOS images preserve density resolution', () {
    expect(
      _pngSize('assets/brand/splash_logo.png'),
      (width: 1200, height: 1200),
    );
    const iosImages = {
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png': 300,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png': 600,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png': 900,
    };
    for (final entry in iosImages.entries) {
      expect(_pngSize(entry.key), (width: entry.value, height: entry.value));
    }
  });

  test('launch configuration cannot hide the status bar', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(plist, isNot(contains('UIStatusBarHidden')));

    for (final path in const [
      'android/app/src/main/res/values/styles.xml',
      'android/app/src/main/res/values-night/styles.xml',
      'android/app/src/main/res/values-v31/styles.xml',
      'android/app/src/main/res/values-night-v31/styles.xml',
      'android/app/src/main/res/values-v33/styles.xml',
      'android/app/src/main/res/values-night-v33/styles.xml',
    ]) {
      final xml = File(path).readAsStringSync();
      expect(xml, isNot(contains('windowFullscreen')), reason: path);
      expect(xml, isNot(contains('windowDrawsSystemBarBackgrounds')),
          reason: path);
    }
  });

  test('Android 12 and 13 keep the white glyph visible on charcoal', () {
    for (final path in const [
      'android/app/src/main/res/values-v31/styles.xml',
      'android/app/src/main/res/values-night-v31/styles.xml',
      'android/app/src/main/res/values-v33/styles.xml',
      'android/app/src/main/res/values-night-v33/styles.xml',
    ]) {
      final xml = File(path).readAsStringSync();
      expect(xml, contains('windowSplashScreenBackground">#FFFFFF'));
      expect(xml, contains('windowSplashScreenIconBackgroundColor">#1A1A1A'));
      expect(xml, contains('@drawable/android12splash'));
    }
    for (final path in const [
      'android/app/src/main/res/values-v33/styles.xml',
      'android/app/src/main/res/values-night-v33/styles.xml',
    ]) {
      expect(File(path).readAsStringSync(),
          contains('windowSplashScreenBehavior">icon_preferred'));
    }
  });
}
