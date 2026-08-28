import { useCallback, useEffect, useRef, useState } from 'react';

import { NOTIFICATION_TYPE } from '../api/notifications.js';
import { getFeed } from '../api/posts.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import PageLayout from '../components/PageLayout.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';
import useAuth from '../hooks/useAuth.js';
import useFlashMessage from '../hooks/useFlashMessage.js';
import useNotifications from '../hooks/useNotifications.js';

/**
 * The member feed (`POST-2`), following
 * `docs/prototype/06-BaringaAlumni - F07.2 Member F.html`.
 *
 * Four states, exclusive as on the administrator dashboard: a skeleton on the
 * first fetch, an error with a retry, F07.2's empty state, and the list. The
 * error state is kept distinct from the empty one for the same reason it is
 * there - a member shown "No posts yet" when the request actually failed will
 * believe the community is silent.
 *
 * **Single column.** The prototype puts the feed in two thirds of a
 * `lg:grid-cols-3` grid with a profile card beside it. That card is entirely
 * profile data this phase does not have - photograph, job title, employer, Edit
 * profile, Upload CV - so building the grid would mean building an empty column
 * to sit in it. The feed takes the centred 700px column the composer prototypes
 * (F08) use instead, which is also what makes the screen work unchanged on a
 * phone.
 *
 * Two behaviours that predate posts and must keep working:
 *
 * - the explanation carried here when `AdminRoute` turns a non-administrator
 *   away from `/admin`, and
 * - the membership-acceptance confirmation on a member's first visit after
 *   approval (`ADMIN-3`), below.
 */

/** How many posts a page of the feed holds. */
const PAGE_SIZE = 20;

/**
 * The membership-approval confirmation, shown once.
 *
 * A member whose registration is approved has no way of knowing it happened:
 * nothing is sent to them, and the only visible difference is that the feed
 * stopped bouncing them to `/pending`. So the first load of the feed with an
 * unread `MEMBERSHIP_APPROVED` notification says so prominently.
 *
 * It is marked read *as it is displayed*, not when it is dismissed. The banner
 * is the reading: it has been seen by the time this returns, and leaving it
 * unread would mean showing it again on every visit until the member found the
 * notifications screen and cleared it by hand.
 *
 * The notification itself is not deleted - it stays on the notifications screen
 * as a record. What is one-shot is this banner.
 *
 * `claimed` holds the notification in local state so it survives being marked
 * read a moment later. Without it the banner would appear and vanish inside the
 * same visit, which is exactly the thing being avoided.
 */
function useApprovalWelcome() {
  const { notifications, markRead } = useNotifications();
  const [claimed, setClaimed] = useState(null);
  const claimedRef = useRef(false);

  useEffect(() => {
    if (claimedRef.current) return;

    const approval = notifications.find(
      (notification) =>
        notification.type === NOTIFICATION_TYPE.MEMBERSHIP_APPROVED &&
        !notification.readAt
    );

    if (!approval) return;

    // Set before the await inside `markRead`, so a second render caused by the
    // list updating cannot claim the same notification twice.
    claimedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot claim of a fetched notification
    setClaimed(approval);
    markRead(approval.id);
  }, [notifications, markRead]);

  return [claimed, () => setClaimed(null)];
}

