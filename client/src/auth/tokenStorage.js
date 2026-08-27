/**
 * Where the access token lives between page loads.
 *
 * Decision #43: the JWT is persisted in `localStorage` under `baringa_token`.
 * Not sessionStorage (a refresh in a new tab would sign the member out), not a
 * cookie (the API reads `Authorization`, not `Cookie`, and nothing here is
 * same-site protected), and not memory alone (a refresh would drop the
 * session). The trade-off accepted with that decision is XSS exposure: any
 * script running on this origin can read the token, so this module is the only
 * place that touches the key.
 *
 * Never log, print or otherwise emit the token value.
 */

/** The single storage key. Changing it signs every existing session out. */
export const TOKEN_STORAGE_KEY = 'baringa_token';

/**
 * `localStorage` is unavailable in a few real situations - Safari's private
 * mode historically threw on write, and any browser can have site data
 * blocked. None of them should crash the app: a session that cannot be
 * persisted degrades to one that lasts until the tab closes.
 */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @returns {string|null} The stored token, or null when there is none.
 */
export function readToken() {
  try {
    const value = storage()?.getItem(TOKEN_STORAGE_KEY);
    // A blank string is not a usable credential; treat it as absent so
    // callers only ever have to check for null.
    return value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persists the token, or clears it when given nothing usable.
 *
 * @param {string|null} token
 */
export function writeToken(token) {
  if (!token) {
    clearToken();
    return;
  }

  try {
    storage()?.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Out of quota or storage denied. The in-memory session still works.
  }
}

/** Removes the stored token. Safe to call when there is none. */
export function clearToken() {
  try {
    storage()?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing to do: if it cannot be removed it could not have been written.
  }
}
