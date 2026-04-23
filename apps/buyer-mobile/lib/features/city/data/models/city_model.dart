class CityModel {
  final String id;
  final Map<String, String> name;
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
    final rawName = json['name'];
    final Map<String, String> parsedName;

    if (rawName is Map) {
      parsedName = rawName.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (rawName is String) {
      parsedName = {'fr': rawName, 'en': rawName};
    } else {
      parsedName = {'fr': '', 'en': ''};
    }

    return CityModel(
      id: json['id'] as String? ?? '',
      name: parsedName,
      province: json['province'] as String? ?? '',
      isActive: json['isActive'] as bool? ?? true,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }

  String getLocalizedName(String locale) {
    return name[locale] ?? name['fr'] ?? '';
  }
}
