// Stages a Firebase-free copy of a generated iOS SIMULATOR QA app bundle.
//
//   dart run scripts/mobile-qa/stage_ios_qa_app.dart --app buyer|seller
//
// Why: the locked firebase_core iOS plugin auto-configures FIRApp from a
// bundled GoogleService-Info.plist when the plugin REGISTERS — before any
// Dart runs — so skipping Firebase in the Dart test launcher does not isolate
// iOS. This tool copies the generated QA Runner.app into a FRESH private
// directory WITHOUT that plist; Codex then drives the staged copy with
// `flutter drive --use-application-binary=<staged> --keep-app-running`.
//
// Guarantees (run from the repo root; nothing is installed or launched):
//   * source is only apps/<app>-mobile/build/ios/Debug-development-iphonesimulator/Runner.app
//     (a real directory, not a symlink); it is never modified or deleted;
//   * its Info.plist must say CFBundleSupportedPlatforms[0] = iPhoneSimulator
//     and the exact development bundle id;
//   * the generated ios/Flutter/Generated.xcconfig (the config this bundle was
//     built with — refused if newer than the bundle) must name the app's
//     integration target and carry FLAVOR=development, TEKA_QA_ENABLED=true and
//     a loopback API_BASE_URL. DART_DEFINES are decoded in memory, never printed;
//   * destination: a NEW mkdtemp directory under /private/tmp (mode 0700);
//     `rsync -a --exclude=GoogleService-Info.plist` into it — no --delete,
//     nothing existing is overwritten or cleaned up;
//   * the staged tree is then scanned and REFUSED if any GoogleService-Info.plist
//     is present. No credential file is ever opened; only its existence is
//     tested. No signing is performed (see the code-signature note below).

import 'dart:convert';
import 'dart:io';

const _bundleIds = {
  'buyer': 'com.tootiye.teka.dev',
  'seller': 'com.tootiye.tekaseller.dev',
};
const _targets = {
  'buyer': 'integration_test/buyer_order_flow_test.dart',
  'seller': 'integration_test/seller_order_flow_test.dart',
};
const _loopback = {'127.0.0.1', 'localhost'};
const _firebasePlist = 'GoogleService-Info.plist';

Never _refuse(String why) {
  stderr.writeln('[codexqa-ios] Préparation refusée : $why');
  exit(2);
}

Future<String> _plistValue(String plist, String keyPath) async {
  final r = await Process.run(
      'plutil', ['-extract', keyPath, 'raw', '-o', '-', plist]);
  if (r.exitCode != 0) _refuse('Info.plist : clé $keyPath illisible.');
  return (r.stdout as String).trim();
}

Future<void> main(List<String> argv) async {
  if (argv.length != 2 || argv[0] != '--app' || !_bundleIds.containsKey(argv[1])) {
    _refuse('usage : --app buyer|seller');
  }
  final app = argv[1];
  final appDir = 'apps/$app-mobile';
  final source =
      Directory('$appDir/build/ios/Debug-development-iphonesimulator/Runner.app');
  if (FileSystemEntity.isLinkSync(source.path) || !source.existsSync()) {
    _refuse('bundle généré introuvable (${source.path}) — lancer depuis la racine.');
  }

  // 1. Bundle identity (Info.plist only).
  final infoPlist = '${source.path}/Info.plist';
  if (!File(infoPlist).existsSync()) _refuse('Info.plist absent du bundle.');
  if (await _plistValue(infoPlist, 'CFBundleSupportedPlatforms.0') !=
      'iPhoneSimulator') {
    _refuse('le bundle n’est pas un build simulateur.');
  }
  if (await _plistValue(infoPlist, 'CFBundleIdentifier') != _bundleIds[app]) {
    _refuse('identifiant de bundle inattendu (attendu ${_bundleIds[app]}).');
  }

  // 2. The config the bundle was built with.
  final xcconfig = File('$appDir/ios/Flutter/Generated.xcconfig');
  if (!xcconfig.existsSync()) _refuse('Generated.xcconfig introuvable.');
  final executable = File('${source.path}/Runner');
  if (executable.existsSync() &&
      xcconfig.lastModifiedSync().isAfter(executable.lastModifiedSync())) {
    _refuse('Generated.xcconfig est plus récent que le bundle — il ne décrit '
        'pas ce build (rebâtir la cible QA).');
  }
  final settings = <String, String>{};
  for (final line in xcconfig.readAsLinesSync()) {
    final i = line.indexOf('=');
    if (i > 0) settings[line.substring(0, i).trim()] = line.substring(i + 1).trim();
  }
  final target = settings['FLUTTER_TARGET'] ?? '';
  if (!(target == _targets[app] || target.endsWith('/${_targets[app]}'))) {
    _refuse('FLUTTER_TARGET n’est pas ${_targets[app]}.');
  }
  final defines = <String, String>{};
  for (final item in (settings['DART_DEFINES'] ?? '').split(',')) {
    if (item.isEmpty) continue;
    final String kv;
    try {
      kv = utf8.decode(base64.decode(item));
    } on FormatException {
      _refuse('DART_DEFINES illisibles.');
    }
    final i = kv.indexOf('=');
    if (i > 0) defines[kv.substring(0, i)] = kv.substring(i + 1);
  }
  if (defines['FLAVOR'] != 'development') _refuse('FLAVOR=development requis.');
  if (defines['TEKA_QA_ENABLED'] != 'true') _refuse('TEKA_QA_ENABLED=true requis.');
  if (!_loopback.contains(Uri.tryParse(defines['API_BASE_URL'] ?? '')?.host)) {
    _refuse('API_BASE_URL doit viser 127.0.0.1 ou localhost.');
  }

  // 3. Fresh private destination; filtered copy, no --delete.
  final staging = Directory('/private/tmp').createTempSync('teka-ios-qa-$app-');
  final chmod = await Process.run('chmod', ['700', staging.path]);
  if (chmod.exitCode != 0) _refuse('chmod 700 impossible sur ${staging.path}.');
  final dest = '${staging.path}/Runner.app';
  final rsync = await Process.run('rsync', [
    '-a',
    '--exclude=$_firebasePlist',
    '${source.path}/',
    '$dest/',
  ]);
  if (rsync.exitCode != 0) _refuse('rsync a échoué (code ${rsync.exitCode}).');

  // 4. Proof on the staged copy (existence only; nothing is opened).
  final leaked = Directory(dest)
      .listSync(recursive: true, followLinks: false)
      .where((e) => e.uri.pathSegments.where((s) => s.isNotEmpty).last == _firebasePlist)
      .toList();
  if (leaked.isNotEmpty) {
    _refuse('$_firebasePlist présent dans la copie ($dest) — inutilisable.');
  }
  if (await _plistValue('$dest/Info.plist', 'CFBundleIdentifier') != _bundleIds[app]) {
    _refuse('identifiant de la copie inattendu.');
  }
  final signed = Directory('$dest/_CodeSignature').existsSync();

  stdout.writeln('[codexqa-ios] bundle source        : ${source.path} (inchangé)');
  stdout.writeln('[codexqa-ios] $_firebasePlist dans la source : '
      '${File('${source.path}/$_firebasePlist').existsSync()}');
  stdout.writeln('[codexqa-ios] $_firebasePlist dans la copie  : false');
  stdout.writeln('[codexqa-ios] identifiant          : ${_bundleIds[app]}');
  stdout.writeln('[codexqa-ios] _CodeSignature dans la copie : $signed'
      '${signed ? ' — sceau de ressources périmé après exclusion ; voir README' : ''}');
  stdout.writeln('[codexqa-ios] copie préparée       : $dest');
}
