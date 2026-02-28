import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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
  final _titleEnController = TextEditingController();
  final _descriptionFrController = TextEditingController();
  final _descriptionEnController = TextEditingController();
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
      final result = await repo.getProducts(page: 1, limit: 100, status: 'ACTIVE');
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
    _titleEnController.dispose();
    _descriptionFrController.dispose();
    _descriptionEnController.dispose();
    _discountValueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = l10n.localeName;
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.promotionCreate),
      ),
      body: _isLoadingProducts
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Promotion type selector
                  Text(
                    l10n.promotionType,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment<String>(
                        value: 'PROMOTION',
                        label: Text(l10n.promotionPromotion),
                        icon: const Icon(Icons.local_offer, size: 18),
                      ),
                      ButtonSegment<String>(
                        value: 'FLASH_DEAL',
                        label: Text(l10n.promotionFlashDeal),
                        icon: const Icon(Icons.flash_on, size: 18),
                      ),
                    ],
                    selected: {_promotionType},
                    onSelectionChanged: (selected) {
                      setState(() => _promotionType = selected.first);
                    },
                  ),
                  const SizedBox(height: 20),

                  // Product selector
                  Text(
                    l10n.promotionSelectProduct,
                    style: const TextStyle(
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
                        hint: Text(l10n.promotionSelectProduct),
                        icon: const Icon(Icons.keyboard_arrow_down),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.zero,
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return l10n.promotionSelectProduct;
                          }
                          return null;
                        },
                        items: _products.map((product) {
                          return DropdownMenuItem<String>(
                            value: product.id,
                            child: Text(
                              product.getLocalizedTitle(locale),
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

                  // Title FR
                  TextFormField(
                    controller: _titleFrController,
                    decoration: InputDecoration(
                      labelText: '${l10n.titleFr} *',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return l10n.titleFr;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Title EN
                  TextFormField(
                    controller: _titleEnController,
                    decoration: InputDecoration(
                      labelText: l10n.titleEn,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Description FR
                  TextFormField(
                    controller: _descriptionFrController,
                    decoration: InputDecoration(
                      labelText: l10n.descriptionFr,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),

                  // Description EN
                  TextFormField(
                    controller: _descriptionEnController,
                    decoration: InputDecoration(
                      labelText: l10n.descriptionEn,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 20),

                  // Discount type toggle
                  Text(
                    l10n.promotionDiscountType,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<bool>(
                    segments: [
                      ButtonSegment<bool>(
                        value: true,
                        label: Text(l10n.promotionDiscountPercent),
                        icon: const Icon(Icons.percent, size: 18),
                      ),
                      ButtonSegment<bool>(
                        value: false,
                        label: Text(l10n.promotionDiscountAmount),
                        icon: const Icon(Icons.payments_outlined, size: 18),
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
                          ? l10n.promotionDiscountPercent
                          : l10n.promotionDiscountAmount,
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
                            ? l10n.promotionDiscountPercent
                            : l10n.promotionDiscountAmount;
                      }
                      final num = int.tryParse(value);
                      if (num == null || num <= 0) {
                        return _isPercentage
                            ? l10n.promotionDiscountPercent
                            : l10n.promotionDiscountAmount;
                      }
                      if (_isPercentage && num > 100) {
                        return l10n.promotionDiscountPercent;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 20),

                  // Start date
                  Text(
                    l10n.promotionStartDate,
                    style: const TextStyle(
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
                                : l10n.promotionStartDate,
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
                  Text(
                    l10n.promotionEndDate,
                    style: const TextStyle(
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
                                : l10n.promotionEndDate,
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
                      label: Text(l10n.promotionSubmitForApproval),
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
    final initialDate = isStart
        ? (_startDate ?? now)
        : (_endDate ?? _startDate ?? now);
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
    final l10n = AppLocalizations.of(context)!;

    if (!_formKey.currentState!.validate()) return;

    if (_startDate == null || _endDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${l10n.promotionStartDate} / ${l10n.promotionEndDate}',
          ),
        ),
      );
      return;
    }

    if (_endDate!.isBefore(_startDate!) ||
        _endDate!.isAtSameMomentAs(_startDate!)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.promotionEndDate)),
      );
      return;
    }

    setState(() => _isSaving = true);

    final title = <String, String>{
      'fr': _titleFrController.text.trim(),
    };
    if (_titleEnController.text.trim().isNotEmpty) {
      title['en'] = _titleEnController.text.trim();
    }

    Map<String, String>? description;
    if (_descriptionFrController.text.trim().isNotEmpty ||
        _descriptionEnController.text.trim().isNotEmpty) {
      description = {};
      if (_descriptionFrController.text.trim().isNotEmpty) {
        description['fr'] = _descriptionFrController.text.trim();
      }
      if (_descriptionEnController.text.trim().isNotEmpty) {
        description['en'] = _descriptionEnController.text.trim();
      }
    }

    final data = <String, dynamic>{
      'type': _promotionType,
      'title': title,
      'productId': _selectedProductId,
      'startsAt': _startDate!.toIso8601String(),
      'endsAt': _endDate!.toIso8601String(),
    };

    if (description != null) {
      data['description'] = description;
    }

    final discountValue = int.tryParse(_discountValueController.text.trim());
    if (_isPercentage && discountValue != null) {
      data['discountPercent'] = discountValue;
    } else if (!_isPercentage && discountValue != null) {
      // Convert CDF to centimes
      data['discountCDF'] = (discountValue * 100).toString();
    }

    final success = await ref
        .read(sellerPromotionsProvider.notifier)
        .createPromotion(data);

    if (mounted) {
      setState(() => _isSaving = false);
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.promotionCreated)),
        );
        context.pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.authGenericError)),
        );
      }
    }
  }
}
