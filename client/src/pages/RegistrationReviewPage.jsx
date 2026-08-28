import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  approveRegistration,
  findPendingRegistration,
  isAlreadyReviewed,
  isSelfReview,
  rejectRegistration,
} from '../api/admin.js';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import FieldValue from '../components/FieldValue.jsx';
import PageLayout from '../components/PageLayout.jsx';
import { ADMIN_HOME_PATH } from '../routes.js';
import {
  formatAssociation,
  formatDate,
  formatRelativeTime,
} from '../format/registration.js';

/**
 * The registration review panel (`ADMIN-2`), following Figma frame F18 -
 * `docs/prototype/14-BaringaAlumni - F18.1 Registra.html` for the panel and
 * `15-BaringaAlumni - F18.4 Registra.html` for the confirmation.
 *
 * Where the applicant comes from
 * ------------------------------
 * There is no `GET /admin/registrations/:id`: the queue is the only read the
 * API offers. So this screen finds the applicant in the queue by id, which has
 * a useful consequence - an applicant who is not in the queue is one who is no
 * longer pending, and that is precisely the state this screen has to handle
 * gracefully when two administrators are working at once.
 *
 * The dashboard hands the row over in location state as well, purely so a click
 * from the queue paints immediately instead of flashing a spinner. The fetch
 * still runs and still decides; the handed-over copy is a head start, never the
 * source of truth.
 *
 * Both decisions are irreversible and the server answers 409 to a second one,
 * so neither is a single click: each opens a confirmation naming the applicant
 * and what will happen.
 */

const DECISIONS = {
  approve: {
    verb: 'approve',
    request: approveRegistration,
    confirmTitle: 'Approve this registration?',
    confirmDescription: 'This person will be able to sign in and use the platform immediately.',
    confirmLabel: 'Approve',
    variant: 'success',
    /*
     * The prototype's toast reads "Registration approved - the member has been
     * notified". Nothing is sent: there is no mail transport in this release
     * and notifications are a separate ticket (F14). Telling an administrator
     * that a member has been told, when they have not, would have them close a
     * loop that is still open - so the copy says what actually happens, which
     * is that the outcome is waiting on the applicant's own screen. This is the
     * same departure decision #39 makes on the pending screen.
     */
    toast: (name) => `Registration approved — ${name} can now sign in.`,
  },
  reject: {
    verb: 'reject',
    request: rejectRegistration,
    confirmTitle: 'Reject this registration?',
    confirmDescription:
      'This person will not be able to use the platform, and the decision cannot be undone here.',
    confirmLabel: 'Reject',
    variant: 'danger',
    toast: (name) => `Registration rejected — ${name} has not been given access.`,
  },
};

export default function RegistrationReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // A head start from the dashboard, if this was reached by clicking a row.
  const [registration, setRegistration] = useState(location.state?.registration ?? null);
  const [status, setStatus] = useState(location.state?.registration ? 'ready' : 'loading');
  const [error, setError] = useState(null);

  /** Which decision is being confirmed, if any. */
  const [pendingDecision, setPendingDecision] = useState(null);
  /** Which decision is in flight, if any. Drives the acting button's spinner. */
  const [submitting, setSubmitting] = useState(null);
  const [decisionError, setDecisionError] = useState(null);

  const load = useCallback(
    async (signal) => {
      // No state is set before the first `await`: `status` already starts at
      // `loading` (or at `ready`, when the dashboard handed the row over), so
      // the mount path has nothing to update synchronously.
      try {
        const found = await findPendingRegistration(id, { signal });

        if (signal?.aborted) return;

        setRegistration(found);
        // Not found means "no longer awaiting review", which is a state of its
        // own rather than a failure - see `gone` below.
        setStatus(found ? 'ready' : 'gone');
      } catch (requestError) {
        if (signal?.aborted || requestError?.name === 'AbortError') return;

        setError(requestError);
        setStatus('error');
      }
    },
    [id]
  );

  /*
   * Fetch on mount. `react-hooks/set-state-in-effect` is suppressed rather than
   * worked around: the rule is static and cannot see that every `setState` in
   * `load` runs *after* an `await`, in a promise callback, which is not the
   * synchronous cascade it exists to catch. Talking to the server is the
   * textbook reason an effect is the right tool here.
   */
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set after await, not synchronously
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** The error state's retry, where setting `loading` up front is correct. */
  const reload = useCallback(() => {
    setStatus('loading');
    setError(null);
    load();
  }, [load]);

  /** Returns to the dashboard, which remounts and so reloads the queue. */
  const returnToDashboard = useCallback(
    (flash) => navigate(ADMIN_HOME_PATH, { replace: true, state: flash ? { flash } : null }),
    [navigate]
  );

  const confirmDecision = async () => {
    const decision = DECISIONS[pendingDecision];
    if (!decision) return;

    setSubmitting(pendingDecision);
    setDecisionError(null);

    try {
      await decision.request(id);

      /*
       * Straight back to the dashboard, carrying the confirmation. Returning
       * rather than staying is what makes the outcome verifiable: the queue
       * reloads on arrival, so the administrator sees the applicant gone from
       * it rather than being told they are.
       */
      returnToDashboard({
        variant: 'success',
        message: decision.toast(registration?.name ?? 'The applicant'),
      });
    } catch (requestError) {
      setSubmitting(null);
      setPendingDecision(null);

      /*
       * 409: somebody else - or this administrator in another tab - has already
       * decided this registration. Nothing is broken and nothing needs
       * retrying; the screen is simply out of date. So it is reported as what
       * it is and the queue is reloaded, rather than shown as a failed action
       * the administrator might reasonably try again.
       */
      if (isAlreadyReviewed(requestError)) {
        returnToDashboard({
          variant: 'warning',
          message: `${registration?.name ?? 'That registration'} had already been reviewed, so nothing was changed. The queue has been refreshed.`,
        });
        return;
      }

      if (isSelfReview(requestError)) {
        setDecisionError({
          title: 'You cannot review your own registration',
          message: 'Another administrator has to decide this one.',
        });
        return;
      }

      setDecisionError({
        title: `The registration could not be ${decision.verb}d`,
        message: requestError?.message || 'Please try again.',
      });
    }
  };

  return (
    <PageLayout wide>
      <div className="mx-auto w-full max-w-[700px]">
        <Link
          to={ADMIN_HOME_PATH}
          className="mb-6 inline-flex items-center gap-2 rounded-button py-2 text-14 font-semibold text-primary-text hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Back to registrations
        </Link>

        {status === 'loading' && <PanelMessage>Loading this registration…</PanelMessage>}

        {status === 'error' && (
          <PanelMessage>
            <Alert variant="error" title="This registration could not be loaded">
              <p>{error?.message || 'Something went wrong.'}</p>
            </Alert>
            <Button className="mt-6" onClick={reload}>
              Try again
            </Button>
          </PanelMessage>
        )}

        {status === 'gone' && <NoLongerPending />}

        {status === 'ready' && registration && (
          <ReviewPanel
            registration={registration}
            decisionError={decisionError}
            onDismissError={() => setDecisionError(null)}
            submitting={submitting}
            onDecide={setPendingDecision}
          />
        )}
      </div>

      {pendingDecision && registration && (
        <ConfirmDialog
          title={DECISIONS[pendingDecision].confirmTitle}
          description={`${registration.name} — ${DECISIONS[pendingDecision].confirmDescription}`}
          confirmLabel={DECISIONS[pendingDecision].confirmLabel}
          variant={DECISIONS[pendingDecision].variant}
          loading={Boolean(submitting)}
          onConfirm={confirmDecision}
          onCancel={() => !submitting && setPendingDecision(null)}
        />
      )}
    </PageLayout>
  );
}

