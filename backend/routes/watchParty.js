const express = require('express');
const { createParty, createWsToken, deleteParty, getParty, listParties } = require('../watchParty');
const { requireAuth, requireDev } = require('../lib/auth');

const router = express.Router();

// === Watch Party ===
router.get('/api/watch-party/token', requireAuth, (req, res) => {
  const token = createWsToken(req.session.user);
  res.json({ token });
});

router.post('/api/watch-party', requireAuth, (req, res) => {
  const party = createParty(req.session.user);
  res.json({ code: party.code, id: party.id });
});

router.get('/api/watch-party/:code', requireAuth, (req, res) => {
  const party = getParty(req.params.code.toUpperCase());
  if (!party) return res.status(404).json({ error: 'Party not found' });
  res.json({ id: party.id, code: party.code, hostId: party.hostId, memberCount: party.members.size });
});

router.delete('/api/watch-party/:code', requireAuth, (req, res) => {
  const party = getParty(req.params.code.toUpperCase());
  if (!party) return res.status(404).json({ error: 'Party not found' });
  if (party.hostId !== req.session.user.id) return res.status(403).json({ error: 'Not the host' });
  const u = req.session.user;
  deleteParty(req.params.code.toUpperCase(), u.id, u.display_name || u.username);
  res.json({ ok: true });
});

// ============ WATCH PARTY MANAGEMENT (admin) ============
router.get('/api/admin/watch-parties', requireDev, (req, res) => {
  res.json(listParties());
});

router.delete('/api/admin/watch-parties/:code', requireDev, (req, res) => {
  const code = req.params.code.toUpperCase();
  const u = req.session.user;
  if (!getParty(code)) return res.status(404).json({ error: 'Party not found' });
  deleteParty(code, u.id, u.display_name || u.username);
  res.json({ ok: true });
});

module.exports = router;
