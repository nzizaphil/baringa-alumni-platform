import { createContext } from 'react';

/**
 * The session shared by every screen.
 *
 * Held in its own module so the provider component and the `useAuth` hook can
 * each import it without importing one another, which keeps Vite's fast
 * refresh working on the provider file.
 *
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {'member'|'moderator'|'administrator'} role
 * @property {'pending'|'approved'|'rejected'} status
 *
 * @typedef {object} AuthValue
 * @property {AuthUser|null} user The signed-in account, or null.
 * @property {string|null} token The access token, or null.
 * @property {boolean} isAuthenticated True once a token and user are both held.
 * @property {boolean} isLoading True while the stored token is being checked
 *   against the server; guards must wait rather than redirect during it.
 * @property {(credentials: { email: string, password: string })
 *   => Promise<AuthUser>} login Signs in and resolves with the account, so the
 *   caller can route on its status.
 * @property {() => void} logout Clears the token and the session.
 */

/** @type {import('react').Context<AuthValue|null>} */
const AuthContext = createContext(null);

export default AuthContext;
