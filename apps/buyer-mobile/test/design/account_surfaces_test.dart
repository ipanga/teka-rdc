import 'dart:io';

import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/core/widgets/product_skeletons.dart';
import 'package:buyer_mobile/features/orders/domain/order_status.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Orders, ratings, profile and notifications (UX PR D, 2026-09-08) — the
/// last Buyer Mobile UX PR.
void main() {
  _notificationFeed();

  group('dialog and sheet surfaces', () {
    test('are explicitly white, not tinted from the red seed', () {
      // Material 3 derives surfaceContainerHigh from the seed colour, and
      // Teka's seed is red — so every dialog and sheet was painted #F6E4E3
      // while every card beside it was white. Measured on the emulator.
      final theme = AppTheme.lightTheme;
      expect(theme.dialogTheme.backgroundColor, TekaColors.surface);
      expect(theme.bottomSheetTheme.backgroundColor, TekaColors.surface);
      expect(theme.dialogTheme.surfaceTintColor, Colors.transparent);
      expect(theme.bottomSheetTheme.surfaceTintColor, Colors.transparent);
    });

    testWidgets('a confirmation dialog renders on white', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => const AlertDialog(
                      title: Text('Se déconnecter ?'),
                    ),
                  ),
                  child: const Text('ouvrir'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
      final dialog = tester.widget<Dialog>(find.byType(Dialog));
      expect(dialog.backgroundColor ?? AppTheme.lightTheme.dialogTheme.backgroundColor,
          TekaColors.surface);
    });
  });

  group('order status filters', () {
    test('cover every buyer-visible status, plus Toutes', () {
      final covered = orderStatusFilters
          .map((f) => f.status)
          .whereType<BuyerOrderStatus>()
          .toSet();
      expect(covered.length, BuyerOrderStatus.values.length,
          reason: 'a status exists that cannot be filtered for');
      expect(orderStatusFilters.first.status, isNull, reason: 'Toutes first');
    });

    test('every filter label is French and carries no raw enum', () {
      for (final f in orderStatusFilters) {
        expect(f.label, isNotEmpty);
        expect(f.label, isNot(matches(RegExp(r'^[A-Z_]+$'))),
            reason: f.label);
      }
    });

    test('an unknown status falls back, never echoes the wire value', () {
      expect(orderStatusLabel('SOMETHING_NEW'), isNot('SOMETHING_NEW'));
      expect(orderStatusLabel('SOMETHING_NEW'), 'Statut inconnu');
    });
  });

  group('colour marks state, not money', () {
    test('order totals are foreground in the list and the detail', () {
      final card = File(
        'lib/features/orders/presentation/widgets/order_card.dart',
      ).readAsStringSync();
      final detail = File(
        'lib/features/orders/presentation/screens/order_detail_screen.dart',
      ).readAsStringSync();
      expect(
        RegExp(r'formatCDF\(order\.totalCDF\)[\s\S]{0,220}TekaColors\.tekaRed')
            .hasMatch(card),
        isFalse,
      );
      expect(
        RegExp(r'formatCDF\(order\.totalCDF\)[\s\S]{0,200}TekaColors\.tekaRed')
            .hasMatch(detail),
        isFalse,
      );
    });

    test('the timeline dot takes the status colour, not the brand red', () {
      final timeline = File(
        'lib/features/orders/presentation/widgets/order_timeline.dart',
      ).readAsStringSync();
      expect(timeline.contains('TekaColors.orderStatusColor(log.toStatus)'),
          isTrue);
      expect(
        RegExp(r'isFirst \? TekaColors\.tekaRed').hasMatch(timeline),
        isFalse,
      );
    });

    test('every order status maps to a colour, unknown included', () {
      for (final s in BuyerOrderStatus.values) {
        expect(TekaColors.orderStatusColor(s.wire), isA<Color>());
      }
      expect(TekaColors.orderStatusColor('MYSTERY'),
          TekaColors.mutedForeground);
    });
  });

  group('list loading states', () {
    testWidgets('a shaped skeleton replaces the bare spinner', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: ListCardSkeleton(count: 3)),
        ),
      );
      await tester.pump();
      // Four shimmer bars per card: title, meta, and the two footer values.
      expect(find.byType(ShimmerBox), findsNWidgets(3 * 4));
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('the skeleton grows with the text scale', (tester) async {
      late double normal;
      late double large;
      for (final entry in <double>[1.0, 1.5]) {
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(entry)),
              child: child!,
            ),
            home: const Scaffold(body: ListCardSkeleton(count: 1)),
          ),
        );
        await tester.pump();
        final h = tester.getSize(find.byType(Container).first).height;
        if (entry == 1.0) {
          normal = h;
        } else {
          large = h;
        }
      }
      expect(large, greaterThan(normal));
    });

    test('orders and notifications both use it', () {
      for (final path in [
        'lib/features/orders/presentation/screens/orders_screen.dart',
        'lib/features/notifications/presentation/screens/notifications_screen.dart',
      ]) {
        final source = File(path).readAsStringSync();
        expect(source.contains('ListCardSkeleton('), isTrue, reason: path);
      }
    });
  });

  group('profile menu', () {
    final profile = File(
      'lib/features/profile/presentation/screens/profile_screen.dart',
    ).readAsStringSync();

    test('the inbox and the preferences no longer share one subtitle', () {
      // Both tiles said « Commandes, promotions et annonces » — one opens the
      // feed, the other opens the switches.
      expect('Commandes, promotions et annonces'.allMatches(profile).length,
          lessThanOrEqualTo(1));
      expect(profile.contains('Vos notifications reçues'), isTrue);
      expect(profile.contains('Choisir ce que vous recevez'), isTrue);
    });

    test('the menu is grouped, not one flat list', () {
      for (final header in ['Mon compte Teka', 'Paramètres', 'Aide']) {
        expect(profile.contains(header), isTrue, reason: header);
      }
    });
  });
}

/// Notification feed treatment (UX PR D).
void _notificationFeed() {
  final feed = File(
    'lib/features/notifications/presentation/screens/notifications_screen.dart',
  ).readAsStringSync();

  test('unread rows are a surface, not a red wash', () {
    // Unread is already said twice — the dot and the bold title. A feed of
    // unread items tinted red reads as a wall of alerts.
    expect(
      feed.contains('TekaColors.tekaRed.withValues(alpha: 0.05)'),
      isFalse,
    );
    expect(feed.contains('n.isRead ? Colors.transparent : TekaColors.surface'),
        isTrue);
  });

  test('the unread dot and the read state both survive', () {
    expect(feed.contains('if (!n.isRead)'), isTrue);
    expect(feed.contains('notifier.markRead(n.id)'), isTrue);
  });

  test('opening a notification still routes through its deep link', () {
    expect(feed.contains('n.deepLinkPath'), isTrue);
    expect(feed.contains('if (path != null) context.push(path)'), isTrue);
  });

  test('the feed does not poll', () {
    expect(feed.contains('Timer.periodic'), isFalse);
  });
}
