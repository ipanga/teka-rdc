export function otpEmailTemplate(code: string, expiryMinutes: number): string {
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
      Votre code de vérification est :
    </p>
    <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1e293b;">${code}</span>
    </div>
    <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
      Ce code est valide pendant <strong>${expiryMinutes} minutes</strong>.
    </p>
    <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
      Si vous n'avez pas demandé ce code, ignorez cet email.
    </p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;">
    <p style="color: #94a3b8; font-size: 12px; text-align: center;">
      &copy; ${new Date().getFullYear()} Teka RDC. Tous droits réservés.
    </p>
  </div>
</body>
</html>`;
}
