import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/api_constants.dart';
import 'connectivity_service.dart';
import 'connectivity_status.dart';

/// Singleton ConnectivityService for the lifetime of the app.
///
/// The service is constructed lazily on first access; `start()` is called
/// immediately. `dispose()` runs when the provider is disposed (only on
/// full app teardown — the provider lives at the root container).
final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService(baseUrl: ApiConstants.baseUrl);
  // Fire-and-forget; `start()` runs an initial probe but doesn't need to
  // complete before consumers can subscribe (the stream caches the
  // initial `reconnecting` snapshot).
  service.start();
  ref.onDispose(service.dispose);
  return service;
});

/// Live stream of the connectivity state. Use this in widgets that need
/// to rebuild on every transition (e.g. the global banner).
final connectivitySnapshotProvider =
    StreamProvider<ConnectivitySnapshot>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.stream;
});

/// Cheap synchronous-read provider for interceptors and ad-hoc checks.
/// Derived from the stream; falls back to the service's last-known
/// snapshot before the stream provider's first emission lands.
final connectivityStatusProvider = Provider<ConnectivityStatus>((ref) {
  final async = ref.watch(connectivitySnapshotProvider);
  return async.maybeWhen(
    data: (snap) => snap.status,
    orElse: () => ref.watch(connectivityServiceProvider).snapshot.status,
  );
});

/// Convenience derived providers for common predicates. Cheaper than
/// rebuilding on every snapshot change when you only care about a
/// boolean condition.
final isOnlineProvider = Provider<bool>((ref) {
  final status = ref.watch(connectivityStatusProvider);
  return status == ConnectivityStatus.connected ||
      status == ConnectivityStatus.unstable;
});

final isOfflineProvider = Provider<bool>((ref) {
  final status = ref.watch(connectivityStatusProvider);
  return status == ConnectivityStatus.disconnected ||
      status == ConnectivityStatus.noInternet;
});
