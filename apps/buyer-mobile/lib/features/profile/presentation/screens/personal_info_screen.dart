import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
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

  BuyerProfile? _user;
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
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );
      if (xFile == null || !mounted) return;
      setState(() => _uploading = true);
      final url = await ref
          .read(profileRepositoryProvider)
          .uploadAvatar(File(xFile.path));
      if (!mounted || _user == null) return;
      setState(() {
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
      // The new URL is unique per upload (Cloudinary assigns the id), so
      // every header that reads the session user re-fetches the image —
      // no stale cached picture.
      await ref.read(authProvider.notifier).updateUser({'avatar': url});
      if (!mounted) return;
      _toast('Photo mise à jour');
    } catch (e) {
      if (!mounted) return;
      // The API's French reason when there is one (format, size, session
      // rejected…), a connectivity message otherwise — never a raw error.
      _toast(friendlyErrorMessage(e), error: true);
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
      await ref.read(authProvider.notifier).updateUser(updated.toJson());
      if (!mounted) return;
      _toast('Profil mis à jour');
    } catch (e) {
      if (!mounted) return;
      _toast(friendlyErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String message, {bool error = false}) {
    showAppSnackbar(
      context,
      message: message,
      tone: error ? AppSnackbarTone.error : AppSnackbarTone.success,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
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
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return AppErrorState(message: _error, onRetry: _load);
    }

    final user = _user!;
    final hasAvatar = user.avatar != null && user.avatar!.isNotEmpty;
    final initials = _initials(user);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 42,
                backgroundColor: TekaColors.tekaRedSubtle,
                backgroundImage: hasAvatar ? NetworkImage(user.avatar!) : null,
                child: hasAvatar
                    ? null
                    : Text(
                        initials,
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
                  icon: _uploading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.photo_camera_outlined, size: 18),
                  tooltip: 'Changer la photo',
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
            helperText: 'Optionnel, utilisé pour les confirmations.',
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          initialValue: user.phone ?? '',
          readOnly: true,
          enableInteractiveSelection: false,
          decoration: const InputDecoration(
            labelText: 'Numéro WhatsApp',
            prefixIcon: Icon(Icons.phone_outlined),
            suffixIcon: Icon(Icons.lock_outline),
            helperText:
                'Numéro de connexion au compte. Contactez le support pour le modifier.',
            helperMaxLines: 2,
          ),
        ),
      ],
    );
  }

  String _initials(BuyerProfile user) {
    final value = [
      user.firstName?.trim(),
      user.lastName?.trim(),
    ]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'T' : value;
  }
}
