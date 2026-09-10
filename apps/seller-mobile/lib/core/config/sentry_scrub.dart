/// Sentry payload scrubber for seller-mobile.
///
/// ## What this covers, and what it deliberately does not
///
/// Behaviour is identical to buyer-mobile's copy — see
/// apps/buyer-mobile/lib/core/config/sentry_scrub.dart for the full
/// rationale. The two must never diverge (CLAUDE.md Rule 15).
///
/// ## MS6 (2026-09-09)
///
/// Before this, the scrubber walked `message` and `breadcrumbs` only, with a
/// single `\+243\d{9}` regex. Two consequences:
///
///  * `exceptions`, `contexts`, `tags`, `extra` and `user` were never walked,
///    and `retry_interceptor.dart` and `dio_error_messages.dart` demonstrably
///    write request paths into `contexts` and `tags`;
///  * the regex matched only the strict E.164 form, so `243…`, `0…`, and the
///    spaced and dashed forms people actually type all went through intact,
///    and `\d{9}` unbounded on the right turned `+2438123456789` into
///    `[phone]789`.
///
/// The walk is now whole-event and the phone pattern covers the written forms
/// used in the DRC. Emails, JWTs, `Bearer` tokens and Cloudinary document URLs
/// are scrubbed too — the same value classes the shared JavaScript sanitiser
/// removes, so the six surfaces agree.
///
/// Opaque ids are kept: `user.id`, `role`, product and order UUIDs in tags and
/// breadcrumbs are what make an event actionable and none of them is a secret.
/// Plain numbers are never redacted on sight; only a recognised pattern is.
library;

import 'package:sentry_flutter/sentry_flutter.dart';

/// DRC phone numbers, in the forms that actually appear.
///
/// `+243812345678`, `243812345678`, `0812345678`, and any of them written with
/// spaces, dots or dashes between the groups — including the 3-3-3 grouping
/// (`+243 812 345 678`) that a fixed 2-3-4 pattern misses.
///
/// The trailing `\d+` is deliberately greedy so an over-long run is consumed
/// whole. A right-anchored boundary looked safer but was worse: it refused to
/// match `+2438123456789` at all and left the entire number in the payload.
final _phoneRegex = RegExp(r'(?:\+?243|0)[\s.-]?(?:\d[\s.-]?){8}\d+');

final _emailRegex = RegExp(r'[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}');

final _jwtRegex = RegExp(r'\beyJ[A-Za-z0-9_-]{8,512}\.[A-Za-z0-9_-]{8,512}\.[A-Za-z0-9_-]{8,512}');

final _bearerRegex = RegExp(r'\bBearer\s[A-Za-z0-9._~+/=-]{8,512}', caseSensitive: false);

final _cloudinaryRegex =
    RegExp(r'''https?://[^\s"'<>/]{0,253}cloudinary\.com[^\s"'<>]{0,512}''', caseSensitive: false);

/// `key=value` / `key: value` written inline in free text, which is how the
/// Dart side logs too. Key matching alone cannot see these — there is no map
/// key to inspect. `\b` before the name keeps `statusCode=500` intact.
final _inlineSecretRegex = RegExp(
  r'\b(pass(?:word|wd|phrase)?|secret|token|otp|auth(?:orization)?|cookie|session|credential|api[-_]?key|apikey|signature|jwt|bearer|pin|code)'
  r'(\s*[=:]\s*)'
  r'(?!\[Filtered\])'
  r'''("[^"]{0,512}"|'[^']{0,512}'|[^\s,;&)}\]]{1,512})''',
  caseSensitive: false,
);

/// Replacement marker, matching the shared JavaScript sanitiser.
const filtered = '[Filtered]';

/// Longest string we will run the patterns over. Sentry truncates anyway.
const _maxStringLength = 8192;

/// Deepest structure we will walk, and the total node budget per event.
const _maxDepth = 8;
const _maxNodes = 2000;

