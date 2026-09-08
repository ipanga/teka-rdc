import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/utils/commune_rules.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../data/profile_repository.dart';
import 'personal_info_screen.dart' show FormSkeleton;

/// « Profil de la boutique » (Seller UX PR F): what buyers and Teka's riders
/// see — shop name, delivery phone, town · commune, address detail,
/// description. Town and commune stay the API's lists (`/v1/cities`,
/// `/v1/cities/:id/communes`, active rows only); the commune rule is the
/// server's (`communeRequired` only mirrors it for the form). A saved town
/// that is no longer offered is named, never silently replaced.

/// Null = valid. Same rule and words as the API (`UpdateSellerProfileDto`).
String? validateShopName(String? raw) {
  if ((raw ?? '').trim().length < 2) {
    return 'Le nom de la boutique doit contenir au moins 2 caractères';
  }
  return null;
}

String? validateShopPhone(String? raw) {
  final v = (raw ?? '').trim();
  if (v.isEmpty) return 'Le téléphone de livraison est requis';
  if (!RegExp(r'^\+243[0-9]{9}$').hasMatch(v)) {
    return 'Numéro de téléphone invalide — format +243 suivi de 9 chiffres';
  }
  return null;
}

class ShopProfileScreen extends ConsumerStatefulWidget {
  const ShopProfileScreen({super.key});

  @override
  ConsumerState<ShopProfileScreen> createState() => _ShopProfileScreenState();
}

