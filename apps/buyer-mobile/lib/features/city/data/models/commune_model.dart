class CommuneModel {
  final String id;
  final String cityId;
  final Map<String, String> name;

  const CommuneModel({
    required this.id,
    required this.cityId,
    required this.name,
  });

  factory CommuneModel.fromJson(Map<String, dynamic> json) {
    final rawName = json['name'];
    final Map<String, String> parsedName;

    if (rawName is Map) {
      parsedName = rawName.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (rawName is String) {
      parsedName = {'fr': rawName, 'en': rawName};
    } else {
      parsedName = {'fr': '', 'en': ''};
    }

    return CommuneModel(
      id: json['id'] as String? ?? '',
      cityId: json['cityId'] as String? ?? '',
      name: parsedName,
    );
  }

  String getLocalizedName(String locale) {
    return name[locale] ?? name['fr'] ?? '';
  }
}
