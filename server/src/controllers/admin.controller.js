import { validationResult } from 'express-validator';

import User from '../models/User.js';
import { toSafeUser } from './auth.controller.js';
import { DEFAULT_PAGE_SIZE } from '../validators/admin.validator.js';

/**
 * Administrator review of registrations (`ADMIN-1`, `ADMIN-2`).
 *
 * Registration produces a `pending` member and stops there; these three
 * handlers are the only way an account moves on from that state. Every route
 * carrying them is administrator-only (see `routes/admin.routes.js`).
 *
 * Notifying the applicant, the dashboard screen and moderator privilege
 * management are separate tickets and are deliberately not touched here.
 */

/**
 * Machine-readable identity for "this registration is not awaiting a decision".
 *
 * It reaches the client as `code` in the failure envelope, following the same
 * convention as `ACCOUNT_PENDING`: the client branches on the code, never on
 * the wording beside it. This one matters because two administrators can open
 * the same queue - the second one to press Approve needs to tell "somebody has
 * already handled this, refresh the list" apart from any other 409.
 */
export const REGISTRATION_NOT_PENDING_CODE = 'REGISTRATION_NOT_PENDING';

/**
 * Machine-readable identity for "you may not decide your own registration".
 *
 * Distinct from the plain 403 `requireRole` raises, because the caller *is* an
 * administrator and the route *is* open to them - it is this one account they
 * may not point it at.
 */
export const SELF_REVIEW_FORBIDDEN_CODE = 'SELF_REVIEW_FORBIDDEN';

/**
 * Build an error for the centralised handler in `middleware/error.middleware.js`,
 * which turns `status` / `errors` / `errorCode` into the failure envelope.
 */
function httpError(status, message, { errors = [], errorCode } = {}) {
  const error = new Error(message);
  error.status = status;
  error.errors = errors;

  if (errorCode) {
    error.errorCode = errorCode;
  }

  return error;
}

/**
 * Reduce express-validator results to the `{ field, message }` pairs the
 * envelope promises, dropping the offending `value` as `auth.controller.js`
 * does.
 */
function toFieldErrors(result) {
  return result.array().map((error) => ({
    field: error.path ?? error.type,
    message: error.msg,
  }));
}

/**
 * A malformed `:id`, `?page=` or `?limit=` is a 400 rather than the 422 the
 * registration and login forms answer with. 422 says "the form you submitted
 * was understood and its contents were wrong", which is what puts field-level
 * messages next to inputs; this is a request the server could not make sense of
 * in the first place, and there is no form behind it to annotate.
 */
function rejectIfInvalid(req) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return null;
  }

  return httpError(400, 'Invalid request', { errors: toFieldErrors(result) });
}

/**
 * The projection of a pending applicant shown in the review queue.
 *
 * Wider than `toSafeUser` on purpose: an administrator is deciding whether this
 * person is who they say they are, so they need the details the applicant
 * declared at registration. The password digest cannot appear here - the query
 * below never selects it, and `select: false` on the field keeps it out anyway.
 */
function toPendingRegistration(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    association: user.association,
    studentNumber: user.studentNumber ?? null,
    graduationYear: user.graduationYear ?? null,
    // The applicant has been waiting since this moment; the queue is ordered by
    // it, so it is the column the dashboard sorts and shows.
    registeredAt: user.createdAt,
  };
}

/**
 * The projection returned once a registration has been decided.
 *
 * Built from `toSafeUser` so the account contract stays single-sourced, plus
 * the two fields that record the decision - the acting administrator and when
 * they acted - which are the whole point of the response.
 */
function toReviewedRegistration(user) {
  return {
    ...toSafeUser(user),
    approvedBy: user.approvedBy ? String(user.approvedBy) : null,
    approvedAt: user.approvedAt ?? null,
  };
}

/**
 * GET /api/admin/registrations/pending
 *
 * The review queue: every account still awaiting a decision, oldest first, so
 * the applicant who has waited longest is at the top and nobody is left behind
 * a steady stream of newer registrations.
 *
 * Paged with `?page=` (default 1) and `?limit=` (default `DEFAULT_PAGE_SIZE`,
 * capped at `MAX_PAGE_SIZE`). `total` is the count of the whole queue, not of
 * the page, so the dashboard can show "12 of 340 awaiting review" without a
 * second request.
 *
 * 200 - the page of registrations and the pagination block
 * 400 - `page` or `limit` was supplied and is not a usable number
 * 401 - not signed in
 * 403 - signed in, but not an approved administrator
 */
