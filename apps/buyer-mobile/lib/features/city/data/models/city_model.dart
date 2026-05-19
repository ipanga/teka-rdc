class CityModel {
  final String id;
  final String name;
  final String province;
  final bool isActive;
  final int sortOrder;

  const CityModel({
    required this.id,
    required this.name,
    required this.province,
    required this.isActive,
    required this.sortOrder,
  });

  factory CityModel.fromJson(Map<String, dynamic> json) {
    return CityModel(
      id: json['id'] as String? ?? '',
      name: json['name']?.toString() ?? '',
      province: json['province'] as String? ?? '',
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}
