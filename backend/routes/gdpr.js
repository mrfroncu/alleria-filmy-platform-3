const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { notifyUser } = require('../notifications');
const { anonymizeUser, buildUserDataExport, gdprEnabled, notifyDevsOfGdprRequest, notifyUserOfGdprResult, purgeUserActivityData } = require('../lib/gdpr');
const { audit } = require('../lib/helpers');
const { gdprDir } = require('../lib/config');
const { gdprUpload } = require('../lib/uploads');
const { requireAuth, requireDev } = require('../lib/auth');

const router = express.Router();

router.post('/api/profile/gdpr/export', requireAuth, (req, res) => {
  if (!gdprEnabled()) return res.status(403).json({ error: 'Funkcja RODO nie jest włączona.' });
  const userId = req.session.user.id;
  const existing = db.prepare("SELECT id FROM gdpr_requests WHERE user_id = ? AND type = 'export' AND status = 'pending'").get(userId);
  if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie eksportu danych.' });
  try {
    const info = db.prepare("INSERT INTO gdpr_requests (user_id, type, due_at) VALUES (?, 'export', datetime('now', '+30 days'))").run(userId);
    const requestId = info.lastInsertRowid;
    const filename = `export_${requestId}.json`;
    fs.writeFileSync(path.join(gdprDir, filename), JSON.stringify(buildUserDataExport(userId), null, 2));
    db.prepare('UPDATE gdpr_requests SET export_file = ? WHERE id = ?').run(filename, requestId);
    audit(userId, 'gdpr_request', 'user', userId, 'export');
    notifyDevsOfGdprRequest('export', req.session.user).catch(e => console.error('[EMAIL] GDPR notify error:', e.message));
    res.json(db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(requestId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/profile/gdpr/deletion', requireAuth, (req, res) => {
  if (!gdprEnabled()) return res.status(403).json({ error: 'Funkcja RODO nie jest włączona.' });
  const userId = req.session.user.id;
  const existing = db.prepare("SELECT id FROM gdpr_requests WHERE user_id = ? AND type = 'deletion' AND status = 'pending'").get(userId);
  if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie usunięcia konta.' });
  try {
    const info = db.prepare("INSERT INTO gdpr_requests (user_id, type, due_at) VALUES (?, 'deletion', datetime('now', '+30 days'))").run(userId);
    audit(userId, 'gdpr_request', 'user', userId, 'deletion');
    notifyDevsOfGdprRequest('deletion', req.session.user).catch(e => console.error('[EMAIL] GDPR notify error:', e.message));
    res.json(db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/profile/gdpr/requests', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM gdpr_requests WHERE user_id = ? ORDER BY requested_at DESC').all(req.session.user.id));
});

router.delete('/api/profile/gdpr/requests/:id', requireAuth, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.user_id !== req.session.user.id) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Można anulować tylko oczekujące zgłoszenie.' });
  db.prepare('DELETE FROM gdpr_requests WHERE id = ?').run(reqRow.id);
  if (reqRow.export_file) { try { fs.unlinkSync(path.join(gdprDir, reqRow.export_file)); } catch (e) {} }
  res.json({ success: true });
});

router.get('/api/profile/gdpr/export/:id/download', requireAuth, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.user_id !== req.session.user.id || reqRow.type !== 'export' || reqRow.status !== 'approved' || !reqRow.export_file) {
    return res.status(403).json({ error: 'Plik nie jest (jeszcze) dostępny.' });
  }
  res.download(path.join(gdprDir, reqRow.export_file), `moje-dane-alleria-${reqRow.id}.json`);
});

// ============ DEBUG / DEV API ============

router.get('/api/debug/gdpr/pending-count', requireDev, (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM gdpr_requests WHERE status = 'pending'`).get();
  res.json({ count });
});

router.get('/api/debug/gdpr/requests', requireDev, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.anonymized_original_username, u.anonymized_original_display_name
    FROM gdpr_requests r JOIN users u ON r.user_id = u.id
    ORDER BY r.requested_at DESC
  `).all();
  res.json(rows);
});

