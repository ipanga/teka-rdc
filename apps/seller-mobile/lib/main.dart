import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/push/push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase + local-notifications + handlers. Awaited before runApp so
  // the background message handler is registered before the first
  // frame. Idempotent + fail-soft (push becomes a no-op if anything
  // throws).
  await PushService.instance.init();
  runApp(const ProviderScope(child: TekaApp()));
}
