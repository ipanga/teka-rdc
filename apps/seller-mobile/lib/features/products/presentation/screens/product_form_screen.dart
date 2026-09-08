import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/models/attribute_model.dart';
import '../../data/models/brand_option_model.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';
import '../widgets/brand_selector.dart';
import '../widgets/category_selector.dart';
import '../widgets/dynamic_attribute_field.dart';
import '../widgets/product_image_manager.dart';

/// Create / edit form (Seller UX PR D, 2026-09-08). Sections in the order a
/// seller thinks: photos (edit only — the API needs a product id before it
/// can hold images, so a new product gets its photos right after the first
/// save), what it is, where it belongs (category → brand → characteristics
/// follow the category), what it costs, how many are in stock.
///
/// Business rules are the API's and unchanged: leaf category only when the
/// category changes (legacy products keep theirs), brand relevance per
/// product type, promo strictly below the price, quantity ≥ 0, condition
/// always NEW (`docs/product-condition-deprecation.md`).
class ProductFormScreen extends ConsumerStatefulWidget {
  final SellerProductModel? product;

  const ProductFormScreen({super.key, this.product});

  @override
  ConsumerState<ProductFormScreen> createState() => _ProductFormScreenState();
}

/// Resolves an edit route from its URL even after a cold start or deep link.
/// [initialProduct] keeps normal in-app navigation instant, while the provider
/// supplies the same form when GoRouter has no transient `extra` payload.
class ProductEditScreen extends ConsumerWidget {
  final String productId;
  final SellerProductModel? initialProduct;

  const ProductEditScreen({
    super.key,
    required this.productId,
    this.initialProduct,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initialProduct != null) {
      return ProductFormScreen(product: initialProduct);
    }
    return ref.watch(productDetailProvider(productId)).when(
          loading: () => Scaffold(
            appBar: AppBar(title: const Text('Modifier le produit')),
            body: const ProductFormSkeleton(),
          ),
          error: (error, _) => Scaffold(
            appBar: AppBar(title: const Text('Modifier le produit')),
            body: SellerListState(
              child: SellerListMessage(
                icon: Icons.cloud_off_outlined,
                title: 'Impossible de charger ce produit',
                message: friendlyErrorMessage(error),
                actionLabel: 'Réessayer',
                onAction: () =>
                    ref.invalidate(productDetailProvider(productId)),
              ),
            ),
          ),
          data: (product) => ProductFormScreen(product: product),
        );
  }
}

