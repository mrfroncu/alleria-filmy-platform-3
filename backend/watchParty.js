const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// In-memory party store: code → Party
// Party: { id, code, hostId, queue, currentIndex, position, playing, positionUpdatedAt, members: Map<userId, {user, ws, canControl}> }
const parties = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code, tries = 0;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    tries++;
  } while (parties.has(code) && tries < 100);
  return code;
}

function getPartyState(party) {
  const now = Date.now();
  const position = party.playing
    ? party.position + (now - party.positionUpdatedAt) / 1000
    : party.position;
  return {
    id: party.id,
    code: party.code,
    hostId: party.hostId,
    queue: party.queue,
    currentIndex: party.currentIndex,
    position,
    playing: party.playing,
    members: Array.from(party.members.values()).map(m => ({
      id: m.user.id,
      display_name: m.user.display_name || m.user.username,
      avatar: m.user.avatar,
      canControl: m.canControl,
    })),
  };
}

function broadcast(party, message, excludeUserId = null) {
  const data = JSON.stringify(message);
  for (const [uid, m] of party.members) {
    if ((excludeUserId === null || uid !== excludeUserId) && m.ws && m.ws.readyState === 1) {
      m.ws.send(data);
    }
  }
}

function sendMsg(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

// One-time WS auth tokens: token → { user, expires }
const wsTokens = new Map();

function createWsToken(user) {
  const token = uuidv4();
  wsTokens.set(token, { user, expires: Date.now() + 30000 });
  setTimeout(() => wsTokens.delete(token), 30000);
  return token;
}

function consumeWsToken(token) {
  const entry = wsTokens.get(token);
  if (!entry || Date.now() > entry.expires) return null;
  wsTokens.delete(token);
  return entry.user;
}

function createParty(host) {
  const code = generateCode();
  const party = {
    id: uuidv4(),
    code,
    hostId: host.id,
    queue: [],
    currentIndex: -1,
    position: 0,
    playing: false,
    positionUpdatedAt: Date.now(),
    members: new Map(),
    createdAt: Date.now(),
  };
  parties.set(code, party);
  return party;
}

function getParty(code) {
  return parties.get(code) || null;
}

function deleteParty(code) {
  const party = parties.get(code);
  if (!party) return;
  broadcast(party, { type: 'party_deleted' });
  for (const m of party.members.values()) {
    try { m.ws.close(); } catch (_) {}
  }
  parties.delete(code);
}

// Cleanup empty parties older than 30min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [code, party] of parties) {
    if (party.members.size === 0 && party.createdAt < cutoff) {
      parties.delete(code);
    }
  }
}, 5 * 60 * 1000);

