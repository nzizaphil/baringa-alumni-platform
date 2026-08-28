import { useContext } from 'react';
import { NavLink } from 'react-router-dom';

import { USER_STATUS } from '../api/auth.js';
import AuthContext from '../context/authContext.js';
import NotificationsContext from '../context/notificationsContext.js';
import { NOTIFICATIONS_PATH } from '../routes.js';

/**
 * The header's notifications control and unread indicator (`ADMIN-3`),
 * following the bell in
 * `docs/prototype/10-BaringaAlumni - F14.1 Notifica.html`.
 *
 * Rendered only for an *approved* account, on the same reasoning as
 * `HeaderNav`: a pending or rejected one is held at `/pending`, so a bell it
 * would be bounced off is an invitation to a dead end.
 *
 * Reads both contexts directly rather than through their hooks, matching
 * `HeaderNav` and `SignOutButton`, so rendering the shared header outside
 * either provider degrades to "no bell" instead of throwing.
 *
 * The prototype draws a bare dot. A number is drawn here instead: "you have
 * notifications" and "you have four notifications" are different facts, and the
 * count is already in hand - the list endpoint returns it. The dot's job, an
 * at-a-glance "something is waiting", is still done by the same coloured mark.
 */
export default function NotificationBell() {
  const auth = useContext(AuthContext);
  const notifications = useContext(NotificationsContext);

  if (!auth?.isAuthenticated || auth.user?.status !== USER_STATUS.APPROVED) return null;

  const unreadCount = notifications?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  return (
    <NavLink
      to={NOTIFICATIONS_PATH}
      // h-11 keeps the target at the 44px minimum inside the 64px header.
      className={({ isActive }) =>
        `relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-button transition-colors hover:bg-bg-page focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30 ${
          isActive ? 'text-primary-text' : 'text-primary'
        }`
      }
      /*
       * The count is in the accessible name rather than only in the badge, so
       * it is announced on focus instead of being read as a stray number after
       * the word "Notifications" - or, for the dot alone, not at all.
       */
      aria-label={
        hasUnread
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications, none unread'
      }
    >
      <i className="fa-solid fa-bell text-20" aria-hidden="true" />

      {hasUnread && (
        <span
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-accent px-1 text-12 font-semibold leading-none text-near-black"
          aria-hidden="true"
        >
          {/* Two digits is all the badge has room for; past that it is "a lot". */}
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  );
}
