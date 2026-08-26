import { Link } from 'react-router-dom';

import PageLayout from '../components/PageLayout.jsx';

/**
 * Placeholder for the sign-in screen.
 *
 * Login, session handling and every authenticated screen belong to later
 * tickets; this exists only so the "Sign in" links on the registration screen
 * resolve to a real route. It borrows the shared layout and tokens so it is
 * not left unstyled, but the F05 screens are not built here.
 */
export default function LoginPage() {
  return (
    <PageLayout>
      <section
        className="w-full max-w-[450px] rounded-card border border-border-light bg-white p-8 shadow-sm md:p-10"
        aria-labelledby="login-heading"
      >
        <h1 id="login-heading" className="mb-2 text-32 font-semibold text-near-black">
          Sign in
        </h1>
        <p className="text-16 text-secondary-text">
          Signing in is not available yet — it arrives in a later release.
        </p>

        <div className="mt-8 text-center">
          <Link
            to="/register"
            className="text-14 font-semibold text-primary-text decoration-2 underline-offset-4 hover:underline"
          >
            Need an account? Register as a member
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
