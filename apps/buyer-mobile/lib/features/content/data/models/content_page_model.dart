class ContentPageModel {
  final String slug;
  final Map<String, String> title;
  final Map<String, String> content;
  final String? status;

  const ContentPageModel({
    required this.slug,
    required this.title,
    required this.content,
    this.status,
  });

  factory ContentPageModel.fromJson(Map<String, dynamic> json) {
    return ContentPageModel(
      slug: json['slug'] as String? ?? '',
      title: _parseTranslationMap(json['title']),
      content: _parseTranslationMap(json['content']),
      status: json['status'] as String?,
    );
  }

  String localizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title['en'] ?? '';
  }

  String localizedContent(String locale) {
    return content[locale] ?? content['fr'] ?? content['en'] ?? '';
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

class ContentPageSummary {
  final String slug;
  final Map<String, String> title;

  const ContentPageSummary({
    required this.slug,
    required this.title,
  });

  factory ContentPageSummary.fromJson(Map<String, dynamic> json) {
    return ContentPageSummary(
      slug: json['slug'] as String? ?? '',
      title: _parseTranslationMap(json['title']),
    );
  }

  String localizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title['en'] ?? '';
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
