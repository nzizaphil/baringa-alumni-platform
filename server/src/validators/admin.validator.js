import { param, query } from 'express-validator';
import mongoose from 'mongoose';

/**
 * Validation chains for the administrator registration-review routes
 * (`ADMIN-1`, `ADMIN-2`).
 *
 * As in `auth.validator.js`, nothing here writes a response: the controller
 * reads the outcome with `validationResult(req)` and turns it into the failure
 * envelope.
 *
 * Unlike the auth chains these deliberately do **not** sanitise. Express 5
 * exposes `req.query` through a getter, so a sanitiser's write-back is not
 * something to depend on; `listPendingRegistrations` parses the two page
 * numbers itself once the rules below have established they are well formed.
 */

// One screenful of applicants. The dashboard (a later ticket) pages from here.
export const DEFAULT_PAGE_SIZE = 20;

// An upper bound so a hand-written `?limit=100000` cannot ask the database for
// the entire members collection in one request.
export const MAX_PAGE_SIZE = 100;

/**
 * `:id` on the approve and reject routes.
 *
 * Mongoose would otherwise raise a CastError deep inside `findOneAndUpdate`,
 * which reaches the centralised handler with no `status` and is reported as a
 * 500 - a malformed URL is the caller's mistake, not the server's.
 */
export const registrationIdValidator = [
  param('id')
    .custom((value) => mongoose.isValidObjectId(value))
    .withMessage('Registration id must be a valid identifier'),
];

/**
 * `?page=` and `?limit=` on the pending-registrations list.
 *
 * Both are optional and fall back to page 1 and `DEFAULT_PAGE_SIZE`; supplying
 * one that is not a usable number is an error rather than a silent reset, so a
 * client paging with a bad cursor hears about it instead of quietly being sent
 * back to the first page.
 */
export const pendingRegistrationsValidator = [
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Page must be a whole number of 1 or more'),

  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: MAX_PAGE_SIZE })
    .withMessage(`Limit must be a whole number between 1 and ${MAX_PAGE_SIZE}`),
];
