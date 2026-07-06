import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
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
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger votre boutique.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
    if ((_selectedCityId ?? '') != (shop.cityId ?? '') &&
        (_selectedCityId ?? '').isNotEmpty) {
      body['cityId'] = _selectedCityId!;
    }
    if (_descriptionCtrl.text.trim() != (shop.description ?? '')) {
      body['description'] = _descriptionCtrl.text.trim();
    }
    if (body.isEmpty) {
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
            description: body['description'],
          );
      await _load();
      if (!mounted) return;
      _toast('Boutique mise à jour');
    } catch (_) {
      if (!mounted) return;
      _toast("Erreur lors de l'enregistrement", error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? TekaColors.destructive : null,
      ),
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
          onChanged: editable
              ? (value) => setState(() => _selectedCityId = value)
              : null,
        ),
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
