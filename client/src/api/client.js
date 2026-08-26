/**
 * Thin fetch wrapper around the Baringa API.
 *
 * Every endpoint answers with the envelope documented in `server/src/app.js`:
 *
 *   success (2xx):  { success: true, data }
 *   failure (4xx+): { success: false, message, errors: [{ field, message }] }
 *
 * This module is the only place that knows about that shape. Callers receive
 * the unwrapped `data` on success, or an `ApiError` carrying the HTTP status
 * and the field-level `errors` array on failure.
 */

/** Base URL every request is prefixed with. Falls back to the Vite dev proxy. */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/** Status used when the request never reached the server at all. */
export const NETWORK_ERROR_STATUS = 0;

/**
 * Error thrown for any non-2xx response, malformed envelope or network fault.
 *
 * @property {number} status HTTP status, or 0 when the request never landed.
 * @property {Array<{ field: string, message: string }>} errors Field-level
 *   details; always an array, empty when the failure was not field-specific.
 */
export class ApiError extends Error {
  constructor(message, { status = NETWORK_ERROR_STATUS, errors = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = Array.isArray(errors) ? errors : [];
  }

  /** True when the request never reached the server (offline, DNS, CORS). */
  get isNetworkError() {
    return this.status === NETWORK_ERROR_STATUS;
  }
}

/** Joins the base URL and a path without doubling or dropping the slash. */
function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/** Reads the body as JSON, tolerating empty and non-JSON responses. */
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Performs a request and unwraps the response envelope.
 *
 * @param {string} path Path relative to the API base, e.g. `/auth/register`.
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal,
 *           headers?: Record<string, string> }} [options]
 * @returns {Promise<unknown>} The `data` field of a successful envelope.
 * @throws {ApiError} On any non-2xx response or transport failure.
 */
export async function request(path, { method = 'GET', body, headers, signal } = {}) {
  let response;

  try {
    response = await fetch(buildUrl(path), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        // Only send a content type when there is actually a body to describe.
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    // An aborted request is a caller decision, not a failure to report.
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      { status: NETWORK_ERROR_STATUS }
    );
  }

  const payload = await readBody(response);

  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, {
      status: response.status,
      errors: payload?.errors,
    });
  }

  // A 2xx that is not a well-formed success envelope is still a broken contract.
  if (!payload || payload.success !== true) {
    throw new ApiError(payload?.message || 'The server returned an unexpected response.', {
      status: response.status,
      errors: payload?.errors,
    });
  }

  return payload.data;
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

export default apiClient;
