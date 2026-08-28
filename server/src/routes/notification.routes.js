import { Router } from 'express';

import {
  listNotifications,
  markNotificationRead,
} from '../controllers/notification.controller.js';
import { notificationIdValidator } from '../validators/notification.validator.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * A member's own notifications (`ADMIN-3`), mounted at `/api/notifications`.
 *
 * `requireAuth` alone, without `requireApproved`. These routes are not
 * member-only in the sense that guard exists for: they expose nothing but the
 * caller's own records, and the account itself is the only subject. That is the
 * same reason `GET /api/auth/me` takes one guard - see `docs/auth.md` §2.
 *
 * There is no authorisation check beyond the guard because there is nothing for
 * one to decide: both handlers filter on `recipientId: req.user.id`, so the
 * only rows either can reach are the caller's own.
 */

/**
 * GET /api/notifications
 * The caller's notifications, newest first, with the unread count.
 */
router.get('/', requireAuth, listNotifications);

/**
 * PATCH /api/notifications/:id/read
 * Marks one of the caller's notifications as read. Idempotent; 404 for an id
 * that is not theirs, so the route never confirms another account's records.
 */
router.patch('/:id/read', requireAuth, notificationIdValidator, markNotificationRead);

export default router;
