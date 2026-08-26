import { validationResult } from 'express-validator';

import User from '../models/User.js';

// MongoDB's duplicate-key error code, raised by the unique index on `email`.
const DUPLICATE_KEY_ERROR = 11000;

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
