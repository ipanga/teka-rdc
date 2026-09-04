import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/screens/forgot_password_screen.dart';
import 'package:seller_mobile/features/auth/presentation/screens/register_screen.dart';
import 'package:seller_mobile/features/auth/presentation/screens/reset_password_screen.dart';
import 'package:seller_mobile/features/seller_application/data/seller_application_repository.dart';
import 'package:seller_mobile/features/seller_application/presentation/screens/seller_application_screen.dart';

class _ApplicationRepository extends SellerApplicationRepository {
  _ApplicationRepository(this.application) : super(Dio());

  final SellerApplication application;

  @override
  Future<SellerApplication> getApplication() async => application;

  @override
  Future<List<CityOption>> getCities() async => const [
        CityOption(
          id: 'lubumbashi',
          name: 'Ville au nom particulièrement long',
          province: 'Haut-Katanga',
        ),
      ];
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  List<Override> overrides = const [],
  double scale = 2,
  double keyboard = 240,
}) async {
  tester.view.physicalSize = const Size(320, 568);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, appChild) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
          child: appChild!,
        ),
        home: child,
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('registration remains scrollable with keyboard and 2x text',
      (tester) async {
    await _pump(tester, const RegisterScreen());

    expect(find.text('Créer votre compte'), findsOneWidget);
    expect(find.byTooltip('Afficher le mot de passe'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('password recovery remains scrollable with keyboard and 2x text',
      (tester) async {
    await _pump(tester, const ForgotPasswordScreen());

    expect(find.text('Envoyer le lien'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('password reset remains scrollable with keyboard and 2x text',
      (tester) async {
    await _pump(tester, const ResetPasswordScreen(token: 'valid-token'));

    expect(find.text('Réinitialiser'), findsOneWidget);
    expect(find.byTooltip('Afficher les mots de passe'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending seller application supports enlarged text',
      (tester) async {
    final repo = _ApplicationRepository(
      const SellerApplication(
        hasApplication: true,
        applicationStatus: 'PENDING',
      ),
    );
    await _pump(
      tester,
      const SellerApplicationScreen(),
      keyboard: 0,
      overrides: [
        sellerApplicationRepositoryProvider.overrideWith((ref) => repo),
      ],
    );

    expect(find.text('Demande en cours d’examen'), findsOneWidget);
    expect(find.byTooltip('Se déconnecter'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('seller application form remains scrollable above the keyboard',
      (tester) async {
    final repo = _ApplicationRepository(
      const SellerApplication(hasApplication: false),
    );
    await _pump(
      tester,
      const SellerApplicationScreen(),
      overrides: [
        sellerApplicationRepositoryProvider.overrideWith((ref) => repo),
      ],
    );

    expect(find.text('Informations de votre activité'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