export async function listPendingRegistrations(req, res, next) {
  const invalid = rejectIfInvalid(req);

  if (invalid) {
    return next(invalid);
  }

  // Safe to parse rather than coerce: the validator has already established
  // that anything present here is a whole number in range.
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE;

  const filter = { status: 'pending' };

  // The count is of the queue, not the page, so it cannot come from the same
  // query; both are independent reads and run together.
  const [users, total] = await Promise.all([
    User.find(filter)
      // Named fields rather than an exclusion, so a column added to the schema
      // later cannot start appearing in this response by accident.
      .select('name email association studentNumber graduationYear createdAt')
      // Oldest first: the longest wait is served first.
      .sort({ createdAt: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      registrations: users.map(toPendingRegistration),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    },
  });
}

/**
 * The rule that an administrator may not decide their own registration.
 *
 * The guards already make self-approval unreachable: `requireApproved` runs
 * before `requireRole`, so an administrator who is still `pending` never gets
 * as far as a controller, and one who is already `approved` has nothing left to
 * approve. Both of those are *consequences* of other rules, though, and the
 * first evaporates the moment somebody reorders the guard chain. This check
 * states the rule outright and enforces it inside the operation itself, so it
 * holds whatever happens to the middleware above it.
 *
 * It covers rejection as well as approval. The escalation risk is all on the
 * approve side, but "no administrator decides their own registration" is a rule
 * worth being able to state without an exception, and an administrator has no
 * business closing their own file either way.
 *
 * Ids are compared as ObjectIds rather than as strings: hex is case-insensitive
 * to MongoDB, so an upper-cased `:id` addresses the very same document while
 * comparing unequal to `req.user.id`. `ObjectId.equals` normalises both sides.
 */
function isSelfReview(req, id) {
  return req.user._id.equals(id);
}

/**
 * Record an administrator's decision on one registration.
 *
 * The status change is a single conditional update rather than a read, a check
 * and a write: `status: 'pending'` in the filter is what makes two
 * administrators pressing Approve on the same applicant safe. Exactly one
 * update matches; the other finds nothing and is told the registration has
 * already been decided, instead of both succeeding and the second silently
 * overwriting the first one's `approvedBy`.
 *
 * `approvedBy` / `approvedAt` are written for a rejection too - they record who
 * reviewed the account and when, whichever way the decision went.
 */
async function recordDecision(req, res, next, decision) {
  const invalid = rejectIfInvalid(req);

  if (invalid) {
    return next(invalid);
  }

  const { id } = req.params;

  // Before the database is touched at all: an administrator cannot be both the
  // applicant and the reviewer, whichever way the decision would have gone.
  if (isSelfReview(req, id)) {
    return next(
      httpError(403, 'You cannot decide your own registration', {
        errorCode: SELF_REVIEW_FORBIDDEN_CODE,
      })
    );
  }

  const reviewed = await User.findOneAndUpdate(
    { _id: id, status: 'pending' },
    {
      status: decision,
      approvedBy: req.user.id,
      approvedAt: new Date(),
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (reviewed) {
    return res.status(200).json({
      success: true,
      data: { user: toReviewedRegistration(reviewed) },
    });
  }

  // Nothing matched: either there is no such account, or it is no longer
  // pending. Only now is a second read worth making, to say which.
  const existing = await User.findById(id).select('status').lean();

  if (!existing) {
    return next(httpError(404, 'No registration was found with that id'));
  }

  return next(
    httpError(409, `This registration has already been ${existing.status}`, {
      errorCode: REGISTRATION_NOT_PENDING_CODE,
    })
  );
}

/**
 * PATCH /api/admin/registrations/:id/approve
 *
 * Approves a pending registration, letting the member act on the platform from
 * their very next request - `requireAuth` reloads the account each time, so no
 * new sign-in is needed.
 *
 * 200 - approved; returns the account with the approver and timestamp
 * 400 - `:id` is not a valid identifier
 * 401 - not signed in
 * 403 - signed in, but not an approved administrator
 * 403 `SELF_REVIEW_FORBIDDEN` - `:id` is the caller's own account
 * 404 - no account has that id
 * 409 `REGISTRATION_NOT_PENDING` - already approved or rejected
 */
export async function approveRegistration(req, res, next) {
  return recordDecision(req, res, next, 'approved');
}

/**
 * PATCH /api/admin/registrations/:id/reject
 *
 * Turns a pending registration down. Mirrors `approveRegistration` exactly,
 * including the 409: a rejection is a decision, so re-deciding an account that
 * has already been decided is refused rather than quietly repeated.
 *
 * 200 - rejected; returns the account with the reviewer and timestamp
 * 400 - `:id` is not a valid identifier
 * 401 - not signed in
 * 403 - signed in, but not an approved administrator
 * 403 `SELF_REVIEW_FORBIDDEN` - `:id` is the caller's own account
 * 404 - no account has that id
 * 409 `REGISTRATION_NOT_PENDING` - already approved or rejected
 */
export async function rejectRegistration(req, res, next) {
  return recordDecision(req, res, next, 'rejected');
}
