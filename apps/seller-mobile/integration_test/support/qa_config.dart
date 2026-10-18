// Opt-in native QA configuration — FAIL-CLOSED, checked before any network.
//
// Identical copy in apps/{buyer,seller}-mobile/integration_test/support/.
// Every value comes from --dart-define (never committed); errors name the
// variable, never echo a secret (OTP, password, phone are never printed).

class QaConfigError implements Exception {
  QaConfigError(this.problems);
  final List<String> problems;

  @override
  String toString() =>
      'Configuration QA refusée (aucune requête réseau envoyée) :\n- '
      '${problems.join('\n- ')}';
}

class QaConfig {
  const QaConfig._(this._values, this.apiBaseUrl);

  final Map<String, String> _values;

  /// Validated local API base (…/api).
  final String apiBaseUrl;

  /// Hosts a QA run may talk to: the iOS simulator / host loopback and the
  /// Android emulator's alias for the host. Anything else is refused.
  static const allowedHosts = {'127.0.0.1', 'localhost', '10.0.2.2'};

  static const _enabled = bool.fromEnvironment('TEKA_QA_ENABLED');
  static const _flavor = String.fromEnvironment('FLAVOR');
  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  // String.fromEnvironment needs literal names, so each is spelled out.
  static const _defines = <String, String>{
    'TEKA_QA_BUYER_PHONE': String.fromEnvironment('TEKA_QA_BUYER_PHONE'),
    'TEKA_QA_SELLER_FLOW_BUYER_PHONE':
        String.fromEnvironment('TEKA_QA_SELLER_FLOW_BUYER_PHONE'),
    'TEKA_QA_OTP': String.fromEnvironment('TEKA_QA_OTP'),
    'TEKA_QA_SELLER_EMAIL': String.fromEnvironment('TEKA_QA_SELLER_EMAIL'),
    'TEKA_QA_SELLER_PASSWORD':
        String.fromEnvironment('TEKA_QA_SELLER_PASSWORD'),
    'TEKA_QA_ADMIN_EMAIL': String.fromEnvironment('TEKA_QA_ADMIN_EMAIL'),
    'TEKA_QA_ADMIN_PASSWORD': String.fromEnvironment('TEKA_QA_ADMIN_PASSWORD'),
    'TEKA_QA_PRODUCT_ID': String.fromEnvironment('TEKA_QA_PRODUCT_ID'),
    'TEKA_QA_CITY_ID': String.fromEnvironment('TEKA_QA_CITY_ID'),
    'TEKA_QA_ADDRESS_ID': String.fromEnvironment('TEKA_QA_ADDRESS_ID'),
    'TEKA_QA_SELLER_FLOW_ADDRESS_ID':
        String.fromEnvironment('TEKA_QA_SELLER_FLOW_ADDRESS_ID'),
  };

