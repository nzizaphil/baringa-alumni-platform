import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getNotifications,
  isNotificationMissing,
  markNotificationRead,
} from '../api/notifications.js';
import useAuth from '../hooks/useAuth.js';
import NotificationsContext from './notificationsContext.js';

/**
 * Owns the caller's notifications for the whole app (`ADMIN-3`).
 *
 * Fetches on mount and again whenever the session changes - which is what
 * covers "after login", since signing in replaces the token and signing out
 * clears it. There is no polling: the one notification this release sends is
 * raised by an administrator's decision, and the member sees it on their next
 * load. Polling for it would put a request on a timer for every signed-in tab
 * to catch a thing that happens once.
 *
 * Sits inside `AuthProvider` so it can read the session, and outside the routes
 * so the header and every screen share one copy of the list.
 */
export default function NotificationsProvider({ children }) {
  const { token } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  /*
   * As in `AuthProvider`: a slow fetch must not overwrite a newer one. Signing
   * out while a request is in flight would otherwise land somebody else's list
   * in the next account's header.
   */
  const generationRef = useRef(0);

  const load = useCallback(async (signal) => {
    generationRef.current += 1;
    const generation = generationRef.current;

    try {
      const { notifications: rows } = await getNotifications({ signal });

      if (signal?.aborted || generation !== generationRef.current) return;

      setNotifications(rows);
      setStatus('ready');
      setError(null);
    } catch (requestError) {
      if (signal?.aborted || requestError?.name === 'AbortError') return;
      if (generation !== generationRef.current) return;

      setNotifications([]);
      setError(requestError);
      setStatus('error');
    }
  }, []);

  /*
   * `token` rather than `isAuthenticated` is the dependency that matters: it
   * changes on sign-in and on sign-out, whereas `isAuthenticated` also flips
   * when the account arrives a moment after the token and would fetch twice.
   *
   * `react-hooks/set-state-in-effect` is suppressed for the same reason
   * `AdminDashboardPage` suppresses it: every `setState` in `load` runs after
   * an `await`, in a promise callback, not in the synchronous cascade the rule
   * exists to catch.
   */
  useEffect(() => {
    if (!token) {
      generationRef.current += 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on sign-out, not a cascade
      setNotifications([]);
      setStatus('idle');
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    setStatus('loading');
    load(controller.signal);
    return () => controller.abort();
  }, [token, load]);

  const refresh = useCallback(() => {
    setStatus('loading');
    setError(null);
    load();
  }, [load]);

  /**
   * Marks one notification read.
   *
   * The row is updated locally first so the badge and the list respond to the
   * click immediately, then confirmed against the server. A `readAt` that never
   * lands is corrected by the next fetch; showing a spinner on a row for a
   * write nobody is waiting on would be worse.
   *
   * A 404 means the list on screen is stale - already read in another tab - so
   * it refetches rather than reporting a failure. Any other failure puts the
   * row back where it was, so the count never quietly under-reports.
   */
  const markRead = useCallback(
    async (id) => {
      const target = notifications.find((row) => row.id === id);

      // Already read, or not on this list at all. The server would answer 200
      // either way, but there is nothing to tell it.
      if (!target || target.readAt) return;

      const readAt = new Date().toISOString();

      setNotifications((rows) =>
        rows.map((row) => (row.id === id ? { ...row, readAt } : row))
      );

      try {
        await markNotificationRead(id);
      } catch (requestError) {
        if (isNotificationMissing(requestError)) {
          refresh();
          return;
        }

        // Put this row back, and only this row: a parallel `markAllRead` may
        // have succeeded on the others.
        setNotifications((rows) =>
          rows.map((row) => (row.id === id ? { ...row, readAt: null } : row))
        );
      }
    },
    [notifications, refresh]
  );

  /**
   * Marks every unread notification read.
   *
   * One request per notification, because the API marks them one at a time.
   * That is proportionate while the list is short and unpaged; a bulk endpoint
   * is the right answer once it is not, and this is the one place that would
   * have to change.
   */
  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((row) => !row.readAt);

    if (unread.length === 0) return;

    await Promise.all(unread.map((row) => markRead(row.id)));
  }, [notifications, markRead]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.filter((row) => !row.readAt).length,
      status,
      error,
      refresh,
      markRead,
      markAllRead,
    }),
    [notifications, status, error, refresh, markRead, markAllRead]
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}
