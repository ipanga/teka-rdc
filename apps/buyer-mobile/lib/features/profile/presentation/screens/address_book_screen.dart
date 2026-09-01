import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../checkout/data/checkout_repository.dart';
import '../../../checkout/data/models/checkout_model.dart';

class AddressBookScreen extends ConsumerStatefulWidget {
  const AddressBookScreen({super.key});

  @override
  ConsumerState<AddressBookScreen> createState() => _AddressBookScreenState();
}

class _AddressBookScreenState extends ConsumerState<AddressBookScreen> {
  List<AddressModel>? _addresses;
  bool _loading = true;
  String? _error;
  String? _actionAddressId;

  @override
  void initState() {
    super.initState();
    const PosthogAnalytics().capture('address_book_opened');
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
      setState(() => _addresses = list);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger vos adresses.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setDefault(AddressModel address) async {
    if (address.isDefault) return;
    setState(() => _actionAddressId = address.id);
    try {
      await ref.read(checkoutRepositoryProvider).setDefaultAddress(address.id);
      await _load();
      if (!mounted) return;
      _toast('Adresse définie par défaut');
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de modifier l'adresse par défaut", error: true);
    } finally {
      if (mounted) setState(() => _actionAddressId = null);
    }
  }

  Future<void> _confirmDelete(AddressModel address) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Supprimer cette adresse ?'),
        content: Text(
          address.displayAddress.isEmpty
              ? 'Cette adresse sera retirée de votre carnet.'
              : address.displayAddress,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _delete(address.id);
  }

  Future<void> _delete(String id) async {
    setState(() => _actionAddressId = id);
    try {
      await ref.read(checkoutRepositoryProvider).deleteAddress(id);
      if (!mounted) return;
      setState(() {
        _addresses = _addresses?.where((address) => address.id != id).toList();
      });
      _toast('Adresse supprimée');
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de supprimer l'adresse", error: true);
    } finally {
      if (mounted) setState(() => _actionAddressId = null);
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
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
        title: const Text("Carnet d'adresses"),
      ),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _addresses == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return AppErrorState(message: _error, onRetry: _load);
    }

    final addresses = _addresses ?? const <AddressModel>[];
    if (addresses.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 72),
          AppEmptyState(
            icon: Icons.location_on_outlined,
            title: 'Aucune adresse enregistrée',
            message:
                'Vous pourrez ajouter une adresse au moment de passer une commande.',
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: addresses.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final address = addresses[index];
        return _AddressCard(
          address: address,
          busy: _actionAddressId == address.id,
          disabled: _actionAddressId != null,
          onSetDefault: () => _setDefault(address),
          onDelete: () => _confirmDelete(address),
        );
      },
    );
  }
}

class _AddressCard extends StatelessWidget {
  final AddressModel address;
  final bool busy;
  final bool disabled;
  final VoidCallback onSetDefault;
  final VoidCallback onDelete;

  const _AddressCard({
    required this.address,
    required this.busy,
    required this.disabled,
    required this.onSetDefault,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: address.isDefault ? TekaColors.tekaRed : TekaColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.location_on_outlined,
                    color: TekaColors.tekaRed),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    address.label?.isNotEmpty == true
                        ? address.label!
                        : 'Adresse de livraison',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: TekaColors.foreground,
                    ),
                  ),
                ),
                if (address.isDefault)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: TekaColors.tekaRedSubtle,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Par défaut',
                      style: TextStyle(
                        color: TekaColors.tekaRed,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
              ],
            ),
            if (address.displayAddress.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                address.displayAddress,
                style: const TextStyle(
                  color: TekaColors.foreground,
                  height: 1.35,
                ),
              ),
            ],
            if (address.displayRecipient.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                address.displayRecipient,
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 13,
                ),
              ),
            ],
            if (address.reference != null && address.reference!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                address.reference!,
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 13,
                  height: 1.3,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        disabled || address.isDefault ? null : onSetDefault,
                    child: Text(
                      busy ? 'Mise à jour...' : 'Définir par défaut',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                IconButton(
                  onPressed: disabled ? null : onDelete,
                  tooltip: 'Supprimer',
                  color: TekaColors.destructive,
                  icon: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
