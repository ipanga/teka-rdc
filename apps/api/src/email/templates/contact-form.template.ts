function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ContactFormEmailInput {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  ipAddress?: string;
}

export function contactFormTemplate(input: ContactFormEmailInput): string {
  const { name, email, phone, subject, message, ipAddress } = input;
  // Preserve the user-written line breaks when rendering the message body.
  const bodyHtml = escapeHtml(message).replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Nouveau message — ${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:32px;">
          <tr>
            <td>
              <p style="margin:0 0 8px 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Teka RDC &middot; Formulaire de contact</p>
              <h1 style="margin:0 0 20px 0;font-size:20px;color:#111827;">${escapeHtml(subject)}</h1>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;margin-bottom:20px;">
                <tr>
                  <td style="padding:4px 0;color:#6b7280;width:90px;">Nom</td>
                  <td style="padding:4px 0;"><strong>${escapeHtml(name)}</strong></td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b7280;">Email</td>
                  <td style="padding:4px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#BF0000;">${escapeHtml(email)}</a></td>
                </tr>
                ${
                  phone
                    ? `<tr>
                  <td style="padding:4px 0;color:#6b7280;">Téléphone</td>
                  <td style="padding:4px 0;">${escapeHtml(phone)}</td>
                </tr>`
                    : ''
                }
                ${
                  ipAddress
                    ? `<tr>
                  <td style="padding:4px 0;color:#6b7280;">IP</td>
                  <td style="padding:4px 0;color:#9ca3af;font-family:ui-monospace,Menlo,monospace;font-size:12px;">${escapeHtml(ipAddress)}</td>
                </tr>`
                    : ''
                }
              </table>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;">

              <div style="font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${bodyHtml}</div>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;">Répondez directement à cet email pour contacter <strong>${escapeHtml(name)}</strong>.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
