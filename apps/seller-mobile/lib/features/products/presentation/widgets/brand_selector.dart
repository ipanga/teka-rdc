import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/models/brand_option_model.dart';

/// Brand picker for the product form. The list is the API's answer for the
/// chosen product type (`GET /v1/brands?categoryId=`, « Autre » included by
/// the server) — never a global client-side list. A dropdown was fine for
/// five brands and unusable for forty (phones, cosmetics), so the choice
/// opens a searchable sheet like the category selector.
class BrandSelector extends StatelessWidget {
  const BrandSelector({
    super.key,
    required this.brands,
    required this.selectedId,
    required this.onSelected,
  });

  final List<BrandOption> brands;
  final String? selectedId;

  /// Null = « Sans marque ».
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final selected = brands.where((b) => b.id == selectedId).firstOrNull;
    return Semantics(
      button: true,
      label: 'Marque, ${selected?.name ?? 'sans marque'}',
      child: ExcludeSemantics(
        child: InkWell(
          onTap: () => _open(context),
          borderRadius: TekaRadius.mdAll,
          child: InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Marque',
              helperText: 'Marques proposées pour ce type de produit.',
              suffixIcon: Icon(Icons.arrow_drop_down),
            ),
            child: Text(
              selected?.name ?? 'Sans marque',
              style: TextStyle(
                  color: selected != null
                      ? TekaColors.foreground
                      : TekaColors.mutedForeground),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    final result = await showModalBottomSheet<_BrandChoice>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _BrandSheet(brands: brands, selectedId: selectedId),
    );
    if (result != null) onSelected(result.id);
  }
}

class _BrandChoice {
  const _BrandChoice(this.id);
  final String? id;
}

class _BrandSheet extends StatefulWidget {
  const _BrandSheet({required this.brands, required this.selectedId});
  final List<BrandOption> brands;
  final String? selectedId;

  @override
  State<_BrandSheet> createState() => _BrandSheetState();
}

class _BrandSheetState extends State<_BrandSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final q = _query.trim().toLowerCase();
    final matches = widget.brands
        .where((b) => q.isEmpty || b.name.toLowerCase().contains(q))
        .toList();
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, controller) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TekaSpacing.md, TekaSpacing.md, TekaSpacing.xs, 0),
          child: Row(children: [
            Expanded(
                child: Text('Choisir une marque', style: theme.titleLarge)),
            IconButton(
              tooltip: 'Fermer',
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(context),
            ),
          ]),
        ),
        if (widget.brands.length > 6)
          Padding(
            padding: const EdgeInsets.fromLTRB(
                TekaSpacing.md, TekaSpacing.xs, TekaSpacing.md, TekaSpacing.xs),
            child: TextField(
              autofocus: false,
              decoration: const InputDecoration(
                hintText: 'Rechercher une marque…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        const Divider(height: 1),
        Expanded(
          child: ListView(controller: controller, children: [
            if (q.isEmpty)
              ListTile(
                leading: const Icon(Icons.label_off_outlined),
                title: const Text('Sans marque'),
                subtitle: const Text('Produit artisanal ou sans marque'),
                selected: widget.selectedId == null,
                trailing: widget.selectedId == null
                    ? const Icon(Icons.check, color: TekaColors.success)
                    : null,
                onTap: () => Navigator.pop(context, const _BrandChoice(null)),
              ),
            if (matches.isEmpty)
              Padding(
                padding: const EdgeInsets.all(TekaSpacing.xl),
                child: Text(
                  'Aucune marque pour « ${_query.trim()} ». Choisissez « Autre » si elle n’est pas proposée.',
                  textAlign: TextAlign.center,
                  style: theme.bodyMedium
                      ?.copyWith(color: TekaColors.mutedForeground),
                ),
              ),
            for (final b in matches)
              ListTile(
                title: Text(b.name),
                selected: widget.selectedId == b.id,
                trailing: widget.selectedId == b.id
                    ? const Icon(Icons.check, color: TekaColors.success)
                    : null,
                onTap: () => Navigator.pop(context, _BrandChoice(b.id)),
              ),
          ]),
        ),
      ]),
    );
  }
}
