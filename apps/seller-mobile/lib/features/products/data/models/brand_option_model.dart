/// Lightweight brand entry for the seller product form's brand dropdown.
/// Sourced from GET /v1/brands?categoryId= — never a hardcoded list.
class BrandOption {
  final String id;
  final String name;

  const BrandOption({required this.id, required this.name});

  factory BrandOption.fromJson(Map<String, dynamic> json) => BrandOption(
        id: json['id'] as String,
        name: json['name']?.toString() ?? '',
      );
}
