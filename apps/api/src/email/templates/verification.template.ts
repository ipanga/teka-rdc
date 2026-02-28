export function emailVerificationTemplate(verificationUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #BF0000; font-size: 24px; margin: 0;">Teka RDC</h1>
    </div>
    <p style="color: #334155; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
      Cliquez sur le bouton ci-dessous pour vérifier votre adresse email :
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${verificationUrl}" style="display: inline-block; background: #BF0000; color: white; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
        Vérifier mon email
      </a>
    </div>
    <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
      Ce lien est valide pendant <strong>1 heure</strong>.
    </p>
    <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
      Si vous n'avez pas créé de compte sur Teka RDC, ignorez cet email.
    </p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;">
    <p style="color: #94a3b8; font-size: 12px; text-align: center; word-break: break-all;">
      Si le bouton ne fonctionne pas, copiez ce lien : ${verificationUrl}
    </p>
    <p style="color: #94a3b8; font-size: 12px; text-align: center;">
      &copy; ${new Date().getFullYear()} Teka RDC. Tous droits réservés.
    </p>
  </div>
</body>
</html>`;
}
