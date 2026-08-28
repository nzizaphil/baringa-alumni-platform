import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { USER_ROLE, USER_STATUS } from '../api/auth.js';
import useAuth from '../hooks/useAuth.js';
import PageLayout from './PageLayout.jsx';
import { MEMBER_HOME_PATH, PENDING_PATH } from './RequireAuth.jsx';

/**
 * What a signed-in non-administrator is told when they are turned away.
 *
 * Explaining the refusal is an explicit requirement of the ticket, not a
 * courtesy: an authorisation boundary the user cannot see is one they will
 * report as a broken link. It names the boundary ("administrators") and what
 * happened ("you have been returned to your feed") so there is nothing left to
 * guess at.
 */
const NOT_AN_ADMINISTRATOR_FLASH = {
  variant: 'error',
  title: 'That area is for administrators',
  message:
    'The registration dashboard is limited to administrator accounts, so you have been returned to your feed.',
};

/**
 * Route guard for the administrator area (`ADMIN-1`, `ADMIN-2`).
 *
 * Mirrors the server's composition on these endpoints -
 * `requireAuth`, `requireApproved`, `requireRole('administrator')` - in the
 * same order, so the client turns a caller away for the same reason and at the
 * same point the API would:
 *
 *   1. Signed in?      No  - `/login`, remembering where they were aiming.
 *   2. Approved?       No  - `/pending`, like any other account that may not act.
 *   3. Administrator?  No  - `/feed`, carrying an explanation.
 *
 * The first two duplicate `RequireAuth`, which these routes already sit behind.
 * That is deliberate: a guard that only works in one arrangement is one bad
 * merge away from opening the area to everybody, so this one fails closed on
 * its own.
 *
 * **It is a convenience, not the enforcement.** It runs in the browser on a role
 * the browser was told. `requireRole('administrator')` on the server is what
 * actually holds these endpoints shut, and it re-reads the account on every
 * request - so a demoted administrator loses the data even while a stale tab
 * still renders the screen.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // The session is still being checked against the server. Redirecting now
  // would sign an administrator out every time they refreshed the dashboard.
  if (isLoading) {
    return (
      <PageLayout>
        <p className="text-16 text-secondary-text" role="status">
          Checking your session…
        </p>
      </PageLayout>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.status !== USER_STATUS.APPROVED) {
    return <Navigate to={PENDING_PATH} replace />;
  }

  if (user?.role !== USER_ROLE.ADMINISTRATOR) {
    /*
     * Turned away on privilege. The message travels in location state and is
     * rendered by the destination, so the member arrives at a working screen
     * that says why they are there - rather than at a blank page, or at their
     * feed with no idea the navigation was refused.
     */
    return (
      <Navigate to={MEMBER_HOME_PATH} replace state={{ flash: NOT_AN_ADMINISTRATOR_FLASH }} />
    );
  }

  return children ?? <Outlet />;
}
