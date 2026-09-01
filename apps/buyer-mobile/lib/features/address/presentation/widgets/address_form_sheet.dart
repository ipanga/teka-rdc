import 'package:flutter/material.dart';

import '../../../../core/theme/teka_colors.dart';
import '../../../checkout/data/models/checkout_model.dart';
import '../../../city/data/city_repository.dart';
import '../../../city/data/models/city_model.dart';
import '../../../city/data/models/commune_model.dart';

/// The buyer's single delivery-address form, used for both creating it and
/// editing it.
///
/// Lifted out of `checkout_screen.dart`, where it lived as a private widget and
/// was therefore unreachable from the account tab (which is why the address
/// book could list addresses but never add one, and could never edit one at
/// all). Profile and checkout now share this one form, so the field set cannot
/// drift between them.
///
/// Payload keys are the API contract — `reference` and `recipientPhone`, not
/// `details`/`phone`. The API runs `forbidNonWhitelisted`, so a wrong key is a
/// 400, not a silently ignored field.
class AddressFormSheet extends StatefulWidget {
  final CityRepository cityRepository;
  final Future<bool> Function(Map<String, dynamic> data) onSave;

  /// Existing address to edit. Null → creation.
  final AddressModel? initial;

  const AddressFormSheet({
    super.key,
    required this.cityRepository,
    required this.onSave,
    this.initial,
  });

  bool get isEditing => initial != null;

