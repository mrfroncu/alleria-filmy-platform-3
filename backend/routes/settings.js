const express = require('express');
const db = require('../db');
const { EMAIL_TEMPLATE_DEFAULTS, renderTemplateParagraphs, sendEmail, wrapEmailHtml } = require('../lib/email');
const { GDPR_REGION_VALUES, TS3_DELIVERY_VALUES, settingsPayload } = require('../lib/appSettings');
const { IFRAME_ORIGIN_RE } = require('../lib/config');
const { LIMIT_DEFAULTS, clearSetting, getSetting, setSetting } = require('../lib/settings');
const { audit } = require('../lib/helpers');
const { requireDev } = require('../lib/auth');

const router = express.Router();

router.get('/api/debug/settings', requireDev, (req, res) => {
  res.json(settingsPayload());
});

router.post('/api/debug/settings', requireDev, (req, res) => {
  const { webhook_domain_restriction } = req.body;
  if (webhook_domain_restriction !== undefined) {
    setSetting('webhook_domain_restriction', webhook_domain_restriction ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `webhook_domain_restriction → ${webhook_domain_restriction ? 'ON' : 'OFF'}`);
  }
  // Content length limits
  for (const key of Object.keys(LIMIT_DEFAULTS)) {
    if (req.body[key] !== undefined) {
      const n = parseInt(req.body[key], 10);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} (dozwolone 1–100000).` });
      }
      setSetting(key, n);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${n}`);
    }
  }
  // TS3 login code delivery method
  if (req.body.ts3_code_delivery !== undefined) {
    const v = String(req.body.ts3_code_delivery);
    if (!TS3_DELIVERY_VALUES.includes(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość ts3_code_delivery (pm | poke | both).' });
    }
    setSetting('ts3_code_delivery', v);
    audit(req.session.user.id, 'edit', 'settings', null, `ts3_code_delivery → ${v}`);
  }
  // GDPR/RODO region — gates the data-export/deletion request UI and endpoints
  if (req.body.gdpr_region !== undefined) {
    const v = String(req.body.gdpr_region);
    if (!GDPR_REGION_VALUES.includes(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość gdpr_region (off | eu | brazil).' });
    }
    setSetting('gdpr_region', v);
    audit(req.session.user.id, 'edit', 'settings', null, `gdpr_region → ${v}`);
  }
  // SMTP config
  const SMTP_TEXT_FIELDS = ['smtp_host', 'smtp_user', 'smtp_password', 'smtp_from'];
  for (const key of SMTP_TEXT_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]);
      setSetting(key, v);
      const isSecret = key === 'smtp_password';
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${isSecret ? '(zmieniono)' : v}`);
    }
  }
  if (req.body.smtp_port !== undefined) {
    const v = String(req.body.smtp_port).trim();
    if (v !== '' && !/^\d+$/.test(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość smtp_port — oczekiwano samych cyfr.' });
    }
    setSetting('smtp_port', v || '587');
    audit(req.session.user.id, 'edit', 'settings', null, `smtp_port → ${v}`);
  }
  if (req.body.smtp_secure !== undefined) {
    setSetting('smtp_secure', req.body.smtp_secure ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null, `smtp_secure → ${req.body.smtp_secure ? 'ON' : 'OFF'}`);
  }
  // Sitewide default email templates — content only, see wrapEmailHtml for the fixed design.
  for (const key of ['email_template_new_video', 'email_template_gdpr_notify', 'email_template_gdpr_result_export', 'email_template_gdpr_result_deletion']) {
    if (req.body[key] !== undefined) {
      setSetting(key, String(req.body[key]));
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → (zmieniono)`);
    }
  }
  // Display settings — videos per page / grid columns / logs per page (formerly .env-only)
  for (const key of ['videos_per_page', 'grid_columns', 'logs_per_page']) {
    if (req.body[key] !== undefined) {
      const n = parseInt(req.body[key], 10);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} (dozwolone 1–500).` });
      }
      setSetting(key, n);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${n}`);
    }
  }
  // Minimum video card width in px — the grid never squeezes cards narrower than this; it adds
  // columns (up to the max above) as space allows instead. Bounded to sane, always-usable values.
  if (req.body.grid_card_min_width !== undefined) {
    const n = parseInt(req.body.grid_card_min_width, 10);
    if (!Number.isInteger(n) || n < 150 || n > 800) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość dla grid_card_min_width (dozwolone 150–800).' });
    }
    setSetting('grid_card_min_width', n);
    audit(req.session.user.id, 'edit', 'settings', null, `grid_card_min_width → ${n}`);
  }
  // Infinite scroll on the video grid (homepage/category/tag/author lists) vs. the classic
  // numbered page buttons.
  if (req.body.infinite_scroll !== undefined) {
    setSetting('infinite_scroll', req.body.infinite_scroll ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `infinite_scroll → ${req.body.infinite_scroll ? 'ON' : 'OFF'}`);
  }
  // iframe embedding toggle (formerly .env-only)
  if (req.body.iframe_embed_enabled !== undefined) {
    setSetting('iframe_embed_enabled', req.body.iframe_embed_enabled ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `iframe_embed_enabled → ${req.body.iframe_embed_enabled ? 'ON' : 'OFF'}`);
  }
  // iframe allowed origins list (formerly IFRAME_ALLOWED_ORIGINS in .env)
  if (req.body.iframe_allowed_origins !== undefined) {
    const list = Array.isArray(req.body.iframe_allowed_origins) ? req.body.iframe_allowed_origins : [];
    const cleaned = list.map(o => String(o).trim()).filter(Boolean);
    const invalid = cleaned.filter(o => !IFRAME_ORIGIN_RE.test(o));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Nieprawidłowy format domeny: ${invalid.join(', ')} (oczekiwano np. https://alleria.pl, bez przecinków/spacji).` });
    }
    setSetting('iframe_allowed_origins', cleaned.join(','));
    audit(req.session.user.id, 'edit', 'settings', null, `iframe_allowed_origins → ${cleaned.join(', ') || '(puste)'}`);
  }
  // Top bar (page title + search + profile) visibility
  if (req.body.show_top_bar !== undefined) {
    setSetting('show_top_bar', req.body.show_top_bar ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `show_top_bar → ${req.body.show_top_bar ? 'ON' : 'OFF'}`);
  }
  // Whether ordinary members can upload a custom avatar (admin/dev can always upload one)
  if (req.body.allow_custom_avatars !== undefined) {
    setSetting('allow_custom_avatars', req.body.allow_custom_avatars ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `allow_custom_avatars → ${req.body.allow_custom_avatars ? 'ON' : 'OFF'}`);
  }
  // Custom-chrome YouTube player overlay vs. plain YouTube embed
  if (req.body.youtube_custom_player !== undefined) {
    setSetting('youtube_custom_player', req.body.youtube_custom_player ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `youtube_custom_player → ${req.body.youtube_custom_player ? 'ON' : 'OFF'}`);
  }
  // TeamSpeak 3/6 connection config — always writable here regardless of TS_CONFIG_SOURCE, so
  // values can be pre-staged in the panel before flipping the .env flag over to 'panel'.
  // Empty string clears the row (falls back to the .env-derived value again).
  const TS_TEXT_FIELDS = ['ts6_host', 'ts6_username', 'ts6_password', 'ts6_api_key', 'ts3_host', 'ts3_username', 'ts3_password', 'ts_bot_nickname'];
  const TS_NUMERIC_FIELDS = ['ts6_port', 'ts6_server_id', 'ts6_member_group_id', 'ts6_admin_group_id', 'ts3_port', 'ts3_server_id', 'ts3_member_group_id', 'ts3_admin_group_id'];
  for (const key of TS_TEXT_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v === '') clearSetting(key); else setSetting(key, v);
      const isSecret = key.includes('password') || key.includes('api_key');
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${isSecret ? '(zmieniono)' : (v || '(reset do .env)')}`);
    }
  }
  for (const key of TS_NUMERIC_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v !== '' && !/^\d+$/.test(v)) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} — oczekiwano samych cyfr.` });
      }
      if (v === '') clearSetting(key); else setSetting(key, v);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${v || '(reset do .env)'}`);
    }
  }
  // Discord member/editor role IDs — always writable here regardless of DISCORD_ROLES_CONFIG_SOURCE.
  for (const key of ['discord_member_role_id', 'discord_admin_role_id']) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v !== '' && !/^\d{5,25}$/.test(v)) {
        return res.status(400).json({ error: `Nieprawidłowe ID roli Discord dla ${key} — oczekiwano samych cyfr.` });
      }
      if (v === '') clearSetting(key); else setSetting(key, v);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${v || '(reset do .env)'}`);
    }
  }
  res.json({ success: true, ...settingsPayload() });
});

