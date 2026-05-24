/// Sentry payload scrubber for buyer-mobile.
///
/// Buyer phone numbers (+243XXXXXXXXX) are auth identifiers (Rule 13 in
/// CLAUDE.md) — strip them out of any Sentry event payload before send.
/// Mirrors apps/api/src/instrument.ts:scrubPhones + apps/*-web/sentry-scrub.ts.
/// Keep all four in sync if either changes.
///
/// Scope: only the two realistic leak vectors — breadcrumbs (route logs,
/// HTTP URLs) and the event message body. Tags/contexts are typed fields
/// we don't set with phone-containing values.
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
