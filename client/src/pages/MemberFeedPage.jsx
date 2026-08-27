import PageLayout from '../components/PageLayout.jsx';
import useAuth from '../hooks/useAuth.js';

/**
 * Placeholder for the member area.
 *
 * AUTH-4 needs somewhere to send an approved member, and the route guard needs
 * something to guard; the feed itself (F07.2) and posting belong to later
 * tickets. Nothing here is taken from the prototype beyond the shared frame.
 */
export default function MemberFeedPage() {
  const { user } = useAuth();

  return (
    <PageLayout>
      <section
        className="w-full max-w-[600px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
        aria-labelledby="feed-heading"
      >
        <h1 id="feed-heading" className="mb-2 text-32 font-semibold text-near-black">
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="text-16 text-secondary-text">
          You are signed in. The member feed arrives in a later release.
        </p>
      </section>
    </PageLayout>
  );
}
