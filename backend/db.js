// The one shared better-sqlite3 connection. Opened on first require — server.js (and the test
// suite, via server.js) set DB_PATH/NODE_ENV before anything pulls this in.
const { initDB } = require('./database');

module.exports = initDB();
