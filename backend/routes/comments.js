const express = require('express');
const db = require('../db');
const { notifyUser } = require('../notifications');
const { audit } = require('../lib/helpers');
const { getLimit } = require('../lib/settings');
const { requireAdmin, requireAuth, requireDev } = require('../lib/auth');
const { userCanViewVideo } = require('../lib/access');

const router = express.Router();

// ============ COMMENTS ============
// Fixed preset — reactions are a lightweight signal, not free-form emoji input.
const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Attaches a `reactions: [{emoji, count, reacted}]` array to each comment in one extra
// query (grouped in JS) instead of one query per comment.
function attachReactions(comments, userId) {
  if (comments.length === 0) return comments;
  const placeholders = comments.map(() => '?').join(',');
  const rows = db.prepare(`SELECT comment_id, emoji, user_id FROM comment_reactions WHERE comment_id IN (${placeholders})`).all(...comments.map(c => c.id));
  const byComment = {};
  for (const r of rows) {
    const forComment = (byComment[r.comment_id] = byComment[r.comment_id] || {});
    const entry = (forComment[r.emoji] = forComment[r.emoji] || { emoji: r.emoji, count: 0, reacted: false });
    entry.count++;
    if (r.user_id === userId) entry.reacted = true;
  }
  return comments.map(c => ({ ...c, reactions: Object.values(byComment[c.id] || {}) }));
}

// ============ MENTIONS ============
// Stored inline in the comment text as @[Display Name](userId) — usernames aren't unique (TS
// nicknames, manual accounts), so the id is what's authoritative; the name is only the label.
const MENTION_RE = /@\[([^\]\n]{1,64})\]\((\d{1,10})\)/g;
const MAX_MENTIONS_PER_COMMENT = 10;

function mentionedUserIds(text) {
  const ids = new Set();
  for (const m of String(text || '').matchAll(MENTION_RE)) {
    ids.add(Number(m[2]));
    if (ids.size >= MAX_MENTIONS_PER_COMMENT) break;
  }
  return ids;
}

// Viewer-shaped user object for userCanViewVideo from a users row (sessions carry discord_roles
// as an array; the DB stores it as JSON text).
function accessUserFromRow(row) {
  let roles = [];
  try { roles = JSON.parse(row.discord_roles || '[]'); } catch (e) {}
  return { id: row.id, role: row.role, discord_roles: Array.isArray(roles) ? roles : [] };
}

// Bell notification for every mentioned user who can actually see the video — a mention never
// leaks the existence of a restricted video to someone outside its category.
function notifyMentions({ ids, video, comment, author, skip = new Set() }) {
  const authorName = author.display_name || author.username;
  for (const uid of ids) {
    if (uid === author.id || skip.has(uid)) continue;
    const row = db.prepare('SELECT id, role, discord_roles, is_anonymized FROM users WHERE id = ?').get(uid);
    if (!row || row.is_anonymized) continue;
    if (!userCanViewVideo(video, accessUserFromRow(row)).ok) continue;
    notifyUser(uid, {
      type: 'comment_mention',
      title: 'Wspomniano Cię w komentarzu',
      body: `${authorName} wspomniał(a) Cię pod filmem „${video.title}”`,
      url: `/video/${video.id}#comment-${comment.id}`,
    });
  }
}

