import { USER_STATUS } from '../api/auth.js';
import PageLayout from '../components/PageLayout.jsx';
import SignOutButton from '../components/SignOutButton.jsx';
import useAuth from '../hooks/useAuth.js';

/*
 * Decision #39: the prototype promises "a confirmation email will be sent to
 * you once your account is approved". Nothing is sent - there is no mail
 * transport in this release - so the screen must not say one is coming, and it
 * must not leave the member waiting for one either. The copy below replaces
 * that promise with how they will actually find out: this screen tells them,
 * and an approved account is carried straight through to the member area on
 * the next sign-in. The prototype's structure, tokens and tone are otherwise
 * followed as drawn.
 */
const NOTIFICATION_COPY =
  'You will find the outcome on this screen the next time you sign in. Once an ' +
  'administrator has approved your account, signing in takes you straight to the ' +
  'member area instead.';

/**
 * The two states this screen renders, keyed by account status.
 *
 * `rejected` is here because the route guard sends every account that is not
 * approved to `/pending`, not only the ones still waiting. Showing a member
 * whose registration was turned down that it is "being reviewed" would be
 * untrue and would leave them refreshing forever.
 */
const PRESENTATION = {
  [USER_STATUS.PENDING]: {
    icon: 'fa-clock',
    tint: 'bg-warning',
    iconColour: 'text-warning',
    panelLabel: 'text-warning-text',
    panelBorder: 'border-warning',
    panelDivider: 'border-warning',
    pill: 'bg-warning text-near-black',
    pillLabel: 'Pending',
    heading: 'Your registration is being reviewed',
    paragraphs: [
      'Our administrators are checking the details you declared against university records.',
      NOTIFICATION_COPY,
    ],
    closing: 'Member functionality is currently limited to this view.',
  },
  [USER_STATUS.REJECTED]: {
    icon: 'fa-circle-xmark',
    tint: 'bg-danger',
    iconColour: 'text-danger',
    panelLabel: 'text-danger-text',
    panelBorder: 'border-danger',
    panelDivider: 'border-danger',
    pill: 'bg-danger text-white',
    pillLabel: 'Not approved',
    heading: 'Your registration was not approved',
    paragraphs: [
      'An administrator reviewed the details you declared and could not confirm them against university records.',
      'If you believe this is a mistake, contact the alumni office with your student or staff number so the registration can be looked at again.',
    ],
    closing: 'This account cannot be used to access the platform.',
  },
};

/** One row of the summary panel: label on the left, value on the right. */
function SummaryRow({ label, children, divider }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4',
        divider ? `border-b ${divider} border-opacity-10 pb-3` : 'pt-1',
      ].join(' ')}
    >
      <span className="text-14 text-secondary-text">{label}</span>
      <span className="text-14 font-semibold text-near-black">{children}</span>
    </div>
  );
}

/**
 * Pending-approval screen (AUTH-7).
 *
 * Follows docs/prototype/05-BaringaAlumni - F06.1 Pending.html: a centred
 * 600px card, centre-aligned, led by a tinted status disc, with a tinted
 * summary panel and a sign-out button below it. The header carries its own
 * "Sign out" as the prototype does, so both controls on this screen are the
 * one shared `SignOutButton` in its two treatments.
 *
 * Where an account stands is the only thing this screen exists to say, so it
 * reads `status` from the session rather than making a call of its own -
 * `AuthProvider` has already confirmed it against `GET /api/auth/me`, which
 * stays open to accounts awaiting review precisely so this screen works.
 *
 * The prototype's summary panel also lists association type, student number
 * and graduation year. Those are not part of the account the API returns at
 * sign-in, and widening that contract belongs to whichever ticket needs a
 * profile - so the panel shows the identity the member is signed in as, which
 * is what makes the panel useful here regardless: it confirms *which*
 * registration is the one being reviewed.
 */
export default function PendingApprovalPage() {
  const { user } = useAuth();

  const presentation = PRESENTATION[user?.status] ?? PRESENTATION[USER_STATUS.PENDING];

  return (
    <PageLayout>
      <section
        id="pending-card"
        className="w-full max-w-[600px] rounded-card border border-border-light bg-white p-8 text-center shadow-sm md:p-10"
        aria-labelledby="pending-heading"
      >
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full ${presentation.tint} bg-opacity-10`}
          >
            <i
              className={`fa-solid ${presentation.icon} text-32 ${presentation.iconColour}`}
              aria-hidden="true"
            />
          </div>
        </div>

        <h1 id="pending-heading" className="mb-4 text-32 font-semibold text-near-black">
          {presentation.heading}
        </h1>

        <div className="mb-8 space-y-4">
          {presentation.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-16 text-secondary-text">
              {paragraph}
            </p>
          ))}
          <p className="text-16 font-semibold text-secondary-text">{presentation.closing}</p>
        </div>

        <div
          className={`mb-8 rounded-input border ${presentation.panelBorder} border-opacity-20 ${presentation.tint} bg-opacity-5 p-6 text-left`}
        >
          <h2
            className={`mb-4 text-14 font-semibold uppercase tracking-wider ${presentation.panelLabel}`}
          >
            Your registration
          </h2>

          <div className="space-y-4">
            <SummaryRow label="Name" divider={presentation.panelDivider}>
              {user?.name || '—'}
            </SummaryRow>
            <SummaryRow label="Signed in as" divider={presentation.panelDivider}>
              {user?.email || '—'}
            </SummaryRow>
            <SummaryRow label="Status">
              <span
                className={`rounded-full px-3 py-1 text-12 font-semibold ${presentation.pill}`}
              >
                {presentation.pillLabel}
              </span>
            </SummaryRow>
          </div>
        </div>

        <SignOutButton variant="button" />
      </section>
    </PageLayout>
  );
}
