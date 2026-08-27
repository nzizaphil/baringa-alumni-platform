import { Navigate, Outlet, useLocation } from 'react-router-dom';

import useAuth from '../hooks/useAuth.js';
import PageLayout from './PageLayout.jsx';

/**
 * Route guard: sends an unauthenticated visitor to the sign-in screen.
 *
 * Usable either as a wrapper around one element or as a layout route around
 * several:
 *
 *   <Route element={<RequireAuth />}>
 *     <Route path="/feed" element={<FeedPage />} />
 *   </Route>
 *
 * While the stored token is still being checked against the server this
 * renders a waiting state rather than redirecting. Redirecting during that
 * window would sign a member out every time they refreshed a guarded page.
 *
 * This decides only whether someone is *signed in*. Whether a pending account
 * may go further is AUTH-7 and is deliberately not enforced here.
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
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

  return children ?? <Outlet />;
}
