export type SellerVerificationEmailEvent = 'submitted' | 'verified' | 'rejected' | 'revoked';

const COPY: Record<SellerVerificationEmailEvent, { title: string; body: string; cta: string }> = {
  submitted: {
    title: 'Documents reçus — vérification en cours',
    body: "Nous avons bien reçu vos documents justificatifs. L'équipe Teka RDC les examine ; vous serez informé du résultat. Aucune action n'est requise de votre part.",
    cta: 'Voir ma vérification',
  },
  verified: {
    title: 'Votre boutique est vérifiée ✓',
    body: "Teka RDC a examiné les documents justificatifs que vous avez fournis : votre boutique porte désormais le badge « Vérifié » sur vos fiches produits. Ce badge signifie uniquement que Teka a examiné vos documents ; il ne constitue pas une certification officielle.",
    cta: 'Voir ma boutique',
  },
  rejected: {
    title: 'Vérification refusée',
    body: 'Vos documents justificatifs n’ont pas pu être validés. Vous pouvez soumettre de nouveaux documents depuis votre espace vendeur.',
    cta: 'Soumettre de nouveaux documents',
  },
  revoked: {
    title: 'Badge « Vérifié » retiré',
    body: 'Le badge « Vérifié » de votre boutique a été retiré. Votre compte vendeur reste actif ; vous pouvez soumettre des documents à jour pour une nouvelle vérification.',
    cta: 'Mettre à jour mes documents',
  },
};

export function sellerVerificationTemplate(
  firstName: string | null,
  event: SellerVerificationEmailEvent,
  reason: string | null,
  url: string,
): string {
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const c = COPY[event];
  const reasonBlock =
    reason && (event === 'rejected' || event === 'revoked')
      ? `<p style="margin:0 0 16px 0;padding:12px 16px;background:#fef2f2;border-radius:6px;color:#991b1b;line-height:1.6;"><strong>Raison :</strong> ${escapeHtml(reason)}</p>`
      : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${c.title} — Teka RDC</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#111827;">${c.title}</h1>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#374151;line-height:1.6;">${c.body}</p>
              ${reasonBlock}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="background:#BF0000;border-radius:6px;">
                    <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">${c.cta}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">L'équipe Teka RDC</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );
}
