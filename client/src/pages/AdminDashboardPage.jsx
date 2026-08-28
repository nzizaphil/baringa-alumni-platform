import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getPendingRegistrations } from '../api/admin.js';
import Button from '../components/Button.jsx';
import FieldValue from '../components/FieldValue.jsx';
import PageLayout from '../components/PageLayout.jsx';
import Toast from '../components/Toast.jsx';
import {
  avatarTint,
  capitalise,
  formatAssociation,
  formatDate,
  formatRelativeTime,
  initialsOf,
} from '../format/registration.js';
import useFlashMessage from '../hooks/useFlashMessage.js';

/**
 * The administrator dashboard (`ADMIN-1`), following Figma frame F17 -
 * `docs/prototype/12-BaringaAlumni - F17.1 Admin Da.html` for the populated
 * table and `13-BaringaAlumni - F17.2 Admin Da.html` for the empty state.
 *
 * Four states, all of which a real queue produces: `loading` while the request
 * is out, `error` with a retry when it fails, `empty` when nobody is waiting,
 * and the table when somebody is. They are exclusive - the screen never shows a
 * table and a spinner at once - and each is a full answer to "what is in the
 * queue?", so the administrator is never left inferring it from an empty table.
 *
 * Two departures from the prototype, both deliberate:
 *
 * - **Graduation year is its own column.** The prototype folds it under the
 *   association as "Class of 2023". The ticket calls for it as a column of its
 *   own, and a lecturer has no class year to fold, so it is columnar here and
 *   the association cell carries the association alone.
 * - **No search or filter controls.** The prototype draws both. The API offers
 *   neither - `GET /admin/registrations/pending` takes `page` and `limit` and
 *   nothing else - and a search box that quietly filters one page of results
 *   would be worse than none. They belong to whichever ticket adds the query
 *   parameters behind them.
 */

/** Columns, in the order the ticket specifies them. */
const COLUMNS = ['Name', 'Association', 'Student number', 'Graduation year', 'Submitted', ''];

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [flash, dismissFlash] = useFlashMessage();

  const [registrations, setRegistrations] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  /**
   * Loads the queue.
   *
   * Kept in a callback so the retry control, the first load and the reload
   * after a decision all go through one path - three ways of fetching the same
   * list is three places for them to drift apart.
   */
  const load = useCallback(async (signal) => {
    /*
     * Nothing is set before the first `await` on purpose. `status` already
     * starts as `loading`, so the mount path needs no synchronous update - and
     * setting state synchronously from an effect costs a wasted render pass.
     * The retry below is an event handler, where setting it up front is right.
     */
    try {
      const { registrations: rows, pagination } = await getPendingRegistrations({ signal });

      if (signal?.aborted) return;

      setRegistrations(rows);
      setTotal(pagination.total ?? rows.length);
      setStatus('ready');
    } catch (requestError) {
      if (signal?.aborted || requestError?.name === 'AbortError') return;

      setError(requestError);
      setStatus('error');
    }
  }, []);

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

  /** Re-fetches from the top: the retry control and the empty state's refresh. */
  const reload = useCallback(() => {
    setStatus('loading');
    setError(null);
    load();
  }, [load]);

  /**
   * Opens one registration for review, handing the row over in location state.
   *
   * Only a head start: the review screen still fetches, because the row may be
   * minutes old by the time it is clicked and because the screen has to work
   * when its URL is opened directly.
   */
  const review = useCallback(
    (registration) =>
      navigate(`/admin/registrations/${registration.id}`, { state: { registration } }),
    [navigate]
  );

  const isEmpty = status === 'ready' && registrations.length === 0;

  /** The count pill beside the heading. Green when the queue is clear. */
  const pill = isEmpty
    ? { classes: 'bg-success bg-opacity-10 text-success-text', pulse: false }
    : { classes: 'bg-warning bg-opacity-10 text-warning-text', pulse: true };

  return (
    <PageLayout wide>
      {flash && (
        <Toast variant={flash.variant ?? 'success'} onDismiss={dismissFlash}>
          {flash.message}
        </Toast>
      )}

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-24 font-semibold text-near-black">Pending registrations</h1>

        {status === 'ready' && (
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-14 font-semibold ${pill.classes}`}
          >
            {pill.pulse && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden="true" />
            )}
            {total} awaiting review
          </span>
        )}
      </div>

      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState error={error} onRetry={reload} />}
      {isEmpty && <EmptyState onRefresh={reload} />}

      {status === 'ready' && registrations.length > 0 && (
        <>
          {/*
            * Two renderings of one list, not two lists: the table is hidden
            * below 640px and the cards above it, so a phone gets rows it can
            * actually read instead of a table it has to pan sideways through.
            * `sm` is Tailwind's 640px breakpoint, which is the boundary the
            * ticket names.
            */}
          <RegistrationTable registrations={registrations} onReview={review} />
          <RegistrationCards registrations={registrations} onReview={review} />

          {total > registrations.length && (
            <p className="mt-4 text-14 text-secondary-text">
              Showing the {registrations.length} longest-waiting of {total} registrations.
            </p>
          )}
        </>
      )}
    </PageLayout>
  );
}

/** The card the three non-table states share, so they sit identically. */
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
        Loading pending registrations…
      </p>
    </StatePanel>
  );
}

/**
 * The request failed. Distinguished from "the queue is empty" on purpose: an
 * administrator who is shown an empty queue that is really a broken request
 * will close the tab believing the work is done.
 */
function ErrorState({ error, onRetry }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-danger bg-opacity-10">
        <i className="fa-solid fa-triangle-exclamation text-32 text-danger" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">
        The registration queue could not be loaded
      </h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        {error?.message || 'Something went wrong while loading the queue.'}
      </p>

      <Button onClick={onRetry}>Try again</Button>
    </StatePanel>
  );
}

/** F17.2, with the prototype's promise of a member directory left out. */
function EmptyState({ onRefresh }) {
  return (
    <StatePanel>
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success bg-opacity-10">
        <i className="fa-solid fa-circle-check text-32 text-success" aria-hidden="true" />
      </div>

      <h2 className="mb-2 text-20 font-semibold text-near-black">
        No registrations awaiting review
      </h2>
      <p className="mb-8 max-w-sm text-16 text-secondary-text">
        You have cleared the queue. New sign-ups appear here as soon as they register.
      </p>

      <Button onClick={onRefresh}>Refresh queue</Button>
    </StatePanel>
  );
}

/** Name cell contents, shared by the table row and the card. */
function Applicant({ registration }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-12 font-semibold ${avatarTint(registration.id)}`}
        aria-hidden="true"
      >
        {initialsOf(registration.name)}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-14 font-semibold text-near-black">
          {registration.name}
        </span>
        <span className="block truncate text-12 text-secondary-text">{registration.email}</span>
      </div>
    </div>
  );
}

