const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { consumePendingMerge, getPendingMerge, identityList, mergeUsers } = require('../lib/accounts');
const { getLimit, getSetting } = require('../lib/settings');
const { listUserSessions, sessionStore } = require('../lib/sessions');
const { requireAuth } = require('../lib/auth');
const { upload } = require('../lib/uploads');

const router = express.Router();

// ============ PROFILE API ============
router.get('/api/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, avatar, role, bio, auth_method, avatar_source, discord_id, discord_email, ts3_uid, ts6_uid, discord_guild_avatar_hash, custom_avatar, email, email_notifications, created_at, last_login FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE author_id = ?').get(user.id).c;
  const viewCount = db.prepare('SELECT COUNT(*) AS c FROM watch_logs WHERE user_id = ?').get(user.id).c;
  const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
  const { discord_guild_avatar_hash, discord_id, discord_email, ts3_uid, ts6_uid, email_notifications, custom_avatar, ...userFields } = user;
  const isDevOrAdmin = user.role === 'admin' || user.role === 'dev';
  res.json({
    ...userFields,
    has_guild_avatar: !!discord_guild_avatar_hash,
    has_custom_avatar: !!custom_avatar,
    can_upload_avatar: isDevOrAdmin || getSetting('allow_custom_avatars', '0') === '1',
    has_discord: !!discord_id,
    has_teamspeak3: !!ts3_uid,
    has_teamspeak6: !!ts6_uid,
    discordEmail: discord_email || null,
    emailNotifications: !!email_notifications,
    videoCount, viewCount, favCount,
  });
});

