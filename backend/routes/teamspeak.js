const express = require('express');
const crypto = require('crypto');
const net = require('net');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { ts3Escape, ts3ParseLine, ts3Unescape } = require('../ts3proto');
const { audit, logLogin } = require('../lib/helpers');
const { authLimiter } = require('../lib/rateLimits');
const { createPendingMerge, getMergeStats, identityList, maxRole } = require('../lib/accounts');
const { getSetting } = require('../lib/settings');
const { getTsBotNickname, getTsSetting } = require('../lib/tsConfig');
const { stampSessionMeta } = require('../lib/sessions');

const router = express.Router();

// ============ TEAMSPEAK LOGIN CHALLENGE ============
// After TS client(s) are matched by IP, the ServerQuery "bot" sends each candidate a
// distinct random 6-char code via private message. The user must type back whichever
// code they personally received to finish login. This is a second factor that closes
// the IP-based-auth weakness (shared NAT / spoofed X-Forwarded-For could otherwise
// impersonate another user) AND disambiguates which of several TS clients sharing one
// IP is the actual person logging in — the code the user types back identifies them.
const tsChallenges = new Map(); // challengeId -> { method, clientIp, cleanIp, attempts, expires, linkPrimaryUserId?, candidates: [{ tsNickname, tsUid, clid, tsDbId, role, code }] }
const TS_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TS_CHALLENGE_MAX_ATTEMPTS = 5;

function genChallengeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

// `data.candidates` must already be built (each with its own `code`) by the caller —
// codes are generated per-candidate before the message is sent, not here.
function createTsChallenge(data) {
  const id = uuidv4();
  tsChallenges.set(id, { ...data, attempts: 0, expires: Date.now() + TS_CHALLENGE_TTL_MS });
  const t = setTimeout(() => tsChallenges.delete(id), TS_CHALLENGE_TTL_MS);
  if (t.unref) t.unref();
  return { id };
}

// Matches the submitted code against ANY candidate on the challenge, then flattens that
// candidate's fields onto the returned object — callers (handleTsVerify) keep reading
// ch.tsNickname/ch.tsUid/ch.role exactly as before, unaware there was ever more than one.
function consumeTsChallenge(challengeId, code, clientIp) {
  const ch = tsChallenges.get(challengeId);
  if (!ch) return { error: 'Kod wygasł lub nie istnieje. Zaloguj się ponownie.' };
  if (Date.now() > ch.expires) { tsChallenges.delete(challengeId); return { error: 'Kod wygasł. Zaloguj się ponownie.' }; }
  if (ch.clientIp !== clientIp) return { error: 'Niezgodność adresu IP — zaloguj się ponownie.' };
  ch.attempts++;
  if (ch.attempts > TS_CHALLENGE_MAX_ATTEMPTS) { tsChallenges.delete(challengeId); return { error: 'Zbyt wiele prób. Zaloguj się ponownie.' }; }
  const normalized = String(code).trim().toUpperCase();
  const matched = ch.candidates.find(c => c.code === normalized);
  if (!matched) {
    return { error: 'Nieprawidłowy kod.', remaining: TS_CHALLENGE_MAX_ATTEMPTS - ch.attempts };
  }
  tsChallenges.delete(challengeId);
  const { candidates, ...rest } = ch;
  return { challenge: { ...rest, ...matched } };
}

