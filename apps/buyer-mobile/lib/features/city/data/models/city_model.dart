class CityModel {
  final String id;
  final String name;
  // URL `{ville}` segment from GET /v1/cities (API 2026-06-06). Informational
  // on mobile (native nav, no city-first URLs) — kept in sync with the web
  // City shape. Nullable for resilience against legacy cached payloads.
  final String? slug;
  final String province;
  final bool isActive;
  final int sortOrder;

  const CityModel({
    required this.id,
    required this.name,
    this.slug,
    required this.province,
    required this.isActive,
    required this.sortOrder,
  });

  factory CityModel.fromJson(Map<String, dynamic> json) {
    return CityModel(
      id: json['id'] as String? ?? '',
      name: json['name']?.toString() ?? '',
      slug: json['slug'] as String?,
      province: json['province'] as String? ?? '',
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}
