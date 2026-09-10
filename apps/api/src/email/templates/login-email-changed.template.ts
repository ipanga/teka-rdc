/**
 * Security notice sent to the PREVIOUS address when a seller or admin changes
 * the email they log in with. The old address is the only one the legitimate
 * owner still controls if the account has been taken over, so it is the one
 * that must hear about the change.
 *
 * Carries no password, no token and no link that performs an action — only a
 * masked new address and a instruction to contact support.
 */
export function loginEmailChangedTemplate(
  firstName: string | null,
  maskedNewEmail: string,
  changedLabel: string,
  supportUrl: string,
): string {
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Adresse de connexion modifiée — Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">Adresse de connexion modifiée</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                L'adresse e-mail utilisée pour vous connecter à Teka RDC a été modifiée le
                <strong>${changedLabel}</strong>. Les prochaines connexions se feront avec
                <strong>${maskedNewEmail}</strong>.
              </p>
              <p style="margin:0 0 24px 0;padding:12px 16px;background:#fef2f2;border-left:4px solid #BF0000;color:#7f1d1d;line-height:1.6;">
                <strong>Vous n'êtes pas à l'origine de ce changement ?</strong> Contactez immédiatement le
                support Teka RDC : votre compte a probablement été compromis.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:6px;background:#BF0000;">
                    <a href="${supportUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">Contacter le support</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Ce message est envoyé à votre ancienne adresse à chaque changement. Teka RDC ne vous
                demandera jamais votre mot de passe par e-mail.
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