/** The panel shell, so every state of this screen sits in the same card. */
function PanelMessage({ children }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-border-light bg-white p-12 text-center shadow-sm">
      <p className="text-16 text-secondary-text" role="status">
        {children}
      </p>
    </div>
  );
}

/**
 * The applicant is not in the queue: already decided, or never existed.
 *
 * Deliberately not an error. The commonest way to arrive here is a second tab,
 * and the honest thing to say is that there is nothing left to do.
 */
function NoLongerPending() {
  return (
    <div className="flex flex-col items-center rounded-card border border-border-light bg-white p-12 text-center shadow-sm">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-warning bg-opacity-10">
        <i className="fa-solid fa-circle-info text-32 text-warning" aria-hidden="true" />
      </div>

      <h1 className="mb-2 text-20 font-semibold text-near-black">
        This registration is no longer awaiting review
      </h1>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        It has already been approved or rejected — possibly in another tab, or by another
        administrator.
      </p>

      <Link to={ADMIN_HOME_PATH}>
        <Button>Back to registrations</Button>
      </Link>
    </div>
  );
}

/** One declared detail, per the prototype's label-over-value pairs. */
function Detail({ label, value }) {
  return (
    <div className="space-y-1">
      <dt className="text-12 font-semibold uppercase tracking-wider text-secondary-text">
        {label}
      </dt>
      <dd className="text-16 font-semibold text-near-black">
        <FieldValue value={value} />
      </dd>
    </div>
  );
}

function ReviewPanel({ registration, decisionError, onDismissError, submitting, onDecide }) {
  const submitted = `${formatDate(registration.registeredAt)} (${formatRelativeTime(
    registration.registeredAt
  )})`;

  return (
    <div className="overflow-hidden rounded-card border border-border-light bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-light p-8">
        <h1 className="text-24 font-semibold text-near-black">Review registration</h1>
        <span className="rounded-full bg-warning bg-opacity-10 px-3 py-1 text-12 font-semibold uppercase tracking-wider text-warning-text">
          Awaiting review
        </span>
      </div>

      <div className="space-y-6 p-8">
        <dl className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <Detail label="Full name" value={registration.name} />
          <Detail label="Email" value={registration.email} />
          <Detail label="Association type" value={formatAssociation(registration.association)} />
          <Detail label="Student number" value={registration.studentNumber} />
          <Detail label="Graduation year" value={registration.graduationYear} />
          <Detail label="Submitted" value={submitted} />
        </dl>

        {/* The prototype's helper strip: the one instruction this screen gives. */}
        <div className="flex items-center gap-3 rounded-input border border-warning border-opacity-20 bg-warning bg-opacity-5 p-4">
          <i className="fa-solid fa-circle-info text-warning" aria-hidden="true" />
          <p className="text-14 text-warning-text">
            Confirm these details match university records before approving.
          </p>
        </div>

        {decisionError && (
          <Alert variant="error" title={decisionError.title} onDismiss={onDismissError}>
            <p>{decisionError.message}</p>
          </Alert>
        )}

        <div className="flex flex-col justify-end gap-4 pt-4 sm:flex-row">
          <Button
            variant="danger"
            className="h-11 text-14"
            loading={submitting === 'reject'}
            disabled={Boolean(submitting)}
            onClick={() => onDecide('reject')}
          >
            Reject
          </Button>
          <Button
            className="h-11 bg-success px-8 text-14 hover:bg-success-text focus:ring-success"
            loading={submitting === 'approve'}
            disabled={Boolean(submitting)}
            onClick={() => onDecide('approve')}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
