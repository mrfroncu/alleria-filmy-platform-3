// Account bans from the panel (Zarządzanie → Użytkownicy). A banned account can't log in with any
// of its identities and loses its live sessions — unlike deleting, which a new login just undoes.
module.exports = {
  version: 9,
  name: 'user_bans',
  description: 'Blokada kont z panelu (users.banned_at / banned_by)',
  up(db) {
    db.exec(`
      ALTER TABLE users ADD COLUMN banned_at TEXT;
      ALTER TABLE users ADD COLUMN banned_by INTEGER;
    `);
  },
};
