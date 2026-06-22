import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
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
      final list =
          await ref.read(profileRepositoryProvider).listSessions();
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
      _toast("Appareil deconnecte");
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de deconnecter cet appareil", error: true);
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
      _toast("Appareil deconnecte");
    } catch (_) {
      if (!mounted) return;
      _toast("Impossible de deconnecter cet appareil", error: true);
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
      final next = await ref
          .read(profileRepositoryProvider)
          .updateNotificationPrefs(
            smsOrderUpdates: smsOrderUpdates,
            smsBroadcasts: smsBroadcasts,
          );
      if (!mounted) return;
      setState(() => _notifPrefs = next);
    } catch (_) {
      if (!mounted) return;
      setState(() => _notifPrefs = previous);
      _toast("Erreur lors de la mise a jour", error: true);
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
      _toast("Profil mis a jour");
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
      _toast("Profil mis a jour");
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
        appBar: AppBar(title: Text("Mon profil")),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final initials =
        ((_user?.firstName?.isNotEmpty == true ? _user!.firstName![0] : '') +
                (_user?.lastName?.isNotEmpty == true ? _user!.lastName![0] : ''))
            .toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text("Mon profil"),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: "Se deconnecter",
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              // Land on the guest home (browsing stays open after logout);
              // protected tabs re-prompt for login on demand.
              if (context.mounted) context.go('/');
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Gerez vos informations personnelles",
              style: const TextStyle(
                fontSize: 13,
                color: TekaColors.mutedForeground,
              ),
            ),
            const SizedBox(height: 16),

            // Avatar
            _Section(
              title: "Photo de profil",
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 40,
                    backgroundColor: TekaColors.tekaRed,
                    backgroundImage:
                        _user?.avatar != null && _user!.avatar!.isNotEmpty
                            ? NetworkImage(_user!.avatar!)
                            : null,
                    child: (_user?.avatar == null || _user!.avatar!.isEmpty)
                        ? Text(
                            initials.isEmpty ? '?' : initials,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.w600,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _uploading ? null : _pickAvatar,
                      icon: const Icon(Icons.upload_outlined),
                      label: Text(
                        _uploading
                            ? "Envoi en cours..."
                            : "Changer la photo",
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Personal
            _Section(
              title: "Informations personnelles",
              child: Column(
                children: [
                  TextField(
                    controller: _firstNameCtrl,
                    decoration:
                        InputDecoration(labelText: "Prenom"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _lastNameCtrl,
                    decoration:
                        InputDecoration(labelText: "Nom"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: "Email",
                      helperText: "Optionnel — utilise pour les confirmations de commande.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Phone is the WhatsApp OTP auth identifier — not editable
                  // from the app. Read-only with hint pointing to support.
                  TextField(
                    controller:
                        TextEditingController(text: _user?.phone ?? ''),
                    enabled: false,
                    decoration: InputDecoration(
                      labelText: "Numero WhatsApp",
                      helperText: "Numero de connexion a votre compte. Contactez le support pour le modifier.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      child: Text(
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Choisissez les SMS que vous voulez recevoir. Les codes WhatsApp restent toujours envoyes.",
                    style: const TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text("Mises a jour de commande"),
                    subtitle: Text("Confirmation, expedition, livraison, annulation"),
                    value: _notifPrefs?.smsOrderUpdates ?? true,
                    onChanged: _notifSaving
                        ? null
                        : (v) => _updateNotifPref(smsOrderUpdates: v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text("Annonces et promotions"),
                    subtitle: Text("Messages marketing envoyes par l'equipe Teka"),
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
              title: '',
              child: Column(
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.receipt_long_outlined),
                    title: const Text("Mes commandes"),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/orders'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.notifications_none_rounded),
                    title: const Text("Notifications"),
                    trailing: const Icon(Icons.chevron_right),
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
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty) ...[
            Text(
              title,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: TekaColors.foreground,
              ),
            ),
            const SizedBox(height: 16),
          ],
          child,
        ],
      ),
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
        borderRadius: BorderRadius.circular(12),
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
                    Text(
                      "Appareils connectes",
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: TekaColors.foreground,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Liste des appareils actuellement connectes a votre compte. Revoquez ceux que vous ne reconnaissez pas.",
                      style: const TextStyle(
                        fontSize: 12,
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
                        ? "Deconnexion..."
                        : "Deconnecter les autres appareils",
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
                "Aucun autre appareil connecte",
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
                  if (i > 0)
                    const Divider(height: 1, color: TekaColors.border),
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
                                "Connecte le $dateLabel",
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
                              action == s.id
                                  ? "Deconnexion..."
                                  : "Deconnecter",
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
