export function sellerSetupTemplate(setupUrl: string, expiryHours: number): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Configurez votre compte vendeur Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">Configurez votre compte vendeur</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                Teka RDC a mis à niveau sa connexion vendeur. Pour continuer à utiliser votre compte, veuillez définir un mot de passe en cliquant sur le bouton ci-dessous.
              </p>
              <p style="margin:0 0 24px 0;color:#374151;line-height:1.6;">
                Ce lien expire dans <strong>${expiryHours} heures</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:6px;background:#BF0000;">
                    <a href="${setupUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">Définir mon mot de passe</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;">Ou copiez ce lien :</p>
              <p style="margin:0 0 24px 0;color:#6b7280;font-size:13px;word-break:break-all;">
                <a href="${setupUrl}" style="color:#BF0000;">${setupUrl}</a>
              </p>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Si vous n'êtes pas vendeur sur Teka RDC, ignorez cet email.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;">Teka RDC &middot; <a href="https://teka.cd" style="color:#9ca3af;">teka.cd</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
