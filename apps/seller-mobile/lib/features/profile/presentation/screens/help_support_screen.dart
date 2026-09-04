import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';

class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  static const _email = 'contact@teka.cd';
  static const _phone = '+243 991 427 171';

  void _copy(BuildContext context, String value, String label) {
    Clipboard.setData(ClipboardData(text: value));
    showAppSnackbar(context, message: '$label copié');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Aide et support')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: TekaColors.tekaRed.withValues(alpha: 0.06),
              border: Border.all(
                color: TekaColors.tekaRed.withValues(alpha: 0.18),
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.support_agent, color: TekaColors.tekaRed),
                SizedBox(height: 10),
                Text(
                  'Nous sommes là pour vous aider',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 6),
                Text(
                  'Support disponible du lundi au samedi, de 8 h à 18 h. '
                  'Ajoutez le numéro de commande ou la référence du produit '
                  'pour accélérer le traitement.',
                  style: TextStyle(color: TekaColors.mutedForeground),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _ContactTile(
            icon: Icons.email_outlined,
            title: 'Email',
            value: _email,
            onCopy: () => _copy(context, _email, 'Email'),
          ),
          const SizedBox(height: 8),
          _ContactTile(
            icon: Icons.chat_outlined,
            title: 'WhatsApp et téléphone',
            value: _phone,
            onCopy: () => _copy(context, '+243991427171', 'Numéro'),
          ),
          const SizedBox(height: 24),
          Text(
            'Avant de contacter le support',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const _Tip(
            icon: Icons.receipt_long_outlined,
            text: 'Commande : copiez son numéro depuis l’écran de détail.',
          ),
          const _Tip(
            icon: Icons.inventory_2_outlined,
            text: 'Produit rejeté : consultez le motif avant de le modifier.',
          ),
          const _Tip(
            icon: Icons.account_balance_wallet_outlined,
            text: 'Virement : indiquez la date et le numéro Mobile Money.',
          ),
        ],
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onCopy;

  const _ContactTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: TekaColors.border),
      ),
      leading: Icon(icon, color: TekaColors.tekaRed),
      title: Text(title),
      subtitle: SelectableText(value),
      trailing: IconButton(
        tooltip: 'Copier $title',
        onPressed: onCopy,
        icon: const Icon(Icons.copy_outlined),
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Tip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: TekaColors.mutedForeground),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
