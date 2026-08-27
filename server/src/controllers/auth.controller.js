import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';

import User, { PASSWORD_SALT_ROUNDS } from '../models/User.js';
import { signAuthToken } from '../config/jwt.js';

// MongoDB's duplicate-key error code, raised by the unique index on `email`.
const DUPLICATE_KEY_ERROR = 11000;

/**
 * The single message returned for every failed login.
 *
 * Wrong password and unknown email must be indistinguishable, so this string
 * is used from exactly one place in `login` below and must never be
 * specialised.
 */
const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect';

/**
 * Build an error for the centralised handler in `middleware/error.middleware.js`,
 * which turns `status` / `errors` into the failure envelope.
 */
function httpError(status, message, errors = []) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors;
  return error;
}

/**
 * Reduce express-validator results to the `{ field, message }` pairs the
 * envelope promises.
 *
 * express-validator also carries the offending `value` on each result; it is
 * dropped here so a rejected password never travels back to the client.
 */
function toFieldErrors(result) {
  return result.array().map((error) => ({
    field: error.path ?? error.type,
    message: error.msg,
  }));
}

/**
 * POST /api/auth/register
 *
 * Creates a member account awaiting administrator approval.
 *
 * 201 - account created, returned without the password digest
 * 409 - the email address is already registered
 * 422 - the submitted details failed validation
 */
export async function register(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return next(httpError(422, 'Validation failed', toFieldErrors(result)));
  }

  const { name, email, password, association, studentNumber, graduationYear } = req.body;

  const existing = await User.findOne({ email }).select('_id').lean();

  if (existing) {
    return next(httpError(409, 'An account with this email address already exists'));
  }

  const user = new User({
    name,
    email,
    // The pre-save hook replaces this plaintext with its bcrypt digest.
    passwordHash: password,
    association,
    studentNumber,
    graduationYear,
    // Registration never confers privilege: an administrator promotes and
    // approves accounts in a later ticket.
    role: 'member',
    status: 'pending',
  });

  try {
    await user.save();
  } catch (error) {
    // Two requests can pass the lookup above concurrently; the unique index is
    // what actually settles it.
    if (error?.code === DUPLICATE_KEY_ERROR) {
      return next(httpError(409, 'An account with this email address already exists'));
    }

    return next(error);
  }

  return res.status(201).json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      association: user.association,
      status: user.status,
    },
  });
}

/**
 * The public projection of an account.
 *
 * Every endpoint that returns a user goes through this, so the password digest
 * has no route to a response even if a caller selected it back in.
 */
export function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

/**
 * Spend roughly the same time on an unknown email as on a wrong password.
 *
 * Without this, a login for an address that exists costs a bcrypt comparison
 * and one for an address that does not returns immediately - a timing signal
 * that answers the very question the generic 401 refuses to.
 *
 * The digest is built once, lazily, so importing this module stays cheap.
 */
let decoyPasswordHash;

async function equaliseFailureCost(candidate) {
  decoyPasswordHash ??= await bcrypt.hash(
    'no-account-matches-this-digest',
    PASSWORD_SALT_ROUNDS
  );

  await bcrypt.compare(typeof candidate === 'string' ? candidate : '', decoyPasswordHash);
}

/**
 * POST /api/auth/login
 *
 * Exchanges credentials for a JWT access token.
 *
 * 200 - authenticated; returns the token and the safe user object
 * 401 - the email is unknown or the password is wrong (indistinguishable)
 * 422 - the submitted details failed validation
 *
 * Status is deliberately not enforced here (AUTH-7). A pending or rejected
 * account is a genuine account that got its password right, so it signs in and
 * receives a token like any other; the `status` on the returned user is what
 * the client routes on, and `requireApproved` is what actually holds the
 * member-only routes shut. Refusing the sign-in instead would leave an
 * applicant with no way to see where their registration stands, and would make
 * "not approved yet" indistinguishable from "wrong password".
 */
export async function login(req, res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    return next(httpError(422, 'Validation failed', toFieldErrors(result)));
  }

  const { email, password } = req.body;

  // The validator lower-cased the email, matching how the schema stored it.
  // `passwordHash` is `select: false`, so it has to be asked for by name.
  const user = await User.findOne({ email }).select('+passwordHash');

  if (user) {
    const passwordMatches = await user.comparePassword(password);

    if (passwordMatches) {
      const token = signAuthToken(user);

      return res.status(200).json({
        success: true,
        data: {
          token,
          user: toSafeUser(user),
        },
      });
    }
  } else {
    await equaliseFailureCost(password);
  }

  // One exit for both failures. Keeping it to a single statement is what makes
  // the two responses byte-identical: the error handler echoes a stack trace
  // outside production, and a second `next(...)` site would record a different
  // line number in it and leak which branch was taken.
  return next(httpError(401, INVALID_CREDENTIALS_MESSAGE));
}

/**
 * GET /api/auth/me
 *
 * Returns the authenticated caller's own profile. `requireAuth` has already
 * loaded the account from the database, so this reflects any role or status
 * change made since the token was issued - which is what lets the client see
 * an approval land without the member signing in again.
 *
 * Open to every signed-in account, whatever its status: reading your own
 * profile is not a member-only action, and the pending screen depends on it.
 *
 * 200 - the safe user object
 * 401 - the token was missing, malformed, expired or no longer resolves
 */
export async function me(req, res) {
  return res.status(200).json({
    success: true,
    data: { user: toSafeUser(req.user) },
  });
}
