// TS3 ServerQuery wire protocol helpers used by server.js's connectTS3 (the per-request
// query client used for both login and challenge-code delivery).

function ts3Unescape(str) {
  return String(str)
    .replace(/\\\\/g, '\x00')
    .replace(/\\s/g, ' ')
    .replace(/\\p/g, '|')
    .replace(/\\n/g, '\n')
    .replace(/\\f/g, '\f')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\v/g, '\v')
    .replace(/\x00/g, '\\');
}

// Escape a value for sending over the TS3 ServerQuery protocol
function ts3Escape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\//g, '\\/')
    .replace(/\|/g, '\\p')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\x0B/g, '\\v')
    .replace(/ /g, '\\s');
}

function ts3ParseLine(line) {
  return line.split('|').map(record => {
    const obj = {};
    record.trim().split(' ').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) { obj[pair] = ''; return; }
      obj[pair.slice(0, eq)] = ts3Unescape(pair.slice(eq + 1));
    });
    return obj;
  });
}

module.exports = { ts3Escape, ts3Unescape, ts3ParseLine };
