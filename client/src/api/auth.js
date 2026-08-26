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

export default { register };
