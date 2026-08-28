import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AdminRoute from './components/AdminRoute.jsx';
import RequireAuth, { MEMBER_HOME_PATH } from './components/RequireAuth.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import NotificationsProvider from './context/NotificationsProvider.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MemberFeedPage from './pages/MemberFeedPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import PendingApprovalPage from './pages/PendingApprovalPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RegistrationReviewPage from './pages/RegistrationReviewPage.jsx';

/**
 * The route table, separate from the router so it can be mounted under a
 * different router (a MemoryRouter in tests, for instance).
 *
 * `/register` and `/login` are public. Everything else is behind `RequireAuth`,
 * including the root and every unmatched path, so that *one* component decides
 * where a visitor belongs and the answer cannot differ by which URL they
 * happened to arrive at.
 *
 * `/pending` sits behind the same guard as `/feed` rather than beside it,
 * because the guard routes between the two on account status: an account that
 * is not approved is held at `/pending`, and an approved one is moved off it.
 * Adding a member screen therefore means adding it inside this block and
 * nothing else - see `RequireAuth`.
 *
 * The administrator screens nest a second guard inside the first, in the same
 * order the server composes its middleware: `RequireAuth` answers "signed in,
 * and may this account act?", `AdminRoute` answers "is it an administrator?".
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/feed" element={<MemberFeedPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />

        {/*
         * The member's own notifications (ADMIN-3). Inside `RequireAuth` like
         * any other member screen: the API guards it with `requireAuth` alone,
         * but an account still awaiting review has nothing to read here and
         * belongs at `/pending`.
         */}
        <Route path="/notifications" element={<NotificationsPage />} />

        {/*
         * The administrator area (ADMIN-1, ADMIN-2). `AdminRoute` sends a
         * signed-in non-administrator back to the feed with an explanation
         * rather than rendering nothing, so a member who follows a stale link
         * is told why they cannot be there.
         */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/registrations/:id" element={<RegistrationReviewPage />} />
        </Route>

        {/*
         * The root and anything unrecognised. Sending these to `/login`
         * unconditionally would bounce a member who is already signed in back
         * to a sign-in form, so they go through the guard like any other
         * address: it has already turned an anonymous visitor towards `/login`
         * and an account still awaiting review towards `/pending`, which
         * leaves only an approved member to reach this element - and they
         * belong on the feed.
         *
         * A splat scores below every literal path above, so it is only
         * consulted once nothing else matches.
         */}
        <Route path="*" element={<Navigate to={MEMBER_HOME_PATH} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Inside the router, so the session can navigate on sign-out. */}
      <AuthProvider>
        {/*
         * Inside the session, so it can fetch with the token and refetch when
         * that token changes; outside the routes, so the header's unread count
         * and the notifications screen read one copy of the list.
         */}
        <NotificationsProvider>
          <AppRoutes />
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