export default function MemberFeedPage() {
  const { user } = useAuth();
  const [flash, dismissFlash] = useFlashMessage();
  const [welcome, dismissWelcome] = useApprovalWelcome();

  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  /**
   * Loads the first page.
   *
   * Kept in a callback so the mount path and the retry control go through one
   * path - two ways of fetching the same list is two places for them to drift.
   */
  const load = useCallback(async (signal) => {
    /*
     * Nothing is set before the first `await`: `status` already starts as
     * `loading`, so the mount path needs no synchronous update. The retry below
     * is an event handler, where setting it up front is right.
     */
    try {
      const { posts: rows, pagination } = await getFeed({ limit: PAGE_SIZE, signal });

      if (signal?.aborted) return;

      setPosts(rows);
      setCursor(pagination.nextCursor);
      setHasMore(pagination.hasMore);
      setStatus('ready');
    } catch (requestError) {
      if (signal?.aborted || requestError?.name === 'AbortError') return;

      setError(requestError);
      setStatus('error');
    }
  }, []);

  /*
   * Fetch on mount. `react-hooks/set-state-in-effect` is suppressed as it is on
   * the dashboard: every `setState` in `load` runs *after* an `await`, in a
   * promise callback, which is not the synchronous cascade the rule catches.
   */
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set after await, not synchronously
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Re-fetches from the top: the retry control and the empty state's refresh. */
  const reload = useCallback(() => {
    setStatus('loading');
    setError(null);
    load();
  }, [load]);

  /**
   * Appends the next page.
   *
   * Cursor-based, so a post published between two pages cannot push a row from
   * the end of this page onto the start of the next one and show it twice.
   */
  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      const { posts: rows, pagination } = await getFeed({ limit: PAGE_SIZE, cursor });

      setPosts((current) => [...current, ...rows]);
      setCursor(pagination.nextCursor);
      setHasMore(pagination.hasMore);
    } catch (requestError) {
      // The posts already on screen stay: losing them because the *next* page
      // failed would punish the member for scrolling.
      setError(requestError);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore]);

  /**
   * Puts a just-published post at the top, without refetching.
   *
   * The cursor is untouched: it names a position further down the feed, and the
   * new post is above every page boundary rather than inside one.
   */
  const handlePosted = useCallback((post) => {
    setPosts((current) => [post, ...current]);
    setStatus('ready');
    setError(null);
  }, []);

  const isEmpty = status === 'ready' && posts.length === 0;

  return (
    <PageLayout wide>
      {/*
       * Single column at every width, centred. `max-w-[700px]` is the width the
       * composer prototypes use, and it is what keeps the feed readable on a
       * wide screen and unchanged on a narrow one.
       */}
      <div className="mx-auto w-full max-w-[700px] space-y-6">
        <h1 className="sr-only">Member feed</h1>

        {welcome && (
          <Alert
            variant="success"
            title="Your membership has been approved"
            onDismiss={dismissWelcome}
          >
            <p>{welcome.message}</p>
          </Alert>
        )}

        {flash && (
          <Alert variant={flash.variant ?? 'error'} title={flash.title} onDismiss={dismissFlash}>
            <p>{flash.message}</p>
          </Alert>
        )}

        <PostComposer onPosted={handlePosted} />

        {status === 'loading' && <FeedSkeleton />}
        {status === 'error' && <ErrorState error={error} onRetry={reload} />}
        {isEmpty && <EmptyState authorName={user?.name} />}

        {status === 'ready' && posts.length > 0 && (
          <>
            <ul className="space-y-6">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} />
                </li>
              ))}
            </ul>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={loadMore}
                  loading={isLoadingMore}
                  className="px-8"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more posts'}
                </Button>
              </div>
            )}

            {/*
             * A page that failed *after* the first one. Reported below the list
             * rather than replacing it, because everything above is still good.
             */}
            {error && !isLoadingMore && (
              <Alert variant="error" title="More posts could not be loaded">
                <p>{error.message || 'Something went wrong. Try again.'}</p>
              </Alert>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

/**
 * The first-fetch skeleton.
 *
 * Three cards in the shape of the real ones rather than a spinner: the feed's
 * layout is known before its contents are, so the page can hold its shape and
 * avoid the jolt of a spinner being replaced by a column of posts.
 */
function FeedSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="rounded-card border border-border-light bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-bg-page" />
            <div className="flex-grow space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-bg-page" />
              <div className="h-3 w-24 animate-pulse rounded bg-bg-page" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-bg-page" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-bg-page" />
          </div>
        </div>
      ))}
      <p className="sr-only" role="status">
        Loading the feed…
      </p>
    </div>
  );
}

/** The card the two non-list states share, so they sit identically. */
function StatePanel({ children }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-border-light bg-white p-8 text-center shadow-sm md:p-12">
      {children}
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger bg-opacity-10">
        <i className="fa-solid fa-triangle-exclamation text-32 text-danger" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">
        The feed could not be loaded
      </h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        {error?.message || 'Something went wrong while loading the feed.'}
      </p>

      <Button onClick={onRetry}>Try again</Button>
    </StatePanel>
  );
}

/**
 * F07.2's empty state.
 *
 * The prototype's primary action is a "Create post" button that navigates to
 * the composer screen. The composer is already on this page, directly above
 * this panel, so the button moves focus to it instead of navigating - the same
 * affordance without a round trip, and no dead end.
 */
function EmptyState({ authorName }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-bg-page">
        <i className="fa-solid fa-newspaper text-32 text-secondary-text" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">No posts yet</h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        Be the first one to share a professional update with your university community.
      </p>

      <Button
        onClick={() => {
          const composer = document.querySelector('form textarea');
          composer?.focus();
          composer?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
        aria-label={
          authorName
            ? `Write the first post as ${authorName}`
            : 'Write the first post'
        }
      >
        Create post
      </Button>
    </StatePanel>
  );
}
