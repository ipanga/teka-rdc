// The status bar must stay visible, and legible.
//
// Reported 2026-08-05: both apps showed a blank white strip where the clock,
// battery and signal belong. Cause was native, not Dart — the splash-screen
// work added `android:windowFullscreen=true` to LaunchTheme and
// `UIStatusBarHidden=true` to Info.plist. The intent was a fullscreen SPLASH,
// but on Android the window flags set by the launch theme survive Flutter's
// swap to NormalTheme, so the bar stayed hidden for the entire session; on iOS
// the plist key is unconditional.
//
// Nothing in Dart can catch that, and a widget test cannot see native config —
// so these assert the config files directly. They are cheap and they are the
// only automated guard that exists for this class of regression.
//
// Mirrored byte-for-byte in seller-mobile (Rule 15).

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';

void main() {
  group('native config keeps the status bar visible', () {
    test('no Android theme hides the window', () {
      final themes = Directory('android/app/src/main/res')
          .listSync()
          .whereType<Directory>()
          .map((d) => File('${d.path}/styles.xml'))
          .where((f) => f.existsSync())
          .toList();

      // Guard the guard: if the paths ever move, this test must fail loudly
      // rather than silently pass over an empty list.
      expect(themes, isNotEmpty,
          reason: 'expected at least one res/values*/styles.xml');

      for (final f in themes) {
        expect(
          f.readAsStringSync(),
          isNot(contains('android:windowFullscreen')),
          reason: '${f.path} hides the status bar for the whole session — '
              'the launch theme\'s window flags outlive NormalTheme',
        );
      }
    });

    test('iOS does not hide the status bar', () {
      final plist = File('ios/Runner/Info.plist');
      expect(plist.existsSync(), isTrue);
      expect(
        plist.readAsStringSync(),
        isNot(contains('UIStatusBarHidden')),
        reason: 'UIStatusBarHidden hides the bar unconditionally',
      );
    });
  });

  group('status bar contents are legible', () {
    test('the app bar asks for dark icons on our light background', () {
      // A visible bar with white-on-white icons looks identical to a hidden
      // one, so visibility alone is not the guarantee worth pinning.
      final style = AppTheme.lightTheme.appBarTheme.systemOverlayStyle;
      expect(style, isNotNull,
          reason: 'an AppBar with no explicit style recomputes its own');
      expect(style!.statusBarIconBrightness, Brightness.dark); // Android
      expect(style.statusBarBrightness, Brightness.light); // iOS
    });
  });
}
