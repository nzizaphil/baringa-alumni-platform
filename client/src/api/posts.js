import { apiClient } from './client.js';

/**
 * Posts and the member feed (`POST-1`, `POST-2`).
 *
 * Both endpoints sit behind `requireAuth` and `requireApproved` on the server,
 * so every call here is made by an approved member; a pending one is held at
 * `/pending` by `RequireAuth` and never reaches the feed. See `docs/api.md`.
 */

/**
 * The longest a post may be, in characters, after trimming.
 *
 * Mirrors `MAX_POST_LENGTH` in `server/src/models/Post.js`. Duplicated rather
 * than fetched because the composer has to count *as the member types*, long
 * before a request is made - and a counter that cannot say what the limit is
 * until the first rejection is not a counter. The server is still the
 * authority: it validates independently, and a 422 is mapped onto the field.
 */
export const MAX_POST_LENGTH = 2000;

/**
 * How close to the limit the counter starts warning.
 *
 * Far enough out to be a warning rather than an announcement of failure: a
 * member who is 200 characters from the end can still decide what to cut.
 */
export const POST_LENGTH_WARNING_THRESHOLD = MAX_POST_LENGTH - 200;

/**
 * Publishes a post.
 *
 * The author is taken from the token on the server, so there is nothing to pass
 * but the text. Visibility is not sent: `members_only` is the only behaviour
 * this phase implements, and sending a value the server ignores would suggest
 * the choice is being honoured.
 *
 * @param {string} body The post text. Sent as typed; the server trims it.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ post: object }>} The created post, with its author.
 * @throws {import('./client.js').ApiError} 422 with a field-level `errors`
 *   array when the body is empty or too long; 403 when the account may not act.
 */
export function createPost(body, options) {
  return apiClient.post('/posts', { body }, options);
}

/**
 * Fetches a page of the feed, newest first.
 *
 * `cursor` is the opaque token from the previous response's
 * `pagination.nextCursor`. Omit it for the top of the feed; it is null on the
 * last page, so a caller pages until `hasMore` is false.
 *
 * @param {{ limit?: number, cursor?: string|null, signal?: AbortSignal }} [params]
 * @returns {Promise<{ posts: Array<{ id: string, body: string,
 *   visibility: string, createdAt: string,
 *   author: { id: string, name: string, role: string }|null }>,
 *   pagination: { limit: number, hasMore: boolean, nextCursor: string|null } }>}
 * @throws {import('./client.js').ApiError} 401 unauthenticated; 403 when the
 *   account is not approved; 400 for an unusable limit or cursor.
 */
export async function getFeed({ limit, cursor, signal } = {}) {
  const query = new URLSearchParams();

  if (limit !== undefined) query.set('limit', String(limit));
  if (cursor) query.set('cursor', cursor);

  const suffix = query.toString() ? `?${query}` : '';
  const data = await apiClient.get(`/posts${suffix}`, { signal });

  // Defended rather than trusted, as `api/admin.js` does: a feed that maps over
  // whatever arrived would blank out entirely if the shape ever drifted.
  const posts = Array.isArray(data?.posts) ? data.posts : [];

  return {
    posts,
    pagination: {
      limit: data?.pagination?.limit ?? posts.length,
      hasMore: Boolean(data?.pagination?.hasMore),
      nextCursor: data?.pagination?.nextCursor ?? null,
    },
  };
}

export default { createPost, getFeed };
