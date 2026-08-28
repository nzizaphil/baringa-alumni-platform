import { useNavigate } from 'react-router-dom';

import { NOTIFICATION_TYPE } from '../api/notifications.js';
import Button from '../components/Button.jsx';
import PageLayout from '../components/PageLayout.jsx';
import { capitalise, formatDate, formatRelativeTime } from '../format/registration.js';
import useNotifications from '../hooks/useNotifications.js';
import { MEMBER_HOME_PATH } from '../routes.js';

/**
 * The member's notifications (`ADMIN-3`), following Figma frame F14 -
 * `docs/prototype/10-BaringaAlumni - F14.1 Notifica.html` for the populated
 * list and `11-BaringaAlumni - F14.2 Notifica.html` for the empty state.
 *
 * Four states, exclusive as on the dashboard: `loading` while the request is
 * out, `error` with a retry when it fails, `empty` when there is nothing, and
 * the list when there is something. The error state exists for the same reason
 * it does there - somebody shown an empty list that is really a failed request
 * will believe they have no notifications.
 *
 * Departures from the prototype, all deliberate:
 *
 * - **Only the membership notification is drawn.** The prototype shows likes,
 *   comments and events beside it. Those belong to features that do not exist
 *   (F14 Phase 2, posts, events); drawing them would be drawing fiction. The
 *   presentation map below is keyed on `type`, so each one is a row in that
 *   map when its ticket lands.
 * - **Each unread row carries its own "Mark as read".** The prototype offers
 *   only "Mark all as read". The API marks one at a time, a member may well
 *   want to keep one unread, and a row whose only affordance is invisible is
 *   not an affordance. "Mark all as read" is kept beside it, as drawn.
 * - **No avatar or role pill in the header.** Those belong to the profile
 *   ticket; the shared header is what every other screen uses.
 */

/**
 * Heading and icon per notification type.
 *
 * The body copy is whatever the server sent and is rendered verbatim, so a
 * notification says what it said when it was raised. Only the framing around it
 * is chosen here - which is why a reworded heading does not need a migration.
 */
const NOTIFICATION_PRESENTATION = {
  [NOTIFICATION_TYPE.MEMBERSHIP_APPROVED]: {
    title: 'Your membership has been approved',
    icon: 'fa-circle-check',
    tint: 'bg-success bg-opacity-10',
    iconColour: 'text-success',
  },
};

/** What an unrecognised type falls back to, rather than an empty row. */
const UNKNOWN_PRESENTATION = {
  title: 'Update on your account',
  icon: 'fa-bell',
  tint: 'bg-primary bg-opacity-10',
  iconColour: 'text-primary',
};

function presentationFor(type) {
  return NOTIFICATION_PRESENTATION[type] ?? UNKNOWN_PRESENTATION;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, status, error, refresh, markRead, markAllRead } =
    useNotifications();

  const isEmpty = status === 'ready' && notifications.length === 0;
  /*
   * `idle` is the provider's pre-fetch state - no token yet, or the fetch has
   * not been kicked off. It reads as loading here rather than as nothing: this
   * screen sits behind `RequireAuth`, so a token is always moments away, and a
   * blank panel would look like a broken page.
   */
  const isLoading = status === 'loading' || status === 'idle';

  return (
    <PageLayout wide>
      <div className="mx-auto flex w-full max-w-[700px] flex-grow flex-col">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h1 className="text-24 font-semibold leading-none text-near-black">
            Notifications
          </h1>

          {/*
           * Drawn only when there is something to mark, rather than disabled:
           * this is not a blocked action, it is an action with no subject. The
           * empty and all-read cases already say so in the list itself.
           */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-button px-2 py-1 text-14 font-semibold text-primary-text hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
            >
              Mark all as read
            </button>
          )}
        </div>

        {isLoading && <LoadingState />}
        {status === 'error' && <ErrorState error={error} onRetry={refresh} />}
        {isEmpty && <EmptyState onBackToFeed={() => navigate(MEMBER_HOME_PATH)} />}

        {status === 'ready' && notifications.length > 0 && (
          <ul className="divide-y divide-border-light overflow-hidden rounded-card border border-border-light bg-white shadow-sm">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={() => markRead(notification.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}

/** The card the three non-list states share, so they sit identically. */
function StatePanel({ children }) {
  return (
    <div className="flex flex-grow flex-col items-center justify-center rounded-card border border-border-light bg-white p-12 text-center shadow-sm">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <StatePanel>
      <span
        className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-border-light border-t-primary"
        aria-hidden="true"
      />
      <p className="text-16 text-secondary-text" role="status">
        Loading your notifications…
      </p>
    </StatePanel>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-danger bg-opacity-10">
        <i className="fa-solid fa-triangle-exclamation text-32 text-danger" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">
        Your notifications could not be loaded
      </h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        {error?.message || 'Something went wrong while loading your notifications.'}
      </p>

      <Button onClick={onRetry}>Try again</Button>
    </StatePanel>
  );
}

/** F14.2, with the prototype's copy about posts kept as it is written there. */
function EmptyState({ onBackToFeed }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-bg-page">
        <i className="fa-solid fa-bell-slash text-32 text-secondary-text" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">
        You have no notifications
      </h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        We&rsquo;ll notify you when there&rsquo;s an update on your account.
      </p>

      <Button variant="secondary" onClick={onBackToFeed} className="px-8">
        Back to feed
      </Button>
    </StatePanel>
  );
}

/**
 * One notification.
 *
 * Unread is carried by the accent bar down the left edge, as the prototype
 * draws it, *and* by a text label - colour alone is not a state a screen reader
 * or a colour-blind reader can perceive.
 */
function NotificationRow({ notification, onMarkRead }) {
  const presentation = presentationFor(notification.type);
  const isUnread = !notification.readAt;

  return (
    <li className="relative flex gap-4 p-4 transition-colors hover:bg-bg-page md:p-6">
      {isUnread && (
        <span className="absolute bottom-0 left-0 top-0 w-1 bg-accent" aria-hidden="true" />
      )}

      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${presentation.tint}`}
        aria-hidden="true"
      >
        <i className={`fa-solid ${presentation.icon} text-20 ${presentation.iconColour}`} />
      </div>

      <div className="min-w-0 flex-grow">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-16 font-semibold leading-tight text-near-black">
            {presentation.title}
            {isUnread && <span className="sr-only"> (unread)</span>}
          </h2>

          <time
            className="whitespace-nowrap text-12 text-secondary-text"
            dateTime={notification.createdAt}
            title={formatDate(notification.createdAt)}
          >
            {capitalise(formatRelativeTime(notification.createdAt))}
          </time>
        </div>

        <p className="text-14 text-secondary-text">{notification.message}</p>

        {isUnread && (
          <button
            type="button"
            onClick={onMarkRead}
            className="mt-2 rounded-button text-14 font-semibold text-primary-text hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
          >
            Mark as read
          </button>
        )}
      </div>
    </li>
  );
}
