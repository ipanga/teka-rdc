class ContentPageModel {
  final String slug;
  final String title;
  final String content;
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
      title: json['title']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      status: json['status'] as String?,
    );
  }
}

class ContentPageSummary {
  final String slug;
  final String title;

  const ContentPageSummary({
    required this.slug,
    required this.title,
  });

  factory ContentPageSummary.fromJson(Map<String, dynamic> json) {
    return ContentPageSummary(
      slug: json['slug'] as String? ?? '',
      title: json['title']?.toString() ?? '',
    );
  }
}
