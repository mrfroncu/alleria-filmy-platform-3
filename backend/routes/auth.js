const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const db = require('../db');
const { audit, isSafeReturnTo, logLogin } = require('../lib/helpers');
const { authLimiter } = require('../lib/rateLimits');
const { createPendingMerge, getMergeStats, identityList, maxRole, tosNeedsAcceptance } = require('../lib/accounts');
const { getDiscordRoleSetting } = require('../lib/tsConfig');
const { getSetting } = require('../lib/settings');
const { stampSessionMeta } = require('../lib/sessions');
const { isAuthentikConfigured, authentikDisplayName, authentikEndpoints, createPkcePair, computeAuthentikRole } = require('../lib/authentik');

const router = express.Router();

// Shared by the Discord and Authentik redirect steps: remember where to go afterwards, whether
// this is the iframe popup flow, and whether we're linking onto the already-logged-in account
// (silently ignored if there's no session to link onto).
function stashOAuthIntent(req) {
  if (req.query.returnTo) {
    const r = String(req.query.returnTo);
    if (isSafeReturnTo(r)) req.session.returnTo = r;
  }
  // Reset leftovers from an earlier, abandoned round-trip on this same session.
  if (req.query.popup === 'true') req.session.popup = true;
  else delete req.session.popup;
  if (req.query.mode === 'link' && req.session.user) {
    req.session.linkPrimaryUserId = req.session.user.id;
  } else {
    delete req.session.linkPrimaryUserId;
  }
}

