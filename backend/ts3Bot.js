const net = require('net');
const { EventEmitter } = require('events');
const { ts3Escape, ts3Unescape, ts3ParseLine } = require('./ts3proto');

const RECONNECT_BACKOFFS_MS = [1000, 2000, 5000, 10000, 30000, 60000];
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 10000;
const CMD_TIMEOUT_MS = 8000;

// A single long-lived, authenticated TS3 ServerQuery TCP connection, kept open for the
// app's lifetime. Unlike server.js's connectTS3 (which opens a fresh socket per login
// attempt, never registers for notifications, and discards any inbound `notify*` line),
// this connection calls `servernotifyregister event=textprivate` once connected and
// emits a 'textmessage' event for every incoming private message — the mechanism the
// TS3 multi-candidate login flow uses to find out which of several people sharing an IP
// actually replied with the login code.
class Ts3Bot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.socket = null;
    this.buffer = '';
    this.ready = false;
    this.queue = []; // { resolve, reject, lines, timer }
    this.backoffIndex = 0;
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    this.stopped = true;
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.keepaliveTimer);
    this._rejectQueue(new Error('TS3 bot stopped'));
    if (this.socket) { try { this.socket.destroy(); } catch (_) {} }
    this.socket = null;
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  _rejectQueue(err) {
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      clearTimeout(entry.timer);
      entry.reject(err);
    }
  }

  _scheduleReconnect() {
    if (this.stopped) return;
    const delay = RECONNECT_BACKOFFS_MS[Math.min(this.backoffIndex, RECONNECT_BACKOFFS_MS.length - 1)];
    this.backoffIndex++;
    console.log(`[TS3Bot] Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  _connect() {
    const { host, port } = this.config;
    console.log(`[TS3Bot] Connecting to ${host}:${port}...`);
    this.ready = false;
    this.buffer = '';

    const socket = net.createConnection({ host, port: parseInt(port) });
    this.socket = socket;
    socket.setEncoding('utf8');

    let greeted = false;
    const connectTimer = setTimeout(() => {
      if (!greeted) {
        console.log('[TS3Bot] Connect/greeting timeout');
        socket.destroy();
      }
    }, CONNECT_TIMEOUT_MS);
    if (connectTimer.unref) connectTimer.unref();

    socket.on('data', (chunk) => {
      this.buffer += chunk;
      let nl;
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);

        if (!greeted) {
          if (line === 'TS3' || line.startsWith('TS3')) {
            greeted = true;
            clearTimeout(connectTimer);
            this._afterGreeting().catch((err) => {
              console.log(`[TS3Bot] Login sequence failed: ${err.message}`);
              try { socket.destroy(); } catch (_) {}
            });
          }
          continue;
        }

        if (line === '') continue;

        if (line.startsWith('notify')) {
          this._handleNotify(line);
          continue;
        }

        if (line.startsWith('error ')) {
          const entry = this.queue.shift();
          if (!entry) continue;
          clearTimeout(entry.timer);
          const idM = line.match(/id=(\d+)/);
          const msgM = line.match(/msg=(\S+)/);
          const id = parseInt(idM?.[1] ?? '1');
          if (id === 0) entry.resolve(entry.lines);
          else entry.reject(new Error(`TS3 error ${id}: ${ts3Unescape(msgM?.[1] ?? 'error')}`));
        } else if (this.queue[0]) {
          this.queue[0].lines.push(line);
        }
      }
    });

    socket.on('error', (err) => {
      console.log(`[TS3Bot] Socket error: ${err.message}`);
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      clearInterval(this.keepaliveTimer);
      this._rejectQueue(new Error('TS3 bot connection closed'));
      this.ready = false;
      this.socket = null;
      this._scheduleReconnect();
    });
  }

  async _afterGreeting() {
    const { username, password, serverId, nickname } = this.config;
    await this.send(`login ${ts3Escape(username)} ${ts3Escape(password)}`);
    await this.send(`use sid=${serverId}`);
    try {
      await this.send(`clientupdate client_nickname=${ts3Escape(nickname)}`);
    } catch (e) {
      console.log(`[TS3Bot] clientupdate nickname failed: ${e.message}`);
    }
    await this.send('servernotifyregister event=textprivate');

    this.ready = true;
    this.backoffIndex = 0;
    console.log('[TS3Bot] Connected, authenticated, and registered for textprivate events');

    this.keepaliveTimer = setInterval(() => {
      this.send('version').catch((e) => console.log(`[TS3Bot] keepalive failed: ${e.message}`));
    }, KEEPALIVE_INTERVAL_MS);
    if (this.keepaliveTimer.unref) this.keepaliveTimer.unref();

    this.emit('ready');
  }

  // notifytextmessage targetmode=1 msg=Hi\sthere target=1 invokerid=6 invokername=Foo invokeruid=abc==
  _handleNotify(line) {
    if (!line.startsWith('notifytextmessage')) return;
    const rest = line.slice('notifytextmessage'.length).trim();
    const [parsed] = ts3ParseLine(rest);
    if (!parsed || !parsed.invokerid) return;
    this.emit('textmessage', {
      invokerid: parseInt(parsed.invokerid, 10),
      invokeruid: parsed.invokeruid || '',
      invokername: parsed.invokername || '',
      msg: parsed.msg || '',
    });
  }

  send(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.socket) { reject(new Error('TS3 bot not connected')); return; }
      const entry = { resolve, reject, lines: [] };
      entry.timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`TS3 bot command timed out: ${cmd.split(' ')[0]}`));
      }, CMD_TIMEOUT_MS);
      this.queue.push(entry);
      console.log(`[TS3Bot] >>> ${cmd.startsWith('login') ? 'login ***' : cmd}`);
      this.socket.write(cmd + '\r\n');
    });
  }

  sendPrivateMessage(clid, text) {
    return this.send(`sendtextmessage targetmode=1 target=${clid} msg=${ts3Escape(text)}`);
  }
}

let singleton = null;
function initTs3Bot(config) {
  singleton = new Ts3Bot(config);
  singleton.start();
  return singleton;
}
function getTs3Bot() {
  return singleton;
}

module.exports = { Ts3Bot, initTs3Bot, getTs3Bot };
