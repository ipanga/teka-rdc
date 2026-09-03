import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/attribute_model.dart';
import '../../data/models/brand_option_model.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import '../widgets/category_selector.dart';
import '../widgets/dynamic_attribute_field.dart';
import '../widgets/product_image_manager.dart';

class ProductFormScreen extends ConsumerStatefulWidget {
  final SellerProductModel? product;

  const ProductFormScreen({super.key, this.product});

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _titleFrController;
  late final TextEditingController _descriptionFrController;
  late final TextEditingController _priceCDFController;
  late final TextEditingController _priceUSDController;
  late final TextEditingController _discountPriceCDFController;
  late final TextEditingController _quantityController;

  String? _selectedCategoryId;
  // Deprecated as a seller choice (2026-07-28) — new products only. Still
  // submitted so the API contract is unchanged.
  static const ProductCondition _condition = ProductCondition.newItem;
  bool _isSaving = false;

  List<AttributeModel> _attributes = [];
  bool _isLoadingAttributes = false;
  final Map<String, String> _specValues = {};

  String? _brandId;
  List<BrandOption> _brands = [];

  bool get _isEditing => widget.product != null;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _titleFrController = TextEditingController(text: p?.title ?? '');
    _descriptionFrController =
        TextEditingController(text: p?.description ?? '');
    _priceCDFController = TextEditingController(
      text: p != null ? p.priceCDFDisplay.toString() : '',
    );
    _priceUSDController = TextEditingController(
      text: p?.priceUSDDisplay != null
          ? p!.priceUSDDisplay!.toStringAsFixed(2)
          : '',
    );
    _discountPriceCDFController = TextEditingController(
      text: p?.discountPriceCDFDisplay != null
          ? p!.discountPriceCDFDisplay!.toString()
          : '',
    );
    _quantityController = TextEditingController(
      text: p?.quantity.toString() ?? '',
    );
    _selectedCategoryId = p?.categoryId;
    _brandId = p?.brandId;

    // Initialize spec values from existing product
    if (p != null && p.specifications.isNotEmpty) {
      for (final spec in p.specifications) {
        if (spec.attributeId != null) {
          _specValues[spec.attributeId!] = spec.value;
        }
      }
    }

