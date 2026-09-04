import 'package:flutter/material.dart';
import '../../../core/theme/teka_colors.dart';

/// Seller-facing payout vocabulary — one source for the list tile, the detail
/// screen and tests. Approval is never worded as payment; only COMPLETED
/// reads « Payé ». Mirrors seller-web `lib/payout-notifications.ts`.
class PayoutStatusUi {
  const PayoutStatusUi._(this.label, this.hint, this.color);

  final String label;
  final String hint;
  final Color color;

  static PayoutStatusUi of(String status) {
    switch (status.toUpperCase()) {
      case 'REQUESTED':
        return const PayoutStatusUi._(
          'Demande reçue',
          'Teka examine votre demande. Le montant est réservé sur votre solde.',
          TekaColors.warning,
        );
      case 'APPROVED':
        return const PayoutStatusUi._(
          'Approuvé — virement en préparation',
          "Votre demande est approuvée. L'argent n'a pas encore été envoyé ; vous serez informé dès que le virement sera effectué.",
          Color(0xFF3B82F6),
        );
      case 'PROCESSING':
        return const PayoutStatusUi._(
          'Virement en cours',
          'Le virement vers votre compte est en cours.',
          Color(0xFF8B5CF6),
        );
      case 'COMPLETED':
        return const PayoutStatusUi._(
          'Payé',
          "L'argent a été envoyé. Conservez la référence de paiement pour toute réclamation.",
          TekaColors.success,
        );
      case 'REJECTED':
        return const PayoutStatusUi._(
          'Refusé / échec',
          'La demande a été refusée ou le virement a échoué. Le montant est de nouveau disponible sur votre solde ; vérifiez la raison puis refaites une demande.',
          TekaColors.destructive,
        );
      default:
        return PayoutStatusUi._(status, '', TekaColors.mutedForeground);
    }
  }
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

/// Seller-facing earning state vocabulary (mirrors seller-web `lib/earnings.ts`).
class EarningStateUi {
  const EarningStateUi._(this.label, this.color);

  final String label;
  final Color color;

  static EarningStateUi of(String state) {
    switch (state.toUpperCase()) {
      case 'HELD':
        return const EarningStateUi._(
            'En attente (retour possible)', TekaColors.warning);
      case 'AVAILABLE':
        return const EarningStateUi._('Disponible', Color(0xFF3B82F6));
      case 'RESERVED':
        return const EarningStateUi._(
            'Réservé (virement en cours)', TekaColors.tekaRed);
      case 'PAID':
        return const EarningStateUi._('Payé', TekaColors.success);
      case 'REVERSED':
        return const EarningStateUi._('Annulé', TekaColors.mutedForeground);
      default:
        return EarningStateUi._(state, TekaColors.mutedForeground);
    }
  }
}

