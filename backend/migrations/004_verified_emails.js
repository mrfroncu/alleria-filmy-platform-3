// Provider-verified e-mails, kept apart from users.email (which the user can freely edit in their
// profile, so it can never prove anything). Used to match the same person across login methods
// (ACCOUNT_LINK_BY_EMAIL): discord_email_verified is Discord's own `verified` flag for
// discord_email, authentik_email is the address Authentik vouched for (email_verified claim).
module.exports = {
  version: 4,
  name: 'verified_emails',
  description: 'Zweryfikowane e-maile z Discorda/Authentika do łączenia kont (discord_email_verified, authentik_email)',
  up(db) {
    db.exec(`
      ALTER TABLE users ADD COLUMN discord_email_verified INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN authentik_email TEXT;
    `);
  },
};