function setupWatchPartyWS(server) {
  const wss = new WebSocketServer({ server, path: '/ws/watch-party' });

  wss.on('connection', (ws) => {
    let userId = null;
    let partyCode = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // First message must be auth
      if (userId === null) {
        if (msg.type !== 'auth') {
          sendMsg(ws, { type: 'error', message: 'Expected auth' });
          ws.close();
          return;
        }
        const user = consumeWsToken(msg.token);
        if (!user) {
          sendMsg(ws, { type: 'error', message: 'Invalid or expired token' });
          ws.close();
          return;
        }
        userId = user.id;

        const code = (msg.code || '').toUpperCase();
        const party = parties.get(code);
        if (!party) {
          sendMsg(ws, { type: 'error', message: 'Party not found' });
          ws.close();
          return;
        }
        partyCode = code;
        const isHost = party.hostId === userId;

        // Close any existing connection from same user
        const existing = party.members.get(userId);
        const existingCanControl = existing?.canControl ?? false;
        if (existing) {
          try { existing.ws.close(); } catch (_) {}
        }

        party.members.set(userId, { user, ws, canControl: isHost || existingCanControl });

        sendMsg(ws, { type: 'state', party: getPartyState(party) });
        broadcast(party, {
          type: 'member_joined',
          member: { id: user.id, display_name: user.display_name || user.username, avatar: user.avatar, canControl: isHost || existingCanControl },
        }, userId);
        return;
      }

      const party = partyCode ? parties.get(partyCode) : null;
      if (!party) return;

      const member = party.members.get(userId);
      if (!member) return;
      const isHost = party.hostId === userId;
      const canControl = member.canControl;

      switch (msg.type) {
        case 'play':
          if (!canControl) return;
          party.playing = true;
          if (msg.position !== undefined) party.position = msg.position;
          party.positionUpdatedAt = Date.now();
          broadcast(party, { type: 'play', position: party.position }, userId);
          break;

        case 'pause':
          if (!canControl) return;
          party.playing = false;
          party.position = msg.position !== undefined
            ? msg.position
            : party.position + (Date.now() - party.positionUpdatedAt) / 1000;
          party.positionUpdatedAt = Date.now();
          broadcast(party, { type: 'pause', position: party.position }, userId);
          break;

        case 'seek':
          if (!canControl) return;
          party.position = msg.position;
          party.positionUpdatedAt = Date.now();
          broadcast(party, { type: 'seek', position: party.position, playing: party.playing }, userId);
          break;

        case 'source_change':
          if (!canControl) return;
          if (party.currentIndex >= 0 && party.queue[party.currentIndex]) {
            party.queue[party.currentIndex] = { ...party.queue[party.currentIndex], sourceKey: msg.sourceKey };
          }
          party.position = 0;
          party.positionUpdatedAt = Date.now();
          broadcast(party, { type: 'source_change', sourceKey: msg.sourceKey, position: 0 });
          break;

        case 'queue_add':
          if (!canControl) return;
          party.queue.push(msg.item);
          if (party.currentIndex === -1) {
            party.currentIndex = 0;
            party.position = 0;
            party.playing = false;
            party.positionUpdatedAt = Date.now();
          }
          broadcast(party, { type: 'queue_update', queue: party.queue, currentIndex: party.currentIndex });
          break;

        case 'queue_play':
          if (!isHost) return;
          party.currentIndex = msg.index;
          party.position = 0;
          party.playing = false;
          party.positionUpdatedAt = Date.now();
          broadcast(party, { type: 'state', party: getPartyState(party) });
          break;

        case 'queue_remove':
          if (!isHost) return;
          party.queue.splice(msg.index, 1);
          if (party.currentIndex >= party.queue.length) {
            party.currentIndex = Math.max(-1, party.queue.length - 1);
          }
          broadcast(party, { type: 'queue_update', queue: party.queue, currentIndex: party.currentIndex });
          break;

        case 'set_control': {
          if (!isHost) return;
          const targetId = Number(msg.userId);
          if (targetId === party.hostId) return;
          const target = party.members.get(targetId);
          if (!target) return;
          target.canControl = !!msg.canControl;
          broadcast(party, { type: 'control_changed', userId: targetId, canControl: !!msg.canControl });
          break;
        }

        case 'kick': {
          if (!isHost) return;
          const kickId = Number(msg.userId);
          if (kickId === party.hostId) return;
          const kicked = party.members.get(kickId);
          if (!kicked) return;
          sendMsg(kicked.ws, { type: 'kicked' });
          try { kicked.ws.close(); } catch (_) {}
          party.members.delete(kickId);
          broadcast(party, { type: 'member_left', userId: kickId });
          break;
        }

        case 'sync_request': {
          const pos = party.playing
            ? party.position + (Date.now() - party.positionUpdatedAt) / 1000
            : party.position;
          sendMsg(ws, { type: 'sync', position: pos, playing: party.playing, currentIndex: party.currentIndex });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!partyCode || userId === null) return;
      const party = parties.get(partyCode);
      if (!party) return;
      party.members.delete(userId);
      broadcast(party, { type: 'member_left', userId });

      if (party.hostId === userId) {
        if (party.members.size > 0) {
          const [newHostId, newHost] = party.members.entries().next().value;
          party.hostId = newHostId;
          newHost.canControl = true;
          broadcast(party, { type: 'host_changed', hostId: newHostId });
        }
        // Empty party stays in map until cleanup interval
      }
    });
  });

  return wss;
}

module.exports = { createParty, getParty, deleteParty, createWsToken, setupWatchPartyWS };