// Autocomplete source for the @-mention picker: people who can see THIS video, matching the typed
// prefix/substring of their display name or username.
router.get('/api/videos/:id/mentionable', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    const q = String(req.query.q || '').trim().slice(0, 32).replace(/[\\%_]/g, '\\$&');
    const rows = db.prepare(`
      SELECT id, username, display_name, avatar, role, discord_roles FROM users
      WHERE (is_anonymized IS NULL OR is_anonymized = 0) AND id != ?
        AND (display_name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\')
      ORDER BY (COALESCE(display_name, username) LIKE ? ESCAPE '\\') DESC, COALESCE(display_name, username) COLLATE NOCASE
      LIMIT 50
    `).all(user.id, `%${q}%`, `%${q}%`, `${q}%`);
    const out = [];
    for (const r of rows) {
      if (!userCanViewVideo(video, accessUserFromRow(r)).ok) continue;
      out.push({ id: r.id, display_name: r.display_name || r.username, username: r.username, avatar: r.avatar });
      if (out.length >= 8) break;
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    const comments = db.prepare(`
      SELECT c.*, u.username, u.display_name, u.avatar
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ? ORDER BY c.created_at ASC
    `).all(req.params.id);
    res.json(attachReactions(comments, req.session.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/comments/:id/react', requireAuth, (req, res) => {
  try {
    const { emoji } = req.body;
    if (!COMMENT_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Nieprawidłowa reakcja.' });
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono komentarza.' });
    const userId = req.session.user.id;
    const existing = db.prepare('SELECT 1 FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, userId, emoji);
    if (existing) {
      db.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?').run(req.params.id, userId, emoji);
    } else {
      db.prepare('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)').run(req.params.id, userId, emoji);
    }
    const [{ reactions }] = attachReactions([{ id: parseInt(req.params.id) }], userId);
    res.json({ reactions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const video = db.prepare('SELECT id, title, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    const { content, parent_id } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Treść wymagana.' });
    const maxComment = getLimit('limit_comment');
    const trimmed = content.trim();
    if (trimmed.length > maxComment) return res.status(400).json({ error: `Komentarz może mieć maksymalnie ${maxComment} znaków.` });
    const result = db.prepare('INSERT INTO comments (video_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)').run(req.params.id, req.session.user.id, trimmed.slice(0, maxComment), parent_id || null);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    // A reply's parent author already gets the "Nowa odpowiedź" notification below — a mention
    // of that same person in the reply shouldn't ping them twice.
    const alreadyNotified = new Set();
    if (parent_id) {
      const parent = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(parent_id);
      if (parent && parent.user_id !== req.session.user.id) {
        const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
        notifyUser(parent.user_id, {
          type: 'comment_reply', title: 'Nowa odpowiedź',
          body: `${comment.display_name || comment.username} odpowiedział(a) na Twój komentarz`,
          url: `${baseUrl}/video/${req.params.id}#comment-${comment.id}`,
        });
        alreadyNotified.add(parent.user_id);
      }
    }
    notifyMentions({ ids: mentionedUserIds(comment.content), video, comment, author: { id: comment.user_id, username: comment.username, display_name: comment.display_name }, skip: alreadyNotified });
    res.json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit comment — silent=true means no edit trace (dev only)
router.put('/api/comments/:id', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono.' });
    const isOwner = comment.user_id === req.session.user.id;
    const isDev = req.session.user.role === 'dev';
    if (!isOwner && !isDev) return res.status(403).json({ error: 'Brak uprawnień.' });
    const { content, silent } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Treść wymagana.' });
    const maxComment = getLimit('limit_comment');
    const trimmed = content.trim();
    if (trimmed.length > maxComment) return res.status(400).json({ error: `Komentarz może mieć maksymalnie ${maxComment} znaków.` });
    const newContent = trimmed.slice(0, maxComment);
    const oldText = comment.content;
    if (silent && isDev) {
      db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(newContent, req.params.id);
    } else {
      let editHistory = []; try { editHistory = JSON.parse(comment.edit_history || '[]'); } catch (e) {}
      editHistory.push({ content: comment.content, date: new Date().toISOString() });
      if (editHistory.length > 20) editHistory = editHistory.slice(-20);
      db.prepare('UPDATE comments SET content = ?, edited = 1, edit_history = ? WHERE id = ?').run(newContent, JSON.stringify(editHistory), req.params.id);
    }
    const updated = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    // Only people newly mentioned by this edit get notified — re-saving a comment must not re-ping
    // everyone it already mentioned. A silent (traceless) dev edit notifies no one.
    if (!(silent && isDev)) {
      const before = mentionedUserIds(oldText);
      const added = new Set([...mentionedUserIds(newContent)].filter(uid => !before.has(uid)));
      if (added.size > 0) {
        const video = db.prepare('SELECT id, title, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(comment.video_id);
        if (video) notifyMentions({ ids: added, video, comment: updated, author: { id: updated.user_id, username: updated.username, display_name: updated.display_name } });
      }
    }
    audit(req.session.user.id, "edit", "comment", parseInt(req.params.id), `${silent?'[cicha] ':''}"${oldText.slice(0,50)}" → "${content.trim().slice(0,50)}"`);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Soft delete comment (marks as deleted, keeps for thread integrity)
router.delete('/api/comments/:id', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT c.*, u.display_name, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono.' });
    const canDel = comment.user_id === req.session.user.id || req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!canDel) return res.status(403).json({ error: 'Brak uprawnień.' });
    audit(req.session.user.id, "delete", "comment", parseInt(req.params.id), `[soft] autor: ${comment.display_name||comment.username}, treść: "${comment.content.slice(0,80)}"`);
    db.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").run(req.params.id);
    res.json({ success: true, soft: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Hard delete comment + all replies (dev only)
router.delete('/api/comments/:id/hard', requireDev, (req, res) => {
  try {
    const comment = db.prepare('SELECT c.*, u.display_name, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    const replyCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE parent_id = ?').get(req.params.id)?.c || 0;
    audit(req.session.user.id, "delete", "comment", parseInt(req.params.id), `[hard] autor: ${comment?.display_name||comment?.username||'?'}, treść: "${(comment?.content||'').slice(0,80)}", +${replyCount} odpowiedzi`);
    db.prepare('DELETE FROM comments WHERE parent_id = ?').run(req.params.id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ success: true, hard: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ COMMENT MODERATION QUEUE ============
const COMMENT_REPORT_REASONS = ['spam', 'harassment', 'spoiler', 'inappropriate', 'other'];

router.post('/api/comments/:id/report', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono komentarza.' });
    const { reason, description } = req.body;
    if (!COMMENT_REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Nieprawidłowy powód zgłoszenia.' });
    const desc = String(description || '').trim();
    if (!desc) return res.status(400).json({ error: 'Opis zgłoszenia jest wymagany.' });
    if (desc.length > 1000) return res.status(400).json({ error: 'Opis może mieć maksymalnie 1000 znaków.' });
    const existing = db.prepare(`SELECT 1 FROM comment_reports WHERE comment_id = ? AND reporter_user_id = ? AND status = 'pending'`).get(req.params.id, req.session.user.id);
    if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie tego komentarza.' });
    db.prepare('INSERT INTO comment_reports (comment_id, reporter_user_id, reason, description) VALUES (?, ?, ?, ?)')
      .run(req.params.id, req.session.user.id, reason, desc);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/comment-reports/pending-count', requireAdmin, (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM comment_reports WHERE status = 'pending'`).get();
  res.json({ count });
});

router.get('/api/admin/comment-reports', requireAdmin, (req, res) => {
  try {
    const { status } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND cr.status = ?'; params.push(status); }
    const reports = db.prepare(`
      SELECT cr.*, ru.username AS reporter_username, ru.display_name AS reporter_display_name,
      c.content AS comment_content, c.deleted AS comment_deleted, c.video_id,
      cu.username AS comment_author_username, cu.display_name AS comment_author_display_name,
      v.title AS video_title
      FROM comment_reports cr
      JOIN users ru ON cr.reporter_user_id = ru.id
      LEFT JOIN comments c ON cr.comment_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      LEFT JOIN videos v ON c.video_id = v.id
      WHERE ${where}
      ORDER BY cr.status = 'pending' DESC, cr.created_at DESC
    `).all(...params);
    res.json(reports);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/comment-reports/:id/resolve', requireAdmin, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM comment_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
    if (report.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
    const { action } = req.body;
    if (!['dismiss', 'delete_comment', 'hard_delete'].includes(action)) return res.status(400).json({ error: 'Nieprawidłowa akcja.' });
    if (action === 'hard_delete' && req.session.user.role !== 'dev') return res.status(403).json({ error: 'Tylko dev może usunąć komentarz trwale.' });

    if (action === 'delete_comment') {
      const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(report.comment_id);
      if (comment && !comment.deleted) {
        audit(req.session.user.id, 'delete', 'comment', report.comment_id, `[soft, ze zgłoszenia #${report.id}] treść: "${comment.content.slice(0, 80)}"`);
        db.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").run(report.comment_id);
      }
    } else if (action === 'hard_delete') {
      const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(report.comment_id);
      if (comment) {
        const replyCount = db.prepare('SELECT COUNT(*) AS c FROM comments WHERE parent_id = ?').get(report.comment_id)?.c || 0;
        audit(req.session.user.id, 'delete', 'comment', report.comment_id, `[hard, ze zgłoszenia #${report.id}] treść: "${(comment.content || '').slice(0, 80)}", +${replyCount} odpowiedzi`);
        db.prepare('DELETE FROM comments WHERE parent_id = ?').run(report.comment_id);
        db.prepare('DELETE FROM comments WHERE id = ?').run(report.comment_id);
      }
    }

    db.prepare(`UPDATE comment_reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`)
      .run(action === 'dismiss' ? 'dismissed' : 'resolved', req.session.user.id, report.id);
    audit(req.session.user.id, 'edit', 'comment_report', report.id, action);
    notifyUser(report.reporter_user_id, {
      type: 'report_resolved', title: 'Zgłoszenie rozpatrzone',
      body: action === 'dismiss' ? 'Twoje zgłoszenie zostało rozpatrzone — nie stwierdzono naruszenia.' : 'Twoje zgłoszenie zostało rozpatrzone — komentarz został usunięty.',
      url: '',
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dev: add comment as another user with custom date
router.post('/api/comments/admin', requireDev, (req, res) => {
  try {
    const { video_id, user_id, content, created_at, parent_id } = req.body;
    if (!video_id || !user_id || !content) return res.status(400).json({ error: 'video_id, user_id, content required' });
    const result = db.prepare('INSERT INTO comments (video_id, user_id, content, created_at, parent_id) VALUES (?, ?, ?, ?, ?)').run(video_id, user_id, content.trim(), created_at || new Date().toISOString(), parent_id || null);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    res.json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
