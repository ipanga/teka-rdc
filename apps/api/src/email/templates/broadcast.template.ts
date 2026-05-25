/**
 * Admin broadcast (announcement / marketing) email.
 *
 * Renders the admin-authored title + message in a clean French shell. No
 * CTA button — the broadcast body itself carries any call to action. Brand
 * red header bar matches the order-event templates from PR A1.
 */
export function broadcastTemplate(title: string, message: string): string {
  const escapedTitle = escapeHtml(title);
  // Preserve admin-authored newlines as <br>. Message length is capped to
  // 160 chars upstream by CreateBroadcastDto, so no risk of layout blowup.
  const escapedBody = escapeHtml(message).replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapedTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#BF0000;padding:16px 32px;">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:0.5px;">TEKA RDC</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;line-height:1.4;">${escapedTitle}</h1>
              <p style="margin:0 0 24px 0;color:#374151;line-height:1.6;font-size:15px;">${escapedBody}</p>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Retrouvez toutes nos offres sur <a href="https://teka.cd" style="color:#BF0000;text-decoration:none;">teka.cd</a>.
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