// Build/refresh a TS user record and return the row. TS3 and TS6 are different servers
// with independent identities, so `method` selects which uid/ip column pair to use.
// Matches by uid ONLY — no IP fallback. By the time this runs, the caller already proved
// which specific TS identity is logging in via a per-candidate challenge code, so IP can't
// tell us anything uid doesn't (an IP-based fallback here is exactly the old bug where a
// shared IP let one TS identity silently overwrite another's account).
function upsertTsUser({ method, tsNickname, tsUid, cleanIp, role }) {
  const uidCol = method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
  const ipCol = method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
  const existing = db.prepare(`SELECT * FROM users WHERE ${uidCol} = ?`).get(tsUid);
  let userId;
  if (existing) {
    // Never let this login downgrade a role earned via a different linked identity
    // (e.g. admin/dev via a linked Discord account, or admin via the OTHER TS server) —
    // see maxRole's comment.
    const finalRole = maxRole(existing.role, role);
    db.prepare(`UPDATE users SET username=?, display_name=?, role=?, ${ipCol}=?, ${uidCol}=?, last_login=datetime('now') WHERE id=?`)
      .run(tsNickname, tsNickname, finalRole, cleanIp, tsUid, existing.id);
    userId = existing.id;
  } else {
    const result = db.prepare(`INSERT INTO users (username, display_name, role, auth_method, ${ipCol}, ${uidCol}) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(tsNickname, tsNickname, role, method, cleanIp, tsUid);
    userId = result.lastInsertRowid;
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function completeTsSession(req, res, user, method) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.user = {
      id: user.id, username: user.username, display_name: user.display_name,
      avatar: user.avatar, role: user.role, auth_method: method, discord_roles: []
    };
    stampSessionMeta(req);
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  });
}

const challengeMessage = (code) =>
  `🔐 Alleria Filmy — Twój kod logowania: [b]${code}[/b]\nWpisz go na stronie, aby dokończyć logowanie. Kod ważny 5 minut. Jeśli to nie Ty — zignoruj tę wiadomość.`;

// TS6 ServerQuery HTTP API — send the code to the matched client via private message
async function sendTs6Code(tsBaseUrl, tsServerId, headers, clid, code) {
  try {
    const r = await fetch(`${tsBaseUrl}/${tsServerId}/sendtextmessage?targetmode=1&target=${clid}&msg=${encodeURIComponent(challengeMessage(code))}`, { headers });
    if (r.ok) return true;
    console.log(`[TS6] sendtextmessage HTTP ${r.status}`);
  } catch (e) { console.log(`[TS6] sendtextmessage failed: ${e.message}`); }
  return false;
}

// Completes a TS link-mode challenge — attaches the matched TS identity to the
// ALREADY-logged-in primary account instead of upserting/logging in as a separate row.
// If that identity already belongs to a different account, hands back a pending-merge
// token instead of linking. `ch.method` selects TS3 vs TS6's independent uid/ip columns.
function handleTsLinkCompletion(req, res, ch) {
  const primaryId = ch.linkPrimaryUserId;
  const uidCol = ch.method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
  const ipCol = ch.method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
  const tsLabel = ch.method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak 6';
  const existing = db.prepare(`SELECT * FROM users WHERE ${uidCol} = ?`).get(ch.tsUid);
  if (existing && existing.id !== primaryId) {
    const stats = getMergeStats(existing.id);
    const mergeId = createPendingMerge({
      primaryId, secondaryId: existing.id, secondaryLabel: `${tsLabel}: ${ch.tsNickname}`,
      stats, identities: identityList(existing),
    });
    return res.json({ mergeNeeded: true, mergeId, secondaryLabel: `${tsLabel}: ${ch.tsNickname}`, stats });
  }
  const primary = db.prepare(`SELECT ${uidCol} FROM users WHERE id = ?`).get(primaryId);
  if (!primary) return res.status(404).json({ error: 'Konto nie istnieje.' });
  if (primary[uidCol] && primary[uidCol] !== ch.tsUid) {
    return res.status(400).json({ error: `To konto ma już połączony ${tsLabel}.` });
  }
  db.prepare(`UPDATE users SET ${uidCol} = ?, ${ipCol} = ? WHERE id = ?`).run(ch.tsUid, ch.cleanIp, primaryId);
  audit(primaryId, 'link_account', 'user', primaryId, `linked ${tsLabel} (${ch.tsNickname})`);
  req.session.save(() => res.json({ success: true, linked: ch.method }));
}

// Checks a TS3 client's server groups by database id (persists across sessions — the
// client doesn't need to be online right now) and returns 'admin'/'member', or null if
// they hold neither required group. Opens its own short-lived connection.
async function computeTs3Role(tsDbId) {
  const tsHost = getTsSetting('ts3_host', process.env.TS3_HOST || '');
  const tsPort = getTsSetting('ts3_port', process.env.TS3_PORT || '10011');
  const tsUsername = getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts3_password', process.env.TS3_PASSWORD || '');
  const tsServerId = getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1');
  let ts3 = null;
  try {
    ts3 = await connectTS3(tsHost, tsPort);
    await ts3.send(`login ${tsUsername} ${tsPassword}`);
    await ts3.send(`use sid=${tsServerId}`);
    const sgLines = await ts3.send(`servergroupsbyclientid cldbid=${tsDbId}`);
    const groups = sgLines.length > 0 ? ts3ParseLine(sgLines[0]).map(g => String(g.sgid)).filter(Boolean) : [];
    const memberGroupId = getTsSetting('ts3_member_group_id', process.env.TS3_MEMBER_GROUP_ID || '');
    const adminGroupId = getTsSetting('ts3_admin_group_id', process.env.TS3_ADMIN_GROUP_ID || '');
    const hasMemberGroup = memberGroupId ? groups.includes(String(memberGroupId)) : true;
    const hasAdminGroup = adminGroupId ? groups.includes(String(adminGroupId)) : false;
    if (!hasMemberGroup && !hasAdminGroup) return null;
    return hasAdminGroup ? 'admin' : 'member';
  } finally {
    if (ts3) { try { ts3.close(); } catch (_) {} }
  }
}

// Same as computeTs3Role but over the TS6 HTTP ServerQuery API.
async function computeTs6Role(tsDbId) {
  const tsHost = getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || '');
  const tsQueryPort = getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080');
  const tsUsername = getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || '');
  const tsApiKey = getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || '');
  const tsServerId = getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1');
  const tsBaseUrl = `http://${tsHost}:${tsQueryPort}`;
  const headers = { 'Content-Type': 'application/json' };
  if (tsUsername && tsPassword) headers['Authorization'] = 'Basic ' + Buffer.from(`${tsUsername}:${tsPassword}`).toString('base64');
  if (tsApiKey) headers['x-api-key'] = tsApiKey;

  let groups = [];
  try {
    const sgRes = await fetch(`${tsBaseUrl}/${tsServerId}/servergroupsbyclientid?cldbid=${tsDbId}`, { headers });
    if (sgRes.ok) {
      const sgData = await sgRes.json();
      const sgList = sgData.body || sgData || [];
      groups = (Array.isArray(sgList) ? sgList : [sgList]).map(g => String(g.sgid));
    }
  } catch (e) { console.log(`[TS6] Error getting groups: ${e.message}`); }

  const memberGroupId = getTsSetting('ts6_member_group_id', process.env.TS6_MEMBER_GROUP_ID || process.env.TS_MEMBER_GROUP_ID || '');
  const adminGroupId = getTsSetting('ts6_admin_group_id', process.env.TS6_ADMIN_GROUP_ID || process.env.TS_ADMIN_GROUP_ID || '');
  const hasMemberGroup = memberGroupId ? groups.includes(String(memberGroupId)) : true;
  const hasAdminGroup = adminGroupId ? groups.includes(String(adminGroupId)) : false;
  if (!hasMemberGroup && !hasAdminGroup) return null;
  return hasAdminGroup ? 'admin' : 'member';
}

// Verify handler shared by TS3/TS6 — checks the code, THEN checks the matched candidate's
// server group. Group membership is deliberately checked here (post-code) rather than
// before the code is sent: every candidate on a shared IP gets messaged regardless of
// their group, so someone without the required rank still gets a code and a clear "you
// don't have the required group" error once they try it — instead of being silently
// skipped while a sibling on the same IP gets the only message (which looked like the
// multi-candidate detection wasn't working at all).
function handleTsVerify(method) {
  return async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) return res.status(400).json({ error: 'Brak identyfikatora wyzwania lub kodu.' });
    const result = consumeTsChallenge(challengeId, code, clientIp);
    if (result.error) {
      const body = { error: result.error };
      if (result.remaining !== undefined) body.remaining = result.remaining;
      // 400, not 401 — this endpoint is also called from ProfilePage while linking, by an
      // already-authenticated user. A 401 there would trip the frontend's global
      // "unauthenticated → redirect to /login" handling for what's really just a wrong or
      // expired code, silently bouncing them off the profile page with no error shown.
      return res.status(400).json(body);
    }
    const ch = result.challenge;
    if (ch.method !== method) return res.status(400).json({ error: 'Niezgodny typ wyzwania.' });

    try {
      const role = method === 'teamspeak3' ? await computeTs3Role(ch.tsDbId) : await computeTs6Role(ch.tsDbId);
      if (!role) {
        logLogin(null, ch.tsNickname, method, clientIp, 0, 'Missing group (checked after code verified)');
        return res.status(403).json({ error: `Nie posiadasz wymaganej grupy na serwerze ${method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak'}.` });
      }
      if (ch.linkPrimaryUserId) return handleTsLinkCompletion(req, res, { ...ch, role });
      const user = upsertTsUser({ method, tsNickname: ch.tsNickname, tsUid: ch.tsUid, cleanIp: ch.cleanIp, role });
      logLogin(user.id, ch.tsNickname, method, clientIp, 1, 'challenge OK');
      console.log(`[${method === 'teamspeak3' ? 'TS3' : 'TS6'}] ✅ Login (challenge OK): "${ch.tsNickname}" (role: ${role})`);
      completeTsSession(req, res, user, method);
    } catch (err) {
      console.error(`[${method}] verify error:`, err);
      res.status(500).json({ error: 'Błąd logowania: ' + err.message });
    }
  };
}

