class CommuneModel {
  final String id;
  final String cityId;
  final String name;

  const CommuneModel({
    required this.id,
    required this.cityId,
    required this.name,
  });

  factory CommuneModel.fromJson(Map<String, dynamic> json) {
    return CommuneModel(
      id: json['id'] as String? ?? '',
      cityId: json['cityId'] as String? ?? '',
      name: json['name']?.toString() ?? '',
    );
  }
}