// Shared by the Discord and Authentik callbacks once the user row is settled: regenerate the
// session (prevents session fixation), store `sessionUser`, then either close the popup (iframe
// flow) or redirect to the saved returnTo.
function finishOAuthLogin(req, res, sessionUser, popupMessageType) {
  // Capture session values before regenerating
  const savedPopup = req.session.popup;
  const savedReturnTo = req.session.returnTo;

  req.session.regenerate((err) => {
    if (err) {
      console.error('[AUTH] Session regenerate error:', err);
      return res.redirect('/login?error=auth_failed');
    }
    req.session.user = sessionUser;
    stampSessionMeta(req);
    // CRITICAL: explicitly save session before redirect to prevent race condition
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[AUTH] Session save error:', saveErr);
        return res.redirect('/login?error=auth_failed');
      }
      const rawReturnTo = savedReturnTo || '/';
      // Validate returnTo before redirecting
      const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : '/';

      if (savedPopup) {
        // Serve a minimal page that notifies the opener and closes the popup.
        // Using inline HTML avoids React's auth guards (GuestRoute redirects
        // authenticated users away from /login, preventing the postMessage effect
        // from ever running).
        console.log('[AUTH] Session saved, closing popup and notifying opener');
        return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>try{if(window.opener){window.opener.postMessage({type:'${popupMessageType}'},window.location.origin);}window.close();}catch(e){window.close();}</script></body></html>`);
      }

      console.log(`[AUTH] Session saved, redirecting to ${returnTo}`);
      res.redirect(returnTo);
    });
  });
}

// ============ DISCORD AUTH ============
function discordRedirectHandler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_REDIRECT_URI) {
    console.error('Discord auth failed: DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI not set');
    return res.redirect('/login?error=config_missing');
  }
  // returnTo (validated against open redirect), iframe popup flow, and account-linking mode —
  // in link mode the callback attaches the Discord identity to the already-logged-in user
  // instead of logging in as a (possibly different) Discord-origin account.
  stashOAuthIntent(req);
  // CSRF protection for the OAuth round-trip: a random, single-use state tied to this
  // session is required back on the callback. Without it, an attacker who has obtained
  // their own valid Discord authorization code could drive a victim's browser through
  // /api/auth/discord?mode=link followed directly by /api/auth/discord/callback?code=...,
  // silently linking the attacker's Discord identity onto the victim's session/account.
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  req.session.save(() => {});
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read email',
    state
  });
  const url = `https://discord.com/api/oauth2/authorize?${params}`;
  console.log('Redirecting to Discord OAuth:', url.replace(process.env.DISCORD_CLIENT_ID, '***'));
  res.redirect(url);
}

// Register on BOTH paths so it works with or without /api/ prefix
router.get('/api/auth/discord', authLimiter, discordRedirectHandler);
router.get('/auth/discord', authLimiter, discordRedirectHandler);

async function discordCallbackHandler(req, res) {
  const { code, state } = req.query;
  console.log('[AUTH] Discord callback received, code:', code ? 'present' : 'MISSING');
  if (!code) return res.redirect('/login?error=no_code');

  // Verify the state this callback carries matches the one the redirect step stored on
  // this exact session, and consume it (single use) — see discordRedirectHandler.
  const expectedState = req.session.oauthState;
  delete req.session.oauthState;
  if (!expectedState || !state || state !== expectedState) {
    console.warn('[AUTH] OAuth state mismatch — rejecting callback');
    return res.redirect('/login?error=invalid_state');
  }

  const clientIp = req.ip || req.socket.remoteAddress;

  try {
    // Exchange code for token
    console.log('[AUTH] Exchanging code for token...');
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[AUTH] Token exchange failed:', JSON.stringify(tokenData));
      throw new Error('No access token: ' + (tokenData.error_description || tokenData.error || 'unknown'));
    }
    console.log('[AUTH] Token obtained successfully');

    // Get user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const discordUser = await userRes.json();
    console.log('[AUTH] Discord user:', discordUser.username, '(' + discordUser.id + ')');

    // Check guild membership and roles via bot
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordUser.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );

    if (!memberRes.ok) {
      const errBody = await memberRes.text();
      console.error('[AUTH] Guild member check failed:', memberRes.status, errBody);
      logLogin(null, discordUser.username, 'discord', clientIp, 0, 'Not a guild member');
      return res.redirect('/login?error=not_member');
    }

    const member = await memberRes.json();
    const roles = member.roles || [];
    console.log('[AUTH] User roles:', roles);

    // Check if user has required role — member/admin role IDs are optionally panel-managed
    // (DISCORD_ROLES_CONFIG_SOURCE); the dev role always comes straight from .env, no override.
    const memberRoleId = getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || '');
    const adminRoleId = getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || '');
    const hasMemberRole = roles.includes(memberRoleId);
    const hasAdminRole = roles.includes(adminRoleId);
    const hasDevRole = roles.includes(process.env.DISCORD_DEV_ROLE_ID);

    console.log('[AUTH] Role check - member:', hasMemberRole, 'admin:', hasAdminRole, 'dev:', hasDevRole);

    if (!hasMemberRole && !hasAdminRole && !hasDevRole) {
      console.warn('[AUTH] User has none of the required roles');
      logLogin(null, discordUser.username, 'discord', clientIp, 0, 'Missing required role');
      return res.redirect('/login?error=no_role');
    }

    let role = 'member';
    if (hasDevRole) role = 'dev';
    else if (hasAdminRole) role = 'admin';

    // Discord avatar hashes — global (account) and per-server (guild, Nitro-only)
    const discordAvatarHash = discordUser.avatar || null;
    const discordGuildAvatarHash = member.avatar || null;
    const discordEmail = discordUser.email || null;

    // Upsert user
    const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordUser.id);
    const rolesJson = JSON.stringify(roles);

    // Account-linking mode: attach this Discord identity to the already-logged-in primary
    // account instead of logging in as `existing` (or creating a new row). If `existing`
    // belongs to someone else, hand back a pending-merge token instead of linking directly.
    const linkPrimaryUserId = req.session.linkPrimaryUserId;
    if (linkPrimaryUserId) {
      delete req.session.linkPrimaryUserId;
      if (existing && existing.id !== linkPrimaryUserId) {
        const stats = getMergeStats(existing.id);
        const mergeId = createPendingMerge({
          primaryId: linkPrimaryUserId, secondaryId: existing.id,
          secondaryLabel: `Discord: ${discordUser.username}`, stats, identities: identityList(existing),
        });
        return req.session.save(() => res.redirect(`/profile?mergeId=${mergeId}`));
      }
      const primary = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(linkPrimaryUserId);
      if (!primary) return req.session.save(() => res.redirect('/profile?error=link_failed'));
      if (primary.discord_id && primary.discord_id !== discordUser.id) {
        return req.session.save(() => res.redirect('/profile?error=already_linked_discord'));
      }
      db.prepare(`UPDATE users SET discord_id = ?, discord_roles = ?, discord_avatar_hash = ?, discord_guild_avatar_hash = ?, discord_email = ? WHERE id = ?`)
        .run(discordUser.id, rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail, linkPrimaryUserId);
      if (req.session.user) req.session.user.discord_roles = roles;
      audit(linkPrimaryUserId, 'link_account', 'user', linkPrimaryUserId, `linked Discord (${discordUser.username})`);
      return req.session.save(() => res.redirect('/profile?linked=discord'));
    }

    const avatarSource = existing?.avatar_source || 'global';
    // A custom-uploaded avatar must survive future Discord logins — don't let this rebuild clobber it.
    const avatarUrl = avatarSource === 'custom'
      ? existing.avatar
      : (avatarSource === 'guild' && discordGuildAvatarHash)
      ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${discordGuildAvatarHash}.png`
      : (discordAvatarHash
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordAvatarHash}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`);

    let userId;
    if (existing) {
      // Never let this login downgrade a role earned via a different linked identity
      // (e.g. admin/dev via a linked TS3/TS6 account) — see maxRole's comment.
      const finalRole = maxRole(existing.role, role);
      db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar = ?, role = ?, discord_roles = ?, discord_avatar_hash = ?, discord_guild_avatar_hash = ?, discord_email = ?, last_login = datetime('now') WHERE discord_id = ?`)
        .run(discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, finalRole, rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail, discordUser.id);
      userId = existing.id;
    } else {
      const result = db.prepare('INSERT INTO users (discord_id, username, display_name, avatar, role, auth_method, discord_roles, discord_avatar_hash, discord_guild_avatar_hash, discord_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(discordUser.id, discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, 'discord', rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    logLogin(userId, discordUser.username, 'discord', clientIp, 1, null);
    console.log('[AUTH] ✅ Login successful:', user.display_name, '(role:', role, ')');
    console.log('[AUTH] Session ID:', req.sessionID);

    finishOAuthLogin(req, res, {
      id: user.id,
      discord_id: user.discord_id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      role: user.role,
      auth_method: 'discord',
      discord_roles: roles
    }, 'discord_auth_success');

  } catch (err) {
    console.error('[AUTH] Discord auth error:', err);
    logLogin(null, 'unknown', 'discord', clientIp, 0, err.message);
    res.redirect('/login?error=auth_failed');
  }
}

// Register callback on BOTH paths — works whether DISCORD_REDIRECT_URI has /api/ or not
router.get('/api/auth/discord/callback', discordCallbackHandler);
router.get('/auth/discord/callback', discordCallbackHandler);

// ============ AUTHENTIK (OIDC SSO) AUTH ============
// See lib/authentik.js for the flow and the env vars. Mirrors the Discord flow above: same
// returnTo/popup/link-mode handling, same single-use state, plus PKCE.
function authentikRedirectHandler(req, res) {
  if (!isAuthentikConfigured()) {
    console.error('Authentik auth failed: AUTHENTIK_URL / AUTHENTIK_CLIENT_ID / AUTHENTIK_CLIENT_SECRET / AUTHENTIK_REDIRECT_URI not set');
    return res.redirect('/login?error=config_missing');
  }
  stashOAuthIntent(req);
  const state = crypto.randomBytes(24).toString('hex');
  const { verifier, challenge } = createPkcePair();
  req.session.authentikState = state;
  req.session.authentikCodeVerifier = verifier;
  const params = new URLSearchParams({
    client_id: process.env.AUTHENTIK_CLIENT_ID,
    redirect_uri: process.env.AUTHENTIK_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  // Save before redirecting — the callback can't work without state/verifier in the store.
  req.session.save(() => res.redirect(`${authentikEndpoints().authorize}?${params}`));
}

router.get('/api/auth/authentik', authLimiter, authentikRedirectHandler);
router.get('/auth/authentik', authLimiter, authentikRedirectHandler);

async function authentikCallbackHandler(req, res) {
  const { code, state, error } = req.query;
  const clientIp = req.ip || req.socket.remoteAddress;
  const linking = !!req.session.linkPrimaryUserId;
  const fail = (reason) => {
    // A failed link attempt goes back to the profile page, not the login page.
    if (linking) {
      delete req.session.linkPrimaryUserId;
      return req.session.save(() => res.redirect('/profile?error=link_failed'));
    }
    res.redirect(`/login?error=${reason}`);
  };

  // State check first — and consume it, together with the PKCE verifier (single use).
  const expectedState = req.session.authentikState;
  const codeVerifier = req.session.authentikCodeVerifier;
  delete req.session.authentikState;
  delete req.session.authentikCodeVerifier;
  if (!expectedState || !state || state !== expectedState) {
    console.warn('[AUTH] Authentik OAuth state mismatch — rejecting callback');
    return fail('invalid_state');
  }
  // e.g. ?error=access_denied when the user cancels on the consent screen, or when an
  // Authentik policy bound to the application denies this user.
  if (error) {
    console.warn('[AUTH] Authentik returned error:', error);
    logLogin(null, 'unknown', 'authentik', clientIp, 0, `Authentik: ${error}`);
    return fail('authentik_denied');
  }
  if (!code) return fail('no_code');

  try {
    const { token: tokenUrl, userinfo: userinfoUrl } = authentikEndpoints();
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.AUTHENTIK_REDIRECT_URI,
        client_id: process.env.AUTHENTIK_CLIENT_ID,
        client_secret: process.env.AUTHENTIK_CLIENT_SECRET,
        code_verifier: codeVerifier || '',
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[AUTH] Authentik token exchange failed:', tokenRes.status, JSON.stringify(tokenData));
      throw new Error('No access token: ' + (tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`));
    }

    const userRes = await fetch(userinfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
    });
    if (!userRes.ok) throw new Error(`userinfo HTTP ${userRes.status}`);
    const info = await userRes.json();
    if (!info.sub) throw new Error('userinfo has no "sub" claim');

    const sub = String(info.sub);
    const akUsername = info.preferred_username || info.nickname || info.email || sub;
    const akDisplayName = info.name || akUsername;
    const akEmail = info.email || null;
    const groups = Array.isArray(info.groups) ? info.groups.map(String) : [];
    console.log('[AUTH] Authentik user:', akUsername, '(' + sub + '), groups:', groups);

    const role = computeAuthentikRole(groups);
    if (!role) {
      console.warn('[AUTH] Authentik user is in none of the required groups');
      logLogin(null, akUsername, 'authentik', clientIp, 0, 'Missing required Authentik group');
      return fail('authentik_no_group');
    }

    const existing = db.prepare('SELECT * FROM users WHERE authentik_sub = ?').get(sub);

    // Account-linking mode — same rules as Discord: attach to the logged-in account, or hand
    // back a pending-merge token if this Authentik identity already has its own account.
    const linkPrimaryUserId = req.session.linkPrimaryUserId;
    if (linkPrimaryUserId) {
      delete req.session.linkPrimaryUserId;
      const label = `${authentikDisplayName()}: ${akUsername}`;
      if (existing && existing.id !== linkPrimaryUserId) {
        const stats = getMergeStats(existing.id);
        const mergeId = createPendingMerge({
          primaryId: linkPrimaryUserId, secondaryId: existing.id,
          secondaryLabel: label, stats, identities: identityList(existing),
        });
        return req.session.save(() => res.redirect(`/profile?mergeId=${mergeId}`));
      }
      const primary = db.prepare('SELECT authentik_sub, role FROM users WHERE id = ?').get(linkPrimaryUserId);
      if (!primary) return req.session.save(() => res.redirect('/profile?error=link_failed'));
      if (primary.authentik_sub && primary.authentik_sub !== sub) {
        return req.session.save(() => res.redirect('/profile?error=already_linked_authentik'));
      }
      const finalRole = maxRole(primary.role, role);
      db.prepare('UPDATE users SET authentik_sub = ?, authentik_username = ?, role = ?, email = COALESCE(email, ?) WHERE id = ?')
        .run(sub, akUsername, finalRole, akEmail, linkPrimaryUserId);
      if (req.session.user) req.session.user.role = finalRole;
      audit(linkPrimaryUserId, 'link_account', 'user', linkPrimaryUserId, `linked Authentik (${akUsername})`);
      return req.session.save(() => res.redirect('/profile?linked=authentik'));
    }

    let userId;
    if (existing) {
      // Never downgrade a role earned via another linked identity — see maxRole's comment.
      // display_name is left alone (the user may have edited it, or it comes from Discord on a
      // linked account); username only tracks Authentik on Authentik-origin accounts.
      const finalRole = maxRole(existing.role, role);
      const username = existing.auth_method === 'authentik' ? akUsername : existing.username;
      db.prepare(`UPDATE users SET username = ?, authentik_username = ?, role = ?, last_login = datetime('now') WHERE id = ?`)
        .run(username, akUsername, finalRole, existing.id);
      userId = existing.id;
    } else {
      // Avatar only if the provider has a custom mapping emitting `picture` — Authentik's default
      // scopes don't, so new accounts usually start with the generated fallback avatar.
      const picture = typeof info.picture === 'string' && /^https:\/\//.test(info.picture) ? info.picture : null;
      const result = db.prepare(`INSERT INTO users (username, display_name, avatar, role, auth_method, authentik_sub, authentik_username, email)
        VALUES (?, ?, ?, ?, 'authentik', ?, ?, ?)`)
        .run(akUsername, akDisplayName, picture, role, sub, akUsername, akEmail);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    let discordRoles = [];
    try { discordRoles = JSON.parse(user.discord_roles || '[]'); } catch (e) {}

    logLogin(userId, akUsername, 'authentik', clientIp, 1, null);
    console.log('[AUTH] ✅ Authentik login successful:', user.display_name, '(role:', user.role, ')');

    finishOAuthLogin(req, res, {
      id: user.id,
      discord_id: user.discord_id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      role: user.role,
      auth_method: 'authentik',
      // Last-known Discord roles of a linked account, so category access by Discord role keeps
      // working when logging in through Authentik instead.
      discord_roles: Array.isArray(discordRoles) ? discordRoles : [],
    }, 'authentik_auth_success');
  } catch (err) {
    console.error('[AUTH] Authentik auth error:', err);
    logLogin(null, 'unknown', 'authentik', clientIp, 0, err.message);
    fail('auth_failed');
  }
}

router.get('/api/auth/authentik/callback', authentikCallbackHandler);
router.get('/auth/authentik/callback', authentikCallbackHandler);

// ============ AUTH STATUS & LOGOUT ============
router.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  // Live DB lookup (not baked into the session at login) — so an admin editing the Regulamin
  // immediately re-gates everyone on their next page load, no fresh login required.
  const row = db.prepare('SELECT tos_accepted_at FROM users WHERE id = ?').get(req.session.user.id);
  let impersonatedBy = null;
  if (req.session.impersonatorId) {
    impersonatedBy = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.session.impersonatorId) || null;
  }
  res.json({
    ...req.session.user,
    tosAccepted: !tosNeedsAcceptance(row?.tos_accepted_at),
    tosPreviouslyAccepted: !!row?.tos_accepted_at,
    // 'pending' (never touched the wizard) / 'skipped' (dismissed, not done) / 'completed'.
    setupStatus: getSetting('setup_status', 'pending'),
    impersonatedBy,
  });
});

router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
