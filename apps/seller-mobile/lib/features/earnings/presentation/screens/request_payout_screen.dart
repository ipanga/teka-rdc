import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../data/models/earning_model.dart';
import '../payout_status.dart';
import '../providers/earnings_provider.dart';
import '../widgets/wallet_card.dart' show HeroAmount;
import 'earnings_screen.dart' show minPayoutCdf;

/// Payout request (Seller UX PR E, re-authentication S12). The API pays the
/// WHOLE available balance — there is no amount field to invent — so the
/// screen states the amount, shows the SAVED destination (operator + Mobile
/// Money number — the request itself carries no destination: the API routes
/// to the saved one), and asks for one confirmation that repeats the amount
/// and the number before anything is sent. On failure the API's French
/// reason is shown and the balance is refetched.
///
/// Changing the destination is a separate, password-gated step (S12): the
/// inline editor asks for the operator, the number and the seller's current
/// login password, and a change blocks payouts for 24 hours — the request
/// button shows that cooling-off as a blocker until it ends. With no saved
/// destination the editor is open from the start.
class RequestPayoutScreen extends ConsumerStatefulWidget {
  const RequestPayoutScreen({super.key});

  @override
  ConsumerState<RequestPayoutScreen> createState() =>
      _RequestPayoutScreenState();
}

/// Brand names (proper nouns) — not translatable copy. Order = the
/// operators' weight in Haut-Katanga / Lualaba.
const payoutMethods = <String, String>{
  'M_PESA': 'M-Pesa (Vodacom)',
  'AIRTEL_MONEY': 'Airtel Money',
  'ORANGE_MONEY': 'Orange Money',
};

final _phonePattern = RegExp(r'^\+243[0-9]{9}$');

/// Null when valid, else the French reason. Exposed for tests.
String? validatePayoutPhone(String? raw) {
  final phone = (raw ?? '').trim();
  if (phone.isEmpty) return 'Entrez le numéro Mobile Money qui recevra l’argent.';
  if (!_phonePattern.hasMatch(phone)) {
    return 'Entrez un numéro congolais au format +243 suivi de 9 chiffres.';
  }
  return null;
}

/// Why the destination editor asks for the password (S12) — shown above the
/// field, and what the confirmation e-mail is for.
const payoutDestinationPasswordNotice =
    'Par sécurité, modifier la destination demande votre mot de passe et bloque les retraits pendant 24 heures. Un e-mail de confirmation vous sera envoyé.';

/// Keys for the editor fields (tests + autofill scoping).
const payoutPhoneFieldKey = ValueKey('payout-destination-phone');
const payoutPasswordFieldKey = ValueKey('payout-destination-password');

