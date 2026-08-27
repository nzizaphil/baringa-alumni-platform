import jwt from 'jsonwebtoken';

/**
 * Signing and verification for the access tokens issued at login.
 *
 * The secret lives in one place so the login controller and the auth
 * middleware can never drift apart, and so a missing secret fails loudly
 * instead of silently signing tokens nobody can verify.
 *
 * Never log a signed token or the secret itself.
 */

// Used only when JWT_EXPIRES_IN is absent; deployments set it explicitly.
const DEFAULT_EXPIRES_IN = '1d';

/**
 * Read the signing secret at call time rather than at import time, so tests
 * and scripts can load their environment before the first token is signed.
 */
function signingSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    // Surfaces as a 500 through the centralised error handler: a
    // misconfigured server must not pretend the credentials were wrong.
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

/**
 * Sign an access token for `user`.
 *
 * The claims carry `role` and `status` so a caller can read them without a
 * round trip, but they are a snapshot from issue time: `requireAuth` reloads
 * the account on every request and treats the database as authoritative.
 */
export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      status: user.status,
    },
    signingSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN }
  );
}

/**
 * Verify a token and return its claims.
 *
 * Throws `jwt.TokenExpiredError` for an expired token and
 * `jwt.JsonWebTokenError` for a malformed or wrongly signed one; callers
 * translate both into 401.
 */
export function verifyAuthToken(token) {
  return jwt.verify(token, signingSecret());
}
