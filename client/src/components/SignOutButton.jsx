import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import AuthContext from '../context/authContext.js';
import Button from './Button.jsx';

/**
 * The header's sign-out control (AUTH-5).
 *
 * Renders only for a signed-in member, which is what gives the header its two
 * variants: the bare wordmark on the auth screens, wordmark plus "Sign out"
 * on the signed-in screens, per the pending prototype
 * (docs/prototype/05-BaringaAlumni - F06.1 Pending.html).
 *
 * The prototype draws this as a link. It is a button here because it performs
 * an action rather than going to an address - it clears the stored token
 * first - and it is styled to match.
 *
 * Reads the context directly rather than through `useAuth`, so rendering the
 * shared layout outside a provider degrades to "no control" instead of
 * throwing.
 *
 * @param {object} props
 * @param {'link'|'button'} [props.variant='link'] `link` is the header
 *   treatment. `button` is the same control drawn as a full outlined button,
 *   for a screen that offers signing out as its own action in the page body -
 *   the pending screen (F06.1) shows both, exactly as the prototype does.
 */
export default function SignOutButton({ variant = 'link' }) {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();

  if (!auth?.isAuthenticated) return null;

  const handleSignOut = () => {
    auth.logout();
    // `replace`, so Back does not return to the page they just left.
    navigate('/login', { replace: true });
  };

  if (variant === 'button') {
    return (
      <Button variant="secondary" onClick={handleSignOut} className="px-8">
        Sign out
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      // h-11 keeps the target at the 44px minimum inside the 64px header.
      className="inline-flex h-11 items-center rounded-button px-3 text-14 font-semibold text-primary-text transition-colors hover:bg-bg-page hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30"
    >
      Sign out
    </button>
  );
}
