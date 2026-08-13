const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

// userId → Set<WebSocket> — a user can have several tabs/devices connected at once.
const connections = new Map();

// DB reference — set via setupNotificationsWS(server, db)
let _db = null;

// Same one-time WS auth token pattern as watchParty.js (kept as its own map since the two
// channels are otherwise unrelated — a party token shouldn't double as a notifications token).
const wsTokens = new Map();

function createWsToken(user) {
  const token = uuidv4();
  wsTokens.set(token, { user, expires: Date.now() + 30000 });
  setTimeout(() => wsTokens.delete(token), 30000).unref();
  return token;
}

function consumeWsToken(token) {
  const entry = wsTokens.get(token);
  if (!entry || Date.now() > entry.expires) return null;
  wsTokens.delete(token);
  return entry.user;
}

function sendMsg(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

// Inserts the notification row and pushes it live to any connected sockets for that user.
// Never throws — same fire-and-forget philosophy as sendEmail/sendCategoryPushNotifications;
// a failed notification should never break the request that triggered it.
function notifyUser(userId, { type, title, body, url }) {
  if (!_db) return null;
  try {
    const result = _db.prepare('INSERT INTO notifications (user_id, type, title, body, url) VALUES (?, ?, ?, ?, ?)')
      .run(userId, type, title, body || '', url || '');
    const notification = _db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
    const sockets = connections.get(userId);
    if (sockets) {
      for (const ws of sockets) sendMsg(ws, { type: 'notification', notification });
    }
    return notification;
  } catch (e) {
    console.error('[NOTIFY] Error:', e.message);
    return null;
  }
}

// noServer: true — see the matching comment in watchParty.js's setupWatchPartyWS. server.js
// owns the single shared 'upgrade' listener and dispatches to this WSS by pathname; attaching
// via `{ server, path }` here directly would fight with watchParty's own WSS over the same event.
function setupNotificationsWS(db) {
  _db = db;
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    let userId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // The only message this channel ever expects from the client is the initial auth —
      // everything else flows server → client (new notifications pushed as they're created).
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
        if (!connections.has(userId)) connections.set(userId, new Set());
        connections.get(userId).add(ws);
        sendMsg(ws, { type: 'connected' });
      }
    });

    ws.on('close', () => {
      if (userId === null) return;
      const sockets = connections.get(userId);
      if (!sockets) return;
      sockets.delete(ws);
      if (sockets.size === 0) connections.delete(userId);
    });
  });

  return wss;
}

module.exports = { createWsToken, notifyUser, setupNotificationsWS };
