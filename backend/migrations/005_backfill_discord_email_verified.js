// discord_email_verified (004) is only learned on a Discord login, so every account that logged in
// with Discord before it existed has 0 — and couldn't be matched by e-mail (ACCOUNT_LINK_BY_EMAIL)
// until its owner happened to log in with Discord again. Those addresses were captured by the same
// Discord OAuth flow, so treat them as verified. Only rows not touched by any login since 004 ran:
// a Discord login after that has recorded the real flag, which must not be overwritten.
module.exports = {
  version: 5,
  name: 'backfill_discord_email_verified',
  description: 'E-maile Discord sprzed migracji 004 traktowane jako zweryfikowane (łączenie kont po e-mailu)',
  up(db) {
    db.prepare(`UPDATE users SET discord_email_verified = 1
      WHERE discord_email IS NOT NULL AND discord_email_verified = 0 AND discord_id IS NOT NULL
        AND last_login < (SELECT applied_at FROM schema_migrations WHERE version = 4)`).run();
  },
};
