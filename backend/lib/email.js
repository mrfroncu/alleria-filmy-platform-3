const nodemailer = require('nodemailer');
const { getSetting } = require('./settings');

// ============ EMAIL TEMPLATES (shared design, admin-editable content) ============
// Default body text for the admin-editable templates below — {tags} get replaced per-send.
// The visual design (header/colors/footer signature) lives only in wrapEmailHtml(), never here.
const EMAIL_TEMPLATE_DEFAULTS = {
  new_video: 'Cześć!\nW kategorii {category} pojawił się nowy film:\n\n{title}\nAutor: {author}',
  gdpr_notify: 'Użytkownik {user} złożył zgłoszenie: {type}.',
  gdpr_result_export: 'Twoja prośba o eksport danych została zatwierdzona. Plik jest już gotowy do pobrania w Twoim profilu.',
  gdpr_result_deletion: 'Twoja prośba o usunięcie konta została zatwierdzona. Twoje dane osobowe zostały zanonimizowane, a konto wylogowane. Ta operacja jest nieodwracalna.',
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Template text is always plain content, never HTML — everything (including the static parts of
// the template) is escaped first, so an admin typing "<b>" ends up as literal text, not markup.
// Blank lines become paragraph breaks.
function renderTemplateParagraphs(template, replacements) {
  let body = escapeHtml(template);
  for (const [key, val] of Object.entries(replacements)) {
    body = body.split(escapeHtml(key)).join(escapeHtml(val));
  }
  return body.split('\n').filter(line => line.trim() !== '')
    .map(line => `<p style="margin:0 0 14px 0; line-height:1.6; color:#3f3f46;">${line}</p>`).join('');
}

// Single shared shell for every email the platform sends — admin-editable templates only ever
// supply bodyHtml (via renderTemplateParagraphs above); the header/colors/footer are fixed here
// so every email looks consistent and professional regardless of who edits the content.
function wrapEmailHtml({ bodyHtml, ctaUrl, ctaLabel }) {
  const cta = ctaUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px;">
          <tr><td style="border-radius:10px; background-color:#7c3aed;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; padding:12px 26px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(ctaLabel || 'Otwórz')}</a>
          </td></tr>
        </table>` : '';
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background-color:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; overflow:hidden;">
        <tr><td style="background-color:#7c3aed; padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="https://alleria.pl/image/favicon.png" alt="" width="28" height="28" style="display:block; border-radius:6px;"></td>
            <td style="font-size:19px; font-weight:700; color:#ffffff;">Alleria Filmy</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px; font-size:15px;">
          ${bodyHtml}${cta}
        </td></tr>
        <tr><td style="padding:22px 32px; background-color:#fafafa; border-top:1px solid #ececec;">
          <p style="margin:0; font-size:13px; color:#71717a;">Pozdrawiamy,<br><strong style="color:#3f3f46;">Zespół Alleria.pl</strong></p>
          <p style="margin:10px 0 0; font-size:11px; color:#a1a1aa;">Ta wiadomość została wysłana automatycznie - nie odpowiadaj na nią.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Fresh transport per send — this app's email volume doesn't warrant pooling/cache invalidation.
function getMailTransport() {
  return nodemailer.createTransport({
    host: getSetting('smtp_host', ''),
    port: parseInt(getSetting('smtp_port', '587'), 10) || 587,
    secure: getSetting('smtp_secure', '0') === '1',
    auth: {
      user: getSetting('smtp_user', ''),
      pass: getSetting('smtp_password', ''),
    },
  });
}

// Never throws — one bad send should never break the publish flow, same philosophy as sendDiscordWebhook.
async function sendEmail({ to, subject, html }) {
  try {
    const from = getSetting('smtp_from', '') || getSetting('smtp_user', '');
    await getMailTransport().sendMail({ from, to, subject, html });
    return true;
  } catch (e) {
    console.error(`[EMAIL] Send to ${to} failed: ${e.message}`);
    return false;
  }
}

module.exports = { EMAIL_TEMPLATE_DEFAULTS, escapeHtml, renderTemplateParagraphs, wrapEmailHtml, getMailTransport, sendEmail };
