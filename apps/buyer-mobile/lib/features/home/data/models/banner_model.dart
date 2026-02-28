class BannerModel {
  final String id;
  final Map<String, String> title;
  final Map<String, String>? subtitle;
  final String imageUrl;
  final String? linkUrl;
  final String? linkType; // 'product' | 'category' | 'url'
  final String? linkTarget;
  final int sortOrder;

  const BannerModel({
    required this.id,
    required this.title,
    this.subtitle,
    required this.imageUrl,
    this.linkUrl,
    this.linkType,
    this.linkTarget,
    this.sortOrder = 0,
  });

  factory BannerModel.fromJson(Map<String, dynamic> json) {
    return BannerModel(
      id: json['id'] as String,
      title: _parseTranslationMap(json['title']),
      subtitle: json['subtitle'] != null
          ? _parseTranslationMap(json['subtitle'])
          : null,
      imageUrl: json['imageUrl'] as String? ?? '',
      linkUrl: json['linkUrl'] as String?,
      linkType: json['linkType'] as String?,
      linkTarget: json['linkTarget'] as String?,
      sortOrder: json['sortOrder'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      if (subtitle != null) 'subtitle': subtitle,
      'imageUrl': imageUrl,
      if (linkUrl != null) 'linkUrl': linkUrl,
      if (linkType != null) 'linkType': linkType,
      if (linkTarget != null) 'linkTarget': linkTarget,
      'sortOrder': sortOrder,
    };
  }

  String localizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title['en'] ?? '';
  }

  String? localizedSubtitle(String locale) {
    if (subtitle == null) return null;
    return subtitle![locale] ?? subtitle!['fr'] ?? subtitle!['en'];
  }

  static Map<String, String> _parseTranslationMap(dynamic value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v?.toString() ?? ''));
    }
    if (value is String) {
      return {'fr': value};
    }
    return {'fr': ''};
  }
}