router.post('/api/debug/settings/test-email', requireDev, async (req, res) => {
  const dev = db.prepare('SELECT email, discord_email FROM users WHERE id = ?').get(req.session.user.id);
  const to = String(req.body.to || '').trim() || dev?.email || dev?.discord_email;
  if (!to) return res.status(400).json({ error: 'Podaj adres e-mail — Twoje konto nie ma żadnego zapisanego.' });
  const html = wrapEmailHtml({ bodyHtml: '<p style="margin:0; line-height:1.6; color:#3f3f46;">To jest testowa wiadomość z panelu Dev Tools. Konfiguracja SMTP działa poprawnie.</p>' });
  const ok = await sendEmail({ to, subject: 'Alleria Filmy — testowy e-mail', html });
  if (!ok) return res.status(500).json({ error: 'Wysyłka nie powiodła się — sprawdź konfigurację SMTP i logi serwera.' });
  res.json({ success: true, to });
});

// Renders a template (saved, or an in-progress ?template= draft) with sample data through the
// exact same code path a real send uses, so what you preview is guaranteed to match what's sent.
router.get('/api/debug/settings/email-preview/:type', requireDev, (req, res) => {
  const { type } = req.params;
  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  if (type === 'new_video') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video);
    const replacements = {
      '{title}': 'Przykładowy film', '{author}': 'Jan Kowalski', '{category}': 'Filmy akcji',
      '{description}': 'Przykładowy opis filmu użyty w podglądzie szablonu.', '{date}': new Date().toISOString().slice(0, 10),
      '{id}': '123', '{url}': `${baseUrl}/video/123`, '{thumbnail}': '',
    };
    const bodyHtml = renderTemplateParagraphs(template, replacements);
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Obejrzyj film' }));
  }
  if (type === 'gdpr_notify') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_notify', EMAIL_TEMPLATE_DEFAULTS.gdpr_notify);
    const replacements = { '{user}': 'Jan Kowalski (@jkowalski)', '{type}': 'eksportu danych', '{url}': `${baseUrl}/manage?tab=gdpr` };
    const bodyHtml = renderTemplateParagraphs(template, replacements);
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Przejdź do zgłoszeń RODO' }));
  }
  if (type === 'gdpr_result_export') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_result_export', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_export);
    const bodyHtml = renderTemplateParagraphs(template, {});
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: `${baseUrl}/profile`, ctaLabel: 'Przejdź do profilu' }));
  }
  if (type === 'gdpr_result_deletion') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_result_deletion', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_deletion);
    const bodyHtml = renderTemplateParagraphs(template, {});
    return res.type('html').send(wrapEmailHtml({ bodyHtml }));
  }
  res.status(404).send('Nieznany typ szablonu.');
});

module.exports = router;
