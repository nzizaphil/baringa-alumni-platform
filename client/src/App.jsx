import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import RequireAuth, { MEMBER_HOME_PATH } from './components/RequireAuth.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MemberFeedPage from './pages/MemberFeedPage.jsx';
import PendingApprovalPage from './pages/PendingApprovalPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
