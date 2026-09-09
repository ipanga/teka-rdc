import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/profile_repository.dart';

/// « Informations personnelles » (Seller UX PR F): the person behind the
/// shop — photo, first name, last name, login email. Validation mirrors the
/// API's own messages (`UpdateProfileDto`) so the seller reads the same
/// sentence before and after the request; only changed fields are sent; the
/// API's answer is what the session user is updated from.
class PersonalInfoScreen extends ConsumerStatefulWidget {
  const PersonalInfoScreen({super.key});

  @override
  ConsumerState<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

/// Null = valid. Same rules and words as the API (`UpdateProfileDto`).
String? validateName(String? raw, {required String field}) {
  final v = (raw ?? '').trim();
  if (v.length < 2) {
    return field == 'firstName'
        ? 'Le prénom doit contenir au moins 2 caractères'
        : 'Le nom doit contenir au moins 2 caractères';
  }
  if (v.length > 50) return 'Maximum 50 caractères';
  return null;
}

String? validateEmail(String? raw) {
  final v = (raw ?? '').trim();
  if (v.isEmpty) return 'L’adresse email est requise';
  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(v)) {
    return 'Adresse email invalide';
  }
  return null;
}

class _PersonalInfoScreenState extends ConsumerState<PersonalInfoScreen> {
  final _picker = ImagePicker();
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  ProfileUser? _user;
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  String? _error;
  String? _saveError;

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
      _loading = _user == null;
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
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatar() async {
    if (_uploading) return;
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
      setState(() => _user = _user!.copyWith(avatar: url));
      ref.read(authProvider.notifier).updateUser({'avatar': url});
      showAppSnackbar(context,
          message: 'Photo mise à jour', tone: AppSnackbarTone.success);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context,
          message: friendlyErrorMessage(e), tone: AppSnackbarTone.error);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _save() async {
    final current = _user;
    if (current == null || _saving) return;
    setState(() => _saveError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

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
      showAppSnackbar(context, message: 'Aucune modification à enregistrer');
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
      // The API normalises (trim, lower-case email): show its values, not
      // the form's, so the seller sees what is actually stored.
      setState(() {
        _user = updated;
        _firstNameCtrl.text = updated.firstName ?? '';
        _lastNameCtrl.text = updated.lastName ?? '';
        _emailCtrl.text = updated.email ?? '';
      });
      ref.read(authProvider.notifier).updateUser({
        'firstName': updated.firstName,
        'lastName': updated.lastName,
        'email': updated.email,
        'avatar': updated.avatar,
      });
      showAppSnackbar(context,
          message: body.containsKey('email')
              ? 'Informations enregistrées. Votre nouvel email sert désormais à la connexion.'
              : 'Informations enregistrées',
          tone: AppSnackbarTone.success);
    } catch (e) {
      if (!mounted) return;
      // The API's French reason (« Adresse email invalide », a taken email…)
      // stays on screen with the values the seller typed.
      setState(() => _saveError = friendlyErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = !_loading && _user != null;
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Informations personnelles'),
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: _buildBody(),
      ),
      bottomNavigationBar: !ready
          ? null
          : SafeArea(
              top: false,
              child: ReadableBottomBar(
                child: Padding(
                  padding: const EdgeInsets.all(TekaSpacing.md),
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48)),
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_rounded),
                    label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const _FormSkeleton(label: 'Chargement de vos informations');
    if (_error != null && _user == null) {
      return SellerListState(
        child: SellerListMessage(
          icon: Icons.cloud_off,
          title: 'Informations indisponibles',
          message: _error!,
          actionLabel: 'Réessayer',
          onAction: _load,
        ),
      );
    }

    final theme = Theme.of(context).textTheme;
    final user = _user!;
    final hasAvatar = user.avatar != null && user.avatar!.isNotEmpty;

    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.disabled,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(TekaSpacing.md),
        children: [
          Center(
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ExcludeSemantics(
                  child: CircleAvatar(
                    radius: 42,
                    backgroundColor: TekaColors.muted,
                    backgroundImage:
                        hasAvatar ? NetworkImage(user.avatar!) : null,
                    child: hasAvatar
                        ? null
                        : Text(_initials(user),
                            style: theme.headlineSmall?.copyWith(
                                color: TekaColors.foreground,
                                fontWeight: FontWeight.w700)),
                  ),
                ),
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: IconButton.filled(
                    onPressed: _uploading ? null : _pickAvatar,
                    tooltip: _uploading ? 'Envoi de la photo…' : 'Changer la photo',
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
          const SizedBox(height: TekaSpacing.xs),
          Text('Photo visible dans votre compte uniquement.',
              textAlign: TextAlign.center,
              style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xl),
          if (_saveError != null) ...[
            Semantics(
              liveRegion: true,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(TekaSpacing.sm),
                decoration: BoxDecoration(
                    color: TekaColors.destructiveSubtle,
                    borderRadius: TekaRadius.mdAll),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.error_outline,
                      size: 18, color: TekaColors.destructiveForeground),
                  const SizedBox(width: TekaSpacing.xs),
                  Expanded(
                      child: Text(_saveError!,
                          style: theme.bodyMedium
                              ?.copyWith(color: TekaColors.destructiveForeground))),
                ]),
              ),
            ),
            const SizedBox(height: TekaSpacing.md),
          ],
          Text('Identité', style: theme.titleMedium),
          const SizedBox(height: TekaSpacing.sm),
          TextFormField(
            controller: _firstNameCtrl,
            enabled: !_saving,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.givenName],
            decoration: const InputDecoration(
              labelText: 'Prénom',
              prefixIcon: Icon(Icons.person_outline),
            ),
            validator: (v) => validateName(v, field: 'firstName'),
          ),
          const SizedBox(height: TekaSpacing.sm),
          TextFormField(
            controller: _lastNameCtrl,
            enabled: !_saving,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.familyName],
            decoration: const InputDecoration(
              labelText: 'Nom',
              prefixIcon: Icon(Icons.person_outline),
            ),
            validator: (v) => validateName(v, field: 'lastName'),
          ),
          const SizedBox(height: TekaSpacing.xl),
          Text('Connexion', style: theme.titleMedium),
          const SizedBox(height: TekaSpacing.sm),
          TextFormField(
            controller: _emailCtrl,
            enabled: !_saving,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.alternate_email),
              helperText:
                  'Cet email sert à votre connexion et reçoit les alertes importantes. Si vous le changez, connectez-vous ensuite avec le nouveau.',
              helperMaxLines: 3,
              errorMaxLines: 2,
            ),
            validator: validateEmail,
            onFieldSubmitted: (_) {
              if (!_saving) _save();
            },
          ),
        ],
      ),
    );
  }

  String _initials(ProfileUser user) {
    final value = [user.firstName?.trim(), user.lastName?.trim()]
        .where((part) => part != null && part.isNotEmpty)
        .map((part) => part![0])
        .join()
        .toUpperCase();
    return value.isEmpty ? 'V' : value;
  }
}

/// Static placeholder shaped like the form (no spinner). Shared with the
/// shop profile through `FormSkeleton`.
class _FormSkeleton extends StatelessWidget {
  const _FormSkeleton({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => FormSkeleton(label: label, avatar: true);
}

class FormSkeleton extends StatelessWidget {
  const FormSkeleton({super.key, required this.label, this.avatar = false, this.fields = 3});
  final String label;
  final bool avatar;
  final int fields;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(TekaSpacing.md),
          children: [
            if (avatar) ...[
              const Center(child: SkeletonBlock(width: 84, height: 84, pill: true)),
              const SizedBox(height: TekaSpacing.xl),
            ],
            for (var i = 0; i < fields; i++) ...[
              const SkeletonBlock(width: 120, height: 12),
              const SizedBox(height: TekaSpacing.xs),
              const SkeletonBlock(width: double.infinity, height: 52),
              const SizedBox(height: TekaSpacing.md),
            ],
          ],
        ),
      ),
    );
  }
}
