class CategoryModel {
  final String id;
  final Map<String, dynamic> name;
  final String? description;
  final String? emoji;
  final List<CategoryModel> subcategories;
  final int productCount;

  const CategoryModel({
    required this.id,
    required this.name,
    this.description,
    this.emoji,
    this.subcategories = const [],
    this.productCount = 0,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel(
      id: json['id'] as String,
      name: json['name'] is Map
          ? Map<String, dynamic>.from(json['name'] as Map)
          : {'fr': json['name'].toString()},
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

  String localizedName(String locale) {
    return name[locale] as String? ?? name['fr'] as String? ?? name['en'] as String? ?? '';
  }
}
