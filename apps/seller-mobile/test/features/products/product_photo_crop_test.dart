import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:seller_mobile/core/media/source_photo.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/widgets/image_upload_tile.dart';
import 'package:seller_mobile/features/products/presentation/widgets/product_image_manager.dart';
import '../../support/seller_dashboard_fixtures.dart';

/// Seller Catalogue Speed-up — shelf photo → crop → upload, and reuse of the
/// same source for the next product.

class _Picker implements SourcePhotoPicker {
  _Picker(this.dir);
  final Directory dir;
  int calls = 0;

  @override
  Future<String?> pick(ImageSource source) async {
    calls++;
    final f = File('${dir.path}/picked_$calls.jpg')
      ..writeAsBytesSync(List.filled(64, 7));
    return f.path;
  }
}

class _Cropper implements PhotoCropper {
  _Cropper(this.dir);
  final Directory dir;
  final sources = <String>[];
  bool cancel = false;

  @override
  Future<File?> crop(String sourcePath) async {
    sources.add(sourcePath);
    if (cancel) return null;
    return File('${dir.path}/crop_${sources.length}.jpg')
      ..writeAsBytesSync(List.filled(16, sources.length));
  }
}

class _Store implements SourcePhotoStore {
  _Store(this.dir);
  final Directory dir;
  @override
  Future<Directory> directory() async => dir;
}

class _Repo extends ProductsRepository {
  _Repo() : super(Dio());
  final uploads = <List<int>>[];
  bool fail = false;

  @override
  Future<ProductImageModel> uploadImage(String productId, File imageFile) async {
    final bytes = await imageFile.readAsBytes();
    if (fail) {
      throw DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionError);
    }
    uploads.add(bytes);
    return ProductImageModel.fromJson({
      'id': 'new${uploads.length}',
      'url': 'u',
      'thumbnailUrl': 't',
      'cloudinaryId': 'c',
      'displayOrder': uploads.length,
    });
  }

  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts(
          {int page = 1, int limit = 20, String? status, String? search}) async =>
      PaginatedResponse(items: const [], total: 0, page: page, limit: limit);
}

final _product = SellerProductModel.fromJson({'id': 'p1', 'title': 'Omo', 'images': []});

late Directory _tmp;
late _Picker _picker;
late _Cropper _cropper;
late _Repo _repo;
late ProviderContainer _container;

Future<void> _pump(WidgetTester t) async {
  _container = ProviderContainer(overrides: [
    authProvider.overrideWith((_) => FixtureAuthNotifier()),
    productDetailProvider('p1').overrideWith((ref) async => _product),
    productsRepositoryProvider.overrideWithValue(_repo),
    sourcePhotoPickerProvider.overrideWithValue(_picker),
    photoCropperProvider.overrideWithValue(_cropper),
    sourcePhotoStoreProvider.overrideWithValue(_Store(_tmp)),
  ]);
  await t.pumpWidget(UncontrolledProviderScope(
    container: _container,
    child: const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: ProductImageManager(productId: 'p1')),
      ),
    ),
  ));
  await t.pump();
}

/// The flow does real file IO (copy, read, delete), which only progresses in
/// real time: let it run until [done] holds (or 5 s pass), pumping frames in
/// between. A fixed delay was flaky on slower CI runners.
Future<void> _settle(WidgetTester t, bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)));
    await t.pump();
  }
  await t.pump(const Duration(milliseconds: 400));
}

/// True once no upload is in flight and the manager has settled.
bool _idle() =>
    find.byType(CircularProgressIndicator).evaluate().isEmpty;

Future<void> _openSheetAndTap(WidgetTester t, String label,
    {bool Function()? until}) async {
  await t.runAsync(() async {
    await t.tap(find.byType(ImageUploadTile).last);
    await Future<void>.delayed(const Duration(milliseconds: 20));
  });
  await t.pump();
  await t.pump(const Duration(milliseconds: 400));
  await t.tap(find.text(label));
  await _settle(t, until ?? _idle);
}

