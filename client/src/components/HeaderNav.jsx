import { useContext } from 'react';
import { NavLink } from 'react-router-dom';

import { USER_ROLE, USER_STATUS } from '../api/auth.js';
import AuthContext from '../context/authContext.js';
import { ADMIN_HOME_PATH, MEMBER_HOME_PATH } from '../routes.js';

/**
 * The header's navigation, beside the wordmark.
 *
 * Two prototypes draw this bar and they agree on its shape: a member sees
 * **Feed** and **Profile**
 * (`docs/prototype/06-BaringaAlumni - F07.2 Member F.html`), and an
 * administrator sees the same plus an entry into the review queue
 * (`docs/prototype/12-BaringaAlumni - F17.1 Admin Da.html`, which labels it
 * "Registrations"; it is **Dashboard** here because the screen it opens is the
 * dashboard, and the queue is only what the dashboard currently shows).
 *
 * Rendered only for an *approved* account. A pending or rejected one is held at
 * `/pending` by `RequireAuth`, so offering it links to screens it will be
 * bounced off would be an invitation to a dead end - and it keeps the pending
 * screen's header to the bare wordmark and Sign out that F06.1 draws.
 *
 * Reads the context directly rather than through `useAuth`, matching
 * `SignOutButton`, so rendering the shared header outside a provider degrades
 * to "no navigation" instead of throwing.
 */

/**
 * Every entry is purple, the same `primary-text` as Sign out, rather than the
 * prototype's grey-until-active. The prototype's own header mixes a purple
 * active item with grey inactive ones, which reads as two kinds of control
 * rather than one bar of them; one colour makes the bar legible as a set, and
 * the underline alone carries "you are here".
 */
const LINK_BASE =
  // px-2 rather than px-1: at 375px the shortest label ("Feed") is 41px wide with
  // px-1, three short of the 44px minimum touch target.
  'inline-flex h-16 shrink-0 items-center border-b-2 px-2 text-14 font-semibold text-primary-text transition-colors';

const LINK_STATE = {
  // py-5 equivalent: the underline sits on the header's own bottom border.
  active: 'border-primary',
  inactive: 'border-transparent hover:border-primary hover:border-opacity-40',
};

export default function HeaderNav() {
  const auth = useContext(AuthContext);

  if (!auth?.isAuthenticated || auth.user?.status !== USER_STATUS.APPROVED) return null;

  const isAdministrator = auth.user?.role === USER_ROLE.ADMINISTRATOR;

  const className = ({ isActive }) =>
    `${LINK_BASE} ${isActive ? LINK_STATE.active : LINK_STATE.inactive}`;

  return (
    /*
     * Visible at every width, where the prototype hides the bar below `md`.
     * The dashboard is explicitly meant to be usable on a phone, and hiding the
     * only way to reach it there would undo that; the gap tightens instead.
     */
    <nav
      aria-label="Main"
      /*
       * `min-w-0` plus `overflow-x-auto` keeps a crowded bar - an
       * administrator sees three entries, not two - inside the header instead
       * of widening the page. The bar scrolls within itself on the narrowest
       * screens; the page never does.
       */
      className="flex min-w-0 items-center gap-4 overflow-x-auto md:gap-6"
    >
      {isAdministrator && (
        <NavLink to={ADMIN_HOME_PATH} className={className}>
          Dashboard
        </NavLink>
      )}

      <NavLink to={MEMBER_HOME_PATH} className={className}>
        Feed
      </NavLink>

      {/*
       * Profile has no screen yet: it arrives with F07.2
       * (`docs/prototype/06-BaringaAlumni - F07.2 Member F.html`), which is
       * where the member's own details and their posts live. It is drawn now so
       * the bar matches the prototype, but deliberately not linked - a link to
       * `/profile` would fall through the router's splat and land the member
       * back on the feed, which looks like a bug rather than an unbuilt screen.
       * Replace this with a NavLink when that ticket lands.
       */}
      <span
        className={`${LINK_BASE} ${LINK_STATE.inactive} cursor-default opacity-50`}
        aria-disabled="true"
        title="Your profile arrives with the member profile screen"
      >
        Profile
      </span>
    </nav>
  );
}
