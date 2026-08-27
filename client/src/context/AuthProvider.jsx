import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchCurrentUser, login as loginRequest } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { clearToken, readToken, writeToken } from '../auth/tokenStorage.js';
import AuthContext from './authContext.js';

/**
 * Owns the session for the whole app.
 *
 * On mount it reads the token persisted under `baringa_token` (decision #43)
 * and calls `GET /api/auth/me` to confirm the server still accepts it. That
 * round trip is what stops a token revoked, expired or orphaned server-side
 * from leaving a signed-in shell on screen: a 401 clears storage and drops
 * straight back to the signed-out state.
 *
 * `isLoading` covers that check. Route guards must wait it out instead of
 * redirecting, otherwise refreshing a guarded page would bounce the member to
 * the login screen before the token has even been offered to the server.
 *
 * Never log the token or put it anywhere but `tokenStorage`.
 */
export default function AuthProvider({ children }) {
  // Read synchronously on the first render, so the very first paint already
  // knows whether a session is worth checking for.
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);

  // With no token there is nothing to verify, so that case is never "loading".
  const [isLoading, setIsLoading] = useState(() => readToken() !== null);

  /*
   * The verification below must not overwrite a newer session. Under
   * StrictMode the mount effect runs twice, and a member can sign in while a
   * slow /me is still in flight; both would otherwise resolve last and win.
   */
  const sessionRef = useRef(0);

  /** Drops the token and the account, in storage and in state. */
  const clearSession = useCallback(() => {
    sessionRef.current += 1;
    clearToken();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const storedToken = readToken();

    // Nothing to verify. `isLoading` already started false in that case, so
    // there is no state to settle here.
    if (!storedToken) return undefined;

    const controller = new AbortController();
    sessionRef.current += 1;
    const generation = sessionRef.current;

    (async () => {
      try {
        const currentUser = await fetchCurrentUser({ signal: controller.signal });

        // A newer sign-in or sign-out has happened; this answer is stale.
        if (generation !== sessionRef.current) return;

        setToken(storedToken);
        setUser(currentUser);
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        if (generation !== sessionRef.current) return;

        if (error instanceof ApiError && error.status === 401) {
          // The token is no longer honoured: forget it rather than keep a
          // session the server has already disowned.
          clearToken();
          setToken(null);
          setUser(null);
          return;
        }

        /*
         * The server could not be reached, or answered with something other
         * than a 401. That is not evidence the token is bad, so it is kept for
         * the next attempt - but the member is left signed out for now rather
         * than shown an account the server never confirmed.
         */
        setUser(null);
      } finally {
        if (generation === sessionRef.current) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  /**
   * Signs in and stores the token.
   *
   * Resolves with the account so the caller can route on `status`; rejects
   * with the `ApiError` untouched so the login screen decides what a 401 says.
   */
  const login = useCallback(async (credentials) => {
    const { token: issuedToken, user: signedInUser } = await loginRequest(credentials);

    sessionRef.current += 1;
    writeToken(issuedToken);
    setToken(issuedToken);
    setUser(signedInUser);
    setIsLoading(false);

    return signedInUser;
  }, []);

  /** Signs out. Local only: the token is a stateless JWT, so there is
   *  nothing for the server to revoke. */
  const logout = useCallback(() => {
    clearSession();
    setIsLoading(false);
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