  static final _uuid = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false);
  static final _phone = RegExp(r'^\+243[89]\d{8}$');
  static final _otp = RegExp(r'^\d{6}$');

  /// Validates the guard + the [required] fixture variables. Throws
  /// [QaConfigError] listing every problem; nothing is sent before this.
  static QaConfig load(List<String> required) {
    final problems = <String>[];
    if (!_enabled) problems.add('TEKA_QA_ENABLED doit valoir true.');
    if (_flavor != 'development') {
      problems.add('FLAVOR doit être explicitement « development ».');
    }
    final uri = Uri.tryParse(_apiBaseUrl);
    if (_apiBaseUrl.isEmpty || uri == null) {
      problems.add('API_BASE_URL manquant ou invalide.');
    } else {
      if (uri.scheme != 'http' && uri.scheme != 'https') {
        problems.add('API_BASE_URL : schéma http(s) requis.');
      }
      if (!allowedHosts.contains(uri.host)) {
        problems.add('API_BASE_URL : hôte « ${uri.host} » refusé — '
            'seulement ${allowedHosts.join(', ')} (API locale jetable).');
      }
      if (uri.userInfo.isNotEmpty) {
        problems.add('API_BASE_URL : identifiants dans l’URL refusés.');
      }
      if (uri.path.replaceAll(RegExp(r'/+$'), '') != '/api') {
        problems.add('API_BASE_URL doit se terminer par /api.');
      }
      if (uri.hasQuery || uri.hasFragment) {
        problems.add('API_BASE_URL : ni requête ni fragment.');
      }
    }

    for (final name in required) {
      final v = _defines[name] ?? '';
      if (v.isEmpty) {
        problems.add('$name manquant.');
        continue;
      }
      if (name.endsWith('_ID') && !_uuid.hasMatch(v)) {
        problems.add('$name doit être un UUID.');
      } else if (name.endsWith('_PHONE') && !_phone.hasMatch(v)) {
        problems.add('$name doit être au format +243XXXXXXXXX.');
      } else if (name == 'TEKA_QA_OTP' && !_otp.hasMatch(v)) {
        problems.add('TEKA_QA_OTP doit compter 6 chiffres.');
      } else if (name.endsWith('_EMAIL') && !v.contains('@')) {
        problems.add('$name doit être une adresse e-mail.');
      }
    }
    // Optional pair: a second synthetic buyer (and ITS single address) for
    // seller-side fixture orders — OTP issuance is limited to 3 per phone per
    // 10 minutes, so buyer + seller runs on two devices can share the load.
    final optionalPhone = _defines['TEKA_QA_SELLER_FLOW_BUYER_PHONE']!;
    final optionalAddress = _defines['TEKA_QA_SELLER_FLOW_ADDRESS_ID']!;
    if (optionalPhone.isNotEmpty || optionalAddress.isNotEmpty) {
      if (!_phone.hasMatch(optionalPhone)) {
        problems.add('TEKA_QA_SELLER_FLOW_BUYER_PHONE doit être au format '
            '+243XXXXXXXXX (requis avec TEKA_QA_SELLER_FLOW_ADDRESS_ID).');
      }
      if (!_uuid.hasMatch(optionalAddress)) {
        problems.add('TEKA_QA_SELLER_FLOW_ADDRESS_ID doit être un UUID '
            '(requis avec TEKA_QA_SELLER_FLOW_BUYER_PHONE).');
      }
    }
    if (problems.isNotEmpty) throw QaConfigError(problems);
    return QaConfig._(
      Map.unmodifiable({
        for (final n in required) n: _defines[n]!,
        if (optionalPhone.isNotEmpty) ...{
          'TEKA_QA_SELLER_FLOW_BUYER_PHONE': optionalPhone,
          'TEKA_QA_SELLER_FLOW_ADDRESS_ID': optionalAddress,
        },
      }),
      _apiBaseUrl.replaceAll(RegExp(r'/+$'), ''),
    );
  }

  String _get(String name) {
    final v = _values[name];
    if (v == null) {
      throw StateError('$name n’a pas été déclaré requis pour ce scénario.');
    }
    return v;
  }

  String get buyerPhone => _get('TEKA_QA_BUYER_PHONE');
  String get sellerFlowBuyerPhone =>
      _values['TEKA_QA_SELLER_FLOW_BUYER_PHONE'] ?? buyerPhone;
  String get sellerFlowAddressId =>
      _values['TEKA_QA_SELLER_FLOW_ADDRESS_ID'] ?? addressId;
  String get otp => _get('TEKA_QA_OTP');
  String get sellerEmail => _get('TEKA_QA_SELLER_EMAIL');
  String get sellerPassword => _get('TEKA_QA_SELLER_PASSWORD');
  String get adminEmail => _get('TEKA_QA_ADMIN_EMAIL');
  String get adminPassword => _get('TEKA_QA_ADMIN_PASSWORD');
  String get productId => _get('TEKA_QA_PRODUCT_ID');
  String get cityId => _get('TEKA_QA_CITY_ID');
  String get addressId => _get('TEKA_QA_ADDRESS_ID');

  /// Never prints values.
  @override
  String toString() => 'QaConfig(api: $apiBaseUrl, variables: '
      '${_values.keys.join(', ')})';
}
