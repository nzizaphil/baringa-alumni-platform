import { Link } from 'react-router-dom';

/**
 * Placeholder for the sign-in screen.
 *
 * Login, session handling and every authenticated screen belong to later
 * tickets; this exists only so the "Sign in" links on the registration screen
 * resolve to a real route.
 */
export default function LoginPage() {
  return (
    <main className="page">
      <section className="card card--narrow" aria-labelledby="login-heading">
        <header className="card__header">
          <p className="card__eyebrow">Baringa University Alumni Platform</p>
          <h1 id="login-heading" className="card__title">
            Sign in
          </h1>
          <p className="card__subtitle">
            Signing in is not available yet — it arrives in a later release.
          </p>
        </header>

        <p className="card__footnote">
          Need an account? <Link to="/register">Register as a member</Link>
        </p>
      </section>
    </main>
  );
}
