import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'teka_colors.dart';

/// Mobile theme — mirrors the Tailwind v4 `@theme inline` block on the web
/// (`apps/buyer-web/src/app/globals.css`). Uses Inter via `google_fonts` so
/// typography lines up with the web side, plus a global CardTheme and the
/// Rakuten 485 C brand red. Keep both surfaces in sync when adjusting.
class AppTheme {
  AppTheme._();

  static ThemeData get lightTheme {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: TekaColors.tekaRed,
        primary: TekaColors.tekaRed,
        onPrimary: Colors.white,
        secondary: TekaColors.surfaceMuted,
        onSecondary: TekaColors.foreground,
        error: TekaColors.destructive,
        onError: Colors.white,
        surface: TekaColors.background,
        onSurface: TekaColors.foreground,
        outline: TekaColors.border,
        outlineVariant: TekaColors.borderStrong,
      ),
      scaffoldBackgroundColor: TekaColors.surfaceMuted,
    );

    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: TekaColors.foreground,
        displayColor: TekaColors.foreground,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: TekaColors.tekaRed,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: TekaColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: TekaColors.border, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: TekaColors.tekaRed,
          foregroundColor: Colors.white,
          disabledBackgroundColor: TekaColors.tekaRed.withValues(alpha: 0.4),
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: TekaColors.foreground,
          side: const BorderSide(color: TekaColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: TekaColors.tekaRed,
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: TekaColors.background,
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
          borderSide: const BorderSide(color: TekaColors.destructive, width: 2),
        ),
        labelStyle: const TextStyle(color: TekaColors.mutedForeground),
        hintStyle: const TextStyle(color: TekaColors.mutedForeground),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
      dividerTheme: const DividerThemeData(
        color: TekaColors.border,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: TekaColors.surfaceMuted,
        selectedColor: TekaColors.tekaRed,
        labelStyle: const TextStyle(color: TekaColors.foreground, fontSize: 13),
        secondaryLabelStyle: const TextStyle(color: Colors.white, fontSize: 13),
        side: const BorderSide(color: TekaColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}
