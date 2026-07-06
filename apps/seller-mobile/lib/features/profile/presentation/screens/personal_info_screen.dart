import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../data/profile_repository.dart';

class PersonalInfoScreen extends ConsumerStatefulWidget {
  const PersonalInfoScreen({super.key});

  @override
  ConsumerState<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

class _PersonalInfoScreenState extends ConsumerState<PersonalInfoScreen> {
  final _picker = ImagePicker();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  ProfileUser? _user;
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  String? _error;

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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final me = await ref.read(profileRepositoryProvider).getMe();
      if (!mounted) return;
      setState(() {
        _user = me;
        _firstNameCtrl.text = me.firstName ?? '';
        _lastNameCtrl.text = me.lastName ?? '';
        _emailCtrl.text = me.email ?? '';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger votre profil.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatar() async {
    try {
      final xFile = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 90,
      );
      if (xFile == null || !mounted) return;
      setState(() => _uploading = true);
      final url = await ref
          .read(profileRepositoryProvider)
          .uploadAvatar(File(xFile.path));
      if (!mounted || _user == null) return;
      setState(() {
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
      _toast('Photo mise à jour');
    } catch (_) {
      if (!mounted) return;
      _toast("Erreur lors de l'envoi de la photo", error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _save() async {
    final current = _user;
    if (current == null) return;

    final body = <String, String>{};
    if (_firstNameCtrl.text.trim() != (current.firstName ?? '')) {
      body['firstName'] = _firstNameCtrl.text.trim();
    }
    if (_lastNameCtrl.text.trim() != (current.lastName ?? '')) {
      body['lastName'] = _lastNameCtrl.text.trim();
    }
    if (_emailCtrl.text.trim() != (current.email ?? '')) {
      body['email'] = _emailCtrl.text.trim();
    }
    if (body.isEmpty) {
      _toast('Aucune modification à enregistrer');
      return;
    }

    setState(() => _saving = true);
    try {
      final updated = await ref.read(profileRepositoryProvider).updateProfile(
            firstName: body['firstName'],
            lastName: body['lastName'],
            email: body['email'],
          );
      if (!mounted) return;
      setState(() => _user = updated);
      _toast('Profil mis à jour');
    } catch (_) {
      if (!mounted) return;
      _toast("Erreur lors de l'enregistrement", error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
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
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Informations personnelles'),
      ),
      body: _buildBody(),
      bottomNavigationBar: _loading || _error != null
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
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
                  label: Text(_saving ? 'Enregistrement...' : 'Enregistrer'),
                ),
              ),
            ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _ErrorState(message: _error!, onRetry: _load);
    }

    final user = _user!;
    final hasAvatar = user.avatar != null && user.avatar!.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 42,
                backgroundColor: TekaColors.tekaRed.withValues(alpha: 0.10),
                backgroundImage: hasAvatar ? NetworkImage(user.avatar!) : null,
                child: hasAvatar
                    ? null
                    : Text(
                        _initials(user),
                        style: const TextStyle(
                          color: TekaColors.tekaRed,
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
              ),
              Positioned(
                right: -2,
                bottom: -2,
                child: IconButton.filled(
                  onPressed: _uploading ? null : _pickAvatar,
                  tooltip: 'Changer la photo',
                  icon: _uploading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.photo_camera_outlined, size: 18),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _firstNameCtrl,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Prénom',
            prefixIcon: Icon(Icons.person_outline),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _lastNameCtrl,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: 'Nom',
            prefixIcon: Icon(Icons.person_outline),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'Email',
            prefixIcon: Icon(Icons.alternate_email),
            helperText: 'Modifier votre email peut demander une vérification.',
            helperMaxLines: 2,
          ),
        ),
      ],
    );
  }

  String _initials(ProfileUser user) {
    final value = [
      user.firstName?.trim(),
      user.lastName?.trim(),
    ]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'V' : value;
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
