import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/attribute_model.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import '../widgets/category_selector.dart';
import '../widgets/dynamic_attribute_field.dart';

class ProductFormScreen extends ConsumerStatefulWidget {
  final SellerProductModel? product;

  const ProductFormScreen({super.key, this.product});

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _titleFrController;
  late final TextEditingController _titleEnController;
  late final TextEditingController _descriptionFrController;
  late final TextEditingController _descriptionEnController;
  late final TextEditingController _priceCDFController;
  late final TextEditingController _priceUSDController;
  late final TextEditingController _quantityController;

  String? _selectedCategoryId;
  ProductCondition _condition = ProductCondition.newItem;
  bool _isSaving = false;

  List<AttributeModel> _attributes = [];
  bool _isLoadingAttributes = false;
  final Map<String, String> _specValues = {};

  bool get _isEditing => widget.product != null;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _titleFrController = TextEditingController(text: p?.title['fr'] ?? '');
    _titleEnController = TextEditingController(text: p?.title['en'] ?? '');
    _descriptionFrController =
        TextEditingController(text: p?.description['fr'] ?? '');
    _descriptionEnController =
        TextEditingController(text: p?.description['en'] ?? '');
    _priceCDFController = TextEditingController(
      text: p != null ? p.priceCDFDisplay.toString() : '',
    );
    _priceUSDController = TextEditingController(
      text: p?.priceUSDDisplay != null
          ? p!.priceUSDDisplay!.toStringAsFixed(2)
          : '',
    );
    _quantityController = TextEditingController(
      text: p?.quantity.toString() ?? '',
    );
    _selectedCategoryId = p?.categoryId;
    _condition = p?.condition ?? ProductCondition.newItem;

    // Initialize spec values from existing product
    if (p != null && p.specifications.isNotEmpty) {
      for (final spec in p.specifications) {
        if (spec.attributeId != null) {
          _specValues[spec.attributeId!] = spec.value;
        }
      }
    }