  @override
  State<AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends State<AddressFormSheet> {
  List<CityModel> _cities = [];
  List<CommuneModel> _communes = [];
  bool _isLoadingCities = true;
  bool _isLoadingCommunes = false;
  bool _isSaving = false;

  CityModel? _selectedCity;
  CommuneModel? _selectedCommune;

  late final TextEditingController _avenueController;
  late final TextEditingController _referenceController;
  late final TextEditingController _recipientNameController;
  late final TextEditingController _recipientPhoneController;

  @override
  void initState() {
    super.initState();
    final a = widget.initial;
    _avenueController = TextEditingController(text: a?.avenue ?? '');
    _referenceController = TextEditingController(text: a?.reference ?? '');
    _recipientNameController =
        TextEditingController(text: a?.recipientName ?? '');
    _recipientPhoneController =
        TextEditingController(text: a?.recipientPhone ?? '');
    _loadCities();
  }

  @override
  void dispose() {
    _avenueController.dispose();
    _referenceController.dispose();
    _recipientNameController.dispose();
    _recipientPhoneController.dispose();
    super.dispose();
  }

  Future<void> _loadCities() async {
    try {
      final cities = await widget.cityRepository.getCities();
      if (!mounted) return;
      final active = cities.where((c) => c.isActive).toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      // Preselect when editing. Prefer the id; fall back to the stored town
      // name for addresses saved before cityId was captured.
      final initial = widget.initial;
      CityModel? preselected;
      if (initial != null) {
        for (final c in active) {
          if (c.id == initial.cityId || c.name == initial.town) {
            preselected = c;
            break;
          }
        }
      }

      setState(() {
        _cities = active;
        _selectedCity = preselected;
        _isLoadingCities = false;
      });

      if (preselected != null) {
        await _loadCommunes(preselected.id, preselect: initial);
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingCities = false);
    }
  }

  Future<void> _loadCommunes(String cityId, {AddressModel? preselect}) async {
    setState(() {
      _isLoadingCommunes = true;
      _communes = [];
      _selectedCommune = null;
    });
    try {
      final communes = await widget.cityRepository.getCommunes(cityId);
      if (!mounted) return;

      CommuneModel? chosen;
      if (preselect != null) {
        for (final c in communes) {
          if (c.id == preselect.communeId || c.name == preselect.neighborhood) {
            chosen = c;
            break;
          }
        }
      }

      setState(() {
        _communes = communes;
        _selectedCommune = chosen;
        _isLoadingCommunes = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoadingCommunes = false);
    }
  }

  Future<void> _save() async {
    if (_selectedCity == null || _selectedCommune == null) return;

    setState(() => _isSaving = true);

    // Optional fields are sent as null rather than omitted when cleared, so
    // wiping the landmark actually wipes it server-side instead of leaving the
    // previous value in place.
    String? trimmedOrNull(TextEditingController c) {
      final v = c.text.trim();
      return v.isEmpty ? null : v;
    }

    final data = <String, dynamic>{
      'province': _selectedCity!.province,
      'town': _selectedCity!.name,
      'neighborhood': _selectedCommune!.name,
      'cityId': _selectedCity!.id,
      'communeId': _selectedCommune!.id,
    };

    final avenue = trimmedOrNull(_avenueController);
    final reference = trimmedOrNull(_referenceController);
    final recipientName = trimmedOrNull(_recipientNameController);
    final recipientPhone = trimmedOrNull(_recipientPhoneController);

    // On create, omitting is equivalent and keeps the payload minimal. On edit
    // the key must be present to clear a previously-saved value.
    if (avenue != null || widget.isEditing) data['avenue'] = avenue;
    if (reference != null || widget.isEditing) data['reference'] = reference;
    if (recipientName != null || widget.isEditing) {
      data['recipientName'] = recipientName;
    }
    if (recipientPhone != null || widget.isEditing) {
      data['recipientPhone'] = recipientPhone;
    }

    final success = await widget.onSave(data);
    if (mounted) {
      setState(() => _isSaving = false);
      if (success) {
        Navigator.of(context).pop();
      }
    }
  }

  InputDecoration _decoration({
    required String label,
    required String hint,
    required IconData icon,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, size: 20),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: TekaColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: TekaColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: TekaColors.tekaRed),
      ),
      contentPadding: const EdgeInsets.all(12),
    );
  }

  Widget _dropdownShell({required Widget child}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          border: Border.all(color: TekaColors.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: DropdownButtonHideUnderline(child: child),
      );

  static const _fieldLabel = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: TekaColors.foreground,
  );

  static const _spinner = Padding(
    padding: EdgeInsets.symmetric(vertical: 12),
    child: Center(
      child: SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: TekaColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              widget.isEditing ? "Modifier mon adresse" : "Mon adresse",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 16),

            const Text('Ville *', style: _fieldLabel),
            const SizedBox(height: 6),
            if (_isLoadingCities)
              _spinner
            else
              _dropdownShell(
                child: DropdownButton<String>(
                  value: _selectedCity?.id,
                  hint: const Text(
                    "Selectionnez une ville",
                    style: TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 14,
                    ),
                  ),
                  isExpanded: true,
                  items: _cities
                      .map((city) => DropdownMenuItem(
                            value: city.id,
                            child: Text(
                              '${city.name} (${city.province})',
                              style: const TextStyle(fontSize: 14),
                            ),
                          ))
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    final city = _cities.firstWhere((c) => c.id == value);
                    setState(() => _selectedCity = city);
                    _loadCommunes(value);
                  },
                ),
              ),
            const SizedBox(height: 12),

            if (_selectedCity != null) ...[
              const Text('Commune *', style: _fieldLabel),
              const SizedBox(height: 6),
              if (_isLoadingCommunes)
                _spinner
              else
                _dropdownShell(
                  child: DropdownButton<String>(
                    value: _selectedCommune?.id,
                    hint: const Text(
                      "Selectionnez une commune",
                      style: TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 14,
                      ),
                    ),
                    isExpanded: true,
                    items: _communes
                        .map((commune) => DropdownMenuItem(
                              value: commune.id,
                              child: Text(
                                commune.name,
                                style: const TextStyle(fontSize: 14),
                              ),
                            ))
                        .toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      final commune =
                          _communes.firstWhere((c) => c.id == value);
                      setState(() => _selectedCommune = commune);
                    },
                  ),
                ),
              const SizedBox(height: 12),
            ],

            TextField(
              controller: _avenueController,
              decoration: _decoration(
                label: "Avenue / Rue",
                hint: "Ex: Av. Lumumba n24",
                icon: Icons.signpost_outlined,
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _referenceController,
              decoration: _decoration(
                label: "Point de repere",
                hint: "Ex: En face de la pharmacie",
                icon: Icons.place_outlined,
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _recipientNameController,
              textCapitalization: TextCapitalization.words,
              decoration: _decoration(
                label: "Nom du destinataire",
                hint: "Nom complet",
                icon: Icons.person_outline,
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _recipientPhoneController,
              keyboardType: TextInputType.phone,
              decoration: _decoration(
                label: "Telephone du destinataire",
                hint: "+243...",
                icon: Icons.phone_outlined,
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: const BorderSide(color: TekaColors.border),
                    ),
                    child: const Text("Annuler"),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: (_selectedCity != null &&
                            _selectedCommune != null &&
                            !_isSaving)
                        ? _save
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: TekaColors.tekaRed,
                      disabledBackgroundColor: TekaColors.muted,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text("Enregistrer"),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
