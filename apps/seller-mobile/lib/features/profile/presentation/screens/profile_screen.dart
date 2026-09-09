import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/providers/seller_refresh_provider.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../../verification/presentation/verification_status.dart';
import '../../data/profile_repository.dart';

/// « Compte » (Seller UX PR F, 2026-09-08): who the seller is (shop, name,
/// email, town · commune) with the two statuses that matter — the account
/// approval and the verification badge — in words and tone, then the menu in
/// three groups. The API (`GET /v1/auth/me`) is the only source; the screen
/// reloads when an edit screen returns so a saved name or town shows at once.
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

  Future<void> _open(String route, String item) async {
    const PosthogAnalytics().capture(
      'seller_account_menu_item_tapped',
      properties: {'item': item},
    );
    await context.push(route);
    // An edit screen (name, shop, verification) may have changed what the
    // header shows — refetch silently, keeping the current content meanwhile.
    if (mounted && route.startsWith('/profile/')) _load();
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
    // A saved person / shop (profile revision), an uploaded document or a
    // verification push (verification revision) change what the header
    // shows: refetch, keeping the current content meanwhile.
    ref.listen<(int, int)>(
      sellerRefreshProvider.select((r) => (r.profile, r.verification)),
      (prev, next) {
        if (prev != null && next != prev) _load();
      },
    );
    if (_loading) {
      return const Scaffold(
        appBar: _AccountAppBar(),
        body: ReadableColumn(padding: EdgeInsets.zero, child: ProfileSkeleton()),
      );
    }
    if (_error != null && _user == null) {
      return Scaffold(
        appBar: const _AccountAppBar(),
        body: SellerListState(
          child: SellerListMessage(
            icon: Icons.cloud_off,
            title: 'Compte indisponible',
            message: _error!,
            actionLabel: 'Réessayer',
            onAction: _load,
          ),
        ),
      );
    }

    final user = _user;
    final sellerProfile = user?.sellerProfile;
    final verification =
        VerificationStatusUi.of(sellerProfile?.verificationStatus ?? 'NOT_SUBMITTED');

    return Scaffold(
      backgroundColor: TekaColors.pageBackground,
      appBar: const _AccountAppBar(),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: RefreshIndicator(
          color: TekaColors.tekaRed,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
                TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xl),
            children: [
              if (_error != null) ...[
                DashboardErrorRow(
                    title: 'Compte non actualisé', onRetry: _load),
                const SizedBox(height: TekaSpacing.xs),
              ],
              SellerIdentityCard(
                user: user,
                onEdit: () => _open('/profile/personal', 'personal_info'),
              ),
              const SizedBox(height: TekaSpacing.md),
              _MenuSection(
                title: 'Activité vendeur',
                children: [
                  _AccountMenuTile(
                    icon: Icons.receipt_long_outlined,
                    title: 'Commandes',
                    subtitle: 'Préparer, confirmer ou refuser',
                    onTap: () => _open('/orders', 'orders'),
                  ),
                  _AccountMenuTile(
                    icon: Icons.inventory_2_outlined,
                    title: 'Produits',
                    subtitle: 'Catalogue, stock et photos',
                    onTap: () => _open('/products', 'products'),
                  ),
                  _AccountMenuTile(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Revenus',
                    subtitle: 'Solde disponible, gains et virements',
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
                title: 'Boutique et compte',
                children: [
                  _AccountMenuTile(
                    icon: Icons.storefront_outlined,
                    title: 'Profil de la boutique',
                    subtitle: 'Nom, ville, commune, téléphone et description',
                    onTap: () => _open('/profile/shop', 'shop_profile'),
                  ),
                  _AccountMenuTile(
                    icon: verification.icon,
                    title: 'Vérification de la boutique',
                    subtitle: verification.actionRequired
                        ? '${verification.label} · nouveaux documents à fournir'
                        : verification.label,
                    trailingPill: verification.actionRequired
                        ? 'Action requise'
                        : null,
                    onTap: () => _open('/profile/verification', 'verification'),
                  ),
                  _AccountMenuTile(
                    icon: Icons.badge_outlined,
                    title: 'Informations personnelles',
                    subtitle: 'Nom, email de connexion et photo',
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
                  _AccountMenuTile(
                    icon: Icons.help_outline,
                    title: 'Aide et support',
                    subtitle: 'Contacts et informations utiles',
                    onTap: () => _open('/profile/help', 'help_support'),
                  ),
                ],
              ),
              _LogoutButton(onPressed: _confirmLogout),
            ],
          ),
        ),
      ),
    );
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

/// Who the seller is, on a white card: shop name first (it is what buyers
/// see), the person, the login email, the town · commune, then the two
/// statuses as labelled badges — colour is never the only signal.
class SellerIdentityCard extends StatelessWidget {
  const SellerIdentityCard({super.key, required this.user, required this.onEdit});

  final ProfileUser? user;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final sellerProfile = user?.sellerProfile;
    final fullName = [user?.firstName?.trim(), user?.lastName?.trim()]
        .where((part) => part != null && part.isNotEmpty)
        .join(' ');
    final businessName = sellerProfile?.businessName.trim() ?? '';
    final email = user?.email?.trim() ?? '';
    final place = [sellerProfile?.cityName, sellerProfile?.communeName]
        .where((p) => p != null && p.trim().isNotEmpty)
        .join(' · ');
    final application =
        ApplicationStatusUi.of(sellerProfile?.applicationStatus ?? 'PENDING');
    final verification = VerificationStatusUi.of(
        sellerProfile?.verificationStatus ?? 'NOT_SUBMITTED');
    final avatarUrl = user?.avatar;
    final hasAvatar = avatarUrl != null && avatarUrl.isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(TekaSpacing.md),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: TekaRadius.lgAll,
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(
                child: CircleAvatar(
                  radius: 28,
                  backgroundColor: TekaColors.muted,
                  backgroundImage: hasAvatar ? NetworkImage(avatarUrl) : null,
                  child: hasAvatar
                      ? null
                      : Text(_initials(user),
                          style: theme.titleMedium?.copyWith(
                              color: TekaColors.foreground,
                              fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: TekaSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      businessName.isEmpty ? 'Boutique Teka RDC' : businessName,
                      style: theme.titleLarge,
                    ),
                    if (fullName.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(fullName, style: theme.bodyMedium),
                    ],
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: theme.bodySmall
                              ?.copyWith(color: TekaColors.mutedForeground)),
                    ],
                    if (place.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(children: [
                        const Icon(Icons.place_outlined,
                            size: 14, color: TekaColors.mutedForeground),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(place,
                              style: theme.bodySmall?.copyWith(
                                  color: TekaColors.mutedForeground)),
                        ),
                      ]),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: TekaSpacing.xs),
              IconButton(
                onPressed: onEdit,
                tooltip: 'Modifier mes informations',
                icon: const Icon(Icons.edit_outlined),
              ),
            ],
          ),
          const SizedBox(height: TekaSpacing.sm),
          Wrap(
            spacing: TekaSpacing.xs,
            runSpacing: TekaSpacing.xs,
            children: [
              SellerStatusBadge(
                  label: application.label,
                  icon: application.icon,
                  color: application.color,
                  compact: true),
              SellerStatusBadge(
                  label: verification.label,
                  icon: verification.icon,
                  color: verification.color,
                  compact: true),
            ],
          ),
        ],
      ),
    );
  }

  static String _initials(ProfileUser? user) {
    final value = [user?.firstName?.trim(), user?.lastName?.trim()]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'V' : value;
  }
}