/** The 640px-and-up table, per F17.1. */
function RegistrationTable({ registrations, onReview }) {
  return (
    <div className="hidden overflow-hidden overflow-x-auto rounded-card border border-border-light bg-white shadow-sm sm:block">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <caption className="sr-only">
          Registrations awaiting review, longest wait first
        </caption>
        <thead>
          <tr className="border-b border-border-light bg-bg-page">
            {COLUMNS.map((column, index) => (
              <th
                key={column || 'action'}
                scope="col"
                className={`px-6 py-4 text-12 font-semibold uppercase tracking-wider text-secondary-text ${
                  index === COLUMNS.length - 1 ? 'text-right' : ''
                }`}
              >
                {column || <span className="sr-only">Action</span>}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-border-light">
          {registrations.map((registration) => (
            <tr key={registration.id} className="transition-colors hover:bg-bg-page">
              <td className="px-6 py-4">
                <Applicant registration={registration} />
              </td>
              <td className="px-6 py-4 text-14 text-near-black">
                {formatAssociation(registration.association)}
              </td>
              <td className="px-6 py-4 text-14 text-near-black">
                <FieldValue value={registration.studentNumber} />
              </td>
              <td className="px-6 py-4 text-14 text-near-black">
                <FieldValue value={registration.graduationYear} />
              </td>
              <td className="px-6 py-4 text-14 text-secondary-text">
                {/* The relative wait is what is being judged; the date it
                    resolves to is one hover away rather than one column. */}
                <time dateTime={registration.registeredAt} title={formatDate(registration.registeredAt)}>
                  {capitalise(formatRelativeTime(registration.registeredAt))}
                </time>
              </td>
              <td className="px-6 py-4 text-right">
                <Button
                  className="h-10 px-4 text-14"
                  onClick={() => onReview(registration)}
                  // Named for a screen reader, which hears the row's cells only
                  // if it is navigating the table rather than the button list.
                  aria-label={`Review the registration from ${registration.name}`}
                >
                  Review
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same rows below 640px, stacked. */
function RegistrationCards({ registrations, onReview }) {
  return (
    <ul className="flex flex-col gap-4 sm:hidden">
      {registrations.map((registration) => (
        <li
          key={registration.id}
          className="rounded-card border border-border-light bg-white p-4 shadow-sm"
        >
          <Applicant registration={registration} />

          <dl className="mt-4 grid grid-cols-2 gap-3 text-14">
            <CardField label="Association" value={formatAssociation(registration.association)} />
            <CardField label="Student number" value={registration.studentNumber} />
            <CardField label="Graduation year" value={registration.graduationYear} />
            <CardField
              label="Submitted"
              value={capitalise(formatRelativeTime(registration.registeredAt))}
            />
          </dl>

          <Button
            fullWidth
            className="mt-4 h-11 text-14"
            onClick={() => onReview(registration)}
            aria-label={`Review the registration from ${registration.name}`}
          >
            Review
          </Button>
        </li>
      ))}
    </ul>
  );
}

function CardField({ label, value }) {
  return (
    <div>
      <dt className="text-12 font-semibold uppercase tracking-wider text-secondary-text">
        {label}
      </dt>
      <dd className="text-14 text-near-black">
        <FieldValue value={value} />
      </dd>
    </div>
  );
}
