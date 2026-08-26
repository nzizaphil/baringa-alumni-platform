import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

/**
 * The route table, separate from the router so it can be mounted under a
 * different router (a MemoryRouter in tests, for instance).
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Registration is the only finished screen, so it is the entry point.
          A later ticket points "/" at the member dashboard instead. */}
      <Route path="/" element={<Navigate to="/register" replace />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/register" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
