// A2 (2026-09-06) — a cold start with stored credentials and no network keeps
// the session; only a server rejection clears it; reconnection re-verifies.
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buyer_mobile/core/cache/cache_keys.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/features/auth/data/auth_repository.dart';
import 'package:buyer_mobile/features/auth/data/session_scope.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/catalog/data/recent_searches_store.dart';
import 'package:buyer_mobile/features/catalog/data/recently_viewed_store.dart';

class _Tokens extends TokenStorage {
  _Tokens({bool has = true}) : _has = has, super(const FlutterSecureStorage());
  bool _has;
  int clears = 0;
  @override
  Future<bool> hasTokens() async => _has;
  @override
  Future<void> clearTokens() async {
    _has = false;
    clears++;
  }
}

class _Repo extends AuthRepository {
  _Repo(this.result) : super(Dio(), _Tokens());
  SessionCheck result;
  int calls = 0;
  @override
  Future<SessionCheck> checkSession() async {
    calls++;
    return result;
  }
}

Future<void> _settle() => Future.delayed(Duration.zero);
const _user = {'id': 'u1', 'role': 'BUYER', 'firstName': 'Aline', 'lastName': 'Kabila'};

void main() {
  late SharedPreferences prefs;
  late SessionScope scope;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    scope = SessionScope(TypedCache(prefs), RecentlyViewedStore(prefs), RecentSearchesStore());
  });

  test('server unreachable with stored tokens → still authenticated, tokens kept, cached profile used, unverified', () async {
    await scope.cacheProfile(_user);
    final tokens = _Tokens();
    final n = AuthNotifier(_Repo(const SessionUnreachable()), tokens, scope);
    await _settle();
    await _settle();
    expect(n.state.status, AuthStatus.authenticated);
    expect(n.state.sessionVerified, isFalse);
    expect(n.state.user?['firstName'], 'Aline');
    expect(tokens.clears, 0);
    expect(await tokens.hasTokens(), isTrue);
  });

  test('server unreachable and no cached profile → authenticated with no user, still no logout', () async {
    final tokens = _Tokens();
    final n = AuthNotifier(_Repo(const SessionUnreachable()), tokens, scope);
    await _settle();
    await _settle();
    expect(n.state.status, AuthStatus.authenticated);
    expect(n.state.user, isNull);
    expect(n.state.sessionVerified, isFalse);
    expect(tokens.clears, 0);
  });

  test('server rejects (401) → tokens cleared, unauthenticated, private disk state gone', () async {
    await scope.cacheProfile(_user);
    await prefs.setString(CacheKeys.buyerCart, '{"v":1}');
    final tokens = _Tokens();
    final n = AuthNotifier(_Repo(const SessionRejected()), tokens, scope);
    await _settle();
    await _settle();
    expect(n.state.status, AuthStatus.unauthenticated);
    expect(tokens.clears, 1);
    expect(scope.readCachedProfile(), isNull);
    expect(prefs.getString(CacheKeys.buyerCart), isNull);
  });

  test('server confirms → verified and the profile is cached for the next offline start', () async {
    final n = AuthNotifier(_Repo(const SessionOk(_user)), _Tokens(), scope);
    await _settle();
    await _settle();
    expect(n.state.status, AuthStatus.authenticated);
    expect(n.state.sessionVerified, isTrue);
    expect(scope.readCachedProfile()?['id'], 'u1');
  });

  test('no tokens → unauthenticated without ever asking the server', () async {
    final repo = _Repo(const SessionOk(_user));
    final n = AuthNotifier(repo, _Tokens(has: false), scope);
    await _settle();
    expect(n.state.status, AuthStatus.unauthenticated);
    expect(repo.calls, 0);
  });

  test('reconnect: an unverified session is re-checked — confirmed stays, rejected logs out', () async {
    await scope.cacheProfile(_user);
    final repo = _Repo(const SessionUnreachable());
    final tokens = _Tokens();
    final n = AuthNotifier(repo, tokens, scope);
    await _settle();
    await _settle();
    expect(n.state.sessionVerified, isFalse);

    repo.result = const SessionOk(_user);
    await n.reverifyIfNeeded();
    expect(n.state.sessionVerified, isTrue);
    expect(n.state.status, AuthStatus.authenticated);

    // A verified session is not re-checked on every reconnect.
    final before = repo.calls;
    await n.reverifyIfNeeded();
    expect(repo.calls, before);

    // …but a later rejection (revoked on the server) does end it.
    repo.result = const SessionRejected();
    await n.checkAuthStatus();
    expect(n.state.status, AuthStatus.unauthenticated);
    expect(tokens.clears, 1);
  });
}
