/**
 * S12 security notice — the seller's payout destination (mobile money) was
 * changed. Sent on every change, to the account email, with the phone masked.
 * Same inline-styled shape as the other seller templates.
 */
export function payoutMethodChangedTemplate(
  firstName: string | null,
  methodLabel: string,
  maskedPhone: string,
  changedLabel: string,
  availableLabel: string,
  dashboardUrl: string,
): string {
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Destination de retrait modifiée — Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">Destination de retrait modifiée</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                La destination de vos retraits (mobile money) a été modifiée le <strong>${changedLabel}</strong> :
                <strong>${methodLabel}</strong> — <strong>${maskedPhone}</strong>.
              </p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                Par sécurité, aucun retrait ne peut être demandé avant le <strong>${availableLabel}</strong>.
                Les retraits déjà demandés conservent leur destination d’origine.
              </p>
              <p style="margin:0 0 24px 0;padding:12px 16px;background:#fef2f2;border-left:4px solid #BF0000;color:#7f1d1d;line-height:1.6;">
                <strong>Vous n’êtes pas à l’origine de ce changement ?</strong> Changez votre mot de passe immédiatement et contactez le support Teka RDC.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:6px;background:#BF0000;">
                    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">Voir mes revenus</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Ce message est envoyé à chaque modification de la destination de retrait. Teka RDC ne vous demandera jamais votre mot de passe par e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
