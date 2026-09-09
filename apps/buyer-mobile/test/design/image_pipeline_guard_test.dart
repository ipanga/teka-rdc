import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// One image pipeline (UX/UI polish phase, 2026-09-07).
///
/// Two of the seven image call sites used raw `Image.network`, so the home
/// banners and flash deals downloaded uncached and decoded at full resolution
/// on a 2 GB phone — the exact device class this marketplace targets. This
/// guard keeps them out.
void main() {
  final lib = Directory('lib');

  Iterable<File> dartFiles() => lib
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'));

  test('no screen reaches for Image.network', () {
    final offenders = <String>[];
    for (final file in dartFiles()) {
      final source = file.readAsStringSync();
      // Skip comments that merely mention the API.
      for (final line in source.split('\n')) {
        final trimmed = line.trimLeft();
        if (trimmed.startsWith('//') || trimmed.startsWith('///')) continue;
        if (trimmed.contains('Image.network(')) {
          offenders.add(file.path);
          break;
        }
      }
    }
    expect(offenders, isEmpty,
        reason: 'use TekaNetworkImage — it caches and sizes the decode');
  });

  test('CachedNetworkImage is only constructed by the shared widget', () {
    // One deliberate exception: the full-screen viewer sits on a black
    // backdrop, where the shared widget's muted surface would be wrong.
    const allowed = {
      'lib/core/widgets/teka_network_image.dart',
      'lib/features/catalog/presentation/widgets/image_gallery.dart',
    };
    final offenders = <String>[];
    for (final file in dartFiles()) {
      if (allowed.contains(file.path)) continue;
      if (file.readAsStringSync().contains('CachedNetworkImage(')) {
        offenders.add(file.path);
      }
    }
    expect(offenders, isEmpty,
        reason: 'route remote images through TekaNetworkImage');
  });

  test('the brand keeps no dead payment colours', () {
    // COD only since 2026-05-26; the Mobile Money provider colours had no
    // call site left and are gone.
    final colors =
        File('lib/core/theme/teka_colors.dart').readAsStringSync();
    for (final dead in ['paymentMpesa', 'paymentAirtel', 'paymentOrange']) {
      expect(colors.contains(dead), isFalse, reason: dead);
    }
  });

  test('no raw hex colour outside the token file', () {
    final offenders = <String>[];
    for (final file in dartFiles()) {
      if (file.path == 'lib/core/theme/teka_colors.dart') continue;
      for (final line in file.readAsStringSync().split('\n')) {
        final trimmed = line.trimLeft();
        if (trimmed.startsWith('//') || trimmed.startsWith('///')) continue;
        if (RegExp(r'Color\(0x').hasMatch(trimmed)) {
          offenders.add('${file.path}: ${trimmed.trim()}');
        }
      }
    }
    expect(offenders, isEmpty,
        reason: 'add a named token to TekaColors instead');
  });
}
