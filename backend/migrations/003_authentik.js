// Authentik (OIDC SSO) as another linkable login identity, alongside discord_id/ts3_uid/ts6_uid.
// authentik_sub is the OIDC `sub` claim — stable per user (and per provider, depending on the
// provider's "Subject mode"), so it's the only thing an account is matched on. authentik_username
// is purely informational (shown on the profile's "Połączone konta" card).
module.exports = {
  version: 3,
  name: 'authentik',
  description: 'Logowanie SSO przez Authentik (users.authentik_sub, users.authentik_username)',
  up(db) {
    db.exec(`
      ALTER TABLE users ADD COLUMN authentik_sub TEXT;
      ALTER TABLE users ADD COLUMN authentik_username TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_authentik_sub ON users(authentik_sub) WHERE authentik_sub IS NOT NULL;
    `);
  },
};
