import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../products/data/models/product_model.dart';
import '../../../products/data/products_repository.dart';
import '../providers/promotion_provider.dart';

class CreatePromotionScreen extends ConsumerStatefulWidget {
  const CreatePromotionScreen({super.key});

  @override
  ConsumerState<CreatePromotionScreen> createState() =>
      _CreatePromotionScreenState();
}

class _CreatePromotionScreenState extends ConsumerState<CreatePromotionScreen> {
  final _formKey = GlobalKey<FormState>();

  String _promotionType = 'PROMOTION';
  String? _selectedProductId;
  final _titleFrController = TextEditingController();
  final _descriptionFrController = TextEditingController();
  final _discountValueController = TextEditingController();

  bool _isPercentage = true;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _isSaving = false;

  List<SellerProductModel> _products = [];
  bool _isLoadingProducts = true;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    try {
      final repo = ref.read(productsRepositoryProvider);
      final result =
          await repo.getProducts(page: 1, limit: 100, status: 'ACTIVE');
      if (mounted) {
        setState(() {
          _products = result.items;
          _isLoadingProducts = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoadingProducts = false);
      }
    }
  }

  @override
  void dispose() {
    _titleFrController.dispose();
    _descriptionFrController.dispose();
    _discountValueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');

    return Scaffold(
      appBar: AppBar(
        title: const Text("Créer une promotion"),
      ),
      body: _isLoadingProducts
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Promotion type selector
                  const Text(
                    "Type de promotion",
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment<String>(
                        value: 'PROMOTION',
                        label: Text("Promotion"),
                        icon: Icon(Icons.local_offer, size: 18),
                      ),
                      ButtonSegment<String>(
                        value: 'FLASH_DEAL',
                        label: Text("Vente Flash"),
                        icon: Icon(Icons.flash_on, size: 18),
                      ),
                    ],
                    selected: {_promotionType},
                    onSelectionChanged: (selected) {
                      setState(() => _promotionType = selected.first);
                    },
                  ),
                  const SizedBox(height: 20),

                  // Product selector
                  const Text(
                    "Selectionner un produit",
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: TekaColors.border),
                      borderRadius: BorderRadius.circular(12),
                      color: TekaColors.background,
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButtonFormField<String>(
                        initialValue: _selectedProductId,
                        isExpanded: true,
                        hint: const Text("Selectionner un produit"),
                        icon: const Icon(Icons.keyboard_arrow_down),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.zero,
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return "Selectionner un produit";
                          }
                          return null;
                        },
                        items: _products.map((product) {
                          return DropdownMenuItem<String>(
                            value: product.id,
                            child: Text(
                              product.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() => _selectedProductId = value);
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Title (French — platform is monolingual since May 2026)
                  TextFormField(
                    controller: _titleFrController,
                    decoration: InputDecoration(
                      labelText: 'Titre (francais) *',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return "Titre (francais)";
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Description (French)
                  TextFormField(
                    controller: _descriptionFrController,
                    decoration: InputDecoration(
                      labelText: "Description (francais)",
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 20),

                  // Discount type toggle
                  const Text(
                    "Type de reduction",
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment<bool>(
                        value: true,
                        label: Text("Pourcentage de reduction"),
                        icon: Icon(Icons.percent, size: 18),
                      ),
                      ButtonSegment<bool>(
                        value: false,
                        label: Text("Montant fixe (CDF)"),
                        icon: Icon(Icons.payments_outlined, size: 18),
                      ),
                    ],
                    selected: {_isPercentage},
                    onSelectionChanged: (selected) {
                      setState(() {
                        _isPercentage = selected.first;
                        _discountValueController.clear();
                      });
                    },
                  ),
                  const SizedBox(height: 12),

                  // Discount value
                  TextFormField(
                    controller: _discountValueController,
                    decoration: InputDecoration(
                      labelText: _isPercentage
                          ? "Pourcentage de reduction"
                          : "Montant fixe (CDF)",
                      suffixText: _isPercentage ? '%' : 'CDF',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return _isPercentage
                            ? "Pourcentage de reduction"
                            : "Montant fixe (CDF)";
                      }
                      final num = int.tryParse(value);
                      if (num == null || num <= 0) {
                        return _isPercentage
                            ? "Pourcentage de reduction"
                            : "Montant fixe (CDF)";
                      }
                      if (_isPercentage && num > 100) {
                        return "Pourcentage de reduction";
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 20),

                  // Start date
                  const Text(
                    "Date de debut",
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: () => _pickDate(isStart: true),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        border: Border.all(color: TekaColors.border),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined,
                              size: 18, color: TekaColors.mutedForeground),
                          const SizedBox(width: 12),
                          Text(
                            _startDate != null
                                ? dateFormat.format(_startDate!)
                                : "Date de debut",
                            style: TextStyle(
                              color: _startDate != null
                                  ? TekaColors.foreground
                                  : TekaColors.mutedForeground,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // End date
                  const Text(
                    "Date de fin",
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: () => _pickDate(isStart: false),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        border: Border.all(color: TekaColors.border),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined,
                              size: 18, color: TekaColors.mutedForeground),
                          const SizedBox(width: 12),
                          Text(
                            _endDate != null
                                ? dateFormat.format(_endDate!)
                                : "Date de fin",
                            style: TextStyle(
                              color: _endDate != null
                                  ? TekaColors.foreground
                                  : TekaColors.mutedForeground,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Submit button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _isSaving ? null : _submit,
                      icon: _isSaving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send),
                      label: const Text("Soumettre pour approbation"),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final initialDate =
        isStart ? (_startDate ?? now) : (_endDate ?? _startDate ?? now);
    final firstDate = isStart ? now : (_startDate ?? now);

    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate.isBefore(firstDate) ? firstDate : initialDate,
      firstDate: firstDate,
      lastDate: now.add(const Duration(days: 365)),
    );

    if (picked != null && mounted) {
      setState(() {
        if (isStart) {
          _startDate = picked;
          // Reset end date if it's before start date
          if (_endDate != null && _endDate!.isBefore(picked)) {
            _endDate = null;
          }
        } else {
          _endDate = picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_startDate == null || _endDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Date de debut / Date de fin"),
        ),
      );
      return;
    }

    if (_endDate!.isBefore(_startDate!) ||
        _endDate!.isAtSameMomentAs(_startDate!)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Date de fin")),
      );
      return;
    }

    setState(() => _isSaving = true);

    // Platform is French-only since May 2026; API DTO accepts plain strings.
    final title = _titleFrController.text.trim();
    final description = _descriptionFrController.text.trim();

    final data = <String, dynamic>{
      'type': _promotionType,
      'title': title,
      'productId': _selectedProductId,
      'startsAt': _startDate!.toIso8601String(),
      'endsAt': _endDate!.toIso8601String(),
    };

    if (description.isNotEmpty) {
      data['description'] = description;
    }

    final discountValue = int.tryParse(_discountValueController.text.trim());
    if (_isPercentage && discountValue != null) {
      data['discountPercent'] = discountValue;
    } else if (!_isPercentage && discountValue != null) {
      // Convert CDF to centimes
      data['discountCDF'] = (discountValue * 100).toString();
    }

    final success =
        await ref.read(sellerPromotionsProvider.notifier).createPromotion(data);

    if (mounted) {
      setState(() => _isSaving = false);
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Promotion creee avec succes")),
        );
        context.pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text("Une erreur est survenue. Veuillez réessayer.")),
        );
      }
    }
  }
}
