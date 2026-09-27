import 'product_model.dart';

/// One ranked result of `GET /v1/browse/categories/search` — always a LEAF
/// (product type), with its full path for context.
class CategorySearchHit {
  final String id;
  final String name;

  /// Names from the root to the leaf, leaf included.
  final List<String> path;

  const CategorySearchHit({
    required this.id,
    required this.name,
    this.path = const [],
  });

  factory CategorySearchHit.fromJson(Map<String, dynamic> json) =>
      CategorySearchHit(
        id: json['id'] as String,
        name: json['name']?.toString() ?? '',
        path: (json['path'] as List<dynamic>? ?? const [])
            .map((e) => e.toString())
            .toList(),
      );

  /// « Supermarché › Entretien Maison » — the path above the leaf.
  String? get parentPath =>
      path.length > 1 ? path.sublist(0, path.length - 1).join(' › ') : null;
}

/// Offline / failure fallback for the category picker: LEAVES whose name or
/// full path contains every typed word (accent- and case-insensitive). No
/// aliases or brands — those live on the server — but never a dead end.
List<CategorySearchHit> localCategorySearch(
    List<CategoryModel> tree, String query) {
  final tokens =
      normalizeCategoryQuery(query).split(' ').where((t) => t.isNotEmpty);
  if (tokens.join().length < 2) return const [];
  final out = <CategorySearchHit>[];
  void walk(CategoryModel node, List<String> path) {
    final here = [...path, node.name];
    if (node.subcategories.isEmpty) {
      final haystack = normalizeCategoryQuery(here.join(' '));
      if (tokens.every(haystack.contains)) {
        out.add(CategorySearchHit(id: node.id, name: node.name, path: here));
      }
      return;
    }
    for (final child in node.subcategories) {
      walk(child, here);
    }
  }

  for (final root in tree) {
    walk(root, const []);
  }
  return out;
}

/// Lower-case, French accents folded, punctuation → space, single-spaced.
/// Dart has no built-in unaccent; this covers the taxonomy's alphabet.
String normalizeCategoryQuery(String s) {
  const from = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyy';
  var r = s.toLowerCase().replaceAll('œ', 'oe').replaceAll('æ', 'ae');
  for (var i = 0; i < from.length; i++) {
    r = r.replaceAll(from[i], to[i]);
  }
  return r.replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();
}
