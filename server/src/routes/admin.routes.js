import { Router } from 'express';

import {
  listPendingRegistrations,
  approveRegistration,
  rejectRegistration,
} from '../controllers/admin.controller.js';
import {
  registrationIdValidator,
  pendingRegistrationsValidator,
} from '../validators/admin.validator.js';
import {
  requireAuth,
  requireApproved,
  requireRole,
} from '../middleware/auth.middleware.js';

const router = Router();

/**
 * Administrator registration review (`ADMIN-1`, `ADMIN-2`), mounted at
 * `/api/admin`.
 *
 * Every route here takes the same three guards in the same order:
 *
 *   requireAuth        401 - establishes who the caller is
 *   requireApproved    403 - the account may act at all
 *   requireRole(...)   403 - the account is an administrator
 *
 * `requireApproved` sits in the middle deliberately, as `docs/auth.md` §2
 * specifies for administrator-only routes. A pending administrator is a real
 * state - the account is privileged but has not itself been validated - and it
 * must be barred like any other pending account; leaving the guard out would
 * let one approve their own registration by approving everybody's.
 *
 * A member or moderator that gets past the first two guards is turned away by
 * the third with a 403 carrying no `code`, which is what distinguishes "you may
 * not do this" from the `ACCOUNT_PENDING` / `ACCOUNT_REJECTED` 403s above it.
 * A moderator is turned away like any member on purpose: moderator is a
 * privilege laid on a member account, not a step on the way to administrator,
 * and reviewing registrations is not among the things it grants.
 */
const administratorsOnly = [requireAuth, requireApproved, requireRole('administrator')];

/**
 * GET /api/admin/registrations/pending
 * The review queue, oldest first. Paged with `?page=` and `?limit=`.
 */
router.get(
  '/registrations/pending',
  administratorsOnly,
  pendingRegistrationsValidator,
  listPendingRegistrations
);

/**
 * PATCH /api/admin/registrations/:id/approve
 * Approves a pending registration. 409 if it has already been decided.
 */
router.patch(
  '/registrations/:id/approve',
  administratorsOnly,
  registrationIdValidator,
  approveRegistration
);

/**
 * PATCH /api/admin/registrations/:id/reject
 * Rejects a pending registration. 409 if it has already been decided.
 *
 * PATCH rather than POST or DELETE: both routes change one field on an existing
 * account rather than creating or removing anything.
 */
router.patch(
  '/registrations/:id/reject',
  administratorsOnly,
  registrationIdValidator,
  rejectRegistration
);

export default router;
