// Builds an ISOLATED, co-installable Android QA debug APK for the native
// integration harness (see docs/qa/order-integrity/native-followup/README.md).
//
//   dart run scripts/mobile-qa/build_android_qa_apk.dart \
//     --app buyer|seller \
//     --defines /private/tmp/teka-qa/android.json \
//     --target integration_test/<buyer|seller>_order_flow_test.dart \
//     [--target-platform android-arm64,android-x64]
//
// What it does (run from the repo root; no device is touched):
//   1. Merges apps/<app>-mobile/flavors/development.json with the PRIVATE
//      defines file (later wins — same rule as repeated
//      --dart-define-from-file) and fails closed unless FLAVOR=development,
//      TEKA_QA_ENABLED=true and API_BASE_URL is on 10.0.2.2 / 127.0.0.1 /
//      localhost.
//   2. Runs the app's own ./gradlew with the opt-in init script
//      (codexqa-android.init.gradle) and ONLY the task
//      assembleDevelopmentDebug. The encoded dart-defines travel in the
//      Gradle environment (ORG_GRADLE_PROJECT_dart-defines), never on the
//      command line; no value is printed.
//   3. Moves the APK to build/codexqa/<app>-codexqa-dev-debug.apk so it can
//      never be mistaken for (or installed as) the normal .dev build.
//
// Flutter build metadata (flutter.sdk, version) comes from the existing
// generated android/local.properties + pubspec; nothing is regenerated.

import 'dart:convert';
import 'dart:io';

const _allowedHosts = {'10.0.2.2', '127.0.0.1', 'localhost'};
const _packages = {
  'buyer': 'com.tootiye.teka.codexqa.dev',
  'seller': 'com.tootiye.tekaseller.codexqa.dev',
};

Never _refuse(String why) {
  stderr.writeln('[codexqa] Build QA refusé : $why');
  exit(2);
}

Map<String, String> _readDefines(String path) {
  final file = File(path);
  if (!file.existsSync()) _refuse('fichier de defines introuvable ($path).');
  final Object? json;
  try {
    json = jsonDecode(file.readAsStringSync());
  } on FormatException {
    _refuse('fichier de defines JSON invalide ($path).');
  }
  if (json is! Map) _refuse('le fichier de defines doit être un objet JSON ($path).');
  return {
    for (final e in json.entries)
      if (e.value is String || e.value is num || e.value is bool)
        e.key.toString(): e.value.toString()
      else
        e.key.toString(): _refuse('valeur non scalaire pour ${e.key}.'),
  };
}

/// Firebase configuration string resources the google-services plugin emits.
const _firebaseResourceNames = [
  'google_app_id',
  'gcm_defaultSenderId',
  'google_api_key',
  'google_crash_reporting_api_key',
  'google_storage_bucket',
  'project_id',
  'default_web_client_id',
  'firebase_database_url',
];

/// Locates aapt2 (ANDROID_HOME / ANDROID_SDK_ROOT, else `sdk.dir` from the
/// generated local.properties — only that line is used), newest build-tools.
File _aapt2(Directory androidDir) {
  String? sdk = Platform.environment['ANDROID_HOME'] ??
      Platform.environment['ANDROID_SDK_ROOT'];
  if (sdk == null || sdk.isEmpty) {
    for (final line in File('${androidDir.path}/local.properties').readAsLinesSync()) {
      if (line.startsWith('sdk.dir=')) sdk = line.substring('sdk.dir='.length).trim();
    }
  }
  final buildTools = Directory('${sdk ?? ''}/build-tools');
  if (sdk == null || !buildTools.existsSync()) {
    _refuse('SDK Android introuvable (ANDROID_HOME ou sdk.dir) pour vérifier l’APK.');
  }
  final versions = buildTools.listSync().whereType<Directory>().toList()
    ..sort((a, b) => b.path.compareTo(a.path));
  for (final v in versions) {
    final tool = File('${v.path}/aapt2');
    if (tool.existsSync()) return tool;
  }
  _refuse('aapt2 introuvable dans ${buildTools.path}.');
}

Future<Map<String, bool>> _firebaseResourcesPresent(
    Directory androidDir, File apk) async {
  final result =
      await Process.run(_aapt2(androidDir).path, ['dump', 'resources', apk.path]);
  if (result.exitCode != 0) {
    _refuse('aapt2 dump resources a échoué (code ${result.exitCode}).');
  }
  // Only lines declaring a resource NAME are matched; no line is printed.
  final names = <String>{};
  final decl = RegExp(r'\bstring/([A-Za-z0-9_]+)\b');
  for (final line in (result.stdout as String).split('\n')) {
    if (!line.trimLeft().startsWith('resource ')) continue;
    final m = decl.firstMatch(line);
    if (m != null) names.add(m.group(1)!);
  }
  return {for (final n in _firebaseResourceNames) n: names.contains(n)};
}

