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

    // Seller UX PR A: the pre-12/iOS image is the DARK wordmark trimmed and
    // sized for ~220 dp; the Android 12+ icon is a splash-only render of the
    // T glyph inside the adaptive safe zone. Neither the opaque 1200 px
    // square nor the white wordmark may come back — the first rendered the
    // brand at ~80 dp, the second is invisible on a white splash.
    expect(pubspec, contains('image: assets/brand/splash_wordmark_200dp.png'));
    expect(pubspec, contains('image: assets/brand/splash_icon_android12.png'));
    expect(pubspec, contains('icon_background_color: "#1A1A1A"'));
    expect(pubspec, contains('fullscreen: false'));
    expect(pubspec, isNot(contains('image: assets/brand/logo_teka_cd.png')));
    expect(pubspec, isNot(contains('image: assets/brand/splash_logo.png')));
    expect(pubspec, isNot(contains('image: assets/brand/splash_wordmark.png')));
    expect(File('assets/brand/splash_logo.png').existsSync(), isFalse,
        reason: 'dead splash source must stay deleted');
  });

  test('source and generated iOS images preserve density resolution', () {
    // The generator treats the source as xxxhdpi (4 px/dp) and derives the
    // iOS 1x/2x/3x images at 1/4, 2/4 and 3/4 of it. Expressed as ratios so
    // a re-cut of the wordmark cannot silently ship a resampled launch image.
    final source = _pngSize('assets/brand/splash_wordmark_200dp.png');
    expect(source.width ~/ 4, inInclusiveRange(200, 240),
        reason: 'wordmark should land near 220 dp, not 300');
    const scales = {
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png': 1,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png': 2,
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png': 3,
    };
    for (final entry in scales.entries) {
      final img = _pngSize(entry.key);
      expect(img.width, source.width * entry.value ~/ 4, reason: entry.key);
      expect(img.height, source.height * entry.value ~/ 4, reason: entry.key);
    }
    // The Android 12 icon is a 1024 px adaptive-style canvas.
    expect(_pngSize('assets/brand/splash_icon_android12.png'),
        (width: 1024, height: 1024));
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
