// Host-side driver for the opt-in native QA (flutter drive). Writes each
// `binding.takeScreenshot(name)` to docs/qa/order-integrity/native-followup/.
// Run from apps/seller-mobile (see that folder's README.md).

import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() => integrationDriver(
      onScreenshot: (String name, List<int> bytes,
          [Map<String, Object?>? args]) async {
        final file =
            File('../../docs/qa/order-integrity/native-followup/$name.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(bytes);
        return true;
      },
    );
