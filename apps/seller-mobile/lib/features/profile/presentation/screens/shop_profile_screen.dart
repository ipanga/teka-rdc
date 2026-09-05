import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/commune_rules.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../data/profile_repository.dart';

class ShopProfileScreen extends ConsumerStatefulWidget {
  const ShopProfileScreen({super.key});

  @override
  ConsumerState<ShopProfileScreen> createState() => _ShopProfileScreenState();
}

class _ShopProfileScreenState extends ConsumerState<ShopProfileScreen> {
  final _businessNameCtrl = TextEditingController();
  final _businessPhoneCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();

  ProfileUser? _user;
  List<CityOption> _cities = const [];
  String? _selectedCityId;
  // Commune library of the selected town (Ville → Commune → Adresse).
  List<CommuneOption> _communes = const [];
  String? _selectedCommuneId;
  bool _communesLoading = false;
  bool _communesLoaded = false;
  String? _communesError;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _businessNameCtrl.dispose();
    _businessPhoneCtrl.dispose();
    _locationCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = ref.read(profileRepositoryProvider);
      final results = await Future.wait([
        repo.getMe(),
        repo.getCities().catchError((_) => const <CityOption>[]),
      ]);
      final me = results[0] as ProfileUser;
      final cities = results[1] as List<CityOption>;
      final shop = me.sellerProfile;
      if (!mounted) return;
      setState(() {
        _user = me;
        _cities = cities;
        _businessNameCtrl.text = shop?.businessName ?? '';
        _businessPhoneCtrl.text = shop?.phone ?? '';
        _locationCtrl.text = shop?.location ?? '';
        _descriptionCtrl.text = shop?.description ?? '';
        _selectedCityId = shop?.cityId;
        _selectedCommuneId = shop?.communeId;
      });
      // Load the commune library of the saved town so the picker can show
      // the current commune (or reveal that the town has none yet).
      await _loadCommunes(shop?.cityId, keepCurrent: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger votre boutique.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Fetch the communes of [cityId]. The selected commune survives only when
  /// it belongs to the new list (`retainedCommuneId`) — a stale commune from
  /// another town is never kept, mirroring the API rule.
  Future<void> _loadCommunes(String? cityId, {bool keepCurrent = false}) async {
    if (cityId == null || cityId.isEmpty) {
      setState(() {
        _communes = const [];
        _communesLoaded = false;
        _communesLoading = false;
        _communesError = null;
        _selectedCommuneId = null;
      });
      return;
    }
    setState(() {
      _communesLoading = true;
      _communesLoaded = false;
      _communesError = null;
      if (!keepCurrent) _selectedCommuneId = null;
    });
    try {
      final communes =
          await ref.read(profileRepositoryProvider).getCommunes(cityId);
      if (!mounted || _selectedCityId != cityId) return;
      setState(() {
        _communes = communes;
        _communesLoaded = true;
        _selectedCommuneId = retainedCommuneId(
          _selectedCommuneId,
          communes.map((c) => c.id),
        );
      });
    } catch (_) {
      if (!mounted || _selectedCityId != cityId) return;
      setState(() {
        _communes = const [];
        _communesError = 'Impossible de charger les communes.';
      });
    } finally {
      if (mounted && _selectedCityId == cityId) {
        setState(() => _communesLoading = false);
      }
    }
  }

  void _onCityChanged(String? cityId) {
    setState(() => _selectedCityId = cityId);
    _loadCommunes(cityId);
  }

  Future<void> _save() async {
    final shop = _user?.sellerProfile;
    if (shop == null) return;

    final body = <String, String>{};
    if (_businessNameCtrl.text.trim() != shop.businessName) {
      body['businessName'] = _businessNameCtrl.text.trim();
    }
    if (_businessPhoneCtrl.text.trim() != shop.phone) {
      body['phone'] = _businessPhoneCtrl.text.trim();
    }
    if (_locationCtrl.text.trim() != shop.location) {
      body['location'] = _locationCtrl.text.trim();
    }
    // Location: the town and its commune travel together so the API can
    // verify the pair. A town with a commune library requires a commune
    // before saving; a legacy profile without one stays saveable as long as
    // the town is unchanged.
    final cityId = _selectedCityId ?? '';
    final cityChanged = cityId.isNotEmpty && cityId != (shop.cityId ?? '');
    final communeChanged = (_selectedCommuneId ?? '') != (shop.communeId ?? '');
    final needsCommune = communeRequired(
      loaded: _communesLoaded,
      communeCount: _communes.length,
    );
    if ((cityChanged || communeChanged) &&
        needsCommune &&
        (_selectedCommuneId ?? '').isEmpty) {
      _toast('Veuillez sélectionner votre commune', error: true);
      return;
    }
    if (_communesLoading) {
      _toast('Chargement des communes en cours, patientez…');
      return;
    }
    var clearCommune = false;
    if (cityChanged || communeChanged) {
      body['cityId'] = cityId;
      if ((_selectedCommuneId ?? '').isNotEmpty) {
        body['communeId'] = _selectedCommuneId!;
      } else {
        clearCommune = true;
      }
    }
    if (_descriptionCtrl.text.trim() != (shop.description ?? '')) {
      body['description'] = _descriptionCtrl.text.trim();
    }
    if (body.isEmpty && !clearCommune) {
      _toast('Aucune modification à enregistrer');
      return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(profileRepositoryProvider).updateSellerProfile(
            businessName: body['businessName'],
            phone: body['phone'],
            location: body['location'],
            cityId: body['cityId'],
            communeId: body['communeId'],
            clearCommune: clearCommune,
            description: body['description'],
          );
      await _load();
      if (!mounted) return;
      _toast('Boutique mise à jour');
    } catch (e) {
      if (!mounted) return;
      _toast(friendlyErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String message, {bool error = false}) {
    showAppSnackbar(
      context,
      message: message,
      tone: error ? AppSnackbarTone.error : AppSnackbarTone.neutral,
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = _user?.sellerProfile?.applicationStatus;
    final editable = status == 'APPROVED';

    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Profil de la boutique'),
      ),
      body: _buildBody(editable, status),
      bottomNavigationBar: _loading || _error != null
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton.icon(
                  onPressed: !editable || _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.check_rounded),
                  label: Text(_saving ? 'Enregistrement...' : 'Enregistrer'),
                ),
              ),
            ),
    );
  }

  Widget _buildBody(bool editable, String? status) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _ErrorState(message: _error!, onRetry: _load);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (status == 'PENDING')
          const _Banner(
            text:
                "Votre demande d'inscription est en cours de révision. Vous pourrez modifier la boutique après approbation.",
            color: TekaColors.warning,
          ),
        if (status == 'REJECTED')
          const _Banner(
            text:
                'Votre demande a été rejetée. Contactez le support Teka RDC pour en savoir plus.',
            color: TekaColors.destructive,
          ),
        TextField(
          controller: _businessNameCtrl,
          enabled: editable,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Nom de la boutique',
            prefixIcon: Icon(Icons.storefront_outlined),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _businessPhoneCtrl,
          enabled: editable,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Téléphone de livraison',
            prefixIcon: Icon(Icons.phone_outlined),
            helperText: 'Utilisé pour la coordination avec les livreurs.',
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _cities.any((city) => city.id == _selectedCityId)
              ? _selectedCityId
              : null,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Ville',
            prefixIcon: Icon(Icons.location_city_outlined),
          ),
          hint: const Text('Sélectionnez votre ville'),
          items: _cities
              .map(
                (city) => DropdownMenuItem<String>(
                  value: city.id,
                  child: Text(
                    '${city.name} - ${city.province}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: editable ? _onCityChanged : null,
        ),
        const SizedBox(height: 12),
        _buildCommuneField(editable),
        const SizedBox(height: 12),
        TextField(
          controller: _locationCtrl,
          enabled: editable,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Adresse / quartier',
            prefixIcon: Icon(Icons.place_outlined),
            helperText: "Détail de l'adresse en complément de la ville.",
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _descriptionCtrl,
          enabled: editable,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Description',
            alignLabelWithHint: true,
            hintText: 'Décrivez votre boutique en quelques phrases...',
          ),
        ),
      ],
    );
  }

  /// Ville → Commune → Adresse: the commune picker depends on the town. It is
  /// disabled until a town is chosen, shows the library state (loading /
  /// none yet / error + retry) and never offers a commune of another town.
  Widget _buildCommuneField(bool editable) {
    final cityChosen = (_selectedCityId ?? '').isNotEmpty;
    final required = communeRequired(
      loaded: _communesLoaded,
      communeCount: _communes.length,
    );
    final noLibrary = _communesLoaded && _communes.isEmpty;
    final value = _communes.any((c) => c.id == _selectedCommuneId)
        ? _selectedCommuneId
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          // Rebuild when the library changes so the initial value tracks it.
          key: ValueKey('commune-${_selectedCityId ?? ''}-${_communes.length}'),
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: required ? 'Commune *' : 'Commune',
            prefixIcon: const Icon(Icons.map_outlined),
            helperText: noLibrary
                ? 'Aucune commune enregistrée pour cette ville pour le moment. '
                    'Précisez votre quartier ci-dessous.'
                : null,
            helperMaxLines: 3,
          ),
          hint: Text(
            communeHint(
              cityChosen: cityChosen,
              loading: _communesLoading,
              loaded: _communesLoaded,
              communeCount: _communes.length,
            ),
            overflow: TextOverflow.ellipsis,
          ),
          items: _communes
              .map(
                (c) => DropdownMenuItem<String>(
                  value: c.id,
                  child: Text(c.name, overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged:
              !editable || !cityChosen || _communesLoading || _communes.isEmpty
                  ? null
                  : (v) => setState(() => _selectedCommuneId = v),
        ),
        if (_communesError != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              children: [
                const Icon(Icons.error_outline,
                    size: 18, color: TekaColors.destructive),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _communesError!,
                    style: const TextStyle(color: TekaColors.destructive),
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      _loadCommunes(_selectedCityId, keepCurrent: true),
                  child: const Text('Réessayer'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  final String text;
  final Color color;

  const _Banner({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                color: TekaColors.tekaRed, size: 42),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}
