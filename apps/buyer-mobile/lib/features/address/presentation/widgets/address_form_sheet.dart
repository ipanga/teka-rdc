import 'package:flutter/material.dart';

import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/phone.dart';
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
/// Saves the payload; returns null on success or the French message to show
/// inside the sheet (the API's own reason — « Commune inactive », « Numéro de
/// téléphone invalide… » — or a connectivity message). Before PR D2 the sheet
/// only learnt "false" and the callers showed a generic snackbar behind it.
typedef AddressSaveHandler = Future<String?> Function(Map<String, dynamic> data);

class AddressFormSheet extends StatefulWidget {
  final CityRepository cityRepository;
  final AddressSaveHandler onSave;

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

  /// City / commune list failed to load: shown with a retry instead of the
  /// silent empty, disabled form of before (A10, 2026-09-07).
  bool _citiesFailed = false;
  bool _communesFailed = false;

  /// Field-level phone error and the last save failure (both French).
  String? _phoneError;
  String? _saveError;

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
    setState(() {
      _isLoadingCities = true;
      _citiesFailed = false;
    });
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
      if (mounted) {
        setState(() {
          _isLoadingCities = false;
          _citiesFailed = true;
        });
      }
    }
  }

  Future<void> _loadCommunes(String cityId, {AddressModel? preselect}) async {
    setState(() {
      _isLoadingCommunes = true;
      _communesFailed = false;
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
      if (mounted) {
        setState(() {
          _isLoadingCommunes = false;
          _communesFailed = true;
        });
      }
    }
  }

  Future<void> _save() async {
    if (_selectedCity == null || _selectedCommune == null) return;

    // One phone rule on every surface (PR D2): `081…`, `+243 81…`, spaces
    // and dashes become the canonical `+243XXXXXXXXX` (the API applies the
    // same rule on write); an unreadable value is refused here, on the field.
    final rawPhone = _recipientPhoneController.text.trim();
    final normalizedPhone = rawPhone.isEmpty ? null : normalizeDrcPhone(rawPhone);
    if (rawPhone.isNotEmpty && normalizedPhone == null) {
      setState(() => _phoneError =
          'Numéro invalide : 9 chiffres (ex. 990 000 001) ou +243…');
      return;
    }

    setState(() {
      _isSaving = true;
      _phoneError = null;
      _saveError = null;
    });

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
    final recipientPhone = normalizedPhone;

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

    final failure = await widget.onSave(data);
    if (mounted) {
      setState(() {
        _isSaving = false;
        _saveError = failure;
      });
      if (failure == null) {
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
            else if (_citiesFailed)
              _LoadFailure(
                key: const ValueKey('address-cities-failed'),
                message: 'Impossible de charger les villes.',
                onRetry: _loadCities,
              )
            else
              _dropdownShell(
                child: DropdownButton<String>(
                  value: _selectedCity?.id,
                  hint: const Text(
                    "Sélectionnez une ville",
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
              else if (_communesFailed)
                _LoadFailure(
                  key: const ValueKey('address-communes-failed'),
                  message: 'Impossible de charger les communes.',
                  onRetry: () => _loadCommunes(_selectedCity!.id),
                )
              else
                _dropdownShell(
                  child: DropdownButton<String>(
                    value: _selectedCommune?.id,
                    hint: const Text(
                      "Sélectionnez une commune",
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
                label: "Point de repère",
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
              onChanged: (_) {
                if (_phoneError != null) setState(() => _phoneError = null);
              },
              decoration: _decoration(
                label: "Téléphone du destinataire",
                hint: "Ex. 099 000 00 01",
                icon: Icons.phone_outlined,
              ).copyWith(
                errorText: _phoneError,
                helperText: 'Numéro WhatsApp ou mobile de la personne qui reçoit.',
                helperMaxLines: 2,
              ),
              style: const TextStyle(fontSize: 14),
            ),
            if (_saveError != null) ...[
              const SizedBox(height: 12),
              Text(
                _saveError!,
                key: const ValueKey('address-save-error'),
                style: const TextStyle(
                  color: TekaColors.destructive,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ],
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

/// A reference list (cities, communes) failed to load — say so and offer a
/// retry rather than an empty, disabled form.
class _LoadFailure extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _LoadFailure({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.destructive.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: TekaColors.destructive),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: const TextStyle(fontSize: 13)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}
