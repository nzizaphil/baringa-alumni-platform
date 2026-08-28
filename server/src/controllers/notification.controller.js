import { validationResult } from 'express-validator';

import Notification from '../models/Notification.js';

/**
 * A member's own notifications (`ADMIN-3`).
 *
 * Both handlers are scoped to `req.user` and neither takes a recipient from the
 * request. `recipientId: req.user.id` is part of the *filter* on every query
 * here rather than a check made after reading the document, so there is no
 * moment at which this code holds somebody else's notification in hand and has
 * to remember to refuse it. A caller who supplies a valid id belonging to
 * another account matches nothing and is answered exactly as they would be for
 * an id that does not exist at all.
 */

/**
 * Machine-readable identity for "there is no such notification of yours".
 *
 * The client branches on it to tell a stale list - another tab has already
 * dealt with this row - apart from a request that genuinely failed, so the page
 * can refresh rather than report an error. Follows the same convention as
 * `ACCOUNT_PENDING`: match on the code, never on the wording beside it.
 */
export const NOTIFICATION_NOT_FOUND_CODE = 'NOTIFICATION_NOT_FOUND';

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
 * envelope promises, dropping the offending `value` as the other controllers
 * do.
 */
function toFieldErrors(result) {
  return result.array().map((error) => ({
    field: error.path ?? error.type,
    message: error.msg,
  }));
}

/**
 * A malformed `:id` is a 400 rather than the 422 the registration and login
 * forms answer with: there is no form behind this request to annotate, and the
 * server could not make sense of the address in the first place. Same reasoning
 * as `admin.controller.js`.
 */
function rejectIfInvalid(req) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return null;
  }

  return httpError(400, 'Invalid request', { errors: toFieldErrors(result) });
}

/**
 * The public projection of a notification.
 *
 * `recipientId` is deliberately not in it. It is always the caller's own id -
 * the query filtered on it - so returning it would tell the client only what it
 * already knows, while putting an account id into a payload that has no use
 * for one.
 */
function toSafeNotification(notification) {
  return {
    id: String(notification._id),
    type: notification.type,
    message: notification.message,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

/**
 * GET /api/notifications
 *
 * The caller's own notifications, newest first, with the unread count beside
 * them so the header's indicator does not need a second request.
 *
 * `requireAuth` alone, deliberately not `requireApproved`: reading your own
 * notifications is not a member-only action, and the approval notification is
 * written at the moment the account stops being pending - a guard here would
 * make the one notification this release sends unreachable by the account it
 * was sent to if that account were ever read back before its status was.
 *
 * 200 - the notifications and the unread count
 * 401 - not signed in
 */
export async function listNotifications(req, res) {
  const notifications = await Notification.find({ recipientId: req.user.id })
    // Newest first: the thing that just happened is the thing being looked for.
    // `createdAt` descending is the index's own order (see the model).
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    data: {
      notifications: notifications.map(toSafeNotification),
      // Counted from the page already in hand rather than with a second query:
      // the list is not paged, so it is the whole set by definition.
      unreadCount: notifications.filter((notification) => !notification.readAt).length,
    },
  });
}

/**
 * PATCH /api/notifications/:id/read
 *
 * Marks one of the caller's own notifications as read.
 *
 * Idempotent: reading something twice is not an error, so a notification that
 * is already read answers 200 with its original `readAt` rather than a
 * conflict. That matters because the feed marks the approval notification read
 * as it displays it, and two tabs open on the feed would otherwise turn a
 * harmless race into an error on screen.
 *
 * A notification belonging to somebody else answers **404, not 403**. A 403
 * would confirm that the id names a real record and so let a caller enumerate
 * other accounts' notifications by watching which ids change the answer; a 404
 * says only "you have no such notification", which is true either way.
 *
 * 200 - marked read, or already read
 * 400 - `:id` is not a valid identifier
 * 401 - not signed in
 * 404 `NOTIFICATION_NOT_FOUND` - no notification of the caller's has that id
 */
export async function markNotificationRead(req, res, next) {
  const invalid = rejectIfInvalid(req);

  if (invalid) {
    return next(invalid);
  }

  const { id } = req.params;

  /*
   * One conditional write rather than a read, a check and a write. `readAt:
   * null` in the filter is what makes a second call safe: it matches only an
   * unread notification, so two requests arriving together cannot both stamp it
   * and the first timestamp - the one that is actually true - survives.
   */
  const marked = await Notification.findOneAndUpdate(
    { _id: id, recipientId: req.user.id, readAt: null },
    { readAt: new Date() },
    { returnDocument: 'after' }
  );

  if (marked) {
    return res.status(200).json({
      success: true,
      data: { notification: toSafeNotification(marked) },
    });
  }

  // Nothing matched: either it was already read, or there is no such
  // notification *of this caller's*. Only now is a second read worth making,
  // and it carries the same recipient scope as the write did.
  const existing = await Notification.findOne({
    _id: id,
    recipientId: req.user.id,
  }).lean();

  if (!existing) {
    return next(
      httpError(404, 'No notification was found with that id', {
        errorCode: NOTIFICATION_NOT_FOUND_CODE,
      })
    );
  }

  return res.status(200).json({
    success: true,
    data: { notification: toSafeNotification(existing) },
  });
}
