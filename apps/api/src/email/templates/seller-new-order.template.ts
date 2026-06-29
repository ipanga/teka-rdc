export function sellerNewOrderTemplate(
  firstName: string | null,
  orderNumber: string,
  itemCount: number,
  subtotalLabel: string,
  buyerTown: string | null,
  orderUrl: string,
): string {
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const itemLabel = itemCount > 1 ? `${itemCount} articles` : `${itemCount} article`;
  const townLine = buyerTown
    ? `<p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">Livraison vers : <strong>${buyerTown}</strong>.</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Nouvelle commande — Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">Nouvelle commande reçue</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">
                Vous avez reçu une nouvelle commande <strong>${orderNumber}</strong> — ${itemLabel}, <strong>${subtotalLabel} FC</strong>.
              </p>
              ${townLine}
              <p style="margin:0 0 24px 0;color:#374151;line-height:1.6;">
                Préparez les articles et confirmez leur disponibilité. Une fois prêts, marquez la commande « Prête pour collecte » : Teka RDC s'occupe de la livraison et de l'encaissement.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:6px;background:#BF0000;">
                    <a href="${orderUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">Voir la commande</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Merci de vendre sur Teka RDC.
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
