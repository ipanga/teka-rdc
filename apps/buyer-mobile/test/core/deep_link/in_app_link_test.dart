// CMS links (help / FAQ / terms…) — PR D (2026-09-06).
import 'package:buyer_mobile/core/deep_link/in_app_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('relative website links open the matching in-app screen', () {
    expect((classifyInAppLink('/pages/faq') as InAppRoute).route, '/pages/faq');
    expect((classifyInAppLink('/promotions') as InAppRoute).route, '/promotions');
    expect((classifyInAppLink('/lubumbashi/categorie/telephones') as InAppRoute).route,
        '/categories/telephones');
  });

  test('a relative link the app has no screen for is ignored (not launched as a URL)', () {
    expect(classifyInAppLink('/panier'), isA<IgnoredLink>());
    expect(classifyInAppLink(''), isA<IgnoredLink>());
    expect(classifyInAppLink('not a url'), isA<IgnoredLink>());
  });

  test('absolute Teka URLs the app renders stay in-app; the rest go to the OS', () {
    expect((classifyInAppLink('https://teka.cd/pages/aide') as InAppRoute).route,
        '/pages/aide');
    expect((classifyInAppLink('https://teka.cd/profil') as ExternalLink).uri.host,
        'teka.cd');
    expect((classifyInAppLink('https://wa.me/243999000000') as ExternalLink).uri.host,
        'wa.me');
    expect((classifyInAppLink('tel:+243999000000') as ExternalLink).uri.scheme, 'tel');
    expect((classifyInAppLink('mailto:support@teka.cd') as ExternalLink).uri.scheme,
        'mailto');
  });
}
