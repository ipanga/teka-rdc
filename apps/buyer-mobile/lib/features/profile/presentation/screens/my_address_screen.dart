import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../address/presentation/widgets/address_form_sheet.dart';
import '../../../checkout/data/checkout_repository.dart';
import '../../../checkout/data/models/checkout_model.dart';
import '../../../city/data/city_repository.dart';

/// "Mon adresse" — the buyer's single delivery address.
///
/// Replaces the old address book. A buyer has exactly one current delivery
/// address (enforced server-side by the upsert in AddressesService.create), so
/// this screen shows that one address with a « Modifier » action, or an
/// « Ajouter mon adresse » call to action when there is none.
///
/// The old screen could list and delete addresses but had no way to add one —
/// its empty state told the buyer to wait until checkout — and no way to edit
/// one at all. Set-default and delete are gone with the address book: with a
/// single address there is nothing to choose between, and deleting the only
/// address would just strand checkout.
///
/// Legacy buyers may still have more than one row server-side until the archive
/// migration runs; the API consistently returns the default (else newest) first,
/// and that is the one shown and edited here.
class MyAddressScreen extends ConsumerStatefulWidget {
  const MyAddressScreen({super.key});

  @override
  ConsumerState<MyAddressScreen> createState() => _MyAddressScreenState();
}

class _MyAddressScreenState extends ConsumerState<MyAddressScreen> {
  AddressModel? _address;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    const PosthogAnalytics().capture('address_screen_opened');
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await ref.read(checkoutRepositoryProvider).getAddresses();
      if (!mounted) return;
      setState(() => _address = list.isEmpty ? null : list.first);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger votre adresse.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForm({AddressModel? existing}) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => AddressFormSheet(
        cityRepository: ref.read(cityRepositoryProvider),
        initial: existing,
        onSave: (data) => _save(data, existing: existing),
      ),
    );
  }

  Future<bool> _save(
    Map<String, dynamic> data, {
    AddressModel? existing,
  }) async {
    final repo = ref.read(checkoutRepositoryProvider);
    try {
      // PATCH when editing; POST is an upsert server-side, so a buyer who
      // somehow reaches creation with a row already on file still ends up with
      // one address rather than two.
      final saved = existing == null
          ? await repo.createAddress(data)
          : await repo.updateAddress(existing.id, data);

      if (!mounted) return true;
      // Adopt the server's response directly so the screen is correct without a
      // refetch or a manual pull-to-refresh.
      setState(() => _address = saved);
      showAppSnackbar(
        context,
        message: existing == null ? 'Adresse enregistrée' : 'Adresse mise à jour',
      );
      return true;
    } catch (_) {
      if (mounted) {
        showAppSnackbar(
          context,
          message: "Impossible d'enregistrer l'adresse",
          tone: AppSnackbarTone.error,
        );
      }
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
        title: const Text('Mon adresse'),
      ),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          AppErrorState(message: _error!, onRetry: _load),
        ],
      );
    }

    final address = _address;
    if (address == null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          AppEmptyState(
            icon: Icons.location_on_outlined,
            title: 'Aucune adresse enregistrée',
            message:
                'Ajoutez votre adresse de livraison pour commander plus vite.',
            actionLabel: 'Ajouter mon adresse',
            onAction: () => _openForm(),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _AddressCard(address: address, onEdit: () => _openForm(existing: address)),
        const SizedBox(height: 12),
        Text(
          'Cette adresse est utilisée pour toutes vos commandes.',
          style: const TextStyle(
            fontSize: 12,
            color: TekaColors.mutedForeground,
          ),
        ),
      ],
    );
  }
}

class _AddressCard extends StatelessWidget {
  final AddressModel address;
  final VoidCallback onEdit;

  const _AddressCard({required this.address, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    final recipient = address.displayRecipient;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                size: 20,
                color: TekaColors.tekaRed,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      address.displayAddress,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: TekaColors.foreground,
                      ),
                    ),
                    if (address.reference != null &&
                        address.reference!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        address.reference!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    ],
                    if (recipient.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        recipient,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Modifier'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 12),
                side: const BorderSide(color: TekaColors.border),
                foregroundColor: TekaColors.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
