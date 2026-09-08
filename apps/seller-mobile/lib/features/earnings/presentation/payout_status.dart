import 'package:flutter/material.dart';
import '../../../core/theme/teka_colors.dart';
import '../data/models/earning_model.dart';

/// Seller-facing financial vocabulary (Seller UX PR E, 2026-09-08) — one
/// source for the wallet, the two lists, the payout detail and tests.
///
/// The words follow `docs/payouts.md` exactly: approval is never worded as
/// payment (only COMPLETED reads « Payé »), a rejection returns the funds,
/// and no payout state asks anything of the seller. Tones are the PR A
/// *Foreground* tokens so every chip keeps ≥ 4.5:1 on its 8 % blend — brand
/// red on no state (« Réservé » used to be brand red).
class PayoutStatusUi {
  const PayoutStatusUi._(this.label, this.hint, this.color, this.icon);

  final String label;
  final String hint;
  final Color color;
  final IconData icon;

  static PayoutStatusUi of(String status) {
    switch (status.toUpperCase()) {
      case 'REQUESTED':
        return const PayoutStatusUi._(
          'Demande reçue',
          'Teka examine votre demande. Le montant est réservé sur votre solde.',
          TekaColors.warningForeground,
          Icons.hourglass_empty,
        );
      case 'APPROVED':
        return const PayoutStatusUi._(
          'Approuvé — virement en préparation',
          "Votre demande est approuvée. L'argent n'a pas encore été envoyé ; vous serez informé dès que le virement sera effectué.",
          TekaColors.infoForeground,
          Icons.check_circle_outline,
        );
      case 'PROCESSING':
        return const PayoutStatusUi._(
          'Virement en cours',
          'Le virement vers votre compte est en cours.',
          TekaColors.infoForeground,
          Icons.sync,
        );
      case 'COMPLETED':
        return const PayoutStatusUi._(
          'Payé',
          "L'argent a été envoyé. Conservez la référence de paiement pour toute réclamation.",
          TekaColors.successForeground,
          Icons.check_circle,
        );
      case 'REJECTED':
        return const PayoutStatusUi._(
          'Refusé / échec',
          'La demande a été refusée ou le virement a échoué. Le montant est de nouveau disponible sur votre solde ; vérifiez la raison puis refaites une demande.',
          TekaColors.destructiveForeground,
          Icons.cancel_outlined,
        );
      default:
        return PayoutStatusUi._(
            status, '', TekaColors.neutralForeground, Icons.help_outline);
    }
  }

  /// Open = the money is committed and the seller cannot request another.
  static bool isOpen(String status) => const {
        'REQUESTED',
        'APPROVED',
        'PROCESSING'
      }.contains(status.toUpperCase());
}

String payoutMethodLabel(String method) {
  switch (method.toUpperCase()) {
    case 'MPESA':
    case 'M_PESA':
      return 'M-Pesa (Vodacom)';
    case 'AIRTEL_MONEY':
      return 'Airtel Money';
    case 'ORANGE_MONEY':
      return 'Orange Money';
    default:
      return method;
  }
}

/// « +243 97• ••• 001 » — the seller recognises their own number from the
/// operator prefix and the last digits without showing it whole in a list
/// that may be read over a shoulder. The detail and the request confirmation
/// show it in full, because there the seller must check where the money goes.
String maskPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return phone;
  final country = phone.startsWith('+') ? '+${digits.substring(0, 3)}' : digits.substring(0, 3);
  final local = digits.substring(3);
  if (local.length < 5) return phone;
  final head = local.substring(0, 2);
  final tail = local.substring(local.length - 3);
  return '$country $head• ••• $tail';
}

/// Seller-facing earning state vocabulary (mirrors seller-web `lib/earnings.ts`).
/// Tones: warning while held, success when withdrawable, info while committed
/// to a payout, neutral once paid (history), neutral when reversed.
class EarningStateUi {
  const EarningStateUi._(this.label, this.hint, this.color);

  final String label;
  final String hint;
  final Color color;

  static EarningStateUi of(String state) {
    switch (state.toUpperCase()) {
      case 'HELD':
        return const EarningStateUi._(
            'En attente (retour possible)',
            'Disponible après la fenêtre de retour de 2 jours.',
            TekaColors.warningForeground);
      case 'AVAILABLE':
        return const EarningStateUi._(
            'Disponible', 'Compte dans votre solde disponible.', TekaColors.successForeground);
      case 'RESERVED':
        return const EarningStateUi._(
            'Réservé (virement en cours)',
            'Engagé dans votre demande de virement.',
            TekaColors.infoForeground);
      case 'PAID':
        return const EarningStateUi._(
            'Payé', 'Versé lors d’un virement précédent.', TekaColors.neutralForeground);
      case 'REVERSED':
        return const EarningStateUi._(
            'Annulé', 'Commande retournée ou annulée.', TekaColors.neutralForeground);
      default:
        return EarningStateUi._(state, '', TekaColors.neutralForeground);
    }
  }
}

/// One real event of a payout, from the timestamps the API stores. Nothing
/// is invented: a payout that was never approved has no « Approuvé » entry,
/// and no future step is listed. Labels are « … le » so each reads as a
/// dated fact; the reason and the payment reference stay in their own rows.
class PayoutEvent {
  const PayoutEvent(this.label, this.at, this.color);
  final String label;
  final DateTime at;
  final Color color;
}

List<PayoutEvent> payoutEvents(PayoutModel payout) {
  final events = <PayoutEvent>[
    PayoutEvent(
        'Demandé le', payout.requestedAtDate, TekaColors.warningForeground),
  ];
  final approved = payout.approvedAtDate;
  if (approved != null) {
    events.add(PayoutEvent('Approuvé le', approved, TekaColors.infoForeground));
  }
  final processing = payout.processingAtDate;
  if (processing != null) {
    events.add(
        PayoutEvent('Virement lancé le', processing, TekaColors.infoForeground));
  }
  final status = payout.status.toUpperCase();
  final processed = payout.processedAtDate;
  if (status == 'COMPLETED' && processed != null) {
    events.add(PayoutEvent('Payé le', processed, TekaColors.successForeground));
  }
  final rejected = payout.rejectedAtDate;
  if (status == 'REJECTED' && rejected != null) {
    events.add(PayoutEvent(processing != null ? 'Échec le' : 'Refusé le',
        rejected, TekaColors.destructiveForeground));
  }
  events.sort((a, b) => a.at.compareTo(b.at));
  return events;
}