class _RequestPayoutScreenState extends ConsumerState<RequestPayoutScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _method;
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  /// GET /payout-method answered (with or without a destination).
  bool _destinationLoaded = false;

  /// GET /payout-method failed: shown with a retry rather than opening the
  /// editor — the seller may well have a destination we could not read.
  bool _destinationError = false;

  /// The editor (operator + number + password) is open.
  bool _editing = false;
  bool _saving = false;
  String? _saveError;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // The Save button is gated on the three editor fields, so the screen has
    // to rebuild as the seller types (the controllers alone rebuild only the
    // TextFields).
    _phoneController.addListener(_onEditorFieldChanged);
    _passwordController.addListener(_onEditorFieldChanged);
    _loadDestination();
  }

  void _onEditorFieldChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadDestination() async {
    setState(() => _destinationError = false);
    final saved = await ref.read(earningsProvider.notifier).loadPayoutMethod();
    if (!mounted) return;
    setState(() {
      _destinationLoaded = true;
      if (saved == null) {
        _destinationError = true;
      } else if (!saved.hasDestination) {
        _openEditor();
      }
    });
  }

  @override
  void dispose() {
    _phoneController.removeListener(_onEditorFieldChanged);
    _passwordController.removeListener(_onEditorFieldChanged);
    _phoneController.dispose();
    // The password never outlives the screen (S12).
    _passwordController.clear();
    _passwordController.dispose();
    super.dispose();
  }

  SellerPayoutMethod? get _saved => ref.read(earningsProvider).payoutMethod;

  void _openEditor() {
    final saved = _saved;
    _method = payoutMethods.containsKey(saved?.payoutMethod)
        ? saved!.payoutMethod
        : null;
    _phoneController.text = saved?.payoutPhone ?? '';
    _passwordController.clear();
    _obscurePassword = true;
    _saveError = null;
    _editing = true;
  }

  void _closeEditor() {
    _passwordController.clear();
    _saveError = null;
    _editing = false;
  }

  bool get _canSave =>
      !_saving &&
      _method != null &&
      _phoneController.text.trim().isNotEmpty &&
      _passwordController.text.isNotEmpty;

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saveError = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final errorMessage =
        await ref.read(earningsProvider.notifier).savePayoutMethod(
              method: _method!,
              phone: _phoneController.text.trim(),
              password: _passwordController.text,
            );
    if (!mounted) return;
    if (errorMessage != null) {
      setState(() {
        _saving = false;
        _saveError = errorMessage;
      });
      return;
    }
    final availableAt = _saved?.payoutsAvailableAt;
    setState(() {
      _saving = false;
      _closeEditor();
    });
    showAppSnackbar(
      context,
      message: availableAt == null
          ? 'Destination enregistrée.'
          : 'Destination enregistrée. Les retraits seront possibles à partir du ${payoutAvailabilityLabel(availableAt)}',
      tone: AppSnackbarTone.success,
      duration: const Duration(seconds: 5),
    );
  }

  Future<void> _submit(int amount) async {
    if (_submitting) return;
    final saved = _saved;
    if (saved == null || !saved.hasDestination) return;
    setState(() => _error = null);

    final confirmed =
        await _confirm(amount, saved.payoutMethod!, saved.payoutPhone!);
    if (!confirmed || !mounted) return;

    setState(() => _submitting = true);
    final errorMessage =
        await ref.read(earningsProvider.notifier).requestPayout();
    if (!mounted) return;
    setState(() => _submitting = false);
    if (errorMessage == null) {
      showAppSnackbar(
        context,
        message:
            'Demande envoyée. Teka examine votre demande de ${formatFcNumber(amount)} FC.',
        tone: AppSnackbarTone.success,
      );
      context.pop();
    } else {
      setState(() => _error = errorMessage);
    }
  }

  Future<bool> _confirm(int amount, String method, String phone) async {
    var popped = false;
    final theme = Theme.of(context).textTheme;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer la demande de virement'),
        content: SingleChildScrollView(
          child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ConfirmLine('Montant', '${formatFcNumber(amount)} FC'),
            const SizedBox(height: TekaSpacing.xs),
            _ConfirmLine('Destination', '${payoutMethodLabel(method)} · $phone'),
            const SizedBox(height: TekaSpacing.sm),
            Text(
              'Ce montant sera réservé sur votre solde. Teka examine la demande, puis effectue le virement vers ce numéro. Vérifiez le numéro : un virement vers un mauvais numéro ne peut pas être annulé.',
              style:
                  theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
            ),
          ],
        ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () {
              if (popped) return;
              popped = true;
              Navigator.pop(ctx, true);
            },
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
    return result == true;
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(earningsProvider);
    final theme = Theme.of(context).textTheme;
    final wallet = state.wallet;
    final amount = wallet?.balanceCDFDisplay ?? 0;
    final open = state.openPayout;
    final saved = state.payoutMethod;
    final availableAt = saved?.payoutsAvailableAt;
    final coolingOff = saved != null && saved.coolingOffAt(DateTime.now());
    // Re-evaluated after every wallet refresh — a failed submit refetches,
    // so a balance that fell below the minimum, a payout opened elsewhere or
    // a destination changed elsewhere disables the button with its reason
    // instead of a second 400 / 409.
    final blocker = wallet == null
        ? 'Votre solde n’a pas pu être chargé. Revenez à l’écran Revenus et réessayez.'
        : open != null
            ? 'Une demande de virement est déjà en cours. Vous pourrez en faire une nouvelle une fois celle-ci traitée.'
            : amount < minPayoutCdf
                ? 'Solde minimum pour un virement : ${formatFcNumber(minPayoutCdf)} FC. Votre solde disponible est de ${formatFcNumber(amount)} FC.'
                : coolingOff && availableAt != null
                    ? 'Destination modifiée récemment : retraits possibles à partir du ${payoutAvailabilityLabel(availableAt)}'
                    : null;
    final hasDestination = saved?.hasDestination ?? false;
    final canSubmit = blocker == null &&
        hasDestination &&
        !_editing &&
        !_submitting &&
        !_saving;

    return Scaffold(
      appBar: AppBar(title: const Text('Demande de virement')),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.disabled,
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(
              TekaSpacing.md,
              TekaSpacing.md,
              TekaSpacing.md,
              MediaQuery.viewInsetsOf(context).bottom + TekaSpacing.xxl,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _AmountCard(amount: amount, loaded: wallet != null),
                if (blocker != null) ...[
                  const SizedBox(height: TekaSpacing.sm),
                  _Notice(
                    icon: Icons.info_outline,
                    color: TekaColors.warningForeground,
                    background: TekaColors.warningSubtle,
                    text: blocker,
                    action: open != null
                        ? TextButton(
                            onPressed: () => context
                                .push('/earnings/payouts/${open.id}'),
                            child: const Text('Voir le virement en cours'),
                          )
                        : null,
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: TekaSpacing.sm),
                  _Notice(
                    icon: Icons.error_outline,
                    color: TekaColors.destructiveForeground,
                    background: TekaColors.destructiveSubtle,
                    text: _error!,
                    live: true,
                  ),
                ],
                const SizedBox(height: TekaSpacing.xl),
                Text('Destination du virement', style: theme.titleMedium),
                const SizedBox(height: TekaSpacing.xxs),
                Text(
                  'L’argent est envoyé sur un compte Mobile Money à votre nom.',
                  style: theme.bodySmall
                      ?.copyWith(color: TekaColors.mutedForeground),
                ),
                const SizedBox(height: TekaSpacing.sm),
                if (!_destinationLoaded)
                  Text('Chargement de la destination…',
                      style: theme.bodyMedium
                          ?.copyWith(color: TekaColors.mutedForeground))
                else if (_destinationError)
                  _Notice(
                    icon: Icons.error_outline,
                    color: TekaColors.destructiveForeground,
                    background: TekaColors.destructiveSubtle,
                    text:
                        'La destination enregistrée n’a pas pu être chargée.',
                    action: TextButton(
                      onPressed: _loadDestination,
                      child: const Text('Réessayer'),
                    ),
                  )
                else if (!_editing && saved != null && hasDestination)
                  _SavedDestination(
                    method: saved.payoutMethod!,
                    phone: saved.payoutPhone!,
                    enabled: !_submitting,
                    onEdit: () => setState(_openEditor),
                  )
                else
                  _buildEditor(theme, hasDestination),
                const SizedBox(height: TekaSpacing.xl),
                ElevatedButton.icon(
                  onPressed: canSubmit ? () => _submit(amount) : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: TekaColors.tekaRed,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: TekaColors.muted,
                    disabledForegroundColor: TekaColors.mutedForeground,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_outlined, size: 18),
                  label: Text(_submitting
                      ? 'Envoi en cours…'
                      : 'Demander le virement'),
                ),
                const SizedBox(height: TekaSpacing.sm),
                Text(
                  _editing
                      ? 'Enregistrez d’abord la destination pour demander un virement.'
                      : 'Une confirmation vous sera demandée avant l’envoi.',
                  textAlign: TextAlign.center,
                  style: theme.bodySmall
                      ?.copyWith(color: TekaColors.mutedForeground),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Operator + number + current password, one Save button gated on all
  /// three (S12). « Annuler » only when there is a saved destination to fall
  /// back to.
  Widget _buildEditor(TextTheme theme, bool hasDestination) {
    final locked = _saving;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Opérateur',
            style:
                theme.labelLarge?.copyWith(color: TekaColors.mutedForeground)),
        const SizedBox(height: TekaSpacing.xxs),
        _OperatorPicker(
          selected: _method,
          enabled: !locked,
          onChanged: (v) => setState(() => _method = v),
        ),
        const SizedBox(height: TekaSpacing.md),
        TextFormField(
          key: payoutPhoneFieldKey,
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          enabled: !locked,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: const InputDecoration(
            labelText: 'Numéro de réception',
            hintText: '+243 suivi de 9 chiffres',
            helperText:
                'Le numéro Mobile Money enregistré chez cet opérateur, avec l’indicatif +243.',
            helperMaxLines: 3,
            errorMaxLines: 3,
            prefixIcon: Icon(Icons.phone_android),
          ),
          validator: validatePayoutPhone,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: TekaSpacing.md),
        Text(
          payoutDestinationPasswordNotice,
          style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
        ),
        const SizedBox(height: TekaSpacing.xs),
        TextFormField(
          key: payoutPasswordFieldKey,
          controller: _passwordController,
          obscureText: _obscurePassword,
          enableSuggestions: false,
          autocorrect: false,
          enabled: !locked,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(
            labelText: 'Mot de passe actuel',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              tooltip: _obscurePassword
                  ? 'Afficher le mot de passe'
                  : 'Masquer le mot de passe',
              icon: Icon(_obscurePassword
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          onChanged: (_) => setState(() {}),
          onFieldSubmitted: (_) {
            if (_canSave) _save();
          },
        ),
        if (_saveError != null) ...[
          const SizedBox(height: TekaSpacing.sm),
          _Notice(
            icon: Icons.error_outline,
            color: TekaColors.destructiveForeground,
            background: TekaColors.destructiveSubtle,
            text: _saveError!,
            live: true,
          ),
        ],
        const SizedBox(height: TekaSpacing.md),
        OutlinedButton.icon(
          onPressed: _canSave ? _save : null,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
          icon: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save_outlined, size: 18),
          label: Text(
              _saving ? 'Enregistrement…' : 'Enregistrer la destination'),
        ),
        if (hasDestination) ...[
          const SizedBox(height: TekaSpacing.xxs),
          TextButton(
            onPressed: locked ? null : () => setState(_closeEditor),
            child: const Text('Annuler la modification'),
          ),
        ],
      ],
    );
  }
}

