import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
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

  final ImagePicker _picker = ImagePicker();

  String _businessType = 'individual';
  String _idType = 'national_id';
  String? _cityId;
  String? _communeId;
  String? _idDocumentCloudinaryId;

  bool _loading = true;
  bool _submitting = false;
  bool _uploadingDoc = false;
  bool _loadingCommunes = false;
  String? _communesError;
  String? _docError;
  String? _error;
  SellerApplication? _application;
  List<CityOption> _cities = const [];
  List<CommuneOption> _communes = const [];

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
        _communeId = app.communeId;
        _idDocumentCloudinaryId = app.idDocumentCloudinaryId;
      }

      // Load communes for a prefilled (REJECTED) city so the dropdown can
      // show the saved commune.
      final communes = _cityId != null && _cityId!.isNotEmpty
          ? await repo.getCommunes(_cityId!)
          : <CommuneOption>[];

      if (mounted) {
        setState(() {
          _application = app;
          _cities = cities;
          _communes = communes;
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

  /// City changed: reset the chosen commune and reload the commune list.
  Future<void> _onCityChanged(String? cityId) async {
    setState(() {
      _cityId = cityId;
      _communeId = null;
      _communes = const [];
      _loadingCommunes = cityId != null && cityId.isNotEmpty;
      _communesError = null;
    });
    if (cityId == null || cityId.isEmpty) return;
    try {
      final communes = await ref
          .read(sellerApplicationRepositoryProvider)
          .getCommunes(cityId);
      if (mounted && _cityId == cityId) {
        setState(() {
          _communes = communes;
          _loadingCommunes = false;
        });
      }
    } catch (_) {
      if (mounted && _cityId == cityId) {
        setState(() {
          _loadingCommunes = false;
          _communesError = 'Impossible de charger les communes.';
        });
      }
    }
  }

  /// Pick the KYC document photo and upload it to the private folder.
  Future<void> _pickDocument() async {
    try {
      final xFile = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      if (xFile == null) return;
      setState(() {
        _uploadingDoc = true;
        _docError = null;
      });
      final cloudinaryId = await ref
          .read(sellerApplicationRepositoryProvider)
          .uploadDocument(File(xFile.path));
      if (mounted) {
        setState(() {
          _idDocumentCloudinaryId = cloudinaryId;
          _uploadingDoc = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _uploadingDoc = false;
          _docError = 'Échec du téléchargement du document. Réessayez.';
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

    if (_cityId == null || _cityId!.isEmpty || _communeId == null) {
      setState(
          () => _error = 'Veuillez sélectionner une ville et une commune.');
      return;
    }

    if (_idDocumentCloudinaryId == null) {
      setState(() => _error = 'Veuillez téléverser votre pièce d’identité.');
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
            communeId: _communeId!,
            idDocumentCloudinaryId: _idDocumentCloudinaryId!,
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
          IconButton(
            tooltip: 'Se déconnecter',
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
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
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight - 48),
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
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final isRejected = _application?.applicationStatus == 'REJECTED';

    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(
        24,
        0,
        24,
        MediaQuery.viewInsetsOf(context).bottom + 32,
      ),
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
              textInputAction: TextInputAction.next,
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
              isExpanded: true,
              initialValue: _businessType,
              decoration: const InputDecoration(labelText: 'Type d’activité'),
              items: const [
                DropdownMenuItem(
                    value: 'individual', child: Text('Particulier')),
                DropdownMenuItem(value: 'company', child: Text('Entreprise')),
              ],
              onChanged: (v) =>
                  setState(() => _businessType = v ?? 'individual'),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _idType,
              decoration: const InputDecoration(labelText: 'Type de pièce'),
              items: const [
                DropdownMenuItem(
                    value: 'national_id',
                    child: Text(
                      'Carte d’identité nationale',
                      overflow: TextOverflow.ellipsis,
                    )),
                DropdownMenuItem(value: 'passport', child: Text('Passeport')),
                DropdownMenuItem(value: 'rccm', child: Text('RCCM')),
              ],
              onChanged: (v) => setState(() => _idType = v ?? 'national_id'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _idNumberController,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Numéro de pièce'),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Numéro de pièce requis';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            // KYC document upload
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Pièce d’identité (CNI / passeport / RCCM)',
                  style: TextStyle(fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Photo lisible de votre pièce. JPEG, PNG ou WebP, 5 Mo max.',
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _uploadingDoc ? null : _pickDocument,
                  icon: _uploadingDoc
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          _idDocumentCloudinaryId != null
                              ? Icons.check_circle_outline
                              : Icons.upload_file_outlined,
                        ),
                  label: Text(
                    _uploadingDoc
                        ? 'Téléchargement...'
                        : _idDocumentCloudinaryId != null
                            ? 'Document téléchargé ✓ — Remplacer'
                            : 'Téléverser la pièce',
                  ),
                ),
                if (_docError != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _docError!,
                    style: const TextStyle(
                      color: TekaColors.destructive,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
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
              isExpanded: true,
              initialValue: _cityId,
              decoration: const InputDecoration(labelText: 'Ville'),
              items: _cities
                  .map((c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(
                          '${c.name} (${c.province})',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ))
                  .toList(),
              onChanged: (v) => _onCityChanged(v),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Ville requise' : null,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _communeId,
              decoration: InputDecoration(
                labelText: 'Commune',
                hintText: _loadingCommunes
                    ? 'Chargement des communes…'
                    : _cityId == null
                        ? 'Sélectionnez d’abord une ville'
                        : null,
              ),
              items: _communes
                  .map((c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(c.name),
                      ))
                  .toList(),
              onChanged: _cityId == null || _loadingCommunes
                  ? null
                  : (v) => setState(() => _communeId = v),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Commune requise' : null,
            ),
            if (_communesError != null) ...[
              const SizedBox(height: 8),
              Row(
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
                    onPressed: () => _onCityChanged(_cityId),
                    child: const Text('Réessayer'),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            TextFormField(
              controller: _locationController,
              textInputAction: TextInputAction.next,
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
                onPressed: (_submitting || _uploadingDoc) ? null : _submit,
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
