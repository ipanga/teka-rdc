class AttributeModel {
  final String id;
  final String categoryId;
  final Map<String, String> name;
  final String type; // TEXT, SELECT, MULTISELECT, NUMERIC
  final List<String> options;
  final bool isRequired;
  final int sortOrder;

  const AttributeModel({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.type,
    this.options = const [],
    this.isRequired = false,
    this.sortOrder = 0,
  });

  String getLocalizedName(String locale) {
    return name[locale] ?? name['fr'] ?? name.values.firstOrNull ?? '';
  }

  factory AttributeModel.fromJson(Map<String, dynamic> json) {
    final nameRaw = json['name'];
    Map<String, String> nameMap;
    if (nameRaw is Map) {
      nameMap = nameRaw.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (nameRaw is String) {
      nameMap = {'fr': nameRaw};
    } else {
      nameMap = {'fr': ''};
    }

    final optionsRaw = json['options'];
    List<String> options;
    if (optionsRaw is List) {
      options = optionsRaw.map((e) => e.toString()).toList();
    } else {
      options = [];
    }

    return AttributeModel(
      id: json['id'] as String,
      categoryId: json['categoryId'] as String? ?? '',
      name: nameMap,
      type: json['type'] as String? ?? 'TEXT',
      options: options,
      isRequired: json['isRequired'] as bool? ?? false,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }
}