/// The saved destination, read-only: operator label + full number (here the
/// seller must check where the money goes, so it is not masked), and the
/// password-gated « Modifier » action (S12).
class _SavedDestination extends StatelessWidget {
  const _SavedDestination({
    required this.method,
    required this.phone,
    required this.enabled,
    required this.onEdit,
  });
  final String method;
  final String phone;
  final bool enabled;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
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
              const Icon(Icons.account_balance_wallet_outlined,
                  size: 20, color: TekaColors.mutedForeground),
              const SizedBox(width: TekaSpacing.xs),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(payoutMethodLabel(method),
                        style: theme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: TekaSpacing.xxs),
                    Text(phone, style: theme.bodyMedium),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: TekaSpacing.xs),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: enabled ? onEdit : null,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Modifier la destination'),
            ),
          ),
        ],
      ),
    );
  }
}

/// « Montant du virement : X FC » — the whole available balance, stated
/// before the seller fills anything in.
class _AmountCard extends StatelessWidget {
  const _AmountCard({required this.amount, required this.loaded});
  final int amount;
  final bool loaded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(TekaSpacing.md),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: TekaRadius.lgAll,
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Montant du virement',
              style:
                  theme.labelLarge?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xxs),
          if (loaded)
            HeroAmount(amount)
          else
            Text('—',
                style: theme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xxs),
          Text(
            'La totalité de votre solde disponible est virée ; un montant partiel n’est pas possible.',
            style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
          ),
        ],
      ),
    );
  }
}

