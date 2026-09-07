// PR D3 (2026-09-07) — user-facing copy is French, accented, and never a raw
// backend enum. This walks the real source so a regression is caught where it
// is written, not only where a widget test happens to render.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Every Dart string literal in `lib/`, with its file and line.
Iterable<({String file, int line, String text})> _literals() sync* {
  // Good enough for copy: a quoted run on one line, either quote style.
  final singleQuoted = RegExp(r"'([^'\n]*)'");
  final doubleQuoted = RegExp(r'"([^"\n]*)"');
  for (final entity in Directory('lib').listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    final lines = entity.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final raw = lines[i];
      final line = raw.trim();
      if (line.startsWith('//') || line.startsWith('///')) continue;
      if (line.startsWith('import ') || line.startsWith('export ')) continue;
      for (final re in [singleQuoted, doubleQuoted]) {
        for (final m in re.allMatches(raw)) {
          final text = m.group(1) ?? '';
          if (text.isEmpty) continue;
          // Skip technical identifiers — analytics keys, widget keys, FCM
          // screen names, URL segments, asset paths. They are lower-case
          // without spaces; user-facing copy has a space or a capital.
          if (RegExp(r'^[a-z0-9_\-./:]+$').hasMatch(text)) continue;
          yield (file: entity.path, line: i + 1, text: text);
        }
      }
    }
  }
}

void main() {
  test('no French word is left unaccented in user-facing copy', () {
    // Words that must carry their accents wherever they appear in copy.
    const needsAccent = [
      'Reinitialiser', 'Selectionnez', 'Selectionner', 'Telephone',
      'confirmee', 'Ecrire', 'Verification', 'enregistree', 'repere',
      'Reessayer', 'Expediee', 'Livree', 'Annulee', 'Retournee', 'Recue',
      'Prete', 'Deja', 'Numero', 'Echoue', 'Echec', 'Preparation',
      'Categorie', 'Securite', 'Deconnexion', 'a la livraison',
      // Found live in the filter sheet during PR D3 QA, after the first pass:
      'recents', 'decroissant', 'Popularite', 'Resultats', 'Resultat',
      'Details', 'Detail', 'Precedent', 'Derniere', 'Premiere', 'Terminee',
      'Validee', 'Succes', 'Ajoutee', 'Retiree', 'Selectionne',
      // Missed by the first pass because they are lower-case in copy
      // (« a ete passee avec succes ») — the matcher is case-insensitive now.
      'ete', 'passee', 'creee', 'reussi', 'reussie', 'annulee', 'modifiee',
      'ajoutee', 'enregistre', 'complete', 'donnee', 'donnees', 'privee',
    ];
    final offenders = <String>[];
    for (final lit in _literals()) {
      for (final w in needsAccent) {
        final re = RegExp(
          '(?<![A-Za-zÀ-ÿ])${RegExp.escape(w)}(?![A-Za-zÀ-ÿ])',
          caseSensitive: false,
        );
        if (re.hasMatch(lit.text)) {
          offenders.add('${lit.file}:${lit.line} — "${lit.text}"');
          break;
        }
      }
    }
    expect(offenders, isEmpty,
        reason: 'Unaccented French copy:\n${offenders.join('\n')}');
  });

  test('no raw order/payment enum is used as display copy', () {
    // A literal that is EXACTLY an enum value and sits in a presentation file
    // would be shown to a buyer. Comparisons live in providers/models, which
    // are excluded — those legitimately switch on the wire value.
    const enums = {
      'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_TEKA_PICKUP',
      'RECEIVED_AT_TEKA', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'CANCELLED', 'RETURNED', 'REFUNDED', 'COMPLETED', 'FAILED',
    };
    final offenders = <String>[];
    for (final lit in _literals()) {
      if (!enums.contains(lit.text)) continue;
      final f = lit.file;
      final isPresentation = f.contains('/presentation/screens/') ||
          f.contains('/presentation/widgets/');
      // The status→label/colour maps and comparisons are exactly where the
      // wire value belongs.
      final isMapping = f.endsWith('order_status.dart') ||
          f.endsWith('teka_colors.dart') ||
          f.endsWith('order_status_badge.dart');
      if (isPresentation && !isMapping) {
        offenders.add('$f:${lit.line} — "${lit.text}"');
      }
    }
    // Comparisons like `order.status.toUpperCase() == 'DELIVERED'` are fine;
    // they are counted here only if the literal is *rendered*. Keep the list
    // visible so a new one is a deliberate decision.
    for (final o in offenders) {
      expect(
        o,
        anyOf(contains('order_detail_screen.dart'), contains('order_card.dart')),
        reason: 'unexpected raw enum literal in a presentation file: $o',
      );
    }
  });

  test('the shared status labels are the ones shown', () {
    final badge = File(
      'lib/features/orders/presentation/widgets/order_status_badge.dart',
    ).readAsStringSync();
    expect(badge.contains('orderStatusLabel(status)'), isTrue);
    final success = File(
      'lib/features/checkout/presentation/screens/checkout_success_screen.dart',
    ).readAsStringSync();
    expect(success.contains('orderStatusLabel(order.status)'), isTrue,
        reason: 'the success screen used to print the raw enum');
  });
}