class _ProductFormScreenState extends ConsumerState<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _categoryKey = GlobalKey();

  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _priceCDFController;
  late final TextEditingController _priceUSDController;
  late final TextEditingController _discountPriceCDFController;
  late final TextEditingController _quantityController;

  String? _selectedCategoryId;
  // Deprecated as a seller choice (2026-07-28) — new products only. Still
  // submitted so the API contract is unchanged.
  static const ProductCondition _condition = ProductCondition.newItem;
  bool _isSaving = false;
  bool _submitted = false;
  String? _categoryError;

  List<AttributeModel> _attributes = [];
  bool _isLoadingAttributes = false;
  String? _attributesError;
  final Map<String, String> _specValues = {};

  String? _brandId;
  List<BrandOption> _brands = [];
  bool _isLoadingBrands = false;
  String? _brandsError;
  int _categoryGeneration = 0;

  bool get _isEditing => widget.product != null;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    _titleController = TextEditingController(text: p?.title ?? '');
    _descriptionController = TextEditingController(text: p?.description ?? '');
    _priceCDFController = TextEditingController(
        text: p != null ? p.priceCDFDisplay.toString() : '');
    _priceUSDController = TextEditingController(
        text: p?.priceUSDDisplay != null
            ? p!.priceUSDDisplay!.toStringAsFixed(2)
            : '');
    _discountPriceCDFController = TextEditingController(
        text: p?.discountPriceCDFDisplay != null
            ? p!.discountPriceCDFDisplay!.toString()
            : '');
    _quantityController =
        TextEditingController(text: p?.quantity.toString() ?? '');
    _selectedCategoryId = p?.categoryId;
    _brandId = p?.brandId;

    if (p != null && p.specifications.isNotEmpty) {
      for (final spec in p.specifications) {
        if (spec.attributeId != null) {
          _specValues[spec.attributeId!] = spec.value;
        }
      }
    }

    if (_selectedCategoryId != null) {
      _loadAttributes(_selectedCategoryId!);
      _loadBrands(_selectedCategoryId!);
    }
  }

  Future<void> _loadBrands(String categoryId) async {
    final generation = _categoryGeneration;
    if (mounted) {
      setState(() {
        _isLoadingBrands = true;
        _brandsError = null;
      });
    }
    try {
      final brands =
          await ref.read(productsRepositoryProvider).getBrands(categoryId);
      if (mounted &&
          generation == _categoryGeneration &&
          _selectedCategoryId == categoryId) {
        setState(() {
          _brands = brands;
          _isLoadingBrands = false;
          // Drop a stale selection that isn't offered in this category.
          if (_brandId != null && !brands.any((b) => b.id == _brandId)) {
            _brandId = null;
          }
        });
      }
    } catch (_) {
      if (mounted &&
          generation == _categoryGeneration &&
          _selectedCategoryId == categoryId) {
        setState(() {
          _brands = [];
          _isLoadingBrands = false;
          _brandsError = 'Impossible de charger les marques.';
        });
      }
    }
  }

  Future<void> _loadAttributes(String categoryId) async {
    final generation = _categoryGeneration;
    setState(() {
      _isLoadingAttributes = true;
      _attributesError = null;
    });
    try {
      final attrs = await ref
          .read(productsRepositoryProvider)
          .getCategoryAttributes(categoryId);
      if (mounted &&
          generation == _categoryGeneration &&
          _selectedCategoryId == categoryId) {
        setState(() {
          _attributes = attrs;
          _isLoadingAttributes = false;
        });
      }
    } catch (_) {
      if (mounted &&
          generation == _categoryGeneration &&
          _selectedCategoryId == categoryId) {
        setState(() {
          _attributes = [];
          _isLoadingAttributes = false;
          _attributesError = 'Impossible de charger les caractéristiques.';
        });
      }
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _priceCDFController.dispose();
    _priceUSDController.dispose();
    _discountPriceCDFController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  /// Legacy products can sit on a node the taxonomy no longer offers as a
  /// leaf (an intermediate category, or a deactivated one). The API accepts
  /// saving them unchanged and refuses a NEW choice that is not a leaf, so
  /// the form only warns — it never guesses a child.
  String? _categoryWarning() {
    final id = _selectedCategoryId;
    if (id == null) return null;
    final tree = ref.watch(categoriesProvider).valueOrNull;
    if (tree == null) return null;
    CategoryModel? find(List<CategoryModel> nodes) {
      for (final n in nodes) {
        if (n.id == id) return n;
        final r = find(n.subcategories);
        if (r != null) return r;
      }
      return null;
    }

    final node = find(tree);
    if (node == null) {
      return 'Cette catégorie n’est plus proposée. Choisissez un type de produit précis avant d’enregistrer.';
    }
    if (node.subcategories.isNotEmpty) {
      return '« ${node.name} » est une catégorie générale. Choisissez un type de produit précis pour afficher les bonnes caractéristiques.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final categoryWarning = _categoryWarning();

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Modifier le produit' : 'Nouveau produit'),
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: Form(
          key: _formKey,
          autovalidateMode: _submitted
              ? AutovalidateMode.onUserInteraction
              : AutovalidateMode.disabled,
          // A Column, not a lazy ListView: `FormState.validate()` only
          // reaches BUILT fields, so a lazily built form let an off-screen
          // empty description through to the API (found at runtime, PR D).
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(TekaSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_isEditing &&
                    widget.product?.status == ProductStatus.active) ...[
                  _Notice(
                    icon: Icons.info_outline,
                    text:
                        'Produit en ligne : le prix, la promotion et le stock sont mis à jour immédiatement. Toute modification du contenu (titre, description, catégorie…) repasse en révision.',
                  ),
                  const SizedBox(height: TekaSpacing.md),
                ],
                if (!_isEditing) ...[
                  _Notice(
                    icon: Icons.photo_camera_outlined,
                    text:
                        'Les photos s’ajoutent à l’étape suivante, une fois la fiche enregistrée.',
                  ),
                  const SizedBox(height: TekaSpacing.md),
                ],
                if (_isEditing) ...[
                  const _SectionHeader(
                      title: 'Photos',
                      subtitle: 'Au moins une photo, 8 au plus.'),
                  ProductImageManager(productId: widget.product!.id),
                  const SizedBox(height: TekaSpacing.xl),
                ],

                // --- What it is
                const _SectionHeader(title: 'Informations'),
                TextFormField(
                  controller: _titleController,
                  decoration: const InputDecoration(
                    labelText: 'Titre',
                    helperText: 'Ex. : Chemise homme en lin, blanche',
                  ),
                  textCapitalization: TextCapitalization.sentences,
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Titre requis' : null,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: TekaSpacing.md),
                TextFormField(
                  controller: _descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    helperText:
                        'Matière, dimensions, contenu de la boîte, garantie…',
                    alignLabelWithHint: true,
                  ),
                  textCapitalization: TextCapitalization.sentences,
                  minLines: 3,
                  maxLines: 8,
                  // The API requires it (« La description est requise »); found
                  // at runtime in PR D — the form used to let it through and
                  // the seller only learnt on save.
                  validator: (v) => v == null || v.trim().isEmpty
                      ? 'Description requise'
                      : null,
                  textInputAction: TextInputAction.newline,
                ),
                const SizedBox(height: TekaSpacing.xl),

                // --- Where it belongs
                const _SectionHeader(
                    title: 'Catégorie et marque',
                    subtitle:
                        'Les caractéristiques et les marques dépendent du type de produit choisi.'),
                KeyedSubtree(
                  key: _categoryKey,
                  child: CategorySelector(
                    selectedCategoryId: _selectedCategoryId,
                    onCategorySelected: (cat) {
                      setState(() {
                        _categoryGeneration++;
                        _selectedCategoryId = cat.id;
                        _categoryError = null;
                        _specValues.clear();
                        _attributes = [];
                        _brandId = null;
                        _brands = [];
                        _brandsError = null;
                        _attributesError = null;
                      });
                      _loadAttributes(cat.id);
                      _loadBrands(cat.id);
                    },
                  ),
                ),
                if (_categoryError != null)
                  Padding(
                    padding: const EdgeInsets.only(
                        top: TekaSpacing.xs, left: TekaSpacing.sm),
                    child: Text(_categoryError!,
                        style: theme.bodySmall?.copyWith(
                            color: TekaColors.destructiveForeground)),
                  )
                else if (categoryWarning != null)
                  Padding(
                    padding: const EdgeInsets.only(top: TekaSpacing.xs),
                    child: _Notice(
                        icon: Icons.warning_amber_rounded,
                        tone: TekaColors.warningForeground,
                        text: categoryWarning),
                  ),
                const SizedBox(height: TekaSpacing.md),
                if (_isLoadingBrands)
                  const _LoadingLines(label: 'Chargement des marques')
                else if (_brandsError != null)
                  _InlineLoadError(
                    message: _brandsError!,
                    onRetry: () => _loadBrands(_selectedCategoryId!),
                  )
                else if (_brands.isNotEmpty)
                  BrandSelector(
                    brands: _brands,
                    selectedId: _brandId,
                    onSelected: (id) => setState(() => _brandId = id),
                  )
                else if (_selectedCategoryId != null)
                  Text('Aucune marque n’est proposée pour ce type de produit.',
                      style: theme.bodySmall
                          ?.copyWith(color: TekaColors.mutedForeground)),
                const SizedBox(height: TekaSpacing.xl),

                // --- Characteristics follow the category
                const _SectionHeader(
                    title: 'Caractéristiques',
                    subtitle: 'Selon le type de produit. * = obligatoire.'),
                if (_selectedCategoryId == null)
                  Text('Choisissez d’abord une catégorie.',
                      style: theme.bodySmall
                          ?.copyWith(color: TekaColors.mutedForeground))
                else if (_isLoadingAttributes)
                  const _LoadingLines(label: 'Chargement des caractéristiques')
                else if (_attributesError != null)
                  _InlineLoadError(
                    message: _attributesError!,
                    onRetry: () => _loadAttributes(_selectedCategoryId!),
                  )
                else if (_attributes.isNotEmpty)
                  for (final attr in _attributes)
                    Padding(
                      padding: const EdgeInsets.only(bottom: TekaSpacing.sm),
                      child: DynamicAttributeField(
                        attribute: attr,
                        value: _specValues[attr.id] ?? '',
                        locale: 'fr',
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
                    )
                else
                  Text('Aucune caractéristique pour cette catégorie',
                      style: theme.bodySmall
                          ?.copyWith(color: TekaColors.mutedForeground)),
                const SizedBox(height: TekaSpacing.xl),

                // --- Price
                const _SectionHeader(
                    title: 'Prix',
                    subtitle:
                        'En francs congolais ; le prix en dollars est facultatif.'),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final stack = constraints.maxWidth < 420 ||
                        MediaQuery.textScalerOf(context).scale(1) > 1.3;
                    final cdf = TextFormField(
                      controller: _priceCDFController,
                      decoration: InputDecoration(
                        labelText: 'Prix FC',
                        suffixText: 'FC',
                        helperText: _fcPreview(_priceCDFController.text),
                      ),
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Prix FC requis';
                        }
                        final amount = int.tryParse(v);
                        if (amount == null || amount <= 0) {
                          return 'Prix FC invalide';
                        }
                        return null;
                      },
                      textInputAction: TextInputAction.next,
                    );
                    final usd = TextFormField(
                      controller: _priceUSDController,
                      decoration: const InputDecoration(
                        labelText: 'Prix USD',
                        suffixText: 'USD',
                        helperText: 'Facultatif',
                      ),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return null;
                        final amount =
                            double.tryParse(v.trim().replaceAll(',', '.'));
                        return amount == null || amount <= 0
                            ? 'Prix USD invalide'
                            : null;
                      },
                      textInputAction: TextInputAction.next,
                    );
                    if (stack) {
                      return Column(children: [
                        cdf,
                        const SizedBox(height: TekaSpacing.md),
                        usd
                      ]);
                    }
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: cdf),
                        const SizedBox(width: TekaSpacing.sm),
                        Expanded(child: usd),
                      ],
                    );
                  },
                ),
                const SizedBox(height: TekaSpacing.md),
                TextFormField(
                  controller: _discountPriceCDFController,
                  decoration: InputDecoration(
                    labelText: 'Prix promotionnel FC',
                    suffixText: 'FC',
                    helperMaxLines: 2,
                    helperText: _discountPreview() ??
                        'Facultatif. Doit être inférieur au prix FC.',
                    helperStyle: _discountPreview() != null
                        ? const TextStyle(color: TekaColors.successForeground)
                        : null,
                  ),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return null;
                    final d = int.tryParse(v.trim());
                    if (d == null || d <= 0) {
                      return 'Prix promotionnel invalide';
                    }
                    final p = int.tryParse(_priceCDFController.text.trim());
                    if (p != null && d >= p) {
                      return 'Doit être inférieur au prix normal';
                    }
                    return null;
                  },
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: TekaSpacing.xl),

                // --- Stock
                const _SectionHeader(title: 'Stock'),
                TextFormField(
                  controller: _quantityController,
                  decoration: const InputDecoration(
                    labelText: 'Quantité disponible',
                    helperText:
                        '0 = rupture de stock : les acheteurs ne peuvent plus commander.',
                    helperMaxLines: 2,
                  ),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) {
                      return 'Quantité requise';
                    }
                    final qty = int.tryParse(v);
                    if (qty == null || qty < 0) return 'Quantité invalide';
                    return null;
                  },
                  textInputAction: TextInputAction.done,
                ),
                const SizedBox(height: TekaSpacing.xl),

                // The Neuf / Occasion selector was removed 2026-07-28: Teka
                // accepts new products only. `condition` is still submitted as
                // NEW — see docs/product-condition-deprecation.md.

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSaving ? null : _handleSave,
                    style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            vertical: TekaSpacing.sm)),
                    child: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : Text(_isEditing
                            ? 'Enregistrer les modifications'
                            : 'Enregistrer et ajouter des photos'),
                  ),
                ),
                const SizedBox(height: TekaSpacing.md),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// « 45.000 FC » under the price as the seller types.
  String? _fcPreview(String raw) {
    final p = int.tryParse(raw.trim());
    if (p == null || p <= 0) return 'Sans centimes. Ex. : 45000';
    return '${formatFcNumber(p)} FC';
  }

  /// Live « −X % · Vous économisez Y FC » helper under the promo field.
  String? _discountPreview() {
    final p = int.tryParse(_priceCDFController.text.trim());
    final d = int.tryParse(_discountPriceCDFController.text.trim());
    if (p == null || d == null || d <= 0 || d >= p) return null;
    final pct = ((p - d) / p * 100).round();
    return '−$pct % · Vous économisez ${formatFcNumber(p - d)} FC';
  }

  Future<void> _handleSave() async {
    if (_isSaving) return;
    setState(() => _submitted = true);
    final fieldsOk = _formKey.currentState!.validate();
    if (_selectedCategoryId == null) {
      setState(() => _categoryError = 'Choisissez un type de produit.');
      final ctx = _categoryKey.currentContext;
      if (ctx != null) {
        await Scrollable.ensureVisible(ctx,
            duration: const Duration(milliseconds: 250), alignment: 0.1);
      }
      return;
    }
    if (!fieldsOk) {
      showAppSnackbar(context,
          message: 'Corrigez les champs signalés en rouge.',
          tone: AppSnackbarTone.warning);
      return;
    }

    setState(() => _isSaving = true);

    try {
      final repository = ref.read(productsRepositoryProvider);
      final title = _titleController.text.trim();
      final description = _descriptionController.text.trim();

      final priceCDFAmount = int.parse(_priceCDFController.text.trim());
      final priceCDFCentimes = (priceCDFAmount * 100).toString();

      String? priceUSDCentimes;
      if (_priceUSDController.text.trim().isNotEmpty) {
        final priceUSDAmount =
            double.parse(_priceUSDController.text.trim().replaceAll(',', '.'));
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
      } else {
        result = await repository.createProduct(data);
      }

      ref.read(sellerProductsProvider.notifier).loadProducts();

      if (!mounted) return;
      if (_isEditing) {
        ref.invalidate(productDetailProvider(widget.product!.id));
        showAppSnackbar(context,
            message: result.status == ProductStatus.pendingReview &&
                    widget.product!.status == ProductStatus.active
                ? 'Modifications enregistrées. Le contenu repasse en révision.'
                : 'Modifications enregistrées.',
            tone: AppSnackbarTone.success);
        context.pop();
      } else {
        showAppSnackbar(context,
            message:
                'Fiche enregistrée en brouillon. Ajoutez maintenant vos photos.',
            tone: AppSnackbarTone.success);
        // Navigate to the detail for image upload (stack replaced on
        // purpose: back from the detail must not reopen an empty form).
        context.go('/products/${result.id}');
      }
    } catch (e) {
      if (mounted) {
        // The API's French reason (intermediate category, inactive category,
        // promo ≥ price…) rather than a generic line; the form keeps its state.
        showAppSnackbar(context,
            message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: TekaSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(header: true, child: Text(title, style: theme.titleMedium)),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(subtitle!,
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.neutralForeground)),
        ],
      ]),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(
      {required this.icon,
      required this.text,
      this.tone = TekaColors.infoForeground});
  final IconData icon;
  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(TekaSpacing.sm),
        decoration: BoxDecoration(
          color: Color.alphaBlend(
              tone.withValues(alpha: 0.08), TekaColors.background),
          borderRadius: TekaRadius.mdAll,
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: tone),
          const SizedBox(width: TekaSpacing.xs),
          Expanded(
              child: Text(text, style: Theme.of(context).textTheme.bodySmall)),
        ]),
      );
}

