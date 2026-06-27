import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/profile_repository.dart';

/// Mirrors seller-web's `/dashboard/profile` page (PR #126 + #132): avatar,
/// personal info, business info, and password change. All five sections
/// reuse already-shipped API endpoints — no API work in this PR.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _picker = ImagePicker();

  bool _loading = true;
  bool _uploading = false;
  bool _savingPersonal = false;
  bool _savingBusiness = false;
  bool _changingPassword = false;
  bool _notifSaving = false;

  ProfileUser? _user;
  NotificationPrefs? _notifPrefs;

  List<SessionDto>? _sessions;
  bool _sessionsLoading = false;
  String? _sessionAction;

  // Form state
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _businessNameCtrl = TextEditingController();
  final _businessPhoneCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  // Business town (Town Architecture Refactor / D4).
  String? _selectedCityId;
  List<CityOption> _cities = const [];
  final _descriptionCtrl = TextEditingController();
  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();

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
    _businessNameCtrl.dispose();
    _businessPhoneCtrl.dispose();
    _locationCtrl.dispose();
    _descriptionCtrl.dispose();
    _currentPasswordCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final repo = ref.read(profileRepositoryProvider);
      final me = await repo.getMe();
      // Town list is best-effort — failure just leaves the picker empty.
      List<CityOption> cities = const [];
      try {
        cities = await repo.getCities();
      } catch (_) {
        cities = const [];
      }
      // Notification prefs are best-effort — failure shouldn't block the
      // profile screen from rendering. Defaults are all-on.
      NotificationPrefs? prefs;
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
        _cities = cities;
        _firstNameCtrl.text = me.firstName ?? '';
        _lastNameCtrl.text = me.lastName ?? '';
        _emailCtrl.text = me.email ?? '';
        if (me.sellerProfile != null) {
          _businessNameCtrl.text = me.sellerProfile!.businessName;
          _businessPhoneCtrl.text = me.sellerProfile!.phone;
          _locationCtrl.text = me.sellerProfile!.location;
          _selectedCityId = me.sellerProfile!.cityId;
          _descriptionCtrl.text = me.sellerProfile!.description ?? '';
        }
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
      _toast("Appareil deconnecte");
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
      _toast("Appareil deconnecte");
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
    // Optimistic update.
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
      // Revert on failure.
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
        _user = ProfileUser(
          id: _user!.id,
          firstName: _user!.firstName,
          lastName: _user!.lastName,
          email: _user!.email,
          phone: _user!.phone,
          avatar: url,
          role: _user!.role,
          sellerProfile: _user!.sellerProfile,
        );
      });
      _toast("Profil mis a jour");
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _toast("Erreur lors de l'envoi de la photo", error: true);
    }
  }

  Future<void> _savePersonal() async {
    setState(() => _savingPersonal = true);
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
      if (mounted) setState(() => _savingPersonal = false);
    }
  }

  Future<void> _saveBusiness() async {
    setState(() => _savingBusiness = true);
    try {
      final sp = _user?.sellerProfile;
      final body = <String, String>{};
      if (_businessNameCtrl.text.trim() != (sp?.businessName ?? '')) {
        body['businessName'] = _businessNameCtrl.text.trim();
      }
      if (_businessPhoneCtrl.text.trim() != (sp?.phone ?? '')) {
        body['phone'] = _businessPhoneCtrl.text.trim();
      }
      if (_locationCtrl.text.trim() != (sp?.location ?? '')) {
        body['location'] = _locationCtrl.text.trim();
      }
      if ((_selectedCityId ?? '') != (sp?.cityId ?? '') &&
          (_selectedCityId ?? '').isNotEmpty) {
        body['cityId'] = _selectedCityId!;
      }
      if (_descriptionCtrl.text.trim() != (sp?.description ?? '')) {
        body['description'] = _descriptionCtrl.text.trim();
      }
      if (body.isEmpty) return;
      await ref.read(profileRepositoryProvider).updateSellerProfile(
            businessName: body['businessName'],
            phone: body['phone'],
            location: body['location'],
            cityId: body['cityId'],
            description: body['description'],
          );
      await _load();
      _toast("Profil mis a jour");
    } catch (_) {
      _toast("Erreur lors de l'enregistrement", error: true);
    } finally {
      if (mounted) setState(() => _savingBusiness = false);
    }
  }

  Future<void> _changePassword() async {
    if (_newPasswordCtrl.text != _confirmPasswordCtrl.text) {
      _toast("Les deux mots de passe ne correspondent pas", error: true);
      return;
    }
    setState(() => _changingPassword = true);
    try {
      await ref.read(profileRepositoryProvider).changePassword(
            currentPassword: _currentPasswordCtrl.text,
            newPassword: _newPasswordCtrl.text,
          );
      _currentPasswordCtrl.clear();
      _newPasswordCtrl.clear();
      _confirmPasswordCtrl.clear();
      _toast(
          "Mot de passe modifie avec succes. Les autres appareils ont ete deconnectes.");
    } catch (_) {
      _toast("Erreur lors de la modification du mot de passe", error: true);
    } finally {
      if (mounted) setState(() => _changingPassword = false);
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
    final appStatus = _user?.sellerProfile?.applicationStatus;
    final businessEditable = appStatus == 'APPROVED';
    final initials = ((_user?.firstName?.isNotEmpty == true
                ? _user!.firstName![0]
                : '') +
            (_user?.lastName?.isNotEmpty == true ? _user!.lastName![0] : ''))
        .toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text("Mon profil"),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: "Se déconnecter",
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/auth/login');
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
              "Gerez vos informations personnelles et celles de votre boutique",
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
                        _uploading ? "Envoi en cours..." : "Changer la photo",
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
                    decoration: InputDecoration(labelText: "Prenom"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _lastNameCtrl,
                    decoration: InputDecoration(labelText: "Nom"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: "Email",
                      helperText:
                          "Modifier votre email vous demandera de le re-verifier.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _savingPersonal ? null : _savePersonal,
                      child: Text(
                        _savingPersonal ? "Enregistrement..." : "Enregistrer",
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Business
            _Section(
              title: "Informations de la boutique",
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (appStatus == 'PENDING')
                    _Banner(
                      text:
                          "Votre demande d'inscription est en cours de revision. Vous pourrez modifier les informations de la boutique une fois la demande approuvee.",
                      color: TekaColors.warning,
                    ),
                  if (appStatus == 'REJECTED')
                    _Banner(
                      text:
                          "Votre demande a ete rejetee. Contactez le support pour en savoir plus.",
                      color: TekaColors.destructive,
                    ),
                  TextField(
                    controller: _businessNameCtrl,
                    enabled: businessEditable,
                    decoration:
                        InputDecoration(labelText: "Nom de la boutique"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _businessPhoneCtrl,
                    enabled: businessEditable,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: "Telephone (livraison)",
                      helperText:
                          "Utilise pour la communication avec les livreurs.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _cities.any((c) => c.id == _selectedCityId)
                        ? _selectedCityId
                        : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: "Ville"),
                    hint: Text("Sélectionnez votre ville"),
                    items: _cities
                        .map((c) => DropdownMenuItem<String>(
                              value: c.id,
                              child: Text(
                                '${c.name} — ${c.province}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ))
                        .toList(),
                    onChanged: businessEditable
                        ? (v) => setState(() => _selectedCityId = v)
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _locationCtrl,
                    enabled: businessEditable,
                    decoration: InputDecoration(
                      labelText: "Adresse / quartier",
                      helperText:
                          "Détail de l'adresse (rue, quartier) en complément de la ville.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _descriptionCtrl,
                    enabled: businessEditable,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: "Description",
                      hintText:
                          "Decrivez votre boutique en quelques phrases...",
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: !businessEditable || _savingBusiness
                          ? null
                          : _saveBusiness,
                      child: Text(
                        _savingBusiness ? "Enregistrement..." : "Enregistrer",
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
                    "Choisissez les SMS que vous voulez recevoir. Les codes de verification restent toujours envoyes.",
                    style: const TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text("Mises a jour de commande"),
                    subtitle:
                        Text("Confirmation, expedition, livraison, annulation"),
                    value: _notifPrefs?.smsOrderUpdates ?? true,
                    onChanged: _notifSaving
                        ? null
                        : (v) => _updateNotifPref(smsOrderUpdates: v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text("Annonces et promotions"),
                    subtitle:
                        Text("Messages marketing envoyes par l'equipe Teka"),
                    value: _notifPrefs?.smsBroadcasts ?? true,
                    onChanged: _notifSaving
                        ? null
                        : (v) => _updateNotifPref(smsBroadcasts: v),
                  ),
                ],
              ),
            ),

            // Password
            _Section(
              title: "Mot de passe",
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Modifier votre mot de passe vous déconnectera de tous vos autres appareils.",
                    style: const TextStyle(
                      fontSize: 12,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _currentPasswordCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: "Mot de passe actuel",
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _newPasswordCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: "Nouveau mot de passe",
                      helperText:
                          "Au moins 8 caracteres, avec lettres et chiffres.",
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _confirmPasswordCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: "Confirmer le nouveau mot de passe",
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _changingPassword ||
                              _currentPasswordCtrl.text.isEmpty ||
                              _newPasswordCtrl.text.length < 8 ||
                              _confirmPasswordCtrl.text.isEmpty
                          ? null
                          : _changePassword,
                      child: Text(
                        _changingPassword
                            ? "Enregistrement..."
                            : "Modifier le mot de passe",
                      ),
                    ),
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
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: TekaColors.foreground,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
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
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, color: color),
      ),
    );
  }
}

/// Mirrors the web "Appareils connectes" section.
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
                                        // Brand-red 10% subtle tint (mirrors
                                        // primary/10 on web; seller-mobile's
                                        // TekaColors palette is minimal so
                                        // we inline the alpha here).
                                        color: TekaColors.tekaRed
                                            .withValues(alpha: 0.1),
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
                              action == s.id ? "Deconnexion..." : "Deconnecter",
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
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
  }
}