router.get('/api/debug/gdpr/requests/:id/file', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.type !== 'export' || !reqRow.export_file) return res.status(404).json({ error: 'Brak pliku.' });
  res.download(path.join(gdprDir, reqRow.export_file), reqRow.export_file);
});

router.post('/api/debug/gdpr/requests/:id/replace', requireDev, gdprUpload.single('file'), (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.type !== 'export') {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    return res.status(404).json({ error: 'Nie znaleziono zgłoszenia eksportu.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
  try {
    JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Przesłany plik nie jest poprawnym JSON-em.' });
  }
  const filename = reqRow.export_file || `export_${reqRow.id}.json`;
  fs.renameSync(req.file.path, path.join(gdprDir, filename));
  db.prepare('UPDATE gdpr_requests SET export_file = ? WHERE id = ?').run(filename, reqRow.id);
  audit(req.session.user.id, 'gdpr_replace_file', 'user', reqRow.user_id, `request #${reqRow.id}`);
  res.json({ success: true });
});

router.post('/api/debug/gdpr/requests/:id/approve', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
  try {
    // Fetched before anonymizeUser() below, which wipes email/discord_email for deletions.
    const user = db.prepare('SELECT email, discord_email FROM users WHERE id = ?').get(reqRow.user_id);
    // Deletion requests anonymize the account AND purge its activity logs in one step, per the
    // Regulamin's promise that a deletion request removes everything within 30 days (no separate
    // ask needed) — authored videos are the only thing that deliberately survives.
    if (reqRow.type === 'deletion') {
      anonymizeUser(reqRow.user_id);
      purgeUserActivityData(reqRow.user_id);
    }
    db.prepare("UPDATE gdpr_requests SET status = 'approved', activity_purged_at = CASE WHEN type = 'deletion' THEN datetime('now') ELSE activity_purged_at END, processed_by = ?, processed_at = datetime('now') WHERE id = ?")
      .run(req.session.user.id, reqRow.id);
    audit(req.session.user.id, 'gdpr_approve', 'user', reqRow.user_id, reqRow.type);
    if (user) notifyUserOfGdprResult(reqRow.type, user).catch(e => console.error('[EMAIL] GDPR result notify failed:', e.message));
    // Deletion anonymizes + logs the user out above — an in-app bell notification would never
    // be seen, so only export (where the account and session stay intact) gets one.
    if (reqRow.type === 'export') {
      notifyUser(reqRow.user_id, { type: 'gdpr_export_ready', title: 'Eksport danych gotowy', body: 'Twoja prośba o eksport danych została zatwierdzona.', url: '/profile' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/debug/gdpr/requests/:id/reject', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
  const reason = String(req.body.reason || '').slice(0, 1000);
  db.prepare("UPDATE gdpr_requests SET status = 'rejected', admin_note = ?, processed_by = ?, processed_at = datetime('now') WHERE id = ?")
    .run(reason, req.session.user.id, reqRow.id);
  audit(req.session.user.id, 'gdpr_reject', 'user', reqRow.user_id, `${reqRow.type}: ${reason}`);
  res.json({ success: true });
});

// Approving a deletion request now purges activity data automatically (see /approve above) —
// this stays around as a manual backfill for deletion requests that were approved before that
// behavior existed, so their activity data can still be brought in line with the Regulamin.
router.post('/api/debug/gdpr/requests/:id/purge-activity', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.type !== 'deletion' || reqRow.status !== 'approved') {
    return res.status(400).json({ error: 'Logi aktywności można usunąć tylko dla zatwierdzonego zgłoszenia usunięcia konta.' });
  }
  if (reqRow.activity_purged_at) return res.status(400).json({ error: 'Logi aktywności zostały już usunięte.' });
  purgeUserActivityData(reqRow.user_id);
  db.prepare("UPDATE gdpr_requests SET activity_purged_at = datetime('now') WHERE id = ?").run(reqRow.id);
  audit(req.session.user.id, 'gdpr_purge_activity', 'user', reqRow.user_id, `request #${reqRow.id}`);
  res.json({ success: true });
});

module.exports = router;