class _ShopProfileScreenState extends ConsumerState<ShopProfileScreen> {
  final _formKey = GlobalKey<FormState>();
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
  String? _saveError;

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
      _loading = _user == null;
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
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyErrorMessage(e));
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
    if (shop == null || _saving) return;
    setState(() => _saveError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

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
      setState(() => _saveError = 'Choisissez votre commune pour cette ville.');
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
      showAppSnackbar(context,
          message: 'Boutique mise à jour', tone: AppSnackbarTone.success);
    } catch (e) {
      if (!mounted) return;
      // The API's French reason (« Commune invalide », « Numéro de téléphone
      // invalide »…) stays on screen; every value the seller typed is kept.
      setState(() => _saveError = friendlyErrorMessage(e));
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
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: _buildBody(editable, status),
      ),
      bottomNavigationBar: _loading || _user == null
          ? null
          : SafeArea(
              top: false,
              // Only the button is centred on a tablet; the bar itself stays
              // full width.
              child: ReadableBottomBar(
                child: Padding(
                padding: const EdgeInsets.all(TekaSpacing.md),
                child: ElevatedButton.icon(
                  onPressed: !editable || _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
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
                  label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
                ),
              ),
              ),
            ),
    );
  }

  Widget _buildBody(bool editable, String? status) {
    if (_loading) {
      return const FormSkeleton(label: 'Chargement de votre boutique', fields: 5);
    }
    if (_error != null && _user == null) {
      return SellerListState(
        child: SellerListMessage(
          icon: Icons.cloud_off,
          title: 'Boutique indisponible',
          message: _error!,
          actionLabel: 'Réessayer',
          onAction: _load,
        ),
      );
    }

    final theme = Theme.of(context).textTheme;
    final shop = _user?.sellerProfile;
    final savedCityKnown =
        _cities.any((city) => city.id == (_selectedCityId ?? ''));
    // The saved town is no longer offered (inactive, or the list failed):
    // say so and keep it — the API owns the value until the seller picks
    // another active town.
    final staleTown = (shop?.cityId ?? '').isNotEmpty &&
        _selectedCityId == shop?.cityId &&
        !savedCityKnown;

    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.disabled,
      child: ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(TekaSpacing.md),
      children: [
        if (status == 'PENDING')
          const _Banner(
            text:
                "Votre demande d'inscription est en cours de révision. Vous pourrez modifier la boutique après approbation.",
            color: TekaColors.warningForeground,
            background: TekaColors.warningSubtle,
          ),
        if (status == 'REJECTED')
          const _Banner(
            text:
                'Votre demande a été rejetée. Contactez le support Teka RDC pour en savoir plus.',
            color: TekaColors.destructiveForeground,
            background: TekaColors.destructiveSubtle,
          ),
        if (_saveError != null)
          Semantics(
            liveRegion: true,
            child: _Banner(
              text: _saveError!,
              color: TekaColors.destructiveForeground,
              background: TekaColors.destructiveSubtle,
              icon: Icons.error_outline,
            ),
          ),
        Text('Identité de la boutique', style: theme.titleMedium),
        const SizedBox(height: TekaSpacing.sm),
        TextFormField(
          controller: _businessNameCtrl,
          enabled: editable && !_saving,
          textInputAction: TextInputAction.next,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nom de la boutique',
            prefixIcon: Icon(Icons.storefront_outlined),
            helperText: 'Affiché sur vos fiches produits.',
          ),
          validator: validateShopName,
        ),
        const SizedBox(height: TekaSpacing.sm),
        TextFormField(
          controller: _businessPhoneCtrl,
          enabled: editable && !_saving,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Téléphone de livraison',
            prefixIcon: Icon(Icons.phone_outlined),
            helperText:
                'Numéro appelé par les livreurs Teka pour la collecte, au format +243 suivi de 9 chiffres.',
            helperMaxLines: 3,
            errorMaxLines: 2,
          ),
          validator: validateShopPhone,
        ),
        const SizedBox(height: TekaSpacing.xl),
        Text('Localisation', style: theme.titleMedium),
        const SizedBox(height: TekaSpacing.xxs),
        Text(
          'Votre boutique apparaît aux acheteurs de cette ville ; la commune sert à la collecte.',
          style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
        ),
        const SizedBox(height: TekaSpacing.sm),
        if (staleTown)
          _Banner(
            text:
                'Votre ville enregistrée, ${shop?.cityName ?? 'inconnue'}, n’est plus proposée. Choisissez une ville active pour la modifier ; sinon elle reste inchangée.',
            color: TekaColors.warningForeground,
            background: TekaColors.warningSubtle,
          ),
        DropdownButtonFormField<String>(
          initialValue: savedCityKnown ? _selectedCityId : null,
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
          onChanged: editable && !_saving ? _onCityChanged : null,
        ),
        const SizedBox(height: TekaSpacing.sm),
        _buildCommuneField(editable && !_saving),
        const SizedBox(height: TekaSpacing.sm),
        TextFormField(
          controller: _locationCtrl,
          enabled: editable && !_saving,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Adresse / quartier',
            prefixIcon: Icon(Icons.place_outlined),
            helperText: 'Repère pour la collecte : avenue, numéro, quartier.',
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: TekaSpacing.xl),
        Text('Présentation', style: theme.titleMedium),
        const SizedBox(height: TekaSpacing.sm),
        TextFormField(
          controller: _descriptionCtrl,
          enabled: editable && !_saving,
          maxLines: 4,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Description',
            alignLabelWithHint: true,
            hintText: 'Décrivez votre boutique en quelques phrases…',
          ),
        ),
      ],
      ),
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
                    size: 18, color: TekaColors.destructiveForeground),
                const SizedBox(width: TekaSpacing.xs),
                Expanded(
                  child: Text(
                    _communesError!,
                    style: const TextStyle(
                        color: TekaColors.destructiveForeground),
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
  final Color background;
  final IconData icon;

  const _Banner({
    required this.text,
    required this.color,
    required this.background,
    this.icon = Icons.info_outline_rounded,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: TekaSpacing.md),
      padding: const EdgeInsets.all(TekaSpacing.sm),
      decoration: BoxDecoration(
        color: background,
        borderRadius: TekaRadius.mdAll,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: TekaSpacing.xs),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}
