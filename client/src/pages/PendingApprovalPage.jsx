import PageLayout from '../components/PageLayout.jsx';

/**
 * Placeholder for the pending-approval route.
 *
 * AUTH-4 routes a member whose account is not yet approved here, so the route
 * has to resolve to something. The screen itself (F06.1) and the rule that
 * keeps a pending member out of the member area are AUTH-7; neither is
 * implemented here.
 */
export default function PendingApprovalPage() {
  return (
    <PageLayout>
      <section
        className="w-full max-w-[600px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
        aria-labelledby="pending-heading"
      >
        <h1 id="pending-heading" className="mb-2 text-32 font-semibold text-near-black">
          Awaiting approval
        </h1>
        <p className="text-16 text-secondary-text">
          An administrator is reviewing your registration. This screen is completed in a later
          release.
        </p>
      </section>
    </PageLayout>
  );
}
