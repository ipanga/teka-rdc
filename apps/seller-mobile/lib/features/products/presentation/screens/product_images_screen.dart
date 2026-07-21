import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/product_image_manager.dart';

/// Standalone image manager, reached from the product detail screen's "Ajouter"
/// button. Thin wrapper around [ProductImageManager] — the same widget is
/// embedded inline in the product edit form.
class ProductImagesScreen extends ConsumerWidget {
  final String productId;

  const ProductImagesScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text("Images"),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ProductImageManager(productId: productId),
      ),
    );
  }
}
