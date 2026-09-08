// Local-only profile fixtures (Seller UX PR F). No network, tokens or
// analytics. The repository answers from in-memory rows and records what the
// screens sent; failures are switched per endpoint.
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:seller_mobile/features/profile/data/profile_repository.dart';

DioException apiError(String path, int status, String message) => DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(path: path),
        statusCode: status,
        data: {
          'success': false,
          'error': {'status': status, 'message': message},
        },
      ),
    );

DioException networkError(String path) => DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionError,
    );

Map<String, dynamic> meJson({
  String id = 'user-marie',
  String firstName = 'Marie',
  String lastName = 'Kabila',
  String email = 'marie@shop.cd',
  String? avatar,
  String businessName = 'Boutique Marie',
  String phone = '+243970000001',
  String location = 'Avenue Kasavubu 12',
  String? cityId = 'city-lubumbashi',
  String? cityName = 'Lubumbashi',
  String? communeId = 'commune-kampemba',
  String? communeName = 'Kampemba',
  String applicationStatus = 'APPROVED',
  String verificationStatus = 'NOT_SUBMITTED',
  String? description,
}) =>
    {
      'id': id,
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
      'phone': '+243999000003',
      'avatar': avatar,
      'role': 'SELLER',
      'sellerProfile': {
        'id': 'profile-$id',
        'businessName': businessName,
        'phone': phone,
        'location': location,
        'cityId': cityId,
        'city': cityId == null ? null : {'id': cityId, 'name': cityName},
        'communeId': communeId,
        'commune':
            communeId == null ? null : {'id': communeId, 'name': communeName},
        'description': description,
        'applicationStatus': applicationStatus,
        'verificationStatus': verificationStatus,
      },
    };

const fixtureCities = [
  CityOption(id: 'city-lubumbashi', name: 'Lubumbashi', province: 'Haut-Katanga'),
  CityOption(id: 'city-kolwezi', name: 'Kolwezi', province: 'Lualaba'),
  CityOption(id: 'city-likasi', name: 'Likasi', province: 'Haut-Katanga'),
];

const fixtureCommunes = {
  'city-lubumbashi': [
    CommuneOption(id: 'commune-lubumbashi', name: 'Lubumbashi'),
    CommuneOption(id: 'commune-kampemba', name: 'Kampemba'),
    CommuneOption(id: 'commune-kenya', name: 'Kenya'),
  ],
  'city-kolwezi': [
    CommuneOption(id: 'commune-dilala', name: 'Dilala'),
    CommuneOption(id: 'commune-manika', name: 'Manika'),
  ],
  'city-likasi': <CommuneOption>[],
};

class FixtureProfileRepository extends ProfileRepository {
  FixtureProfileRepository({Map<String, dynamic>? me, void Function()? onChanged})
      : super(Dio(), onChanged: onChanged) {
    this.me = me ?? meJson();
  }
  int changedCalls = 0;

  late Map<String, dynamic> me;
  List<CityOption> cities = fixtureCities;
  Map<String, List<CommuneOption>> communes = fixtureCommunes;

  bool failMe = false;
  bool failCities = false;
  bool failCommunes = false;
  DioException? nextUpdateError;
  DioException? nextShopUpdateError;

  /// When set, reads wait for it — for asserting loading states.
  Future<void>? hold;

  int meCalls = 0;
  final profileUpdates = <Map<String, dynamic>>[];
  final shopUpdates = <Map<String, dynamic>>[];
  final communeRequests = <String>[];

  @override
  Future<ProfileUser> getMe() async {
    meCalls++;
    if (hold != null) await hold;
    if (failMe) throw networkError('/v1/auth/me');
    return ProfileUser.fromJson(me);
  }

  @override
  Future<ProfileUser> updateProfile(
      {String? firstName, String? lastName, String? email}) async {
    final body = {
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
      if (email != null) 'email': email,
    };
    profileUpdates.add(body);
    if (hold != null) await hold;
    final err = nextUpdateError;
    if (err != null) {
      nextUpdateError = null;
      throw err;
    }
    // The API normalises: trimmed, email lower-cased.
    me = {
      ...me,
      if (firstName != null) 'firstName': firstName.trim(),
      if (lastName != null) 'lastName': lastName.trim(),
      if (email != null) 'email': email.trim().toLowerCase(),
    };
    return ProfileUser.fromJson(me);
  }

  @override
  Future<void> updateSellerProfile({
    String? businessName,
    String? phone,
    String? location,
    String? cityId,
    String? communeId,
    bool clearCommune = false,
    String? description,
  }) async {
    final body = {
      if (businessName != null) 'businessName': businessName,
      if (phone != null) 'phone': phone,
      if (location != null) 'location': location,
      if (cityId != null) 'cityId': cityId,
      if (communeId != null) 'communeId': communeId,
      if (clearCommune) 'communeId': null,
      if (description != null) 'description': description,
    };
    shopUpdates.add(body);
    if (hold != null) await hold;
    final err = nextShopUpdateError;
    if (err != null) {
      nextShopUpdateError = null;
      throw err;
    }
    final sp = Map<String, dynamic>.from(me['sellerProfile'] as Map);
    if (businessName != null) sp['businessName'] = businessName;
    if (phone != null) sp['phone'] = phone;
    if (location != null) sp['location'] = location;
    if (description != null) sp['description'] = description;
    if (cityId != null) {
      final city = cities.where((c) => c.id == cityId).firstOrNull;
      sp['cityId'] = cityId;
      sp['city'] = {'id': cityId, 'name': city?.name ?? cityId};
    }
    if (communeId != null) {
      final all = communes.values.expand((l) => l);
      final c = all.where((c) => c.id == communeId).firstOrNull;
      sp['communeId'] = communeId;
      sp['commune'] = {'id': communeId, 'name': c?.name ?? communeId};
    } else if (clearCommune) {
      sp['communeId'] = null;
      sp['commune'] = null;
    }
    me = {...me, 'sellerProfile': sp};
  }

  @override
  Future<List<CityOption>> getCities() async {
    if (failCities) throw networkError('/v1/cities');
    return cities;
  }

  @override
  Future<List<CommuneOption>> getCommunes(String cityId) async {
    communeRequests.add(cityId);
    if (failCommunes) throw networkError('/v1/cities/$cityId/communes');
    return communes[cityId] ?? const [];
  }

  @override
  Future<String> uploadAvatar(File file) async =>
      'https://res.cloudinary.com/teka-rdc/avatar-fixture.jpg';
}
