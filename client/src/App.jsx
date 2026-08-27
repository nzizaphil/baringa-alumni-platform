import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import RequireAuth from './components/RequireAuth.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MemberFeedPage from './pages/MemberFeedPage.jsx';
import PendingApprovalPage from './pages/PendingApprovalPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

/**
 * The route table, separate from the router so it can be mounted under a
 * different router (a MemoryRouter in tests, for instance).
 *
 * `/register` and `/login` are public. Everything behind `RequireAuth` needs a
 * session; an anonymous visitor is sent to `/login`. Whether a *pending*
 * member may go further than the pending screen is AUTH-7, and is not decided
 * here.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/feed" element={<MemberFeedPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
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
