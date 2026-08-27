import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import User from '../models/User.js';
import { verifyAuthToken } from '../config/jwt.js';

/**
 * Authentication and authorisation guards.
 *
 * `requireAuth` establishes *who* the caller is; `requireRole` decides *what*
 * they may do. They compose in that order on a route:
 *
 *   router.get('/reports', requireAuth, requireRole('administrator'), handler);
 *
 * Never log the Authorization header or the token it carries.
 */

// Every rejection here is deliberately vague: an unauthenticated caller learns
// only that the request was not accepted.
const MISSING_TOKEN_MESSAGE = 'Authentication is required to access this resource';
const INVALID_TOKEN_MESSAGE = 'Authentication token is invalid';
const EXPIRED_TOKEN_MESSAGE = 'Authentication token has expired, please sign in again';
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action';

/**
 * Build an error for the centralised handler, which turns `status` / `errors`
 * into the failure envelope.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.errors = [];
  return error;
}

/**
 * Pull the credential out of an `Authorization: Bearer <token>` header.
 *
 * Returns null for anything else - no header, a different scheme, or a header
 * that is not exactly two whitespace-separated parts.
 */
function bearerTokenFrom(req) {
  const header = req.get('authorization');

  if (typeof header !== 'string') {
    return null;
  }

  const parts = header.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return null;
  }

  return parts[1];
}

/**
 * Reject requests that do not carry a usable access token, and attach the
 * caller's account to `req.user`.
 *
 * The token's `role` and `status` claims are not trusted on their own: the
 * account is reloaded from the database on every request, so an administrator
 * demoting or suspending someone takes effect immediately rather than when
 * their token happens to expire. `req.user` is a Mongoose document without the
 * password digest, which stays `select: false`.
 *
 * 401 - missing, malformed, expired, wrongly signed, or pointing at an account
 *       that no longer exists
 */
export async function requireAuth(req, res, next) {
  const token = bearerTokenFrom(req);

  if (!token) {
    return next(httpError(401, MISSING_TOKEN_MESSAGE));
  }

  let claims;

  try {
    claims = verifyAuthToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(httpError(401, EXPIRED_TOKEN_MESSAGE));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(httpError(401, INVALID_TOKEN_MESSAGE));
    }

    // Anything else - a missing JWT_SECRET, for instance - is a server fault
    // and must not be reported to the caller as a bad token.
    return next(error);
  }

  // The subject came from a signature we trust, but a malformed id would still
  // throw a CastError deep in Mongoose; treat it as an unusable token instead.
  if (!mongoose.isValidObjectId(claims.sub)) {
    return next(httpError(401, INVALID_TOKEN_MESSAGE));
  }

  const user = await User.findById(claims.sub);

  if (!user) {
    // The account was deleted after the token was issued.
    return next(httpError(401, INVALID_TOKEN_MESSAGE));
  }

  req.user = user;

  return next();
}

/**
 * Restrict a route to the listed roles. Must be mounted after `requireAuth`,
 * which is what puts `req.user` in place.
 *
 * Accepts roles as arguments or as a single array:
 *   requireRole('administrator')
 *   requireRole('moderator', 'administrator')
 *
 * 403 - authenticated, but the account's role is not permitted here
 */
export function requireRole(...roles) {
  const permitted = roles.flat();

  return function checkRole(req, res, next) {
    if (!req.user) {
      // A programming error: the route forgot requireAuth. Fail closed.
      return next(httpError(401, MISSING_TOKEN_MESSAGE));
    }

    if (!permitted.includes(req.user.role)) {
      return next(httpError(403, FORBIDDEN_MESSAGE));
    }

    return next();
  };
}
