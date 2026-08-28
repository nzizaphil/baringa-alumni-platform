import { apiClient } from './client.js';

/**
 * The administrator registration-review endpoints (`ADMIN-1`, `ADMIN-2`).
 *
 * Every call here is administrator-only on the server, which composes
 * `requireAuth`, `requireApproved` and `requireRole('administrator')` on the
 * routes - see `docs/auth.md` §3. `AdminRoute` mirrors that in the client so
 * the screens are not reachable by someone the API would refuse, but the
 * server is the enforcement; this module simply calls it.
 */

/**
 * The `code` values these endpoints put on a failure envelope.
 *
 * As with `AUTH_ERROR_CODE`, branch on the code and never on the message: the
 * message is wording for a person and the server may reword it.
 */
export const ADMIN_ERROR_CODE = {
  /** 409: the registration has already been approved or rejected. */
  REGISTRATION_NOT_PENDING: 'REGISTRATION_NOT_PENDING',
  /** 403: an administrator pointed a decision at their own account. */
  SELF_REVIEW_FORBIDDEN: 'SELF_REVIEW_FORBIDDEN',
};

/**
 * True when a decision failed because somebody had already made it.
 *
 * This is the case the review screen must not report as a generic failure:
 * nothing is broken, the queue is simply staler than the screen. Typically a
 * second tab, or another administrator working the same queue.
 *
 * @param {unknown} error The rejection from `approveRegistration` /
 *   `rejectRegistration`.
 */
export function isAlreadyReviewed(error) {
  return error?.code === ADMIN_ERROR_CODE.REGISTRATION_NOT_PENDING;
}

/** True when the API refused because the target is the caller's own account. */
export function isSelfReview(error) {
  return error?.code === ADMIN_ERROR_CODE.SELF_REVIEW_FORBIDDEN;
}

/**
 * The server caps `limit` at 100 (`MAX_PAGE_SIZE` in
 * `server/src/validators/admin.validator.js`). Asking for the maximum keeps
 * this release to one request for a queue of any plausible size; when the queue
 * outgrows that, `pagination.total` in the reply is what says so.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Fetches the pending-registration queue, oldest first.
 *
 * @param {{ page?: number, limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<{ registrations: Array<{ id: string, name: string,
 *   email: string, association: string, studentNumber: string|null,
 *   graduationYear: number|null, registeredAt: string }>,
 *   pagination: { page: number, limit: number, total: number,
 *   totalPages: number } }>}
 * @throws {import('./client.js').ApiError} 401 unauthenticated; 403 not an
 *   approved administrator; 400 if `page` or `limit` is unusable.
 */
export async function getPendingRegistrations({ page, limit, signal } = {}) {
  const query = new URLSearchParams();

  if (page !== undefined) query.set('page', String(page));
  query.set('limit', String(limit ?? MAX_PAGE_SIZE));

  const data = await apiClient.get(`/admin/registrations/pending?${query}`, { signal });

  // Defended rather than trusted: a screen that renders `.map` over whatever
  // arrived would blank out entirely if the shape ever drifted.
  return {
    registrations: Array.isArray(data?.registrations) ? data.registrations : [],
    pagination: data?.pagination ?? {
      page: 1,
      limit: limit ?? MAX_PAGE_SIZE,
      total: 0,
      totalPages: 1,
    },
  };
}

/**
 * Finds one pending registration by id.
 *
 * There is no `GET /admin/registrations/:id` endpoint - the queue is the only
 * read - so this pages through it. A registration that is not found is not an
 * error: it means the account is no longer awaiting review, which is exactly
 * what the review screen needs to be told when an applicant was actioned in
 * another tab.
 *
 * @param {string} id
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<object|null>} The registration, or null if it is not in the
 *   queue.
 */
export async function findPendingRegistration(id, { signal } = {}) {
  for (let page = 1; ; page += 1) {
    const { registrations, pagination } = await getPendingRegistrations({ page, signal });
    const match = registrations.find((registration) => registration.id === id);

    if (match) return match;
    if (page >= (pagination.totalPages ?? 1)) return null;
  }
}

/**
 * Approves a pending registration.
 *
 * @param {string} id
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ user: object }>} The account with `approvedBy` and
 *   `approvedAt` recorded.
 * @throws {import('./client.js').ApiError} 409 `REGISTRATION_NOT_PENDING` when
 *   it has already been decided; 403 `SELF_REVIEW_FORBIDDEN` for one's own
 *   account; 404 when no account has that id; 400 for a malformed id.
 */
export function approveRegistration(id, options) {
  return apiClient.patch(
    `/admin/registrations/${encodeURIComponent(id)}/approve`,
    undefined,
    options
  );
}

/**
 * Rejects a pending registration. Mirrors `approveRegistration`, including the
 * 409: a rejection is a decision, so re-deciding is refused rather than
 * repeated.
 */
export function rejectRegistration(id, options) {
  return apiClient.patch(
    `/admin/registrations/${encodeURIComponent(id)}/reject`,
    undefined,
    options
  );
}

export default {
  getPendingRegistrations,
  findPendingRegistration,
  approveRegistration,
  rejectRegistration,
};
