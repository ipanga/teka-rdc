import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_bar_actions.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/profile_repository.dart';

/// Mirrors buyer-web's `/profil` page (PR #128) in Flutter. Simpler than the
/// seller-mobile equivalent because buyers don't have business info or a
/// password — phone is the auth identifier (WhatsApp OTP) and is shown
/// read-only with an explanatory hint.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _picker = ImagePicker();

  bool _loading = true;
  bool _uploading = false;
  bool _saving = false;
  bool _notifSaving = false;

  BuyerProfile? _user;
  NotificationPrefs? _notifPrefs;

  List<SessionDto>? _sessions;
  bool _sessionsLoading = false;
  // null = idle, "all" = bulk revoke in flight, otherwise = session id being revoked.
  String? _sessionAction;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repo = ref.read(profileRepositoryProvider);
      final me = await repo.getMe();
      // Notification prefs are best-effort — failure shouldn't block the
      // profile screen from rendering. Defaults are all-on.
      NotificationPrefs prefs;
      try {
        prefs = await repo.getNotificationPrefs();
      } catch (_) {
        prefs = const NotificationPrefs(
          smsOrderUpdates: true,
          smsBroadcasts: true,
        );
      }
      if (!mounted) return;
      setState(() {
        _user = me;
        _notifPrefs = prefs;
        _firstNameCtrl.text = me.firstName ?? '';
        _lastNameCtrl.text = me.lastName ?? '';
        _emailCtrl.text = me.email ?? '';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    if (!mounted) return;
    setState(() => _sessionsLoading = true);
    try {
      final list = await ref.read(profileRepositoryProvider).listSessions();
      if (!mounted) return;
      setState(() => _sessions = list);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sessions = const <SessionDto>[]);
      _toast("Impossible de charger la liste des appareils", error: true);
    } finally {
      if (mounted) setState(() => _sessionsLoading = false);
    }
  }

  Future<void> _revokeSession(String id) async {
    setState(() => _sessionAction = id);
    try {
      await ref.read(profileRepositoryProvider).revokeSession(id);
      if (!mounted) return;
      setState(
        () => _sessions = _sessions?.where((s) => s.id != id).toList(),
      );
      _toast("Appareil déconnecté");
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de déconnecter cet appareil", error: true);
    } finally {
      if (mounted) setState(() => _sessionAction = null);
    }
  }

  Future<void> _revokeAllOtherSessions() async {
    setState(() => _sessionAction = 'all');
    try {
      await ref.read(profileRepositoryProvider).revokeAllOtherSessions();
      if (!mounted) return;
      setState(
        () => _sessions = _sessions?.where((s) => s.current).toList(),
      );
      _toast("Appareil déconnecté");
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de déconnecter cet appareil", error: true);
    } finally {
      if (mounted) setState(() => _sessionAction = null);
    }
  }

  Future<void> _updateNotifPref({
    bool? smsOrderUpdates,
    bool? smsBroadcasts,
  }) async {
    final previous = _notifPrefs;
    setState(() {
      _notifPrefs = NotificationPrefs(
        smsOrderUpdates: smsOrderUpdates ?? previous?.smsOrderUpdates ?? true,
        smsBroadcasts: smsBroadcasts ?? previous?.smsBroadcasts ?? true,
      );
      _notifSaving = true;
    });
    try {
      final next =
          await ref.read(profileRepositoryProvider).updateNotificationPrefs(
                smsOrderUpdates: smsOrderUpdates,
                smsBroadcasts: smsBroadcasts,
              );
      if (!mounted) return;
      setState(() => _notifPrefs = next);
    } catch (_) {
      if (!mounted) return;
      setState(() => _notifPrefs = previous);
      _toast("Erreur lors de la mise à jour", error: true);
    } finally {
      if (mounted) setState(() => _notifSaving = false);
    }
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? TekaColors.destructive : null,
      ),
    );
  }

  Future<void> _pickAvatar() async {
    try {
      // image_picker's built-in resize keeps avatars well under the API's
      // 5 MB cap — no separate compress step needed for buyer avatars.
      final xFile = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );
      if (xFile == null || !mounted) return;
      setState(() => _uploading = true);
      final url = await ref
          .read(profileRepositoryProvider)
          .uploadAvatar(File(xFile.path));
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _user = BuyerProfile(
          id: _user!.id,
          firstName: _user!.firstName,
          lastName: _user!.lastName,
          email: _user!.email,
          phone: _user!.phone,
          avatar: url,
          role: _user!.role,
        );
      });
      _toast("Profil mis à jour");
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _toast("Erreur lors de l'envoi de la photo", error: true);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final body = <String, String>{};
      if (_firstNameCtrl.text.trim() != (_user?.firstName ?? '')) {
        body['firstName'] = _firstNameCtrl.text.trim();
      }
      if (_lastNameCtrl.text.trim() != (_user?.lastName ?? '')) {
        body['lastName'] = _lastNameCtrl.text.trim();
      }
      if (_emailCtrl.text.trim() != (_user?.email ?? '')) {
        body['email'] = _emailCtrl.text.trim();
      }
      if (body.isEmpty) return;
      await ref.read(profileRepositoryProvider).updateProfile(
            firstName: body['firstName'],
            lastName: body['lastName'],
            email: body['email'],
          );
      await _load();
      _toast("Profil mis à jour");
    } catch (_) {
      _toast("Erreur lors de l'enregistrement", error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text("Compte")),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final initials = ((_user?.firstName?.isNotEmpty == true
                ? _user!.firstName![0]
                : '') +
            (_user?.lastName?.isNotEmpty == true ? _user!.lastName![0] : ''))
        .toUpperCase();
    final fullName = [
      _user?.firstName?.trim(),
      _user?.lastName?.trim(),
    ].where((part) => part != null && part.isNotEmpty).join(' ');
    final displayName = fullName.isEmpty ? "Compte Teka" : fullName;

    return Scaffold(
      appBar: AppBar(
        title: Text("Compte"),
        actions: [
          TekaAppBarIconButton(
            icon: Icons.logout,
            tooltip: "Se déconnecter",
            destructive: true,
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              // Land on the guest home (browsing stays open after logout);
              // protected tabs re-prompt for login on demand.
              if (context.mounted) context.go('/');
            },
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _AccountSummaryCard(
              displayName: displayName,
              phone: _user?.phone,
              avatarUrl: _user?.avatar,
              initials: initials.isEmpty ? 'T' : initials,
              uploading: _uploading,
              onChangePhoto: _pickAvatar,
            ),

            // Personal
            _Section(
              title: "Informations personnelles",
              subtitle:
                  "Gardez vos coordonnées à jour pour faciliter le suivi de vos commandes.",
              icon: Icons.badge_outlined,
              child: Column(
                children: [
                  TextField(
                    controller: _firstNameCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: "Prénom",
                      prefixIcon: const Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _lastNameCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: "Nom",
                      prefixIcon: const Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: "Email",
                      prefixIcon: const Icon(Icons.alternate_email),
                      helperText:
                          "Optionnel — utilisé pour les confirmations de commande.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Phone is the WhatsApp OTP auth identifier — not editable
                  // from the app. Read-only with hint pointing to support.
                  TextField(
                    controller: TextEditingController(text: _user?.phone ?? ''),
                    readOnly: true,
                    enableInteractiveSelection: false,
                    decoration: InputDecoration(
                      labelText: "Numéro WhatsApp",
                      prefixIcon: const Icon(Icons.phone_outlined),
                      suffixIcon: const Icon(Icons.lock_outline),
                      helperText:
                          "Numéro de connexion à votre compte. Contactez le support pour le modifier.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _saving ? null : _save,
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
                      label: Text(
                        _saving ? "Enregistrement..." : "Enregistrer",
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Notifications
            _Section(
              title: "Notifications",
              subtitle:
                  "Choisissez les alertes utiles. Les codes WhatsApp restent toujours envoyés.",
              icon: Icons.notifications_none_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SwitchListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    tileColor: TekaColors.surfaceMuted,
                    title: Text("Mises à jour de commande"),
                    subtitle:
                        Text("Confirmation, expédition, livraison, annulation"),
                    value: _notifPrefs?.smsOrderUpdates ?? true,
                    onChanged: _notifSaving
                        ? null
                        : (v) => _updateNotifPref(smsOrderUpdates: v),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    tileColor: TekaColors.surfaceMuted,
                    title: Text("Annonces et promotions"),
                    subtitle:
                        Text("Messages marketing envoyés par l'équipe Teka"),
                    value: _notifPrefs?.smsBroadcasts ?? true,
                    onChanged: _notifSaving
                        ? null
                        : (v) => _updateNotifPref(smsBroadcasts: v),
                  ),
                ],
              ),
            ),

            // Sessions
            _SessionsCard(
              sessions: _sessions,
              loading: _sessionsLoading,
              action: _sessionAction,
              onRevoke: _revokeSession,
              onRevokeAll: _revokeAllOtherSessions,
            ),

            // Quick links — Orders lives under the account (it is not a
            // bottom-nav tab). Favorites moved to its own tab.
            _Section(
              title: 'Raccourcis',
              icon: Icons.apps_rounded,
              child: Column(
                children: [
                  _QuickLinkTile(
                    icon: Icons.receipt_long_outlined,
                    title: "Mes commandes",
                    onTap: () => context.push('/orders'),
                  ),
                  const Divider(height: 1),
                  _QuickLinkTile(
                    icon: Icons.notifications_none_rounded,
                    title: "Notifications",
                    onTap: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget child;
  const _Section({
    required this.title,
    this.subtitle,
    this.icon,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty) ...[
            Row(
              children: [
                if (icon != null) ...[
                  _IconBadge(icon: icon!),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: TekaColors.foreground,
                    ),
                  ),
                ),
              ],
            ),
            if (subtitle != null && subtitle!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
            const SizedBox(height: 16),
          ],
          child,
        ],
      ),
    );
  }
}

class _AccountSummaryCard extends StatelessWidget {
  final String displayName;
  final String? phone;
  final String? avatarUrl;
  final String initials;
  final bool uploading;
  final VoidCallback onChangePhoto;

  const _AccountSummaryCard({
    required this.displayName,
    required this.phone,
    required this.avatarUrl,
    required this.initials,
    required this.uploading,
    required this.onChangePhoto,
  });

  @override
  Widget build(BuildContext context) {
    final hasAvatar = avatarUrl != null && avatarUrl!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TekaColors.foreground,
        borderRadius: BorderRadius.circular(22),
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
          Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: TekaColors.tekaRedSubtle,
                backgroundImage: hasAvatar ? NetworkImage(avatarUrl!) : null,
                child: hasAvatar
                    ? null
                    : Text(
                        initials,
                        style: const TextStyle(
                          color: TekaColors.tekaRed,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
              ),
              Positioned(
                right: -2,
                bottom: -2,
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: uploading ? null : onChangePhoto,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: TekaColors.border),
                    ),
                    child: uploading
                        ? const Padding(
                            padding: EdgeInsets.all(7),
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(
                            Icons.photo_camera_outlined,
                            size: 15,
                            color: TekaColors.foreground,
                          ),
                  ),
                ),
              ),
            ],
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
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  phone == null || phone!.isEmpty
                      ? "Numéro WhatsApp vérifié"
                      : phone!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.72),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.verified_user_outlined,
                        size: 14,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        "Compte acheteur sécurisé",
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.90),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickLinkTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _QuickLinkTile({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: _IconBadge(icon: icon),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: TekaColors.foreground,
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: TekaColors.mutedForeground,
      ),
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
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: TekaColors.tekaRedSubtle,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, size: 18, color: TekaColors.tekaRed),
    );
  }
}

/// Mirrors the web "Appareils connectes" section. Renders a loading
/// shimmer, an empty state, or the row list with per-row revoke
/// buttons. The current device row shows a chip and has no revoke
/// button (matches web parity).
class _SessionsCard extends StatelessWidget {
  final List<SessionDto>? sessions;
  final bool loading;
  final String? action;
  final Future<void> Function(String id) onRevoke;
  final Future<void> Function() onRevokeAll;

  const _SessionsCard({
    required this.sessions,
    required this.loading,
    required this.action,
    required this.onRevoke,
    required this.onRevokeAll,
  });

  @override
  Widget build(BuildContext context) {
    final hasOthers = sessions?.any((s) => !s.current) ?? false;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        _IconBadge(icon: Icons.devices_other_outlined),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            "Appareils connectés",
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: TekaColors.foreground,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Liste des appareils actuellement connectés à votre compte. Révoquez ceux que vous ne reconnaissez pas.",
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: TekaColors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              if (hasOthers)
                TextButton(
                  onPressed: action != null ? null : onRevokeAll,
                  style: TextButton.styleFrom(
                    foregroundColor: TekaColors.destructive,
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 32),
                  ),
                  child: Text(
                    action == 'all'
                        ? "Déconnexion..."
                        : "Déconnecter les autres appareils",
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (loading && sessions == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (sessions == null || sessions!.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                "Aucun autre appareil connecté",
                style: const TextStyle(
                  fontSize: 13,
                  color: TekaColors.mutedForeground,
                ),
              ),
            )
          else
            ...List.generate(sessions!.length, (i) {
              final s = sessions![i];
              final dateLabel = _formatDate(s.createdAt);
              return Column(
                children: [
                  if (i > 0) const Divider(height: 1, color: TekaColors.border),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      s.ipAddress != null
                                          ? "IP ${s.ipAddress!}"
                                          : "IP inconnue",
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w500,
                                        color: TekaColors.foreground,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (s.current) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: TekaColors.tekaRedSubtle,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        "Cet appareil",
                                        style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w500,
                                          color: TekaColors.tekaRed,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                "Connecté le $dateLabel",
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: TekaColors.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (!s.current)
                          TextButton(
                            onPressed:
                                action != null ? null : () => onRevoke(s.id),
                            style: TextButton.styleFrom(
                              foregroundColor: TekaColors.destructive,
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(0, 32),
                            ),
                            child: Text(
                              action == s.id ? "Déconnexion..." : "Déconnecter",
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            }),
        ],
      ),
    );
  }

  String _formatDate(DateTime d) {
    // Locale-free short formatter — avoids pulling in intl just for one
    // label. Matches the dd/MM/yyyy HH:mm pattern Chrome's `fr-FR` uses.
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
  }
}
