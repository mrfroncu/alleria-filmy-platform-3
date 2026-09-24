const express = require('express');
const { audit } = require('../lib/helpers');
const { requireDev } = require('../lib/auth');
const { setSetting } = require('../lib/settings');

const router = express.Router();

// ============ SETUP WIZARD ============
// setup_status ('pending'/'skipped'/'completed') gates the /setup redirect the same way
// tos_updated_at gates TosGate (see setupStatus above) — a dev is force-redirected there only
// while it's still 'pending'. 'skipped' stops the forced redirect but keeps the Layout.jsx
// reminder banner up (it hides once 'completed'); both are reachable again any time via
// Dev Tools → Debug → "Uruchom ponownie kreator konfiguracji" (POST /api/setup/reset below).
router.post('/api/setup/complete', requireDev, (req, res) => {
  setSetting('setup_status', 'completed');
  audit(req.session.user.id, 'setup_complete', 'settings', null, null);
  res.json({ success: true });
});

router.post('/api/setup/skip', requireDev, (req, res) => {
  setSetting('setup_status', 'skipped');
  audit(req.session.user.id, 'setup_skip', 'settings', null, null);
  res.json({ success: true });
});

router.post('/api/setup/reset', requireDev, (req, res) => {
  setSetting('setup_status', 'pending');
  audit(req.session.user.id, 'setup_reset', 'settings', null, null);
  res.json({ success: true });
});

module.exports = router;