/// Static placeholder lines while brands / characteristics load for the
/// chosen category (no spinner, announced once).
class _LoadingLines extends StatelessWidget {
  const _LoadingLines({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        liveRegion: true,
        child: const ExcludeSemantics(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SkeletonBlock(width: double.infinity, height: 48),
            SizedBox(height: TekaSpacing.xs),
            SkeletonBlock(width: 180, height: 12),
          ]),
        ),
      );
}

class _InlineLoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _InlineLoadError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.sm, TekaSpacing.xxs, TekaSpacing.xxs, TekaSpacing.xxs),
      decoration: BoxDecoration(
        color: Color.alphaBlend(TekaColors.destructive.withValues(alpha: 0.06),
            TekaColors.background),
        border:
            Border.all(color: TekaColors.destructive.withValues(alpha: 0.25)),
        borderRadius: TekaRadius.mdAll,
      ),
      child: Row(children: [
        const Icon(Icons.cloud_off_outlined,
            color: TekaColors.destructiveForeground, size: 20),
        const SizedBox(width: TekaSpacing.xs),
        Expanded(
            child: Text(message, style: Theme.of(context).textTheme.bodySmall)),
        TextButton(onPressed: onRetry, child: const Text('Réessayer')),
      ]),
    );
  }
}

/// Edit form first paint from a cold route: section titles and field
/// blocks, static.
class ProductFormSkeleton extends StatelessWidget {
  const ProductFormSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Chargement du formulaire',
        liveRegion: true,
        child: ExcludeSemantics(
          child: ReadableColumn(
            padding: EdgeInsets.zero,
            child: ListView(
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.all(TekaSpacing.md),
              children: const [
                SkeletonBlock(width: 120, height: 18),
                SizedBox(height: TekaSpacing.sm),
                Row(children: [
                  SkeletonBlock(width: 96, height: 96),
                  SizedBox(width: TekaSpacing.xs),
                  SkeletonBlock(width: 96, height: 96),
                ]),
                SizedBox(height: TekaSpacing.xl),
                SkeletonBlock(width: 140, height: 18),
                SizedBox(height: TekaSpacing.sm),
                SkeletonBlock(width: double.infinity, height: 52),
                SizedBox(height: TekaSpacing.md),
                SkeletonBlock(width: double.infinity, height: 96),
                SizedBox(height: TekaSpacing.xl),
                SkeletonBlock(width: 180, height: 18),
                SizedBox(height: TekaSpacing.sm),
                SkeletonBlock(width: double.infinity, height: 52),
                SizedBox(height: TekaSpacing.md),
                SkeletonBlock(width: double.infinity, height: 52),
              ],
            ),
          ),
        ),
      );
}
