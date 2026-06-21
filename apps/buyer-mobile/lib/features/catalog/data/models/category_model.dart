class CategoryModel {
  final String id;
  final String name;
  // URL slug from GET /v1/browse/categories — keys the bundled category icon
  // (see category_images.dart). Nullable for resilience.
  final String? slug;
  final String? description;
  final String? emoji;
  final List<CategoryModel> subcategories;
  final int productCount;

  const CategoryModel({
    required this.id,
    required this.name,
    this.slug,
    this.description,
    this.emoji,
    this.subcategories = const [],
    this.productCount = 0,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel(
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
      slug: json['slug'] as String?,
      description: json['description'] as String?,
      emoji: json['emoji'] as String?,
      subcategories: json['subcategories'] != null
          ? (json['subcategories'] as List)
              .map((e) => CategoryModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      productCount: json['productCount'] as int? ?? 0,
    );
  }
}
