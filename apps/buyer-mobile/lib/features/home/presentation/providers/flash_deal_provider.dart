import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/flash_deal_repository.dart';
import '../../data/models/flash_deal_model.dart';

final flashDealsProvider = FutureProvider<List<FlashDealModel>>((ref) {
  final repository = ref.read(flashDealRepositoryProvider);
  return repository.getFlashDeals();
});