class _MenuSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _MenuSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: TekaSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(
                left: TekaSpacing.xxs, bottom: TekaSpacing.xs),
            child: Text(
              title,
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: TekaColors.mutedForeground),
            ),
          ),
          // A Material, not a DecoratedBox: ListTile paints its ripple on the
          // nearest Material, so a decorated box above it swallowed every
          // tap feedback (framework assertion, caught by the tests).
          Material(
            color: TekaColors.background,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: TekaRadius.lgAll,
              side: const BorderSide(color: TekaColors.border),
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
  final String? trailingPill;
  final VoidCallback onTap;

  const _AccountMenuTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailingPill,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    // The « Action requise » pill sits under the subtitle, not in the
    // trailing slot: a trailing pill + chevron consumed the whole tile at
    // 320 px / 1.5× (layout assertion caught by the tests).
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
          horizontal: TekaSpacing.sm, vertical: TekaSpacing.xxs),
      leading: _IconBadge(icon: icon, accent: trailingPill != null),
      title: Text(title, style: theme.titleSmall),
      subtitle: subtitle == null && trailingPill == null
          ? null
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (subtitle != null)
                  Text(subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.bodySmall
                          ?.copyWith(color: TekaColors.mutedForeground)),
                if (trailingPill != null)
                  Padding(
                    padding: const EdgeInsets.only(top: TekaSpacing.xxs),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: TekaSpacing.xs, vertical: 2),
                      decoration: BoxDecoration(
                          color: TekaColors.destructiveSubtle,
                          borderRadius: TekaRadius.pillAll),
                      child: Text(trailingPill!,
                          style: theme.labelSmall?.copyWith(
                              color: TekaColors.destructiveForeground,
                              fontWeight: FontWeight.w700)),
                    ),
                  ),
              ],
            ),
      trailing: const Icon(Icons.chevron_right_rounded,
          color: TekaColors.mutedForeground),
      onTap: onTap,
    );
  }
}

/// Neutral icon frame; the destructive frame marks the one row that needs
/// the seller (a rejected verification), so brand red stays on actions.
class _IconBadge extends StatelessWidget {
  final IconData icon;
  final bool accent;

  const _IconBadge({required this.icon, this.accent = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: accent ? TekaColors.destructiveSubtle : TekaColors.muted,
        borderRadius: TekaRadius.mdAll,
      ),
      child: Icon(icon,
          size: 19,
          color: accent
              ? TekaColors.destructiveForeground
              : TekaColors.neutralForeground),
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

/// Static placeholder shaped like the account (no spinner).
class ProfileSkeleton extends StatelessWidget {
  const ProfileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget card(List<Widget> children) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(TekaSpacing.md),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: children),
        );
    return Semantics(
      label: 'Chargement de votre compte',
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
              TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xl),
          children: [
            card(const [
              SkeletonBlock(width: 200, height: 22),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 140, height: 14),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 180, height: 14),
              SizedBox(height: TekaSpacing.sm),
              Wrap(spacing: TekaSpacing.xs, children: [
                SkeletonBlock(width: 120, height: 24, pill: true),
                SkeletonBlock(width: 100, height: 24, pill: true),
              ]),
            ]),
            const SizedBox(height: TekaSpacing.md),
            const SkeletonBlock(width: 110, height: 14),
            const SizedBox(height: TekaSpacing.xs),
            card(const [
              SkeletonBlock(width: 160, height: 16),
              SizedBox(height: TekaSpacing.md),
              SkeletonBlock(width: 200, height: 16),
              SizedBox(height: TekaSpacing.md),
              SkeletonBlock(width: 140, height: 16),
            ]),
          ],
        ),
      ),
    );
  }
}