router.put('/api/profile', requireAuth, (req, res) => {
  try {
    const { display_name, bio, avatar_source, email, email_notifications } = req.body;
    const maxName = getLimit('limit_display_name');
    const maxBio = getLimit('limit_bio');
    if (display_name !== undefined) {
      const dn = String(display_name).trim();
      if (dn.length > maxName) return res.status(400).json({ error: `Wyświetlana nazwa może mieć maksymalnie ${maxName} znaków.` });
      const safeDn = dn.slice(0, maxName);
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(safeDn, req.session.user.id);
      req.session.user.display_name = safeDn;
    }
    if (bio !== undefined) {
      const b = String(bio);
      if (b.length > maxBio) return res.status(400).json({ error: `Bio może mieć maksymalnie ${maxBio} znaków.` });
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(b.slice(0, maxBio), req.session.user.id);
    }
    if (email !== undefined) {
      const e = String(email).trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return res.status(400).json({ error: 'Nieprawidłowy adres e-mail.' });
      }
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(e || null, req.session.user.id);
    }
    if (email_notifications !== undefined) {
      db.prepare('UPDATE users SET email_notifications = ? WHERE id = ?').run(email_notifications ? 1 : 0, req.session.user.id);
    }
    if (avatar_source !== undefined) {
      if (!['global', 'guild', 'custom'].includes(avatar_source)) {
        return res.status(400).json({ error: 'Nieprawidłowa wartość avatar_source.' });
      }
      const u = db.prepare('SELECT discord_id, discord_avatar_hash, discord_guild_avatar_hash, custom_avatar FROM users WHERE id = ?').get(req.session.user.id);
      if (avatar_source === 'custom') {
        if (!u.custom_avatar) return res.status(400).json({ error: 'Prześlij najpierw własny avatar.' });
        db.prepare('UPDATE users SET avatar_source = ?, avatar = ? WHERE id = ?').run('custom', u.custom_avatar, req.session.user.id);
        req.session.user.avatar = u.custom_avatar;
      } else {
        if (!u.discord_id) {
          return res.status(400).json({ error: 'Źródło avatara dostępne tylko dla kont z połączonym Discordem.' });
        }
        if (avatar_source === 'guild' && !u.discord_guild_avatar_hash) {
          return res.status(400).json({ error: 'Brak avatara serwerowego — ta funkcja wymaga Discord Nitro oraz ustawionego avatara na tym serwerze.' });
        }
        const newAvatarUrl = avatar_source === 'guild'
          ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${u.discord_id}/avatars/${u.discord_guild_avatar_hash}.png`
          : (u.discord_avatar_hash
            ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar_hash}.png`
            : `https://cdn.discordapp.com/embed/avatars/0.png`);
        db.prepare('UPDATE users SET avatar_source = ?, avatar = ? WHERE id = ?').run(avatar_source, newAvatarUrl, req.session.user.id);
        req.session.user.avatar = newAvatarUrl;
      }
    }
    req.session.save(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Custom avatar upload — dev/admin can always use this; ordinary members only when the
// allow_custom_avatars setting is on (see ManagePage "Własne avatary" toggle).
router.post('/api/profile/avatar', requireAuth, upload.single('avatar_file'), (req, res) => {
  try {
    const role = req.session.user.role;
    const isDevOrAdmin = role === 'admin' || role === 'dev';
    const allowMembers = getSetting('allow_custom_avatars', '0') === '1';
    if (!isDevOrAdmin && !allowMembers) {
      return res.status(403).json({ error: 'Własne avatary są obecnie wyłączone dla zwykłych użytkowników.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
    const url = `/api/uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET custom_avatar = ?, avatar_source = ?, avatar = ? WHERE id = ?').run(url, 'custom', url, req.session.user.id);
    req.session.user.avatar = url;
    req.session.save(() => {});
    audit(req.session.user.id, 'edit', 'user', req.session.user.id, 'przesłano własny avatar');
    res.json({ success: true, avatar: url });
  } catch (err) { res.status(500).json({ error: 'Nie udało się przesłać avatara.' }); }
});

// ============ ACTIVE SESSIONS / DEVICES ============
router.get('/api/profile/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await listUserSessions(req.session.user.id);
    res.json(sessions.map(s => ({ ...s, isCurrent: s.sid === req.sessionID })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/profile/sessions/:sid', requireAuth, (req, res) => {
  if (!sessionStore || typeof sessionStore.get !== 'function') return res.status(500).json({ error: 'Magazyn sesji niedostępny.' });
  const { sid } = req.params;
  sessionStore.get(sid, (err, sess) => {
    if (err || !sess || sess.user?.id !== req.session.user.id) {
      return res.status(404).json({ error: 'Nie znaleziono sesji.' });
    }
    sessionStore.destroy(sid, (destroyErr) => {
      if (destroyErr) return res.status(500).json({ error: destroyErr.message });
      res.json({ success: true });
    });
  });
});

// Re-fetch avatar hashes (global + guild) from Discord via the bot — needed because they're
// otherwise only captured during the OAuth login flow, so accounts that logged in before this
// feature shipped (or whose guild avatar changed since) have stale/missing data until this runs.
router.post('/api/profile/refresh-discord', requireAuth, async (req, res) => {
  try {
    const u = db.prepare('SELECT discord_id, auth_method, avatar_source FROM users WHERE id = ?').get(req.session.user.id);
    if (!u || !u.discord_id) {
      return res.status(400).json({ error: 'Ta funkcja jest dostępna tylko dla kont z połączonym Discordem.' });
    }
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${u.discord_id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    if (!memberRes.ok) {
      return res.status(502).json({ error: 'Nie udało się pobrać danych z Discorda.' });
    }
    const member = await memberRes.json();
    const discordAvatarHash = member.user?.avatar || null;
    const discordGuildAvatarHash = member.avatar || null;
    const avatarSource = u.avatar_source || 'global';
    // A custom-uploaded avatar isn't Discord-derived — refresh the hashes (so switching back to
    // global/guild later has fresh data) but leave the displayed `avatar` column untouched.
    if (avatarSource === 'custom') {
      db.prepare('UPDATE users SET discord_avatar_hash = ?, discord_guild_avatar_hash = ? WHERE id = ?')
        .run(discordAvatarHash, discordGuildAvatarHash, req.session.user.id);
    } else {
      const avatarUrl = (avatarSource === 'guild' && discordGuildAvatarHash)
        ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${u.discord_id}/avatars/${discordGuildAvatarHash}.png`
        : (discordAvatarHash
          ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${discordAvatarHash}.png`
          : `https://cdn.discordapp.com/embed/avatars/0.png`);
      db.prepare('UPDATE users SET discord_avatar_hash = ?, discord_guild_avatar_hash = ?, avatar = ? WHERE id = ?')
        .run(discordAvatarHash, discordGuildAvatarHash, avatarUrl, req.session.user.id);
      req.session.user.avatar = avatarUrl;
    }
    req.session.save(() => {});
    res.json({ success: true, has_guild_avatar: !!discordGuildAvatarHash, avatar: req.session.user.avatar });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Account-linking merge confirmation — a pending merge is only usable by the session
// that initiated it (the OAuth/TS link flow always stamps primaryId with the requester's
// own session id at creation time).
router.get('/api/profile/merge/:mergeId', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.status(404).json({ error: 'Prośba o połączenie kont wygasła lub nie istnieje.' });
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  res.json({ secondaryLabel: pending.secondaryLabel, stats: pending.stats, identities: pending.identities });
});

router.post('/api/profile/merge/:mergeId/confirm', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.status(404).json({ error: 'Prośba o połączenie kont wygasła lub nie istnieje.' });
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  try {
    consumePendingMerge(req.params.mergeId);
    const merged = mergeUsers(pending.primaryId, pending.secondaryId, { performedBy: req.session.user.id });
    req.session.user.discord_id = merged.discord_id;
    req.session.user.avatar = merged.avatar;
    req.session.save(() => res.json({ success: true }));
  } catch (err) {
    res.status(500).json({ error: 'Nie udało się połączyć kont: ' + err.message });
  }
});

router.delete('/api/profile/merge/:mergeId', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.json({ success: true }); // already gone — nothing to cancel
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  consumePendingMerge(req.params.mergeId);
  res.json({ success: true });
});

// Unlink a single identity (Discord/TS3/TS6) from the current account. Unlike merge, this
// never touches another row — it's just a column-clear on this same user row, so id, role,
// comments, authored videos etc. all stay put. The freed identity (discord_id/ts3_uid/ts6_uid)
// goes back to NULL, so the next login with it won't match this row anymore — it'll either
// create a brand-new account or be linked fresh into a different one, exactly like an
// identity that was never connected here in the first place.
router.post('/api/profile/unlink', requireAuth, (req, res) => {
  const { method } = req.body; // 'discord' | 'teamspeak3' | 'teamspeak' (TS6 — see identityList)
  if (!['discord', 'teamspeak3', 'teamspeak'].includes(method)) {
    return res.status(400).json({ error: 'Nieprawidłowa metoda.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const identities = identityList(user);
  if (!identities.includes(method)) {
    return res.status(400).json({ error: 'To konto nie ma połączonej tej metody logowania.' });
  }
  if (identities.length <= 1) {
    return res.status(400).json({ error: 'Nie można rozłączyć jedynej metody logowania — dodaj najpierw inną.' });
  }

  try {
    if (method === 'discord') {
      // Avatar comes from Discord or a custom upload in this codebase (TS-only accounts with no
      // custom upload have avatar = NULL and the frontend falls back to a generated one) — clear
      // it along with the identity, unless it's a custom upload, which is independent of Discord
      // and shouldn't be lost just because the Discord identity was unlinked.
      const wasCustom = user.avatar_source === 'custom';
      db.prepare(`UPDATE users SET discord_id = NULL, discord_roles = '[]', discord_avatar_hash = NULL,
                  discord_guild_avatar_hash = NULL, discord_email = NULL${wasCustom ? '' : `, avatar_source = 'global', avatar = NULL`} WHERE id = ?`).run(user.id);
      req.session.user.discord_id = null;
      if (!wasCustom) req.session.user.avatar = null;
    } else {
      const uidCol = method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
      const ipCol = method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
      db.prepare(`UPDATE users SET ${uidCol} = NULL, ${ipCol} = NULL WHERE id = ?`).run(user.id);
    }
    audit(req.session.user.id, 'unlink_account', 'user', user.id, method);
    req.session.save(() => res.json({ success: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
