import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { USER_STATUS } from '../api/auth.js';
import useAuth from '../hooks/useAuth.js';
import PageLayout from './PageLayout.jsx';

/** Where an account that may not act yet is held. */
export const PENDING_PATH = '/pending';

/** Where an approved member belongs. */
export const MEMBER_HOME_PATH = '/feed';

/** Ignores a trailing slash, so `/pending/` is still the pending screen. */
function normalisePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * Route guard: decides whether the visitor may see the route behind it, and
 * where they belong instead.
 *
 * Usable either as a wrapper around one element or as a layout route around
 * several:
 *
 *   <Route element={<RequireAuth />}>
 *     <Route path="/feed" element={<FeedPage />} />
 *   </Route>
 *
 * It answers two questions in order, mirroring the account's two fields:
 *
 *   1. Signed in?  No - go to `/login`.
 *   2. Approved?   No - go to `/pending`, whatever was asked for. Yes - and
 *      `/pending` was asked for - go to the member area instead.
 *
 * The second rule runs in both directions on purpose. Sending a pending member
 * to `/pending` without also releasing an approved one from it would leave
 * anyone approved mid-session parked on a screen with no way forward.
 *
 * `status` is read from the session, which `AuthProvider` refreshes from
 * `GET /api/auth/me` on every load, so an approval granted since the member
 * last signed in is picked up on their next visit. This guard is a convenience
 * for the member, not the enforcement: `requireApproved` on the server is what
 * actually holds member-only data shut, and it re-reads the account per
 * request.
 *
 * While the stored token is still being checked against the server this
 * renders a waiting state rather than redirecting. Redirecting during that
 * window would sign a member out every time they refreshed a guarded page.
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

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
    /*
     * `replace` keeps the guarded URL out of history, so Back from the login
     * screen does not bounce off the guard again. It is still recorded in
     * location state, so a later ticket can return the member to where they
     * were aiming once they have signed in.
     */
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isApproved = user?.status === USER_STATUS.APPROVED;
  const isOnPendingScreen = normalisePath(location.pathname) === PENDING_PATH;

  /*
   * Not approved, and asking for something other than the pending screen.
   * `replace` again: the member never chose this detour, so Back should return
   * to wherever they came from rather than to the URL that just bounced.
   */
  if (!isApproved && !isOnPendingScreen) {
    return <Navigate to={PENDING_PATH} replace />;
  }

  // Approved, but still pointed at the pending screen - a bookmark, the Back
  // button, or an approval that landed during this session.
  if (isApproved && isOnPendingScreen) {
    return <Navigate to={MEMBER_HOME_PATH} replace />;
  }

  return children ?? <Outlet />;
}
