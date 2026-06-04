import 'package:flutter/foundation.dart';
import 'package:posthog_flutter/posthog_flutter.dart';
import '../config/flavor.dart';

/// Thin wrapper around posthog_flutter for identity.
///
/// Gated on [FlavorConfig.posthogApiKey] — when the flavor ships without a
/// key (dev/staging, or prod before the key is provisioned) every call is a
/// no-op, mirroring the Sentry gate. `Posthog().setup()` is called once in
/// `main()` only when the key is present, so the SDK is never touched here
/// when disabled.
///
/// **Privacy (Rule 13):** identity carries `id` + `role` ONLY — never phone,
/// email, or names. [buildIdentityProperties] is the single place that builds
/// the property map and is unit-tested to guarantee no PII leaks through.
class PosthogAnalytics {
  const PosthogAnalytics();

  static bool get _enabled =>
      (FlavorConfig.instance.posthogApiKey ?? '').isNotEmpty;

  /// Identify the signed-in user. Distinct id is the public `user.id` so
  /// mobile events stitch to the same PostHog person as the server (which
  /// also keys on `user.id`).
  Future<void> identifyUser(Map<String, dynamic>? user) async {
    if (!_enabled || user == null) return;
    final id = user['id']?.toString();
    if (id == null || id.isEmpty) return;
    try {
      await Posthog().identify(
        userId: id,
        userProperties: buildIdentityProperties(user),
      );
    } catch (e) {
      debugPrint('[PosthogAnalytics] identify failed: $e');
    }
  }

  /// Clear the distinct id on logout.
  Future<void> reset() async {
    if (!_enabled) return;
    try {
      await Posthog().reset();
    } catch (e) {
      debugPrint('[PosthogAnalytics] reset failed: $e');
    }
  }
}

/// Builds the person-properties map for [identifyUser]. **Only `role`** —
/// deliberately excludes id (it's the distinctId), phone, email, and names.
/// Pure + side-effect-free so it can be unit-tested for PII safety.
@visibleForTesting
Map<String, Object> buildIdentityProperties(Map<String, dynamic> user) {
  final role = user['role']?.toString();
  return {
    if (role != null && role.isNotEmpty) 'role': role,
  };
}
