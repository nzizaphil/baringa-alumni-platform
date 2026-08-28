import Alert from '../components/Alert.jsx';
import PageLayout from '../components/PageLayout.jsx';
import useAuth from '../hooks/useAuth.js';
import useFlashMessage from '../hooks/useFlashMessage.js';

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
 */
export default function MemberFeedPage() {
  const { user } = useAuth();
  const [flash, dismissFlash] = useFlashMessage();

  return (
    <PageLayout>
      <section
        className="w-full max-w-[600px] space-y-6"
        aria-labelledby="feed-heading"
      >
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
