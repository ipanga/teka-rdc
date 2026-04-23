export function welcomeTemplate(firstName: string | null, verificationUrl: string | null): string {
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const verifyBlock = verificationUrl
    ? `<p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
         Pour activer toutes les fonctionnalités de votre compte, veuillez vérifier votre adresse email :
       </p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
         <tr>
           <td style="border-radius:6px;background:#BF0000;">
             <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">Vérifier mon email</a>
           </td>
         </tr>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bienvenue sur Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">Bienvenue sur Teka RDC 🇨🇩</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                Votre compte a bien été créé. Vous pouvez maintenant découvrir des milliers de produits proposés par les vendeurs locaux de la RDC.
              </p>
              ${verifyBlock}
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Merci d'avoir rejoint Teka RDC.
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