class _ConfirmLine extends StatelessWidget {
  const _ConfirmLine(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground)),
        Text(value,
            style: theme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    required this.icon,
    required this.color,
    required this.background,
    required this.text,
    this.action,
    this.live = false,
  });
  final IconData icon;
  final Color color;
  final Color background;
  final String text;
  final Widget? action;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: live,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(TekaSpacing.sm),
        decoration: BoxDecoration(
          color: background,
          borderRadius: TekaRadius.mdAll,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: TekaSpacing.xs),
                Expanded(
                  child: Text(text,
                      style: theme.bodyMedium?.copyWith(color: color)),
                ),
              ],
            ),
            if (action != null)
              Align(alignment: Alignment.centerRight, child: action),
          ],
        ),
      ),
    );
  }
}

/// Radio list of the three operators — larger targets than a dropdown, the
/// current choice visible without opening anything, one per line so the
/// names never truncate at large text.
class _OperatorPicker extends StatelessWidget {
  const _OperatorPicker({
    required this.selected,
    required this.enabled,
    required this.onChanged,
  });
  final String? selected;
  final bool enabled;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.border),
        borderRadius: TekaRadius.mdAll,
      ),
      child: RadioGroup<String>(
        groupValue: selected,
        onChanged: enabled ? onChanged : (_) {},
        child: Column(
          children: [
            for (final entry in payoutMethods.entries)
              RadioListTile<String>(
                value: entry.key,
                title: Text(entry.value),
                dense: true,
                enabled: enabled,
                activeColor: TekaColors.tekaRed,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: TekaSpacing.xs),
              ),
          ],
        ),
      ),
    );
  }
}
