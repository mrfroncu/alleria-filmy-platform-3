const crypto = require('crypto');

// ============ AUTHENTIK (OIDC SSO) ============
// Plain OAuth2 authorization-code flow against an Authentik OAuth2/OpenID provider, with PKCE
// (S256) and a confidential client secret. Identity comes from the userinfo endpoint, called with
// the access token we just got straight from the token endpoint over TLS — so there's no ID token
// signature to verify and no JWKS to fetch (OIDC Core 3.1.3.7 allows trusting TLS here).
//
// Authentik's authorize/token/userinfo endpoints are global — the same paths for every
// application — so AUTHENTIK_URL alone is enough; no application slug or discovery needed:
//   https://docs.goauthentik.io/add-secure-apps/providers/oauth2/
//
// Everything is env-only (like the Discord client id/secret): AUTHENTIK_URL, AUTHENTIK_CLIENT_ID,
// AUTHENTIK_CLIENT_SECRET, AUTHENTIK_REDIRECT_URI, and optionally the *_GROUPS role mappings and
// AUTHENTIK_DISPLAY_NAME.

const baseUrl = () => (process.env.AUTHENTIK_URL || '').trim().replace(/\/+$/, '');

function isAuthentikConfigured() {
  return !!(baseUrl() && process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET && process.env.AUTHENTIK_REDIRECT_URI);
}

function authentikDisplayName() {
  return (process.env.AUTHENTIK_DISPLAY_NAME || '').trim() || 'Authentik';
}

function authentikEndpoints() {
  const b = baseUrl();
  return {
    authorize: `${b}/application/o/authorize/`,
    token: `${b}/application/o/token/`,
    userinfo: `${b}/application/o/userinfo/`,
  };
}

// AUTHENTIK_TRUST_EMAIL=true: treat every e-mail Authentik sends as verified, despite its default
// mapping's hardcoded email_verified: false — only safe when users can't put arbitrary addresses
// on their Authentik accounts (e.g. they come from Discord, or only admins create them).
function authentikTrustsEmail() {
  return /^(1|true|yes)$/i.test(String(process.env.AUTHENTIK_TRUST_EMAIL || '').trim());
}

// PKCE pair — the verifier stays in the session, only its SHA-256 goes to Authentik.
function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// "a, b ,c" -> ['a', 'b', 'c']
const groupList = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

// Maps the `groups` claim (group NAMES, from Authentik's default "profile" scope mapping) to an
// app role, or null when the user may not log in at all. AUTHENTIK_MEMBER_GROUPS left empty means
// "anyone Authentik lets through" — access is then controlled entirely by the application's
// policy bindings in Authentik itself. Admin/dev groups always grant access on their own.
function computeAuthentikRole(groups) {
  const has = (names) => names.some(n => groups.includes(n));
  const memberGroups = groupList(process.env.AUTHENTIK_MEMBER_GROUPS);
  if (has(groupList(process.env.AUTHENTIK_DEV_GROUPS))) return 'dev';
  if (has(groupList(process.env.AUTHENTIK_ADMIN_GROUPS))) return 'admin';
  if (memberGroups.length === 0 || has(memberGroups)) return 'member';
  return null;
}

module.exports = { isAuthentikConfigured, authentikDisplayName, authentikEndpoints, authentikTrustsEmail, createPkcePair, computeAuthentikRole };