/// Scrub a single string. Order is load-bearing: JWT and `Bearer` run before
/// the inline `key=value` rule, or `Authorization: Bearer <token>` matches
/// inline, consumes only the word `Bearer`, and leaves the token in place.
String scrubText(String input) {
  if (input.isEmpty) return input;
  var out = input.length > _maxStringLength
      ? input.substring(0, _maxStringLength)
      : input;
  out = out.replaceAll(_cloudinaryRegex, '[document-link]');
  out = out.replaceAll(_jwtRegex, filtered);
  out = out.replaceAll(_bearerRegex, 'Bearer $filtered');
  out = out.replaceAllMapped(
    _inlineSecretRegex,
    (m) => '${m[1]}${m[2]}$filtered',
  );
  out = out.replaceAll(_phoneRegex, '[phone]');
  out = out.replaceAll(_emailRegex, '[email]');
  return out;
}

/// Keys whose value is replaced outright, wherever they appear.
final _sensitiveKeyRegex = RegExp(
  r'pass(word|wd|phrase)?|secret|token|otp|auth(orization)?|cookie|session|credential|api[-_]?key|signature|jwt|bearer|pin|cvv|iban',
  caseSensitive: false,
);

/// Recursively scrub an arbitrary value from a Sentry map. Bounded on depth
/// and total nodes so a pathological payload cannot stall `beforeSend`.
Object? _scrubValue(Object? value, int depth, _Budget budget, [String? key]) {
  if (budget.spend() || depth > _maxDepth) return filtered;
  if (key != null && _sensitiveKeyRegex.hasMatch(key)) return filtered;
  if (value is String) return scrubText(value);
  if (value is List) {
    return value.map((v) => _scrubValue(v, depth + 1, budget, key)).toList();
  }
  if (value is Map) {
    return value.map(
      (k, v) => MapEntry(k, _scrubValue(v, depth + 1, budget, k?.toString())),
    );
  }
  return value;
}

class _Budget {
  int _n = 0;
  bool spend() => ++_n > _maxNodes;
}

Map<String, String>? _scrubStringMap(Map<String, String>? m) =>
    m?.map((k, v) => MapEntry(
        k, _sensitiveKeyRegex.hasMatch(k) ? filtered : scrubText(v)));

Map<String, dynamic>? _scrubMap(Map<String, dynamic>? m) {
  if (m == null) return null;
  final budget = _Budget();
  return m.map((k, v) => MapEntry(k, _scrubValue(v, 1, budget, k)));
}

/// `beforeSend`. Returns the event with every field the app can write walked.
SentryEvent? scrubBeforeSend(SentryEvent event, Hint hint) {
  final msg = event.message;
  if (msg != null) {
    event.message = SentryMessage(
      scrubText(msg.formatted),
      template: msg.template == null ? null : scrubText(msg.template!),
      // Params were previously passed through verbatim, so a phone
      // interpolated as a param survived the scrub of the formatted string.
      params: msg.params
          ?.map((p) => p is String ? scrubText(p) : p)
          .toList(),
    );
  }

  final crumbs = event.breadcrumbs;
  if (crumbs != null) {
    event.breadcrumbs = crumbs.map((b) {
      return Breadcrumb(
        message: b.message == null ? null : scrubText(b.message!),
        category: b.category,
        data: _scrubMap(b.data),
        level: b.level,
        type: b.type,
        timestamp: b.timestamp,
      );
    }).toList();
  }

  // A raw DioException reaches Sentry through dio_error_messages.dart, and its
  // toString() can embed response detail. Never walked before.
  for (final e in event.exceptions ?? const <SentryException>[]) {
    final v = e.value;
    if (v != null) e.value = scrubText(v);
  }

  // retry_interceptor.dart writes the request path into contexts, and
  // dio_error_messages.dart writes "METHOD /path" into an `endpoint` tag.
  final contexts = event.contexts;
  for (final key in contexts.keys.toList()) {
    final value = contexts[key];
    if (value is Map<String, dynamic>) {
      contexts[key] = _scrubMap(value);
    }
  }

  event.tags = _scrubStringMap(event.tags);
  // `extra` is deliberately not handled: both apps use named contexts and
  // never call setExtra (see connectivity_sentry_reporter.dart), and the field
  // is deprecated in the SDK.

  // Keep the opaque id and role; drop anything that identifies a person.
  final user = event.user;
  if (user != null) {
    user
      ..email = null
      ..ipAddress = null
      ..name = null
      ..username = null
      ..data = _scrubMap(user.data);
  }

  return event;
}
