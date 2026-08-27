import { apiClient } from './client.js';

/**
 * The four institutional associations an applicant can register under.
 * These values are the wire format the API expects.
 */
export const ASSOCIATION_TYPES = {
  CURRENT_STUDENT: 'current_student',
  FORMER_STUDENT: 'former_student',
  CURRENT_LECTURER: 'current_lecturer',
  FORMER_LECTURER: 'former_lecturer',
};

/**
 * Registers a new member. The account is created with `status: pending` and
 * cannot be used until an administrator approves it, so the response carries
 * no token and there is nothing to persist client-side.
 *
 * @param {{ name: string, email: string, password: string,
 *           associationType: string, studentNumber?: string,
 *           graduationYear?: number }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<object>} The created user projection returned by the API.
 * @throws {import('./client.js').ApiError} 422 with a field-level `errors`
 *   array when validation fails; 409 when the email is already registered.
 */
export function register(payload, options) {
  return apiClient.post('/auth/register', payload, options);
}

/**
 * The one message the server returns for every rejected sign-in.
 *
 * The server sends this for a wrong password and for an email it has never
 * seen, deliberately - see INVALID_CREDENTIALS_MESSAGE in
 * `server/src/controllers/auth.controller.js`. It is mirrored here only as the
 * fallback for a 401 that arrives without a body, so a transport hiccup cannot
 * turn into a more specific claim about the account than the server made.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect';

/** Account statuses. `approved` is the only one that may act on the platform. */
export const USER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/**
 * Exchanges credentials for an access token.
 *
 * The reply carries both the token and the account, so the caller never has to
 * decode the JWT to learn the member's role or status.
 *
 * Sent without an `Authorization` header: signing in must not depend on, or be
 * confused by, a stale token that is already in storage.
 *
 * @param {{ email: string, password: string }} credentials
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ token: string, user: { id: string, name: string,
 *   email: string, role: string, status: string } }>}
 * @throws {import('./client.js').ApiError} 401 when the credentials are
 *   rejected; 422 with a field-level `errors` array when they are malformed.
 */
export function login(credentials, options) {
  return apiClient.post('/auth/login', credentials, { ...options, auth: false });
}

/**
 * Confirms the stored token still resolves to an account, and returns it.
 *
 * The server reloads the account on every authenticated request, so this also
 * picks up a role or status change made since the token was issued.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ id: string, name: string, email: string, role: string,
 *   status: string }>} The caller's own profile.
 * @throws {import('./client.js').ApiError} 401 when the token is missing,
 *   expired, malformed or no longer resolves to an account.
 */
export async function fetchCurrentUser(options) {
  const data = await apiClient.get('/auth/me', options);
  return data.user;
}

export default { register, login, fetchCurrentUser };
