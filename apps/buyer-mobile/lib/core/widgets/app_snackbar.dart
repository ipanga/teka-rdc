import 'package:flutter/material.dart';

import '../theme/teka_colors.dart';

/// Visual tone of an app snackbar. Maps to a background color; the label and
/// icon are always white, so every tone is AA-contrast on its fill.
enum AppSnackbarTone { neutral, success, warning, error }

/// Shows the app's standard floating snackbar.
///
/// Why this exists: snackbars are the only non-blocking way to tell the user
/// something without touching layout. `SnackBarBehavior.floating` also means
/// Flutter positions the pill above the *root* scaffold's bottom navigation
/// bar and above the gesture inset automatically (see
/// `ScaffoldMessengerState._updateScaffolds` + `Scaffold`'s snack-bar
/// geometry), so callers never need to know which shell they are in.
///
/// Styling is set explicitly on the [SnackBar] rather than via
/// `ThemeData.snackBarTheme` on purpose: buyer-mobile has no `snackBarTheme`
/// and seller-mobile has one, so relying on the theme would render the same
/// message differently in the two apps. Tone colors are drawn only from
/// constants that exist in *both* apps' [TekaColors].
///
/// Returns `null` when there is no [ScaffoldMessenger] in scope (nothing was
/// shown) so callers can distinguish "displayed" from "swallowed".
ScaffoldFeatureController<SnackBar, SnackBarClosedReason>? showAppSnackbar(
  BuildContext context, {
  required String message,
  AppSnackbarTone tone = AppSnackbarTone.neutral,
  IconData? icon,
  Duration duration = const Duration(seconds: 3),
  SnackBarAction? action,
  bool replaceCurrent = false,
  Key? key,
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return null;

  // `showSnackBar` queues. Callers that must not wait behind an unrelated
  // message (e.g. connectivity, which is rate-limited anyway) pass
  // replaceCurrent: true to preempt instead.
  if (replaceCurrent) messenger.clearSnackBars();

  return messenger.showSnackBar(
    SnackBar(
      key: key,
      content: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: _backgroundFor(tone),
      duration: duration,
      action: action,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.all(12),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
      ),
    ),
  );
}

Color _backgroundFor(AppSnackbarTone tone) {
  switch (tone) {
    case AppSnackbarTone.success:
      return TekaColors.success;
    case AppSnackbarTone.warning:
      return TekaColors.warning;
    case AppSnackbarTone.error:
      return TekaColors.destructive;
    case AppSnackbarTone.neutral:
      return TekaColors.foreground;
  }
}
