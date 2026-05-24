/// Sentry payload scrubber for seller-mobile.
/// See apps/buyer-mobile/lib/core/config/sentry_scrub.dart for the full
/// rationale — keep both apps in sync if either changes.
library;

import 'package:sentry_flutter/sentry_flutter.dart';

final _phoneRegex = RegExp(r'\+243\d{9}');

String _scrub(String s) => s.replaceAll(_phoneRegex, '[phone]');

SentryEvent? scrubBeforeSend(SentryEvent event, Hint hint) {
  final msg = event.message;
  if (msg != null) {
    event.message = SentryMessage(
      _scrub(msg.formatted),
      template: msg.template == null ? null : _scrub(msg.template!),
      params: msg.params,
    );
  }
  final crumbs = event.breadcrumbs;
  if (crumbs != null) {
    event.breadcrumbs = crumbs.map((b) {
      return Breadcrumb(
        message: b.message == null ? null : _scrub(b.message!),
        category: b.category,
        data: b.data?.map((k, v) =>
            MapEntry(k, v is String ? _scrub(v) : v)),
        level: b.level,
        type: b.type,
        timestamp: b.timestamp,
      );
    }).toList();
  }
  return event;
}
