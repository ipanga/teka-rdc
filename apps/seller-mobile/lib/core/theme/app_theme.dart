import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../layout/responsive.dart';
import 'teka_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: TekaColors.tekaRed,
        primary: TekaColors.tekaRed,
        secondary: TekaColors.info,
        tertiary: TekaColors.success,
        error: TekaColors.destructive,
        surface: TekaColors.background,
        onSurface: TekaColors.foreground,
      ),
    );
    // Seller UX PR A (2026-09-08): the app had NO text theme — 151 raw
    // `fontSize` literals across 18 values because there was nothing to
    // reference. This is the brand scale buyer-mobile uses (typography is
    // shared across Teka; screen geometry is not). Existing explicit styles
    // are untouched; only unstyled Text picks these up.
    //
    // Two steps are deliberately NOT resized: `labelLarge` (button labels —
    // 68 buttons would change at once) and `titleMedium`, which only gains
    // weight. A bisect against the 320 px / 2x guard tests showed that
    // resizing titleMedium (17 / 1.3) reflowed an unstyled consumer above the
    // product and order lists and pushed the retry control past the fixture's
    // tap; weight alone keeps the hierarchy and the guards green.
    final textTheme = base.textTheme
        .copyWith(
          headlineSmall: base.textTheme.headlineSmall
              ?.copyWith(fontSize: 24, height: 1.2, fontWeight: FontWeight.w700, letterSpacing: -0.2),
          titleLarge: base.textTheme.titleLarge
              ?.copyWith(fontSize: 20, height: 1.25, fontWeight: FontWeight.w700, letterSpacing: -0.15),
          titleMedium: base.textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w600),
          titleSmall: base.textTheme.titleSmall
              ?.copyWith(fontSize: 15, height: 1.35, fontWeight: FontWeight.w600),
          bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 16, height: 1.5),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 14, height: 1.45),
          bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 12.5, height: 1.4),
          // labelLarge deliberately NOT overridden: it is the button label
          // style, and every button in the app already sets its own weight.
          // Raising it would restyle 44 ElevatedButtons and 24 FilledButtons
          // at once — a foundation PR sets a hierarchy for unstyled text, it
          // does not resize CTAs.
          labelMedium: base.textTheme.labelMedium
              ?.copyWith(fontSize: 13, height: 1.2, fontWeight: FontWeight.w600),
          labelSmall: base.textTheme.labelSmall
              ?.copyWith(fontSize: 11.5, height: 1.2, fontWeight: FontWeight.w600),
        )
        .apply(bodyColor: TekaColors.foreground, displayColor: TekaColors.foreground);

    return base.copyWith(
        textTheme: textTheme,
        colorScheme: ColorScheme.fromSeed(
          seedColor: TekaColors.tekaRed,
          primary: TekaColors.tekaRed,
          secondary: TekaColors.info,
          tertiary: TekaColors.success,
          error: TekaColors.destructive,
          surface: TekaColors.background,
          onSurface: TekaColors.foreground,
        ),
        scaffoldBackgroundColor: TekaColors.pageBackground,
        appBarTheme: const AppBarTheme(
          backgroundColor: TekaColors.background,
          foregroundColor: TekaColors.foreground,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: TekaColors.foreground,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
          iconTheme: IconThemeData(color: TekaColors.foreground),
          actionsIconTheme: IconThemeData(color: TekaColors.foreground),
          // Mirrors buyer-mobile. Without this an AppBar recomputes the
          // overlay from its own background and can override the style set at
          // bootstrap, so the two must agree.
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: TekaColors.background,
          indicatorColor: TekaColors.tekaRed.withValues(alpha: 0.12),
          indicatorShape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          elevation: 0,
          height: 68,
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              color: states.contains(WidgetState.selected)
                  ? TekaColors.tekaRed
                  : TekaColors.mutedForeground,
              fontSize: 11.5,
              height: 1.1,
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w700
                  : FontWeight.w500,
            ),
          ),
          iconTheme: WidgetStateProperty.resolveWith(
            (states) => IconThemeData(
              color: states.contains(WidgetState.selected)
                  ? TekaColors.tekaRed
                  : TekaColors.mutedForeground,
              size: 24,
            ),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            foregroundColor: Colors.white,
            elevation: 0,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            foregroundColor: Colors.white,
            disabledBackgroundColor: TekaColors.tekaRed.withValues(alpha: 0.4),
            disabledForegroundColor: Colors.white.withValues(alpha: 0.8),
            elevation: 0,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: TekaColors.tekaRed,
            side: const BorderSide(color: TekaColors.tekaRed),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: TekaColors.tekaRed,
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: TekaColors.background,
          hintStyle: const TextStyle(color: TekaColors.mutedForeground),
          labelStyle: const TextStyle(color: TekaColors.mutedForeground),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: TekaColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: TekaColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: TekaColors.tekaRed, width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: TekaColors.destructive),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide:
                const BorderSide(color: TekaColors.destructive, width: 2),
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        dividerTheme: const DividerThemeData(
          color: TekaColors.border,
          thickness: 1,
          space: 1,
        ),
        // Tablet phase (2026-09-07): a modal sheet or dialog stretched across a
        // 1024 pt tablet reads as a broken page. Constraining them here means
        // every existing call site inherits the panel width — no screen repeats
        // the number — and a phone is unaffected (the cap is wider than any
        // phone). Same constant as buyer-mobile.
        // Surfaces are explicit (Seller UX PR A). Material 3 derives
        // surfaceContainerHigh from the seed, and the seed is red — so every
        // dialog and sheet was painted a pink tint while the cards beside them
        // were white. Same defect buyer-mobile had; same fix.
        bottomSheetTheme: const BottomSheetThemeData(
          constraints: kSheetConstraints,
          backgroundColor: TekaColors.background,
          surfaceTintColor: Colors.transparent,
        ),
        dialogTheme: const DialogThemeData(
          constraints: kSheetConstraints,
          backgroundColor: TekaColors.background,
          surfaceTintColor: Colors.transparent,
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: TekaColors.foreground,
          contentTextStyle: const TextStyle(color: Colors.white),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
  }
}
