import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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

  ProfileUser? _user;

  // Form state
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _businessNameCtrl = TextEditingController();
  final _businessPhoneCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
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
      final me = await ref.read(profileRepositoryProvider).getMe();
      if (!mounted) return;
      setState(() {
        _user = me;
        _firstNameCtrl.text = me.firstName ?? '';
        _lastNameCtrl.text = me.lastName ?? '';
        _emailCtrl.text = me.email ?? '';
        if (me.sellerProfile != null) {
          _businessNameCtrl.text = me.sellerProfile!.businessName;
          _businessPhoneCtrl.text = me.sellerProfile!.phone;
          _locationCtrl.text = me.sellerProfile!.location;
          _descriptionCtrl.text = me.sellerProfile!.description ?? '';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
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
    final l10n = AppLocalizations.of(context)!;
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
      _toast(l10n.profileSaveSuccess);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _toast(l10n.profileUploadError, error: true);
    }
  }

  Future<void> _savePersonal() async {
    final l10n = AppLocalizations.of(context)!;
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
      _toast(l10n.profileSaveSuccess);
    } catch (_) {
      _toast(l10n.profileSaveError, error: true);
    } finally {
      if (mounted) setState(() => _savingPersonal = false);
    }
  }

  Future<void> _saveBusiness() async {
    final l10n = AppLocalizations.of(context)!;
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
      if (_descriptionCtrl.text.trim() != (sp?.description ?? '')) {
        body['description'] = _descriptionCtrl.text.trim();
      }
      if (body.isEmpty) return;
      await ref.read(profileRepositoryProvider).updateSellerProfile(
            businessName: body['businessName'],
            phone: body['phone'],
            location: body['location'],
            description: body['description'],
          );
      await _load();
      _toast(l10n.profileSaveSuccess);
    } catch (_) {
      _toast(l10n.profileSaveError, error: true);
    } finally {
      if (mounted) setState(() => _savingBusiness = false);
    }
  }

  Future<void> _changePassword() async {
    final l10n = AppLocalizations.of(context)!;
    if (_newPasswordCtrl.text != _confirmPasswordCtrl.text) {
      _toast(l10n.profilePasswordMismatch, error: true);
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
      _toast(l10n.profilePasswordChangeSuccess);
    } catch (_) {
      _toast(l10n.profilePasswordChangeError, error: true);
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.profileTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final appStatus = _user?.sellerProfile?.applicationStatus;
    final businessEditable = appStatus == 'APPROVED';
    final initials =
        ((_user?.firstName?.isNotEmpty == true ? _user!.firstName![0] : '') +
                (_user?.lastName?.isNotEmpty == true ? _user!.lastName![0] : ''))
            .toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.profileTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: l10n.profileLogout,
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
              l10n.profileSubtitle,
              style: const TextStyle(
                fontSize: 13,
                color: TekaColors.mutedForeground,
              ),
            ),
            const SizedBox(height: 16),

            // Avatar
            _Section(
              title: l10n.profileSectionAvatar,
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
                            ? l10n.profileUploading
                            : l10n.profileUploadAvatar,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Personal
            _Section(
              title: l10n.profileSectionPersonal,
              child: Column(
                children: [
                  TextField(
                    controller: _firstNameCtrl,
                    decoration: InputDecoration(labelText: l10n.profileFirstName),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _lastNameCtrl,
                    decoration: InputDecoration(labelText: l10n.profileLastName),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(
                      labelText: l10n.profileEmail,
                      helperText: l10n.profileEmailHint,
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _savingPersonal ? null : _savePersonal,
                      child: Text(
                        _savingPersonal
                            ? l10n.profileSaving
                            : l10n.profileSave,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Business
            _Section(
              title: l10n.profileSectionBusiness,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (appStatus == 'PENDING')
                    _Banner(
                      text: l10n.profileApplicationPending,
                      color: TekaColors.warning,
                    ),
                  if (appStatus == 'REJECTED')
                    _Banner(
                      text: l10n.profileApplicationRejected,
                      color: TekaColors.destructive,
                    ),
                  TextField(
                    controller: _businessNameCtrl,
                    enabled: businessEditable,
                    decoration:
                        InputDecoration(labelText: l10n.profileBusinessName),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _businessPhoneCtrl,
                    enabled: businessEditable,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: l10n.profilePhone,
                      helperText: l10n.profilePhoneHint,
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _locationCtrl,
                    enabled: businessEditable,
                    decoration: InputDecoration(labelText: l10n.profileLocation),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _descriptionCtrl,
                    enabled: businessEditable,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: l10n.profileDescription,
                      hintText: l10n.profileDescriptionPlaceholder,
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
                        _savingBusiness
                            ? l10n.profileSaving
                            : l10n.profileSave,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Password
            _Section(
              title: l10n.profileSectionPassword,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.profilePasswordHint,
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
                      labelText: l10n.profileCurrentPassword,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _newPasswordCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: l10n.profileNewPassword,
                      helperText: l10n.profilePasswordRules,
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _confirmPasswordCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: l10n.profileConfirmPassword,
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
                            ? l10n.profileSaving
                            : l10n.profileChangePassword,
                      ),
                    ),
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