    // Load attributes if editing and category is set
    if (_selectedCategoryId != null) {
      _loadAttributes(_selectedCategoryId!);
    }
  }

  Future<void> _loadAttributes(String categoryId) async {
    setState(() => _isLoadingAttributes = true);
    try {
      final repository = ref.read(productsRepositoryProvider);
      final attrs = await repository.getCategoryAttributes(categoryId);
      if (mounted) {
        setState(() {
          _attributes = attrs;
          _isLoadingAttributes = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _attributes = [];
          _isLoadingAttributes = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _titleFrController.dispose();
    _titleEnController.dispose();
    _descriptionFrController.dispose();
    _descriptionEnController.dispose();
    _priceCDFController.dispose();
    _priceUSDController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? l10n.editProduct : l10n.newProduct),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Category
            CategorySelector(
              selectedCategoryId: _selectedCategoryId,
              onCategorySelected: (cat) {
                setState(() {
                  _selectedCategoryId = cat.id;
                  _specValues.clear();
                  _attributes = [];
                });
                _loadAttributes(cat.id);
              },
            ),
            const SizedBox(height: 16),

            // Title FR
            TextFormField(
              controller: _titleFrController,
              decoration: InputDecoration(
                labelText: l10n.titleFr,
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? l10n.titleFr : null,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Title EN (optional)
            TextFormField(
              controller: _titleEnController,
              decoration: InputDecoration(
                labelText: l10n.titleEn,
                hintText: '(${l10n.titleEn})',
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),

            // Description FR
            TextFormField(
              controller: _descriptionFrController,
              decoration: InputDecoration(
                labelText: l10n.descriptionFr,
                alignLabelWithHint: true,
              ),
              maxLines: 4,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Description EN
            TextFormField(
              controller: _descriptionEnController,
              decoration: InputDecoration(
                labelText: l10n.descriptionEn,
                alignLabelWithHint: true,
                hintText: '(${l10n.descriptionEn})',
              ),
              maxLines: 4,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),

            // Prices
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _priceCDFController,
                    decoration: InputDecoration(
                      labelText: l10n.priceCDF,
                      suffixText: 'CDF',
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return l10n.priceCDF;
                      }
                      final amount = int.tryParse(v);
                      if (amount == null || amount <= 0) {
                        return l10n.priceCDF;
                      }
                      return null;
                    },
                    textInputAction: TextInputAction.next,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _priceUSDController,
                    decoration: InputDecoration(
                      labelText: l10n.priceUSD,
                      suffixText: 'USD',
                    ),
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textInputAction: TextInputAction.next,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Quantity
            TextFormField(
              controller: _quantityController,
              decoration: InputDecoration(
                labelText: l10n.quantity,
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return l10n.quantity;
                }
                final qty = int.tryParse(v);
                if (qty == null || qty < 0) {
                  return l10n.quantity;
                }
                return null;
              },
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: 16),

            // Condition
            Text(
              l10n.condition,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ConditionOption(
                    label: l10n.conditionNew,
                    icon: Icons.new_releases_outlined,
                    isSelected: _condition == ProductCondition.newItem,
                    onTap: () =>
                        setState(() => _condition = ProductCondition.newItem),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _ConditionOption(
                    label: l10n.conditionUsed,
                    icon: Icons.recycling,
                    isSelected: _condition == ProductCondition.used,
                    onTap: () =>
                        setState(() => _condition = ProductCondition.used),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Dynamic Attributes
            if (_isLoadingAttributes)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_attributes.isNotEmpty) ...[
              Text(
                l10n.productAttributes,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
              ),
              const SizedBox(height: 8),
              ..._attributes.map((attr) {
                final locale = Localizations.localeOf(context).languageCode;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DynamicAttributeField(
                    attribute: attr,
                    value: _specValues[attr.id] ?? '',
                    locale: locale,
                    onChanged: (v) {
                      setState(() {
                        if (v.isEmpty) {
                          _specValues.remove(attr.id);
                        } else {
                          _specValues[attr.id] = v;
                        }
                      });
                    },
                  ),
                );
              }),
            ] else if (_selectedCategoryId != null && !_isLoadingAttributes)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  l10n.noAttributes,
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 14,
                  ),
                ),
              ),

            const SizedBox(height: 24),

            // Save button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _handleSave,
                child: _isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l10n.save),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategoryId == null) {
      _showSnackBar(AppLocalizations.of(context)!.selectCategory);
      return;
    }

    setState(() => _isSaving = true);

    try {
      final l10n = AppLocalizations.of(context)!;
      final repository = ref.read(productsRepositoryProvider);

      // Build title map
      final title = <String, String>{'fr': _titleFrController.text.trim()};
      if (_titleEnController.text.trim().isNotEmpty) {
        title['en'] = _titleEnController.text.trim();
      }

      // Build description map
      final description = <String, String>{
        'fr': _descriptionFrController.text.trim()
      };
      if (_descriptionEnController.text.trim().isNotEmpty) {
        description['en'] = _descriptionEnController.text.trim();
      }

      // Price in centimes
      final priceCDFAmount = int.parse(_priceCDFController.text.trim());
      final priceCDFCentimes = (priceCDFAmount * 100).toString();

      String? priceUSDCentimes;
      if (_priceUSDController.text.trim().isNotEmpty) {
        final priceUSDAmount = double.parse(_priceUSDController.text.trim());
        priceUSDCentimes = (priceUSDAmount * 100).round().toString();
      }

      final data = <String, dynamic>{
        'title': title,
        'description': description,
        'categoryId': _selectedCategoryId,
        'priceCDF': priceCDFCentimes,
        'quantity': int.parse(_quantityController.text.trim()),
        'condition': productConditionToApi(_condition),
      };
      if (priceUSDCentimes != null) {
        data['priceUSD'] = priceUSDCentimes;
      }

      // Add specifications
      final specs = _specValues.entries
          .where((e) => e.value.trim().isNotEmpty)
          .map((e) => {'attributeId': e.key, 'value': e.value})
          .toList();
      if (specs.isNotEmpty) {
        data['specifications'] = specs;
      }

      SellerProductModel result;
      if (_isEditing) {
        result = await repository.updateProduct(widget.product!.id, data);
        if (mounted) _showSnackBar(l10n.productUpdated);
      } else {
        result = await repository.createProduct(data);
        if (mounted) _showSnackBar(l10n.productCreated);
      }

      // Refresh products list
      ref.invalidate(sellerProductsProvider);

      if (mounted) {
        if (_isEditing) {
          // Invalidate the detail provider to refresh
          ref.invalidate(productDetailProvider(widget.product!.id));
          context.pop();
        } else {
          // Navigate to detail screen for image upload
          context.go('/products/${result.id}');
        }
      }
    } catch (e) {
      if (mounted) {
        _showSnackBar(AppLocalizations.of(context)!.authGenericError);
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }
}

class _ConditionOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _ConditionOption({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? TekaColors.tekaRed : TekaColors.border,
            width: isSelected ? 2 : 1,
          ),
          color: isSelected
              ? TekaColors.tekaRed.withValues(alpha: 0.05)
              : Colors.transparent,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 20,
              color: isSelected ? TekaColors.tekaRed : TekaColors.mutedForeground,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected ? TekaColors.tekaRed : TekaColors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
