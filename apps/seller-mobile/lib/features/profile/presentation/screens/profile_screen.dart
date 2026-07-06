import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/profile_repository.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _loading = true;
  String? _error;
  ProfileUser? _user;

  @override
  void initState() {
    super.initState();
    const PosthogAnalytics().capture('seller_account_tab_opened');
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _loading = _user == null;
    });
    try {
      final me = await ref.read(profileRepositoryProvider).getMe();
      if (!mounted) return;
      setState(() => _user = me);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger votre compte vendeur.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(String route, String item) {
    const PosthogAnalytics().capture(
      'seller_account_menu_item_tapped',
      properties: {'item': item},
    );
    context.push(route);
  }

  Future<void> _confirmLogout() async {
    const PosthogAnalytics().capture('seller_logout_tapped');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: const Text(
          'Vous devrez vous reconnecter pour gérer vos commandes et produits.',
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
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go('/auth/login');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        appBar: _AccountAppBar(),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null && _user == null) {
      return Scaffold(
        appBar: const _AccountAppBar(),
        body: _ErrorState(message: _error!, onRetry: _load),
      );
    }

    final user = _user;
    final sellerProfile = user?.sellerProfile;
    final fullName = [
      user?.firstName?.trim(),
      user?.lastName?.trim(),
    ].where((part) => part != null && part.isNotEmpty).join(' ');
    final displayName = fullName.isEmpty ? 'Compte vendeur' : fullName;
    final businessName = sellerProfile?.businessName.trim();

    return Scaffold(
      backgroundColor: TekaColors.pageBackground,
      appBar: const _AccountAppBar(),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            _SellerHeader(
              displayName: displayName,
              businessName: businessName == null || businessName.isEmpty
                  ? 'Boutique Teka RDC'
                  : businessName,
              email: user?.email,
              avatarUrl: user?.avatar,
              status: sellerProfile?.applicationStatus ?? 'PENDING',
              initials: _initials(user),
              onEdit: () => _open('/profile/personal', 'personal_info'),
            ),
            const SizedBox(height: 16),
            _MenuSection(
              title: 'Activité vendeur',
              children: [
                _AccountMenuTile(
                  icon: Icons.receipt_long_outlined,
                  title: 'Commandes',
                  subtitle: 'Préparer, confirmer ou rejeter',
                  onTap: () => _open('/orders', 'orders'),
                ),
                _AccountMenuTile(
                  icon: Icons.inventory_2_outlined,
                  title: 'Produits',
                  subtitle: 'Catalogue, stock et images',
                  onTap: () => _open('/products', 'products'),
                ),
                _AccountMenuTile(
                  icon: Icons.account_balance_wallet_outlined,
                  title: 'Gains et paiements',
                  subtitle: 'Solde, ventes et demandes de paiement',
                  onTap: () => _open('/earnings', 'earnings'),
                ),
                _AccountMenuTile(
                  icon: Icons.campaign_outlined,
                  title: 'Promotions',
                  subtitle: 'Réductions actives et programmées',
                  onTap: () => _open('/promotions', 'promotions'),
                ),
                _AccountMenuTile(
                  icon: Icons.star_border_rounded,
                  title: 'Avis clients',
                  subtitle: 'Notes reçues sur vos produits',
                  onTap: () => _open('/reviews', 'reviews'),
                ),
              ],
            ),
            _MenuSection(
              title: 'Paramètres',
              children: [
                _AccountMenuTile(
                  icon: Icons.storefront_outlined,
                  title: 'Profil de la boutique',
                  subtitle: 'Nom, ville, téléphone et description',
                  onTap: () => _open('/profile/shop', 'shop_profile'),
                ),
                _AccountMenuTile(
                  icon: Icons.badge_outlined,
                  title: 'Informations personnelles',
                  subtitle: 'Nom, email et photo',
                  onTap: () => _open('/profile/personal', 'personal_info'),
                ),
                _AccountMenuTile(
                  icon: Icons.notifications_none_rounded,
                  title: 'Notifications',
                  subtitle: 'Commandes, promotions et annonces',
                  onTap: () =>
                      _open('/profile/notifications', 'notification_settings'),
                ),
                _AccountMenuTile(
                  icon: Icons.verified_user_outlined,
                  title: 'Sécurité du compte',
                  subtitle: 'Mot de passe et appareils connectés',
                  onTap: () => _open('/profile/security', 'security'),
                ),
              ],
            ),
            _MenuSection(
              title: 'Communication',
              children: [
                _AccountMenuTile(
                  icon: Icons.notifications_active_outlined,
                  title: 'Centre de notifications',
                  subtitle: 'Alertes de commandes et produits',
                  onTap: () => _open('/notifications', 'notifications'),
                ),
              ],
            ),
            _LogoutButton(onPressed: _confirmLogout),
          ],
        ),
      ),
    );
  }

  String _initials(ProfileUser? user) {
    final value = [
      user?.firstName?.trim(),
      user?.lastName?.trim(),
    ]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'V' : value;
  }
}

class _AccountAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _AccountAppBar();

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(title: const Text('Compte'));
  }
}

class _SellerHeader extends StatelessWidget {
  final String displayName;
  final String businessName;
  final String? email;
  final String? avatarUrl;
  final String status;
  final String initials;
  final VoidCallback onEdit;

  const _SellerHeader({
    required this.displayName,
    required this.businessName,
    required this.email,
    required this.avatarUrl,
    required this.status,
    required this.initials,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final hasAvatar = avatarUrl != null && avatarUrl!.isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: TekaColors.foreground,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: TekaColors.foreground.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 31,
            backgroundColor: TekaColors.tekaRed.withValues(alpha: 0.12),
            backgroundImage: hasAvatar ? NetworkImage(avatarUrl!) : null,
            child: hasAvatar
                ? null
                : Text(
                    initials,
                    style: const TextStyle(
                      color: TekaColors.tekaRed,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  businessName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.72),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (email != null && email!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    email!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.58),
                      fontSize: 12,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                _StatusChip(status: status),
              ],
            ),
          ),
          IconButton.filledTonal(
            onPressed: onEdit,
            tooltip: 'Modifier le profil',
            icon: const Icon(Icons.edit_outlined),
            style: IconButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.10),
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      'APPROVED' => 'Boutique approuvée',
      'REJECTED' => 'Demande rejetée',
      _ => 'Demande en révision',
    };
    final color = switch (status) {
      'APPROVED' => TekaColors.success,
      'REJECTED' => TekaColors.destructive,
      _ => TekaColors.warning,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.94),
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _MenuSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _MenuSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              title,
              style: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: TekaColors.border),
            ),
            child: Column(children: _withDividers(children)),
          ),
        ],
      ),
    );
  }

  List<Widget> _withDividers(List<Widget> items) {
    final result = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) result.add(const Divider(height: 1, color: TekaColors.border));
      result.add(items[i]);
    }
    return result;
  }
}

class _AccountMenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _AccountMenuTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      leading: _IconBadge(icon: icon),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: TekaColors.foreground,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _IconBadge extends StatelessWidget {
  final IconData icon;

  const _IconBadge({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: TekaColors.tekaRed.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, size: 19, color: TekaColors.tekaRed),
    );
  }
}

class _LogoutButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _LogoutButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: const Icon(Icons.logout_rounded),
      label: const Text('Se déconnecter'),
      style: OutlinedButton.styleFrom(
        foregroundColor: TekaColors.destructive,
        side: const BorderSide(color: TekaColors.destructive),
        minimumSize: const Size.fromHeight(48),
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