void main() {
  setUp(() {
    _tmp = Directory.systemTemp.createTempSync('teka_crop_test');
    _picker = _Picker(_tmp);
    _cropper = _Cropper(_tmp);
    _repo = _Repo();
  });
  tearDown(() {
    _container.dispose();
    if (_tmp.existsSync()) _tmp.deleteSync(recursive: true);
  });

  testWidgets('no reuse option before any shelf photo was taken', (t) async {
    await _pump(t);
    await t.runAsync(() async {
      await t.tap(find.byType(ImageUploadTile).last);
      await Future<void>.delayed(const Duration(milliseconds: 20));
    });
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    expect(find.text('Prendre une photo'), findsOneWidget);
    expect(find.text('Recadrer à nouveau la photo précédente'), findsNothing);
  });

  testWidgets('camera → crop → upload sends only the crop and keeps the source',
      (t) async {
    await _pump(t);
    // Wait for the post-upload cleanup too: the crop file is deleted
    // asynchronously AFTER the upload is recorded (a CI race otherwise).
    await _openSheetAndTap(t, 'Prendre une photo',
        until: () =>
            _repo.uploads.isNotEmpty &&
            !File('${_tmp.path}/crop_1.jpg').existsSync());

    expect(_picker.calls, 1);
    expect(_repo.uploads, hasLength(1));
    expect(_repo.uploads.single, List.filled(16, 1)); // the crop, not the source
    final source = _container.read(sourcePhotoSessionProvider);
    expect(source, isNotNull);
    expect(source!.existsSync(), isTrue);
    expect(source.readAsBytesSync(), List.filled(64, 7)); // untouched
    // The uploaded crop file is cleaned up.
    expect(File('${_tmp.path}/crop_1.jpg').existsSync(), isFalse);
    // …and so is the picker's own cache copy, once adopted.
    expect(File('${_tmp.path}/picked_1.jpg').existsSync(), isFalse);
  });

  testWidgets('a second crop reuses the same source without picking again',
      (t) async {
    await _pump(t);
    await _openSheetAndTap(t, 'Prendre une photo',
        until: () => _repo.uploads.isNotEmpty);
    final source = _container.read(sourcePhotoSessionProvider)!;

    await _openSheetAndTap(t, 'Recadrer à nouveau la photo précédente',
        until: () => _repo.uploads.length == 2);

    expect(_picker.calls, 1, reason: 'no second pick');
    expect(_cropper.sources, [source.path, source.path]);
    expect(_repo.uploads, hasLength(2));
    expect(source.existsSync(), isTrue);
  });

  testWidgets('a cancelled crop uploads nothing and keeps the source', (t) async {
    _cropper.cancel = true;
    await _pump(t);
    await _openSheetAndTap(t, 'Choisir dans la galerie',
        until: () => _cropper.sources.isNotEmpty);

    expect(_repo.uploads, isEmpty);
    expect(_container.read(sourcePhotoSessionProvider)!.existsSync(), isTrue);
  });

  testWidgets('a failed upload keeps the crop and « Réessayer » resends the same bytes',
      (t) async {
    _repo.fail = true;
    await _pump(t);
    await _openSheetAndTap(t, 'Prendre une photo',
        until: () => find
            .text('Une photo recadrée n’a pas été envoyée.')
            .evaluate()
            .isNotEmpty);

    expect(_repo.uploads, isEmpty);
    expect(find.text('Une photo recadrée n’a pas été envoyée.'), findsOneWidget);

    _repo.fail = false;
    await t.tap(find.text('Réessayer'));
    await _settle(t, () => _repo.uploads.isNotEmpty);

    expect(_repo.uploads.single, List.filled(16, 1));
    expect(_cropper.sources, hasLength(1), reason: 'no re-crop needed');
    expect(find.text('Une photo recadrée n’a pas été envoyée.'), findsNothing);
  });

  testWidgets('« Terminer avec cette photo » deletes the source', (t) async {
    await _pump(t);
    await _openSheetAndTap(t, 'Prendre une photo',
        until: () => _repo.uploads.isNotEmpty);
    final source = _container.read(sourcePhotoSessionProvider)!;

    await _openSheetAndTap(t, 'Terminer avec cette photo',
        until: () => !source.existsSync());

    expect(_container.read(sourcePhotoSessionProvider), isNull);
    expect(source.existsSync(), isFalse);
  });

  test('purgeStaleSourcePhotos removes only old copies', () async {
    final dir = Directory.systemTemp.createTempSync('teka_purge_test');
    final old = File('${dir.path}/old.jpg')..writeAsBytesSync([1]);
    old.setLastModifiedSync(DateTime.now().subtract(const Duration(hours: 30)));
    final fresh = File('${dir.path}/fresh.jpg')..writeAsBytesSync([1]);

    await purgeStaleSourcePhotos(store: _Store(dir));

    expect(old.existsSync(), isFalse);
    expect(fresh.existsSync(), isTrue);
    dir.deleteSync(recursive: true);
  });
}
