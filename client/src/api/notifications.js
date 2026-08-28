import { apiClient } from './client.js';

/**
 * A member's own notifications (`ADMIN-3`).
 *
 * Both endpoints are scoped to the signed-in account on the server - there is
 * no recipient parameter to pass and no way to ask for somebody else's - so
 * this module takes no user id anywhere. See `docs/api.md` for the contract.
 */

/**
 * The notification types the API can send.
 *
 * Only membership approval exists in this release. The screens switch on this
 * to choose a heading and an icon, so a Phase 2 type is added here and in
 * `NOTIFICATION_PRESENTATION` on the page - nothing else in the client changes.
 */
export const NOTIFICATION_TYPE = {
  MEMBERSHIP_APPROVED: 'MEMBERSHIP_APPROVED',
};

/**
 * The `code` this endpoint puts on a failure envelope.
 *
 * As with `AUTH_ERROR_CODE`, branch on the code and never on the message.
 */
export const NOTIFICATION_ERROR_CODE = {
  /** 404: no notification of the caller's has that id. */
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
};

/**
 * True when the server has no such notification for this caller.
 *
 * Not a failure to report: the list on screen is staler than the server, so the
 * right response is to refetch rather than to show an error. The server answers
 * this for another account's id as well as for one that does not exist, which
 * is deliberate - it does not confirm other people's records.
 *
 * @param {unknown} error The rejection from `markNotificationRead`.
 */
export function isNotificationMissing(error) {
  return error?.code === NOTIFICATION_ERROR_CODE.NOTIFICATION_NOT_FOUND;
}

/**
 * Fetches the caller's notifications, newest first.
 *
 * `unreadCount` comes back with the list rather than from a second endpoint, so
 * the header's indicator and the page are always describing the same data.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ notifications: Array<{ id: string, type: string,
 *   message: string, readAt: string|null, createdAt: string }>,
 *   unreadCount: number }>}
 * @throws {import('./client.js').ApiError} 401 when not signed in.
 */
export async function getNotifications({ signal } = {}) {
  const data = await apiClient.get('/notifications', { signal });

  // Defended rather than trusted, as `api/admin.js` does: a header that maps
  // over whatever arrived would blank out entirely if the shape ever drifted.
  const notifications = Array.isArray(data?.notifications) ? data.notifications : [];

  return {
    notifications,
    unreadCount:
      typeof data?.unreadCount === 'number'
        ? data.unreadCount
        : notifications.filter((notification) => !notification.readAt).length,
  };
}

/**
 * Marks one notification as read.
 *
 * Idempotent on the server, so a caller that is not sure whether it has already
 * marked something can simply call it again.
 *
 * @param {string} id
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ notification: object }>}
 * @throws {import('./client.js').ApiError} 404 `NOTIFICATION_NOT_FOUND` when
 *   the id is not one of the caller's; 400 for a malformed id.
 */
export function markNotificationRead(id, options) {
  return apiClient.patch(
    `/notifications/${encodeURIComponent(id)}/read`,
    undefined,
    options
  );
}

export default { getNotifications, markNotificationRead, isNotificationMissing };
