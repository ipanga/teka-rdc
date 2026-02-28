import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/banner_repository.dart';
import '../../data/models/banner_model.dart';

final bannersProvider = FutureProvider<List<BannerModel>>((ref) {
  final repository = ref.read(bannerRepositoryProvider);
  return repository.getBanners();
});
