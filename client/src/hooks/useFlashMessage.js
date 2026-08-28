import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Reads a one-shot message handed over by a redirect, and forgets it.
 *
 * A screen that turns somebody away - `AdminRoute` - and a screen that finishes
 * an action elsewhere - the review panel returning to the dashboard - both need
 * the *next* screen to say what happened. Passing it in `location.state` keeps
 * that out of global state, but leaves it in the history entry, where a refresh
 * would show it a second time and Back would resurrect it later.
 *
 * So the message is copied into component state and the history entry is
 * rewritten without it. What the user sees is a message that appears once and
 * survives until they dismiss it or navigate away.
 *
 * @returns {[object|null, () => void]} The message, and a dismisser.
 */
export default function useFlashMessage() {
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = location.state?.flash ?? null;

  const [message, setMessage] = useState(incoming);
  const [handled, setHandled] = useState(incoming);

  /*
   * A message that arrives while this component is already mounted is picked up
   * here rather than in an effect. React's own guidance for state that has to
   * follow a changing input is to adjust it during render and re-render
   * immediately, which is what this does; doing it in an effect would paint the
   * screen once without the message first.
   */
  if (incoming && incoming !== handled) {
    setHandled(incoming);
    setMessage(incoming);
  }

  useEffect(() => {
    if (!incoming) return;

    // Same URL, no state: replaces the history entry the message arrived on, so
    // a refresh or a later Back does not show it again. No state is set here -
    // the copy above is already safe in this component.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [incoming, navigate, location.pathname, location.search]);

  return [message, () => setMessage(null)];
}
