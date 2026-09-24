const express = require('express');
const db = require('../db');
const { DEFAULT_TOS_MD, DEFAULT_TOS_UPDATED_AT } = require('../defaultTos');
const { audit } = require('../lib/helpers');
const { getSetting, setSetting } = require('../lib/settings');
const { requireAuth, requireDev } = require('../lib/auth');

const router = express.Router();

// Public — the Regulamin is a legal document meant to be readable pre-login too.
router.get('/api/tos', (req, res) => {
  res.json({
    content: getSetting('tos_content', DEFAULT_TOS_MD),
    updatedAt: getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT),
  });
});

router.post('/api/tos/accept', requireAuth, (req, res) => {
  // Must be the same ISO string format JS produces (see tos_updated_at below) — SQLite's own
  // datetime('now') uses a space separator ("2026-08-11 14:23:07"), which sorts BEFORE any
  // ISO string at the same instant (' ' < 'T' in ASCII) and made tosNeedsAcceptance() always
  // return true, regardless of actual order — an infinite re-accept loop.
  db.prepare('UPDATE users SET tos_accepted_at = ? WHERE id = ?').run(new Date().toISOString(), req.session.user.id);
  audit(req.session.user.id, 'tos_accept', 'user', req.session.user.id, null);
  res.json({ success: true });
});

// Returns the built-in default text without touching app_settings — the "Restore default" button
// loads this into the editor so a dev can review/tweak it before actually saving via /api/debug/tos.
router.get('/api/debug/tos/default', requireDev, (req, res) => {
  res.json({ content: DEFAULT_TOS_MD });
});

router.post('/api/debug/tos', requireDev, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Treść regulaminu nie może być pusta.' });
  const current = getSetting('tos_content', DEFAULT_TOS_MD);
  if (content !== current) {
    setSetting('tos_content', content);
    setSetting('tos_updated_at', new Date().toISOString());
    audit(req.session.user.id, 'edit', 'settings', null, 'tos_content updated');
  }
  res.json({ content, updatedAt: getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT) });
});

module.exports = router;