router.post('/api/auth/teamspeak/verify', authLimiter, handleTsVerify('teamspeak'));
router.post('/api/auth/teamspeak3/verify', authLimiter, handleTsVerify('teamspeak3'));

// ============ TEAMSPEAK 6 AUTH ============
// Uses TS ServerQuery HTTP API (port 10080)
// Auth: Basic Auth (username:password) + optional x-api-key
// Endpoints: /{serverId}/clientlist, /{serverId}/clientinfo, /{serverId}/servergroupsbyclientid
router.post('/api/auth/teamspeak', authLimiter, async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const cleanIp = clientIp.replace('::ffff:', '');

  // Account-linking mode: attach the matched TS identity to the already-logged-in user
  // instead of logging in as a (possibly different) TS-origin account.
  const linkMode = req.body?.linkMode === true;
  if (linkMode && !req.session.user) {
    return res.status(401).json({ error: 'Musisz być zalogowany, aby połączyć konto.' });
  }

  const tsHost = getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || '');
  const tsQueryPort = getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080');
  const tsUsername = getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || '');
  const tsApiKey = getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || '');
  const tsServerId = getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1');

  if (!tsHost) {
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, 'TS6 not configured');
    return res.status(500).json({ error: 'TeamSpeak nie jest skonfigurowany.' });
  }

  try {
    const tsBaseUrl = `http://${tsHost}:${tsQueryPort}`;

    // Build auth headers — Basic Auth + optional API key
    const headers = { 'Content-Type': 'application/json' };
    if (tsUsername && tsPassword) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${tsUsername}:${tsPassword}`).toString('base64');
    }
    if (tsApiKey) {
      headers['x-api-key'] = tsApiKey;
    }

    console.log(`[TS6] Attempting auth for IP: ${cleanIp} via ${tsBaseUrl}/${tsServerId}`);

    // Rename the ServerQuery bot so messages arrive from TS_BOT_NICKNAME, not the query login
    try {
      const nickRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientupdate?client_nickname=${encodeURIComponent(getTsBotNickname())}`, { headers });
      if (!nickRes.ok) console.log(`[TS6] clientupdate nickname HTTP ${nickRes.status}`);
    } catch (e) { console.log(`[TS6] clientupdate nickname failed: ${e.message}`); }

    // Step 1: Get client list
    const clientListRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientlist`, { headers });
    if (!clientListRes.ok) {
      const errText = await clientListRes.text();
      throw new Error(`TS6 clientlist failed (${clientListRes.status}): ${errText.slice(0, 200)}`);
    }
    const clientListData = await clientListRes.json();
    const clients = clientListData.body || clientListData || [];

    console.log(`[TS6] Got ${clients.length} clients, looking for IP ${cleanIp}`);

    // Step 2: Find ALL clients connected from this IP — need clientinfo for each to get IP.
    // A shared IP (NAT, dorm/office network) can have more than one legitimate TS client;
    // we collect every match instead of stopping at the first, and disambiguate via a
    // distinct challenge code per candidate below.
    const ipMatches = [];
    for (const client of clients) {
      // Skip ServerQuery clients
      if (client.client_type === 1) continue;

      const clid = client.clid;
      try {
        const infoRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientinfo?clid=${clid}`, { headers });
        if (!infoRes.ok) continue;
        const infoData = await infoRes.json();
        const info = Array.isArray(infoData.body) ? infoData.body[0] : (infoData.body || infoData);

        const cIp = info.connection_client_ip || '';
        if (cIp === cleanIp || cIp === clientIp) {
          ipMatches.push({ ...client, ...info });
        }
      } catch (e) {
        console.log(`[TS6] Error getting info for clid ${clid}: ${e.message}`);
      }
    }

    if (ipMatches.length === 0) {
      logLogin(null, 'unknown', 'teamspeak', clientIp, 0, `No TS client with IP ${cleanIp}`);
      // 404, not 401 — see the comment on handleTsVerify's error response for why: this
      // endpoint doubles as the account-linking flow for an already-authenticated user.
      return res.status(404).json({ error: 'Nie znaleziono klienta TeamSpeak z Twoim IP. Upewnij się, że jesteś połączony z serwerem TS.' });
    }

    console.log(`[TS6] Found ${ipMatches.length} client(s) on IP ${cleanIp}`);

    // Step 3: Send EVERY IP match their own distinct code — group membership is
    // deliberately NOT checked here. It's checked after the code is verified (see
    // computeTs6Role/handleTsVerify), once we know exactly which specific person is
    // logging in. Filtering by group before sending would silently skip messaging anyone
    // without the required group, even though they're a real candidate on this IP — which
    // looked like multi-candidate detection wasn't working when it was really just an
    // unauthorized sibling never getting a message at all.
    const candidates = [];
    for (const m of ipMatches) {
      const code = genChallengeCode();
      const sent = await sendTs6Code(tsBaseUrl, tsServerId, headers, m.clid, code);
      if (sent) {
        candidates.push({
          clid: m.clid, tsNickname: m.client_nickname, tsUid: m.client_unique_identifier,
          tsDbId: m.client_database_id, code,
        });
      }
    }

    if (candidates.length === 0) {
      logLogin(null, ipMatches[0]?.client_nickname || 'unknown', 'teamspeak', clientIp, 0, 'Nie udało się wysłać kodu');
      return res.status(502).json({ error: 'Nie udało się wysłać kodu na TeamSpeak. Spróbuj ponownie.' });
    }

    const { id: challengeId } = createTsChallenge({
      method: 'teamspeak', clientIp, cleanIp, candidates,
      linkPrimaryUserId: linkMode ? req.session.user.id : undefined,
    });

    if (candidates.length === 1) {
      console.log(`[TS6] 🔐 Challenge sent to "${candidates[0].tsNickname}" (clid ${candidates[0].clid})`);
      res.json({ challenge: true, challengeId, method: 'teamspeak', nickname: candidates[0].tsNickname, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    } else {
      console.log(`[TS6] 🔐 Challenge sent to ${candidates.length} candidates on IP ${cleanIp}`);
      res.json({ challenge: true, challengeId, method: 'teamspeak', multipleCandidates: true, count: candidates.length, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    }

  } catch (err) {
    console.error('[TS6 AUTH] Error:', err);
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak auth failed: ' + err.message });
  }
});

// ============ TEAMSPEAK 3 AUTH ============
// Uses TS3 ServerQuery raw TCP protocol (default port 10011)


function connectTS3(host, port, connectTimeoutMs = 10000, cmdTimeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: parseInt(port) });
    socket.setEncoding('utf8');

    let buffer = '';
    let ready = false;
    let greetingLines = 0;
    const queue = []; // { resolve, reject, lines, timer }

    const destroy = (err) => {
      while (queue.length > 0) {
        const e = queue.shift();
        clearTimeout(e.timer);
        e.reject(err);
      }
      try { socket.destroy(); } catch (_) {}
    };

    // Connect / greeting timeout
    const connectTimer = setTimeout(() => {
      if (!ready) {
        socket.destroy();
        reject(new Error(`TS3 connect timeout to ${host}:${port}`));
      }
    }, connectTimeoutMs);

    socket.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim(); // trim both ends — strips \r and any leading whitespace
        buffer = buffer.slice(nl + 1);

        if (!ready) {
          console.log(`[TS3] greeting: "${line.slice(0, 80)}"`);
          // Resolve as soon as we see the TS3 identifier — don't count lines
          if (line === 'TS3' || line.startsWith('TS3')) {
            ready = true;
            clearTimeout(connectTimer);
            resolve(client);
          }
          continue;
        }

        if (line === '' || line.startsWith('notify')) continue;

        console.log(`[TS3] <<< "${line.slice(0, 120)}"`);

        if (line.startsWith('error ')) {
          const entry = queue.shift();
          if (!entry) { console.log(`[TS3] unexpected error line (no pending cmd): ${line}`); continue; }
          clearTimeout(entry.timer);
          const idM = line.match(/id=(\d+)/);
          const msgM = line.match(/msg=(\S+)/);
          const id = parseInt(idM?.[1] ?? '1');
          if (id === 0) {
            entry.resolve(entry.lines);
          } else {
            entry.reject(new Error(`TS3 error ${id}: ${ts3Unescape(msgM?.[1] ?? 'error')}`));
          }
        } else {
          if (queue[0]) queue[0].lines.push(line);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      console.log(`[TS3] socket error: ${err.message}`);
      if (!ready) { reject(err); return; }
      destroy(err);
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (queue.length > 0) destroy(new Error('TS3 socket closed while waiting for response'));
    });

    const client = {
      send(cmd) {
        return new Promise((res, rej) => {
          const entry = { resolve: res, reject: rej, lines: [] };
          entry.timer = setTimeout(() => {
            const idx = queue.indexOf(entry);
            if (idx !== -1) queue.splice(idx, 1);
            rej(new Error(`TS3 command timed out: ${cmd.split(' ')[0]}`));
            destroy(new Error('TS3 command timeout — closing socket'));
          }, cmdTimeoutMs);
          queue.push(entry);
          console.log(`[TS3] >>> ${cmd.startsWith('login') ? 'login ***' : cmd}`);
          socket.write(cmd + '\r\n');
        });
      },
      close() {
        try { socket.write('quit\r\n'); } catch (_) {}
        setTimeout(() => { try { socket.destroy(); } catch (_) {} }, 300);
      },
    };
  });
}

