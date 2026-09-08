import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../payout_status.dart';
import '../providers/earnings_provider.dart';
import '../widgets/wallet_card.dart' show HeroAmount;
import 'earnings_screen.dart' show minPayoutCdf;

/// Payout request (Seller UX PR E). The API pays the WHOLE available balance
/// — there is no amount field to invent — so the screen states the amount,
/// collects the destination (operator + Mobile Money number, prefilled from
/// the saved destination), and asks for one confirmation that repeats the
/// amount and the number before anything is sent. On failure the values
/// stay, the API's French reason is shown, and the balance is refetched.
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

class _RequestPayoutScreenState extends ConsumerState<RequestPayoutScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _method;
  final _phoneController = TextEditingController();
  bool _submitting = false;
  bool _methodMissing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _prefillDestination();
  }

  Future<void> _prefillDestination() async {
    final saved =
        await ref.read(earningsProvider.notifier).getSavedPayoutMethod();
    if (!mounted || saved == null) return;
    setState(() {
      if (saved.payoutMethod != null &&
          payoutMethods.containsKey(saved.payoutMethod)) {
        _method ??= saved.payoutMethod;
      }
      if (saved.payoutPhone != null && _phoneController.text.isEmpty) {
        _phoneController.text = saved.payoutPhone!;
      }
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit(int amount) async {
    if (_submitting) return;
    setState(() {
      _error = null;
      _methodMissing = _method == null;
    });
    final formOk = _formKey.currentState?.validate() ?? false;
    if (_methodMissing || !formOk) return;
    final phone = _phoneController.text.trim();
    final method = _method!;

    final confirmed = await _confirm(amount, method, phone);
    if (!confirmed || !mounted) return;

    setState(() => _submitting = true);
    final errorMessage =
        await ref.read(earningsProvider.notifier).requestPayout(method, phone);
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
    // Re-evaluated after every wallet refresh — a failed submit refetches,
    // so a balance that fell below the minimum or a payout opened elsewhere
    // disables the button with its reason instead of a second 400 / 409.
    final blocker = wallet == null
        ? 'Votre solde n’a pas pu être chargé. Revenez à l’écran Revenus et réessayez.'
        : open != null
            ? 'Une demande de virement est déjà en cours. Vous pourrez en faire une nouvelle une fois celle-ci traitée.'
            : amount < minPayoutCdf
                ? 'Solde minimum pour un virement : ${formatFcNumber(minPayoutCdf)} FC. Votre solde disponible est de ${formatFcNumber(amount)} FC.'
                : null;
    final canSubmit = blocker == null && !_submitting;

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
                Text('Opérateur',
                    style: theme.labelLarge
                        ?.copyWith(color: TekaColors.mutedForeground)),
                const SizedBox(height: TekaSpacing.xxs),
                _OperatorPicker(
                  selected: _method,
                  enabled: !_submitting,
                  onChanged: (v) => setState(() {
                    _method = v;
                    _methodMissing = false;
                  }),
                ),
                if (_methodMissing)
                  Padding(
                    padding: const EdgeInsets.only(top: TekaSpacing.xxs),
                    child: Text('Choisissez l’opérateur du numéro de réception.',
                        style: theme.bodySmall?.copyWith(
                            color: TekaColors.destructiveForeground)),
                  ),
                const SizedBox(height: TekaSpacing.md),
                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  enabled: !_submitting,
                  textInputAction: TextInputAction.done,
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
                  onFieldSubmitted: (_) {
                    if (canSubmit) _submit(amount);
                  },
                ),
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
                  'Une confirmation vous sera demandée avant l’envoi.',
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
