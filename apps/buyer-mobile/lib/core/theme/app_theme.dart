import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'teka_colors.dart';

/// Mobile theme — mirrors the Tailwind v4 `@theme inline` block on the web
/// (`apps/buyer-web/src/app/globals.css`). Uses platform typography so the
/// app remains deterministic offline, plus a global CardTheme and the Rakuten
/// 485 C brand red. Keep both surfaces in sync when adjusting.
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
      textTheme: base.textTheme.apply(
        bodyColor: TekaColors.foreground,
        displayColor: TekaColors.foreground,
      ),
      // Clean white AppBar — red is reserved for CTAs, badges and accents,
      // not a full-width header block. A subtle bottom border gives every
      // screen a stable, trustworthy top-bar edge without visual heaviness.
      appBarTheme: const AppBarTheme(
        backgroundColor: TekaColors.surface,
        foregroundColor: TekaColors.foreground,
        elevation: 0,
        scrolledUnderElevation: 1,
        surfaceTintColor: Colors.transparent,
        shadowColor: Color(0x14000000),
        centerTitle: false,
        toolbarHeight: 64,
        titleSpacing: 20,
        iconTheme: IconThemeData(color: TekaColors.foreground),
        actionsIconTheme: IconThemeData(color: TekaColors.foreground),
        titleTextStyle: TextStyle(
          color: TekaColors.foreground,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
        ),
        shape: Border(
          bottom: BorderSide(
            color: TekaColors.border,
            width: 1,
          ),
        ),
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: TekaColors.surface,
        indicatorColor: TekaColors.tekaRedSubtle,
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11.5,
            height: 1.1,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? TekaColors.tekaRed : TekaColors.mutedForeground,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 24,
            color: selected ? TekaColors.tekaRed : TekaColors.mutedForeground,
          );
        }),
      ),
      cardTheme: CardThemeData(
        color: TekaColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
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
          textStyle: base.textTheme.labelLarge?.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: TekaColors.tekaRed,
          foregroundColor: Colors.white,
          disabledBackgroundColor: TekaColors.tekaRed.withValues(alpha: 0.4),
          disabledForegroundColor: Colors.white.withValues(alpha: 0.8),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          textStyle: base.textTheme.labelLarge?.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
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
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