Future<void> main(List<String> argv) async {
  final args = <String, String>{};
  for (var i = 0; i < argv.length; i++) {
    final a = argv[i];
    if (!a.startsWith('--') || i + 1 >= argv.length) {
      _refuse('argument inattendu « $a ».');
    }
    args[a.substring(2)] = argv[++i];
  }
  final app = args['app'];
  final definesPath = args['defines'];
  final target = args['target'];
  final targetPlatform = args['target-platform'] ?? 'android-arm64,android-x64';
  if (app == null || !_packages.containsKey(app)) _refuse('--app buyer|seller requis.');
  if (definesPath == null) _refuse('--defines <fichier JSON privé> requis.');
  if (target == null || !RegExp(r'^integration_test/[a-z_]+_test\.dart$').hasMatch(target)) {
    _refuse('--target integration_test/<fichier>_test.dart requis.');
  }
  if (!RegExp(r'^android-(arm|arm64|x64)(,android-(arm|arm64|x64))*$').hasMatch(targetPlatform)) {
    _refuse('--target-platform invalide.');
  }

  final appDir = Directory('apps/$app-mobile');
  final androidDir = Directory('${appDir.path}/android');
  final initScript = File('scripts/mobile-qa/codexqa-android.init.gradle');
  if (!androidDir.existsSync() || !initScript.existsSync()) {
    _refuse('lancer depuis la racine du dépôt.');
  }
  if (!File('${appDir.path}/$target').existsSync()) _refuse('cible introuvable ($target).');
  final localProps = File('${androidDir.path}/local.properties');
  if (!localProps.existsSync() ||
      !localProps.readAsLinesSync().any((l) => l.startsWith('flutter.sdk='))) {
    _refuse('android/local.properties sans flutter.sdk — lancer d’abord un build '
        'Flutter normal du flavor development pour le générer.');
  }

  final defines = {
    ..._readDefines('${appDir.path}/flavors/development.json'),
    ..._readDefines(definesPath),
    'FLUTTER_APP_FLAVOR': 'development',
  };
  if (defines['FLAVOR'] != 'development') _refuse('FLAVOR=development requis.');
  if (defines['TEKA_QA_ENABLED'] != 'true') _refuse('TEKA_QA_ENABLED=true requis.');
  final host = Uri.tryParse(defines['API_BASE_URL'] ?? '')?.host;
  if (!_allowedHosts.contains(host)) {
    _refuse('API_BASE_URL doit viser 10.0.2.2, 127.0.0.1 ou localhost.');
  }
  // Same encoding as flutter_tools (encodeDartDefines): base64(KEY=VALUE), comma-joined.
  final encoded = defines.entries
      .map((e) => base64.encode(utf8.encode('${e.key}=${e.value}')))
      .join(',');

  final gradleArgs = [
    '-I',
    initScript.absolute.path,
    '-PtekaQaPackage=codexqa',
    '-Ptarget=$target',
    '-Ptarget-platform=$targetPlatform',
    '-Pbase-application-name=android.app.Application',
    '-Ptrack-widget-creation=true',
    '-Pdart-obfuscation=false',
    '-Ptree-shake-icons=false',
    'assembleDevelopmentDebug',
  ];
  stdout.writeln('[codexqa] ${_packages[app]} : ./gradlew ${gradleArgs.join(' ')} '
      '(dart-defines via l’environnement, ${defines.length} clés, valeurs masquées)');

  final started = DateTime.now();
  final process = await Process.start(
    './gradlew',
    gradleArgs,
    workingDirectory: androidDir.path,
    environment: {'ORG_GRADLE_PROJECT_dart-defines': encoded},
    mode: ProcessStartMode.inheritStdio,
  );
  final code = await process.exitCode;
  if (code != 0) {
    stderr.writeln('[codexqa] Gradle a échoué (code $code).');
    exit(code);
  }

  final outputs = Directory('${appDir.path}/build/app/outputs');
  final agpApk = File('${outputs.path}/apk/development/debug/app-development-debug.apk');
  final flutterApk = File('${outputs.path}/flutter-apk/app-development-debug.apk');
  if (!agpApk.existsSync() || agpApk.lastModifiedSync().isBefore(started)) {
    _refuse('APK QA introuvable après le build.');
  }
  // The Flutter plugin's copy of THIS build carries the QA id under the
  // normal .dev file name — remove it so it can never be installed by mistake.
  if (flutterApk.existsSync() && !flutterApk.lastModifiedSync().isBefore(started)) {
    flutterApk.deleteSync();
  }

  // Fail closed: the QA package must not carry Firebase configuration
  // resources (e.g. stale google-services output of an earlier normal build).
  // Only resource NAMES are inspected; values are never read out or printed.
  final firebaseKeys = await _firebaseResourcesPresent(androidDir, agpApk);
  for (final e in firebaseKeys.entries) {
    stdout.writeln('[codexqa] ressource string/${e.key} présente : ${e.value}');
  }
  if (firebaseKeys.values.any((present) => present)) {
    agpApk.deleteSync(); // this build's own QA artifact only
    _refuse('l’APK QA contient des ressources de configuration Firebase — '
        'APK de ce build supprimé, rien à installer.');
  }

  final dest = File('${appDir.path}/build/codexqa/$app-codexqa-dev-debug.apk');
  dest.parent.createSync(recursive: true);
  agpApk.renameSync(dest.path);
  stdout.writeln('[codexqa] APK : ${dest.path}');
  stdout.writeln('[codexqa] Vérifier avant installation : '
      'aapt2 dump badging ${dest.path} | grep -E "^package:|application-label:"'
      ' → package ${_packages[app]}');
  stdout.writeln('[codexqa] Métadonnées de version : celles du local.properties '
      'généré par le dernier build Flutter normal (peuvent différer du pubspec) — '
      'APK QA, jamais un candidat de publication.');
}