    // Load attributes + brands if editing and category is set
    if (_selectedCategoryId != null) {
      _loadAttributes(_selectedCategoryId!);
      _loadBrands(_selectedCategoryId!);
    }
  }

  Future<void> _loadBrands(String categoryId) async {
    try {
      final repository = ref.read(productsRepositoryProvider);
      final brands = await repository.getBrands(categoryId);
      if (mounted) {
        setState(() {
          _brands = brands;
          // Drop a stale selection that isn't offered in this category.
          if (_brandId != null && !brands.any((b) => b.id == _brandId)) {
            _brandId = null;
          }
        });
      }
    } catch (_) {
      if (mounted) setState(() => _brands = []);
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
    _descriptionFrController.dispose();
    _priceCDFController.dispose();
    _priceUSDController.dispose();
    _discountPriceCDFController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? "Modifier le produit" : "Nouveau produit"),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Published-product edit notice (parity with seller-web): pricing &
            // stock apply instantly, content edits are sent back to review.
            if (_isEditing &&
                widget.product?.status == ProductStatus.active) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: TekaColors.tekaRed.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: TekaColors.tekaRed.withValues(alpha: 0.25)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline,
                        size: 18, color: TekaColors.tekaRed),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "Produit publié : le prix, le prix promotionnel et le "
                        "stock sont mis à jour instantanément. Toute "
                        "modification du contenu (titre, description, "
                        "catégorie…) sera renvoyée en révision.",
                        style: const TextStyle(fontSize: 12.5, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Images — inline management on the edit path (parity with
            // seller-web). On create the product has no id yet, so images are
            // added after the first save via the detail screen.
            if (_isEditing) ...[
              Text(
                "Images",
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                "Ajoutez au moins une image. La première sert de couverture.",
                style: const TextStyle(
                  fontSize: 12.5,
                  color: TekaColors.mutedForeground,
                ),
              ),
              const SizedBox(height: 12),
              ProductImageManager(productId: widget.product!.id),
              const SizedBox(height: 24),
            ],

            // Category
            CategorySelector(
              selectedCategoryId: _selectedCategoryId,
              onCategorySelected: (cat) {
                setState(() {
                  _selectedCategoryId = cat.id;
                  _specValues.clear();
                  _attributes = [];
                  _brandId = null;
                  _brands = [];
                });
                _loadAttributes(cat.id);
                _loadBrands(cat.id);
              },
            ),
            const SizedBox(height: 16),

            // Brand (scoped to the chosen subcategory; hidden if none offered)
            if (_brands.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                initialValue: _brandId,
                decoration: InputDecoration(labelText: "Marque"),
                hint: Text("Sélectionner une marque"),
                items: [
                  DropdownMenuItem<String>(
                    value: null,
                    child: Text("Sans marque"),
                  ),
                  ..._brands.map(
                    (b) => DropdownMenuItem(value: b.id, child: Text(b.name)),
                  ),
                ],
                onChanged: (v) => setState(() => _brandId = v),
              ),
              const SizedBox(height: 16),
            ],

            // Title (French — platform is monolingual since May 2026)
            TextFormField(
              controller: _titleFrController,
              decoration: InputDecoration(
                labelText: "Titre (français)",
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? "Titre requis" : null,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),

            // Description (French)
            TextFormField(
              controller: _descriptionFrController,
              decoration: InputDecoration(
                labelText: "Description (français)",
                alignLabelWithHint: true,
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
                      labelText: "Prix FC",
                      suffixText: 'FC',
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return "Prix FC requis";
                      }
                      final amount = int.tryParse(v);
                      if (amount == null || amount <= 0) {
                        return "Prix FC invalide";
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
                      labelText: "Prix USD",
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

            // Promotional price (optional)
            TextFormField(
              controller: _discountPriceCDFController,
              decoration: InputDecoration(
                labelText: "Prix promotionnel FC (optionnel)",
                suffixText: 'FC',
                helperText: _discountPreview(),
                helperStyle: const TextStyle(color: TekaColors.success),
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => setState(() {}),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return null;
                final d = int.tryParse(v.trim());
                if (d == null || d <= 0) return "Prix promotionnel invalide";
                final p = int.tryParse(_priceCDFController.text.trim());
                if (p != null && d >= p) {
                  return "Doit être inférieur au prix normal";
                }
                return null;
              },
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 16),

            // Quantity
            TextFormField(
              controller: _quantityController,
              decoration: InputDecoration(
                labelText: "Quantité",
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return "Quantité requise";
                }
                final qty = int.tryParse(v);
                if (qty == null || qty < 0) {
                  return "Quantité invalide";
                }
                return null;
              },
              textInputAction: TextInputAction.done,
            ),
            const SizedBox(height: 16),

            // The Neuf / Occasion selector was removed 2026-07-28: Teka
            // accepts new products only, so the choice was misleading.
            // `condition` is still submitted as NEW so the API contract is
            // unchanged — see docs/product-condition-deprecation.md.

            // Dynamic Attributes
            if (_isLoadingAttributes)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_attributes.isNotEmpty) ...[
              Text(
                "Caractéristiques du produit",
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
                  "Aucune caractéristique pour cette catégorie",
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
                    : Text("Enregistrer"),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  /// Live "-X% · Vous économisez Y FC" helper text under the promo field.
  String? _discountPreview() {
    final p = int.tryParse(_priceCDFController.text.trim());
    final d = int.tryParse(_discountPriceCDFController.text.trim());
    if (p == null || d == null || d <= 0 || d >= p) return null;
    final pct = ((p - d) / p * 100).round();
    return "-$pct% · Vous économisez ${formatFcNumber(p - d)} FC";
  }

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategoryId == null) {
      _showSnackBar("Sélectionner une catégorie");
      return;
    }

    setState(() => _isSaving = true);

    try {
      final repository = ref.read(productsRepositoryProvider);

      // API DTOs (create-product.dto.ts, update-product.dto.ts) declare
      // `title: string` and `description: string` — submit plain French.
      final title = _titleFrController.text.trim();
      final description = _descriptionFrController.text.trim();

      // Price in centimes
      final priceCDFAmount = int.parse(_priceCDFController.text.trim());
      final priceCDFCentimes = (priceCDFAmount * 100).toString();

      String? priceUSDCentimes;
      if (_priceUSDController.text.trim().isNotEmpty) {
        final priceUSDAmount = double.parse(_priceUSDController.text.trim());
        priceUSDCentimes = (priceUSDAmount * 100).round().toString();
      }

      // Promotional price (optional). On edit, send null to clear it.
      final discountText = _discountPriceCDFController.text.trim();
      final String? discountPriceCDFCentimes = discountText.isNotEmpty
          ? (int.parse(discountText) * 100).toString()
          : null;

      final data = <String, dynamic>{
        'title': title,
        'description': description,
        'categoryId': _selectedCategoryId,
        // null clears the brand on edit; omitted-as-null is fine on create.
        'brandId': _brandId,
        'priceCDF': priceCDFCentimes,
        'quantity': int.parse(_quantityController.text.trim()),
        'condition': productConditionToApi(_condition),
      };
      if (priceUSDCentimes != null) {
        data['priceUSD'] = priceUSDCentimes;
      }
      // Always include on edit (null clears the promo); on create, only when set.
      if (_isEditing || discountPriceCDFCentimes != null) {
        data['discountPriceCDF'] = discountPriceCDFCentimes;
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
        if (mounted) _showSnackBar("Produit mis à jour");
      } else {
        result = await repository.createProduct(data);
        if (mounted) _showSnackBar("Produit créé avec succès");
      }

      // Refresh products list
      ref.read(sellerProductsProvider.notifier).loadProducts();

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
        _showSnackBar("Une erreur est survenue. Veuillez réessayer.");
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

