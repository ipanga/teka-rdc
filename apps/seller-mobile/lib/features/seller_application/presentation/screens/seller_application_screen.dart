import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/phone.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/seller_application_repository.dart';

/// Seller business application — the mobile mirror of seller-web's
/// /devenir-vendeur. Shown to a logged-in SELLER without an APPROVED profile.
/// Renders the form (none / REJECTED) or a PENDING "under review" card.
class SellerApplicationScreen extends ConsumerStatefulWidget {
  const SellerApplicationScreen({super.key});

  @override
  ConsumerState<SellerApplicationScreen> createState() =>
      _SellerApplicationScreenState();
}

class _SellerApplicationScreenState
    extends ConsumerState<SellerApplicationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _businessNameController = TextEditingController();
  final _idNumberController = TextEditingController();
  final _phoneController = TextEditingController();
  final _locationController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _businessType = 'individual';
  String _idType = 'national_id';
  String? _cityId;

  bool _loading = true;
  bool _submitting = false;
  String? _error;
  SellerApplication? _application;
  List<CityOption> _cities = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _businessNameController.dispose();
    _idNumberController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = ref.read(sellerApplicationRepositoryProvider);
      final results = await Future.wait([
        repo.getApplication(),
        repo.getCities(),
      ]);
      final app = results[0] as SellerApplication;
      final cities = results[1] as List<CityOption>;

      if (app.hasApplication && app.applicationStatus == 'APPROVED') {
        if (mounted) context.go('/');
        return;
      }

      // Prefill from a REJECTED application so it can be corrected.
      if (app.hasApplication) {
        _businessNameController.text = app.businessName ?? '';
        _idNumberController.text = app.idNumber ?? '';
        _locationController.text = app.location ?? '';
        _descriptionController.text = app.description ?? '';
        _businessType = app.businessType ?? 'individual';
        _idType = app.idType ?? 'national_id';
        _cityId = app.cityId;
      }

      if (mounted) {
        setState(() {
          _application = app;
          _cities = cities;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Impossible de charger votre demande. Réessayez.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final normalizedPhone = normalizeDrcPhone(_phoneController.text);
    if (normalizedPhone == null) {
      setState(() => _error =
          'Numéro de téléphone invalide. Entrez un numéro congolais valide.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(sellerApplicationRepositoryProvider).apply(
            businessName: _businessNameController.text.trim(),
            businessType: _businessType,
            idType: _idType,
            idNumber: _idNumberController.text.trim(),
            phone: normalizedPhone,
            location: _locationController.text.trim(),
            cityId: _cityId,
            description: _descriptionController.text.trim(),
          );
      // Refresh auth so /me reflects PENDING and the router gate keeps the
      // seller here (not yet APPROVED).
      await ref.read(authProvider.notifier).checkAuthStatus();
      if (mounted) {
        setState(() {
          _application = const SellerApplication(
            hasApplication: true,
            applicationStatus: 'PENDING',
          );
          _submitting = false;
        });
      }
    } on DioException catch (e) {
      setState(() {
        _submitting = false;
        _error = e.response?.data?['error']?['message'] ??
            e.response?.data?['message'] ??
            'Impossible de soumettre votre demande. Réessayez.';
      });
    } catch (_) {
      setState(() {
        _submitting = false;
        _error = 'Une erreur est survenue.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Devenir vendeur'),
        backgroundColor: Colors.transparent,
        foregroundColor: TekaColors.foreground,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            child: const Text('Déconnexion'),
          ),
        ],
      ),
      body: SafeArea(child: _buildBody(context)),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_application?.applicationStatus == 'PENDING') {
      return _buildPending(context);
    }

    return _buildForm(context);
  }

  Widget _buildPending(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.hourglass_top_outlined,
              size: 56, color: TekaColors.mutedForeground),
          const SizedBox(height: 16),
          Text(
            'Demande en cours d’examen',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          const Text(
            'Votre demande de compte vendeur a été reçue. Notre équipe '
            'l’examine et vous serez notifié dès qu’une décision est prise.',
            textAlign: TextAlign.center,
            style: TextStyle(color: TekaColors.mutedForeground),
          ),
        ],
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final isRejected = _application?.applicationStatus == 'REJECTED';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Text(
              'Informations de votre activité',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Renseignez les informations ci-dessous pour soumettre votre '
              'demande de compte vendeur.',
              style: TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            if (isRejected) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: TekaColors.destructive.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Demande refusée',
                      style: TextStyle(
                        color: TekaColors.destructive,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (_application?.rejectionReason != null) ...[
                      const SizedBox(height: 4),
                      Text(_application!.rejectionReason!),
                    ],
                    const SizedBox(height: 4),
                    const Text(
                      'Corrigez les informations et soumettez à nouveau.',
                      style: TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
            TextFormField(
              controller: _businessNameController,
              decoration: const InputDecoration(
                labelText: 'Nom de l’entreprise / boutique',
              ),
              validator: (v) {
                if (v == null || v.trim().length < 2) {
                  return 'Nom requis';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _businessType,
              decoration: const InputDecoration(labelText: 'Type d’activité'),
              items: const [
                DropdownMenuItem(
                    value: 'individual', child: Text('Particulier')),
                DropdownMenuItem(value: 'company', child: Text('Entreprise')),
              ],
              onChanged: (v) => setState(() => _businessType = v ?? 'individual'),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _idType,
              decoration: const InputDecoration(labelText: 'Type de pièce'),
              items: const [
                DropdownMenuItem(
                    value: 'national_id',
                    child: Text('Carte d’identité nationale')),
                DropdownMenuItem(value: 'passport', child: Text('Passeport')),
                DropdownMenuItem(value: 'rccm', child: Text('RCCM')),
              ],
              onChanged: (v) => setState(() => _idType = v ?? 'national_id'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _idNumberController,
              decoration: const InputDecoration(labelText: 'Numéro de pièce'),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Numéro de pièce requis';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Numéro de téléphone',
                hintText: 'Ex : 0812345678',
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Téléphone requis';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _cityId,
              decoration: const InputDecoration(labelText: 'Ville'),
              items: _cities
                  .map((c) => DropdownMenuItem(
                        value: c.id,
                        child: Text('${c.name} (${c.province})'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _cityId = v),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'Adresse / quartier',
                hintText: 'Ex : Lubumbashi, Katuba',
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Adresse requise';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _descriptionController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Description de votre activité (facultatif)',
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: TekaColors.destructive.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: TekaColors.destructive),
                ),
              ),
              const SizedBox(height: 16),
            ],
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Soumettre ma demande',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
