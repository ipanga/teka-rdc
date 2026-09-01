import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
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
  BuyerProfile? _user;

  @override
  void initState() {
    super.initState();
    const PosthogAnalytics().capture('account_tab_opened');
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
      setState(() => _error = 'Impossible de charger votre compte.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(String route, String item) {
    const PosthogAnalytics().capture(
      'account_menu_item_tapped',
      properties: {'item': item},
    );
    context.push(route);
  }

  Future<void> _confirmLogout() async {
    const PosthogAnalytics().capture('logout_tapped');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: const Text(
          'Votre panier et vos favoris resteront associés à votre compte.',
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
    if (mounted) context.go('/');
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
        body: AppErrorState(message: _error, onRetry: _load),
      );
    }

    final user = _user;
    final fullName = [
      user?.firstName?.trim(),
      user?.lastName?.trim(),
    ].where((part) => part != null && part.isNotEmpty).join(' ');
    final displayName = fullName.isEmpty ? 'Compte Teka' : fullName;
    final initials = _initials(user);

    return Scaffold(
      backgroundColor: TekaColors.background,
      appBar: const _AccountAppBar(),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            _AccountHeader(
              displayName: displayName,
              phone: user?.phone,
              email: user?.email,
              avatarUrl: user?.avatar,
              initials: initials,
              onEditProfile: () =>
                  _open('/profile/informations', 'personal_info'),
            ),
            const SizedBox(height: 16),
            _MenuSection(
              title: 'Mon compte Teka',
              children: [
                _AccountMenuTile(
                  icon: Icons.receipt_long_outlined,
                  title: 'Mes commandes',
                  subtitle: 'Suivi, annulation et retours',
                  onTap: () => _open('/orders', 'orders'),
                ),
                _AccountMenuTile(
                  icon: Icons.favorite_border_rounded,
                  title: 'Mes favoris',
                  subtitle: 'Produits sauvegardés',
                  onTap: () => _open('/wishlist', 'wishlist'),
                ),
                _AccountMenuTile(
                  icon: Icons.notifications_none_rounded,
                  title: 'Boîte de réception',
                  subtitle: 'Commandes, promotions et annonces',
                  onTap: () => _open('/notifications', 'notifications'),
                ),
              ],
            ),
            _MenuSection(
              title: 'Paramètres',
              children: [
                _AccountMenuTile(
                  icon: Icons.location_on_outlined,
                  title: 'Mon adresse',
                  subtitle: 'Votre adresse de livraison',
                  onTap: () => _open('/profile/addresses', 'addresses'),
                ),
                _AccountMenuTile(
                  icon: Icons.badge_outlined,
                  title: 'Informations personnelles',
                  subtitle: 'Nom, email, photo et numéro WhatsApp',
                  onTap: () => _open('/profile/informations', 'personal_info'),
                ),
                _AccountMenuTile(
                  icon: Icons.tune_rounded,
                  title: 'Notifications',
                  subtitle: 'Commandes, promotions et annonces',
                  onTap: () =>
                      _open('/profile/notifications', 'notification_settings'),
                ),
                _AccountMenuTile(
                  icon: Icons.verified_user_outlined,
                  title: 'Gestion du compte',
                  subtitle: 'Appareils connectés et sécurité',
                  onTap: () => _open('/profile/security', 'security'),
                ),
              ],
            ),
            _MenuSection(
              title: 'Aide',
              children: [
                _AccountMenuTile(
                  icon: Icons.help_outline_rounded,
                  title: "Centre d'aide",
                  subtitle: 'Aide pour acheter sur Teka RDC',
                  onTap: () => _open('/pages/help', 'help'),
                ),
                _AccountMenuTile(
                  icon: Icons.shopping_bag_outlined,
                  title: 'Comment acheter',
                  subtitle: 'Passer une commande étape par étape',
                  onTap: () => _open('/pages/how-to-buy', 'how_to_buy'),
                ),
                _AccountMenuTile(
                  icon: Icons.support_agent_outlined,
                  title: 'Contacter le support',
                  subtitle: 'Assistance commandes et compte',
                  onTap: () => _open('/pages/contact', 'support'),
                ),
                _AccountMenuTile(
                  icon: Icons.quiz_outlined,
                  title: 'FAQ',
                  subtitle: 'Questions fréquentes',
                  onTap: () => _open('/pages/faq', 'faq'),
                ),
                _AccountMenuTile(
                  icon: Icons.info_outline_rounded,
                  title: 'À propos',
                  subtitle: 'En savoir plus sur Teka RDC',
                  onTap: () => _open('/pages/about', 'about'),
                ),
                _AccountMenuTile(
                  icon: Icons.description_outlined,
                  title: "Conditions d'utilisation",
                  onTap: () => _open('/pages/terms', 'terms'),
                ),
                _AccountMenuTile(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Politique de confidentialité',
                  onTap: () => _open('/pages/privacy', 'privacy'),
                ),
              ],
            ),
            _LogoutButton(onPressed: _confirmLogout),
          ],
        ),
      ),
    );
  }

  String _initials(BuyerProfile? user) {
    final value = [
      user?.firstName?.trim(),
      user?.lastName?.trim(),
    ]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'T' : value;
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

class _AccountHeader extends StatelessWidget {
  final String displayName;
  final String? phone;
  final String? email;
  final String? avatarUrl;
  final String initials;
  final VoidCallback onEditProfile;

  const _AccountHeader({
    required this.displayName,
    required this.phone,
    required this.email,
    required this.avatarUrl,
    required this.initials,
    required this.onEditProfile,
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
            backgroundColor: TekaColors.tekaRedSubtle,
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
                  displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  phone == null || phone!.isEmpty
                      ? 'Numéro WhatsApp vérifié'
                      : phone!,
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
              ],
            ),
          ),
          IconButton.filledTonal(
            onPressed: onEditProfile,
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
      if (i > 0) {
        result.add(const Divider(height: 1, color: TekaColors.border));
      }
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
        color: TekaColors.tekaRedSubtle,
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
