import { useEffect, useRef, useState } from 'react';

import { NOTIFICATION_TYPE } from '../api/notifications.js';
import Alert from '../components/Alert.jsx';
import PageLayout from '../components/PageLayout.jsx';
import useAuth from '../hooks/useAuth.js';
import useFlashMessage from '../hooks/useFlashMessage.js';
import useNotifications from '../hooks/useNotifications.js';

/**
 * Placeholder for the member area.
 *
 * AUTH-4 needs somewhere to send an approved member, and the route guard needs
 * something to guard; the feed itself (F07.2) and posting belong to later
 * tickets. Nothing here is taken from the prototype beyond the shared frame.
 *
 * It is also where a member lands after being turned away from the
 * administrator area, so it renders whatever message that redirect carried
 * (`AdminRoute`). Without this the refusal would be a silent bounce - the
 * member would ask for `/admin`, arrive at their feed, and have nothing to
 * explain the journey.
 *
 * And it is where a newly approved member learns they are in (`ADMIN-3`) - see
 * `useApprovalWelcome` below.
 */

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

  return (
    <PageLayout>
      <section
        className="w-full max-w-[600px] space-y-6"
        aria-labelledby="feed-heading"
      >
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

        <div className="rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10">
          <h1 id="feed-heading" className="mb-2 text-32 font-semibold text-near-black">
            Welcome back{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="text-16 text-secondary-text">
            You are signed in. The member feed arrives in a later release.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
