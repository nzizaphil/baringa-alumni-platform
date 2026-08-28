import { param } from 'express-validator';
import mongoose from 'mongoose';

/**
 * Validation chain for the notification routes (`ADMIN-3`).
 *
 * As in the other validator modules, nothing here writes a response: the
 * controller reads the outcome with `validationResult(req)` and turns it into
 * the failure envelope.
 */

/**
 * `:id` on the mark-as-read route.
 *
 * Without this, a malformed id raises a Mongoose `CastError` deep inside the
 * update, which reaches the centralised handler carrying no `status` and is
 * reported as a 500 - a server fault, for what is the caller's malformed URL.
 * Exactly the guard `registrationIdValidator` puts on the review routes.
 */
export const notificationIdValidator = [
  param('id')
    .custom((value) => mongoose.isValidObjectId(value))
    .withMessage('Notification id must be a valid identifier'),
];