router.post('/api/auth/teamspeak3', authLimiter, async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const cleanIp = clientIp.replace('::ffff:', '');

  // Account-linking mode: attach the matched TS identity to the already-logged-in user
  // instead of logging in as a (possibly different) TS-origin account.
  const linkMode = req.body?.linkMode === true;
  if (linkMode && !req.session.user) {
    return res.status(401).json({ error: 'Musisz być zalogowany, aby połączyć konto.' });
  }

  const tsHost = getTsSetting('ts3_host', process.env.TS3_HOST || '');
  const tsPort = getTsSetting('ts3_port', process.env.TS3_PORT || '10011');
  const tsUsername = getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts3_password', process.env.TS3_PASSWORD || '');
  const tsServerId = getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1');

  if (!tsHost) {
    logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, 'TS3 not configured');
    return res.status(500).json({ error: 'TeamSpeak 3 nie jest skonfigurowany.' });
  }

  let ts3 = null;
  try {
    console.log(`[TS3] Attempting auth for IP: ${cleanIp} via ${tsHost}:${tsPort}`);

    ts3 = await connectTS3(tsHost, tsPort);
    await ts3.send(`login ${tsUsername} ${tsPassword}`);
    await ts3.send(`use sid=${tsServerId}`);

    // Rename the ServerQuery bot so messages/pokes arrive from TS_BOT_NICKNAME, not the query login
    try {
      await ts3.send(`clientupdate client_nickname=${ts3Escape(getTsBotNickname())}`);
    } catch (e) { console.log(`[TS3] clientupdate nickname failed: ${e.message}`); }

    const clLines = await ts3.send('clientlist');
    const clients = clLines.length > 0 ? ts3ParseLine(clLines[0]) : [];

    console.log(`[TS3] Got ${clients.length} clients, checking IP individually for each (like TS6) — looking for ${cleanIp}`);

    // Collect ALL clients connected from this IP — a shared IP (NAT, dorm/office network)
    // can have more than one legitimate TS3 client; disambiguate via a distinct challenge
    // code per candidate below, exactly like the TS6 flow above. (An earlier version of
    // this tried to have the user reply to a bot over TS3 chat instead, using a single
    // shared code and a persistent ServerQuery connection registered for textprivate
    // events — TS3 servers reject that unless the specific connection sending the code is
    // ALSO the one registered, which broke in practice with two connections in play. The
    // per-candidate-code approach below needs no persistent connection at all.)
    //
    // IP is checked via a per-client `clientinfo` call rather than trusting `clientlist`'s
    // bulk `-ip` field — that field can be stale/empty for a client whose connection info
    // the server hasn't refreshed yet, which silently dropped them from `matches` here and
    // made multi-candidate detection miss real candidates (looked "random" which of two
    // people on the same IP got messaged). `clientinfo` forces a fresh per-client read,
    // exactly like the TS6 HTTP-query path already does for the same reason.
    const matches = [];
    for (const c of clients) {
      if (c.client_type === '1') continue; // skip ServerQuery clients
      try {
        const ciLines = await ts3.send(`clientinfo clid=${c.clid}`);
        if (ciLines.length === 0) continue;
        const info = ts3ParseLine(ciLines[0])[0] || {};
        const cIp = info.connection_client_ip || '';
        if (cIp === cleanIp || cIp === clientIp) {
          matches.push({ ...c, ...info });
        }
      } catch (e) {
        console.log(`[TS3] Error getting clientinfo for clid ${c.clid}: ${e.message}`);
      }
    }

    if (matches.length === 0) {
      ts3.close(); ts3 = null;
      logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, `No TS3 client with IP ${cleanIp}`);
      // 404, not 401 — see the comment on handleTsVerify's error response for why: this
      // endpoint doubles as the account-linking flow for an already-authenticated user.
      return res.status(404).json({ error: 'Nie znaleziono klienta TeamSpeak 3 z Twoim IP. Upewnij się, że jesteś połączony z serwerem TS3.' });
    }

    console.log(`[TS3] Found ${matches.length} client(s) on IP ${cleanIp}`);

    // Send EVERY match their own distinct code over the still-open connection — group
    // membership is deliberately NOT checked here (see the equivalent comment in the TS6
    // route above). It's checked after the code is verified (computeTs3Role/handleTsVerify),
    // once we know exactly which specific person is logging in. Whichever code the user
    // types back on the site identifies exactly which of them that is; anyone the message
    // fails to reach is dropped, since they couldn't complete a code they never got.
    const delivery = getSetting('ts3_code_delivery', 'pm'); // 'pm' | 'poke' | 'both'
    const candidates = [];
    for (const m of matches) {
      const tsNickname = m.client_nickname;
      const code = genChallengeCode();
      let sent = false;
      if (delivery === 'pm' || delivery === 'both') {
        try {
          await ts3.send(`sendtextmessage targetmode=1 target=${m.clid} msg=${ts3Escape(challengeMessage(code))}`);
          sent = true;
        } catch (e) { console.log(`[TS3] sendtextmessage to "${tsNickname}" failed: ${e.message}`); }
      }
      if (delivery === 'poke' || delivery === 'both') {
        try {
          await ts3.send(`clientpoke clid=${m.clid} msg=${ts3Escape('Kod logowania: [b]' + code + '[/b]')}`);
          sent = true;
        } catch (e) { console.log(`[TS3] clientpoke to "${tsNickname}" failed: ${e.message}`); }
      }
      if (sent) {
        candidates.push({
          clid: m.clid, tsNickname, tsUid: m.client_unique_identifier,
          tsDbId: m.client_database_id, code,
        });
      }
    }
    ts3.close(); ts3 = null;

    if (candidates.length === 0) {
      logLogin(null, matches[0]?.client_nickname || 'unknown', 'teamspeak3', clientIp, 0, 'Nie udało się wysłać kodu');
      return res.status(502).json({ error: 'Nie udało się wysłać kodu na TeamSpeak 3. Spróbuj ponownie.' });
    }

    const { id: challengeId } = createTsChallenge({
      method: 'teamspeak3', clientIp, cleanIp, candidates,
      linkPrimaryUserId: linkMode ? req.session.user.id : undefined,
    });

    if (candidates.length === 1) {
      console.log(`[TS3] 🔐 Challenge sent to "${candidates[0].tsNickname}" (clid ${candidates[0].clid})`);
      res.json({ challenge: true, challengeId, method: 'teamspeak3', nickname: candidates[0].tsNickname, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    } else {
      console.log(`[TS3] 🔐 Challenge sent to ${candidates.length} candidates on IP ${cleanIp}`);
      res.json({ challenge: true, challengeId, method: 'teamspeak3', multipleCandidates: true, count: candidates.length, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    }

  } catch (err) {
    if (ts3) { try { ts3.close(); } catch (_) {} }
    console.error('[TS3 AUTH] Error:', err);
    logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak 3 auth failed: ' + err.message });
  }
});

module.exports = router;
